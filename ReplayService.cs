using System.Text.Json;
using s2protocol.NET;

namespace DirectStrikeCompanion;

public sealed record ReplayImportProgress(string Phase, bool Busy, bool Paused, int Total, int Completed, int Added, int Updated, int Failed, string? CurrentFile, DateTime? StartedAt, DateTime UpdatedAt, string? Message = null, ReplayResourceDeferral? ResourceDeferral = null);
public sealed record ReplayResourceDeferral(string Resource, double? CpuPercent, double? RamPercent, double? GpuPercent);

public sealed class ReplayService
{
    private readonly Store store;
    private readonly Func<ReplayDecodeRequest, CancellationToken, Task<ReplayDecodeResult>>? testDecode;
    private readonly Func<ReplayWorkerResources>? testResources;
    private readonly SemaphoreSlim serial = new(1, 1);
    private readonly object progressGate = new();
    private CancellationTokenSource? activeScan;
    private bool pauseRequested;
    private ReplayImportProgress progress;
    private const string ResourceDeferredMessage = "Waiting for system resources; replay analysis resumes automatically.";
    private string ProgressPath => Path.Combine(store.DirectoryPath, "import-state.json");
    public ReplayService(Store store) : this(store, null) { }
    internal ReplayService(Store store, Func<ReplayDecodeRequest, CancellationToken, Task<ReplayDecodeResult>>? testDecode, Func<ReplayWorkerResources>? testResources = null)
    {
        this.store = store;
        this.testDecode = testDecode;
        this.testResources = testResources;
        progress = new("Ready", false, false, 0, 0, 0, 0, 0, null, null, DateTime.UtcNow, store.RecoveryNotice);
        try
        {
            if (File.Exists(ProgressPath) && JsonSerializer.Deserialize<ReplayImportProgress>(File.ReadAllText(ProgressPath), Store.Json) is { } saved)
            {
                // Older releases persisted resource pressure as a manual pause.
                // Only their exact resource message identifies that legacy state;
                // an explicit Pause replaces it and must remain durable.
                bool legacyResourcePause = saved.Paused && saved.Phase == "Paused" && saved.Message?.StartsWith("Analysis paused: system ", StringComparison.Ordinal) == true;
                progress = legacyResourcePause
                    ? saved with { Busy = false, Paused = false, Phase = "Deferred", CurrentFile = null, Message = ResourceDeferredMessage }
                    : saved with { Busy = false, Phase = saved.Paused ? "Paused" : saved.Busy ? "Interrupted" : saved.Phase, CurrentFile = null,
                        Message = saved.Paused ? "Analysis paused; completed replays are saved. Press Resume to continue." : saved.Busy ? "Previous analysis interrupted; completed replays restored. Remaining files resume on the next scan." : saved.Message };
            }
        }
        catch (Exception ex) when (ex is JsonException or IOException) { progress = progress with { Message = "Saved progress unavailable; your saved replay library is intact." }; }
        pauseRequested = progress.Paused;
    }
    public ReplayImportProgress Snapshot() { lock (progressGate) return progress; }
    public bool Busy => Snapshot().Busy;
    public string Status
    {
        get
        {
            var p = Snapshot();
            if (p.Message != null && !p.Busy) return p.Message;
            return p.Busy ? $"{p.Phase} · {p.Completed}/{p.Total} · {p.Added} added · {p.Updated} updated · {p.Failed} failed" : $"Up to date · {p.Added} added · {p.Updated} updated · {p.Failed} failed";
        }
    }
    private void Publish(ReplayImportProgress next)
    {
        lock (progressGate)
        {
            // A publication prepared before Pause must not undo it. Only an
            // explicit scan start clears this latch while holding the same lock.
            pauseRequested |= next.Paused;
            if (pauseRequested && !next.Busy && next.Phase != "Paused") next = next with { Phase = "Paused", Message = "Analysis paused; completed replays are saved. Press Resume to continue." };
            if (pauseRequested) next = next with { ResourceDeferral = null };
            progress = next with { Paused = pauseRequested, UpdatedAt = DateTime.UtcNow };
            var temp = ProgressPath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(progress, Store.Json));
            File.Move(temp, ProgressPath, true);
        }
    }
    public void Pause()
    {
        lock (progressGate)
        {
            Publish(progress with { Paused = true, Message = "Analysis paused; completed replays are saved. Press Resume to continue.", ResourceDeferral = null });
            activeScan?.Cancel();
        }
    }
    public async Task WaitForIdleAsync() { await serial.WaitAsync(); serial.Release(); }
    internal static bool NeedsEnrichment(Match match) => match.StatsVersion < CombatStatsExtractor.CurrentVersion || (match.Economy?.Version ?? 0) < MatchEconomyExtractor.CurrentVersion;
    internal static bool NeedsClanMetadata(Match match) => match.ClanVersion < ReplayClanTags.CurrentVersion;
    internal static ReplayDecoderOptions MetadataOptions() => new() { Details = true, Initdata = true, Metadata = false, TrackerEvents = false, GameEvents = false, MessageEvents = false, AttributeEvents = false };
    internal static Match EnrichClanMetadata(Match existing, Sc2Replay replay) => EnrichClanMetadata(existing, ReplayClanTags.Extract(replay, existing.Players.Select(p => p.Id)));
    internal static Match EnrichClanMetadata(Match existing, IReadOnlyDictionary<string, string?> clans) => existing with { Players = existing.Players.Select(p => p with { ClanTag = clans.GetValueOrDefault(p.Id) ?? p.ClanTag }).ToList(), ClanVersion = Math.Max(existing.ClanVersion, ReplayClanTags.CurrentVersion) };
    internal static List<string> Sc2Roots() => new[] { Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive", "Documents") }.Select(root => Path.GetFullPath(Path.Combine(root, "StarCraft II"))).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    public static Settings Discover()
    {
        var settings = new Settings();
        var groups = OwnAccounts.Scan(Sc2Roots(), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Battle.net", "Account"), []);
        var profiles = groups.Where(g => g.CanAutoLink).SelectMany(g => g.Profiles).ToList();
        settings.SelfIds.AddRange(profiles.Select(p => p.Id));
        settings.ReplayFolders.AddRange(profiles.Where(p => p.ReplayFolder != null).Select(p => p.ReplayFolder!));
        settings.ReplayFolders = settings.ReplayFolders.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        settings.SelfIds = settings.SelfIds.Distinct().ToList();
        return settings;
    }
    private sealed record PendingReplay(FileInfo File, string Signature);
    public async Task ImportAsync(bool retry, int limit = int.MaxValue, CancellationToken ct = default, bool automatic = false)
    {
        if (automatic && Snapshot().Paused) return;
        if (!await serial.WaitAsync(0, ct)) return;
        using var scan = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var token = scan.Token;
        bool changed = false;
        try
        {
            lock (progressGate)
            {
                if (automatic && progress.Paused) return;
                activeScan = scan;
                pauseRequested = false;
                Publish(new("Scanning folders", true, false, 0, 0, 0, 0, 0, null, DateTime.UtcNow, DateTime.UtcNow));
            }
            changed = store.RefreshOwnAccounts();
            List<string> folders;
            Dictionary<string, long> completedFiles;
            Dictionary<string, string> failures;
            Dictionary<string, Match> matchesByHash;
            HashSet<string> upgradePaths;
            HashSet<string> failedNames;
            lock (store.Gate)
            {
                folders = [.. store.Data.Settings.ReplayFolders];
                completedFiles = new(store.Data.Files, StringComparer.OrdinalIgnoreCase);
                failures = new(store.Data.CombatFailures, StringComparer.OrdinalIgnoreCase);
                matchesByHash = store.Data.Matches.DistinctBy(m => m.Hash).ToDictionary(m => m.Hash);
                upgradePaths = store.Data.Matches.Where(m => Store.IsEligible(m) && (NeedsEnrichment(m) || NeedsClanMetadata(m))).Select(m => m.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
                // Legacy versions recorded failures only as an error + timestamp.
                failedNames = store.Data.Errors.Select(e => e.Split(": ", 2)[0]).ToHashSet(StringComparer.OrdinalIgnoreCase);
            }
            var files = new List<FileInfo>();
            foreach (var folder in folders)
            {
                token.ThrowIfCancellationRequested();
                if (!Directory.Exists(folder)) continue;
                foreach (var path in Directory.EnumerateFiles(folder, "*.SC2Replay", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true }))
                {
                    token.ThrowIfCancellationRequested();
                    files.Add(new(path));
                }
            }
            var candidates = files.DistinctBy(f => f.FullName, StringComparer.OrdinalIgnoreCase).OrderByDescending(f => f.LastWriteTimeUtc).Select(f => new PendingReplay(f, $"combat:{CombatStatsExtractor.CurrentVersion}:economy:{MatchEconomyExtractor.CurrentVersion}:clan:{ReplayClanTags.CurrentVersion}:{f.LastWriteTimeUtc.Ticks}"))
                .Where(p => DateTime.UtcNow - p.File.LastWriteTimeUtc >= TimeSpan.FromSeconds(8)
                    && (retry || failures.GetValueOrDefault(p.File.FullName) != p.Signature)
                    && (completedFiles.GetValueOrDefault(p.File.FullName) != p.File.LastWriteTimeUtc.Ticks || upgradePaths.Contains(p.File.FullName) || (retry && (failures.ContainsKey(p.File.FullName) || failedNames.Contains(p.File.Name)))))
                .Take(limit).ToList();
            Publish(Snapshot() with { Phase = "Reading files", Total = candidates.Count });
            await using var worker = new ReplayDecodeWorker(null, testResources, false);
            Task<ReplayDecodeResult> Decode(ReplayDecodeRequest request) => testDecode == null ? worker.DecodeAsync(request, token) : testDecode(request, token);
            foreach (var pending in candidates)
            {
                token.ThrowIfCancellationRequested();
                var file = pending.File;
                await worker.CheckResourcesAsync(token);
                Publish(Snapshot() with { Phase = "Reading file", CurrentFile = file.Name });
                ReplayFileCompletion completion;
                try
                {
                    var hashed = await Decode(new(file.FullName, "", false, HashOnly: true));
                    if (hashed.Error != null) throw new InvalidDataException(hashed.Error);
                    var hash = hashed.Hash ?? throw new InvalidDataException("Replay worker returned no file hash.");
                    matchesByHash.TryGetValue(hash, out var existing);
                    Match? match = null;
                    if (existing == null || NeedsEnrichment(existing) || NeedsClanMetadata(existing))
                    {
                        Publish(Snapshot() with { Phase = "Decoding replay" });
                        bool metadataOnly = existing != null && !NeedsEnrichment(existing);
                        var decoded = await Decode(new(file.FullName, hash, metadataOnly, existing?.StatsVersion ?? 0, existing?.Economy?.Version >= MatchEconomyExtractor.CurrentVersion));
                        if (decoded.Error != null) throw new InvalidDataException(decoded.Error);
                        match = metadataOnly ? EnrichClanMetadata(existing!, decoded.Clans ?? throw new InvalidDataException("Replay worker returned no clan metadata.")) : decoded.Match;
                    }
                    completion = new(file.FullName, file.LastWriteTimeUtc.Ticks, match);
                }
                catch (OperationCanceledException) { throw; }
                catch (ReplayWorkerResourceException) { throw; }
                catch (Exception ex)
                {
                    completion = new(file.FullName, file.LastWriteTimeUtc.Ticks, Error: $"{file.Name}: {ex.Message}", FailureSignature: pending.Signature);
                }
                token.ThrowIfCancellationRequested();
                // Commit failures as well: a bad file must not stall every restart.
                // Persistence failures escape the loop rather than silently losing work.
                var result = store.CommitReplay(completion);
                changed = true;
                if (completion.Match != null) matchesByHash[completion.Match.Hash] = completion.Match;
                var p = Snapshot();
                Publish(p with { Completed = p.Completed + 1, Added = p.Added + (result == ReplayImportResult.Added ? 1 : 0), Updated = p.Updated + (result == ReplayImportResult.Refreshed ? 1 : 0), Failed = p.Failed + (completion.Error == null ? 0 : 1), CurrentFile = null });
                await Task.Delay(40, token);
            }
            if (changed) { Publish(Snapshot() with { Phase = "Saving library", CurrentFile = null }); store.Save(); }
            Publish(Snapshot() with { Phase = "Completed", Busy = false, CurrentFile = null, Message = candidates.Count == 0 ? "Up to date · saved replays do not need to be analysed again." : null });
        }
        catch (ReplayWorkerResourceException ex)
        {
            // Resource pressure is transient. Publish keeps a concurrent manual
            // Pause latched, while a resource-only deferral remains autoeligible.
            Publish(Snapshot() with { Phase = "Deferred", Busy = false, Paused = false, CurrentFile = null, Message = ResourceDeferredMessage,
                ResourceDeferral = new(ex.Resource, Finite(ex.CpuPercent), Finite(ex.RamPercent), Finite(ex.GpuPercent)) });
        }
        catch (OperationCanceledException)
        {
            var paused = Snapshot().Paused;
            Publish(Snapshot() with { Phase = paused ? "Paused" : "Interrupted", Busy = false, CurrentFile = null, Message = paused ? "Analysis paused; completed replays are saved. Press Resume to continue." : "Analysis stopped; completed replays are saved. Remaining files resume on the next scan." });
        }
        catch (Exception ex)
        {
            Publish(Snapshot() with { Phase = "Error", Busy = false, CurrentFile = null, Message = "Analysis stopped: " + ex.Message + ". Completed replay records remain saved." });
        }
        finally
        {
            lock (progressGate) { activeScan = null; progress = progress with { Busy = false }; }
            serial.Release();
        }
    }
    private static double? Finite(double value) => double.IsFinite(value) ? value : null;
}
public static class ResourceGuard
{
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct FileTime { public uint Low, High; public ulong Ticks => ((ulong)High << 32) | Low; }
    [System.Runtime.InteropServices.DllImport("kernel32.dll")] private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
    private static (ulong Idle, ulong Total)? lastCpu;
    public static double CpuPercent()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return 0;
        var current = (Idle: idle.Ticks, Total: kernel.Ticks + user.Ticks);
        var previous = lastCpu; lastCpu = current;
        if (previous == null || current.Total <= previous.Value.Total) return 0;
        return 100.0 * (1.0 - (double)(current.Idle - previous.Value.Idle) / (current.Total - previous.Value.Total));
    }
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct Memory { public uint Length, Load; public ulong TotalPhysical, AvailablePhysical, TotalPage, AvailablePage, TotalVirtual, AvailableVirtual, Extended; }
    [System.Runtime.InteropServices.DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref Memory memory);
    public static uint RamPercent() { var memory = new Memory { Length = (uint)System.Runtime.InteropServices.Marshal.SizeOf<Memory>() }; return GlobalMemoryStatusEx(ref memory) ? memory.Load : 100; }
}
