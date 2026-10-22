using Sc2DirectStrike.Parser;

namespace DirectStrikeCompanion;

public sealed record MiddleInterval(int Team, double StartSeconds, double EndSeconds);
public sealed record PlayerEconomy(string Id, double? ActiveSeconds, List<double>? GasTimes, double? MiddleHeldSeconds, double? EstimatedMiddleMinerals);
public sealed record MatchEconomy(int Version, bool MiddleAvailable, string Status, List<MiddleInterval> MiddleIntervals, double? MiddleIncomeRate, List<PlayerEconomy> Players);

public static class MatchEconomyExtractor
{
    public const int CurrentVersion = 1;
    // Sc2DirectStrike.IncomeSample models middle income at one mineral per second.
    // This is an estimate, not a separately measured replay resource counter.
    private const double EstimatedMiddleIncomeRate = 1;

    public static MatchEconomy Extract(DirectStrikeReplay replay)
    {
        ArgumentNullException.ThrowIfNull(replay);
        var duration = replay.Duration.TotalSeconds;
        var validDuration = double.IsFinite(duration) && duration > 0;
        var changes = (replay.MiddleChanges ?? []).Select(t => t.TotalSeconds)
            .Where(t => double.IsFinite(t) && t >= 0 && validDuration && t <= duration).Order().ToList();
        bool available = validDuration && replay.FirstMiddleControlTeam is 1 or 2 && changes.Count > 0;
        var intervals = new List<MiddleInterval>();
        if (available)
        {
            int team = replay.FirstMiddleControlTeam;
            for (int i = 0; i < changes.Count; i++)
            {
                double start = changes[i], end = i + 1 < changes.Count ? changes[i + 1] : duration;
                if (end > start) intervals.Add(new(team, start, end));
                // Every capture flips control, including repeated timestamps.
                // Removing tied changes would change the owner of the next interval.
                team = team == 1 ? 2 : 1;
            }
        }
        var players = replay.Players.GroupBy(Identity).Select(group =>
        {
            var player = group.First();
            bool unique = group.Count() == 1;
            double playerDuration = player.Duration.TotalSeconds;
            double? active = unique && validDuration && double.IsFinite(playerDuration) && playerDuration > 0 ? Math.Min(duration, playerDuration) : null;
            var gas = (unique ? player.RefineryTimes ?? [] : []).Select(t => t.TotalSeconds)
                .Where(t => double.IsFinite(t) && t > 0 && (!validDuration || t <= duration)).Order().ToList();
            bool routed = unique && player.Region > 0 && player.Realm > 0 && player.Id > 0 && player.TeamId is 1 or 2;
            double? held = available && active.HasValue && routed
                ? intervals.Where(i => i.Team == player.TeamId).Sum(i => Math.Max(0, Math.Min(i.EndSeconds, active.Value) - i.StartSeconds)) : null;
            return new PlayerEconomy(group.Key, active, routed && validDuration ? gas : null, held, held * EstimatedMiddleIncomeRate);
        }).ToList();
        return new(CurrentVersion, available,
            available ? "Middle income is an estimate at 1 mineral/sec while the player is active; time before first capture is neutral."
                : "Middle control unavailable: valid replay duration, first team and capture timeline are required.",
            intervals, available ? EstimatedMiddleIncomeRate : null, players);
    }
    private static string Identity(DirectStrikePlayer player) => $"{player.Region}-S2-{player.Realm}-{player.Id}";
}
