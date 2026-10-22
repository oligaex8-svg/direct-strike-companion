using System.Text.Json;
using Sc2DirectStrike.Parser;
using s2protocol.NET.Models;
using static DirectStrikeCompanion.CombatStatsExtractor;

namespace DirectStrikeCompanion;

internal static class ReplayImpactExtractorTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var trace = ReplayImpactExtractor.Extract([Stat(224, 30), Stat(-1, 999), Stat(0, 0), Stat(112, 12), Stat(112, 14)], [], null);
        assert(trace.Samples.Select(s => s.Seconds).SequenceEqual([0d, 5d, 10d]) && trace.Samples[1].ArmyKilled == 14,
            "impact samples are chronological actual timestamps with the final observation of a tied loop");
        var invalid = ReplayImpactExtractor.Extract([Stat(0, -1, -1, -1, -1, 45)], [], null).Samples.Single();
        assert(invalid.ArmyKilled == null && invalid.ArmyLost == null && invalid.IncomeRate == null && invalid.ArmyValue == 45,
            "negative stats remain unavailable and invalid active-army value can use measured current-army value");
        var zero = trace.Samples[0];
        assert(zero.ArmyKilled == 0 && zero.ArmyLost == 0 && zero.ArmyValue == 0 && zero.IncomeRate == 0,
            "observed zeros remain valid samples");
        var many = Enumerable.Range(0, 501).Select(i => Stat(i * 224, i)).Reverse().ToList();
        var sampled = ReplayImpactExtractor.Extract(many, [], null);
        assert(sampled.Samples.Count == 121 && sampled.SamplesTruncated && sampled.Samples.First().Seconds == 0 && sampled.Samples.Last().Seconds == 5000,
            "long impact timeline retains both actual endpoints within 121 samples");
        assert(sampled.Samples.Select(s => s.Seconds).Distinct().Count() == 121 && sampled.Samples.All(s => Math.Abs(s.Seconds / 10 - Math.Round(s.Seconds / 10)) < 1e-9) &&
            JsonSerializer.Serialize(sampled) == JsonSerializer.Serialize(ReplayImpactExtractor.Extract(many, [], null)),
            "impact downsampling selects actual unique points deterministically");

        DirectStrikePlayerSpawn Spawn(int loop, params string[] names) => new()
        {
            StartGameloop = loop, EndGameloop = loop + 100,
            SummaryStats = new() { Gameloop = loop + 100, MineralsUsedActiveForces = 999 },
            Units = names.Select(n => new DirectStrikeSpawnUnit { Name = n }).ToList().AsReadOnly()
        };
        var waves = ReplayImpactExtractor.Extract([Stat(224, 0, active: 75)],
            [Spawn(448, "Marine"), Spawn(224, "Marine", "Marine", "Marauder"), Spawn(-1, "Invalid")], null);
        assert(waves.Waves.Select(w => w.Seconds).SequenceEqual([10d, 20d]) && waves.Waves[0].Units.Single(u => u.Name == "Marine").Count == 2,
            "spawn composition uses actual spawn start timestamps and counts real parser units");
        assert(waves.Waves[0].ArmyValue == 75 && waves.Waves[1].ArmyValue == null,
            "wave value requires exact start-loop evidence and never borrows later spawn summary stats");
        var largeWave = Spawn(0, Enumerable.Range(0, 60).Select(i => "Type" + i).Concat(["Other", "\nbad", new string('x', 81)]).ToArray());
        var capped = ReplayImpactExtractor.Extract([], [largeWave], null);
        assert(capped.WavesTruncated && capped.Waves.Single().Units.Count == 40 && capped.Waves.Single().Units.Sum(u => u.Count) == 63 &&
            capped.Waves.Single().Units.All(u => u.Name.Length <= 80 && !u.Name.Any(char.IsControl)),
            "capped wave compositions retain total counts and bound validated labels");
        assert(ReplayImpactExtractor.UnitName(new string('\u4e2d', 40)) == "Unknown" && ReplayImpactExtractor.UnitName("  Marine  ") == "Marine",
            "unit labels bound encoded Unicode payload and trim ordinary parser names");
        var manyWaves = ReplayImpactExtractor.Extract([], Enumerable.Range(0, 241).Select(i => Spawn(i * 224, "Marine")), null);
        assert(manyWaves.WavesTruncated && manyWaves.Waves.Count == 120 && manyWaves.Waves.First().Seconds == 0 && manyWaves.Waves.Last().Seconds == 2400,
            "wave truncation keeps the first and last actual waves");

        var actual = new Dictionary<int, ActualPlayer> { [7] = new("A", 1), [2] = new("B", 2), [6] = new("C", 1) };
        UnitEvent Born(int index, int owner, string type, int loop = 1, int recycle = 0) => new(loop, index, recycle, UnitEventKind.Born, owner, UnitType: type);
        UnitEvent Death(int index, int? killer = 7, int loop = 10, int recycle = 0, int? killerIndex = 90, int? killerRecycle = 0)
            => new(loop, index, recycle, UnitEventKind.Died, Killer: killer, KillerIndex: killerIndex, KillerRecycle: killerRecycle);
        var deaths = ReduceDeaths([
            Born(90, 7, "Marine"), Born(1, 6, "Larva"),
            new(5, 1, 0, UnitEventKind.OwnerChange, 2), new(5, 1, 0, UnitEventKind.TypeChange, UnitType: "Roach"),
            new(5, 90, 0, UnitEventKind.TypeChange, UnitType: "Marauder"), Death(1), Death(1),
            Born(1, 2, "Hydralisk", 11, 1), Death(1, loop: 20, recycle: 1, killerRecycle: 1),
            Born(2, 2, "Zergling"), Death(2, killerIndex: null),
            Born(3, 2, "Ultralisk"), new(4, 90, 1, UnitEventKind.Born, 6, UnitType: "FriendlyMarine"), Death(3, killerRecycle: 1),
            Born(4, 6, "Ally"), Death(4), Born(5, 2, "NPCDeath"), Death(5, killer: 14),
            Born(6, 13, "NPC"), Death(6), new(30, 1, 0, UnitEventKind.TypeChange, UnitType: "FutureType")
        ], actual);
        var a = ReplayImpactExtractor.Extract([], [], deaths.Players["A"]);
        var b = ReplayImpactExtractor.Extract([], [], deaths.Players["B"]);
        assert(a.Units.Single(u => u.Name == "Marauder").Kills == 1 && b.Units.Single(u => u.Name == "Roach").Losses == 1 && !b.Units.Any(u => u.Name is "Larva" or "FutureType"),
            "unit breakdown follows type changes and ownership at death with duplicate deaths ignored");
        assert(a.Units.Single(u => u.Name == "Unknown").Kills == 3 && !a.Units.Any(u => u.Name == "FriendlyMarine"),
            "unknown killer tags, recycled tag mismatches and conflicting killer ownership stay Unknown");
        assert(a.Units.Sum(u => u.Kills) == deaths.Players["A"].Kills && b.Units.Sum(u => u.Losses) == deaths.Players["B"].CombatDeaths &&
            a.Opponents.Single() == new ReplayImpactOpponent("B", 4, 0) && b.Opponents.Single() == new ReplayImpactOpponent("A", 0, 4),
            "unit and opponent breakdowns match final reducer totals and exclude friendly and NPC deaths");
        var largeDeaths = new DeathCounts();
        foreach (int i in Enumerable.Range(0, 100)) largeDeaths.Units["Type" + i] = new() { Kills = i, Losses = 100 - i };
        largeDeaths.Units["Other"] = new() { Kills = 1, Losses = 2 };
        var limited = ReplayImpactExtractor.Extract([], [], largeDeaths);
        assert(limited.UnitsTruncated && limited.Units.Count == 60 && limited.Units.Select(u => u.Name).Distinct().Count() == 60 &&
            limited.Units.Sum(u => u.Kills) == 4951 && limited.Units.Sum(u => u.Losses) == 5052,
            "unit type cap aggregates remaining counts without losing totals or duplicating Other");
        var empty = ReplayImpactExtractor.Extract([], [], new DeathCounts());
        assert(empty.Samples.Count == 0 && empty.Waves.Count == 0 && empty.Units.Count == 0 && !empty.SamplesTruncated && !empty.WavesTruncated && !empty.UnitsTruncated,
            "absent sample and spawn streams do not become synthetic zero observations");
        var maxNames = Enumerable.Range(0, 60).Select(i => new string('x', 76) + i.ToString("D4")).ToArray();
        var maximum = new ReplayImpactDetail(1,
            Enumerable.Range(0, 121).Select(_ => new ReplayImpactSample(double.MaxValue, double.MaxValue, double.MaxValue, double.MaxValue, double.MaxValue)).ToList(),
            Enumerable.Range(0, 120).Select(_ => new ReplayImpactWave(double.MaxValue,
                maxNames.Take(40).Select(n => new ReplayImpactUnitCount(n, int.MaxValue)).ToList(), double.MaxValue)).ToList(),
            maxNames.Select(n => new ReplayImpactUnit(n, int.MaxValue, int.MaxValue)).ToList(),
            Enumerable.Range(0, 3).Select(_ => new ReplayImpactOpponent("2147483647-S2-2147483647-2147483647", int.MaxValue, int.MaxValue)).ToList(), true, true, true);
        var six = Enumerable.Range(0, 6).Select(_ => new CombatStats(
            Enumerable.Range(0, 64).ToDictionary(i => "ConservativeMaximumStatField" + i, _ => (double?)double.MaxValue), int.MaxValue, int.MaxValue, maximum)).ToList();
        assert(JsonSerializer.SerializeToUtf8Bytes(six).Length < 4 * 1024 * 1024 - 256 * 1024,
            "six maximum-sized impact traces leave room for replay metadata below the compact decoder response cap");
    }

    private static SPlayerStatsEvent Stat(int loop, int killed, int lost = 0, int active = 0, int rate = 0, int current = 0)
    {
        var ctor = typeof(SPlayerStatsEvent).GetConstructors().Single();
        return (SPlayerStatsEvent)ctor.Invoke(ctor.GetParameters().Select(p => (object)(p.Name switch
        {
            "gameloop" => loop, "playerId" => 7, "mineralsKilledArmy" => killed, "mineralsLostArmy" => lost,
            "mineralsUsedActiveForces" => active, "mineralsUsedCurrentArmy" => current, "mineralsCollectionRate" => rate, _ => 0
        })).ToArray());
    }
}
