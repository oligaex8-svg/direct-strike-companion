using System.Reflection;
using Sc2DirectStrike.Parser;
using s2protocol.NET;
using s2protocol.NET.Models;

namespace DirectStrikeCompanion;

public sealed record CombatStats(Dictionary<string, double?> Values, int? LastSampleLoop = null, int UnresolvedDeaths = 0, ReplayImpactDetail? Impact = null);

public static class CombatStatsExtractor
{
    public const int CurrentVersion = 2;
    // Pinned s2protocol.NET 0.9.6: declared integer properties are the raw stat payload;
    // inherited PlayerId/Gameloop/EventId/Bits/EventType are deliberately excluded.
    // FoodMade/FoodUsed retain protocol fixed-point units (4096 = one supply).
    private static readonly PropertyInfo[] StatFields = typeof(SPlayerStatsEvent)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
        .Where(p => p.PropertyType == typeof(int)).OrderBy(p => p.Name, StringComparer.Ordinal).ToArray();
    private const double LoopsPerSecond = 22.4;
    internal enum UnitEventKind { Born, Init, OwnerChange, TypeChange, Died }
    internal readonly record struct UnitEvent(int Loop, int Index, int Recycle, UnitEventKind Kind, int Owner = 0, int? Killer = null,
        string? UnitType = null, int? KillerIndex = null, int? KillerRecycle = null);
    internal readonly record struct ActualPlayer(string Id, int Team);
    internal sealed class DeathCounts
    {
        internal int Kills;
        internal int CombatDeaths;
        internal int UnattributedDeaths;
        internal Dictionary<string, ImpactCounts> Units = new(StringComparer.Ordinal);
        internal Dictionary<string, ImpactCounts> Opponents = new(StringComparer.Ordinal);
    }
    internal sealed class ImpactCounts { internal int Kills; internal int Losses; }
    internal sealed record DeathSummary(Dictionary<string, DeathCounts> Players, int UnresolvedDeaths);

    public static IReadOnlyDictionary<string, CombatStats> Extract(Sc2Replay replay, DirectStrikeReplay parsed)
    {
        ArgumentNullException.ThrowIfNull(replay);
        ArgumentNullException.ThrowIfNull(parsed);
        var players = parsed.Players.GroupBy(Identity).Where(g => g.Count() == 1).Select(g => g.Single()).ToList();
        var tracker = replay.TrackerEvents;
        var mapping = MapPlayers(replay, players);
        bool eligible = players.Count == 6 && players.Count(p => p.TeamId == 1) == 3 && players.Count(p => p.TeamId == 2) == 3;
        var actual = eligible ? mapping.ToDictionary(p => p.Key, p => new ActualPlayer(Identity(p.Value), p.Value.TeamId)) : [];
        var deaths = tracker == null ? null : ReduceDeaths(UnitEvents(tracker), actual);
        var stats = (tracker?.SPlayerStatsEvents ?? []).Where(s => s.Gameloop >= 0).GroupBy(s => s.PlayerId)
            .ToDictionary(g => g.Key, g => g.OrderBy(s => s.Gameloop).Last());
        var result = new Dictionary<string, CombatStats>(StringComparer.Ordinal);
        foreach (var player in players)
        {
            string id = Identity(player);
            int? trackerId = mapping.Where(p => Identity(p.Value) == id).Select(p => (int?)p.Key).SingleOrDefault();
            SPlayerStatsEvent? sample = trackerId.HasValue ? stats.GetValueOrDefault(trackerId.Value) : null;
            var values = StatFields.ToDictionary(p => p.Name, p => sample == null ? (double?)null : Convert.ToDouble(p.GetValue(sample)), StringComparer.Ordinal);
            values["ScanCount"] = player.ScanCount is >= 0 ? player.ScanCount.Value : null;
            values["SpawnWaves"] = player.Spawns.Count > 0 ? player.Spawns.Count : null;
            values["FirstGasSeconds"] = Timing(player.RefineryTimes, 0);
            values["SecondGasSeconds"] = Timing(player.RefineryTimes, 1);
            values["ThirdGasSeconds"] = Timing(player.RefineryTimes, 2);
            foreach (string tier in new[] { "Tier2", "Tier3" })
            {
                var upgrade = trackerId.HasValue ? (tracker?.SUpgradeEvents ?? []).Where(e => e.PlayerId == trackerId.Value && e.UpgradeTypeName == tier && e.Gameloop > 0).OrderBy(e => e.Gameloop).FirstOrDefault() : null;
                values[tier + "Seconds"] = upgrade == null ? null : upgrade.Gameloop / LoopsPerSecond;
            }
            DeathCounts? counts = deaths?.Players.GetValueOrDefault(id);
            values["UnitKills"] = counts?.Kills;
            values["CombatDeaths"] = counts?.CombatDeaths;
            values["UnattributedDeaths"] = counts?.UnattributedDeaths;
            values["DamageDealt"] = null;
            values["DamageTaken"] = null;
            var impact = eligible && tracker != null && trackerId.HasValue
                ? ReplayImpactExtractor.Extract(tracker.SPlayerStatsEvents.Where(s => s.PlayerId == trackerId.Value), player.Spawns, counts)
                : null;
            result.Add(id, new(values, sample?.Gameloop, deaths?.UnresolvedDeaths ?? 0, impact));
        }
        return result;
    }

