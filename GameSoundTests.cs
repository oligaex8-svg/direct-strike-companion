using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class GameSoundTests
{
    internal static void Run(Action<bool, string> assert)
    {
        JsonElement Ui(params string[] screens) => JsonSerializer.SerializeToElement(new { activeScreens = screens });
        JsonElement Game(double clock = 0, bool replay = false, string result = "Undecided", params string[] names) =>
            JsonSerializer.SerializeToElement(new { isReplay = replay, displayTime = clock, players = names.Select(name => new { name, result }).ToArray() });
        var menu = Ui("ScreenHome");
        var loading = Ui("ScreenLoading");
        var playing = Ui();
        var empty = Game();
        var start = Game(0, false, "Undecided", "One", "Two");
        var underway = Game(522, false, "Undecided", "One", "Two");
        var detector = new GameSounds();
        List<GameSound> Read(JsonElement game, JsonElement ui, bool onLoading = true, bool onLoaded = true) => detector.Observe(game, ui, onLoading, onLoaded);
        assert(Read(empty, menu).Count == 0, "sound monitoring begins silently in menus");
        assert(Read(start, loading).SequenceEqual([GameSound.Loading]), "fresh observed loading emits only the loading cue");
        assert(Read(start, loading).Count == 0, "repeated loading polls do not repeat the cue");
        assert(Read(start, playing).SequenceEqual([GameSound.Loaded]), "first confirmed live in-game observation emits loaded once");
        assert(Read(underway, playing).Count == 0, "ongoing match polls are silent");
        assert(Read(start, playing).SequenceEqual([GameSound.Loaded]), "same roster with a game-clock reset is a new loaded game");
        assert(Read(Game(2, false, "Undecided", "One", "Two"), playing).Count == 0, "new same-roster match remains deduplicated");
        detector = new();
        Read(empty, Ui("ScreenHome/ScreenHome", "ScreenBackgroundSC2/ScreenBackgroundSC2", "ScreenForegroundSC2/ScreenForegroundSC2", "ScreenNavigationSC2/ScreenNavigationSC2"));
        assert(Read(start, Ui("ScreenLoading/ScreenLoading")).SequenceEqual([GameSound.Loading]) && Read(start, playing).SequenceEqual([GameSound.Loaded]), "actual repeated client screen paths support loading and loaded cues");

        detector = new();
        assert(Read(underway, playing).Count == 0, "starting the companion mid-match is silent");
        assert(Read(underway, default).Count == 0 && Read(underway, playing).Count == 0, "missing UI and reconnect preserve the consumed match");
        foreach (var malformed in new[] { "{}", "{\"activeScreens\":null}", "{\"activeScreens\":[1]}", "{\"activeScreens\":[\"\"]}" })
            assert(Read(underway, JsonSerializer.Deserialize<JsonElement>(malformed)).Count == 0 && Read(underway, playing).Count == 0, "malformed UI cannot rearm game sounds: " + malformed);
        assert(Read(empty, playing).Count == 0 && Read(underway, playing).Count == 0, "transient blank game data cannot rearm loaded sounds");
        assert(Read(underway, Ui("ScreenPause")).Count == 0 && Read(underway, playing).Count == 0, "unrecognized overlays do not create a new game boundary");
        assert(Read(underway, menu).Count == 0 && Read(underway, playing).Count == 0, "menu with stale live-game data does not replay the loaded cue");

        detector = new();
        assert(Read(start, loading).Count == 0 && Read(start, playing).Count == 0, "startup during loading suppresses both existing-game cues");
        Read(empty, menu);
        assert(Read(start, playing).SequenceEqual([GameSound.Loaded]), "skipped loading screen emits loaded without fabricating loading");
        detector = new();
        assert(Read(empty, playing).Count == 0 && Read(underway, playing).Count == 0, "startup with a blank in-game sample stays silent when names arrive");
        detector.Suspend();
        assert(Read(underway, playing).Count == 0, "reenabling client polling during an existing match uses a silent baseline");

        detector = new();
        Read(underway, playing);
        assert(Read(underway, loading).Count == 0, "old live-game data during loading cannot emit a loading cue");
        assert(Read(Game(10, true, "Undecided", "ReplayOne", "ReplayTwo"), loading).Count == 0
            && Read(Game(20, true, "Undecided", "ReplayOne", "ReplayTwo"), playing).Count == 0, "delayed replay metadata suppresses loading and loaded cues");
        Read(Game(20, true, "Undecided", "ReplayOne", "ReplayTwo"), menu);
        assert(Read(start, loading).SequenceEqual([GameSound.Loading]) && Read(start, playing).SequenceEqual([GameSound.Loaded]), "a fresh live match after replay playback can emit both cues");
        foreach (var result in new[] { "Victory", "Defeat", "Win", "Loss", "Tie" })
        {
            detector = new();
            Read(empty, menu);
            var completed = Game(600, false, result, "One", "Two");
            assert(Read(completed, loading).Count == 0 && Read(completed, playing).Count == 0, "completed client match is silent: " + result);
        }
        detector = new();
        Read(empty, menu);
        var partlyFinished = JsonSerializer.Deserialize<JsonElement>("{\"isReplay\":false,\"displayTime\":600,\"players\":[{\"name\":\"One\",\"result\":\"Undecided\"},{\"name\":\"Two\",\"result\":\"Victory\"}]}");
        assert(Read(partlyFinished, loading).Count == 0 && Read(partlyFinished, playing).Count == 0, "any decided player suppresses a partially completed game");
        detector = new();
        Read(underway, playing);
        Read(underway, menu);
        assert(Read(underway, loading).Count == 0 && Read(start, loading).SequenceEqual([GameSound.Loading])
            && Read(start, playing).SequenceEqual([GameSound.Loaded]), "stale loading metadata waits for fresh same-roster clock reset");
        detector = new();
        Read(underway, playing);
        assert(Read(underway, loading).Count == 0 && Read(start, playing).SequenceEqual([GameSound.Loaded]), "late freshness after loading skips the loading cue");
        detector = new();
        Read(underway, playing);
        var changed = Game(0, false, "Undecided", "One", "Three");
        assert(Read(changed, loading).SequenceEqual([GameSound.Loading]) && Read(changed, playing).SequenceEqual([GameSound.Loaded]), "fresh roster at a loading boundary establishes another game");

        detector = new();
        Read(empty, menu, false, false);
        assert(Read(start, loading, false, true).Count == 0 && Read(start, loading, true, true).Count == 0,
            "turning loading sound on after its transition does not replay it");
        assert(Read(start, playing, false, true).SequenceEqual([GameSound.Loaded]), "loaded choice works independently with loading sound off");
        detector = new();
        Read(empty, menu);
        assert(Read(start, loading, true, false).SequenceEqual([GameSound.Loading]) && Read(start, playing, true, false).Count == 0
            && Read(underway, playing, true, true).Count == 0, "loading choice is independent and enabling loaded mid-match stays silent");

        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeSoundTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            assert(!store.Data.Settings.PingOnGameLoading && !store.Data.Settings.PingOnGameLoaded, "new game sound choices default off");
            store.Data.Settings.LiveWatch = store.Data.Settings.ScreenWatch = store.Data.Settings.Sound = false;
            store.Data.Settings.PingOnGameLoading = store.Data.Settings.PingOnGameLoaded = true;
            int notices = 0;
            var sounds = new List<GameSound>();
            var lobby = new LobbyService(store, (_, _, _) => notices++, sounds.Add);
            lobby.ApplyGameSoundObservation(empty, menu);
            lobby.ApplyGameSoundObservation(start, loading);
            lobby.ApplyGameSoundObservation(start, playing);
            assert(sounds.SequenceEqual([GameSound.Loading, GameSound.Loaded]) && notices == 0,
                "game sounds work with roster watches and marked-player sound off without warning balloons");
            store.Save();
            var restored = new Store(path);
            assert(restored.Data.Settings.PingOnGameLoading && restored.Data.Settings.PingOnGameLoaded
                && !restored.Data.Settings.Sound && !restored.Data.Settings.LiveWatch && !restored.Data.Settings.ScreenWatch, "independent sound choices survive persistence without changing watch or alert settings");
            var legacy = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(Path.Combine(path, "library.json")))!;
            legacy["settings"]!.AsObject().Remove("pingOnGameLoading");
            legacy["settings"]!.AsObject().Remove("pingOnGameLoaded");
            File.WriteAllText(Path.Combine(path, "library.json"), legacy.ToJsonString(Store.Json));
            var legacyStore = new Store(path);
            assert(!legacyStore.Data.Settings.PingOnGameLoading && !legacyStore.Data.Settings.PingOnGameLoaded && !legacyStore.Data.Settings.Sound,
                "legacy libraries acquire silent defaults and preserve existing settings");
        }
        finally { Directory.Delete(path, true); }

        var request = JsonSerializer.Deserialize<SoundSettingsRequest>("{\"loading\":true,\"loaded\":false}", Store.Json)!;
        assert(request.Loading && !request.Loaded, "dedicated sound request binds both independent boolean choices");
        foreach (var invalid in new[] { "{}", "{\"loading\":true}", "{\"loaded\":false}", "{\"loading\":true,\"loaded\":false,\"sound\":false}", "{\"loading\":\"true\",\"loaded\":false}", "{\"loading\":null,\"loaded\":false}" })
        {
            bool rejected = false;
            try { JsonSerializer.Deserialize<SoundSettingsRequest>(invalid, Store.Json); } catch (JsonException) { rejected = true; }
            assert(rejected, "sound settings reject missing, unrelated or nonboolean values: " + invalid);
        }
    }
}
