using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace DirectStrikeCompanion;

internal static class NotificationSoundTests
{
    internal static void Run(Action<bool, string> assert)
    {
        Preferences(assert);
        GeneralSettingsPreserveAudio(assert);
        PerEventPreferences(assert);
        QueuePolicy(assert);
        Waveforms(assert);
        Acceptance(assert);
    }

    private static bool SamePreferences(LobbyPreferencesRequest left, LobbyPreferencesRequest right) =>
        JsonSerializer.Serialize(left with { Styles = left.Styles ?? new() }, Store.Json) == JsonSerializer.Serialize(right with { Styles = right.Styles ?? new() }, Store.Json);

    private static void GeneralSettingsPreserveAudio(Action<bool, string> assert)
    {
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeNotificationTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            // Capture a general form before the separate Sounds page saves.
            store.Data.Settings.Sound = false;
            store.Data.Settings.NotificationSoundStyles = new() { ["accept"] = "sc1-nuclear" };
            var stale = JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(store.Data.Settings, Store.Json), Store.Json)!;
            stale.Language = "ru";
            stale.ReplayFolders = [path];
            stale.SelfIds = ["2-S2-1-99"];
            stale.ScreenWatch = true;
            stale.LiveWatch = false;
            stale.ListAlerts["friends"] = true;
            stale.AutoAcceptMatch = true;
            stale.AutoPickCommander = "Nova";

            var latest = new LobbyPreferencesRequest(true, true, true, false, "Random", true, "sc2-research", 20,
                new() { ["accept"] = "sc2-nuclear", ["loading"] = "sc2-research", ["loaded"] = "sc2-warp", ["marked"] = "sc2-evolution" });
            latest.Apply(store);
            var previousSettings = store.Data.Settings;
            lock (store.Gate)
            {
                NotificationSounds.PreservePreferences(store.Data.Settings, stale);
                store.Data.Settings = stale;
            }
            store.Save();

            var restored = new Store(path).Data.Settings;
            assert(SamePreferences(LobbyPreferencesRequest.FromSettings(restored), latest with { AutoAcceptMatch = true, AutoPickCommander = "Nova" }),
                "stale general settings retain all seven current sound fields while saving general automation choices");
            assert(restored.Language == "ru" && restored.ReplayFolders.SequenceEqual([path]) && restored.SelfIds.SequenceEqual(["2-S2-1-99"])
                && restored.ScreenWatch && !restored.LiveWatch && restored.ListAlerts["friends"],
                "preserving current audio does not prevent general language folders accounts watch or list settings from changing");
            previousSettings.NotificationSoundStyles["accept"] = "sc1-upgrade";
            assert(store.Data.Settings.NotificationSoundStyles["accept"] == "sc2-nuclear",
                "general replacement retains a detached copy of the current event sound dictionary");

