namespace DirectStrikeCompanion;

// Games is the number of completed commanders_3v3 games before this estimate.
public sealed record RatingBasis(double? Value, int? Games);
public sealed record RatingChange(string PlayerId, double? Delta, string Kind, string Detail, string? SiteGameId = null, string Scope = "commanders_3v3");

public static class RatingChangeEstimator
{
    private const string BasisDetail = "Estimated from latest/current cached commanders_3v3 ratings, not historical pregame ratings. Forfeit status_timing is unavailable; assumes no forfeit clipping. Replay Win/Loss statuses cannot reliably identify leaving.";
    private static readonly HashSet<string> Commanders = new(StringComparer.Ordinal)
    {
        "Raynor", "Kerrigan", "Artanis", "Swann", "Zagara", "Vorazun", "Karax", "Abathur", "Alarak",
        "Nova", "Stukov", "Fenix", "Dehaka", "Horner", "Tychus", "Zeratul", "Stetmann", "Mengsk"
    };

    // Numerical rules follow verification/ds-main_current.php via ds-commanders_3v3.php.
    // Each team preserves replay player order; replay team IDs are normalized to site indices 0/1.
    public static IReadOnlyList<RatingChange> Estimate(Match match, IReadOnlyDictionary<string, RatingBasis> ratings, string scope = "commanders_3v3")
    {
        IReadOnlyList<RatingChange> Unavailable(string reason) => match.Players
            .Select(p => new RatingChange(p.Id, null, "unavailable", reason, Scope: scope)).ToArray();

        if (!Store.IsEligible(match)) return Unavailable("Requires a regular 3v3 Commanders replay.");
        if (match.Players.Any(p => string.IsNullOrWhiteSpace(p.Id)) || match.Players.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != 6)
            return Unavailable("Requires six distinct replay player identities.");

        var teams = match.Players.GroupBy(p => p.Team).Select(g => g.ToArray()).ToArray();
        int winner = Array.FindIndex(teams, team => team[0].Team == match.Winner);
        if (winner < 0) return Unavailable("Replay winner team is unknown or invalid; no outcome is assumed.");

        var basis = match.Players.ToDictionary(p => p.Id, p => ratings.TryGetValue(p.Id, out var value) ? value : new RatingBasis(null, null), StringComparer.Ordinal);
        if (basis.Values.Any(b => !b.Value.HasValue))
            return Unavailable("Needs ratings for all six players in the same rating scope; missing players are not assigned 2000.");
        if (basis.Values.Any(b => b.Value.HasValue && !double.IsFinite(b.Value.Value)))
            return Unavailable("A cached rating is not finite; team strength cannot be estimated.");
        var original = basis.ToDictionary(p => p.Key, p => p.Value.Value!.Value, StringComparer.Ordinal);
        var expanded = original.ToDictionary(p => p.Key, p => Uncompress(p.Value), StringComparer.Ordinal);
        var strengths = teams.Select(team => team.Max(p => expanded[p.Id])).ToArray();
        double difference = strengths[0] - strengths[1];
        double lowerReward = Math.Floor(100 / (1 + Math.Pow(10, Math.Abs(difference) / 4000)));
        double firstReward = difference < 0 ? 100 - lowerReward : lowerReward;
        double[] rewards = [firstReward, 100 - firstReward, firstReward];
        bool knownCommanders = match.Players.All(p => Commanders.Contains(p.Commander));
        bool mirror = knownCommanders && teams[0].Select(p => p.Commander).SequenceEqual(teams[1].Select(p => p.Commander), StringComparer.Ordinal);
        double mirrorMultiplier = mirror ? 2 : 1;
        string detail = BasisDetail.Replace("commanders_3v3", scope, StringComparison.Ordinal);
        if (mirror) detail += " Exact commander order mirror: x2.";
        if (!knownCommanders) detail += " Unknown commander prevents mirror verification; assumes x1.";

        return match.Players.Select(player =>
        {
            if (player.Result is not ("Win" or "Loss"))
                return new RatingChange(player.Id, null, "unavailable", "Replay player status is unknown; no Win/Loss status is assumed. " + detail);
            if (player.Result == "Win" && player.Team != match.Winner)
                return new RatingChange(player.Id, null, "unavailable", "Player Win status contradicts the replay winner team. " + detail);
            var count = basis[player.Id].Games;
            if (count < 0)
                return new RatingChange(player.Id, null, "unavailable", "Mode-games count is invalid. " + detail);
            double gamesMultiplier = count is >= 0 and < 25 ? 10.36 - 0.36 * (count.Value + 1) : 1;
            string playerDetail = detail + (count.HasValue
                ? $" Uses {count.Value} completed mode games before the estimate."
                : " Mode-games count is unknown; assumes an established player (x1).");
            double reward = rewards[winner];
            if (player.Team == match.Winner && player.Result != "Win") reward = rewards[winner + 1];
            double statusMultiplier = player.Result == "Win" ? 1 : -1;
            double change = reward * mirrorMultiplier * gamesMultiplier * statusMultiplier;
            double rating = expanded[player.Id];
            if (rating + change < 10000)
                change = Math.Ceiling(reward * mirrorMultiplier * gamesMultiplier / 10) * 10 * statusMultiplier;
            double updated = Math.Max(10, rating + Math.Truncate(change));
            return new RatingChange(player.Id, Compress(updated) - original[player.Id], "estimated", playerDetail, Scope: scope);
        }).ToArray();
    }

    internal static RatingBasis MainBasis(SiteProfile? profile)
    {
        if (profile == null) return new(null, null);
        var card = profile.MainRating ?? profile.EstimatedRating;
        bool estimateNewer = card.HasValue && (!profile.SearchRating.HasValue
            || (profile.ProfileChecked ?? DateTime.MinValue) >= (profile.SearchChecked ?? DateTime.MinValue));
        return new(estimateNewer ? card : profile.SearchRating, estimateNewer ? profile.DiscoveredGames ?? profile.SearchGames : profile.SearchGames ?? profile.DiscoveredGames);
    }

    internal static IReadOnlyList<RatingChange> BestAvailable(Match match, IReadOnlyDictionary<string, RatingBasis> mode,
        IReadOnlyDictionary<string, RatingBasis> main, IEnumerable<RatingChange>? published)
    {
        // General/profile estimates are main_current; never insert them into
        // a Commanders-only matchup. Prefer the scope shown in site game history.
        bool completeMain = match.Players.All(p => main.TryGetValue(p.Id, out var basis) && basis.Value is { } value && double.IsFinite(value));
        var estimates = Estimate(match, completeMain ? main : mode, completeMain ? "main_current" : "commanders_3v3");
        var confirmed = (published ?? []).Where(c => c.Kind == "confirmed" && c.Delta is { } value && double.IsFinite(value) && c.SiteGameId != null)
            .GroupBy(c => c.PlayerId, StringComparer.Ordinal).Where(g => g.Count() == 1).ToDictionary(g => g.Key, g => g.Single(), StringComparer.Ordinal);
        return estimates.Select(c => confirmed.TryGetValue(c.PlayerId, out var actual) ? actual with { Scope = "main_current" } : c).ToArray();
    }

    private static double Uncompress(double rating) => rating > 1000 ? rating + 9000 : Math.Truncate(rating * 10);
    private static double Compress(double rating) => rating > 10000 ? rating - 9000 : Math.Truncate(rating / 10);
}
