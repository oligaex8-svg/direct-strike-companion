using s2protocol.NET;

namespace DirectStrikeCompanion;

public static class ReplayClanTags
{
    public const int CurrentVersion = 1;

    // s2protocol.NET 0.9.6 exposes m_clanTag beside the full m_toonHandle.
    // A nickname, user array index or lobby slot never establishes identity here.
    // Empty means an observed no-clan value; null means unavailable or ambiguous.
    public static IReadOnlyDictionary<string, string?> Extract(Sc2Replay replay, IEnumerable<string> identities)
    {
        ArgumentNullException.ThrowIfNull(replay);
        ArgumentNullException.ThrowIfNull(identities);
        var initial = (replay.Initdata?.UserInitialData ?? []).Where(p => !string.IsNullOrWhiteSpace(p.ToonHandle))
            .GroupBy(p => p.ToonHandle, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Select(p => Normalize(p.ClanTag)).Distinct(StringComparer.Ordinal).ToList(), StringComparer.Ordinal);
        // Details' ClanName is the tag removed from its formatted player name.
        // Use it only if Initdata has no entry, and only with a complete SC2 Toon.
        // The decoder's four-byte ProgramId is "\0\0S2" in real replays.
        // Remove only protocol NUL padding, then still require exactly SC2.
        var details = (replay.Details?.Players ?? []).Where(p => p.Toon != null && p.Toon.ProgramId?.Trim('\0') == "S2" && p.Toon.Region > 0 && p.Toon.Realm > 0 && p.Toon.Id > 0)
            .GroupBy(p => $"{p.Toon.Region}-S2-{p.Toon.Realm}-{p.Toon.Id}", StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Select(p => Normalize(p.ClanName)).Distinct(StringComparer.Ordinal).ToList(), StringComparer.Ordinal);
        var result = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var id in identities.Distinct(StringComparer.Ordinal))
        {
            var tags = initial.GetValueOrDefault(id) ?? details.GetValueOrDefault(id);
            result[id] = tags?.Count == 1 ? tags[0] : null;
        }
        return result;
    }

    internal static string? Normalize(string? tag)
    {
        if (tag == null) return null;
        tag = tag.Trim();
        while (tag.Length >= 2 && ((tag[0] == '[' && tag[^1] == ']') || (tag[0] == '<' && tag[^1] == '>')))
            tag = tag[1..^1].Trim();
        // Do not turn protocol/display markup or malformed delimiters into a tag.
        return tag.Any(c => char.IsControl(c) || c is '[' or ']' or '<' or '>') ? null : tag;
    }
}
