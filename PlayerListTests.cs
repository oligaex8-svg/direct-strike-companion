using System.Text.Json;
using System.Text.Json.Nodes;

namespace DirectStrikeCompanion;

internal static class PlayerListTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikePlayerListTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        try
        {
            bool Rejected(Action action)
            {
                try { action(); return false; }
                catch (ArgumentException) { return true; }
            }
            var player = new ReplayPlayer("2-S2-1-100", "EarlierName", 2, "Zerg", "Loss", 0, 0, 0);
            var game = new Match("list-fixture", "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 600, 1, [player, player with { Id = "2-S2-1-101", Name = "KnownUnlisted" }]);
            var rating = new Rating(player.Id, 2500, "Linked profile", "fixture", DateTime.UtcNow, "42", Region: "EU");
            store.Data.Matches.Add(game);
            store.Data.Ratings[player.Id] = rating;
            store.SetRegionRating(player.Id, "EU", rating);
            store.SetMark(player.Id, "CurrentName", "private note");
            var legacy = JsonNode.Parse(JsonSerializer.Serialize(store.Data, Store.Json))!.AsObject();
            legacy["marks"]![player.Id]!.AsObject().Remove("list");
            legacy["settings"]!.AsObject().Remove("listAlerts");
            File.WriteAllText(Path.Combine(root, "library.json"), legacy.ToJsonString(Store.Json));
            store = new Store(root);
            assert(store.Data.Marks[player.Id].List == "blocked" && store.Data.Marks[player.Id].Note == "private note", "legacy marks migrate to blocked without losing notes");
            assert(store.Data.Settings.IsListAlertEnabled("blocked") && !store.Data.Settings.IsListAlertEnabled("friends") && !store.Data.Settings.IsListAlertEnabled("losers"), "legacy settings default alerts to blocked only");
            store.Data.Settings.ListAlerts.Clear();
            assert(store.Data.Settings.IsListAlertEnabled("blocked") && !store.Data.Settings.IsListAlertEnabled("friends") && !store.Data.Settings.IsListAlertEnabled("losers"), "missing list alert keys use per-list defaults");

            store.SetMark(player.Id, "CurrentName", "private note", list: "friends");
            store.SetMark("name:blocked", "BlockedName", "block note", list: "blocked");
            store.SetMark("name:loser", "LoserName", "loser note", list: "losers");
            store.Save();
            store = new Store(root);
            assert(store.Data.Marks.Count == 3 && store.Data.Marks[player.Id].List == "friends" && store.Data.Marks["name:blocked"].List == "blocked" && store.Data.Marks["name:loser"].List == "losers", "all three player lists and stable IDs survive restart");
            store.SetMark(player.Id, "CurrentName", "edited note");
            assert(store.Data.Marks[player.Id].List == "friends" && store.Data.Marks[player.Id].Note == "edited note", "note edits without a list preserve the saved category");
            store.SetMark(player.Id, "CurrentName", "edited note", list: "losers");
            assert(store.Data.Marks.Count == 3 && store.Data.Marks[player.Id].List == "losers", "moving a player replaces one stable-ID entry");
            var before = JsonSerializer.Serialize(store.Data, Store.Json);
            assert(Rejected(() => store.SetMark(player.Id, "CurrentName", "bad", list: "unknown")) && Rejected(() => store.SetMark(player.Id, "CurrentName", remove: true, list: "unknown")) && Rejected(() => store.SetListAlert("unknown", true)) && JsonSerializer.Serialize(store.Data, Store.Json) == before, "unknown lists cannot add remove or change alert settings");
            assert(Rejected(() => store.SetMark(player.Id, "", "bad", list: "blocked")) && Rejected(() => store.SetMark(player.Id, "CurrentName", new string('n', 1001))) && JsonSerializer.Serialize(store.Data, Store.Json) == before, "existing player mark validation rejects changes without mutation");
            assert(Rejected(() => Store.ValidateListAlerts(new Settings { ListAlerts = new() { ["unknown"] = true } })) && Rejected(() => Store.ValidateListAlerts(new Settings { ListAlerts = null! })), "settings reject unknown alert keys and null dictionaries");
            store.SetMark("name:loser", "LoserName", remove: true);
            assert(!store.Data.Marks.ContainsKey("name:loser") && store.Data.Marks[player.Id].Note == "edited note", "removing a player leaves other list entries and notes intact");
            store.SetMark(player.Id, "CurrentName", "edited note", list: "friends");
            store.SetMark("name:loser", "LoserName", "loser note", list: "losers");
            store.Data.Settings.Sound = false;
            store.Data.Settings.LiveWatch = false;
            store.Data.Settings.ScreenWatch = true;
            store.Data.Settings.AutoDetectSelf = false;
            int notices = 0;
            var lobby = new LobbyService(store, (_, _, _) => notices++);
            assert(lobby.Check("EarlierName\nBlockedName\nLoserName", "test").Select(m => m.List).SequenceEqual(["blocked"]) && notices == 1, "default checks alert only blocked entries");
            lobby.Check("CurrentName\nLoserName", "Manual lobby check", true);
            var snapshot = JsonSerializer.SerializeToElement(lobby.Snapshot(), Store.Json);
            var friend = snapshot.GetProperty("rosterEntries")[0].GetProperty("candidates")[0];
            var loser = snapshot.GetProperty("rosterEntries")[1].GetProperty("candidates")[0];
            assert(friend.GetProperty("id").GetString() == player.Id && friend.GetProperty("list").GetString() == "friends" && !friend.GetProperty("marked").GetBoolean() && friend.GetProperty("aliases").EnumerateArray().Any(n => n.GetString() == "EarlierName") && loser.GetProperty("list").GetString() == "losers" && !loser.GetProperty("marked").GetBoolean(), "silent saved players retain category and aliases in lobby candidates");
            store.SetListAlert("friends", true);
            assert(lobby.Check("EarlierName", "test").Single().Id == player.Id && notices == 2, "enabling friends allows a formerly silent alias to alert");
            lobby.Check("CurrentName", "test");
            assert(notices == 2, "enabled list alerts keep stable-ID duplicate suppression across aliases");
            store.SetListAlert("blocked", false);
            store.SetListAlert("losers", true);
            assert(lobby.Check("CurrentName\nBlockedName\nLoserName", "configured", true).Select(m => m.List).Order().SequenceEqual(new[] { "friends", "losers" }), "configured checks exclude disabled blocked entries and include opted-in lists");
            lobby.Check("CurrentName\nLoserName\nUnlisted\nKnownUnlisted", "Manual lobby check", true);
            snapshot = JsonSerializer.SerializeToElement(lobby.Snapshot(), Store.Json);
            assert(snapshot.GetProperty("rosterEntries")[0].GetProperty("marked").GetBoolean() && snapshot.GetProperty("rosterEntries")[1].GetProperty("marked").GetBoolean() && snapshot.GetProperty("rosterEntries")[2].GetProperty("candidates").GetArrayLength() == 0, "candidate warnings follow current per-list settings while unknown names remain visible");
            var unlisted = snapshot.GetProperty("rosterEntries")[3].GetProperty("candidates")[0];
            assert(unlisted.GetProperty("list").ValueKind == JsonValueKind.Null && !unlisted.GetProperty("marked").GetBoolean(), "known players without a list expose null category and no warning");
            store.Save();
            var restored = new Store(root);
            assert(restored.Data.Settings.IsListAlertEnabled("friends") && !restored.Data.Settings.IsListAlertEnabled("blocked") && restored.Data.Settings.IsListAlertEnabled("losers") && !restored.Data.Settings.Sound && !restored.Data.Settings.LiveWatch && restored.Data.Settings.ScreenWatch && !restored.Data.Settings.AutoDetectSelf, "per-list toggles persist without replacing other settings");
            assert(restored.Data.Marks[player.Id].Note == "edited note" && restored.Data.Ratings[player.Id] == rating && restored.GetRegionRatings(player.Id).Eu == rating && restored.Data.Matches.Single().Winner == game.Winner && restored.Data.Matches.Single().Players.First().Result == player.Result, "list updates preserve notes cached ratings and replay results");
        }
        finally { Directory.Delete(root, true); }
    }
}
