using System.Collections;
using System.Reflection;
using System.Text.Json;
using Sc2DirectStrike.Parser;
using s2protocol.NET;

namespace DirectStrikeCompanion;

internal static class ReplayDiagnostics
{
    public static void RunClans(string[] args)
    {
        var output = Path.Combine(Program.ProjectRoot(), "verification", "replay-clan-probe.json");
        try
        {
            var index = Array.IndexOf(args, "--probe-clans");
            var path = args.ElementAtOrDefault(index + 1) ?? throw new ArgumentException("A replay path is required.");
            var replay = new ReplayDecoder().DecodeAsync(path, ReplayService.MetadataOptions()).GetAwaiter().GetResult()
                ?? throw new InvalidDataException("Replay could not be decoded.");
            var ids = (replay.Details?.Players ?? []).Where(p => p.Toon != null)
                .Select(p => $"{p.Toon.Region}-S2-{p.Toon.Realm}-{p.Toon.Id}").ToArray();
            File.WriteAllText(output, JsonSerializer.Serialize(new
            {
                success = true, replay = Path.GetFileName(path),
                decoded = new[] { "Details", "Initdata" }, trackerEvents = false, gameEvents = false,
                protocol = new
                {
                    detailProgramIds = (replay.Details?.Players ?? []).Where(p => p.Toon != null).Select(p => p.Toon.ProgramId).Distinct(),
                    detailClanValues = (replay.Details?.Players ?? []).Count(p => p.ClanName != null),
                    initialHandles = (replay.Initdata?.UserInitialData ?? []).Count(p => !string.IsNullOrWhiteSpace(p.ToonHandle)),
                    initialClanValues = (replay.Initdata?.UserInitialData ?? []).Count(p => p.ClanTag != null)
                },
                players = ReplayClanTags.Extract(replay, ids)
            }, Store.Json));
        }
        catch (Exception ex)
        {
            File.WriteAllText(output, JsonSerializer.Serialize(new { success = false, error = ex.ToString() }, Store.Json));
            Environment.ExitCode = 1;
        }
    }

    public static void Run(string[] args)
    {
        var output = Path.Combine(Program.ProjectRoot(), "verification", "replay-economy-probe.json");
        try
        {
            var index = Array.IndexOf(args, "--probe-replay");
            var path = args.ElementAtOrDefault(index + 1) ?? throw new ArgumentException("A replay path is required.");
            var replay = new ReplayDecoder().DecodeAsync(path, new ReplayDecoderOptions { Details = true, Initdata = true, Metadata = true, TrackerEvents = true, GameEvents = true }).GetAwaiter().GetResult() ?? throw new InvalidDataException("Replay could not be decoded.");
            var parsed = Sc2DirectStrikeParser.Parse(replay);
            var tracker = replay.TrackerEvents;
            static bool IsCollection(PropertyInfo property) => property.PropertyType != typeof(string) && typeof(IEnumerable).IsAssignableFrom(property.PropertyType);
            object Counts(object? events) => events?.GetType().GetProperties().Where(IsCollection).ToDictionary(p => p.Name, p => ((IEnumerable?)p.GetValue(events))?.Cast<object>().Count() ?? 0) ?? [];
            object EventSamples(object? events) => events?.GetType().GetProperties().Where(IsCollection).ToDictionary(p => p.Name, p => ((IEnumerable?)p.GetValue(events))?.Cast<object>().Take(2).Select(Scalars).ToList() ?? []) ?? [];
            File.WriteAllText(output, JsonSerializer.Serialize(new
            {
                success = true,
                mode = parsed.GameMode.ToString(),
                rawEconomy = new { durationSeconds = parsed.Duration.TotalSeconds, parsed.FirstMiddleControlTeam, middleChangesSeconds = parsed.MiddleChanges.Select(t => t.TotalSeconds), players = parsed.Players.Select(p => new { id = $"{p.Region}-S2-{p.Realm}-{p.Id}", p.TeamId, activeSeconds = p.Duration.TotalSeconds, gasSeconds = p.RefineryTimes.Select(t => t.TotalSeconds) }) },
                economy = MatchEconomyExtractor.Extract(parsed),
                combat = CombatStatsExtractor.Extract(replay, parsed),
                parsedPlayerFields = parsed.Players.FirstOrDefault()?.GetType().GetProperties().Select(p => new { p.Name, type = p.PropertyType.Name }),
                players = parsed.Players.Select(p => new { fields = Scalars(p), lastStats = Scalars(p.Stats.LastOrDefault()), statsSamples = p.Stats.Count() }),
                trackerCounts = Counts(tracker),
                gameCounts = Counts(replay.GameEvents),
                trackerSamples = EventSamples(tracker),
                gameSamples = EventSamples(replay.GameEvents),
                unitTypes = tracker?.SUnitBornEvents.GroupBy(e => e.UnitTypeName).OrderByDescending(g => g.Count()).Take(20).Select(g => new { type = g.Key, count = g.Count() }),
                ownerCounts = tracker?.SUnitBornEvents.GroupBy(e => new { e.ControlPlayerId, e.UpkeepPlayerId }).Select(g => new { g.Key, count = g.Count() }),
                killerCounts = tracker?.SUnitDiedEvents.GroupBy(e => e.KillerPlayerId).Select(g => new { playerId = g.Key, count = g.Count() }),
                ownershipChanges = tracker?.SUnitOwnerChangeEvents.GroupBy(e => new { e.ControlPlayerId, e.UpkeepPlayerId }).Select(g => new { g.Key, count = g.Count() })
            }, Store.Json));
        }
        catch (Exception ex) { File.WriteAllText(output, JsonSerializer.Serialize(new { success = false, error = ex.ToString() }, Store.Json)); Environment.ExitCode = 1; }
    }

    private static Dictionary<string, object?> Scalars(object? value) => value == null ? [] : value.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Where(p => p.CanRead && p.GetIndexParameters().Length == 0)
        .Where(p => { var t = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType; return t.IsPrimitive || t.IsEnum || t == typeof(string) || t == typeof(DateTime); })
        .ToDictionary(p => p.Name, p => p.GetValue(value));
}
