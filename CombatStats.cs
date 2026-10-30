using System.Reflection;
using Sc2DirectStrike.Parser;
using s2protocol.NET;
using s2protocol.NET.Models;

namespace DirectStrikeCompanion;

public sealed record CombatStats(Dictionary<string, double?> Values, int? LastSampleLoop = null, int UnresolvedDeaths = 0, ReplayImpactDetail? Impact = null, int? ScorePlayerId = null);

public static class CombatStatsExtractor
{
    public const int CurrentVersion = 6;
    // Pinned s2protocol.NET 0.9.6: declared integer properties are the raw stat payload;
    // inherited PlayerId/Gameloop/EventId/Bits/EventType are deliberately excluded.
    // FoodMade/FoodUsed retain protocol fixed-point units (4096 = one supply).
    private static readonly PropertyInfo[] StatFields = typeof(SPlayerStatsEvent)
        .GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
        .Where(p => p.PropertyType == typeof(int)).OrderBy(p => p.Name, StringComparer.Ordinal).ToArray();
    private const double LoopsPerSecond = 22.4;
    internal enum UnitEventKind { Born, Init, OwnerChange, TypeChange, Died }
    internal readonly record struct UnitEvent(int Loop, int Index, int Recycle, UnitEventKind Kind, int Owner = 0, int? Killer = null,
        string? UnitType = null, int? KillerIndex = null, int? KillerRecycle = null,
        int? CreatorIndex = null, int? CreatorRecycle = null, int? Controller = null);
    internal readonly record struct ActualPlayer(string Id, int Team);
    internal sealed class DeathCounts
    {
        internal int Kills;
        internal int CombatDeaths;
        internal int UnattributedDeaths;
        internal Dictionary<string, ImpactCounts> Units = new(StringComparer.Ordinal);
        internal Dictionary<string, ImpactCounts> Opponents = new(StringComparer.Ordinal);
        internal Dictionary<string, GroupCounts> Groups = new(StringComparer.Ordinal);
    }
    internal sealed class ImpactCounts { internal int Kills; internal int Losses; }
    internal sealed class GroupCounts
    {
        internal int DirectKills, SummonKills, DirectLosses, SummonLosses, SummonsProduced;
        internal HashSet<string> Children = new(StringComparer.Ordinal);
        internal BreakdownCounts? Breakdown;
        internal int BreakdownNodeCount;
        internal bool BreakdownTruncated;
    }
    internal sealed class BreakdownCounts(string name)
    {
        internal string Name = name;
        internal int DirectKills, DirectLosses, SummonsProduced;
        internal Dictionary<string, BreakdownCounts> Children = new(StringComparer.Ordinal);
    }
    private sealed class UnitLineage
    {
        internal int Owner;
        internal string Name = "Unknown";
        internal (int Index, int Recycle)? Parent;
        internal bool OwnerChanged, InvalidCreator;
    }
    private static bool ExcludedCreator(string name) => name is "Unknown" or "SCV" or "Probe" or "Drone" or "MULE" ||
        name.StartsWith("Worker", StringComparison.Ordinal) || name.StartsWith("SCV", StringComparison.Ordinal) ||
        name.StartsWith("Dummy", StringComparison.Ordinal) || name.EndsWith("Dummy", StringComparison.Ordinal) ||
        name.StartsWith("StagingAreaFootprint", StringComparison.Ordinal) ||
        name.Contains("Placeholder", StringComparison.Ordinal) || name.Contains("Cocoon", StringComparison.Ordinal) ||
        name.Contains("Egg", StringComparison.Ordinal) || name.Contains("Wreckage", StringComparison.Ordinal) ||
        name.Contains("Construction", StringComparison.Ordinal) || name is "Larva" or "DroneBurrowed" or "DroneFull" ||
        name is "DroneStetmann" or "DehakaDrone" or "TrooperMengsk" or "TrooperMengskImproved" or "TrooperMengskFlamethrower" or "TrooperMengskAA";

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
            result.Add(id, new(values, sample?.Gameloop, deaths?.UnresolvedDeaths ?? 0, impact, trackerId));
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
        foreach (var e in tracker.SUnitBornEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.Born, e.UpkeepPlayerId, UnitType: e.UnitTypeName, CreatorIndex: e.CreatorUnitTagIndex, CreatorRecycle: e.CreatorUnitTagRecycle, Controller: e.ControlPlayerId);
        foreach (var e in tracker.SUnitInitEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.Init, e.UpkeepPlayerId, UnitType: e.UnitTypeName, Controller: e.ControlPlayerId);
        foreach (var e in tracker.SUnitOwnerChangeEvents) yield return new(e.Gameloop, e.UnitTagIndex, e.UnitTagRecycle, UnitEventKind.OwnerChange, e.UpkeepPlayerId, Controller: e.ControlPlayerId);
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
        var controllers = new Dictionary<(int Index, int Recycle), int>();
        var types = new Dictionary<(int Index, int Recycle), string>();
        var died = new HashSet<(int Index, int Recycle)>();
        int unresolved = 0;
        var lineage = new Dictionary<(int Index, int Recycle), UnitLineage>();
        var contributions = new List<(string Player, string Name, (int Index, int Recycle)? Tag, bool Kill)>();
        // The model separates event collections. At a tied loop establish births,
        // then ownership changes, then deaths; later-loop changes never affect deaths.
        foreach (var e in events.OrderBy(e => e.Loop).ThenBy(e => e.Kind == UnitEventKind.Died ? 3 : e.Kind == UnitEventKind.TypeChange ? 2 : e.Kind == UnitEventKind.OwnerChange ? 1 : 0))
        {
            if (e.Loop < 0) continue;
            var tag = (e.Index, e.Recycle);
            if (e.Kind != UnitEventKind.Died)
            {
                if (died.Contains(tag)) continue;
                if (e.Kind is UnitEventKind.Born or UnitEventKind.Init)
                {
                    if (!lineage.TryGetValue(tag, out var node)) lineage[tag] = node = new UnitLineage { Owner = e.Owner, Name = ReplayImpactExtractor.UnitName(e.UnitType) };
                    else if (node.Owner != e.Owner) node.OwnerChanged = true;
                    if (node.Name == "Unknown") node.Name = ReplayImpactExtractor.UnitName(e.UnitType);
                    if (e.Kind == UnitEventKind.Born && e.CreatorIndex.HasValue && e.CreatorRecycle.HasValue)
                    {
                        var parentTag = (e.CreatorIndex.Value, e.CreatorRecycle.Value);
                        if (parentTag != tag && lineage.TryGetValue(parentTag, out var parent) && parent.Owner == node.Owner && actual.ContainsKey(node.Owner))
                        {
                            if (node.Parent.HasValue && node.Parent.Value != parentTag) node.InvalidCreator = true;
                            else node.Parent = parentTag;
                        }
                        else node.InvalidCreator = true;
                    }
                }
                else if (e.Kind == UnitEventKind.OwnerChange && lineage.TryGetValue(tag, out var changed) && changed.Owner != e.Owner) changed.OwnerChanged = true;
                if (e.Kind is UnitEventKind.Born or UnitEventKind.Init or UnitEventKind.OwnerChange)
                {
                    if (e.Controller.HasValue) controllers[tag] = e.Controller.Value;
                    else controllers.Remove(tag);
                }
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
            // Pickup removals are tracker deaths too, but not combat kills/losses.
            if (types.GetValueOrDefault(tag) == "BiomassItem") continue;
            if (!owners.TryGetValue(tag, out int owner) || !actual.TryGetValue(owner, out var victim)) { unresolved++; continue; }
            if (!e.Killer.HasValue || !actual.TryGetValue(e.Killer.Value, out var killer)) { counts[victim.Id].UnattributedDeaths++; continue; }
            if (killer.Id == victim.Id) continue;
            if (victim.Team is not (1 or 2) || killer.Team is not (1 or 2)) { counts[victim.Id].UnattributedDeaths++; unresolved++; continue; }
            if (killer.Team == victim.Team) continue;
            counts[killer.Id].Kills++;
            counts[victim.Id].CombatDeaths++;
            // The death names the credited human and exact source tag. A controlled
            // enemy can retain its original upkeep owner (e.g. a dominated Archon).
            // Accept its recorded controller too; never use controller IDs to infer
            // victim ownership, teams, a summoner, or the controlling ability.
            string killerType = "Unknown";
            (int Index, int Recycle)? validKillerTag = null;
            if (e.KillerIndex.HasValue && e.KillerRecycle.HasValue)
            {
                var killerTag = (e.KillerIndex.Value, e.KillerRecycle.Value);
                if ((owners.TryGetValue(killerTag, out int killerOwner) && killerOwner == e.Killer.Value) ||
                    (controllers.TryGetValue(killerTag, out int controller) && controller == e.Killer.Value))
                {
                    killerType = types.GetValueOrDefault(killerTag, "Unknown");
                    validKillerTag = killerTag;
                }
            }
            Add(counts[killer.Id].Units, killerType, true);
            Add(counts[victim.Id].Units, types.GetValueOrDefault(tag, "Unknown"), false);
            contributions.Add((killer.Id, killerType, validKillerTag, true));
            contributions.Add((victim.Id, types.GetValueOrDefault(tag, "Unknown"), tag, false));
            Add(counts[killer.Id].Opponents, victim.Id, true);
            Add(counts[victim.Id].Opponents, killer.Id, false);
        }
        // Resolve stable same-owner creator chains. A dead creator remains in the
        // lineage for on-death spawns; workers and staging units are excluded.
        (string Name, bool Summon, (int Index, int Recycle)? Root, List<string> Path) Group((int Index, int Recycle)? tag, string player, string fallback)
        {
            if (!tag.HasValue || !lineage.TryGetValue(tag.Value, out var child) || child.OwnerChanged ||
                !actual.TryGetValue(child.Owner, out var owner) || owner.Id != player) return (fallback, false, tag, [fallback]);
            var seen = new HashSet<(int, int)> { tag.Value };
            var current = child;
            var rootTag = tag.Value;
            var path = new List<string> { child.Name };
            if (ExcludedCreator(child.Name)) return (fallback, false, tag, [fallback]);
            bool linked = false;
            while (true)
            {
                if (current.OwnerChanged || current.InvalidCreator) return (fallback, false, tag, [fallback]);
                if (current.Parent is not { } parentTag) break;
                if (!seen.Add(parentTag) || !lineage.TryGetValue(parentTag, out var parent) ||
                    parent.OwnerChanged || parent.Owner != child.Owner) return (fallback, false, tag, [fallback]);
                // A placed combat unit is a root, not a summon of its worker.
                if (ExcludedCreator(parent.Name)) break;
                current = parent;
                rootTag = parentTag;
                path.Add(parent.Name);
                linked = true;
            }
            path.Reverse();
            return linked ? (current.Name, true, rootTag, path) : (fallback, false, tag, [fallback]);
        }
        // Bound nested output; explicit Other leaves retain all contribution
        // when the exact type path exceeds depth or node limits.
        List<BreakdownCounts> Nodes(GroupCounts group, string rootName, List<string> path)
        {
            group.Breakdown ??= new BreakdownCounts(rootName);
            if (group.BreakdownNodeCount == 0) group.BreakdownNodeCount = 1;
            var nodes = new List<BreakdownCounts> { group.Breakdown };
            var current = group.Breakdown;
            for (int index = 1; index < path.Count; index++)
            {
                string name = path[index];
                bool overflow = index >= 8 || (!current.Children.ContainsKey(name) && group.BreakdownNodeCount >= 128);
                if (overflow) { name = "Other"; group.BreakdownTruncated = true; }
                if (!current.Children.TryGetValue(name, out var next))
                {
                    next = new BreakdownCounts(name);
                    current.Children[name] = next;
                    group.BreakdownNodeCount++;
                }
                nodes.Add(next);
                current = next;
                if (overflow) break;
            }
            return nodes;
        }
        var familyRoots = new HashSet<(int Index, int Recycle)>();
        foreach (var (tag, node) in lineage)
        {
            if (!actual.TryGetValue(node.Owner, out var owner)) continue;
            var family = Group(tag, owner.Id, node.Name);
            if (family.Summon && family.Root.HasValue) familyRoots.Add(family.Root.Value);
        }
        foreach (var item in contributions)
        {
            var group = Group(item.Tag, item.Player, item.Name);
            if (!group.Summon && item.Tag.HasValue && familyRoots.Contains(item.Tag.Value) && lineage.TryGetValue(item.Tag.Value, out var root))
                group = (root.Name, false, item.Tag, [root.Name]);
            if (!counts[item.Player].Groups.TryGetValue(group.Name, out var value)) counts[item.Player].Groups[group.Name] = value = new();
            if (item.Kill) { if (group.Summon) value.SummonKills++; else value.DirectKills++; }
            else { if (group.Summon) value.SummonLosses++; else value.DirectLosses++; }
            if (group.Summon && item.Name != group.Name) value.Children.Add(item.Name);
            var node = Nodes(value, group.Name, group.Path)[^1];
            if (item.Kill) node.DirectKills++; else node.DirectLosses++;
        }
        foreach (var (tag, node) in lineage)
        {
            if (!actual.TryGetValue(node.Owner, out var owner)) continue;
            var group = Group(tag, owner.Id, node.Name);
            if (!group.Summon) continue;
            if (!counts[owner.Id].Groups.TryGetValue(group.Name, out var value)) counts[owner.Id].Groups[group.Name] = value = new();
            value.SummonsProduced++;
            if (node.Name != group.Name) value.Children.Add(node.Name);
            var nodes = Nodes(value, group.Name, group.Path);
            for (int index = 0; index < nodes.Count - 1; index++) nodes[index].SummonsProduced++;
            if (nodes.Count < group.Path.Count) nodes[^1].SummonsProduced++;
        }
        return new(counts, unresolved);
    }

    private static void Add(Dictionary<string, ImpactCounts> counts, string key, bool kill)
    {
        if (!counts.TryGetValue(key, out var value)) counts[key] = value = new();
        if (kill) value.Kills++; else value.Losses++;
    }
}
