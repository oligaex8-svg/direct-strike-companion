using System.Diagnostics;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class LiveLobbyRatingDiagnostics
{
    internal static async Task RunAsync()
    {
        var root = Path.GetFullPath("verification");
        var directory = Path.Combine(root, "lobby-rating-probe-data", Guid.NewGuid().ToString("N"));
        var store = new Store(directory);
        var site = new SiteSyncService(store, new RatingService());
        var dsstats = new DsstatsService(store);
        var live = new LiveLobbyRatings(store, site, dsstats);
        string[] names = ["TKnight", "Vanea", "BlackJoker", "aumka", "Kthulhu", "BlueMage"];
        var clock = Stopwatch.StartNew();
        var records = new Dictionary<string, object>();
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        bool ready = false;
        void Changed()
        {
            var observations = new List<(string Key, object Value)>();
            lock (store.Gate)
                foreach (var name in names)
                {
                    var key = SiteSyncService.NameLookupKey(name, "EU");
                    if (store.Data.SiteLookups.TryGetValue(key, out var dsr)
                        && (dsr.Profiles.Count > 0 || !dsr.Status.Contains("pending", StringComparison.Ordinal)))
                        observations.Add(("DSR:" + name, new { name, source = "ds-rating.com", milliseconds = clock.Elapsed.TotalMilliseconds, dsr.Status,
                            accounts = dsr.Profiles.Count, numericRatings = dsr.Profiles.Count(profile => profile.Rating.HasValue || profile.EstimatedRating.HasValue || profile.SearchRating.HasValue) }));
                    if (store.Data.DsstatsLookups.TryGetValue(key, out var stats) && stats.Status is not ("Loading" or "Pending"))
                        observations.Add(("dsstats:" + name, new { name, source = "dsstats", milliseconds = clock.Elapsed.TotalMilliseconds, stats.Status,
                            accounts = stats.Profiles.Count, numericRatings = stats.Profiles.Count(profile => profile.Rating.HasValue) }));
                }
            lock (records)
            {
                foreach (var observation in observations) records.TryAdd(observation.Key, observation.Value);
                if (records.Count == 12) { ready = true; completed.TrySetResult(); }
            }
        }
        store.Changed += Changed;
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        var sourceTask = dsstats.RunAsync(cancellation.Token);
        var liveTask = live.RunAsync(cancellation.Token);
        Exception? failure = null;
        try
        {
            // Same server callback as the running app; no browser, capture, game input or private data.
            var lobby = new LobbyService(store, (_, _, _) => { }, rosterChanged: live.Observe);
            lobby.ApplyScreenObservation("", true, DateTime.UtcNow, names, [1, 1, 1, 2, 2, 2], "EU");
            await completed.Task.WaitAsync(cancellation.Token);
            if (!ready || !store.Data.SiteLookups.Values.Any(lookup => lookup.Profiles.Count > 0)
                || !store.Data.DsstatsLookups.Values.Any(lookup => lookup.Profiles.Count > 0))
                throw new InvalidDataException("The six-player public-source probe did not receive usable ratings from both sites.");
        }
        catch (Exception error) { failure = error; Environment.ExitCode = 1; }
        finally
        {
            cancellation.Cancel();
            try { await Task.WhenAll(sourceTask, liveTask); }
            catch (Exception error) { failure ??= error; Environment.ExitCode = 1; }
            store.Changed -= Changed;
            File.WriteAllText(Path.Combine(root, "lobby-ratings-live.json"), JsonSerializer.Serialize(new
            {
                success = failure == null, checkedAt = DateTime.UtcNow,
                scope = "Six-player server roster event and live public discovery; excludes screenshot recognition, mode hydration and real lobby join timing",
                privateInstalledDataAccessed = false, names, timings = records.Values.ToList(),
                dsRating = store.Data.SiteLookups, dsstats = store.Data.DsstatsLookups,
                publications = live.Snapshot().Publications, error = failure?.ToString()
            }, Store.Json));
        }
    }
}
