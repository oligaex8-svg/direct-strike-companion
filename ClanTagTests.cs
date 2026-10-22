using System.Text.Json;
using System.Text.Json.Nodes;
using s2protocol.NET;
using s2protocol.NET.Models;

namespace DirectStrikeCompanion;

internal static class ClanTagTests
{
    internal static void Run(Action<bool, string> assert)
    {
        const string eu = "2-S2-1-100", america = "1-S2-1-100", empty = "2-S2-1-101", missing = "2-S2-1-102", conflict = "2-S2-1-103", fallback = "2-S2-1-104";
        UserInitialData User(string id, string? tag) => new("", "", 0, null, id, 0, 0, tag!, false, false, false, 0, false, "", "Same nickname", null, 0, "", null);
        DetailsPlayer Detail(int id, string? tag, string program = "S2") => new(new(0, 0, 0, 0), 0, 0, "", "Same nickname", 0, "", 0, 0, new(id, program, 1, 2), 0) { ClanName = tag };
        Sc2Replay Fixture(IEnumerable<UserInitialData>? users, IEnumerable<DetailsPlayer>? players = null)
        {
            var replay = new Sc2Replay();
            if (users != null) typeof(Sc2Replay).GetProperty("Initdata")!.SetValue(replay, new Initdata(users.ToList(), null!, null!));
            if (players != null) typeof(Sc2Replay).GetProperty("Details")!.SetValue(replay, new Details(0, 0, "", "", false, 0, "", false, "", false, false, 0, 0, "", players.ToList()));
            return replay;
        }
        var replay = Fixture([User(america, "<NA>"), User(conflict, "One"), User(empty, ""), User(eu, " [Союз] "), User(conflict, "Two"), User("", "Wrong")], [Detail(100, "Older"), Detail(104, "[Fallback]"), Detail(103, "Guess")]);
        var tags = ReplayClanTags.Extract(replay, [eu, america, empty, missing, conflict, fallback]);
        assert(tags[eu] == "Союз" && tags[america] == "NA", "clan tags join by complete native ID across regions regardless of order or matching nicknames");
        assert(tags[empty] == "" && tags[missing] == null, "explicit no-clan value remains distinct from absent identity metadata");
        assert(tags[conflict] == null && tags[fallback] == "Fallback", "conflicting ID tags remain unavailable and Details fallback uses its full native Toon only");
        var padded = ReplayClanTags.Extract(Fixture(null, [Detail(100, "Leading", "\0\0S2"), Detail(104, "Trailing", "S2\0\0")]), [eu, fallback]);
        assert(padded[eu] == "Leading" && padded[fallback] == "Trailing", "real four-byte SC2 ProgramId padding retains the complete native Toon clan fallback");
        var foreignProgram = ReplayClanTags.Extract(Fixture(null, [Detail(100, "Wrong", "S2X"), Detail(104, "Wrong", " S2 ")]), [eu, fallback]);
        assert(foreignProgram.Values.All(value => value == null), "non-SC2 or whitespace-delimited program identifiers cannot attach a clan");
        var duplicate = ReplayClanTags.Extract(Fixture([User(eu, "[A]"), User(eu, "A")]), [eu]);
        assert(duplicate[eu] == "A", "consistent repeated native identity metadata accepts the same normalized tag");
        var absent = ReplayClanTags.Extract(new Sc2Replay(), [eu]);
        assert(absent[eu] == null, "missing replay metadata never invents an empty clan or infers a nickname match");
        assert(ReplayClanTags.Normalize("[[<Tag>]]") == "Tag" && ReplayClanTags.Normalize("<> ") == "" && ReplayClanTags.Normalize("A&B") == "A&B", "display wrappers normalize without stripping multilingual or literal tag text");
        assert(ReplayClanTags.Normalize("<c>Tag</c>") == null && ReplayClanTags.Normalize("Tag]") == null && ReplayClanTags.Normalize("A\nB") == null, "markup, broken wrappers and control characters do not become display tags");
        var options = ReplayService.MetadataOptions();
        assert(options.Details && options.Initdata && !options.Metadata && !options.GameEvents && !options.TrackerEvents && !options.MessageEvents && !options.AttributeEvents, "clan-only decoder requests Details and Initdata without event or APM streams");

        var root = Path.Combine(AppContext.BaseDirectory, "test-output", "clan-" + Guid.NewGuid());
        var store = new Store(root);
        var combat = new CombatStats(new() { ["UnitKills"] = 12, ["DamageDealt"] = null });
        var players = new[] { eu, empty, missing, conflict, fallback, "2-S2-1-105" }.Select((id, index) => new ReplayPlayer(id, index == 0 ? "Same nickname" : "Player " + index, index < 3 ? 1 : 2, "Raynor", index < 3 ? "Win" : "Loss", 45 + index, 100 + index, 200 + index, combat)).ToList();
        var economy = new MatchEconomy(MatchEconomyExtractor.CurrentVersion, false, "Not observed", [], null, []);
        var original = new Match("original-hash", "original-path", "Direct Strike", "Commanders", new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc), 600, 1, players, CombatStatsExtractor.CurrentVersion, economy);
        store.Data.Matches.Add(original);
        store.Data.Settings.SelfIds = [eu];
        store.Data.OwnAccountGroups = [new("local", "account", [new(eu, "EU")], "Local fixture", "Linked", true, [])];
        store.Data.OwnLocalNames = [new(eu, "Recent shortcut nickname", original.Time.AddDays(1))];
        store.Data.Marks[empty] = new(empty, "Private mark", "keep note", original.Time);
        store.Data.Ratings[empty] = new(empty, 2000, "Linked profile", "url", original.Time, "profile");
        store.Data.RegionalRatings[empty] = new(Eu: store.Data.Ratings[empty]);
        string WithoutClan(Database data)
        {
            var node = JsonNode.Parse(JsonSerializer.Serialize(data, Store.Json))!;
            foreach (var match in node["matches"]!.AsArray())
            {
                match!.AsObject().Remove("clanVersion");
                foreach (var player in match["players"]!.AsArray()) player!.AsObject().Remove("clanTag");
            }
            return node.ToJsonString(Store.Json);
        }
        var before = WithoutClan(store.Data);
        assert(!ReplayService.NeedsEnrichment(original) && ReplayService.NeedsClanMetadata(original), "legacy clan metadata is scheduled independently from satisfied combat and economy versions");
        var enriched = ReplayService.EnrichClanMetadata(original, replay);
        // Same hash identifies the recorded game even when an incoming payload differs.
        var incoming = enriched with { Path = "other-copy", Winner = 2, Title = "Direct Strike altered", Time = original.Time.AddDays(2), Seconds = 800, Players = enriched.Players.AsEnumerable().Reverse().Select(p => p with { Name = "Changed", Apm = 999, Killed = 999, Lost = 999, Combat = null }).ToList() };
        assert(store.ImportMatch(incoming) == ReplayImportResult.Refreshed && WithoutClan(store.Data) == before, "clan-only refresh preserves recorded names, aliases source, roster order, outcomes, hash, path, time, statistics, economy, private marks and ratings");
        var saved = store.Data.Matches.Single();
        assert(saved.Players[0].ClanTag == "Союз" && saved.Players[1].ClanTag == "" && saved.Players[2].ClanTag == null && saved.ClanVersion == ReplayClanTags.CurrentVersion, "metadata refresh applies tags by native ID and records a completed read even for unavailable players");
        assert(!ReplayService.NeedsClanMetadata(saved) && store.ImportMatch(incoming) == ReplayImportResult.Duplicate && store.Data.Matches.Count == 1, "successful metadata reads stop repeat backfills and repeated import cannot duplicate the game");
        store.Save();
        var restored = new Store(root);
        assert(restored.Data.Matches.Single().ClanVersion == ReplayClanTags.CurrentVersion && restored.Data.Matches[0].Players[1].ClanTag == "" && restored.Data.Matches[0].Players[2].ClanTag == null && WithoutClan(restored.Data) == before, "clan version, explicit empty and unavailable tags persist without unrelated library changes");
        var legacy = JsonSerializer.Deserialize<Database>(before, Store.Json)!;
        assert(legacy.Matches[0].ClanVersion == 0 && legacy.Matches[0].Players.All(p => p.ClanTag == null), "serialized pre-clan libraries retain compatibility with optional defaults");
        var unavailable = ReplayService.EnrichClanMetadata(original, new Sc2Replay());
        assert(unavailable.ClanVersion == ReplayClanTags.CurrentVersion && unavailable.Players.All(p => p.ClanTag == null) && !ReplayService.NeedsClanMetadata(unavailable), "successful metadata read with no available tags still completes the clan migration");
        var higherCombat = saved with { StatsVersion = saved.StatsVersion + 1, ClanVersion = 0, Players = saved.Players.Select(p => p with { ClanTag = null, Combat = combat with { LastSampleLoop = 12 } }).ToList() };
        assert(store.ImportMatch(higherCombat) == ReplayImportResult.Refreshed && store.Data.Matches[0].Players[0].ClanTag == "Союз" && store.Data.Matches[0].ClanVersion == ReplayClanTags.CurrentVersion, "later combat enrichment cannot downgrade recorded clan metadata");
        var wrongIdentity = original with { Hash = "wrong-id", Players = original.Players.Select(p => p.Id == eu ? p with { Id = america, ClanTag = "Wrong" } : p).ToList(), ClanVersion = 1 };
        // A forced same-hash payload cannot attach a foreign regional ID's tag.
        var independent = new Store(Path.Combine(root, "identity"));
        independent.Data.Matches.Add(original);
        independent.ImportMatch(wrongIdentity with { Hash = original.Hash });
        assert(independent.Data.Matches[0].Players[0].ClanTag == null && independent.Data.Matches[0].Players[0].Id == eu, "same nickname and local account number from another region cannot patch native clan identity");
        using var summary = JsonDocument.Parse(JsonSerializer.Serialize(store.Summary(), Store.Json));
        var opponent = summary.RootElement.GetProperty("players").EnumerateArray().Single(p => p.GetProperty("id").GetString() == empty);
        assert(opponent.GetProperty("clanTag").GetString() == "" && opponent.GetProperty("name").GetString() == players[1].Name && opponent.GetProperty("aliases").EnumerateArray().Single().GetString() == players[1].Name, "player summary exposes recorded clan metadata while keeping names and aliases raw");
        var account = summary.RootElement.GetProperty("accounts").EnumerateArray().Single();
        var profile = summary.RootElement.GetProperty("ownAccountGroups")[0].GetProperty("profiles")[0];
        assert(account.GetProperty("clanTag").GetString() == "Союз" && account.GetProperty("name").GetString() == players[0].Name && profile.GetProperty("clanTag").GetString() == "Союз" && profile.GetProperty("name").GetString() == "Recent shortcut nickname", "own account and profile summaries expose replay tags while preserving native and shortcut name sources");
    }
}
