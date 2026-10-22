using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class ReplayImpactStorageTests
{
    internal static void Run(Action<bool, string> check)
    {
        var directory = Path.Combine(Path.GetTempPath(), "dsc-impact-storage-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new Store(directory);
            var players = Enumerable.Range(1, 6).Select(index => new ReplayPlayer($"2-S2-1-{index}", "Player " + index,
                index <= 3 ? 1 : 2, "Artanis", index <= 3 ? "Win" : "Loss", 10, 1, 1,
                new(new() { ["MineralsKilledArmy"] = 100, ["UnitKills"] = 1 }))).ToList();
            var original = new Match("impact-storage", "fixture.SC2Replay", "Direct Strike", "Commanders", DateTime.UnixEpoch,
                600, 1, players, 1, new(MatchEconomyExtractor.CurrentVersion, false, "fixture", [], null, []), ReplayClanTags.CurrentVersion);
            store.ImportMatch(original);
            store.SetMark(players[0].Id, players[0].Name, "Keep my note", list: "friends");
            var trace = new ReplayImpactDetail(1, [new(0, 0, 0, 100, 60), new(600, 100, 50, 200, 90)],
                [new(30, [new("Marine", 4)], null)], [new("Marine", 1, 1)], [new(players[3].Id, 1, 1)]);
            var upgraded = original with { StatsVersion = CombatStatsExtractor.CurrentVersion,
                Players = players.Select(player => player with { Combat = player.Combat! with { Impact = trace } }).ToList() };
            check(ReplayService.NeedsEnrichment(original) && !ReplayService.NeedsEnrichment(upgraded),
                "impact version-two upgrade is automatic while already upgraded replays remain current");
            check(store.ImportMatch(upgraded with { Winner = 2 }) == ReplayImportResult.Refreshed,
                "detailed impact refresh upgrades an existing replay rather than adding a duplicate");
            var stored = store.Data.Matches.Single();
            check(stored.Hash == original.Hash && stored.Winner == original.Winner && stored.Time == original.Time
                && stored.Players.Select(player => (player.Id, player.Name, player.Team, player.Result))
                    .SequenceEqual(original.Players.Select(player => (player.Id, player.Name, player.Team, player.Result)))
                && store.Data.Marks[players[0].Id].Note == "Keep my note", "impact enrichment preserves replay identity, recorded teams/results and private notes");
            var compact = Store.WithoutImpactTrace(stored);
            check(compact.Players.All(player => player.Combat?.Impact == null)
                && stored.Players.All(player => player.Combat?.Impact?.Samples.Count == 2)
                && compact.Players[0].Combat?.Values["MineralsKilledArmy"] == 100,
                "compact library rows retain existing metrics without mutating stored detailed traces");
            var summary = JsonSerializer.SerializeToElement(store.Summary(), Store.Json);
            check(summary.GetProperty("matches")[0].GetProperty("players")[0].GetProperty("combat").GetProperty("impact").ValueKind == JsonValueKind.Null,
                "periodic library payload omits detailed impact timelines");
            var detail = JsonSerializer.SerializeToElement(store.ImpactDetails(original.Hash), Store.Json);
            check(!detail.GetProperty("pending").GetBoolean() && detail.GetProperty("players")[0].GetProperty("impact").GetProperty("samples").GetArrayLength() == 2
                && store.ImpactDetails("missing") == null, "on-demand impact snapshot returns only the requested replay and exposes its current detailed data");
            store.Save();
            var restored = new Store(directory);
            check(restored.Data.Matches.Single().Players.All(player => player.Combat?.Impact?.Waves.Single().Units.Single().Count == 4)
                && restored.Data.Marks[players[0].Id].Note == "Keep my note", "detailed impact survives persistence with private lists intact");
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }
}
