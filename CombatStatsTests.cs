using System.Text.Json;
using Sc2DirectStrike.Parser;
using s2protocol.NET;
using s2protocol.NET.Models;
using static DirectStrikeCompanion.CombatStatsExtractor;

namespace DirectStrikeCompanion;

internal static class CombatStatsTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var actual = new Dictionary<int, ActualPlayer> { [7] = new("A", 1), [2] = new("B", 2), [6] = new("C", 1) };
        UnitEvent Born(int index, int owner, int loop = 1, int recycle = 0) => new(loop, index, recycle, UnitEventKind.Born, owner);
        UnitEvent Death(int index, int? killer, int loop = 10, int recycle = 0) => new(loop, index, recycle, UnitEventKind.Died, Killer: killer);
        var counted = ReduceDeaths([Born(1, 2), Death(1, 7), Death(1, 7)], actual);
        assert(counted.Players["A"].Kills == 1 && counted.Players["B"].CombatDeaths == 1, "tracked enemy death mirrors killer and victim once");
        var friendly = ReduceDeaths([Born(1, 6), Death(1, 7), Born(2, 7), Death(2, 7)], actual);
        assert(friendly.Players.Values.All(c => c.Kills == 0 && c.CombatDeaths == 0 && c.UnattributedDeaths == 0), "self and same-team deaths do not count as combat");
        var missing = ReduceDeaths([Born(1, 2), Death(1, null), Born(2, 2), Death(2, 14), Death(3, 7), Born(4, 13), Death(4, 7)], actual);
        assert(missing.Players["B"].UnattributedDeaths == 2 && missing.UnresolvedDeaths == 2 && missing.Players["A"].Kills == 0, "NPC and null killers stay unattributed and missing or NPC owners unresolved");
        var recycled = ReduceDeaths([Born(1, 2), Death(1, 7), Born(1, 2, 20, 1), Death(1, 7, 30, 1)], actual);
        assert(recycled.Players["A"].Kills == 2, "recycled tag indexes represent distinct units");
        var changed = ReduceDeaths([Born(1, 6), new(5, 1, 0, UnitEventKind.OwnerChange, 2), Death(1, 7), new(20, 1, 0, UnitEventKind.OwnerChange, 6)], actual);
        assert(changed.Players["B"].CombatDeaths == 1 && changed.Players["C"].CombatDeaths == 0, "ownership at death follows earlier changes only");
        var init = ReduceDeaths([new(1, 1, 0, UnitEventKind.Init, 2), Born(1, 2, 2), Death(1, 7)], actual);
        assert(init.Players["A"].Kills == 1, "Init and Born sharing a tag count one death");
        var tied = ReduceDeaths([Death(1, 7, 5), new(5, 1, 0, UnitEventKind.OwnerChange, 2), Born(1, 6, 5)], actual);
        assert(tied.Players["B"].CombatDeaths == 1, "same-loop births and owner changes establish victim before death");
        var future = ReduceDeaths([Death(1, 7, 5), Born(1, 2, 10)], actual);
        assert(future.UnresolvedDeaths == 1 && future.Players["A"].Kills == 0, "future birth does not retroactively resolve a death");
        var unteamed = ReduceDeaths([Born(1, 2), Death(1, 7)], new Dictionary<int, ActualPlayer> { [2] = new("B", 0), [7] = new("A", 1) });
        assert(unteamed.Players["A"].Kills == 0 && unteamed.UnresolvedDeaths == 1, "unknown team is never assumed enemy");

        var players = Enumerable.Range(0, 6).Select(slot => new DirectStrikePlayer { Id = 100 + slot, Region = 2, Realm = 1, SlotId = slot, TeamId = slot < 3 ? 1 : 2 }).Reverse().ToList();
        var parsed = new DirectStrikeReplay { Players = players.AsReadOnly() };
        int[] trackerIds = [7, 6, 5, 2, 3, 4]; // Deliberately unrelated to parsed order/slot+1.
        var setup = Enumerable.Range(0, 6).Select(slot => new SPlayerSetupEvent(trackerIds[slot], 0, 0, 0, 1, null, slot)).ToArray();
        SPlayerStatsEvent Stat(int loop, int killed)
        {
            var ctor = typeof(SPlayerStatsEvent).GetConstructors().Single();
            var args = ctor.GetParameters().Select(p => (object)(p.Name switch { "playerId" => 7, "gameloop" => loop, "mineralsKilledArmy" => killed, "foodUsed" => 8192, _ => 0 })).ToArray();
            return (SPlayerStatsEvent)ctor.Invoke(args);
        }
        var tracker = new TrackerEvents(setup, [Stat(100, 20), Stat(10, 2)],
            [new SUnitBornEvent(0, 0, 0, 1, 1, 0, null, null, 14, 0, 0, 2, "Marine", null)],
            [new SUnitDiedEvent(0, 0, 0, 10, 1, 0, 7, 0, 0, null, null)], [], [], [], [], [], []);
        // Test-only injection into the protocol model's internal setter.
        // Its collection constructors are not a JSON deserialization contract.
        Sc2Replay Fixture(TrackerEvents events)
        {
            var fixture = new Sc2Replay();
            typeof(Sc2Replay).GetProperty("TrackerEvents")!.SetValue(fixture, events);
            return fixture;
        }
        var replay = Fixture(tracker);
        var extracted = Extract(replay, parsed);
        var a = extracted["2-S2-1-100"];
        assert(a.Values["MineralsKilledArmy"] == 20 && a.LastSampleLoop == 100 && a.Values["FoodUsed"] == 8192, "latest raw sample mapped through setup preserves values and fixed-point supply");
        assert(a.Values["UnitKills"] == 1 && extracted["2-S2-1-103"].Values["CombatDeaths"] == 1, "upkeep owner and explicit tracker IDs override roster order and NPC controller");
        assert(!a.Values.ContainsKey("PlayerId") && !a.Values.ContainsKey("Bits") && a.Values["DamageDealt"] == null && a.Values["DamageTaken"] == null, "event metadata excluded and unexposed HP damage remains unavailable");
        assert(extracted["2-S2-1-101"].Values["MineralsKilledArmy"] == null && a.Values["FirstGasSeconds"] == null && a.Values["Tier2Seconds"] == null && a.Values["SpawnWaves"] == null, "missing samples and timing evidence do not become invented zeros");
        var noTracker = Extract(new Sc2Replay(), parsed);
        assert(noTracker["2-S2-1-100"].Values["UnitKills"] == null && noTracker["2-S2-1-100"].LastSampleLoop == null, "absent tracker stream leaves combat counts unavailable");
        var gasPlayer = players.Single(p => p.Id == 100);
        gasPlayer.RefineryTimes = [TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30)];
        gasPlayer.ScanCount = 0;
        var gas = Extract(replay, parsed)["2-S2-1-100"];
        assert(gas.Values["FirstGasSeconds"] == 10 && gas.Values["SecondGasSeconds"] == 30 && gas.Values["ThirdGasSeconds"] == null && gas.Values["ScanCount"] == 0, "observed gas timings and explicit zero scans retain their meaning");
        var tierTracker = new TrackerEvents(setup, [], [], [], [], [], [], [new SUpgradeEvent(7, 0, 0, 224, 1, "Tier3")], [], []);
        var tierReplay = Fixture(tierTracker);
        gasPlayer.TierUpgrades = [TimeSpan.FromSeconds(10)];
        var tier = Extract(tierReplay, parsed)["2-S2-1-100"];
        assert(tier.Values["Tier2Seconds"] == null && tier.Values["Tier3Seconds"] == 10, "named upgrades prevent lone Tier3 timing from being mislabeled Tier2");
        assert(CurrentVersion == 2 && a.Impact is { Version: 1 } && a.Impact.Samples.Count == 2 && a.Impact.Opponents.Single().PlayerId == "2-S2-1-103", "v2 extraction attaches measured detail through the same native player mapping");
        assert(noTracker["2-S2-1-100"].Impact == null, "missing tracker leaves impact detail unavailable");
        var unsupported = Extract(replay, new DirectStrikeReplay { Players = players.Take(5).ToList().AsReadOnly() });
        assert(unsupported.Values.All(s => s.Impact == null), "unsupported roster receives no detailed combat trace");
        var conflictSetup = setup.Concat([new SPlayerSetupEvent(7, 0, 0, 0, 1, null, 1)]).ToArray();
        var conflictTracker = new TrackerEvents(conflictSetup, [Stat(100, 20)], [], [], [], [], [], [], [], []);
        var conflicted = Extract(Fixture(conflictTracker), parsed)["2-S2-1-100"];
        assert(conflicted.Impact == null && conflicted.Values["MineralsKilledArmy"] == null && conflicted.Values["UnitKills"] == null,
            "conflicting native tracker setup never assigns detailed or headline stats by guessed slot order");
        ReplayImpactExtractorTests.Run(assert);
    }
}
