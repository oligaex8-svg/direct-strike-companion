using System.Text.Json;

namespace DirectStrikeCompanion;

// Public source probe with an isolated store: no desktop, capture, import or private library.
internal static class DsstatsDiagnostics
{
    internal static async Task RunAsync()
    {
        var root = Path.GetFullPath("verification");
        Directory.CreateDirectory(root);
        var directory = Path.Combine(root, "dsstats-probe-data", Guid.NewGuid().ToString("N"));
        var store = new Store(directory);
        var checks = new List<string>();
        try
        {
            var source = new DsstatsService(store);
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            string[] names = ["TKnight", "Vanea", "BlackJoker", "aumka", "Kthulhu", "BlueMage"];
            bool Complete(string name)
            {
                lock (store.Gate)
                {
                    var lookup = store.Data.DsstatsLookups.GetValueOrDefault(SiteSyncService.NameLookupKey(name, "EU"));
                    var primary = lookup?.Profiles.OrderByDescending(profile => profile.LastPlayed)
                        .ThenByDescending(profile => profile.Games).ThenBy(profile => profile.NativeId, StringComparer.Ordinal).FirstOrDefault();
                    return primary?.Rating is > 0 && primary.Games > 0
                        && primary.Consistency is >= 0 and <= 1 && primary.Confidence is >= 0 and <= 1;
                }
            }
            async Task WaitForAsync(Func<bool> ready)
            {
                while (!ready()) await Task.Delay(100, cancellation.Token);
            }
            var running = source.RunAsync(cancellation.Token);
            var started = System.Diagnostics.Stopwatch.StartNew();
            double firstPlayerMs, completeRosterMs;
            try
            {
                source.QueueLobby(names.Take(1), "EU", ["2-S2-1-7408040"]);
                await WaitForAsync(() => Complete(names[0]));
                firstPlayerMs = started.Elapsed.TotalMilliseconds;
                source.QueueLobby(names, "EU", ["2-S2-1-7408040"]);
                await WaitForAsync(() => names.All(Complete));
                completeRosterMs = started.Elapsed.TotalMilliseconds;
            }
            finally
            {
                cancellation.Cancel();
                try { await running; } catch (OperationCanceledException) { }
            }
            var named = store.Data.DsstatsLookups.GetValueOrDefault(SiteSyncService.NameLookupKey("TKnight", "EU"));
            void Check(bool success, string name) { if (!success) throw new InvalidDataException(name); checks.Add(name); }
            Check(firstPlayerMs < completeRosterMs, "The first player loads automatically before the remaining five join");
            Check(names.All(Complete), "All six public name/region primaries include actual rating, consistency and confidence");
            Check(named?.Profiles.Any(profile => profile.NativeId == "2-S2-1-7408040") == true
                && named.Profiles.All(profile => profile.Region == "EU" && profile.Name.Equals("TKnight", StringComparison.OrdinalIgnoreCase)),
                "Live name search filters exact nickname and region without assigning a replay identity");
            File.WriteAllText(Path.Combine(root, "dsstats-live.json"), JsonSerializer.Serialize(new
            {
                success = true, checkedAt = DateTime.UtcNow, source = "https://dsstats.pax77.org", scope = "Live public API requests from the built EXE; isolated store",
                checks, names, firstPlayerMs, completeRosterMs, lookups = store.Data.DsstatsLookups, privateInstalledDataAccessed = false
            }, Store.Json));
            using var saved = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "automatic-lobby-rating-preview-data.json")));
            File.WriteAllText(Path.Combine(root, "automatic-lobby-state-preview-data.json"), JsonSerializer.Serialize(new
            {
                success = true, scope = "Live automatic dsstats rating-state requests from the built EXE; saved public DSR cache",
                checkedAt = DateTime.UtcNow, names, dsRating = saved.RootElement.GetProperty("dsRating").Clone(),
                dsstats = store.Data.DsstatsLookups, privateInstalledDataAccessed = false
            }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, "dsstats-live.json"), JsonSerializer.Serialize(new { success = false, checkedAt = DateTime.UtcNow, error = error.ToString(), checks }, Store.Json));
            Environment.ExitCode = 1;
        }
    }
}
