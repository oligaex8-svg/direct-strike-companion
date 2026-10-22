using System.Text.Json;

namespace DirectStrikeCompanion;

public enum GameSound { Loading, Loaded, Accept, Marked }

// Sound lifecycle is separate from roster/marked-player detection. Invalid or
// missing observations preserve the last session, rather than rearming it.
internal sealed class GameSounds
{
    private enum Screen { Unknown, Menu, Loading, InGame, Other }
    private sealed record Game(string Roster, double Clock, bool Replay, bool Decided)
    {
        internal bool Live => Roster.Length > 0 && !Replay && !Decided;
    }
    private bool initialized;
    private Screen screen;
    private Game? reference;
    private bool startupLoading;
    private bool startupInGame;
    private bool loadingConsumed;
    private bool pendingLoaded;

    // If client polling was disabled, its first resumed sample is a baseline.
    internal void Suspend()
    {
        initialized = false;
        screen = Screen.Unknown;
        reference = null;
        startupLoading = startupInGame = loadingConsumed = pendingLoaded = false;
    }

    internal List<GameSound> Observe(JsonElement gameJson, JsonElement uiJson, bool loadingEnabled, bool loadedEnabled)
    {
        var next = ReadScreen(uiJson);
        var game = ReadGame(gameJson);
        if (next is Screen.Unknown or Screen.Other || game == null) return [];
        if (!initialized)
        {
            initialized = true;
            screen = next;
            reference = game;
            startupLoading = next == Screen.Loading;
            startupInGame = next == Screen.InGame && !game.Live;
            loadingConsumed = true;
            return [];
        }

        if (next == Screen.Menu)
        {
            // A real menu can establish an empty/finished/replay baseline. A
            // live record here can still belong to the game just left.
            if (!game.Live) reference = game;
            startupLoading = startupInGame = pendingLoaded = false;
            screen = next;
            return [];
        }

        bool enteringLoading = next == Screen.Loading && screen != Screen.Loading;
        if (enteringLoading) { loadingConsumed = false; startupInGame = false; }
        var sounds = new List<GameSound>();
        if (!game.Live)
        {
            if (game.Roster.Length > 0)
            {
                reference = game;
                pendingLoaded = false;
            }
            // Blank in-game samples are not a menu or a new-game boundary.
            screen = next;
            return sounds;
        }

        bool fresh = reference == null || reference.Roster.Length == 0 || reference.Replay || reference.Decided
            || game.Clock + 5 < reference.Clock
            || (screen is Screen.Menu or Screen.Loading || next == Screen.Loading) && game.Roster != reference.Roster;
        if (next == Screen.Loading)
        {
            if (fresh)
            {
                reference = game;
                pendingLoaded = true;
            }
            // /game often lags /ui. Never sound for an old live/replay record
            // solely because ScreenLoading appeared. If freshness arrives only
            // after loading vanished, only the independent loaded cue can fire.
            if (pendingLoaded && !loadingConsumed)
            {
                loadingConsumed = true;
                if (!startupLoading && loadingEnabled) sounds.Add(GameSound.Loading);
            }
        }
        else
        {
            if (!startupLoading && !startupInGame && (fresh || pendingLoaded) && loadedEnabled) sounds.Add(GameSound.Loaded);
            reference = game;
            startupLoading = startupInGame = pendingLoaded = false;
            loadingConsumed = true;
        }
        screen = next;
        return sounds;
    }

    private static Screen ReadScreen(JsonElement json)
    {
        var names = Sc2ClientUi.ReadScreens(json);
        if (names == null) return Screen.Unknown;
        if (names.Count == 0) return Screen.InGame;
        if (names.Contains("ScreenLoading")) return Screen.Loading;
        return Sc2ClientUi.IsMenu(names) ? Screen.Menu : Screen.Other;
    }

