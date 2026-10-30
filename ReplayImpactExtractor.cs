using Sc2DirectStrike.Parser;
using s2protocol.NET.Models;
using System.Text.Json;

namespace DirectStrikeCompanion;

public sealed record ReplayImpactDetail(int Version, List<ReplayImpactSample> Samples, List<ReplayImpactWave> Waves,
    List<ReplayImpactUnit> Units, List<ReplayImpactOpponent> Opponents,
    bool SamplesTruncated = false, bool WavesTruncated = false, bool UnitsTruncated = false,
    List<ReplayImpactUnitGroup>? UnitGroups = null);
public sealed record ReplayImpactSample(double Seconds, double? ArmyKilled, double? ArmyLost, double? ArmyValue, double? IncomeRate);
public sealed record ReplayImpactWave(double Seconds, List<ReplayImpactUnitCount> Units, double? ArmyValue);
public sealed record ReplayImpactUnitCount(string Name, int Count);
public sealed record ReplayImpactUnit(string Name, int Kills, int Losses,
    double? DamageDealt = null, double? DamageTaken = null, double? ArmyValueKilled = null);
public sealed record ReplayImpactUnitGroup(string Name, int Kills, int Losses, int DirectKills, int SummonKills,
    int DirectLosses, int SummonLosses, int SummonsProduced, List<string> Children,
    double? DamageDealt = null, double? DamageTaken = null, double? ArmyValueKilled = null,
    ReplayImpactUnitNode? Breakdown = null, bool BreakdownTruncated = false);
public sealed record ReplayImpactUnitNode(string Name, int Kills, int Losses, int DirectKills, int DirectLosses,
    int SummonsProduced, List<ReplayImpactUnitNode> Children,
    double? DamageDealt = null, double? DamageTaken = null, double? ArmyValueKilled = null);
public sealed record ReplayImpactOpponent(string PlayerId, int Kills, int Losses);

internal static class ReplayImpactExtractor
{
    internal const int CurrentVersion = 3;
    internal const int MaxSamples = 121, MaxWaves = 120, MaxUnits = 60, MaxWaveUnits = 40;
    private const double LoopsPerSecond = 22.4;
    private const string Other = "Other";

