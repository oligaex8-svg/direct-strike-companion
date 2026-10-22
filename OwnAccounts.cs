using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

public sealed record OwnProfile(string Id, string Region, string? ReplayFolder = null, string? ProfileDirectory = null, string? Sc2Root = null);
public sealed record OwnAccountGroup(string Key, string LocalAccountId, IReadOnlyList<OwnProfile> Profiles, string Evidence, string Status, bool CanAutoLink, IReadOnlyList<string> Warnings);

public static class OwnAccounts
{
    private static readonly Regex ToonHandle = new(@"^([1-9][0-9]*)-S2-([1-9][0-9]*)-([1-9][0-9]*)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex AccountNumber = new(@"^[0-9]+$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    // Roots are explicit SC2 directories, or their Accounts directory. Reads only
    // shallow directory names/existence; no launcher configuration, logs or files.
    // The caller must append only CanAutoLink profiles and retain manual SelfIds.
    public static IReadOnlyList<OwnAccountGroup> Scan(IEnumerable<string> roots, string? launcherAccountRoot, IEnumerable<string> knownSelfIds)
    {
        ArgumentNullException.ThrowIfNull(roots);
        ArgumentNullException.ThrowIfNull(knownSelfIds);
        var suppliedIds = knownSelfIds.Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        var known = suppliedIds.Select(NormalizeId).Where(id => id != null).Select(id => id!).ToHashSet(StringComparer.Ordinal);
        var accountsRoots = roots.Select(NormalizePath).Where(path => path != null).Select(path => path!)
            .Select(path => Path.GetFileName(path).Equals("Accounts", StringComparison.OrdinalIgnoreCase) ? path : Path.Combine(path, "Accounts"))
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToList();
        var found = new Dictionary<string, Dictionary<string, OwnProfile>>(StringComparer.Ordinal);
        foreach (string accounts in accountsRoots)
        {
            foreach (string account in ChildDirectories(accounts))
            {
                string accountId = Path.GetFileName(account);
                if (!AccountNumber.IsMatch(accountId)) continue;
                foreach (string profile in ChildDirectories(account))
                {
                    string? id = NormalizeId(Path.GetFileName(profile));
                    if (id == null) continue;
                    if (!found.TryGetValue(accountId, out var profiles)) found[accountId] = profiles = new(StringComparer.Ordinal);
                    string replayPath = Path.Combine(profile, "Replays", "Multiplayer");
                    string? replayFolder = Directory.Exists(replayPath) ? replayPath : null;
                    if (!profiles.TryGetValue(id, out var previous) || previous.ReplayFolder == null && replayFolder != null)
                        profiles[id] = new(id, Region(id), replayFolder, profile, Directory.GetParent(accounts)?.FullName);
                }
            }
        }
        var launcherPath = NormalizePath(launcherAccountRoot);
        var launcherIds = launcherPath == null ? new HashSet<string>(StringComparer.Ordinal)
            : ChildDirectories(launcherPath).Select(Path.GetFileName).Where(id => id != null && AccountNumber.IsMatch(id)).Select(id => id!).ToHashSet(StringComparer.Ordinal);
        var conflicting = found.SelectMany(account => account.Value.Keys.Select(id => (Id: id, Account: account.Key)))
            .GroupBy(p => p.Id, StringComparer.Ordinal).Where(g => g.Select(p => p.Account).Distinct(StringComparer.Ordinal).Count() > 1)
            .Select(g => g.Key).ToHashSet(StringComparer.Ordinal);
        // A unique launcher intersection is only a bootstrap convention, never
        // proof of the active login. Multiple intersections produce no opt-in.
        string? bootstrap = null;
        if (suppliedIds.Count == 0)
        {
            var intersections = found.Keys.Where(launcherIds.Contains).ToList();
            if (intersections.Count == 1) bootstrap = intersections[0];
        }
        var groups = new List<OwnAccountGroup>();
        foreach (var account in found.OrderBy(p => p.Key, StringComparer.Ordinal))
        {
            bool anchored = account.Value.Keys.Any(known.Contains);
            if (!anchored && account.Key != bootstrap) continue;
            var conflicts = account.Value.Keys.Where(conflicting.Contains).Order(StringComparer.Ordinal).ToList();
            bool launcher = launcherIds.Contains(account.Key);
            var warnings = conflicts.Select(id => $"{id} appears under multiple SC2 account parents. Automatic extension is blocked for this group; identities are not merged.").ToList();
            var evidence = launcher ? "SC2 numeric account folder also present in launcher account directories" : "SC2 folder only · common numeric parent with a known own profile";
            groups.Add(new("sc2-account:" + account.Key, account.Key, account.Value.Values.OrderBy(p => p.Id, StringComparer.Ordinal).ToList(), evidence,
                conflicts.Count > 0 ? "conflict" : anchored ? "anchored" : "bootstrap", conflicts.Count == 0, warnings));
        }
        return groups;
    }

    private static string Region(string id) => id.Split('-')[0] switch
    {
        "1" => "Americas",
        "2" => "EU",
        "3" => "Korea",
        "5" => "China",
        var region => "Region " + region,
    };

    private static string? NormalizeId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var match = ToonHandle.Match(value.Trim());
        return match.Success ? $"{match.Groups[1].Value}-S2-{match.Groups[2].Value}-{match.Groups[3].Value}" : null;
    }

    private static string? NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        try { return Path.TrimEndingDirectorySeparator(Path.GetFullPath(path)); }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or IOException or UnauthorizedAccessException) { return null; }
    }

    private static List<string> ChildDirectories(string path)
    {
        try { return Directory.GetDirectories(path).Order(StringComparer.OrdinalIgnoreCase).ToList(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException) { return []; }
    }
}