            // The opposite interleaving still lets a later Sounds save win.
            var later = latest with { Loaded = false, Sound = false, Preset = "sc1-research", Volume = 65, Styles = new() };
            later.Apply(store);
            assert(SamePreferences(LobbyPreferencesRequest.FromSettings(new Store(path).Data.Settings), later),
                "a later Sounds save can replace preserved audio after a general settings save");
        }
        finally { Directory.Delete(path, true); }
    }

    private static void PerEventPreferences(Action<bool, string> assert)
    {
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeNotificationTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            var styles = new Dictionary<string, string> { ["accept"] = "sc2-nuclear", ["loading"] = "sc2-research", ["loaded"] = "sc2-warp", ["marked"] = "sc2-evolution" };
            var request = new LobbyPreferencesRequest(true, true, true, false, "", true, "sc2-upgrade", 50, styles);
            var applied = request.Apply(store);
            styles["accept"] = "sc2-pylons";
            applied.Styles!["loaded"] = "sc2-pylons";
            var restored = new Store(path);
            assert(NotificationSounds.SelectedPreset(restored.Data.Settings, GameSound.Accept) == "sc2-nuclear"
                && NotificationSounds.SelectedPreset(restored.Data.Settings, GameSound.Loading) == "sc2-research"
                && NotificationSounds.SelectedPreset(restored.Data.Settings, GameSound.Loaded) == "sc2-warp"
                && NotificationSounds.SelectedPreset(restored.Data.Settings, GameSound.Marked) == "sc2-evolution",
                "four independent event recordings persist without mutable request/projection aliases");
            var legacy = request with { Styles = null };
            legacy.Apply(store);
            assert(store.Data.Settings.NotificationSoundStyles["loaded"] == "sc2-warp", "legacy clients preserve per-event selections when styles are omitted");
            var before = File.ReadAllText(Path.Combine(path, "library.json"));
            foreach (var invalid in new[] { new Dictionary<string, string> { ["unknown"] = "sc2-warp" }, new Dictionary<string, string> { ["accept"] = "soft" }, new Dictionary<string, string> { ["accept"] = null! } })
            {
                bool rejected = false;
                try { (request with { Styles = invalid }).Apply(store); } catch (ArgumentException) { rejected = true; }
                assert(rejected && File.ReadAllText(Path.Combine(path, "library.json")) == before, "invalid event sound selections cannot alter durable preferences");
            }
            using (var blocked = new FileStream(Path.Combine(path, "library.json.tmp"), FileMode.Create, FileAccess.ReadWrite, FileShare.None))
            {
                try { (request with { Styles = new() }).Apply(store); } catch (IOException) { }
            }
            assert(store.Data.Settings.NotificationSoundStyles["accept"] == "sc2-nuclear", "failed save rolls back event sounds along with all other preferences");
            (request with { Styles = new() }).Apply(store);
            assert(Enum.GetValues<GameSound>().All(cue => NotificationSounds.SelectedPreset(store.Data.Settings, cue) == "sc2-upgrade"), "reset event styles uses the global StarCraft selection");
            store.Data.Settings.NotificationSoundPreset = "soft";
            assert(NotificationSounds.SelectedPreset(store.Data.Settings, GameSound.Marked) == "sc2-nuclear", "older synthesized defaults fall back to actual SC2 audio");
        }
        finally { Directory.Delete(path, true); }
    }

    private static void Preferences(Action<bool, string> assert)
    {
        var defaults = new Settings();
        assert(!defaults.PingOnMatchAccept && defaults.NotificationSoundPreset == "sc2-nuclear" && defaults.NotificationSoundVolume == 55,
            "accept sound defaults off with a genuine SC2 recording and moderate volume");
        var path = Path.Combine(Path.GetTempPath(), "DirectStrikeNotificationTests", Guid.NewGuid().ToString());
        var store = new Store(path);
        try
        {
            store.Data.Settings.Language = "ru";
            store.Data.Settings.ReplayFolders = [path];
            store.Data.Settings.SelfIds = ["2-S2-1-99"];
            store.Data.Settings.ScreenWatch = true;
            store.Data.Marks["2-S2-1-99"] = new("2-S2-1-99", "Private name", "Private note", DateTime.UtcNow);
            store.Data.Settings.ListAlerts["friends"] = true;
            store.Data.Settings.SortPreferences["players"] = new("name", "asc");
            string Unrelated(Database database)
            {
                var node = JsonNode.Parse(JsonSerializer.Serialize(database, Store.Json))!;
                foreach (var key in new[] { "pingOnGameLoading", "pingOnGameLoaded", "pingOnMatchAccept", "autoAcceptMatch", "autoPickCommander", "sound", "notificationSoundPreset", "notificationSoundVolume" })
                    node["settings"]!.AsObject().Remove(key);
                return node.ToJsonString(Store.Json);
            }
            var before = Unrelated(store.Data);
            var request = new LobbyPreferencesRequest(true, false, true, false, "Random", false, "clear", 37);
            store.Save();
            var publishedBefore = store.Snapshot();
            assert(SamePreferences(request.Apply(store), request), "live preferences returns the exact validated projection");
            assert(store.Snapshot(minimumInterval: TimeSpan.FromSeconds(15)).Version == publishedBefore.Version
                && SamePreferences(LobbyPreferencesRequest.FromSettings(store.Data.Settings), request),
                "current lobby preference projection stays fresh while the library snapshot is throttled");
            var restored = new Store(path);
            var settings = restored.Data.Settings;
            assert(settings.PingOnGameLoading && !settings.PingOnGameLoaded && settings.PingOnMatchAccept && !settings.AutoAcceptMatch
                && settings.AutoPickCommander == "Random" && !settings.Sound && settings.NotificationSoundPreset == "clear" && settings.NotificationSoundVolume == 37,
                "all eight Live Lobby preferences persist across restart");
            assert(Unrelated(restored.Data) == before, "live preference patch preserves folders accounts watch settings notes lists and sorting");
            var diskBefore = File.ReadAllText(Path.Combine(path, "library.json"));
            var memoryBefore = JsonSerializer.Serialize(store.Data, Store.Json);
            bool saveFailed = false;
            using (var blockedTemp = new FileStream(Path.Combine(path, "library.json.tmp"), FileMode.Create, FileAccess.ReadWrite, FileShare.None))
            {
                try { (request with { Loading = false, Loaded = true, Accept = false, AutoAcceptMatch = true, AutoPickCommander = "Raynor", Sound = true, Preset = "classic", Volume = 90 }).Apply(store); }
                catch (IOException) { saveFailed = true; }
            }
            assert(saveFailed && !store.Data.Settings.AutoAcceptMatch && SamePreferences(LobbyPreferencesRequest.FromSettings(store.Data.Settings), request)
                && JsonSerializer.Serialize(store.Data, Store.Json) == memoryBefore && File.ReadAllText(Path.Combine(path, "library.json")) == diskBefore,
                "failed preference save restores all eight memory fields and keeps automatic acceptance off and durable preferences intact");
            var journalStore = new Store(Path.Combine(path, "journal-locked"));
            journalStore.Save();
            var replay = new Match("notification-journal-fixture", "fixture.SC2Replay", "Direct Strike", "Commanders", DateTime.UtcNow, 600, 1,
                Enumerable.Range(1, 6).Select(i => new ReplayPlayer("2-S2-1-" + i, "Player " + i, i <= 3 ? 1 : 2, "Raynor", i <= 3 ? "Win" : "Loss", 0, 0, 0)).ToList());
            journalStore.CommitReplay(new("fixture.SC2Replay", 1234, replay));
            var journalPath = Path.Combine(journalStore.DirectoryPath, "replay-completions.jsonl");
            var journalBefore = File.ReadAllText(journalPath);
            bool committed = false;
            using (var blockedJournal = new FileStream(journalPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
                committed = SamePreferences(request.Apply(journalStore), request);
            var journalRestored = new Store(journalStore.DirectoryPath);
            assert(committed && SamePreferences(LobbyPreferencesRequest.FromSettings(journalRestored.Data.Settings), request)
                && File.ReadAllText(journalPath) == journalBefore && journalRestored.Data.Matches.Count == 1
                && journalRestored.Data.Files.GetValueOrDefault("fixture.SC2Replay") == 1234 && journalRestored.RecoveryNotice != null,
                "locked journal defers compaction after durable preference save and retained completion records recover idempotently on restart");
            foreach (var invalid in new[] { request with { Preset = "LOUD" }, request with { Preset = null! }, request with { Volume = -1 }, request with { Volume = 101 }, request with { AutoPickCommander = "raynor" }, request with { AutoPickCommander = null! } })
            {
                bool rejected = false;
                try { invalid.Apply(store); } catch (ArgumentException) { rejected = true; }
                assert(rejected && JsonSerializer.Serialize(store.Data, Store.Json) == memoryBefore && File.ReadAllText(Path.Combine(path, "library.json")) == diskBefore,
                    "invalid preference patch preserves memory and disk: " + JsonSerializer.Serialize(invalid, Store.Json));
            }
            var payload = JsonNode.Parse(JsonSerializer.Serialize(request, Store.Json))!.AsObject();
            foreach (var field in payload.Select(p => p.Key).Where(field => field != "styles").ToArray())
            {
                var missing = payload.DeepClone().AsObject(); missing.Remove(field);
                bool rejected = false;
                try { JsonSerializer.Deserialize<LobbyPreferencesRequest>(missing.ToJsonString(), Store.Json); } catch (JsonException) { rejected = true; }
                assert(rejected, "live preferences requires field " + field);
            }
            foreach (var patch in new Action<JsonObject>[]
            {
                n => n["unknown"] = true, n => n["loading"] = "true", n => n["accept"] = null,
                n => n["volume"] = "55", n => n["volume"] = 55.5, n => n["autoPickCommander"] = 12
            })
            {
                var malformed = payload.DeepClone().AsObject(); patch(malformed);
                bool rejected = false;
                try { JsonSerializer.Deserialize<LobbyPreferencesRequest>(malformed.ToJsonString(), Store.Json); } catch (JsonException) { rejected = true; }
                assert(rejected, "live preferences rejects invalid JSON types or unrelated fields: " + malformed.ToJsonString());
            }
            var legacy = JsonNode.Parse(diskBefore)!;
            legacy["settings"]!.AsObject().Remove("pingOnMatchAccept");
            legacy["settings"]!.AsObject().Remove("notificationSoundPreset");
            legacy["settings"]!.AsObject().Remove("notificationSoundVolume");
            File.WriteAllText(Path.Combine(path, "library.json"), legacy.ToJsonString(Store.Json));
            restored = new Store(path);
            assert(!restored.Data.Settings.PingOnMatchAccept && restored.Data.Settings.NotificationSoundPreset == "sc2-nuclear" && restored.Data.Settings.NotificationSoundVolume == 55
                && Unrelated(restored.Data) == before && restored.Data.Settings.PingOnGameLoading && !restored.Data.Settings.Sound,
                "legacy libraries receive sound defaults and retain all existing library data and choices");
            var previewBefore = JsonSerializer.Serialize(restored.Data, Store.Json);
            foreach (var cue in new[] { "accept", "loading", "loaded", "marked" })
                new SoundPreviewRequest(cue, "soft", 55).Validate();
            assert(JsonSerializer.Serialize(restored.Data, Store.Json) == previewBefore, "preview validation never modifies preferences or library data");
            foreach (var invalid in new[] { new SoundPreviewRequest("unknown", "soft", 55), new("accept", "wrong", 55), new("accept", "soft", 101), new(null!, "soft", 55) })
            {
                bool rejected = false;
                try { invalid.Validate(); } catch (ArgumentException) { rejected = true; }
                assert(rejected, "invalid preview choice rejected");
            }
            foreach (var malformed in new[] { "{}", "{\"cue\":\"accept\",\"preset\":\"soft\"}", "{\"cue\":\"accept\",\"preset\":\"soft\",\"volume\":\"55\"}", "{\"cue\":\"accept\",\"preset\":\"soft\",\"volume\":55,\"sound\":false}" })
            {
                bool rejected = false;
                try { JsonSerializer.Deserialize<SoundPreviewRequest>(malformed, Store.Json); } catch (JsonException) { rejected = true; }
                assert(rejected, "preview requires strict complete payload: " + malformed);
            }
        }
        finally { Directory.Delete(path, true); }
    }

    private static void QueuePolicy(Action<bool, string> assert)
    {
        var queue = new NotificationSoundQueue();
        for (int i = 1; i <= 100; i++) queue.Enqueue(new(GameSound.Loaded, "soft", i, Preview: true));
        assert(queue.Count == 1 && queue.Dequeue() is { Volume: 100, Preview: true }, "rapid previews coalesce to one latest pending choice");
        queue.Enqueue(new(GameSound.Loading, "soft", 55, Preview: true));
        for (int i = 0; i < NotificationSounds.QueueLimit; i++) queue.Enqueue(new(GameSound.Marked, "clear", 55));
        assert(queue.Count == NotificationSounds.QueueLimit, "event queue remains bounded while marked events replace pending preview");
        assert(queue.Enqueue(new(GameSound.Accept, "soft", 55)) && queue.Count == NotificationSounds.QueueLimit
            && queue.Dequeue() is { Cue: GameSound.Accept, Preview: false }, "genuine accept cue displaces lower priority sounds and plays first even at capacity");
        int remainingAccepts = 0;
        while (queue.Count > 0) if (queue.Dequeue().Cue == GameSound.Accept) remainingAccepts++;
        assert(remainingAccepts == 0, "queue schedules an admitted accept event once without duplicating playback");
        queue.Enqueue(new(GameSound.Marked, "soft", 55));
        queue.Enqueue(new(GameSound.Loading, "soft", 55));
        queue.Enqueue(new(GameSound.Loaded, "soft", 55));
        queue.Enqueue(new(GameSound.Accept, "soft", 55));
        assert(!queue.Enqueue(new(GameSound.Accept, "classic", 55, Preview: true)) && queue.Count == NotificationSounds.QueueLimit,
            "even an accept-cue preview cannot evict a genuine event from a full queue");
        assert(queue.Dequeue().Cue == GameSound.Accept && queue.Dequeue().Cue == GameSound.Loading
            && queue.Dequeue().Cue == GameSound.Loaded && queue.Dequeue().Cue == GameSound.Marked,
            "event priority preserves accept first then loading and loaded arrival order then marked sound");
    }

    private static void Waveforms(Action<bool, string> assert)
    {
        var paletteSignatures = new HashSet<string>();
        foreach (var preset in NotificationSounds.Presets.Where(p => !Sc2SoundClips.Contains(p)))
        {
            var signatures = new HashSet<string>();
            foreach (var cue in Enum.GetValues<GameSound>())
            {
                var wav = NotificationSounds.Generate(cue, preset, 100);
                short[] Samples(byte[] bytes) => Enumerable.Range(0, (bytes.Length - 44) / 2).Select(i => BitConverter.ToInt16(bytes, 44 + i * 2)).ToArray();
                var samples = Samples(wav);
                assert(Encoding.ASCII.GetString(wav, 0, 4) == "RIFF" && Encoding.ASCII.GetString(wav, 8, 8) == "WAVEfmt "
                    && BitConverter.ToInt32(wav, 4) == wav.Length - 8 && BitConverter.ToInt16(wav, 20) == 1
                    && BitConverter.ToInt16(wav, 22) == 1 && BitConverter.ToInt32(wav, 24) == NotificationSounds.SampleRate
                    && BitConverter.ToInt32(wav, 28) == NotificationSounds.SampleRate * 2 && BitConverter.ToInt16(wav, 32) == 2
                    && BitConverter.ToInt16(wav, 34) == 16 && BitConverter.ToInt32(wav, 40) == wav.Length - 44,
                    "valid mono 16-bit PCM WAV header: " + preset + "/" + cue);
                assert(wav.Length < 27000 && samples.Length > 5000 && samples.Max(s => Math.Abs((int)s)) is > 1000 and < 16000,
                    "notification duration and sample peak remain short and below clipping: " + preset + "/" + cue);
                assert(samples.Take(20).Max(s => Math.Abs((int)s)) < 1000 && samples.TakeLast(100).Max(s => Math.Abs((int)s)) < 100,
                    "notification attack and release settle gently to silence: " + preset + "/" + cue);
                assert(Samples(NotificationSounds.Generate(cue, preset, 0)).All(s => s == 0), "zero volume is silent: " + preset + "/" + cue);
                var half = Samples(NotificationSounds.Generate(cue, preset, 50));
                assert(samples.Zip(half, (full, part) => Math.Abs(full / 2.0 - part)).All(delta => delta <= 1), "volume scales every PCM sample: " + preset + "/" + cue);
                signatures.Add(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(wav)));
                paletteSignatures.Add(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(wav)));
            }
            assert(signatures.Count == 4, "all four event cues have distinct audio: " + preset);
        }
        assert(paletteSignatures.Count == 36, "all nine original palettes and their four event cues have distinct PCM waveforms");
    }

    private static void Acceptance(Action<bool, string> assert)
    {
        var now = new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc);
        JsonElement Game(bool replay = false) => JsonSerializer.SerializeToElement(new { isReplay = replay, displayTime = 0, players = Array.Empty<object>() });
        JsonElement Ui(params string[] screens) => JsonSerializer.SerializeToElement(new { activeScreens = screens });
        object Line(string text, int x, int y, int width) => new { text, words = new[] { new { text, x, y, width, height = 24 } } };
        JsonElement Frame(DateTime at, bool foreground = true, bool obscured = false, bool popup = true, long window = 123) => JsonSerializer.SerializeToElement(new
        {
            capture = new { live = true, capturedAt = at, windowHandle = window, processId = 456, processName = "SC2_x64", foreground, unobscured = !obscured, bounds = new { left = 0, top = 0, right = 1000, bottom = 800 }, width = 1000, height = 800 },
            screenReadings = new[] { new { language = "en-GB", lines = popup ? new[] { Line("Match Found", 400, 230, 160), Line("Accept", 340, 360, 80), Line("Decline", 550, 360, 90) } : Array.Empty<object>() } }
        }, Store.Json);
        var sounds = new MatchAcceptSounds();
        sounds.ObserveClient(Game(), Ui("ScreenHome", "ScreenLobby"), true, now);
        assert(sounds.ObserveScreen(Frame(now), true, now), "recognized accept opportunity sounds with automatic input disabled");
        assert(!sounds.ObserveScreen(Frame(now), true, now), "same accept opportunity never repeats");
        var next = now.AddSeconds(1);
        sounds.ObserveClient(Game(), Ui("ScreenLobby", "ScreenHome", "ScreenHome"), true, next);
        sounds.ObserveScreen(Frame(next, popup: false), true, next);
        assert(!sounds.ObserveScreen(Frame(next), true, next), "same normalized menu set and OCR miss cannot rearm the accept cue");
        next = next.AddSeconds(1);
        sounds.ObserveClient(Game(), Ui("ScreenUnknown"), true, next);
        assert(!sounds.ObserveScreen(Frame(next), true, next), "unknown overlays cannot rearm the consumed accept cue");
        next = next.AddSeconds(1);
        sounds.ObserveClient(default, default, false, next);
        assert(!sounds.ObserveScreen(Frame(next), true, next), "disconnected client suppresses accept sound");
        sounds.ObserveClient(Game(), Ui("ScreenHome", "ScreenLobby"), true, next);
        assert(!sounds.ObserveScreen(Frame(next), true, next), "reconnection with same popup retains its consumed cue");
        next = next.AddSeconds(1);
        sounds.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        assert(sounds.ObserveScreen(Frame(next), true, next) && !sounds.ObserveScreen(Frame(next), true, next), "later affirmative known-menu transition rearms exactly one accept sound");
        sounds = new();
        var oldFrame = Frame(now);
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(sounds.ObserveScreen(oldFrame, true, now), "first Home popup frame consumes one accept sound");
        sounds.ObserveClient(Game(), Ui("ScreenLobby"), true, now.AddSeconds(1));
        assert(!sounds.ObserveScreen(oldFrame, true, now.AddSeconds(1)), "menu rearm rejects the previously consumed OCR frame from before its boundary");
        assert(sounds.ObserveScreen(Frame(now.AddSeconds(1)), true, now.AddSeconds(1)), "new OCR frame at the menu rearm boundary permits one new accept sound");
        sounds = new();
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(!sounds.ObserveScreen(Frame(now), false, now) && !sounds.ObserveScreen(Frame(now), true, now), "enabling accept sound after recognition does not replay an existing opportunity");
        sounds = new();
        sounds.ObserveClient(Game(true), Ui("ScreenHome"), true, now);
        assert(!sounds.ObserveScreen(Frame(now), true, now), "replay metadata suppresses even a recognized accept layout");
        sounds.ObserveClient(Game(), Ui("ScreenLoading"), true, now);
        assert(!sounds.ObserveScreen(Frame(now), true, now), "loading suppresses stale accept OCR");
        sounds.ObserveClient(Game(), Ui(), true, now);
        assert(!sounds.ObserveScreen(Frame(now), true, now), "in-game state cannot produce an accept sound");
        sounds = new();
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(sounds.ObserveScreen(Frame(now, foreground: false), true, now)
            && !sounds.ObserveScreen(Frame(now, foreground: false), true, now)
            && !sounds.ObserveScreen(Frame(now.AddSeconds(1)), true, now.AddSeconds(1)), "visible unobscured background popup sounds once; bringing SC2 forward does not replay its cue");
        sounds = new();
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(!sounds.ObserveScreen(Frame(now, obscured: true), true, now), "accept audio still rejects covered SC2 proof");
        assert(!sounds.ObserveScreen(Frame(now.AddSeconds(-19)), true, now), "accept audio rejects expired OCR proof");
        assert(!sounds.ObserveScreen(Frame(now.AddSeconds(1)), true, now), "accept audio rejects future OCR proof");
        assert(!sounds.ObserveScreen(Frame(now.AddSeconds(9)), true, now.AddSeconds(9)), "accept audio rejects stale client state");
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now.AddSeconds(20));
        assert(sounds.ObserveScreen(Frame(now.AddSeconds(20)), true, now.AddSeconds(20)), "fresh foreground proof sounds after previously rejected observations");
        sounds.ObserveClient(Game(), Ui("ScreenLoading"), true, now.AddSeconds(21));
        sounds.ObserveClient(Game(), Ui("ScreenHome"), true, now.AddSeconds(22));
        assert(sounds.ObserveScreen(Frame(now.AddSeconds(22)), true, now.AddSeconds(22)), "genuine loading and menu boundary permits the next match opportunity");
    }
}