    private static string Identity(DirectStrikePlayer player) => $"{player.Region}-S2-{player.Realm}-{player.Id}";
    private static double? Timing(TimeSpan[] times, int index) => index < times.Length && times[index] > TimeSpan.Zero && double.IsFinite(times[index].TotalSeconds) ? times[index].TotalSeconds : null;

    // SPlayerSetupEvent maps tracker IDs. Resolve toon handles first, then explicit
    // WorkingSetSlotId. Never infer a tracker ID from array position or GamePos.
    // Mapping disagreements and duplicate tracker/identity joins remain unavailable.
    private static Dictionary<int, DirectStrikePlayer> MapPlayers(Sc2Replay replay, List<DirectStrikePlayer> players)
    {
        var proposals = new List<(int TrackerId, DirectStrikePlayer Player)>();
        foreach (var setup in replay.TrackerEvents?.SPlayerSetupEvents ?? [])
        {
            if (setup.PlayerId <= 0) continue;
            var toonCandidates = setup.UserId.HasValue
                ? (replay.Initdata?.LobbyState?.Slots ?? []).Where(s => s.UserId == setup.UserId).Select(s => s.ToonHandle).Where(s => !string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.Ordinal).ToList()
                : [];
            var candidates = toonCandidates.Count > 0 ? players.Where(p => toonCandidates.Contains(Identity(p), StringComparer.Ordinal)).ToList() : players.Where(p => p.SlotId == setup.SlotId).ToList();
            if (candidates.Count == 1) proposals.Add((setup.PlayerId, candidates[0]));
        }
        var byTracker = proposals.GroupBy(p => p.TrackerId).Where(g => g.Select(p => Identity(p.Player)).Distinct(StringComparer.Ordinal).Count() == 1).Select(g => g.First()).ToList();
        var uniqueIdentities = byTracker.GroupBy(p => Identity(p.Player)).Where(g => g.Count() == 1).Select(g => g.Single()).ToList();
        return uniqueIdentities.ToDictionary(p => p.TrackerId, p => p.Player);
    }

    private static IEnumerable<UnitEvent> UnitEvents(TrackerEvents tracker)
    {
        foreach (var e in tracker.SUnitBornEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.Born, e.UpkeepPlayerId, UnitType: e.UnitTypeName);
        foreach (var e in tracker.SUnitInitEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.Init, e.UpkeepPlayerId, UnitType: e.UnitTypeName);
        foreach (var e in tracker.SUnitOwnerChangeEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.OwnerChange, e.UpkeepPlayerId);
        foreach (var e in tracker.SUnitTypeChangeEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.TypeChange, UnitType: e.UnitTypeName);
        foreach (var e in tracker.SUnitDiedEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.Died, Killer: e.KillerPlayerId,
            KillerIndex: e.KillerUnitTagIndex, KillerRecycle: e.KillerUnitTagRecycle);
    }

