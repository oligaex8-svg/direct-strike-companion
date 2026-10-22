using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class ReplayRecoveryTests
{
    internal static void Run(Action<bool, string> assert) => RunAsync(assert).GetAwaiter().GetResult();
    private static Match Game(int i, string path) => new($"fixture-{i}", path, "Direct Strike", "Commanders", DateTime.UnixEpoch.AddMinutes(i), 600, 1,
        Enumerable.Range(1, 6).Select(slot => new ReplayPlayer($"2-S2-1-{slot}", $"Player {slot}", slot <= 3 ? 1 : 2, "Dehaka", slot <= 3 ? "Win" : "Loss", 50, i, 0, ClanTag: "Fixture")).ToList(),
        CombatStatsExtractor.CurrentVersion, new(MatchEconomyExtractor.CurrentVersion, false, "Fixture", [], null, []), ReplayClanTags.CurrentVersion);

    private static async Task RunAsync(Action<bool, string> assert)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output", "recovery-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var journalStore = new Store(Path.Combine(root, "journal"));
        journalStore.Data.Settings.AutoDetectSelf = false;
        journalStore.Data.Settings.Language = "ru";
        journalStore.SetMark("2-S2-1-2", "Friend", "Keep private", list: "friends");
        journalStore.Save();
        for (int i = 0; i < 27; i++) journalStore.CommitReplay(new($"replay-{i}", i + 1, Game(i, $"replay-{i}")));
        var restored = new Store(journalStore.DirectoryPath);
        assert(restored.Data.Matches.Count == 27 && restored.Data.Files.Count == 27, "all 27 completed replay records recover before a full-library checkpoint or finally block");
        assert(restored.Data.Settings.Language == "ru" && restored.Data.Marks["2-S2-1-2"].Note == "Keep private", "incremental replay recovery retains saved settings and private player marks");
        journalStore.CommitReplay(new("replay-0", 1, Game(0, "replay-0")));
        journalStore.CommitReplay(new("failed", 99, Error: "failed.SC2Replay: timeout", FailureSignature: "failed-version"));
        File.AppendAllText(Path.Combine(journalStore.DirectoryPath, "replay-completions.jsonl"), "{\"Path\":\"partial-Ж", new UTF8Encoding(false));
        restored = new Store(journalStore.DirectoryPath);
        assert(restored.Data.Matches.Count == 27 && restored.Data.CombatFailures["failed"] == "failed-version" && !restored.Data.Files.ContainsKey("partial-Ж"), "duplicate completions and failed-file markers recover while an interrupted final append is retried");
        restored.CommitReplay(new("after-tail", 100, Game(28, "after-tail")));
        assert(new Store(restored.DirectoryPath).Data.Matches.Count == 28, "repairing a partial final append allows later durable completions to recover");
        bool writeFailed = false;
        try { restored.CommitReplay(new("write-failed", 101, Game(35, "write-failed")), (stream, bytes) => { stream.Write(bytes.AsSpan(0, bytes.Length / 2)); throw new IOException("Fixture disk-full during append"); }); }
        catch (IOException) { writeFailed = true; }
        restored.CommitReplay(new("after-write-failure", 102));
        assert(writeFailed && new Store(restored.DirectoryPath).Data.Matches.Count == 28 && !restored.Data.Files.ContainsKey("write-failed"), "partial append failure rolls back before Resume and cannot poison the recovery journal");
        var preservedJournal = File.ReadAllText(Path.Combine(restored.DirectoryPath, "replay-completions.jsonl"));
        restored.Save();
        File.WriteAllText(Path.Combine(restored.DirectoryPath, "replay-completions.jsonl"), preservedJournal);
        assert(new Store(restored.DirectoryPath).Data.Matches.Count == 28, "kill between atomic library replacement and journal compaction replays idempotently");
        restored.Save();
        assert(new FileInfo(Path.Combine(restored.DirectoryPath, "replay-completions.jsonl")).Length == 0, "successful library checkpoint compacts completed replay records");
        var original = restored.Snapshot();
        restored.CommitReplay(new("next", 101, Game(29, "next")));
        var throttled = restored.Snapshot(original.Version, TimeSpan.FromMinutes(1));
        assert(throttled.Library == null && throttled.Version == original.Version && original.Library!.Value.GetProperty("matches").GetArrayLength() == 28, "busy polling reuses its frozen snapshot during incremental imports");
        var immediate = restored.Snapshot(original.Version);
        assert(immediate.Library!.Value.GetProperty("matches").GetArrayLength() == 29 && immediate.Version != original.Version, "leaving busy mode immediately publishes all newly completed replays");

        var backupStore = new Store(Path.Combine(root, "backup"));
        backupStore.Data.Settings.Language = "ru"; backupStore.Save(); backupStore.Save();
        File.WriteAllText(Path.Combine(backupStore.DirectoryPath, "library.json"), "{bad");
        var backup = new Store(backupStore.DirectoryPath); backup.Save();
        assert(backup.Data.Settings.Language == "ru" && JsonSerializer.Deserialize<Database>(File.ReadAllText(Path.Combine(backup.DirectoryPath, "library.json.bak")), Store.Json)!.Settings.Language == "ru", "invalid primary library recovers from its valid backup without overwriting that backup");

        var scanStore = new Store(Path.Combine(root, "scan"));
        var folder = Path.Combine(root, "replays"); Directory.CreateDirectory(folder);
        scanStore.Data.Settings.AutoDetectSelf = false;
        scanStore.Data.Settings.ReplayFolders = [folder]; scanStore.Save();
        for (int i = 0; i < 30; i++) { var file = Path.Combine(folder, $"{i:D2}.SC2Replay"); File.WriteAllText(file, i.ToString()); File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddMinutes(-i - 1)); }
        var blocked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var decodedFiles = new List<string>(); bool block = true;
        async Task<ReplayDecodeResult> Decode(ReplayDecodeRequest request, CancellationToken token)
        {
            var i = int.Parse(Path.GetFileNameWithoutExtension(request.Path));
            if (request.HashOnly) return new(null, null, null, $"fixture-{i}");
            if (i == 27 && block) { blocked.TrySetResult(); await Task.Delay(Timeout.Infinite, token); }
            decodedFiles.Add(request.Path);
            return new(Game(i, request.Path), null, null, $"fixture-{i}");
        }
        var service = new ReplayService(scanStore, Decode, () => new(0, 0));
        var importing = service.ImportAsync(false);
        await blocked.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var midScan = new Store(scanStore.DirectoryPath);
        assert(midScan.Data.Matches.Count == 27 && service.Busy && service.Snapshot().Completed == 27, "in-progress scan exposes actual progress and durably recovers its completed tail");
        service.Pause(); await importing.WaitAsync(TimeSpan.FromSeconds(5));
        assert(!service.Busy && service.Snapshot().Paused && service.Snapshot().Phase == "Paused", "Pause cancels a blocked replay and clears Busy without discarding completed games");
        var restarted = new ReplayService(new Store(scanStore.DirectoryPath), Decode, () => new(0, 0));
        await restarted.ImportAsync(false, automatic: true);
        assert(restarted.Snapshot().Paused && decodedFiles.Count == 27, "manual Pause survives restart and automatic scans leave it paused");
        block = false;
        await restarted.ImportAsync(false);
        assert(new Store(scanStore.DirectoryPath).Data.Matches.Count == 30 && decodedFiles.Count == 30 && restarted.Snapshot().Total == 3, "explicit Resume decodes only three remaining files and keeps completed games deduplicated");
        await restarted.ImportAsync(true);
        assert(decodedFiles.Count == 30 && restarted.Snapshot().Total == 0, "Retry failed replays does not decode every already completed replay");
        restarted.Pause();
        assert(!restarted.Busy && restarted.Snapshot().Phase == "Paused" && restarted.Snapshot().Paused, "Pause arriving just after completion still pauses future scans and displays Paused");

        // A parser timeout is a file failure, not an indefinitely busy scan.
        var failureDir = Path.Combine(root, "failure-replays"); Directory.CreateDirectory(failureDir);
        foreach (var name in new[] { "00", "01" }) { var file = Path.Combine(failureDir, name + ".SC2Replay"); File.WriteAllText(file, name); File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddMinutes(-2)); }
        var failureStore = new Store(Path.Combine(root, "failures")); failureStore.Data.Settings.AutoDetectSelf = false; failureStore.Data.Settings.ReplayFolders = [failureDir]; failureStore.Save();
        bool timeout = true; int attempts = 0;
        Task<ReplayDecodeResult> FailDecode(ReplayDecodeRequest request, CancellationToken token)
        {
            var i = int.Parse(Path.GetFileNameWithoutExtension(request.Path));
            if (request.HashOnly) return Task.FromResult(new ReplayDecodeResult(null, null, null, $"fixture-{i}"));
            attempts++;
            if (i == 0 && timeout) throw new TimeoutException("Fixture stalled parser");
            return Task.FromResult(new ReplayDecodeResult(Game(i, request.Path), null, null));
        }
        var failures = new ReplayService(failureStore, FailDecode, () => new(0, 0));
        await failures.ImportAsync(false); await failures.ImportAsync(false);
        assert(!failures.Busy && attempts == 2 && failureStore.Data.Matches.Count == 1 && failureStore.Data.CombatFailures.Count == 1, "timed-out replay is persisted as retryable and the next replay imports without an automatic retry loop");
        timeout = false; await failures.ImportAsync(true);
        assert(attempts == 3 && failureStore.Data.Matches.Count == 2 && failureStore.Data.CombatFailures.Count == 0, "Retry targets the failed replay and clears its failure marker after success");
        await ResourceDeferralAsync(root, assert);
        await ForcedCloseAsync(Path.Combine(root, "RecoveryFixture"), assert);
    }

    private static async Task ResourceDeferralAsync(string root, Action<bool, string> assert)
    {
        var folder = Path.Combine(root, "resource-replays"); Directory.CreateDirectory(folder);
        for (int i = 0; i < 2; i++)
        {
            var path = Path.Combine(folder, i + ".SC2Replay");
            File.WriteAllText(path, i.ToString()); File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddMinutes(-i - 2));
        }
        Store NewStore(string name)
        {
            var value = new Store(Path.Combine(root, name)); value.Data.Settings.AutoDetectSelf = false;
            value.Data.Settings.ReplayFolders = [folder]; value.Save(); return value;
        }
        int attempts = 0;
        Task<ReplayDecodeResult> Decode(ReplayDecodeRequest request, CancellationToken token)
        {
            int i = int.Parse(Path.GetFileNameWithoutExtension(request.Path));
            if (request.HashOnly) return Task.FromResult(new ReplayDecodeResult(null, null, null, $"fixture-{i}"));
            attempts++;
            return Task.FromResult(new ReplayDecodeResult(Game(i, request.Path), null, null));
        }
        var store = NewStore("resource-deferred");
        bool high = true;
        ReplayWorkerResources Budget() => high ? new(0, 0, 94) : new(0, 0, 0);
        var service = new ReplayService(store, Decode, Budget);
        await service.ImportAsync(false, automatic: true);
        assert(service.Snapshot() is { Phase: "Deferred", Busy: false, Paused: false, Failed: 0 } && attempts == 0 && store.Data.CombatFailures.Count == 0,
            "resource preflight defers automatic analysis without starting a decoder or marking the replay failed");
        assert(service.Snapshot().ResourceDeferral == new ReplayResourceDeferral("GPU", 0, 0, 94),
            "resource deferral records the measured threshold resource and finite utilization values");
        var restarted = new ReplayService(new Store(store.DirectoryPath), Decode, Budget);
        assert(restarted.Snapshot().Phase == "Deferred" && !restarted.Snapshot().Paused,
            "resource-only deferral stays automatic-eligible after restart");
        high = false;
        await restarted.ImportAsync(false, automatic: true);
        assert(restarted.Snapshot() is { Phase: "Completed", Busy: false, Paused: false } && attempts == 2 && new Store(store.DirectoryPath).Data.Matches.Count == 2,
            "the next automatic scan imports deferred replays when resource headroom returns");

        var partial = NewStore("resource-partial");
        bool interrupt = true;
        Task<ReplayDecodeResult> InterruptedDecode(ReplayDecodeRequest request, CancellationToken token)
        {
            if (!request.HashOnly && request.Path.EndsWith("1.SC2Replay", StringComparison.Ordinal) && interrupt)
                throw new ReplayWorkerResourceException("GPU", new(0, 0, 95));
            return Decode(request, token);
        }
        var interrupted = new ReplayService(partial, InterruptedDecode, () => new(0, 0));
        await interrupted.ImportAsync(false, automatic: true);
        assert(interrupted.Snapshot() is { Phase: "Deferred", Completed: 1, Paused: false, Failed: 0 } && new Store(partial.DirectoryPath).Data.Matches.Count == 1 && partial.Data.CombatFailures.Count == 0,
            "a budget interruption preserves completed replay checkpoints and leaves the interrupted file retryable");
        interrupt = false;
        await interrupted.ImportAsync(false, automatic: true);
        assert(interrupted.Snapshot().Total == 1 && partial.Data.Matches.Count == 2,
            "automatic resume processes only the remaining resource-interrupted replay");

        var raceStore = NewStore("resource-manual-race");
        ReplayService? race = null;
        race = new ReplayService(raceStore, Decode, () => { race!.Pause(); return new(0, 0, 94); });
        await race.ImportAsync(false, automatic: true);
        assert(race.Snapshot() is { Phase: "Paused", Paused: true, Busy: false },
            "a concurrent manual Pause wins over the resource-deferral publication");
        int previousAttempts = attempts;
        var manuallyPaused = new ReplayService(new Store(raceStore.DirectoryPath), Decode, () => new(0, 0));
        await manuallyPaused.ImportAsync(false, automatic: true);
        assert(manuallyPaused.Snapshot() is { Phase: "Paused", Paused: true } && attempts == previousAttempts,
            "manual Pause during resource pressure remains durable after restart");

        File.WriteAllText(Path.Combine(store.DirectoryPath, "import-state.json"), JsonSerializer.Serialize(new ReplayImportProgress("Paused", false, true, 2, 0, 0, 0, 0, null, DateTime.UtcNow, DateTime.UtcNow,
            "Analysis paused: system CPU reached its limit. Completed replays are saved; press Resume when resources are available."), Store.Json));
        var legacy = new ReplayService(new Store(store.DirectoryPath), Decode, () => new(0, 0));
        assert(legacy.Snapshot() is { Phase: "Deferred", Paused: false }, "legacy resource-only pauses normalize to automatic-eligible deferrals");

        var transientStore = NewStore("resource-transient-telemetry");
        int readings = 0;
        var transient = new ReplayService(transientStore, Decode, () => ++readings <= 2 ? new(0, 0, double.NaN) : new(0, 0));
        await transient.ImportAsync(false, automatic: true);
        assert(transient.Snapshot() is { Phase: "Completed", Paused: false, ResourceDeferral: null } && transientStore.Data.Matches.Count == 2,
            "transient missing GPU observations recover within the same automatic scan before decoding");
        var unknownStore = NewStore("resource-unknown-telemetry");
        readings = 0;
        var unknown = new ReplayService(unknownStore, Decode, () => { readings++; return new(40, 50, double.NaN); });
        await unknown.ImportAsync(false, automatic: true);
        assert(readings == 3 && unknown.Snapshot() is { Phase: "Deferred", ResourceDeferral: { Resource: "GPU", CpuPercent: 40, RamPercent: 50, GpuPercent: null } },
            "persistent unknown GPU telemetry defers after bounded readings and sanitizes unavailable telemetry to null");
        var reloadedUnknown = new ReplayService(new Store(unknownStore.DirectoryPath), Decode, () => new(0, 0));
        assert(reloadedUnknown.Snapshot().ResourceDeferral == unknown.Snapshot().ResourceDeferral,
            "structured deferral telemetry persists across restart without serializing NaN");
        unknown.Pause();
        assert(unknown.Snapshot() is { Phase: "Paused", Paused: true, ResourceDeferral: null },
            "an explicit pause clears the resource cause and remains a manual pause");
    }

    private static async Task ForcedCloseAsync(string directory, Action<bool, string> assert)
    {
        using var fixture = Process.Start(ReplayDecodeWorker.LaunchInfo("--import-recovery-fixture", directory)) ?? throw new IOException("Could not start recovery fixture.");
        try
        {
            var ready = Path.Combine(directory, "ready.txt");
            var elapsed = Stopwatch.StartNew();
            while (!File.Exists(ready) && !fixture.HasExited && elapsed.Elapsed < TimeSpan.FromSeconds(10)) await Task.Delay(50);
            assert(File.Exists(ready), "isolated recovery fixture durably completed 27 replays before forced termination");
            fixture.Kill(); await fixture.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            var restored = new Store(directory); var service = new ReplayService(restored);
            assert(restored.Data.Matches.Count == 27 && restored.Data.Files.Count == 27 && !service.Busy && service.Snapshot().Phase == "Interrupted", "Task Manager-equivalent parent kill restores all completed games and resets stale analysing status");
        }
        finally { if (!fixture.HasExited) { fixture.Kill(true); await fixture.WaitForExitAsync(); } }
    }

    internal static void RunFixture(string[] args)
    {
        var index = Array.IndexOf(args, "--import-recovery-fixture");
        var directory = Path.GetFullPath(args[index + 1]);
        var testRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "test-output")) + Path.DirectorySeparatorChar;
        if (!directory.StartsWith(testRoot, StringComparison.OrdinalIgnoreCase) || Path.GetFileName(directory) != "RecoveryFixture") throw new InvalidOperationException("Recovery fixture requires its dedicated test-output directory.");
        var store = new Store(directory); store.Data.Settings.AutoDetectSelf = false; store.Save();
        for (int i = 0; i < 27; i++) store.CommitReplay(new($"fixture-{i}", i + 1, Game(i, $"fixture-{i}")));
        File.WriteAllText(Path.Combine(directory, "import-state.json"), JsonSerializer.Serialize(new ReplayImportProgress("Decoding replay", true, false, 30, 27, 27, 0, 0, "hung.SC2Replay", DateTime.UtcNow, DateTime.UtcNow), Store.Json));
        File.WriteAllText(Path.Combine(directory, "ready.txt"), "ready");
        new ManualResetEvent(false).WaitOne();
    }

    internal static void RunProbe(string[] args)
    {
        var path = args[Array.IndexOf(args, "--probe-worker") + 1];
        var output = ProbeAsync(path).GetAwaiter().GetResult();
        var directory = Path.Combine(AppContext.BaseDirectory, "test-output"); Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "worker-replay-probe.json"), JsonSerializer.Serialize(output, Store.Json));
    }
    private static async Task<object> ProbeAsync(string path)
    {
        await using var worker = new ReplayDecodeWorker();
        var elapsed = Stopwatch.StartNew();
        var hash = await worker.DecodeAsync(new(path, "", false, HashOnly: true));
        var replay = await worker.DecodeAsync(new(path, hash.Hash!, false));
        if (replay.Error != null || replay.Match == null) throw new InvalidDataException(replay.Error ?? "No Direct Strike match decoded.");
        var metadata = await worker.DecodeAsync(new(path, hash.Hash!, true));
        if (metadata.Error != null) throw new InvalidDataException(metadata.Error);
        return new { success = true, elapsedSeconds = elapsed.Elapsed.TotalSeconds, hash.Hash, match = replay.Match, clans = metadata.Clans };
    }
}
