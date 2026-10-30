using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using Sc2DirectStrike.Parser;
using s2protocol.NET;

namespace DirectStrikeCompanion;

internal sealed record ReplayDecodeRequest(string Path, string Hash, bool MetadataOnly, int ExistingStatsVersion = 0, bool ExistingEconomyCurrent = false, bool HashOnly = false);
internal sealed record ReplayDecodeResult(Match? Match, Dictionary<string, string?>? Clans, string? Error, string? Hash = null);
internal readonly record struct ReplayWorkerResources(double CpuPercent, double RamPercent, double GpuPercent = 0);
internal sealed class ReplayWorkerResourceException(string resource, ReplayWorkerResources usage)
    : Exception($"Replay analysis deferred: system {resource} budget reached or unavailable. Decoder stopped.")
{
    internal string Resource { get; } = resource;
    internal double CpuPercent { get; } = usage.CpuPercent;
    internal double RamPercent { get; } = usage.RamPercent;
    internal double GpuPercent { get; } = usage.GpuPercent;
    internal bool GpuUnavailable => Resource == "GPU" && (!double.IsFinite(GpuPercent) || GpuPercent < 0);
}

// The pinned decoder has synchronous sections which cannot honor cancellation.
// Only the child calls it; killing this job also releases any leaked MPQ handles.
internal sealed class ReplayDecodeWorker : IAsyncDisposable
{
    internal const int MaxReplayBytes = 30 * 1024 * 1024;
    private const int MaxRequestBytes = 64 * 1024, MaxResponseBytes = 4 * 1024 * 1024;
    private static readonly JsonSerializerOptions Json = new() { MaxDepth = 64 };
    private readonly SemaphoreSlim serial = new(1, 1);
    private readonly CancellationTokenSource lifetime = new();
    private readonly TimeSpan timeout;
    private readonly Func<ReplayWorkerResources> readResources;
    private readonly ReplaySystemResources? systemResources;
    private readonly bool fixture;
    private Process? child;
    private KillOnCloseJob? job;
    private BoundedLines? responses;
    private Task? stderrDrain;
    private bool disposed;

    internal ReplayDecodeWorker(TimeSpan? timeout = null) : this(timeout, null, false) { }
    internal ReplayDecodeWorker(TimeSpan? timeout, Func<ReplayWorkerResources>? readResources, bool fixture)
    {
        this.timeout = timeout ?? TimeSpan.FromSeconds(60);
        if (this.timeout <= TimeSpan.Zero || this.timeout > TimeSpan.FromMinutes(10)) throw new ArgumentOutOfRangeException(nameof(timeout));
        if (readResources == null) systemResources = new();
        this.readResources = readResources ?? systemResources!.Read;
        this.fixture = fixture;
    }
    internal int? ProcessId => child?.Id;

