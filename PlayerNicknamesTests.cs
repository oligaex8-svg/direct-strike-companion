using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class PlayerNicknamesTests
{
    internal static void Run(Action<bool, string> check)
    {
        var path = Path.Combine(Path.GetTempPath(), "DscNicknameTests", Guid.NewGuid().ToString("N"));
        try
        {
            var store = new Store(path);
            var eu = new ReplayPlayer("2-S2-1-101", "ReplayName", 1, "Artanis", "Win", 0, 0, 0);
            var other = eu with { Id = "2-S2-1-102", Name = "OtherName", Team = 2 };
            var us = eu with { Id = "1-S2-1-101", Name = "AmericaName" };
            var players = new[] { eu, other, us }.Concat(Enumerable.Range(103, 3).Select(value => eu with { Id = "2-S2-1-" + value, Name = "Other" + value, Team = value == 103 ? 1 : 2 })).ToList();
            store.Data.Matches.Add(new("nickname-fixture", "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 600, 1, players));
            store.Data.Marks[eu.Id] = new(eu.Id, eu.Name, "Keep private note", DateTime.UtcNow, "friends");
            store.Data.Settings.ListAlerts["friends"] = true;
            store.SetPlayerNicknames(eu.Id, [" Ваня Кузьмич ", "Friendly Nick", "friendly nick"]);
            check(store.Data.PlayerNicknames[eu.Id].SequenceEqual(["Ваня Кузьмич", "Friendly Nick"]), "nickname links preserve spaced Unicode names and deduplicate case-insensitively");
            var restored = new Store(path);
            check(restored.Data.PlayerNicknames[eu.Id].Count == 2 && restored.Data.Matches[0].Players[0].Name == "ReplayName"
                && restored.Data.Marks[eu.Id].Note == "Keep private note", "nickname links persist without rewriting replay names, native identities or private notes");
            var lobby = new LobbyService(restored, (_, _, _) => { });
            lobby.ApplyScreenObservation("", true, DateTime.UtcNow, ["Ваня Кузьмич"], [1], "EU");
            var snapshot = JsonSerializer.SerializeToElement(lobby.Snapshot(), Store.Json).GetProperty("rosterEntries")[0];
            var candidate = snapshot.GetProperty("candidates")[0];
            check(snapshot.GetProperty("name").GetString() == "Ваня Кузьмич" && candidate.GetProperty("id").GetString() == eu.Id
                && candidate.GetProperty("name").GetString() == "ReplayName" && candidate.GetProperty("list").GetString() == "friends",
                "custom lobby nickname resolves to the replay account while retaining its displayed nickname and friend mark");
            check(lobby.Check("Friendly Nick", "Match roster").Single().Id == eu.Id && lobby.Check("Friendly NickLong", "Match roster").Count == 0,
                "nickname alerts use the linked account and exact full-name boundaries");
            lobby.ApplyScreenObservation("", true, DateTime.UtcNow, ["Friendly Nick"], [1], "Americas");
            check(lobby.Check("Friendly Nick", "SC2 screen · verify name").Count == 0,
                "a known lobby region cannot trigger the other region's nickname list mark");
            check(restored.ResolvePlayerNickname("friendly nick", "EU")?.Id == eu.Id
                && restored.ResolvePlayerNickname("Friendly Nick", "Americas") == null,
                "nickname routing never crosses a known lobby region");
            restored.SetPlayerNicknames(us.Id, ["Friendly Nick"]);
            check(restored.ResolvePlayerNickname("Friendly Nick", null) == null && restored.ResolvePlayerNickname("Friendly Nick", "Americas")?.Id == us.Id,
                "same nickname in two regions stays ambiguous until the region is known");
            bool Reject(Action action) { try { action(); return false; } catch (ArgumentException) { return true; } }
            check(Reject(() => restored.SetPlayerNicknames(other.Id, ["friendly nick"])) && !restored.Data.PlayerNicknames.ContainsKey(other.Id),
                "same-region nickname collision is rejected atomically");
            check(Reject(() => restored.SetPlayerNicknames(eu.Id, [other.Name])), "nickname cannot impersonate another replay account's real name");
            check(Reject(() => restored.SetPlayerNicknames("name:fake", ["Alias"])) && Reject(() => restored.SetPlayerNicknames("2-S2-1-999", ["Alias"])),
                "nickname links require a real native account present in imported replays");
            check(Reject(() => restored.SetPlayerNicknames(eu.Id, ["bad\nname"])) && Reject(() => restored.SetPlayerNicknames(eu.Id, ["bad&#10;name"])) && Reject(() => restored.SetPlayerNicknames(eu.Id, [new string('x', 65)]))
                && Reject(() => restored.SetPlayerNicknames(eu.Id, Enumerable.Range(0, 9).Select(i => "Nick" + i).ToList())), "nickname validation rejects control characters, excessive length and excessive entries");
            restored.SetPlayerNicknames(eu.Id, ["Second Alias"], true);
            check(restored.Data.PlayerNicknames[eu.Id].Count == 3, "adding a lobby nickname retains existing links");
            var known = LobbyService.KnownPlayers(restored).Single(player => player.Id == eu.Id);
            check(known.Name == eu.Name && known.Aliases.Contains("Second Alias"), "canonical replay name stays separate from recognition aliases");
            restored.Data.DsstatsLookups[eu.Id] = new(eu.Id, "Ready", DateTime.UtcNow,
                [new(eu.Id, eu.Name, "EU", 2243, 699, 573, DateTime.UtcNow, "https://dsstats.pax77.org/", Consistency: .9, Confidence: .8, RatingStateVersion: 1)]);
            var site = new SiteSyncService(restored, new RatingService());
            var live = new LiveLobbyRatings(restored, site, new DsstatsService(restored));
            live.Observe(["Ваня Кузьмич"], "EU");
            check(restored.Data.SiteLookups.ContainsKey(SiteSyncService.NameLookupKey(eu.Name, "EU"))
                && !restored.Data.SiteLookups.ContainsKey(SiteSyncService.NameLookupKey("Ваня Кузьмич", "EU"))
                && restored.Data.DsstatsLookups.ContainsKey(SiteSyncService.NameLookupKey(eu.Name, "EU")),
                "both source queues search the actual replay account rather than a private nickname");
            using var summary = JsonDocument.Parse(JsonSerializer.Serialize(restored.Summary(), Store.Json));
            check(summary.RootElement.GetProperty("playerNicknames").GetProperty(eu.Id).GetArrayLength() == 3
                && summary.RootElement.GetProperty("players").EnumerateArray().Single(p => p.GetProperty("id").GetString() == eu.Id)
                    .GetProperty("aliases").EnumerateArray().Any(a => a.GetString() == "Second Alias"), "library summary publishes links for account search and lobby display");
            restored.SetPlayerNicknames(eu.Id, []);
            check(new Store(path).ResolvePlayerNickname("Second Alias", "EU") == null
                && !LobbyService.KnownPlayers(restored).Single(player => player.Id == eu.Id).Aliases.Contains("Second Alias"), "removing nickname links takes effect immediately and survives restart");
            restored.Data.PlayerNicknames["2-S2-1-9999"] = ["Orphan"];
            check(restored.ResolvePlayerNickname("Orphan", "EU") == null, "a link whose replay account is unavailable cannot fabricate an identity");
            restored.SetPlayerNicknames("2-S2-1-9999", []);
            check(!new Store(path).Data.PlayerNicknames.ContainsKey("2-S2-1-9999"), "an obsolete nickname link can be removed even after its replays are gone");
        }
        finally { if (Directory.Exists(path)) Directory.Delete(path, true); }
    }
}