    // Unit ownership follows upkeep, as in sc2reader's tracker context reducer:
    // https://github.com/ggtracker/sc2reader/blob/upstream/sc2reader/engine/plugins/context.py
    // NPC/controller IDs do not establish human ownership or team membership.
    internal static DeathSummary ReduceDeaths(IEnumerable<UnitEvent> events, IReadOnlyDictionary<int, ActualPlayer> actual)
    {
        var counts = actual.Values.Select(p => p.Id).Distinct(StringComparer.Ordinal).ToDictionary(id => id, _ => new DeathCounts(), StringComparer.Ordinal);
        var owners = new Dictionary<(int Index, int Recycle), int>();
        var types = new Dictionary<(int Index, int Recycle), string>();
        var died = new HashSet<(int Index, int Recycle)>();
        int unresolved = 0;
        // The model separates event collections. At a tied loop establish births,
        // then ownership changes, then deaths; later-loop changes never affect deaths.
        foreach (var e in events.OrderBy(e => e.Loop).ThenBy(e => e.Kind == UnitEventKind.Died ? 3 : e.Kind == UnitEventKind.TypeChange ? 2 : e.Kind == UnitEventKind.OwnerChange ? 1 : 0))
        {
            if (e.Loop < 0) continue;
            var tag = (e.Index, e.Recycle);
            if (e.Kind != UnitEventKind.Died)
            {
                if (died.Contains(tag)) continue;
                if (e.Kind == UnitEventKind.OwnerChange) owners[tag] = e.Owner;
                else if (e.Kind != UnitEventKind.TypeChange) owners.TryAdd(tag, e.Owner); // Init+Born of one tag is one unit.
                if (e.Kind == UnitEventKind.TypeChange) types[tag] = ReplayImpactExtractor.UnitName(e.UnitType);
                else if (e.Kind is UnitEventKind.Born or UnitEventKind.Init)
                {
                    string name = ReplayImpactExtractor.UnitName(e.UnitType);
                    if (!types.TryGetValue(tag, out var previous) || previous == "Unknown") types[tag] = name;
                }
                continue;
            }
            if (!died.Add(tag)) continue;
            if (!owners.TryGetValue(tag, out int owner) || !actual.TryGetValue(owner, out var victim)) { unresolved++; continue; }
            if (!e.Killer.HasValue || !actual.TryGetValue(e.Killer.Value, out var killer)) { counts[victim.Id].UnattributedDeaths++; continue; }
            if (killer.Id == victim.Id) continue;
            if (victim.Team is not (1 or 2) || killer.Team is not (1 or 2)) { counts[victim.Id].UnattributedDeaths++; unresolved++; continue; }
            if (killer.Team == victim.Team) continue;
            counts[killer.Id].Kills++;
            counts[victim.Id].CombatDeaths++;
            // A killer player ID proves the last hit, but only the exact tag and
            // ownership join proves which of that player's units made it.
            string killerType = "Unknown";
            if (e.KillerIndex.HasValue && e.KillerRecycle.HasValue)
            {
                var killerTag = (e.KillerIndex.Value, e.KillerRecycle.Value);
                if (owners.TryGetValue(killerTag, out int killerOwner) && killerOwner == e.Killer.Value)
                    killerType = types.GetValueOrDefault(killerTag, "Unknown");
            }
            Add(counts[killer.Id].Units, killerType, true);
            Add(counts[victim.Id].Units, types.GetValueOrDefault(tag, "Unknown"), false);
            Add(counts[killer.Id].Opponents, victim.Id, true);
            Add(counts[victim.Id].Opponents, killer.Id, false);
        }
        return new(counts, unresolved);
    }

    private static void Add(Dictionary<string, ImpactCounts> counts, string key, bool kill)
    {
        if (!counts.TryGetValue(key, out var value)) counts[key] = value = new();
        if (kill) value.Kills++; else value.Losses++;
    }
}
