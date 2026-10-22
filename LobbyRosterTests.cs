using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class LobbyRosterTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeLobbyTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            var first = new ReplayPlayer("2-S2-1-100", "Enemy", 1, "", "", 0, 0, 0);
            var second = first with { Id = "2-S2-1-200", Team = 2 };
            store.Data.Matches.Add(new("lobby-test", "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 0, 0, [first, second]));
            store.Data.Marks[first.Id] = new(first.Id, "Enemy", "", DateTime.UtcNow);
            store.Data.Marks["name:visitor"] = new("name:visitor", "Visitor", "", DateTime.UtcNow);
            int notices = 0;
            var lobby = new LobbyService(store, (_, _, _) => notices++);
            var now = DateTime.UtcNow;
            JsonElement Snapshot(DateTime? at = null) => JsonSerializer.SerializeToElement(lobby.SnapshotAt(at ?? now), Store.Json);
            assert(!LobbyService.ContainsName("EnemyLong Enemy_2", "Enemy") && LobbyService.ContainsName("[Clan] Enemy", "Enemy"), "OCR name boundaries reject substrings");
            assert(lobby.Check("Other Enemy", "Match roster").Count == 0, "client alert requires whole name equality");
            lobby.ApplyClientObservation(["Enemy", "Enemy"], false, false, false, true, true, now);
            var match = Snapshot();
            assert(match.GetProperty("source").GetString() == "client" && match.GetProperty("rosterEntries").GetArrayLength() == 2, "exact client duplicate names retain separate entries");
            var entry = match.GetProperty("rosterEntries")[0];
            assert(entry.GetProperty("candidates").GetArrayLength() == 2 && entry.GetProperty("ambiguous").GetBoolean() && entry.GetProperty("marked").GetBoolean(), "same name returns all replay IDs and marked ambiguity");
            lobby.ApplyClientObservation(["Enemy"], false, false, true, true, true, now);
            assert(Snapshot().GetProperty("roster").GetArrayLength() == 0 && Snapshot().GetProperty("phase").GetString() == "pregame", "menus suppress stale client roster");
            lobby.Check(" Visitor \nUnknown\nUnknown", "Manual lobby check", true);
            var manual = Snapshot(DateTime.UtcNow);
            assert(manual.GetProperty("source").GetString() == "manual" && manual.GetProperty("roster").GetArrayLength() == 3 && manual.GetProperty("rosterEntries")[0].GetProperty("nameOnly").GetBoolean(), "manual roster retains unknown and repeated names plus local name-only mark");
            lobby.ApplyClientObservation([], false, false, true, true, true, now);
            assert(Snapshot(DateTime.UtcNow).GetProperty("source").GetString() == "manual", "empty client pregame does not erase manual observation");
            lobby.ApplyScreenObservation("EnemyLong", true, now);
            assert(Snapshot(DateTime.UtcNow).GetProperty("source").GetString() == "manual", "unmatched OCR does not erase manual observation");
            lobby.ApplyScreenObservation("Enemy Visitor", true, now);
            assert(Snapshot().GetProperty("source").GetString() == "screen" && Snapshot().GetProperty("partial").GetBoolean(), "known visible OCR supersedes manual with partial source");
            assert(Snapshot(now.AddMinutes(10)).GetProperty("roster").GetArrayLength() == 2 && Snapshot(now.AddMinutes(10)).GetProperty("held").GetBoolean(), "last detected lobby remains visible with a retained status after its fresh interval");
            lobby.ApplyScreenObservation("Enemy", true, now);
            lobby.ApplyScreenObservation("", false, now.AddSeconds(1));
            assert(Snapshot().GetProperty("source").GetString() == "screen" && Snapshot().GetProperty("held").GetBoolean(), "unreadable SC2 screen retains the last lobby instead of clearing its names");
            lobby.ApplyClientObservation(["Enemy"], true, false, false, true, true, now);
            var previousNotices = notices;
            lobby.Check("Enemy", "Manual lobby check", true);
            assert(notices == previousNotices && Snapshot().GetProperty("phase").GetString() == "replay" && Snapshot().GetProperty("roster").GetArrayLength() == 0, "replay suppresses roster and new alerts");
            lobby.ApplyClientObservation(["Enemy"], false, true, false, true, true, now);
            assert(Snapshot().GetProperty("phase").GetString() == "finished" && Snapshot().GetProperty("roster").GetArrayLength() == 0, "completed match clears client names");
            lobby.ApplyClientObservation(["Enemy"], false, false, false, true, true, now);
            lobby.ApplyClientObservation([], false, false, false, false, true, now);
            assert(Snapshot().GetProperty("phase").GetString() == "disconnected" && Snapshot().GetProperty("source").GetString() == "none", "disconnection clears client roster");
            lobby.Check("Unknown", "Manual lobby check", true);
            lobby.ApplyClientObservation([], false, false, false, false, false, now);
            assert(Snapshot(now.AddMinutes(6)).GetProperty("phase").GetString() == "off" && Snapshot(now.AddMinutes(6)).GetProperty("roster").GetArrayLength() == 0, "manual freshness expires into truthful off phase");
            lobby.Check("Unknown", "Manual lobby check", true);
            lobby.Check("", "Manual lobby check", true);
            assert(Snapshot().GetProperty("source").GetString() == "none", "empty manual check clears names");
            lobby.ApplyScreenObservation("Unknown stranger text", true, now);
            assert(Snapshot().GetProperty("roster").GetArrayLength() == 0 && Snapshot().GetProperty("detectionStatus").GetString()!.Contains("cannot establish a full roster"), "unknown screen text does not invent a lobby roster");
            lobby.ApplyClientObservation(["Enemy"], true, false, false, true, true, now);
            lobby.ApplyScreenObservation("Enemy Visitor", true, now);
            assert(Snapshot().GetProperty("source").GetString() == "none" && Snapshot().GetProperty("phase").GetString() == "replay", "screen observation cannot restore names during replay playback");
            store.Data.Settings.LiveWatch = false;
            store.Data.Settings.ScreenWatch = false;
            var alertsBeforeWatch = Snapshot().GetProperty("alerts").GetArrayLength();
            lobby.WatchAt(now);
            var saved = new Store(path);
            assert(saved.Data.Settings.LiveWatch && saved.Data.Settings.ScreenWatch && saved.Data.Marks.Count == 2, "opening Live lobby persists both monitors and preserves private marks");
            lobby.WatchAt(now.AddSeconds(4));
            lobby.WatchAt(now.AddSeconds(8));
            assert(!File.Exists(Path.Combine(path, "library.json.bak")) && Snapshot().GetProperty("alerts").GetArrayLength() == alertsBeforeWatch, "watch heartbeats neither rewrite the unchanged library nor trigger alerts");
            assert(LobbyService.ResourcePauseReason(97, 89.9) == null && LobbyService.ResourcePauseReason(98, 0)!.Contains("RAM") && LobbyService.ResourcePauseReason(0, 90)!.Contains("CPU"), "screen observation budget accepts below thresholds and pauses at both limits");
            assert(LobbyService.IsFinishedClientMatch(JsonSerializer.SerializeToElement(new[] { new { result = "Victory" }, new { result = "Defeat" } })), "native SC2 Victory and Defeat results identify a completed match");
            assert(!LobbyService.IsFinishedClientMatch(JsonSerializer.SerializeToElement(new[] { new { result = "Undecided" }, new { result = "Defeat" } })) && !LobbyService.IsFinishedClientMatch(JsonSerializer.SerializeToElement(Array.Empty<object>())), "an ongoing match with an eliminated player and an empty client are not treated as completed");
            RunScreenRows(assert);
        }
        finally { Directory.Delete(path, true); }
    }
    private static void RunScreenRows(Action<bool, string> assert)
    {
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeScreenRowsTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            var enemy = new ReplayPlayer("2-S2-1-100", "Enemy", 1, "", "", 0, 0, 0);
            store.Data.Matches.Add(new("screen-rows", "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 0, 0, [enemy]));
            store.Data.Marks[enemy.Id] = new(enemy.Id, enemy.Name, "", DateTime.UtcNow);
            var notices = 0;
            var lobby = new LobbyService(store, (_, _, _) => notices++);
            var now = DateTime.UtcNow;
            JsonElement Snapshot(DateTime? at = null) => JsonSerializer.SerializeToElement(lobby.SnapshotAt(at ?? now), Store.Json);
            string[] screenshotRows = ["Ваня Кузьмич", "Константин Юсупов", "TKnight", "Scario", "basta", "akay"];
            var payload = JsonSerializer.SerializeToElement(new { status = "SC2 screen reader active", text = "Enemy: chat mentions a marked player", rosterNames = screenshotRows });
            var accepted = lobby.ApplyScreenObservation(payload.GetProperty("text").GetString()!, true, now, LobbyService.ReadScreenRoster(payload));
            var snapshot = Snapshot();
            assert(accepted.SequenceEqual(screenshotRows) && snapshot.GetProperty("roster").EnumerateArray().Select(n => n.GetString()).SequenceEqual(screenshotRows), "structured screenshot rows retain all six unfamiliar names and Cyrillic text in order");
            assert(snapshot.GetProperty("source").GetString() == "screen" && snapshot.GetProperty("partial").GetBoolean() && snapshot.GetProperty("rosterEntries").EnumerateArray().All(e => e.GetProperty("nameOnly").GetBoolean() && e.GetProperty("candidates").GetArrayLength() == 0 && !e.TryGetProperty("team", out _)), "unfamiliar screen names have no invented replay identity or inferred team");
            assert(lobby.Check(string.Join("\n", accepted), "SC2 screen · verify name").Count == 0 && notices == 0, "marked names in chat omitted from structured rows do not alert");
            assert(Snapshot(now.AddSeconds(18)).GetProperty("roster").GetArrayLength() == 6 && !Snapshot(now.AddSeconds(18)).GetProperty("held").GetBoolean() && Snapshot(now.AddHours(1)).GetProperty("held").GetBoolean() && Snapshot(now.AddHours(1)).GetProperty("roster").GetArrayLength() == 6, "structured lobby remains until a new observation or match and becomes explicitly retained after eighteen seconds");

            var teamPayload = JsonSerializer.SerializeToElement(new { rosterNames = screenshotRows, rosterTeams = new[] { 1, 1, 1, 2, 2, 2 }, region = "Americas" });
            lobby.ApplyScreenObservation("", true, now, LobbyService.ReadScreenRoster(teamPayload), LobbyService.ReadScreenTeams(teamPayload), LobbyService.ReadScreenRegion(teamPayload));
            assert(Snapshot().GetProperty("region").GetString() == "Americas", "validated screen server region is exposed separately from player identity and team");
            assert(Snapshot().GetProperty("rosterEntries").EnumerateArray().Select(e => e.GetProperty("team").GetInt32()).SequenceEqual([1, 1, 1, 2, 2, 2]), "observed Horde and Alliance panels supply team groups without assigning replay identities");
            lobby.ApplyScreenObservation("", false, now.AddSeconds(1));
            assert(Snapshot().GetProperty("held").GetBoolean() && Snapshot().GetProperty("rosterEntries")[3].GetProperty("team").GetInt32() == 2, "retained screen roster preserves its observed team divisions");
            assert(Snapshot().GetProperty("region").GetString() == "Americas", "retained screen roster preserves its observed server region");
            assert(LobbyService.ReadScreenRegion(JsonSerializer.SerializeToElement(new { rosterNames = screenshotRows, region = "Asia" })) == null
                && LobbyService.ReadScreenRegion(JsonSerializer.SerializeToElement(new { rosterNames = new[] { "bad\nname" }, region = "EU" })) == null, "unsupported regions and invalid roster alignment cannot supply a screen region");
            foreach (var invalidTeams in new object[] { new[] { 1, 1, 1, 1, 2, 2 }, new[] { 1, 1, 1, 2, 2, 3 }, new[] { 1, 2 }, new[] { "1", "1", "1", "2", "2", "2" } })
                assert(LobbyService.ReadScreenTeams(JsonSerializer.SerializeToElement(new { rosterNames = screenshotRows, rosterTeams = invalidTeams })).Count == 0, "malformed or oversized team grouping is unavailable rather than inferred");
            assert(LobbyService.ReadScreenTeams(JsonSerializer.SerializeToElement(new { rosterNames = new[] { "good", "bad\nname" }, rosterTeams = new[] { 1, 2 } })).Count == 0, "filtered OCR names do not shift team metadata onto a different player");
            lobby.ApplyClientObservation(["Enemy"], false, false, false, true, true, now.AddSeconds(2));
            assert(!Snapshot().GetProperty("rosterEntries")[0].TryGetProperty("team", out _), "loaded client names clear screen team metadata rather than guessing a new match team");
            assert(Snapshot().GetProperty("region").ValueKind == JsonValueKind.Null, "loaded client roster clears screen region evidence");
            lobby.ApplyClientObservation([], false, false, true, true, true, now.AddSeconds(3));

            lobby.ApplyScreenObservation("Enemy", true, now, screenshotRows);
            assert(Snapshot().GetProperty("region").ValueKind == JsonValueKind.Null, "fresh screen rows without server evidence clear an earlier region");
            accepted = lobby.ApplyScreenObservation("Enemy", true, now.AddSeconds(1), []);
            assert(accepted.Count == 0 && Snapshot().GetProperty("roster").GetArrayLength() == 6 && Snapshot().GetProperty("held").GetBoolean() && lobby.Check(string.Join("\n", accepted), "SC2 screen · verify name").Count == 0, "empty screen rows retain the previous lobby while suppressing new OCR chat alerts");
            lobby.ApplyClientObservation(["old match"], false, true, true, true, true, now.AddSeconds(2));
            assert(Snapshot().GetProperty("source").GetString() == "screen" && Snapshot().GetProperty("roster").GetArrayLength() == 6, "old completed match state does not erase a newly detected pregame lobby");
            assert(Snapshot().GetProperty("observedAt").GetDateTime() == now, "retaining unreadable lobby rows does not pretend they were freshly observed");
            var missingRows = JsonSerializer.SerializeToElement(new { text = "Enemy" });
            var malformedRows = JsonSerializer.SerializeToElement(new { rosterNames = "Enemy" });
            assert(LobbyService.ReadScreenRoster(missingRows).Count == 0 && LobbyService.ReadScreenRoster(malformedRows).Count == 0, "missing or non-array live-reader rows fail closed without a text fallback");
            var invalidRows = JsonSerializer.SerializeToElement(new { rosterNames = new object?[] { null, " ", "bad\nname", "\u202eevil", new string('x', 65), " Good ", "ignored seventh" } });
            assert(LobbyService.ReadScreenRoster(invalidRows).SequenceEqual(["Good"]), "JSON player rows reject empty, control, format and oversized names and inspect at most six slots");
            accepted = lobby.ApplyScreenObservation("Enemy", true, now, [" ", "bad\tname", new string('x', 65), " Enemy "]);
            assert(accepted.SequenceEqual(["Enemy"]) && lobby.Check(string.Join("\n", accepted), "SC2 screen · verify name").Count == 1 && notices == 1, "structured rows trim valid names and alert on an exact marked row");
            accepted = lobby.ApplyScreenObservation("Enemy", true, now, ["Other Enemy"]);
            assert(lobby.Check(string.Join("\n", accepted), "SC2 screen · verify name").Count == 0 && notices == 1, "screen alerts require the whole accepted player name rather than a substring");
            accepted = lobby.ApplyScreenObservation("Enemy", false, now, screenshotRows);
            assert(accepted.Count == 0 && Snapshot().GetProperty("source").GetString() == "screen" && Snapshot().GetProperty("held").GetBoolean(), "unavailable screen keeps the previous structured lobby and returns no new alert names");

            store.Data.Matches[0].Players.AddRange([
                enemy with { Id = "2-S2-1-201", Name = "TKnight" },
                enemy with { Id = "1-S2-1-201", Name = "TKnight" },
                enemy with { Id = "2-S2-1-202", Name = "Scario" },
                enemy with { Id = "2-S2-1-203", Name = "A B" },
                enemy with { Id = "2-S2-1-204", Name = "AB" }
            ]);
            accepted = lobby.ApplyScreenObservation("unrelated chat", true, now, ["T Knight", "Sc ario", "A  B", "A B", "Ваня Кузьмич"]);
            var entries = Snapshot().GetProperty("rosterEntries");
            assert(!Snapshot().GetProperty("held").GetBoolean() && Snapshot().GetProperty("roster").GetArrayLength() == 5, "fresh visible rows replace the retained lobby and reset its retained status");
            assert(accepted[0] == "TKnight" && entries[0].GetProperty("ambiguous").GetBoolean() && entries[0].GetProperty("candidates").EnumerateArray().Select(c => c.GetProperty("id").GetString()).ToHashSet().SetEquals(["2-S2-1-201", "1-S2-1-201"]), "one alias spelling repairs OCR whitespace while preserving separate EU and Americas identities");
            assert(accepted[1] == "Scario" && entries[1].GetProperty("candidates").GetArrayLength() == 1, "unique known alias spelling repairs internal OCR whitespace");
            assert(accepted[2] == "A  B" && entries[2].GetProperty("nameOnly").GetBoolean() && entries[2].GetProperty("candidates").GetArrayLength() == 0, "multiple known spellings with the same compact form leave OCR text unresolved");
            assert(accepted[3] == "A B" && entries[3].GetProperty("candidates")[0].GetProperty("id").GetString() == "2-S2-1-203", "exact alias spelling takes priority over whitespace collisions");
            assert(entries[4].GetProperty("nameOnly").GetBoolean() && entries[4].GetProperty("candidates").GetArrayLength() == 0, "Cyrillic Real-ID display names are not linked to a known nickname");
            store.Data.Matches[0].Players.Add(enemy with { Id = "2-S2-1-205", Name = "<OldClan> OtherNick" });
            accepted = lobby.ApplyScreenObservation("", true, now, ["<FreshClan> T Knight", "OtherNick", "[Fresh] O therNick"]);
            entries = Snapshot().GetProperty("rosterEntries");
            assert(accepted[0] == "<FreshClan> TKnight" && entries[0].GetProperty("candidates").GetArrayLength() == 2, "fresh paired clan prefix survives whitespace repair while nickname matching retains regional ambiguity");
            assert(accepted[1] == "OtherNick" && entries[1].GetProperty("candidates")[0].GetProperty("id").GetString() == "2-S2-1-205"
                && accepted[2] == "[Fresh] OtherNick", "historical tagged aliases match current plain names without restoring stale tags during whitespace repair");
            accepted = lobby.ApplyScreenObservation("", true, now, ["Enemy", "Enemy", "three", "four", "five", "six", "seven"]);
            assert(accepted.Count == 6 && Snapshot().GetProperty("rosterEntries")[0].GetProperty("name").GetString() == "Enemy" && Snapshot().GetProperty("rosterEntries")[1].GetProperty("name").GetString() == "Enemy", "structured rows retain duplicate player names and cap the roster at six");

            lobby.ApplyClientObservation(["Enemy"], false, false, false, true, true, now);
            accepted = lobby.ApplyScreenObservation("chat", true, now.AddSeconds(1), screenshotRows);
            assert(accepted.Count == 0 && Snapshot().GetProperty("source").GetString() == "client" && Snapshot().GetProperty("roster")[0].GetString() == "Enemy", "active match roster has priority over structured screen rows and screen alerts");
            lobby.ApplyClientObservation(["Enemy"], true, false, false, true, true, now);
            accepted = lobby.ApplyScreenObservation("Enemy", true, now, screenshotRows);
            assert(accepted.Count == 0 && Snapshot().GetProperty("phase").GetString() == "replay" && Snapshot().GetProperty("roster").GetArrayLength() == 0, "structured screen rows remain suppressed during replay playback");
            lobby.ApplyClientObservation([], false, false, true, true, true, now);
            lobby.ApplyScreenObservation("Enemy in legacy text", true, now);
            assert(Snapshot().GetProperty("roster").GetArrayLength() == 1 && Snapshot().GetProperty("roster")[0].GetString() == "Enemy", "legacy text-only caller retains known-name matching compatibility");
            lobby.ApplyScreenObservation("", true, now, ["Enemy"], [1], "Americas");
            assert(Snapshot().GetProperty("rosterEntries")[0].GetProperty("candidates").GetArrayLength() == 0, "Americas lobby nickname cannot inherit an EU replay identity with the same name");
            lobby.ApplyScreenObservation("", true, now, ["<FreshTag> Enemy"], [1], "EU");
            assert(Snapshot().GetProperty("rosterEntries")[0].GetProperty("candidates").GetArrayLength() == 1
                && Snapshot().GetProperty("rosterEntries")[0].GetProperty("name").GetString() == "<FreshTag> Enemy", "current clan prefix stays in display while the bare nickname matches its regional replay identity");
        }
        finally { Directory.Delete(path, true); }
    }
}
