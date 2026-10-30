using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Runtime.ExceptionServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

// One explicitly selected replay; caller owns the shared heavy-job semaphore and persistence.
internal static class ReplayDamageCollector
{
    internal sealed record PlayerResult(string AccountId, int ScorePlayerId, uint FinalLoop, double DamageDealt, double DamageTaken);
    internal sealed record Batch(uint BaseBuild, string DataVersion, IReadOnlyList<PlayerResult> Players, string? Warning = null);
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromSeconds(60), PassTimeout = TimeSpan.FromMinutes(5), BatchTimeout = TimeSpan.FromMinutes(30);
    private static readonly Dictionary<string, string> Graphics = new(StringComparer.OrdinalIgnoreCase)
    {
        ["displaymode"] = "0", ["windowwidth"] = "800", ["windowheight"] = "450", ["frameratecap"] = "30",
        ["frameratecapglue"] = "30", ["windowstate"] = "1", ["windowx"] = "40", ["windowy"] = "40",
        ["width"] = "800", ["height"] = "450"
    };

    internal static async Task<Batch> CollectAsync(Match decoded, Action<int, int, string> progress, CancellationToken cancellationToken, ReplayDamageCheckpoint? checkpoint = null)
    {
        ArgumentNullException.ThrowIfNull(decoded);
        ArgumentNullException.ThrowIfNull(progress);
        var players = ValidatePlayers(decoded);
        await VerifyReplayAsync(decoded, cancellationToken).ConfigureAwait(false);
        using var lease = await NamedLease.AcquireAsync(cancellationToken).ConfigureAwait(false);
        EnsureNoOtherGame(null);
        ConfigBackup.RecoverPending();
        var (executable, support, installedBuild) = FindInstall();
        using var resources = new ReplaySystemResources();
        await resources.PrimeAsync(cancellationToken).ConfigureAwait(false);
        await CheckBudgetAsync(resources, cancellationToken).ConfigureAwait(false);
        // Warm WMI before launch without making it mandatory when a fresh PDH
        // sample is safe. Never reuse the warm reading in the running monitor.
        await WarmBudgetAsync(resources.Read, ReplayDamageGpu.ReadAsync, cancellationToken).ConfigureAwait(false);
        EnsureNoOtherGame(null);
        using var batchDeadline = new CancellationTokenSource(BatchTimeout);
        using var total = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, batchDeadline.Token);
        Process? process = null;
        ReplayDecodeWorker.KillOnCloseJob? job = null;
        ReplayDamageApi? api = null;
        ConfigBackup? config = null;
        Task? monitor = null;
        Exception? monitorFailure = null;
        Exception? operationFailure = null;
        Exception? sourceFailure = null;
        var cleanupFailures = new List<Exception>();
        Batch? completed = null;
        bool cancelledBeforeCleanup = false;
        List<PlayerResult>? verifiedResults = null;
        string? verifiedDataVersion = null;
        try
        {
            EnsureNoOtherGame(null);
            config = ConfigBackup.Create();
            config.Apply();
            EnsureNoOtherGame(null);
            int port = FreePort();
            job = ReplayDecodeWorker.KillOnCloseJob.Create();
            var start = CreateStartInfo(executable, support, port);
            process = Process.Start(start) ?? throw new IOException("Could not launch the task-owned StarCraft II process.");
            job.Assign(process);
            process.PriorityClass = ProcessPriorityClass.BelowNormal;
            using (var current = Process.GetCurrentProcess())
            {
                long available = current.ProcessorAffinity.ToInt64();
                long oneCore = available & -available;
                if (oneCore == 0) throw new IOException("Cannot restrict the replay process to one permitted CPU core.");
                process.ProcessorAffinity = (IntPtr)oneCore;
            }
            var owned = process;
            monitor = MonitorAsync(resources, owned, total, ex => monitorFailure = ex);
            progress(0, players.Count, "Starting replay API");
            api = await ConnectAsync(port, owned, total.Token).ConfigureAwait(false);
            await WaitForSmallWindowAsync(owned, total.Token).ConfigureAwait(false);
            var ping = await api.PingAsync(total.Token).ConfigureAwait(false);
            var info = await api.ReplayInfoAsync(decoded.Path, total.Token).ConfigureAwait(false);
            if (ping.BaseBuild != installedBuild || info.BaseBuild != installedBuild || string.IsNullOrWhiteSpace(ping.DataVersion) ||
                string.IsNullOrWhiteSpace(info.DataVersion) || !string.Equals(ping.DataVersion, info.DataVersion, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Installed SC2 build or data version does not match the replay; no data was downloaded.");
            if (!info.DurationLoops.HasValue || info.DurationLoops.Value == 0) throw new InvalidDataException("Replay API did not provide a valid duration.");
            var participants = info.Players.Where(p => p.Type == 1).ToList();
            if (participants.Count != 6 || participants.Any(p => !p.PlayerId.HasValue || p.PlayerId.Value == 0) ||
                !participants.Select(p => p.PlayerId!.Value).ToHashSet().SetEquals(players.Select(p => (uint)p.ScorePlayerId)))
                throw new InvalidDataException("Replay API participant IDs do not match the six validated tracker player IDs.");
            // Recheck immediately before trusting any cached perspectives.
            await VerifyReplayAsync(decoded, total.Token).ConfigureAwait(false);
            var context = new ReplayDamageCheckpoint.Context(decoded.Hash, installedBuild, info.DataVersion!, info.DurationLoops.Value,
                players.Select(p => new ReplayDamageCheckpoint.Identity(p.AccountId, p.ScorePlayerId)).ToList());
            var result = checkpoint?.Load(context) ?? [];
            verifiedResults = result;
            verifiedDataVersion = info.DataVersion;
            progress(result.Count, players.Count, result.Count > 0 ? "Resuming verified player measurements" : "Reading player damage");
            foreach (var player in players)
            {
                total.Token.ThrowIfCancellationRequested();
                if (result.Any(p => p.AccountId == player.AccountId && p.ScorePlayerId == player.ScorePlayerId)) continue;
                using var pass = CancellationTokenSource.CreateLinkedTokenSource(total.Token);
                pass.CancelAfter(PassTimeout);
                progress(result.Count, players.Count, "Reading player damage");
                await ApiCall(() => api.StartReplayAsync(decoded.Path, (uint)player.ScorePlayerId, pass.Token), total.Token).ConfigureAwait(false);
                while (true)
                {
                    var sample = await ApiCall(() => api.ObserveAsync(pass.Token), total.Token).ConfigureAwait(false);
                    if (sample.Loop.HasValue && sample.PlayerId == (uint)player.ScorePlayerId && sample.Status is 4 or 5)
                    {
                        int percent = (int)Math.Clamp((double)sample.Loop.Value * 100 / info.DurationLoops.Value, 0, 100);
                        progress(result.Count, players.Count, $"Measuring player {result.Count + 1} of {players.Count}: replay {percent}%");
                    }
                    if (sample.Status == 5)
                    {
                        if (sample.PlayerId != (uint)player.ScorePlayerId || !sample.Loop.HasValue || sample.Loop.Value < info.DurationLoops.Value ||
                            !sample.DamageDealt.HasValue || !sample.DamageTaken.HasValue)
                            throw new InvalidDataException("Final replay score is incomplete or belongs to a different player.");
                        var completedPlayer = new PlayerResult(player.AccountId, player.ScorePlayerId, sample.Loop.Value, sample.DamageDealt.Value, sample.DamageTaken.Value);
                        await VerifyReplayAsync(decoded, pass.Token).ConfigureAwait(false);
                        result.Add(completedPlayer);
                        if (checkpoint != null) await checkpoint.SaveAsync(context, result, pass.Token).ConfigureAwait(false);
                        progress(result.Count, players.Count, "Verified player measurement saved for retry");
                        break;
                    }
                    if (sample.Status != 4 || sample.PlayerId != (uint)player.ScorePlayerId || !sample.Loop.HasValue)
                        throw new InvalidDataException("Replay API returned an unexpected or unverified player observation.");
                    await ApiCall(() => api.StepAsync(2240, pass.Token), total.Token).ConfigureAwait(false);
                }
            }
            await VerifyReplayAsync(decoded, total.Token).ConfigureAwait(false);
            total.Token.ThrowIfCancellationRequested();
            progress(players.Count, players.Count, "Restoring game settings");
            completed = new(installedBuild, info.DataVersion!, result);
        }
        catch (OperationCanceledException ex) when (total.IsCancellationRequested) { sourceFailure = operationFailure = ex; }
        catch (Exception ex)
        {
            sourceFailure = ex;
            // Capture state before kill-on-close cleanup can change it. Any
            // inspection failure is diagnostic only and never hides the cause.
            operationFailure = process == null ? ex : new IOException(ex.Message + " Task-owned SC2 before cleanup: " + DescribeProcess(process, monitorFailure != null), ex);
        }
        finally
        {
            cancelledBeforeCleanup = cancellationToken.IsCancellationRequested || batchDeadline.IsCancellationRequested;
            try { total.Cancel(); } catch (Exception ex) { cleanupFailures.Add(ex); }
            // Close the task-owned job immediately, including on cancellation.
            try { job?.Dispose(); } catch (Exception ex) { cleanupFailures.Add(ex); }
            if (api != null) try { await api.DisposeAsync().ConfigureAwait(false); } catch (Exception ex) { cleanupFailures.Add(ex); }
            // Stop monitoring before disposing the Process object it reads.
            if (monitor != null) try { await monitor.ConfigureAwait(false); } catch (OperationCanceledException) { } catch (Exception ex) { cleanupFailures.Add(ex); }
            if (process != null)
            {
                try
                {
                    if (!process.HasExited) process.Kill(true);
                    using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                    await process.WaitForExitAsync(stop.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException ex) { cleanupFailures.Add(new TimeoutException("Task-owned StarCraft II did not exit within 10 seconds.", ex)); }
                catch (InvalidOperationException ex) { if (!HasExited(process)) cleanupFailures.Add(ex); }
                catch (System.ComponentModel.Win32Exception ex) { if (!HasExited(process)) cleanupFailures.Add(ex); }
                finally { try { process.Dispose(); } catch (Exception ex) { cleanupFailures.Add(ex); } }
            }
            // An unexpected exit may still leave an owner process running; the
            // restoration check then leaves the durable backup untouched.
            if (config != null) try { config.Restore(); } catch (Exception ex) { cleanupFailures.Add(ex); }
        }
        // A timeout or broken SC2 API connection may leave verified perspectives
        // for an entire team. Nothing is eligible until owned-process cleanup and
        // settings restoration both succeed and the replay hash is rechecked.
        if ((operationFailure != null || monitorFailure is OwnedGameExitedException) &&
            CanPublishPartial(sourceFailure, monitorFailure, cleanupFailures.Count != 0,
                cancellationToken.IsCancellationRequested || batchDeadline.IsCancellationRequested || cancelledBeforeCleanup) &&
            verifiedResults != null && verifiedDataVersion != null)
        {
            var completeTeams = CompleteTeams(decoded, verifiedResults);
            if (completeTeams.Count > 0)
            {
                await VerifyReplayAsync(decoded, cancellationToken).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                batchDeadline.Token.ThrowIfCancellationRequested();
                completed = new(installedBuild, verifiedDataVersion, completeTeams,
                    completeTeams.Count == players.Count ? null : "SC2 disconnected or timed out. Complete-team measurements were saved; retry resumes the remaining players.");
                operationFailure = null;
                monitorFailure = null;
            }
        }
        // A monitor may stop the process while an API request is failing with a
        // transport exception. Preserve both causes after the monitor has ended.
        operationFailure = CombineMonitorFailure(operationFailure, monitorFailure);
        if (operationFailure != null && cleanupFailures.Count > 0)
            throw new AggregateException("Replay damage collection and cleanup both failed; inspect all inner errors.", [operationFailure, .. cleanupFailures]);
        if (cleanupFailures.Count > 0)
            throw new AggregateException("Replay damage collection cleanup failed; inspect all inner errors.", cleanupFailures);
        if (operationFailure != null) ExceptionDispatchInfo.Capture(operationFailure).Throw();
        return completed ?? throw new InvalidOperationException("Replay damage collection ended without a complete result.");
    }

    internal sealed class ApiResponseTimeoutException(Exception inner) : TimeoutException("The SC2 replay API response timed out.", inner) { }
    internal sealed class ApiTransportFailureException(IOException inner) : IOException(inner.Message, inner) { }
    private static bool IsApiTransport(IOException error) => error.Message.StartsWith("SC2 API transport failed:", StringComparison.Ordinal) &&
        (error.InnerException is System.Net.WebSockets.WebSocketException || error.InnerException is IOException);

    private static async Task ApiCall(Func<Task> call, CancellationToken overall)
    {
        try { await call().ConfigureAwait(false); }
        catch (OperationCanceledException ex) when (!overall.IsCancellationRequested) { throw new ApiResponseTimeoutException(ex); }
        catch (IOException ex) when (IsApiTransport(ex)) { throw new ApiTransportFailureException(ex); }
    }
    private static async Task<T> ApiCall<T>(Func<Task<T>> call, CancellationToken overall)
    {
        try { return await call().ConfigureAwait(false); }
        catch (OperationCanceledException ex) when (!overall.IsCancellationRequested) { throw new ApiResponseTimeoutException(ex); }
        catch (IOException ex) when (IsApiTransport(ex)) { throw new ApiTransportFailureException(ex); }
    }
    internal static bool IsPartialEligibleFailure(Exception? error) => error is ApiResponseTimeoutException or ApiTransportFailureException;

    internal sealed class OwnedGameExitedException(int pid, int exitCode)
        : IOException($"Task-owned StarCraft II exited unexpectedly: pid={pid}, exitCode={exitCode}.")
    {
        internal int ProcessId { get; } = pid;
        internal int ExitCode { get; } = exitCode;
    }

    internal static bool CanPublishPartial(Exception? error, Exception? monitorFailure, bool cleanupFailed, bool cancelled)
    {
        if (cleanupFailed || cancelled) return false;
        if (monitorFailure == null) return IsPartialEligibleFailure(error);
        return monitorFailure is OwnedGameExitedException &&
            (error == null || error is OperationCanceledException || IsPartialEligibleFailure(error));
    }

    internal static List<PlayerResult> CompleteTeams(Match match, IReadOnlyList<PlayerResult> results)
    {
        var identities = ValidatePlayers(match).ToDictionary(p => p.AccountId, StringComparer.Ordinal);
        if (results.Count > 6 || results.Select(p => p.AccountId).Distinct(StringComparer.Ordinal).Count() != results.Count ||
            results.Any(p => p == null || !identities.TryGetValue(p.AccountId, out var identity) || identity.ScorePlayerId != p.ScorePlayerId ||
                p.FinalLoop == 0 || !double.IsFinite(p.DamageDealt) || p.DamageDealt < 0 || !double.IsFinite(p.DamageTaken) || p.DamageTaken < 0))
            throw new InvalidDataException("Verified player results do not match the replay roster.");
        var byAccount = results.ToDictionary(p => p.AccountId, StringComparer.Ordinal);
        return match.Players.GroupBy(p => p.Team).Where(team => team.Count() == 3 && team.All(p => byAccount.ContainsKey(p.Id)))
            .SelectMany(team => team.Select(p => byAccount[p.Id])).ToList();
    }

    private static string DescribeProcess(Process process, bool monitorTriggered)
    {
        try
        {
            process.Refresh();
            bool exited = process.HasExited;
            string exitCode = exited ? process.ExitCode.ToString(System.Globalization.CultureInfo.InvariantCulture) : "not-exited";
            return $"pid={process.Id}, hasExited={exited}, exitCode={exitCode}, monitorTriggered={monitorTriggered}.";
        }
        catch (Exception ex) { return $"process state unavailable ({ex.GetType().Name}), monitorTriggered={monitorTriggered}."; }
    }

    internal static Exception? CombineMonitorFailure(Exception? operation, Exception? monitor)
    {
        if (monitor == null) return operation;
        if (operation == null || operation is OperationCanceledException)
            return new IOException("Replay damage collection stopped because resource or process safety monitoring failed.", monitor);
        return new AggregateException("Replay damage transport and safety monitoring both failed.", operation, monitor);
    }

    private static bool HasExited(Process process)
    {
        try { return process.HasExited; }
        catch (InvalidOperationException) { return false; }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }

    private sealed record PlayerIdentity(string AccountId, int ScorePlayerId);
    private static List<PlayerIdentity> ValidatePlayers(Match match)
    {
        if (!Store.IsEligible(match) || match.Players.Count != 6) throw new InvalidDataException("Damage collection requires an eligible 3v3 match.");
        var players = new List<PlayerIdentity>(6);
        foreach (var player in match.Players)
        {
            if (string.IsNullOrWhiteSpace(player.Id) || player.Combat?.ScorePlayerId is not > 0)
                throw new InvalidDataException("A player is missing a validated tracker ID.");
            players.Add(new(player.Id, player.Combat.ScorePlayerId.Value));
        }
        if (players.Select(p => p.AccountId).Distinct(StringComparer.Ordinal).Count() != 6 || players.Select(p => p.ScorePlayerId).Distinct().Count() != 6)
            throw new InvalidDataException("Replay player identities are not unique.");
        return players;
    }

    private static async Task VerifyReplayAsync(Match replay, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(replay.Path) || string.IsNullOrWhiteSpace(replay.Hash)) throw new InvalidDataException("Replay path or hash is missing.");
        await using var stream = new FileStream(replay.Path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, true);
        if (stream.Length > ReplayDecodeWorker.MaxReplayBytes) throw new InvalidDataException("Replay exceeds the import size limit.");
        string hash = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct).ConfigureAwait(false));
        if (!string.Equals(hash, replay.Hash, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Replay file no longer matches the selected decoded match.");
    }

    private static (string Executable, string Support, uint BaseBuild) FindInstall()
    {
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "StarCraft II");
        string info = Path.Combine(root, "ExecuteInfo.txt");
        var text = File.ReadAllText(info).TrimEnd('\0');
        var line = text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(s => s.TrimStart().StartsWith("executable", StringComparison.OrdinalIgnoreCase));
        string? executable = line?.Split('=', 2).ElementAtOrDefault(1)?.Trim().Trim('"', '\0');
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable)) throw new FileNotFoundException("Installed StarCraft II executable was not found in ExecuteInfo.txt.");
        var versionDir = Directory.GetParent(executable);
        var match = Regex.Match(versionDir?.Name ?? "", @"^Base(\d+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (!match.Success || !uint.TryParse(match.Groups[1].Value, out uint build) || versionDir?.Parent?.Parent == null)
            throw new InvalidDataException("Installed StarCraft II base build cannot be determined.");
        string support = Path.Combine(versionDir.Parent.Parent.FullName, "Support64");
        if (!Directory.Exists(support)) throw new DirectoryNotFoundException("Installed StarCraft II Support64 directory is unavailable.");
        return (executable, support, build);
    }

    private static ProcessStartInfo CreateStartInfo(string executable, string support, int port)
    {
        var start = new ProcessStartInfo(executable) { WorkingDirectory = support, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden };
        start.Environment["PATH"] = support + Path.PathSeparator + (start.Environment["PATH"] ?? "");
        foreach (var arg in new[] { "-listen", "127.0.0.1", "-port", port.ToString(System.Globalization.CultureInfo.InvariantCulture),
            "-displayMode", "0", "-windowwidth", "800", "-windowheight", "450", "-windowx", "40", "-windowy", "40", "-frameratecap", "30", "-frameratecapGlue", "30" }) start.ArgumentList.Add(arg);
        return start;
    }

    private static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        try { listener.Start(); return ((IPEndPoint)listener.LocalEndpoint).Port; }
        finally { listener.Stop(); }
    }
    private static void EnsureNoOtherGame(int? ownedPid)
    {
        foreach (var name in new[] { "SC2", "SC2_x64" })
            foreach (var process in Process.GetProcessesByName(name))
                using (process)
                {
                    if (process.Id == ownedPid) continue;
                    bool exited;
                    try { exited = process.HasExited; }
                    catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
                    {
                        throw new IOException("Cannot verify whether a StarCraft II process has exited; replay damage collection is deferred.", ex);
                    }
                    if (!exited) throw new IOException($"A StarCraft II process (PID {process.Id}) is still running; replay damage collection is deferred.");
                }
    }
    private static void CheckBudget(ReplayWorkerResources usage)
    {
        try { ReplayDecodeWorker.CheckResources(usage); }
        catch (ReplayWorkerResourceException ex)
        {
            string cpu = usage.CpuPercent.ToString("G17", System.Globalization.CultureInfo.InvariantCulture);
            string gpu = usage.GpuPercent.ToString("G17", System.Globalization.CultureInfo.InvariantCulture);
            string ram = usage.RamPercent.ToString("G17", System.Globalization.CultureInfo.InvariantCulture);
            throw new IOException($"Replay resource guard failed for {ex.Resource}: CPU={cpu}%, GPU={gpu}%, RAM={ram}% (limits: CPU <90%, GPU <94%, RAM <98%; non-finite readings are unavailable).", ex);
        }
    }
    private static Task CheckBudgetAsync(ReplaySystemResources resources, CancellationToken token) =>
        CheckBudgetAsync(resources.Read, ReplayDamageGpu.ReadAsync, token);

    internal static async Task CheckBudgetAsync(Func<ReplayWorkerResources> read, Func<CancellationToken, Task<double>> fallback, CancellationToken token)
    {
        var usage = read();
        // Never spend time querying a fallback if CPU or RAM is already unsafe
        // or unavailable. A valid PDH GPU reading is authoritative.
        if (!double.IsFinite(usage.CpuPercent) || usage.CpuPercent < 0 || usage.CpuPercent >= 90 ||
            !double.IsFinite(usage.RamPercent) || usage.RamPercent < 0 || usage.RamPercent >= 98 ||
            double.IsFinite(usage.GpuPercent) && usage.GpuPercent >= 0)
        {
            CheckBudget(usage);
            return;
        }
        double gpu;
        try { gpu = await fallback(token).ConfigureAwait(false); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new IOException($"GPU telemetry unavailable: PDH={usage.GpuPercent:G17}%, CPU={usage.CpuPercent:G17}%, RAM={usage.RamPercent:G17}%; WMI fallback failed: {ex.Message}", ex);
        }
        CheckBudget(usage with { GpuPercent = gpu });
        // CPU/RAM may have changed during the query; also never override a
        // newly valid PDH reading, particularly one at or above its limit.
        var latest = read();
        if (!double.IsFinite(latest.GpuPercent) || latest.GpuPercent < 0) latest = latest with { GpuPercent = gpu };
        CheckBudget(latest);
    }

    internal static async Task WarmBudgetAsync(Func<ReplayWorkerResources> read, Func<CancellationToken, Task<double>> warm, CancellationToken token)
    {
        double gpu;
        try { gpu = await warm(token).ConfigureAwait(false); }
        catch (IOException ex)
        {
            token.ThrowIfCancellationRequested();
            var latest = read();
            // A fallback failure is optional only if all fresh PDH readings are
            // available and safe. CheckBudget preserves actual cap failures.
            if (!double.IsFinite(latest.GpuPercent) || latest.GpuPercent < 0)
            {
                if (!double.IsFinite(latest.CpuPercent) || latest.CpuPercent < 0 || latest.CpuPercent >= 90 ||
                    !double.IsFinite(latest.RamPercent) || latest.RamPercent < 0 || latest.RamPercent >= 98) CheckBudget(latest);
                throw new IOException("WMI warm-up failed and PDH GPU telemetry is unavailable.", ex);
            }
            CheckBudget(latest);
            return;
        }
        token.ThrowIfCancellationRequested();
        var after = read();
        if (double.IsFinite(after.GpuPercent) && after.GpuPercent >= 0) CheckBudget(after);
        // A successfully measured high WMI reading must not be bypassed even
        // when PDH is safe. Invalid WMI results fail closed as well.
        CheckBudget(after with { GpuPercent = gpu });
    }

    private static async Task MonitorAsync(ReplaySystemResources resources, Process process, CancellationTokenSource stop, Action<Exception> failed)
    {
        try
        {
            while (true)
            {
                await Task.Delay(1000, stop.Token).ConfigureAwait(false);
                await CheckBudgetAsync(resources, stop.Token).ConfigureAwait(false);
                if (process.HasExited) throw new OwnedGameExitedException(process.Id, process.ExitCode);
                EnsureNoOtherGame(process.Id);
            }
        }
        // Cleanup cancels this token before killing the owned job. An exit
        // observed in that race is not an unexpected crash; resource failures
        // still reach the generic catch and must never become publishable.
        catch (OwnedGameExitedException) when (stop.IsCancellationRequested) { }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        catch (Exception ex)
        {
            failed(ex);
            try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } catch (System.ComponentModel.Win32Exception) { }
            stop.Cancel();
        }
    }
    private static async Task<ReplayDamageApi> ConnectAsync(int port, Process process, CancellationToken token)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < StartupTimeout)
        {
            token.ThrowIfCancellationRequested();
            if (process.HasExited) throw new IOException("StarCraft II exited before the replay API became available.");
            try { return await ReplayDamageApi.ConnectAsync(new Uri($"ws://127.0.0.1:{port}/sc2api"), token).ConfigureAwait(false); }
            catch (System.Net.WebSockets.WebSocketException) { await Task.Delay(500, token).ConfigureAwait(false); }
        }
        throw new TimeoutException("StarCraft II replay API did not start within one minute.");
    }

    private static async Task WaitForSmallWindowAsync(Process process, CancellationToken token)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < StartupTimeout)
        {
            token.ThrowIfCancellationRequested();
            bool valid = false;
            EnumWindows((window, _) =>
            {
                GetWindowThreadProcessId(window, out uint pid);
                if (pid != (uint)process.Id || !GetClientRect(window, out var rect)) return true;
                long style = GetWindowLongPtr(window, -16).ToInt64();
                int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
                if (width > 100 && width <= 1100 && height > 100 && height <= 800 && (style & 0x00c00000) == 0x00c00000 && (style & 0x01000000) == 0) valid = true;
                return true;
            }, IntPtr.Zero);
            if (valid) return;
            await Task.Delay(200, token).ConfigureAwait(false);
        }
        throw new IOException("StarCraft II did not open in a verified small, non-maximized window.");
    }
    private delegate bool EnumWindowProc(IntPtr window, IntPtr context);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr context);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);

    // Windows mutex ownership is thread-affine, so its dedicated background
    // thread keeps ownership across asynchronous calls and releases on Dispose.
    private sealed class NamedLease : IDisposable
    {
        private readonly ManualResetEventSlim release = new(false);
        private readonly Thread thread;
        private readonly TaskCompletionSource<bool> acquired = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private NamedLease()
        {
            thread = new Thread(() =>
            {
                Mutex? mutex = null;
                bool owns = false;
                try
                {
                    mutex = new Mutex(false, @"Local\DirectStrikeCompanion.ReplayDamageCollector");
                    try { owns = mutex.WaitOne(0); } catch (AbandonedMutexException) { owns = true; }
                    if (!owns) { acquired.TrySetException(new IOException("Another replay damage collector is active.")); return; }
                    acquired.TrySetResult(true);
                    release.Wait();
                }
                catch (Exception ex) { acquired.TrySetException(ex); }
                finally { if (owns) mutex!.ReleaseMutex(); mutex?.Dispose(); }
            }) { IsBackground = true, Name = "Replay damage mutex" };
            thread.Start();
        }
        internal static async Task<NamedLease> AcquireAsync(CancellationToken ct)
        {
            var lease = new NamedLease();
            try { await lease.acquired.Task.WaitAsync(ct).ConfigureAwait(false); return lease; }
            catch { lease.Dispose(); throw; }
        }
        public void Dispose() { release.Set(); thread.Join(); release.Dispose(); }
    }

    private sealed class ConfigBackup
    {
        private readonly string path, directory;
        private readonly byte[] original;
        private readonly string originalHash;
        private bool changed;
        private ConfigBackup(string path, string directory, byte[] original)
        { this.path = path; this.directory = directory; this.original = original; originalHash = Hash(original); }
        private static string RecoveryRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DirectStrikeCompanion", "ReplayDamageRecovery");
        private static string VariablesPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "StarCraft II", "Variables.txt");
        internal static void RecoverPending()
        {
            if (!Directory.Exists(RecoveryRoot)) return;
            var pending = Directory.GetDirectories(RecoveryRoot);
            if (pending.Length > 1) throw new IOException($"Multiple configuration recovery backups exist at {RecoveryRoot}; automatic collection is deferred.");
            foreach (string directory in pending)
            {
                string metadata = Path.Combine(directory, "recovery.json"), payload = Path.Combine(directory, "Variables.original.bin");
                if (!File.Exists(metadata) || !File.Exists(payload))
                    throw new IOException($"Incomplete replay damage recovery backup at {directory}; automatic collection is deferred.");
                using var doc = JsonDocument.Parse(File.ReadAllBytes(metadata));
                string? savedPath = doc.RootElement.GetProperty("originalPath").GetString(), savedHash = doc.RootElement.GetProperty("sha256").GetString();
                if (!string.Equals(Path.GetFullPath(savedPath ?? ""), Path.GetFullPath(VariablesPath), StringComparison.OrdinalIgnoreCase))
                    throw new IOException($"Unexpected configuration recovery path in {directory}.");
                byte[] bytes = File.ReadAllBytes(payload);
                if (!string.Equals(Hash(bytes), savedHash, StringComparison.Ordinal)) throw new IOException($"Configuration recovery backup hash is invalid at {directory}.");
                var backup = new ConfigBackup(VariablesPath, directory, bytes) { changed = true };
                backup.Restore();
            }
        }
        internal static ConfigBackup Create()
        {
            string path = VariablesPath;
            string directory = Path.Combine(RecoveryRoot, Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            try
            {
                using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                if (source.Length > 1024 * 1024) throw new InvalidDataException("StarCraft II Variables.txt exceeds the safety limit.");
                var original = new byte[checked((int)source.Length)]; source.ReadExactly(original);
                var backup = new ConfigBackup(path, directory, original);
                string backupPath = Path.Combine(directory, "Variables.original.bin");
                WriteDurable(backupPath, original);
                if (Hash(File.ReadAllBytes(backupPath)) != backup.originalHash) throw new IOException("Durable configuration backup verification failed.");
                WriteDurable(Path.Combine(directory, "recovery.json"), JsonSerializer.SerializeToUtf8Bytes(new { originalPath = path, sha256 = backup.originalHash }));
                return backup;
            }
            catch
            {
                File.Delete(Path.Combine(directory, "Variables.original.bin"));
                File.Delete(Path.Combine(directory, "recovery.json"));
                Directory.Delete(directory);
                throw;
            }
        }
        internal void Apply()
        {
            EnsureNoOtherGame(null);
            using var source = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
            if (source.Length > 1024 * 1024) throw new IOException("Configuration grew unexpectedly.");
            byte[] current = new byte[checked((int)source.Length)]; source.ReadExactly(current);
            if (Hash(current) != originalHash) throw new IOException("Configuration changed before applying temporary settings.");
            EnsureNoOtherGame(null);
            byte[] patched = Patch(original);
            changed = true; // From here even a partial write must be recovered.
            try
            {
                source.Position = 0; source.SetLength(0); source.Write(patched); source.Flush(true);
            }
            catch
            {
                // The exclusive handle is still held, so this rollback cannot
                // overwrite a concurrent writer. Preserve the backup if it fails.
                try
                {
                    source.Position = 0; source.SetLength(0); source.Write(original); source.Flush(true);
                    changed = false;
                }
                catch { }
                throw;
            }
        }
        internal void Restore()
        {
            try
            {
                if (!changed) { RemoveBackup(); return; }
                EnsureNoOtherGame(null);
                using var target = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
                if (target.Length > 1024 * 1024) throw new IOException("Configuration grew unexpectedly.");
                byte[] current = new byte[checked((int)target.Length)]; target.ReadExactly(current);
                if (!NonGraphics(current).SequenceEqual(NonGraphics(original), StringComparer.Ordinal)) throw new IOException("Non-graphics configuration changed concurrently.");
                if (!ExpectedGraphics(current, original)) throw new IOException("Graphics configuration changed to an unexpected value.");
                EnsureNoOtherGame(null);
                target.Position = 0; target.SetLength(0); target.Write(original); target.Flush(true);
                target.Position = 0; byte[] restored = new byte[original.Length]; target.ReadExactly(restored);
                if (Hash(restored) != originalHash) throw new IOException("Restored configuration hash does not match the original.");
            }
            catch (Exception ex) { throw new IOException($"StarCraft II configuration was not restored ({ex.Message}); original backup is preserved at {directory}.", ex); }
            RemoveBackup();
        }
        private void RemoveBackup()
        {
            File.Delete(Path.Combine(directory, "Variables.original.bin"));
            File.Delete(Path.Combine(directory, "recovery.json"));
            Directory.Delete(directory);
        }
        private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));
        private static void WriteDurable(string path, byte[] bytes)
        {
            using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            output.Write(bytes); output.Flush(true);
        }
        private static string Decode(byte[] bytes) => new UTF8Encoding(false, true).GetString(bytes).TrimStart('\ufeff');
        private static string[] NonGraphics(byte[] bytes)
        {
            var lines = Regex.Split(Decode(bytes), @"\r\n|\n|\r").ToList();
            if (lines.Count > 0 && lines[^1].Length == 0) lines.RemoveAt(lines.Count - 1);
            return lines.Where(line => !string.IsNullOrWhiteSpace(line) && !Graphics.ContainsKey(line.Split('=', 2)[0].Trim())).ToArray();
        }
        // The game can retain the original settings, write our temporary values,
        // or enforce its observed 1024x720 minimum. Anything else may be an
        // owner's concurrent edit and must not be overwritten.
        private static bool ExpectedGraphics(byte[] current, byte[] original)
        {
            static Dictionary<string, List<string>> Values(byte[] bytes)
            {
                var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                foreach (string line in Regex.Split(Decode(bytes), @"\r\n|\n|\r"))
                {
                    var parts = line.Split('=', 2);
                    string key = parts[0].Trim();
                    if (!Graphics.ContainsKey(key)) continue;
                    if (!result.TryGetValue(key, out var values)) result[key] = values = new();
                    values.Add(parts.Length == 2 ? parts[1].Trim() : "<missing-value>");
                }
                return result;
            }
            var before = Values(original);
            var after = Values(current);
            foreach (var (key, patched) in Graphics)
            {
                var prior = before.GetValueOrDefault(key) ?? [];
                var now = after.GetValueOrDefault(key) ?? [];
                if (now.SequenceEqual(prior, StringComparer.Ordinal)) continue;
                if (now.Count == 0 && prior.Count == 0) continue;
                if (now.Count != 1) return false;
                string value = now[0];
                if (value == patched || prior.Contains(value, StringComparer.Ordinal)) continue;
                bool minimum = (key.Equals("windowwidth", StringComparison.OrdinalIgnoreCase) || key.Equals("width", StringComparison.OrdinalIgnoreCase)) && value == "1024" ||
                               (key.Equals("windowheight", StringComparison.OrdinalIgnoreCase) || key.Equals("height", StringComparison.OrdinalIgnoreCase)) && value == "720";
                if (!minimum) return false;
            }
            return true;
        }
        private static byte[] Patch(byte[] bytes)
        {
            string text = Decode(bytes);
            string newline = text.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
            var lines = Regex.Split(text, @"\r\n|\n|\r").ToList();
            if (lines.Count > 0 && lines[^1].Length == 0) lines.RemoveAt(lines.Count - 1);
            lines.RemoveAll(line => Graphics.ContainsKey(line.Split('=', 2)[0].Trim()));
            lines.AddRange(Graphics.Select(pair => pair.Key + "=" + pair.Value));
            return Encoding.UTF8.GetBytes(string.Join(newline, lines) + newline);
        }
    }
}