    // The tracker collection is the source of samples; no resampling, interpolation
    // or cumulative maxima may manufacture points between the observed game loops.
    internal static ReplayImpactDetail Extract(IEnumerable<SPlayerStatsEvent> stats,
        IEnumerable<DirectStrikePlayerSpawn> spawns, CombatStatsExtractor.DeathCounts? deaths)
    {
        var samples = stats.Where(s => s.Gameloop >= 0).GroupBy(s => s.Gameloop).OrderBy(g => g.Key)
            .Select(g => g.Last()).Select(s => new ReplayImpactSample(s.Gameloop / LoopsPerSecond,
                Nonnegative(s.MineralsKilledArmy), Nonnegative(s.MineralsLostArmy),
                Nonnegative(s.MineralsUsedActiveForces) ?? Nonnegative(s.MineralsUsedCurrentArmy), Nonnegative(s.MineralsCollectionRate))).ToList();
        bool wavesTruncated = false;
        var samplesBySeconds = samples.ToDictionary(s => s.Seconds);
        var waves = new List<ReplayImpactWave>();
        foreach (var spawn in spawns.Where(s => s.StartGameloop >= 0).OrderBy(s => s.StartGameloop).ThenBy(s => s.Number))
        {
            var composition = spawn.Units.GroupBy(u => UnitName(u.Name), StringComparer.Ordinal)
                .Select(g => new ReplayImpactUnitCount(g.Key, g.Count())).OrderByDescending(u => u.Count).ThenBy(u => u.Name, StringComparer.Ordinal).ToList();
            if (composition.Count > MaxWaveUnits)
            {
                composition = CapComposition(composition);
                wavesTruncated = true;
            }
            double seconds = spawn.StartGameloop / LoopsPerSecond;
            // SummaryStats can describe the end of a spawn. Only a tracker sample
            // at this exact start loop may label the starting composition's value.
            waves.Add(new(seconds, composition, samplesBySeconds.GetValueOrDefault(seconds)?.ArmyValue));
        }
        var units = (deaths?.Units ?? []).Select(p => new ReplayImpactUnit(p.Key, p.Value.Kills, p.Value.Losses))
            .OrderByDescending(u => (long)u.Kills + u.Losses).ThenBy(u => u.Name, StringComparer.Ordinal).ToList();
        bool unitsTruncated = units.Count > MaxUnits;
        if (unitsTruncated)
        {
            var kept = units.Where(u => u.Name != Other).Take(MaxUnits - 1).ToList();
            var names = kept.Select(u => u.Name).ToHashSet(StringComparer.Ordinal);
            var remaining = units.Where(u => !names.Contains(u.Name)).ToList();
            kept.Add(new(Other, remaining.Sum(u => u.Kills), remaining.Sum(u => u.Losses)));
            units = kept;
        }
        var groups = (deaths?.Groups ?? []).Select(pair => new ReplayImpactUnitGroup(pair.Key,
            pair.Value.DirectKills + pair.Value.SummonKills, pair.Value.DirectLosses + pair.Value.SummonLosses,
            pair.Value.DirectKills, pair.Value.SummonKills, pair.Value.DirectLosses, pair.Value.SummonLosses,
            pair.Value.SummonsProduced, pair.Value.Children.OrderBy(name => name, StringComparer.Ordinal).ToList(),
            Breakdown: pair.Value.Breakdown == null ? null : MakeBreakdown(pair.Value.Breakdown), BreakdownTruncated: pair.Value.BreakdownTruncated))
            .OrderByDescending(group => (long)group.Kills + group.Losses).ThenBy(group => group.Name, StringComparer.Ordinal).ToList();
        if (groups.Count > MaxUnits)
        {
            var kept = groups.Where(group => group.Name != Other).Take(MaxUnits - 1).ToList();
            var names = kept.Select(group => group.Name).ToHashSet(StringComparer.Ordinal);
            var rest = groups.Where(group => !names.Contains(group.Name)).ToList();
            kept.Add(new(Other, rest.Sum(group => group.Kills), rest.Sum(group => group.Losses),
                rest.Sum(group => group.DirectKills), rest.Sum(group => group.SummonKills),
                rest.Sum(group => group.DirectLosses), rest.Sum(group => group.SummonLosses),
                rest.Sum(group => group.SummonsProduced), rest.SelectMany(group => group.Children).Distinct(StringComparer.Ordinal).OrderBy(name => name, StringComparer.Ordinal).ToList(),
                Breakdown: new ReplayImpactUnitNode(Other, rest.Sum(group => group.Kills), rest.Sum(group => group.Losses),
                    rest.Sum(group => group.DirectKills), rest.Sum(group => group.DirectLosses), rest.Sum(group => group.SummonsProduced),
                    [new ReplayImpactUnitNode(Other, rest.Sum(group => group.SummonKills), rest.Sum(group => group.SummonLosses),
                        rest.Sum(group => group.SummonKills), rest.Sum(group => group.SummonLosses), 0, [])]),
                BreakdownTruncated: true));
            groups = kept;
        }
        var opponents = (deaths?.Opponents ?? []).OrderBy(p => p.Key, StringComparer.Ordinal)
            .Select(p => new ReplayImpactOpponent(p.Key, p.Value.Kills, p.Value.Losses)).ToList();
        return new(CurrentVersion, Downsample(samples, MaxSamples), Downsample(waves, MaxWaves), units, opponents,
            samples.Count > MaxSamples, wavesTruncated || waves.Count > MaxWaves, unitsTruncated, groups);
    }

    private static ReplayImpactUnitNode MakeBreakdown(CombatStatsExtractor.BreakdownCounts source)
    {
        var children = source.Children.Values.OrderBy(child => child.Name, StringComparer.Ordinal).Select(MakeBreakdown).ToList();
        return new(source.Name, source.DirectKills + children.Sum(child => child.Kills),
            source.DirectLosses + children.Sum(child => child.Losses), source.DirectKills, source.DirectLosses,
            source.SummonsProduced, children);
    }

    private static List<ReplayImpactUnitCount> CapComposition(List<ReplayImpactUnitCount> units)
    {
        var kept = units.Where(u => u.Name != Other).Take(MaxWaveUnits - 1).ToList();
        var names = kept.Select(u => u.Name).ToHashSet(StringComparer.Ordinal);
        kept.Add(new(Other, units.Where(u => !names.Contains(u.Name)).Sum(u => u.Count)));
        return kept;
    }

    // Evenly select actual indices and retain both endpoints. Integer arithmetic
    // gives the same result on every import and never creates duplicate indices.
    internal static List<T> Downsample<T>(List<T> source, int maximum)
    {
        if (source.Count <= maximum) return source;
        return Enumerable.Range(0, maximum).Select(i => source[(int)((long)i * (source.Count - 1) / (maximum - 1))]).ToList();
    }

    internal static string UnitName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 80 || name.Any(char.IsControl)) return "Unknown";
        name = name.Trim();
        // Bound the actual JSON label budget as well as character count: the
        // default encoder can turn one non-ASCII character into six bytes.
        return JsonEncodedText.Encode(name).EncodedUtf8Bytes.Length <= 80 ? name : "Unknown";
    }
    private static double? Nonnegative(int value) => value >= 0 ? value : null;
}