    private static Game? ReadGame(JsonElement json)
    {
        if (json.ValueKind != JsonValueKind.Object || !json.TryGetProperty("isReplay", out var replay)
            || replay.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
            || !json.TryGetProperty("displayTime", out var time) || time.ValueKind != JsonValueKind.Number
            || !time.TryGetDouble(out var clock) || !double.IsFinite(clock) || clock < 0
            || !json.TryGetProperty("players", out var players) || players.ValueKind != JsonValueKind.Array) return null;
        var names = new List<string>();
        bool decided = false;
        foreach (var player in players.EnumerateArray())
        {
            if (player.ValueKind != JsonValueKind.Object || !player.TryGetProperty("name", out var name)
                || name.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(name.GetString())
                || !player.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.String) return null;
            var outcome = result.GetString();
            if (outcome is not ("Undecided" or "Win" or "Loss" or "Victory" or "Defeat" or "Tie")) return null;
            decided |= outcome != "Undecided";
            names.Add(name.GetString()!);
        }
        return new(names.Count == 0 ? "" : JsonSerializer.Serialize(names.Order(StringComparer.Ordinal)), clock, replay.GetBoolean(), decided);
    }
}

// Reuse the exact automation recognizer with input disabled. Sound consumption
// remains independent of whether the user chooses automatic acceptance.
internal sealed class MatchAcceptSounds
{
    private readonly Sc2Automation recognition = new();
    private HashSet<string>? screens, consumedScreens;
    private DateTime clientAt, consumedAt, consumedFrameAt, rearmBoundary;
    private long window;
    private bool consumed;
    private readonly HashSet<string> consumedKinds = new(StringComparer.Ordinal);

    internal void ObserveClient(JsonElement game, JsonElement ui, bool connected, DateTime now)
    {
        recognition.ObserveClient(game, ui, connected, now);
        bool validGame = game.ValueKind == JsonValueKind.Object && game.TryGetProperty("isReplay", out var replay)
            && replay.ValueKind is JsonValueKind.True or JsonValueKind.False;
        var next = Sc2ClientUi.ReadScreens(ui);
        bool validUi = next != null;
        if (connected && validGame && validUi && !game.GetProperty("isReplay").GetBoolean())
        {
            bool phaseChanged = next!.Count == 0 || next.Contains("ScreenLoading");
            bool menuChanged = consumed && now >= clientAt && now > consumedAt && consumedScreens != null
                && Sc2ClientUi.MenuChanged(consumedScreens, next);
            if (now >= clientAt && (phaseChanged || menuChanged))
            {
                consumed = false;
                consumedKinds.Clear();
                rearmBoundary = now;
            }
        }
        screens = next;
        clientAt = now;
    }

    internal bool ObserveScreen(JsonElement result, bool enabled, DateTime now)
    {
        recognition.ObserveScreen(result, new Settings(), now);
        if (consumedKinds.Count > 0 && recognition.AcceptAbsentFrame is { } absentAt && absentAt > consumedFrameAt && absentAt >= rearmBoundary)
        {
            rearmBoundary = absentAt;
            consumed = false;
            consumedKinds.Clear();
        }
        if (recognition.AcceptRearmBoundary > rearmBoundary)
        {
            rearmBoundary = recognition.AcceptRearmBoundary;
            consumed = false;
            consumedKinds.Clear();
        }
        var snapshot = recognition.SnapshotAt(now);
        if (!snapshot.AcceptNeeded) return false;
        var capture = Sc2Automation.ReadCapture(result)!;
        // A new menu observation cannot turn an older OCR frame into evidence
        // for the next popup. Require a new frame from this queue boundary.
        if (capture.CapturedAt < rearmBoundary || capture.CapturedAt <= consumedFrameAt) return false;
        if (capture.WindowHandle != window) { consumed = false; consumedKinds.Clear(); window = capture.WindowHandle; }
        if (!consumedKinds.Add(snapshot.AcceptKind!)) return false;
        consumed = true;
        consumedScreens = screens == null ? null : new(screens, StringComparer.Ordinal);
        consumedAt = now;
        consumedFrameAt = capture.CapturedAt;
        return enabled;
    }
}
