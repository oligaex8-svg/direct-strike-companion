using System.Text.Json;

namespace DirectStrikeCompanion;

// A bounded live-site probe with an isolated empty store. It never opens the
// desktop app, imports replays, or reads/writes the installed private library.
internal static class SiteProfileDiagnostics
{
    internal static void Run()
    {
        try { RunAsync().GetAwaiter().GetResult(); }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            Environment.ExitCode = 1;
        }
    }

    private static async Task RunAsync()
    {
        var directory = Path.GetFullPath("verification");
        Directory.CreateDirectory(directory);
        var store = new Store(Path.Combine(directory, "site-profile-probe-data", Guid.NewGuid().ToString("N")));
        var sync = new SiteSyncService(store, new RatingService());
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        sync.Queue([], ["BlackJoker", "ZEUS", "Ronin"], "EU");
        int stages = 0;
        while (stages < 30 && await sync.ProcessNextAsync(cancellation.Token))
        {
            stages++;
            Console.WriteLine($"Site profile probe: stage {stages}; queued {sync.Snapshot().Queued}");
        }
        var lookups = store.Data.SiteLookups.Values.OrderBy(lookup => lookup.PlayerId).ToArray();
        var profiles = lookups.SelectMany(lookup => lookup.Profiles).ToArray();
        var blackJoker = profiles.FirstOrDefault(profile => profile.ProfileId == "3128");
        bool success = sync.Snapshot().Queued == 0 && lookups.Length == 3
            && blackJoker?.ProfileStatsVersion == RatingService.CurrentProfileStatsVersion
            && blackJoker.EstimatedRating.HasValue && blackJoker.DiscoveredGames.HasValue
            && blackJoker.WinRate.HasValue && blackJoker.CommanderStats?.Count > 0
            && profiles.All(profile => profile.Region == "EU")
            && lookups.All(lookup => lookup.Profiles.Count(profile => !profile.DetailsPending) <= 1);
        var result = new
        {
            success, checkedAt = DateTime.UtcNow, stages,
            scope = "Live ds-rating.com data retrieved by the built EXE using an isolated empty store",
            source = "https://ds-rating.com/player/3128", lookups,
            histories = store.Data.SiteHistories.Values.ToArray(),
            error = sync.Snapshot().Error,
            privateInstalledDataAccessed = false,
        };
        var output = Path.Combine(directory, "site-profile-priority-live.json");
        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(result, Store.Json), cancellation.Token);
        Console.WriteLine(JsonSerializer.Serialize(new { success, output, stages, accounts = profiles.Length,
            blackJoker?.EstimatedRating, blackJoker?.DiscoveredGames, blackJoker?.WinRate,
            commanderStats = blackJoker?.CommanderStats?.Count }, Store.Json));
        if (!success) Environment.ExitCode = 1;
    }
}
