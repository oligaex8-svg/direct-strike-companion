using System.Text.Json;
using Sc2DirectStrike.Parser;

namespace DirectStrikeCompanion;

internal static class MatchEconomyTests
{
    internal static void Run(Action<bool, string> assert)
    {
        DirectStrikePlayer Player(int id, int team, double duration = 100, params double[] gas) => new()
        {
            Id = id, Region = 2, Realm = 1, TeamId = team, Duration = TimeSpan.FromSeconds(duration),
            RefineryTimes = gas.Select(TimeSpan.FromSeconds).ToArray()
        };
        DirectStrikeReplay Replay(int firstTeam, double duration, double[] changes, params DirectStrikePlayer[] players) => new()
        {
            FirstMiddleControlTeam = firstTeam, Duration = TimeSpan.FromSeconds(duration),
            MiddleChanges = changes.Select(TimeSpan.FromSeconds).ToArray(), Players = new(players)
        };
        var replay = Replay(1, 100, [10, 40, 70], Player(1, 1), Player(2, 2, 50), Player(3, 1, 5), Player(4, 1, 0), Player(5, 3));
        var economy = MatchEconomyExtractor.Extract(replay);
        assert(economy.MiddleAvailable && economy.MiddleIntervals.SequenceEqual(new[] { new MiddleInterval(1, 10, 40), new MiddleInterval(2, 40, 70), new MiddleInterval(1, 70, 100) }), "middle captures produce nonoverlapping intervals with initial neutral time");
        assert(economy.Players[0].MiddleHeldSeconds == 60 && economy.Players[0].EstimatedMiddleMinerals == 60 && economy.MiddleIncomeRate == 1 && economy.Status.Contains("estimate"), "middle income uses explicitly labelled one-mineral-per-second estimate");
        assert(economy.Players[1].ActiveSeconds == 50 && economy.Players[1].MiddleHeldSeconds == 10 && economy.Players[1].EstimatedMiddleMinerals == 10, "leaver income ends at known player duration");
        assert(economy.Players[2].MiddleHeldSeconds == 0 && economy.Players[2].EstimatedMiddleMinerals == 0, "known player leaving before first capture has measured zero control");
        assert(economy.Players[3].ActiveSeconds == null && economy.Players[3].MiddleHeldSeconds == null && economy.Players[4].MiddleHeldSeconds == null, "unknown active duration and unsupported team routing remain unavailable");
        var clipped = MatchEconomyExtractor.Extract(Replay(2, 100, [70, 10, 40, 150, -5], Player(1, 2, 200)));
        assert(clipped.Players[0].ActiveSeconds == 100 && clipped.Players[0].MiddleHeldSeconds == 60 && clipped.MiddleIntervals.All(i => i.EndSeconds > i.StartSeconds && i.StartSeconds >= 0 && i.EndSeconds <= 100), "unsorted and out-of-range captures stay bounded and active duration clips to replay");
        var tied = MatchEconomyExtractor.Extract(Replay(1, 100, [10, 40, 40], Player(1, 1), Player(2, 2)));
        assert(tied.Players[0].MiddleHeldSeconds == 90 && tied.Players[1].MiddleHeldSeconds == 0 && tied.MiddleIntervals.Sum(i => i.EndSeconds - i.StartSeconds) == 90, "tied capture flips preserve parity without double counting");
        var atStart = MatchEconomyExtractor.Extract(Replay(2, 100, [0], Player(1, 2)));
        var atEnd = MatchEconomyExtractor.Extract(Replay(2, 100, [100], Player(1, 2)));
        assert(atStart.Players[0].MiddleHeldSeconds == 100 && atEnd.MiddleAvailable && atEnd.Players[0].MiddleHeldSeconds == 0, "captures at replay boundaries retain known control semantics");
        foreach (var invalid in new[] { Replay(0, 100, [10], Player(1, 1)), Replay(1, 100, [], Player(1, 1)), Replay(1, 0, [10], Player(1, 1)), Replay(1, 100, [-5, 150], Player(1, 1)) })
        {
            var unavailable = MatchEconomyExtractor.Extract(invalid);
            assert(unavailable.Version == MatchEconomyExtractor.CurrentVersion && !unavailable.MiddleAvailable && unavailable.MiddleIntervals.Count == 0 && unavailable.MiddleIncomeRate == null && unavailable.Players[0].EstimatedMiddleMinerals == null, "invalid or absent middle evidence is versioned unavailable metadata");
        }
        var gases = MatchEconomyExtractor.Extract(Replay(1, 100, [10], Player(1, 1, 100, 25, -1, 0, 5, 10, 15, 20, 101)));
        assert(gases.Players[0].GasTimes?.SequenceEqual(new double[] { 5, 10, 15, 20, 25 }) == true, "all valid gas timestamps survive in order without a three-gas limit");
        var duplicate = MatchEconomyExtractor.Extract(Replay(1, 100, [10], Player(1, 1), Player(1, 2)));
        assert(duplicate.Players.Count == 1 && duplicate.Players[0].ActiveSeconds == null && duplicate.Players[0].GasTimes == null && duplicate.Players[0].MiddleHeldSeconds == null && duplicate.Players[0].EstimatedMiddleMinerals == null, "conflicting duplicate stable identities cannot acquire attributed economy");

        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeEconomyTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            var combat = new CombatStats(new() { ["UnitKills"] = 7 });
            var players = Enumerable.Range(1, 6).Select(i => new ReplayPlayer($"2-S2-1-{i}", $"Player{i}", i <= 3 ? 1 : 2, "Zerg", i <= 3 ? "Win" : "Loss", 50, 20, 10, combat)).ToList();
            var game = new Match("economy-original", "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 100, 1, players, CombatStatsExtractor.CurrentVersion);
            store.Data.Matches.Add(game);
            store.SetMark(players[0].Id, players[0].Name, "keep note", list: "friends");
            var rating = new Rating(players[0].Id, 2400, "Linked", "fixture", DateTime.UtcNow, "42", Region: "EU");
            store.SetRegionRating(players[0].Id, "EU", rating);
            var incoming = game with { Hash = "semantic-duplicate", Path = "new-fixture", Winner = 2, Economy = economy, Players = players.Select(p => p with { Name = "Changed", Result = "Loss", Combat = null, Killed = 999 }).ToList() };
            assert(ReplayService.NeedsEnrichment(game) && store.ImportMatch(incoming) == ReplayImportResult.Refreshed && store.Data.Matches.Count == 1, "same-combat-version semantic duplicate enriches missing economy once");
            var enriched = store.Data.Matches[0];
            assert(enriched.Hash == game.Hash && enriched.Winner == 1 && enriched.Time == game.Time && ReferenceEquals(enriched.Players, players) && enriched.Players[0].Combat?.Values["UnitKills"] == 7 && enriched.StatsVersion == game.StatsVersion, "economy-only enrichment preserves identities outcome and all current combat data");
            assert(store.Data.Marks[players[0].Id].Note == "keep note" && store.Data.Marks[players[0].Id].List == "friends" && store.GetRegionRatings(players[0].Id).Eu == rating && !ReplayService.NeedsEnrichment(enriched) && store.ImportMatch(incoming) == ReplayImportResult.Duplicate, "economy enrichment preserves private lists ratings and avoids repeated imports");
            store.Data.Matches[0] = enriched with { Economy = economy with { Version = 0 } };
            assert(ReplayService.NeedsEnrichment(store.Data.Matches[0]) && store.ImportMatch(incoming) == ReplayImportResult.Refreshed, "old economy version upgrades without a combat version bump");
            var unavailableEconomy = MatchEconomyExtractor.Extract(Replay(0, 100, [], Player(1, 1)));
            assert(!ReplayService.NeedsEnrichment(game with { Economy = unavailableEconomy }), "versioned unavailable economy does not cause repeated decoding");
            var combatUpgrade = incoming with { StatsVersion = CombatStatsExtractor.CurrentVersion + 1, Economy = null, Players = players.Select(p => p with { Combat = new(new() { ["UnitKills"] = 8 }) }).ToList() };
            assert(store.ImportMatch(combatUpgrade) == ReplayImportResult.Refreshed && store.Data.Matches[0].Economy == economy && store.Data.Matches[0].Winner == 1 && store.Data.Matches[0].Players[0].Combat?.Values["UnitKills"] == 8, "combat-only upgrade preserves already extracted economy and outcome");
            store.Save();
            var restored = new Store(path);
            assert(JsonSerializer.Serialize(restored.Data.Matches[0].Economy, Store.Json) == JsonSerializer.Serialize(economy, Store.Json) && restored.Data.Marks[players[0].Id].Note == "keep note" && restored.GetRegionRatings(players[0].Id).Eu == rating, "economy intervals gas arrays and related private data survive restart");
        }
        finally { Directory.Delete(path, true); }
    }
}
