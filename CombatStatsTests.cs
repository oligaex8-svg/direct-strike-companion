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
        var pickups = ReduceDeaths([new(1, 1, 0, UnitEventKind.Born, 2, UnitType: "BiomassItem"), Death(1, 7),
            new(1, 2, 0, UnitEventKind.Born, 2, UnitType: "Marine"), Death(2, 7)], actual);
        assert(pickups.Players["A"].Kills == 1 && pickups.Players["B"].CombatDeaths == 1 &&
            !pickups.Players["B"].Units.ContainsKey("BiomassItem"), "biomass removals excluded while genuine untagged unit kills remain counted");
        var pickupCleanup = ReduceDeaths([new(1, 1, 0, UnitEventKind.Born, 2, UnitType: "BiomassItem"), Death(1, null)], actual);
        assert(pickupCleanup.Players["B"].UnattributedDeaths == 0 && pickupCleanup.UnresolvedDeaths == 0,
            "biomass cleanup does not inflate unattributed combat deaths");
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

        // Creator tags preserve direct accounting while grouping on-death and nested summons.
        UnitEvent NamedBorn(int index, int owner, string name, int loop, int recycle = 0, int? creator = null, int? creatorRecycle = null) =>
            new(loop, index, recycle, UnitEventKind.Born, owner, UnitType: name, CreatorIndex: creator, CreatorRecycle: creatorRecycle);
        UnitEvent Kill(int victim, int owner, int killerTag, int loop, int killerRecycle = 0) =>
            new(loop, victim, 0, UnitEventKind.Died, Killer: owner, KillerIndex: killerTag, KillerRecycle: killerRecycle);
        var controlled = ReduceDeaths([
            new(1, 90, 0, UnitEventKind.Born, 2, UnitType: "HighArchon", Controller: 2),
            NamedBorn(91, 2, "Enemy", 1), NamedBorn(92, 2, "Enemy", 1), NamedBorn(93, 2, "Enemy", 1),
            Kill(91, 7, 90, 2), // A later transfer must not repair an earlier mismatch.
            new(3, 90, 0, UnitEventKind.OwnerChange, 2, Controller: 7), Kill(92, 7, 90, 3),
            new(4, 90, 0, UnitEventKind.OwnerChange, 2, Controller: 2), Kill(93, 7, 90, 5)
        ], actual);
        assert(controlled.Players["A"].Units["HighArchon"].Kills == 1 && controlled.Players["A"].Units["Unknown"].Kills == 2,
            "exact source type follows recorded control transfer at the kill loop, not future or expired control");
        assert(controlled.Players["A"].Kills == 3 && controlled.Players["B"].CombatDeaths == 3 &&
            controlled.Players["A"].Groups["HighArchon"].DirectKills == 1 && controlled.Players["A"].Groups["HighArchon"].SummonKills == 0,
            "controlled-source recovery preserves player totals and never invents a summoner");
        var staleControl = ReduceDeaths([
            new(1, 90, 0, UnitEventKind.Born, 2, UnitType: "HighArchon", Controller: 7), Death(90, 7, 2),
            NamedBorn(90, 2, "OtherUnit", 3, recycle: 1), NamedBorn(91, 2, "Enemy", 1), Kill(91, 7, 90, 4, killerRecycle: 1),
            new(1, 92, 0, UnitEventKind.Born, 2, UnitType: "NpcControlled", Controller: 14), NamedBorn(93, 2, "Enemy", 1), Kill(93, 7, 92, 4)
        ], actual);
        assert(staleControl.Players["A"].Units["Unknown"].Kills == 3 && !staleControl.Players["A"].Units.ContainsKey("OtherUnit") &&
            !staleControl.Players["A"].Units.ContainsKey("NpcControlled"), "recycled tags and NPC controllers do not create human source attribution");
        var summons = ReduceDeaths([
            NamedBorn(10, 7, "Abomination", 1), NamedBorn(20, 2, "Enemy", 1), Kill(20, 7, 10, 2),
            new(3, 10, 0, UnitEventKind.Died, Killer: 2),
            NamedBorn(11, 7, "Splitterling", 3, creator: 10, creatorRecycle: 0),
            NamedBorn(12, 7, "SplitterlingSpawn", 4, creator: 11, creatorRecycle: 0),
            NamedBorn(21, 2, "Enemy", 1), Kill(21, 7, 11, 5),
            NamedBorn(22, 2, "Enemy", 1), Kill(22, 7, 12, 6),
            new(7, 11, 0, UnitEventKind.Died, Killer: 2), new(7, 12, 0, UnitEventKind.Died, Killer: 2)
        ], actual);
        var group = summons.Players["A"].Groups["Abomination"];
        assert(group.DirectKills == 1 && group.SummonKills == 2 && group.DirectLosses == 1 && group.SummonLosses == 2 &&
            group.SummonsProduced == 2 && group.Children.SetEquals(["Splitterling", "SplitterlingSpawn"]),
            "same-loop on-death and multi-generation creators group exactly once");
        assert(summons.Players["A"].Units.Values.Sum(v => v.Kills) == summons.Players["A"].Groups.Values.Sum(v => v.DirectKills + v.SummonKills) &&
            summons.Players["A"].Units.Values.Sum(v => v.Losses) == summons.Players["A"].Groups.Values.Sum(v => v.DirectLosses + v.SummonLosses),
            "creator grouping conserves raw per-player kills and losses");
        var excluded = ReduceDeaths([
            NamedBorn(30, 7, "WorkerZagara", 1), NamedBorn(31, 7, "Placed", 2, creator: 30, creatorRecycle: 0),
            NamedBorn(32, 2, "Enemy", 1), Kill(32, 7, 31, 3),
            NamedBorn(40, 2, "EnemyParent", 1), NamedBorn(41, 7, "Mismatch", 2, creator: 40, creatorRecycle: 0),
            NamedBorn(42, 2, "Enemy", 1), Kill(42, 7, 41, 3),
            NamedBorn(43, 7, "NoCreator", 2, creator: 99, creatorRecycle: 0),
            NamedBorn(44, 2, "Enemy", 1), Kill(44, 7, 43, 3),
            NamedBorn(50, 7, "ChangedParent", 1), new(2, 50, 0, UnitEventKind.OwnerChange, 6),
            NamedBorn(51, 7, "ChangedChild", 3, creator: 50, creatorRecycle: 0),
            NamedBorn(52, 2, "Enemy", 1), Kill(52, 7, 51, 4)
        ], actual);
        assert(new[] { "Placed", "Mismatch", "NoCreator", "ChangedChild" }.All(name => excluded.Players["A"].Groups[name].DirectKills == 1),
            "workers, missing or different-owner creators and ownership changes stay direct");
        var reuse = ReduceDeaths([
            NamedBorn(60, 7, "OldParent", 1), new(2, 60, 0, UnitEventKind.Died, Killer: 2),
            NamedBorn(60, 7, "NewParent", 3, recycle: 1),
            new(3, 61, 0, UnitEventKind.Init, 7, UnitType: "Spawn"),
            NamedBorn(61, 7, "Spawn", 3, creator: 60, creatorRecycle: 1),
            NamedBorn(62, 2, "Enemy", 1), Kill(62, 7, 61, 4)
        ], actual);
        assert(reuse.Players["A"].Groups["NewParent"].SummonKills == 1 && reuse.Players["A"].Groups["NewParent"].SummonsProduced == 1,
            "recycled tags and duplicate init/born resolve one correctly identified creator");

        var invalidLinks = ReduceDeaths([
            NamedBorn(70, 7, "FutureChild", 1, creator: 71, creatorRecycle: 0), NamedBorn(71, 7, "FutureParent", 2),
            NamedBorn(72, 2, "Enemy", 1), Kill(72, 7, 70, 3),
            NamedBorn(80, 7, "CycleA", 1), NamedBorn(81, 7, "CycleB", 2, creator: 80, creatorRecycle: 0),
            NamedBorn(80, 7, "CycleA", 3, creator: 81, creatorRecycle: 0),
            NamedBorn(82, 2, "Enemy", 1), Kill(82, 7, 81, 4)
        ], actual);
        assert(invalidLinks.Players["A"].Groups["FutureChild"].DirectKills == 1 &&
            invalidLinks.Players["A"].Groups["CycleB"].DirectKills == 1,
            "future creator references and cycles stay direct rather than inventing ancestry");

        var morphed = ReduceDeaths([
            NamedBorn(90, 7, "CreeperHost", 1), new(2, 90, 0, UnitEventKind.TypeChange, UnitType: "CreeperHostBurrowed"),
            new(3, 90, 0, UnitEventKind.Died, Killer: 2),
            NamedBorn(91, 7, "Creeper", 4, creator: 90, creatorRecycle: 0),
            NamedBorn(92, 2, "Enemy", 1), Kill(92, 7, 91, 5),
            NamedBorn(93, 7, "CreeperCocoon", 4, creator: 90, creatorRecycle: 0)
        ], actual);
        assert(morphed.Players["A"].Units.ContainsKey("CreeperHostBurrowed") &&
            morphed.Players["A"].Groups["CreeperHost"].DirectLosses == 1 &&
            morphed.Players["A"].Groups["CreeperHost"].SummonKills == 1 &&
            morphed.Players["A"].Groups["CreeperHost"].SummonsProduced == 1 &&
            !morphed.Players["A"].Groups.ContainsKey("CreeperHostBurrowed"),
            "morphed creator and on-death summon share one root; staging effects do not count as summons");

        var nested = ReplayImpactExtractor.Extract([], [], summons.Players["A"]).UnitGroups!.Single(row => row.Name == "Abomination");
        var splitter = nested.Breakdown!.Children.Single(node => node.Name == "Splitterling");
        var spawn = splitter.Children.Single(node => node.Name == "SplitterlingSpawn");
        assert(nested.Breakdown.Kills == 3 && nested.Breakdown.Losses == 3 && nested.Breakdown.DirectKills == 1 &&
            splitter.Kills == 2 && splitter.DirectKills == 1 && spawn.Kills == 1 && spawn.DirectKills == 1 &&
            nested.Breakdown.SummonsProduced == 2 && splitter.SummonsProduced == 1,
            "nested on-death ancestry retains inclusive and direct totals at every level");
        var transformed = ReplayImpactExtractor.Extract([], [], morphed.Players["A"]).UnitGroups!.Single(row => row.Name == "CreeperHost");
        assert(transformed.Breakdown!.DirectLosses == 1 && transformed.Breakdown.Children.Single().DirectKills == 1,
            "transformed parent retains direct loss under the same nested root");
        var paths = ReduceDeaths([
            NamedBorn(100, 7, "RootOne", 1), NamedBorn(101, 7, "RootTwo", 1),
            NamedBorn(102, 7, "Shared", 2, creator: 100, creatorRecycle: 0),
            NamedBorn(103, 7, "Shared", 2, creator: 101, creatorRecycle: 0),
            NamedBorn(104, 7, "Shared", 3, creator: 102, creatorRecycle: 0),
            NamedBorn(105, 7, "ZeroSpawn", 3, creator: 103, creatorRecycle: 0),
            NamedBorn(110, 2, "Enemy", 1), Kill(110, 7, 102, 4),
            NamedBorn(111, 2, "Enemy", 1), Kill(111, 7, 103, 4),
            NamedBorn(112, 2, "Enemy", 1), Kill(112, 7, 104, 4)
        ], actual);
        var pathGroups = ReplayImpactExtractor.Extract([], [], paths.Players["A"]).UnitGroups!;
        var first = pathGroups.Single(row => row.Name == "RootOne").Breakdown!;
        var second = pathGroups.Single(row => row.Name == "RootTwo").Breakdown!;
        assert(first.Children.Single().Name == "Shared" && first.Children.Single().DirectKills == 1 &&
            first.Children.Single().Children.Single().Name == "Shared" && first.Children.Single().Children.Single().DirectKills == 1 &&
            second.Children.Single().DirectKills == 1 && second.Children.Single().Children.Single().Name == "ZeroSpawn" &&
            second.Children.Single().Children.Single().Kills == 0,
            "equal child types remain separate by ancestor and depth; zero-kill spawned units remain visible");
        var deepEvents = new List<UnitEvent> { NamedBorn(200, 7, "DeepRoot", 1) };
        for (int i = 1; i <= 12; i++) deepEvents.Add(NamedBorn(200 + i, 7, "Depth" + i, i + 1, creator: 199 + i, creatorRecycle: 0));
        deepEvents.Add(NamedBorn(300, 2, "Enemy", 1)); deepEvents.Add(Kill(300, 7, 212, 20));
        var deep = ReplayImpactExtractor.Extract([], [], ReduceDeaths(deepEvents, actual).Players["A"]).UnitGroups!.Single(row => row.Name == "DeepRoot");
        assert(deep.BreakdownTruncated && deep.Kills == 1 && deep.Breakdown!.Kills == 1 && deep.Breakdown.SummonsProduced == 12,
            "depth overflow is explicit and conserves all contribution and summon counts");

        var staging = ReduceDeaths([
            NamedBorn(400, 7, "StagingAreaFootprint", 1), NamedBorn(401, 7, "PlacedUnit", 2, creator: 400, creatorRecycle: 0),
            NamedBorn(402, 2, "Enemy", 1), Kill(402, 7, 401, 3),
            NamedBorn(403, 7, "StagingAreaFootprintVisual", 2, creator: 400, creatorRecycle: 0)
        ], actual);
        assert(staging.Players["A"].Groups["PlacedUnit"].DirectKills == 1 &&
            !staging.Players["A"].Groups.ContainsKey("StagingAreaFootprint") &&
            !staging.Players["A"].Groups.ContainsKey("StagingAreaFootprintVisual"),
            "staging footprints do not form summon families and their placed combat units stay direct");
        var manyGroups = new DeathCounts();
        for (int i = 0; i < ReplayImpactExtractor.MaxUnits + 1; i++)
        {
            var root = new BreakdownCounts("Root" + i) { DirectKills = 1, DirectLosses = 2, SummonsProduced = 1 };
            root.Children["Spawn"] = new BreakdownCounts("Spawn") { DirectKills = 3, DirectLosses = 4 };
            manyGroups.Groups[root.Name] = new GroupCounts { DirectKills = 1, DirectLosses = 2, SummonKills = 3,
                SummonLosses = 4, SummonsProduced = 1, Breakdown = root };
        }
        var capped = ReplayImpactExtractor.Extract([], [], manyGroups).UnitGroups!;
        var other = capped.Single(row => row.Name == "Other");
        assert(capped.Count == ReplayImpactExtractor.MaxUnits && other.BreakdownTruncated &&
            other.Breakdown!.Kills == other.Kills && other.Breakdown.Losses == other.Losses &&
            other.Breakdown.DirectKills == other.DirectKills && other.Breakdown.DirectLosses == other.DirectLosses &&
            other.Breakdown.Children.Sum(child => child.Kills) == other.SummonKills &&
            other.Breakdown.Children.Sum(child => child.Losses) == other.SummonLosses &&
            capped.Sum(row => row.Kills) == (ReplayImpactExtractor.MaxUnits + 1) * 4 &&
            capped.Sum(row => row.Losses) == (ReplayImpactExtractor.MaxUnits + 1) * 6,
            "root cap explicitly preserves total and direct versus summon counts in Other");

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
        assert(a.ScorePlayerId == 7 && extracted["2-S2-1-103"].ScorePlayerId == 2,
            "score player IDs follow validated tracker mapping rather than roster order");
        var legacyCombat = JsonSerializer.Deserialize<CombatStats>("{\"values\":{}}", Store.Json);
        assert(legacyCombat?.ScorePlayerId == null, "legacy combat records preserve missing score player ID");
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
        assert(CurrentVersion == 6 && a.Impact is { Version: 3 } && a.Impact.Samples.Count == 2 && a.Impact.Opponents.Single().PlayerId == "2-S2-1-103", "v6 extraction attaches measured detail through the same native player mapping");
        assert(noTracker["2-S2-1-100"].Impact == null, "missing tracker leaves impact detail unavailable");
        var unsupported = Extract(replay, new DirectStrikeReplay { Players = players.Take(5).ToList().AsReadOnly() });
        assert(unsupported.Values.All(s => s.Impact == null), "unsupported roster receives no detailed combat trace");
        var conflictSetup = setup.Concat([new SPlayerSetupEvent(7, 0, 0, 0, 1, null, 1)]).ToArray();
        var conflictTracker = new TrackerEvents(conflictSetup, [Stat(100, 20)], [], [], [], [], [], [], [], []);
        var conflicted = Extract(Fixture(conflictTracker), parsed)["2-S2-1-100"];
        assert(conflicted.Impact == null && conflicted.ScorePlayerId == null && conflicted.Values["MineralsKilledArmy"] == null && conflicted.Values["UnitKills"] == null,
            "conflicting native tracker setup never assigns detailed or headline stats by guessed slot order");
        ReplayImpactExtractorTests.Run(assert);
        ReplayDamageApiTests.Run(assert);
        ReplayDamagePersistenceTests.Run(assert);
        ReplayDamageGpuTests.Run(assert);
        ReplayDamageCheckpointTests.Run(assert);
    }
}