    internal async Task<ReplayDecodeResult> DecodeAsync(ReplayDecodeRequest request, CancellationToken ct = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        using var heavyLease = await ReplayHeavyWork.AcquireAsync(linked.Token).ConfigureAwait(false);
        await serial.WaitAsync(linked.Token).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            linked.Token.ThrowIfCancellationRequested();
            ValidateRequest(request);
            var bytes = JsonSerializer.SerializeToUtf8Bytes(request, Json);
            if (bytes.Length > MaxRequestBytes) throw new InvalidDataException("Replay decoder request exceeds its size limit.");
            var clock = Stopwatch.StartNew();
            // Only the uncommitted request is retried. A single timeout covers
            // preflight, telemetry recovery and every attempt of this request.
            for (int attempt = 0; ; attempt++)
            {
                Task<ReplayDecodeResult>? exchange = null;
                try
                {
                    await CheckResourcesAsync(linked.Token, fresh: attempt > 0).ConfigureAwait(false);
                    linked.Token.ThrowIfCancellationRequested();
                    CheckTimeout(clock);
                    Start();
                    exchange = ExchangeAsync(bytes, linked.Token);
                    while (true)
                    {
                        linked.Token.ThrowIfCancellationRequested();
                        CheckTimeout(clock);
                        CheckResources();
                        if (exchange.IsCompleted)
                        {
                            var result = await exchange.ConfigureAwait(false);
                            if (result.Error != null) await StopAsync().ConfigureAwait(false);
                            return result;
                        }
                        var remaining = timeout - clock.Elapsed;
                        if (remaining <= TimeSpan.Zero) CheckTimeout(clock);
                        await Task.WhenAny(exchange, Task.Delay(remaining < TimeSpan.FromMilliseconds(200) ? remaining : TimeSpan.FromMilliseconds(200), linked.Token)).ConfigureAwait(false);
                    }
                }
                catch (ReplayWorkerResourceException ex) when (exchange != null && ex.GpuUnavailable && attempt < 2)
                {
                    // Never keep parsing with missing GPU telemetry. Containment
                    // is closed before waiting for a fresh observation/restart.
                    await StopAsync().ConfigureAwait(false);
                    ObserveExchange(exchange);
                    linked.Token.ThrowIfCancellationRequested();
                }
                catch
                {
                    await StopAsync().ConfigureAwait(false);
                    ObserveExchange(exchange);
                    throw;
                }
            }
        }
        catch
        {
            await StopAsync().ConfigureAwait(false);
            throw;
        }
        finally { serial.Release(); }
    }

    private void CheckResources()
    {
        CheckResources(readResources());
    }

    private void CheckTimeout(Stopwatch clock)
    {
        if (clock.Elapsed >= timeout) throw new TimeoutException($"Replay decoding exceeded {timeout.TotalSeconds:g} seconds; decoder stopped.");
    }

    private static void ObserveExchange(Task<ReplayDecodeResult>? exchange)
    {
        if (exchange != null) _ = exchange.ContinueWith(t => _ = t.Exception, CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
    }

    internal async Task CheckResourcesAsync(CancellationToken ct, bool fresh = false)
    {
        if (fresh) await RefreshResourcesAsync(ct).ConfigureAwait(false);
        else if (systemResources != null) await systemResources.PrimeAsync(ct).ConfigureAwait(false);
        for (int retry = 0; ; retry++)
        {
            ct.ThrowIfCancellationRequested();
            try { CheckResources(); ct.ThrowIfCancellationRequested(); return; }
            catch (ReplayWorkerResourceException ex)
            {
                await StopAsync().ConfigureAwait(false);
                ct.ThrowIfCancellationRequested();
                if (!ex.GpuUnavailable || retry >= 2) throw;
                await RefreshResourcesAsync(ct).ConfigureAwait(false);
            }
        }
    }

    private Task RefreshResourcesAsync(CancellationToken ct) => systemResources != null ? systemResources.RefreshAsync(ct) : Task.Delay(550, ct);

    internal static void CheckResources(ReplayWorkerResources usage)
    {
        if (!double.IsFinite(usage.RamPercent) || usage.RamPercent < 0 || usage.RamPercent >= 98) throw new ReplayWorkerResourceException("RAM", usage);
        if (!double.IsFinite(usage.CpuPercent) || usage.CpuPercent < 0 || usage.CpuPercent >= 90) throw new ReplayWorkerResourceException("CPU", usage);
        if (!double.IsFinite(usage.GpuPercent) || usage.GpuPercent < 0 || usage.GpuPercent >= 94) throw new ReplayWorkerResourceException("GPU", usage);
    }

    internal static ProcessStartInfo LaunchInfo(params string[] arguments)
    {
        var path = Environment.ProcessPath ?? throw new IOException("Cannot locate replay worker executable.");
        var start = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        if (string.Equals(System.IO.Path.GetFileNameWithoutExtension(path), "dotnet", StringComparison.OrdinalIgnoreCase))
        {
            var assembly = typeof(ReplayDecodeWorker).Assembly.Location;
            if (string.IsNullOrEmpty(assembly)) throw new IOException("Cannot locate replay worker assembly.");
            start.ArgumentList.Add(assembly);
        }
        foreach (var arg in arguments) start.ArgumentList.Add(arg);
        return start;
    }

    private void Start()
    {
        if (child != null) return;
        job = KillOnCloseJob.Create();
        try
        {
            child = Process.Start(LaunchInfo(fixture ? "--replay-worker-fixture" : "--replay-worker")) ?? throw new IOException("Replay decoder process could not start.");
            // No request is sent until containment succeeds. Fail closed if an
            // enclosing Windows job disallows assignment on this installation.
            job.Assign(child);
            child.PriorityClass = ProcessPriorityClass.BelowNormal;
            responses = new BoundedLines(child.StandardOutput.BaseStream);
            stderrDrain = DrainAsync(child.StandardError.BaseStream);
        }
        catch
        {
            job?.Dispose(); job = null;
            if (child != null)
            {
                try { if (!child.HasExited) child.Kill(true); } catch (InvalidOperationException) { } catch (Win32Exception) { }
                child.Dispose(); child = null;
            }
            throw;
        }
    }

    private async Task<ReplayDecodeResult> ExchangeAsync(byte[] request, CancellationToken ct)
    {
        var input = child!.StandardInput.BaseStream;
        await input.WriteAsync(request, ct).ConfigureAwait(false);
        await input.WriteAsync(new byte[] { (byte)'\n' }, ct).ConfigureAwait(false);
        await input.FlushAsync(ct).ConfigureAwait(false);
        var line = await responses!.ReadAsync(MaxResponseBytes, ct).ConfigureAwait(false) ?? throw new IOException("Replay decoder exited without a response.");
        try
        {
            using var document = JsonDocument.Parse(line);
            if (document.RootElement.ValueKind != JsonValueKind.Object || !document.RootElement.TryGetProperty("Match", out _) || !document.RootElement.TryGetProperty("Clans", out _) || !document.RootElement.TryGetProperty("Error", out _))
                throw new InvalidDataException("Replay decoder returned an incomplete response.");
            return JsonSerializer.Deserialize<ReplayDecodeResult>(line, Json) ?? throw new InvalidDataException("Replay decoder returned an empty response.");
        }
        catch (JsonException ex) { throw new InvalidDataException("Replay decoder returned an invalid response.", ex); }
    }

    private static async Task DrainAsync(Stream stream)
    {
        try { var buffer = new byte[4096]; while (await stream.ReadAsync(buffer).ConfigureAwait(false) != 0) { } }
        catch (IOException) { } catch (ObjectDisposedException) { }
    }

    private async Task StopAsync()
    {
        var process = child;
        child = null; responses = null;
        job?.Dispose(); job = null; // KILL_ON_JOB_CLOSE covers crashes and descendants.
        if (process != null)
        {
            try
            {
                if (!process.HasExited) process.Kill(true);
                using var wait = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await process.WaitForExitAsync(wait.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { } catch (InvalidOperationException) { } catch (Win32Exception) { }
            finally { process.Dispose(); }
        }
        if (stderrDrain != null)
        {
            await Task.WhenAny(stderrDrain, Task.Delay(200)).ConfigureAwait(false);
            stderrDrain = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel();
        await serial.WaitAsync().ConfigureAwait(false);
        try { if (!disposed) { disposed = true; await StopAsync().ConfigureAwait(false); systemResources?.Dispose(); } }
        finally { serial.Release(); }
    }

    private static void ValidateRequest(ReplayDecodeRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Path) || !System.IO.Path.IsPathFullyQualified(request.Path) || !string.Equals(System.IO.Path.GetExtension(request.Path), ".SC2Replay", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Decoder requires an absolute SC2Replay file path.");
        var file = new FileInfo(request.Path);
        // OneDrive cloud placeholders also have ReparsePoint; they are files,
        // whereas an actual symbolic link has a LinkTarget.
        if (!file.Exists || (file.Attributes & FileAttributes.Directory) != 0 || file.LinkTarget != null) throw new InvalidDataException("Replay must be an existing regular file.");
        if (file.Length > MaxReplayBytes) throw new InvalidDataException("Replay exceeds the 30 MB import limit.");
        if (request.Hash == null || (!request.HashOnly && string.IsNullOrEmpty(request.Hash)) || request.Hash.Length > 128 || request.ExistingStatsVersion < 0) throw new InvalidDataException("Invalid replay decoder request.");
    }

    internal static void Run() => RunLoopAsync(false).GetAwaiter().GetResult();
    internal static void RunFixture(string[] args)
    {
        var index = Array.IndexOf(args, "--fixture-supervisor");
        if (index >= 0)
        {
            if (index + 2 >= args.Length) throw new ArgumentException("Fixture supervisor needs its temporary replay and marker paths.");
            RunSupervisorAsync(args[index + 1], args[index + 2]).GetAwaiter().GetResult();
            return;
        }
        RunLoopAsync(true).GetAwaiter().GetResult();
    }

    private static async Task RunLoopAsync(bool fixture)
    {
        var input = new BoundedLines(Console.OpenStandardInput());
        var output = Console.OpenStandardOutput();
        var decoder = fixture ? null : new ReplayDecoder();
        while (await input.ReadAsync(MaxRequestBytes, CancellationToken.None).ConfigureAwait(false) is { } line)
        {
            ReplayDecodeResult result;
            try
            {
                var request = JsonSerializer.Deserialize<ReplayDecodeRequest>(line, Json) ?? throw new InvalidDataException("Empty replay request.");
                ValidateRequest(request);
                if (fixture)
                {
                    if (request.Hash == "hang") await Task.Delay(Timeout.Infinite).ConfigureAwait(false);
                    if (request.Hash == "slow") await Task.Delay(2000).ConfigureAwait(false);
                    if (request.Hash == "invalid") { await output.WriteAsync(Encoding.UTF8.GetBytes("invalid\n")).ConfigureAwait(false); await output.FlushAsync().ConfigureAwait(false); continue; }
                    if (request.Hash == "oversize") { await output.WriteAsync(new byte[MaxResponseBytes + 1]).ConfigureAwait(false); await output.FlushAsync().ConfigureAwait(false); continue; }
                    if (request.Hash == "eof") return;
                    if (request.Hash == "stderr") await Console.OpenStandardError().WriteAsync(new byte[256 * 1024]).ConfigureAwait(false);
                    result = new(null, new() { ["fixturePid"] = Environment.ProcessId.ToString(), ["hash"] = request.Hash }, request.Hash == "error" ? "Fixture decoder failure" : null);
                }
                else result = await DecodeInChildAsync(decoder!, request).ConfigureAwait(false);
            }
            catch (Exception ex) { result = new(null, null, ex.Message.Length > 1024 ? ex.Message[..1024] : ex.Message); }
            var response = JsonSerializer.SerializeToUtf8Bytes(result, Json);
            if (response.Length > MaxResponseBytes) response = JsonSerializer.SerializeToUtf8Bytes(new ReplayDecodeResult(null, null, "Decoded replay exceeds response limit."), Json);
            await output.WriteAsync(response).ConfigureAwait(false);
            await output.WriteAsync(new byte[] { (byte)'\n' }).ConfigureAwait(false);
            await output.FlushAsync().ConfigureAwait(false);
            if (result.Error != null) return; // Failed decode may have leaked archive handles.
        }
    }

    private static async Task<ReplayDecodeResult> DecodeInChildAsync(ReplayDecoder decoder, ReplayDecodeRequest request)
    {
        // Retain the same read handle through hashing and decoding. FileShare.Read
        // blocks replacement/writes, so parsed identity belongs to this hash.
        await using var stream = File.OpenRead(request.Path);
        var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream).ConfigureAwait(false));
        if (!string.IsNullOrEmpty(request.Hash) && !string.Equals(hash, request.Hash, StringComparison.Ordinal)) throw new InvalidDataException("Replay changed after hashing; import will retry its new file version.");
        if (request.HashOnly) return new(null, null, null, hash);
        stream.Position = 0;
        var options = request.MetadataOnly ? ReplayService.MetadataOptions() : new ReplayDecoderOptions { Details = true, Initdata = true, Metadata = true, TrackerEvents = true, GameEvents = true, MessageEvents = false, AttributeEvents = false };
        var replay = await decoder.DecodeAsync(stream, options, CancellationToken.None).ConfigureAwait(false) ?? throw new InvalidDataException("Replay could not be decoded.");
        if (request.MetadataOnly)
        {
            var ids = (replay.Details?.Players ?? []).Where(p => p.Toon != null && p.Toon.ProgramId?.Trim('\0') == "S2" && p.Toon.Region > 0 && p.Toon.Realm > 0 && p.Toon.Id > 0).Select(p => $"{p.Toon.Region}-S2-{p.Toon.Realm}-{p.Toon.Id}");
            return new(null, new(ReplayClanTags.Extract(replay, ids), StringComparer.Ordinal), null, hash);
        }
        if (replay.Details?.Title.StartsWith("Direct Strike", StringComparison.OrdinalIgnoreCase) != true) return new(null, null, null, hash);
        var parsed = Sc2DirectStrikeParser.Parse(replay);
        var combat = request.ExistingStatsVersion >= CombatStatsExtractor.CurrentVersion ? null : CombatStatsExtractor.Extract(replay, parsed);
        var economy = request.ExistingEconomyCurrent ? null : MatchEconomyExtractor.Extract(parsed);
        var clans = new Dictionary<string, string?>(ReplayClanTags.Extract(replay, parsed.Players.Select(p => $"{p.Region}-S2-{p.Realm}-{p.Id}")), StringComparer.Ordinal);
        var players = parsed.Players.Select(p =>
        {
            var id = $"{p.Region}-S2-{p.Realm}-{p.Id}";
            return new ReplayPlayer(id, p.Name, p.TeamId, p.Commander.ToString(), p.Result.ToString(), p.APM, p.Stats.LastOrDefault()?.MineralsKilledArmy ?? 0, p.Stats.LastOrDefault()?.MineralsLostArmy ?? 0, combat?.GetValueOrDefault(id), clans.GetValueOrDefault(id));
        }).ToList();
        var match = new Match(hash, request.Path, replay.Details.Title, parsed.GameMode.ToString(), DateTime.SpecifyKind(parsed.GameTime, DateTimeKind.Utc), parsed.Duration.TotalSeconds, parsed.WinnerTeam, players, Math.Max(request.ExistingStatsVersion, CombatStatsExtractor.CurrentVersion), economy, ReplayClanTags.CurrentVersion);
        return new(match, clans, null, hash);
    }

    private static async Task RunSupervisorAsync(string replay, string marker)
    {
        await using var worker = new ReplayDecodeWorker(TimeSpan.FromMinutes(10), () => new(0, 0), true);
        var pending = worker.DecodeAsync(new(replay, "hang", false));
        while (worker.ProcessId == null && !pending.IsCompleted) await Task.Delay(10).ConfigureAwait(false);
        if (worker.ProcessId is not { } pid) { await pending.ConfigureAwait(false); return; }
        File.WriteAllText(marker, pid.ToString());
        await pending.ConfigureAwait(false);
    }

    private sealed class BoundedLines(Stream stream)
    {
        private readonly byte[] buffer = new byte[4096];
        private int offset, count;
        internal async Task<byte[]?> ReadAsync(int limit, CancellationToken ct)
        {
            using var line = new MemoryStream();
            while (true)
            {
                if (offset == count)
                {
                    count = await stream.ReadAsync(buffer, ct).ConfigureAwait(false); offset = 0;
                    if (count == 0) { if (line.Length == 0) return null; throw new InvalidDataException("Replay decoder line ended before newline."); }
                }
                var end = Array.IndexOf(buffer, (byte)'\n', offset, count - offset);
                var length = (end < 0 ? count : end) - offset;
                if (line.Length + length > limit) throw new InvalidDataException("Replay decoder line exceeds its size limit.");
                line.Write(buffer, offset, length); offset += length;
                if (end >= 0) { offset++; return line.ToArray(); }
            }
        }
    }

    internal sealed class KillOnCloseJob : SafeHandleZeroOrMinusOneIsInvalid
    {
        private KillOnCloseJob() : base(true) { }
        internal static KillOnCloseJob Create()
        {
            var job = CreateJobObject(IntPtr.Zero, null);
            if (job.IsInvalid) { job.Dispose(); throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot create contained replay decoder job."); }
            var info = new ExtendedLimits { Basic = new BasicLimits { Flags = 0x2000 } };
            if (!SetInformationJobObject(job, 9, ref info, (uint)Marshal.SizeOf<ExtendedLimits>()))
            {
                var error = Marshal.GetLastWin32Error(); job.Dispose(); throw new Win32Exception(error, "Cannot contain replay decoder lifetime.");
            }
            return job;
        }
        internal void Assign(Process process)
        {
            if (!AssignProcessToJobObject(this, process.Handle)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot contain replay decoder process; import stopped.");
        }
        protected override bool ReleaseHandle() => CloseHandle(handle);
        [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling; }
        [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern KillOnCloseJob CreateJobObject(IntPtr attributes, string? name);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(KillOnCloseJob job, int infoClass, ref ExtendedLimits info, uint length);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(KillOnCloseJob job, IntPtr process);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    }
}
