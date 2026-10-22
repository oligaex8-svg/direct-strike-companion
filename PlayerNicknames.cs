namespace DirectStrikeCompanion;

public sealed record PlayerNicknamesRequest(string Id, List<string> Nicknames, bool Append = false);

public sealed partial class Store
{
    internal ReplayPlayer? ResolvePlayerNickname(string name, string? region)
    {
        var normalized = SiteSyncService.NormalizeName(name);
        lock (Gate)
        {
            var ids = Data.PlayerNicknames.Where(pair => (region == null || SiteSyncService.NativeRegion(pair.Key) == region)
                && pair.Value.Any(alias => string.Equals(SiteSyncService.NormalizeName(alias), normalized, StringComparison.OrdinalIgnoreCase)))
                .Select(pair => pair.Key).Take(2).ToArray();
            if (ids.Length != 1) return null;
            return Data.Matches.SelectMany(match => match.Players.Where(player => player.Id == ids[0] && !string.IsNullOrWhiteSpace(player.Name))
                .Select(player => new { match.Time, Player = player })).MaxBy(item => item.Time)?.Player;
        }
    }

    // Explicit local links only. Replay co-occurrence and lobby position never
    // establish which native account owns a private Battle.net nickname.
    public void SetPlayerNicknames(string id, List<string>? nicknames, bool append = false)
    {
        if (SiteSyncService.NativeRegion(id ?? "") == null || nicknames == null || nicknames.Count > 8)
            throw new ArgumentException("Choose a replay account and up to eight nicknames.");
        if (nicknames.Any(name => string.IsNullOrWhiteSpace(name) || name.Length > 64 || name.Any(char.IsControl)))
            throw new ArgumentException("Nicknames must contain 1–64 characters on each line.");
        var names = nicknames.Select(SiteSyncService.NormalizeName).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (names.Any(name => name.Length is 0 or > 64 || name.Any(char.IsControl)))
            throw new ArgumentException("Nicknames must contain 1–64 characters on each line.");
        lock (Gate)
        {
            if (names.Count == 0 && !append)
            {
                Data.PlayerNicknames.Remove(id);
                Save();
                return;
            }
            var region = SiteSyncService.NativeRegion(id);
            if (!Data.Matches.Any(match => match.Players.Any(player => player.Id == id)))
                throw new ArgumentException("Choose an account from your imported replays.");
            if (append) names = Data.PlayerNicknames.GetValueOrDefault(id, []).Concat(names).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (names.Count > 8) throw new ArgumentException("An account can have up to eight nicknames.");
            var otherNames = Data.Matches.SelectMany(match => match.Players)
                .Where(player => player.Id != id && SiteSyncService.NativeRegion(player.Id) == region)
                .Select(player => player.Name)
                .Concat(Data.PlayerNicknames.Where(pair => pair.Key != id && SiteSyncService.NativeRegion(pair.Key) == region).SelectMany(pair => pair.Value))
                .Select(SiteSyncService.NormalizeName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (names.Any(otherNames.Contains))
                throw new ArgumentException("A nickname already belongs to another account in this region.");
            if (names.Count == 0) Data.PlayerNicknames.Remove(id);
            else Data.PlayerNicknames[id] = names;
            Save();
        }
    }
}
