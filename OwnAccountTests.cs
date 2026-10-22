namespace DirectStrikeCompanion;

internal static class OwnAccountTests
{
    internal static void Run(Action<bool, string> assert)
    {
        string fixture = Path.Combine(Path.GetTempPath(), "DirectStrikeOwnAccountTests", Guid.NewGuid().ToString());
        Directory.CreateDirectory(fixture);
        try
        {
            string sc2 = Path.Combine(fixture, "StarCraft II");
            string launcher = Path.Combine(fixture, "LauncherAccount");
            string Profile(string parent, string id, bool replays = false)
            {
                string path = Path.Combine(sc2, "Accounts", parent, id);
                Directory.CreateDirectory(path);
                if (replays) Directory.CreateDirectory(Path.Combine(path, "Replays", "Multiplayer"));
                return path;
            }
            const string eu = "2-S2-1-7408040", americas = "1-S2-1-13373014", future = "3-S2-1-999", unrelated = "1-S2-1-222";
            Profile("416014729", eu, true);
            Profile("416014729", americas); // Different regional nicknames are irrelevant: no name input exists.
            Directory.CreateDirectory(Path.Combine(launcher, "416014729"));
            Directory.CreateDirectory(Path.Combine(launcher, "1121551620"));
            var groups = OwnAccounts.Scan([sc2], launcher, [eu]);
            assert(groups.Count == 1 && groups[0].Profiles.Select(p => p.Id).ToHashSet().SetEquals([eu, americas]) && groups[0].CanAutoLink, "known own identity discovers differently named regional sibling without name matching");
            assert(groups[0].Evidence.Contains("launcher") && groups[0].Status == "anchored", "launcher directory intersection labels anchored folder evidence");
            assert(groups[0].Profiles.Single(p => p.Id == americas).ReplayFolder == null && groups[0].Profiles.Single(p => p.Id == eu).ReplayFolder != null, "own sibling without replay directory is included with nullable folder");
            var americaProfile = groups[0].Profiles.Single(p => p.Id == americas);
            assert(americaProfile.ProfileDirectory == Path.Combine(sc2, "Accounts", "416014729", americas) && americaProfile.Sc2Root == sc2, "profile directory and SC2 root remain available before any replay directory");
            Profile("416014729", future);
            groups = OwnAccounts.Scan([sc2, sc2 + Path.DirectorySeparatorChar, Path.Combine(sc2, "Accounts")], launcher, [eu]);
            assert(groups.Count == 1 && groups[0].Profiles.Count == 3 && groups[0].Profiles.Single(p => p.Id == future).Region == "Korea", "duplicate roots deduplicate and later regional profile extends same parent");
            Profile("1121551620", unrelated);
            groups = OwnAccounts.Scan([sc2], launcher, [eu]);
            assert(groups.Count == 1 && groups[0].Profiles.All(p => p.Id != unrelated), "unrelated stored launcher login and separate SC2 parent do not opt in");
            groups = OwnAccounts.Scan([sc2], null, [eu]);
            assert(groups.Count == 1 && groups[0].CanAutoLink && groups[0].Evidence.StartsWith("SC2 folder only"), "known self identity anchors siblings even without launcher evidence");
            assert(OwnAccounts.Scan([sc2], launcher, []).Count == 0, "multiple SC2 and launcher intersections abstain on first install");
            Directory.Delete(Path.Combine(launcher, "1121551620"));
            groups = OwnAccounts.Scan([sc2], launcher, []);
            assert(groups.Count == 1 && groups[0].Status == "bootstrap" && groups[0].CanAutoLink && groups[0].LocalAccountId == "416014729", "unique launcher intersection permits first-install bootstrap only for that parent");
            assert(OwnAccounts.Scan([sc2], launcher, ["manual-unrecognized-id"]).Count == 0, "nonempty manual settings do not silently trigger first-install bootstrap");
            assert(OwnAccounts.Scan([sc2], null, []).Count == 0, "first install without launcher intersection never assumes ownership");
            Profile("1121551620", eu);
            groups = OwnAccounts.Scan([sc2], launcher, [eu]);
            assert(groups.Count == 2 && groups.All(g => !g.CanAutoLink && g.Status == "conflict" && g.Warnings.Count == 1) && groups.Select(g => g.Key).Distinct().Count() == 2, "conflicting identity blocks automatic extension of both separate parents");
            string[] manualIds = [eu, "2-S2-1-12345"];
            var missing = OwnAccounts.Scan([Path.Combine(fixture, "missing"), ""], Path.Combine(fixture, "missing-launcher"), manualIds);
            assert(missing.Count == 0 && manualIds.SequenceEqual([eu, "2-S2-1-12345"]), "missing directories leave supplied own IDs intact");
            Profile("not-a-number", "2-S2-1-888");
            Profile("9999", "not-a-toon");
            assert(OwnAccounts.Scan([sc2], null, ["2-S2-1-888"]).Count == 0, "invalid parent and profile names are not account evidence");
            var lower = OwnAccounts.Scan([sc2], null, [americas.ToLowerInvariant()]);
            assert(lower.Count == 1 && lower[0].Profiles.Any(p => p.Id == americas), "known handle casing normalizes without merging parents");
        }
        finally { Directory.Delete(fixture, true); }
    }
}
