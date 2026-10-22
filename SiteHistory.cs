namespace DirectStrikeCompanion;

// ProfileId is the site's numeric identity, never a native SC2 account handle.
public sealed record SiteHistory(string ProfileId, string Name, string Region, DateTime Checked, string Status, List<SiteRecentGame> Games);

internal static class SiteHistoryCache
{
    internal const int ProfileLimit = 500;
    internal const int GameLimit = 120;

    internal static SiteHistory Failure(SiteProfile profile, SiteHistory? previous, string message) => new(profile.ProfileId,
        previous?.Name ?? profile.Name, profile.Region, DateTime.UtcNow, "Error: " + message, previous?.Games.ToList() ?? []);

    internal static void Trim(Database data, string? currentKey = null)
    {
        var keep = data.Settings.SelfIds.Append(currentKey ?? "").ToHashSet(StringComparer.Ordinal);
        foreach (var key in data.SiteLookups.OrderBy(p => keep.Contains(p.Key)).ThenBy(p => p.Value.Checked)
            .Take(Math.Max(0, data.SiteLookups.Count - ProfileLimit)).Select(p => p.Key).ToArray()) data.SiteLookups.Remove(key);
        var profiles = data.SiteLookups.Where(p => keep.Contains(p.Key)).SelectMany(p => p.Value.Profiles).Select(p => p.ProfileId).ToHashSet(StringComparer.Ordinal);
        foreach (var key in data.SiteHistories.OrderBy(p => profiles.Contains(p.Key)).ThenBy(p => p.Value.Checked)
            .Take(Math.Max(0, data.SiteHistories.Count - ProfileLimit)).Select(p => p.Key).ToArray()) data.SiteHistories.Remove(key);
        foreach (var key in data.SiteGames.OrderByDescending(p => p.Value.Time).Skip(GameLimit).Select(p => p.Key).ToArray()) data.SiteGames.Remove(key);
    }
}
