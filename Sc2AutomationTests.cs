using System.Text.Json;
using System.Text.Json.Nodes;
using static DirectStrikeCompanion.Sc2Automation;

namespace DirectStrikeCompanion;

internal static class Sc2AutomationTests
{
    private sealed class FixtureInput : ISc2Input, ISc2BackgroundInput, ISc2ScrollInput
    {
        internal int Clicks;
        internal bool ChangedPixels;
        internal bool ChangedContext;
        internal uint DeliveredEvents = 3;
        internal bool BackgroundEnabled;
        internal int HardwareClicks;
        internal int WindowClicks;
        internal List<int> Scrolls = [];
        internal List<ScreenBox> Targets = [];
        internal WindowProof Current = new(123, 456, "SC2_x64", "SC2_x64.exe", true, true, false, true, new(0, 0, 1000, 800));
        public InputResult TryScroll(ScreenCapture capture, ScreenControl target, int delta, DateTime now)
        {
            var reason = InputBlockReason(capture, target.Bounds, Current, now);
            if (reason != null || ChangedPixels || ChangedContext || target.HeadingProof == null || target.TargetProof == null
                || target.ContextProofs?.Any(p => p == null || !p.Valid(Current.Bounds)) == true)
                return new(false, false, reason ?? "Changed dropdown proof · no scroll");
            Scrolls.Add(delta); return new(true, true, "Scroll delivered");
        }
        public InputResult TryClick(ScreenCapture capture, ScreenControl target, DateTime now)
        {
            var reason = InputBlockReason(capture, target.Bounds, Current, now);
            if (reason != null) return new(false, false, reason);
            if (target.HeadingProof == null || target.TargetProof == null || ChangedPixels) return new(false, false, "SC2 control pixels changed or unavailable · no action");
            if (target.ContextProofs != null && (ChangedContext || target.ContextProofs.Any(p => p == null || !p.Valid(Current.Bounds)))) return new(false, false, "SC2 control context changed or unavailable · no action");
            Clicks++; HardwareClicks++;
            Targets.Add(target.Bounds);
            return DeliveryResult(DeliveredEvents, 3);
        }
        public InputResult TryAccept(ScreenCapture capture, ScreenControl target, DateTime now)
        {
            if (!BackgroundEnabled && !capture.Foreground) return new(false, false, "SC2 is not foreground · input paused");
            var reason = BackgroundInputBlockReason(capture, target.Bounds, Current, now);
            if (reason != null) return new(false, false, reason);
            if (target.HeadingProof == null || target.TargetProof == null || ChangedPixels) return new(false, false, "SC2 control pixels changed or unavailable · no action");
            if (ChangedContext || target.ContextProofs != null && target.ContextProofs.Any(p => p == null || !p.Valid(Current.Bounds))) return new(false, false, "SC2 control context changed or unavailable · no action");
            Clicks++; WindowClicks++; Targets.Add(target.Bounds);
            return DeliveryResult(DeliveredEvents, 3);
        }
    }
    internal static void Run(Action<bool, string> assert)
    {
        var now = new DateTime(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);
        var windowMessages = new List<uint>();
        bool heldAfterAcknowledgedDown = false;
        var windowDelivery = DeliverWindowClick(message => { windowMessages.Add(message); return true; },
            () => heldAfterAcknowledgedDown = windowMessages.SequenceEqual(new uint[] { 0x200, 0x201 }));
        assert(windowDelivery.Sent && windowDelivery.Attempted && heldAfterAcknowledgedDown
            && windowMessages.SequenceEqual(new uint[] { 0x200, 0x201, 0x202 }),
            "window click waits for acknowledged down before holding and releasing; no global input events");
        foreach (uint failure in new uint[] { 0x200, 0x201, 0x202 })
        {
            windowMessages.Clear(); bool held = false;
            var delivery = DeliverWindowClick(message => { windowMessages.Add(message); return message != failure; }, () => held = true);
            assert(!delivery.Sent && delivery.Attempted == (failure != 0x200), "window delivery reports an acknowledgement failure accurately: " + failure);
            assert(failure == 0x200 ? windowMessages.SequenceEqual(new uint[] { 0x200 })
                : windowMessages.Count(message => message == 0x202) == (failure == 0x202 ? 2 : 1),
                "failed or timed-out down always receives bounded release cleanup: " + failure);
            assert(held == (failure == 0x202), "window hold starts only after acknowledged down: " + failure);
        }
        windowMessages.Clear();
        try { DeliverWindowClick(message => { windowMessages.Add(message); return true; }, () => throw new InvalidOperationException("hold failed")); }
        catch (InvalidOperationException) { }
        assert(windowMessages.Last() == 0x202, "window release cleanup survives a hold failure");
        windowMessages.Clear(); int releases = 0;
        var recoveredWindowDelivery = DeliverWindowClick(message => { windowMessages.Add(message); return message != 0x202 || ++releases == 2; }, () => { });
        assert(recoveredWindowDelivery.Sent && releases == 2, "one failed window release can recover without another mouse down");
        foreach (bool recover in new[] { false, true })
        {
            var calls = new List<uint>();
            var delivery = DeliverHardwareClick(count => { calls.Add(count); return calls.Count == 1 ? 2u : calls.Count == 3 && recover ? 1u : 0u; }, () => { });
            assert(calls.SequenceEqual(new uint[] { 2, 1, 1 }) && delivery.Attempted && delivery.Sent == recover,
                "failed hardware release receives cleanup retry and retains accurate delivery status");
        }
        var cleanup = new List<uint>();
        try { DeliverHardwareClick(count => { cleanup.Add(count); return count; }, () => throw new InvalidOperationException("hold failed")); }
        catch (InvalidOperationException) { }
        assert(cleanup.SequenceEqual(new uint[] { 2, 1 }), "injected mouse down is released even if the hold operation fails");
        object Line(string text, int x, int y, int width = 100, int height = 24, bool acceptGold = true) => new
        {
            text, acceptGold,
            words = new[] { new { text, x, y, width, height } },
            proof = new { left = x - 2, top = y - 2, width = width + 4, height = height + 4, hash = new string('A', 64) }
        };
        object[] Popup(bool russian = false) => [Line(russian ? "Матч найден" : "Match Found", 400, 230, 160, 30), Line(russian ? "Принять" : "Accept", 340, 360, 80), Line(russian ? "Отмена" : "Decline", 550, 360, 90)];
        object[] Invite(bool russian = false, bool gold = true) => [Line(russian ? "Приглашение в игру" : "Game Invite", 400, 170, 200),
            Line(russian ? "Лидер группы пригласил вас в" : "The party leader has invited you to", 340, 350, 320),
            Line(russian ? "3v3 Командиры, Direct Strike" : "3V3 Commanders, Direct Strike", 350, 380, 300),
            Line(russian ? "Принять" : "Accept", 340, 460, 80, acceptGold: gold), Line(russian ? "Отклонить" : "Decline", 550, 460, 90)];
        object[] Lobby(bool expanded = false, bool mode = true, string name = "TKnight", string modeLabel = "3V3 Commanders", string selected = "Select", string[]? choices = null) => new[] { Line("Direct Strike", 20, 20, 180),
            Line("Horde", 20, 100), Line("Alliance", 20, 370), Line(name, 80, 210), Line(selected, 680, 220) }
            .Concat(mode ? new[] { Line(modeLabel, 820, 80, 170) } : [])
            .Concat(expanded ? (choices ?? ["Random", "Abathur", "Alarak", "Artanis", "Dehaka", "Fenix"]).Select((c, i) => Line(c, 680, 260 + i * 35)) : []).ToArray();
        object[] Party(bool gold = true) => [Line("Ваня Кузьмич invited you to a party", 500, 90, 350), Line("Accept", 540, 140, 80, acceptGold: gold), Line("Decline", 740, 140, 80)];
        object[] Menu() => [Line("CAMPAIGN", 10, 30), Line("CO-OP", 180, 30), Line("VERSUS", 360, 30), Line("CUSTOM", 530, 30)];
        object[] Grid(bool mode = true) => new[] { Line("Select Your Commander", 350, 180, 250) }
            .Concat(Commanders.Take(6).Select((c, i) => Line(c, 250 + i % 3 * 200, 320 + i / 3 * 140, 100)))
            .Concat(new[] { Line("Random", 430, 610, 100) })
            .Concat(mode ? new[] { Line("Direct Strike", 400, 70, 170), Line("3v3 Commanders", 400, 110, 170) } : []).ToArray();
        JsonElement Frame(IEnumerable<object> lines, bool live = true, DateTime? capturedAt = null, bool foreground = true) => JsonSerializer.SerializeToElement(new
        {
            capture = new { live, capturedAt = capturedAt ?? now, windowHandle = 123, processId = 456, processName = "SC2_x64", foreground, unobscured = true, bounds = new { left = 0, top = 0, right = 1000, bottom = 800 }, width = 1000, height = 800 },
            screenReadings = new[] { new { language = "en-GB", lines } }
        }, Store.Json);
        JsonElement Game(double clock = 0, bool replay = false, int count = 0, string result = "Undecided") => JsonSerializer.SerializeToElement(new { isReplay = replay, displayTime = clock, players = Enumerable.Range(0, count).Select(i => new { name = "Native player " + i, result }) }, Store.Json);
        JsonElement Ui(params string[] screens) => JsonSerializer.SerializeToElement(new { activeScreens = screens }, Store.Json);
        void Client(Sc2Automation a, JsonElement? game = null, JsonElement? ui = null) => a.ObserveClient(game ?? Game(), ui ?? Ui("ScreenHome"), true, now);
        var actualLobbyScreens = Ui("ScreenBackgroundSC2/ScreenBackgroundSC2", "ScreenHome/ScreenHome", "ScreenNavigationSC2/ScreenNavigationSC2", "ScreenForegroundSC2/ScreenForegroundSC2", "ScreenBattleLobby/ScreenBattleLobby");
        assert(Sc2ClientUi.IsMenu(Sc2ClientUi.ReadScreens(actualLobbyScreens)) && Sc2ClientUi.HasLobby(Sc2ClientUi.ReadScreens(actualLobbyScreens)), "actual client repeated paths and shell screens identify a BattleLobby menu");
        assert(!Sc2ClientUi.IsMenu(Sc2ClientUi.ReadScreens(Ui("ScreenForegroundSC2/ScreenForegroundSC2")))
            && !Sc2ClientUi.IsMenu(Sc2ClientUi.ReadScreens(Ui("Unknown/ScreenHome")))
            && !Sc2ClientUi.IsMenu(Sc2ClientUi.ReadScreens(Ui("ScreenHome/ScreenHome", "ScreenUnknown"))), "shell-only, mismatched and unknown paths never prove a menu");
        foreach (uint delivered in new uint[] { 0, 1, 2, 3 })
        {
            var result = DeliveryResult(delivered, 3);
            assert(result.Sent == (delivered == 3) && result.Attempted == (delivered > 0), "only delivered native input consumes an opportunity: " + delivered);
        }
        var defaults = new Settings();
        assert(!defaults.AutoAcceptMatch && defaults.AutoPickCommander == "", "SC2 acceptance and commander selection default off");
        var legacy = JsonNode.Parse(JsonSerializer.Serialize(defaults, Store.Json))!.AsObject();
        legacy.Remove("autoAcceptMatch"); legacy.Remove("autoPickCommander");
        var oldSettings = legacy.Deserialize<Settings>(Store.Json)!;
        assert(!oldSettings.AutoAcceptMatch && oldSettings.AutoPickCommander == "", "older settings without automation fields remain off");
        foreach (var value in Commanders.Prepend("Random").Prepend("")) ValidateSettings(new() { AutoPickCommander = value });
        foreach (var invalid in new string?[] { null, "random", "Off", " Unknown ", "Raynor\n" })
        {
            bool rejected = false;
            try { ValidateSettings(new() { AutoPickCommander = invalid! }); } catch (ArgumentException) { rejected = true; }
            assert(rejected, "unsupported commander preference rejected: " + (invalid ?? "null"));
        }
        var input = new FixtureInput();
        var automation = new Sc2Automation(input);
        Client(automation, ui: actualLobbyScreens);
        automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        assert(input.Clicks == 1, "actual full client paths permit validated own-row lobby selection");
        input = new(); automation = new(input); Client(automation, ui: actualLobbyScreens);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        var realNext = now.AddSeconds(1);
        automation.ObserveClient(Game(), Ui("ScreenHome/ScreenHome", "ScreenForegroundSC2/ScreenForegroundSC2"), true, realNext);
        automation.ObserveScreen(Frame(Invite(), capturedAt: realNext), new() { AutoAcceptMatch = true }, realNext);
        assert(input.Clicks == 2, "an affirmative real BattleLobby-to-Home path transition rearms a later invite");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLoading/ScreenLoading"));
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 0 && !automation.SnapshotAt(now).AcceptNeeded, "full client loading paths suppress acceptance");
        input = new() { DeliveredEvents = 0 }; automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        var deliveryRejected = automation.SnapshotAt(now);
        automation.ObserveScreen(Frame([]), new() { AutoAcceptMatch = true }, now);
        assert(deliveryRejected.Status.Contains("no click sent") && automation.SnapshotAt(now).LastAcceptStatus == deliveryRejected.Status, "zero delivery is recorded and remains visible after the invite disappears");
        input.DeliveredEvents = 3;
        automation.ObserveScreen(Frame(Invite(), capturedAt: realNext), new() { AutoAcceptMatch = true }, realNext);
        assert(input.Clicks == 2 && automation.SnapshotAt(realNext).Status.Contains("SC2 window"), "a zero-event rejection allows one subsequent fresh validated input attempt");
        input = new() { DeliveredEvents = 1 }; automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        automation.ObserveScreen(Frame(Invite(), capturedAt: realNext), new() { AutoAcceptMatch = true }, realNext);
        assert(input.Clicks == 1, "partially delivered input stays consumed to avoid duplicate clicks");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenHome/ScreenHome", "ScreenForegroundSC2/ScreenForegroundSC2"));
        var shellSounds = new MatchAcceptSounds();
        shellSounds.ObserveClient(Game(), Ui("ScreenHome/ScreenHome", "ScreenForegroundSC2/ScreenForegroundSC2"), true, now);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        assert(shellSounds.ObserveScreen(Frame(Invite()), true, now), "actual path invitation notifies once");
        foreach (var shellUi in new[] { Ui("ScreenHome/ScreenHome", "ScreenForegroundSC2/ScreenForegroundSC2", "ScreenBackgroundSC2/ScreenBackgroundSC2"), Ui("ScreenHome/ScreenHome", "ScreenNavigationSC2/ScreenNavigationSC2") })
        {
            automation.ObserveClient(Game(), shellUi, true, realNext);
            shellSounds.ObserveClient(Game(), shellUi, true, realNext);
            automation.ObserveScreen(Frame(Invite(), capturedAt: realNext), new() { AutoAcceptMatch = true }, realNext);
            assert(input.Clicks == (realNext - now >= TimeSpan.FromSeconds(2) ? 2 : 1) && automation.AcceptRearmBoundary == default
                && !shellSounds.ObserveScreen(Frame(Invite(), capturedAt: realNext), true, realNext), "shell changes do not rearm input or sound; a still-visible popup only receives the bounded retry");
            realNext = realNext.AddSeconds(1);
        }
        input = new(); automation = new(input);
        Client(automation);
        automation.ObserveScreen(Frame(Popup()), defaults, now);
        assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "recognized Match Found popup marks acceptance needed without enabling input");
        automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
        automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 1 && automation.SnapshotAt(now).Status.Contains("waiting for SC2 confirmation"), "opt-in acceptance sends one fixture click per popup and does not claim a confirmed result");
        assert(!automation.SnapshotAt(now.AddSeconds(19)).AcceptNeeded, "accept-needed marker expires after eighteen seconds without fresh capture");
        input = new(); automation = new(input);
        automation.ObserveClient(Game(), Ui("ScreenLobby", "ScreenHome", "ScreenLobby"), true, now);
        automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
        var next = now.AddSeconds(1);
        automation.ObserveClient(Game(), Ui("ScreenHome", "ScreenLobby"), true, next);
        automation.ObserveScreen(Frame([], capturedAt: next), new() { AutoAcceptMatch = true }, next);
        automation.ObserveScreen(Frame(Popup().Concat([Line("Accept", 300, 500)]), capturedAt: next), new() { AutoAcceptMatch = true }, next);
        automation.ObserveScreen(Frame(Popup(), capturedAt: next), new() { AutoAcceptMatch = true }, next);
        assert(input.Clicks == 1, "same normalized menu set, OCR miss and ambiguous OCR never rearm an attempted popup");
        automation.SnapshotAt(now.AddSeconds(20));
        next = now.AddSeconds(21);
        automation.ObserveClient(Game(), Ui("ScreenHome", "ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Popup(), capturedAt: next), new() { AutoAcceptMatch = true }, next);
        assert(input.Clicks == 1, "marker expiry with the same client screen set does not rearm acceptance");
        next = now.AddSeconds(22);
        automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Popup(), capturedAt: next), new() { AutoAcceptMatch = true }, next);
        automation.ObserveScreen(Frame(Popup(), capturedAt: next), new() { AutoAcceptMatch = true }, next);
        assert(input.Clicks == 2, "later affirmative known-menu transition permits one new popup attempt in the same native window");
        foreach (var untrustedUi in new[] { Ui("ScreenUnknown"), Ui("ScreenHome", "ScreenUnknown"), JsonSerializer.SerializeToElement(new { activeScreens = new object[] { "ScreenHome", 7 } }), Ui("ScreenScore") })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
            automation.ObserveClient(Game(), untrustedUi, true, now); // Same timestamp is not a later sample.
            automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
            assert(input.Clicks == 1, "unknown, malformed or non-later client transitions cannot rearm an attempted popup");
            if (untrustedUi.GetProperty("activeScreens").EnumerateArray().Any(s => s.ValueKind != JsonValueKind.String || s.GetString() == "ScreenUnknown"))
            {
                next = now.AddSeconds(1);
                automation.ObserveClient(Game(), untrustedUi, true, next);
                automation.ObserveScreen(Frame(Popup(), capturedAt: next), new() { AutoAcceptMatch = true }, next);
                assert(input.Clicks == 1, "a later unknown or malformed client sample still cannot rearm acceptance");
            }
        }
        input = new(); automation = new(input); Client(automation, Game(20, count: 6), Ui());
        automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Random" }, now);
        automation.ObserveClient(Game(), Ui("ScreenLobby"), true, now.AddSeconds(1));
        automation.ObserveScreen(Frame(Popup(), capturedAt: now.AddSeconds(1)), new() { AutoAcceptMatch = true }, now.AddSeconds(1));
        automation.ObserveClient(Game(), Ui("ScreenHome"), true, now.AddSeconds(2));
        automation.ObserveScreen(Frame(Popup(), capturedAt: now.AddSeconds(2)), new() { AutoAcceptMatch = true }, now.AddSeconds(2));
        automation.ObserveClient(Game(25, count: 6), Ui(), true, now.AddSeconds(3));
        automation.ObserveScreen(Frame(Grid(), capturedAt: now.AddSeconds(3)), new() { AutoPickCommander = "Random" }, now.AddSeconds(3));
        assert(input.Clicks == 3, "menu acceptance rearm preserves the existing commander attempt rather than selecting again");
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Popup(true)), defaults, now);
        assert(automation.SnapshotAt(now).AcceptNeeded, "Russian match heading and accept/cancel labels recognize the popup");
        foreach (var bad in new[] { Frame([Line("Accept", 340, 360)]), Frame(Popup().Take(2)), Frame(Popup().Concat([Line("Accept", 300, 500)])), Frame([Line("Match Found", 20, 600), Line("Accept", 20, 640), Line("Decline", 20, 680)]), Frame(Popup(), false), Frame(Popup(), capturedAt: now.AddSeconds(-19)) })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(bad, new() { AutoAcceptMatch = true }, now);
            assert(!automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "generic/chat/ambiguous/incomplete/fixture/stale popup evidence cannot trigger acceptance");
        }
        foreach (var current in new[] { new WindowProof(124, 456, "SC2_x64", "SC2_x64.exe", true, true, false, true, new(0, 0, 1000, 800)), new WindowProof(123, 457, "Other", "Other.exe", true, true, false, true, new(0, 0, 1000, 800)), new WindowProof(123, 456, "SC2_x64", "SC2_x64.exe", false, true, false, true, new(0, 0, 1000, 800)), new WindowProof(123, 456, "SC2_x64", "SC2_x64.exe", true, true, false, false, new(0, 0, 1000, 800)), new WindowProof(123, 456, "SC2_x64", "SC2_x64.exe", true, true, false, true, new(20, 0, 1020, 800)), new WindowProof(123, 456, "SC2_x64", "SC2_x64.exe", true, true, false, true, new(0, 0, 1000, 800), true) })
        {
            input = new() { Current = current }; automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
            assert(input.Clicks == (current.Foreground ? 0 : 1) && input.HardwareClicks == 0,
                "window delivery rejects changed identity/occlusion/bounds or held input; focus loss alone needs no cursor input");
        }
        input = new() { ChangedPixels = true }; automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 0 && automation.SnapshotAt(now).Status.Contains("pixels changed"), "changed popup or target pixels after OCR block delivery");
        var noProof = JsonNode.Parse(Frame(Popup()).GetRawText())!;
        foreach (var line in noProof["screenReadings"]![0]!["lines"]!.AsArray()) line!.AsObject().Remove("proof");
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(JsonSerializer.SerializeToElement(noProof, Store.Json), new() { AutoAcceptMatch = true }, now);
        assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "popup can mark acceptance needed but missing pixel proof cannot send input");
        foreach (var client in new[] { (Game(replay: true), Ui("ScreenHome")), (Game(), Ui("ScreenLoading")), (Game(61, count: 6), Ui()), (Game(20, count: 5), Ui()), (Game(20, count: 6, result: "Win"), Ui()) })
        {
            input = new(); automation = new(input); Client(automation, client.Item1, client.Item2);
            automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
            automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Raynor" }, now);
            assert(!automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "replay/loading/midgame/incomplete/decided client state suppresses automation");
        }
        input = new(); automation = new(input); Client(automation, Game(20, count: 6), Ui());
        automation.ObserveScreen(Frame(Popup()), new() { AutoAcceptMatch = true }, now);
        assert(!automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "live-game selection eligibility never enables an accept popup");
        automation.ObserveScreen(Frame(Grid(false)), new() { AutoPickCommander = "Raynor" }, now);
        assert(input.Clicks == 0 && automation.SnapshotAt(now).CommanderStatus.Contains("mode unconfirmed"), "early live selection requires Direct Strike Commanders screen evidence");
        automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Random" }, now);
        automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Random" }, now);
        assert(input.Clicks == 1 && automation.SnapshotAt(now).CommanderStatus.Contains("not confirmed"), "fresh early six-player undecided match sends Random only once from a recognized mode/grid");
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Raynor" }, now);
        assert(input.Clicks == 0 && automation.SnapshotAt(now).CommanderStatus.Contains("requires an early live match"), "menu or co-op commander grids never enable automatic selection, even with mode-like text");
        input = new(); automation = new(input); Client(automation, Game(20, count: 6), Ui());
        automation.ObserveScreen(Frame(Grid()), new() { AutoPickCommander = "Zeratul" }, now);
        assert(input.Clicks == 0 && automation.SnapshotAt(now).CommanderStatus.Contains("unavailable"), "missing preferred commander never falls back to guessed positions or another button");
        foreach (var badGrid in new[] { Grid().Where((_, i) => i != 0), Grid().Take(6), new[] { Line("Select Commander", 350, 180, 200) }.Concat(Commanders.Take(6).Select((c, i) => Line(c, 30, 300 + 35 * i))) })
        {
            input = new(); automation = new(input); Client(automation, Game(20, count: 6), Ui());
            automation.ObserveScreen(Frame(badGrid), new() { AutoPickCommander = "Random" }, now);
            assert(input.Clicks == 0, "missing selection heading, fewer than six commanders or a chat column cannot trigger selection");
        }
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Popup()), defaults, now);
        automation.ObserveClient(default, default, false, now.AddSeconds(1));
        assert(!automation.SnapshotAt(now.AddSeconds(1)).AcceptNeeded, "client disconnection clears the acceptance marker immediately");
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Party()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 1 && automation.SnapshotAt(now).AcceptKind == "party-invite", "party toast accepts only its observed gold Accept button");
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        automation.ObserveScreen(Frame(Party()), new() { AutoAcceptMatch = true }, now);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 2, "party invitation and later game invite each get one attempt within the same menu; repeated kinds never rearm");
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Party()), new() { AutoAcceptMatch = true }, now);
        automation.ObserveScreen(Frame(Invite(), foreground: false), new() { AutoAcceptMatch = true }, now);
        var partyNext = now.AddSeconds(1);
        automation.ObserveClient(Game(), Ui("ScreenLobby"), true, partyNext);
        automation.ObserveScreen(Frame(Party(), capturedAt: partyNext), new() { AutoAcceptMatch = true }, partyNext);
        assert(input.Clicks == 2, "affirmative menu transition rearms a party after a distinct second invite was observed but input was blocked");
        foreach (var badParty in new[] { Party().Take(2), Party().Append(Line("Accept", 300, 150)), new[] { Line("Ваня invited you to a party", 500, 90, 350), Line("Accept", 540, 340, 80), Line("Decline", 740, 340, 80) } })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(badParty), new() { AutoAcceptMatch = true }, now);
            assert(!automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "incomplete, duplicate or distant party controls never authorize acceptance");
        }
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Party(false)), new() { AutoAcceptMatch = true }, now);
        assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "party cue is visible but a non-gold button cannot authorize input");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby().Concat(Party())), new() { AutoAcceptMatch = true, AutoPickCommander = "Random" }, now, ["TKnight"]);
        assert(input.Clicks == 1 && input.Targets[0].CenterX == 580, "party popup over an underlying lobby accepts invite before any commander action");
        var partySounds = new MatchAcceptSounds();
        partySounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(partySounds.ObserveScreen(Frame(Party()), true, now)
            && partySounds.ObserveScreen(Frame(Invite(), capturedAt: now.AddSeconds(1)), true, now.AddSeconds(1))
            && !partySounds.ObserveScreen(Frame(Party(), capturedAt: now.AddSeconds(2)), true, now.AddSeconds(2)), "party and game invitation each notify once without repeated kind pings");
        foreach (var popup in new[] { Party(), Invite() })
        {
            var alerts = new MatchAcceptSounds();
            input = new(); automation = new(input); Client(automation);
            alerts.ObserveClient(Game(), Ui("ScreenHome"), true, now);
            assert(alerts.ObserveScreen(Frame(popup), true, now), "initial invite emits an alert before a short dismissal gap");
            automation.ObserveScreen(Frame(popup), new() { AutoAcceptMatch = true }, now);
            var clearAt = now.AddSeconds(1);
            alerts.ObserveClient(Game(), Ui("ScreenHome"), true, clearAt); automation.ObserveClient(Game(), Ui("ScreenHome"), true, clearAt);
            assert(!alerts.ObserveScreen(Frame(Menu(), capturedAt: clearAt), true, clearAt), "a verified clear menu frame rearms alerts without playing a sound");
            automation.ObserveScreen(Frame(Menu(), capturedAt: clearAt), new() { AutoAcceptMatch = true }, clearAt);
            var nextAt = now.AddMilliseconds(1500);
            alerts.ObserveClient(Game(), Ui("ScreenHome"), true, nextAt); automation.ObserveClient(Game(), Ui("ScreenHome"), true, nextAt);
            assert(alerts.ObserveScreen(Frame(popup, capturedAt: nextAt), true, nextAt), "repeat same-kind invite notifies after one verified clear frame without needing two clear OCR cycles");
            automation.ObserveScreen(Frame(popup, capturedAt: nextAt), new() { AutoAcceptMatch = true }, nextAt);
            assert(input.Clicks == 1 && automation.AcceptRearmBoundary == default, "notification rearming never relaxes the two-clear-frame rule for automatic input");
            var repeatAt = now.AddSeconds(3);
            alerts.ObserveClient(Game(), Ui("ScreenHome"), true, repeatAt);
            assert(!alerts.ObserveScreen(Frame(popup, capturedAt: repeatAt), true, repeatAt), "a still-visible repeated invitation does not replay its sound");
            assert(!alerts.ObserveScreen(Frame(popup, capturedAt: now), true, repeatAt), "pre-dismissal frames cannot replay the new invitation alert");
        }
        foreach (var ownName in new[] { "TKnight", "TKnight(Host)", "T Knight (Host)" })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(Lobby(name: ownName)), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(input.Clicks == 1, "complete own-row lobby proof accepts a known menu state and removes only a host suffix: " + ownName);
        }
        foreach (bool russian in new[] { false, true })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(Invite(russian)), defaults, now);
            assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "Direct Strike party Game Invite marks acceptance needed with automatic acceptance off in either locale");
            automation.ObserveScreen(Frame(Invite(russian)), new() { AutoAcceptMatch = true }, now);
            automation.ObserveScreen(Frame(Invite(russian)), new() { AutoAcceptMatch = true }, now);
            assert(input.Clicks == 1 && input.Targets[0].CenterX == 380, "party invitation clicks only observed gold Accept once, never Decline");
        }
        foreach (var badInvite in new[] { Invite().Where((_, i) => i != 1), Invite().Where((_, i) => i != 2),
            Invite().Where((_, i) => i != 2).Append(Line("3V3 Standard, Direct Strike", 350, 380, 300)),
            Invite().Append(Line("Accept", 200, 460)) })
        {
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(badInvite), new() { AutoAcceptMatch = true }, now);
            assert(!automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "incomplete, unrelated or ambiguous party invitation cannot mark acceptance or send input");
        }
        input = new(); automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Invite(gold: false)), new() { AutoAcceptMatch = true }, now);
        assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "party invite notification remains available but non-gold Accept cannot authorize input");
        input = new() { ChangedContext = true }; automation = new(input); Client(automation);
        automation.ObserveScreen(Frame(Invite()), new() { AutoAcceptMatch = true }, now);
        assert(input.Clicks == 0, "changed invite map/party context after OCR blocks acceptance");
        foreach (var preference in new[] { "Random", "Artanis" })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = preference }, now, ["TKnight"]);
            automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = preference }, now, ["TKnight"]);
            assert(input.Clicks == 1 && automation.AwaitingLobbyDropdown(now) && input.Targets[0].CenterY == 232, "partial empty lobby opens only identified own-row dropdown once without requiring a six-player game");
            next = now.AddSeconds(1);
            automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
            automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = preference }, next, ["TKnight"]);
            automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = preference }, next, ["TKnight"]);
            assert(input.Clicks == 2 && input.Targets[1].CenterY == (preference == "Random" ? 272 : 377)
                && automation.SnapshotAt(next).CommanderStatus.Contains("not confirmed"), "new observed dropdown selects exact configured Random or commander only once and does not claim confirmation");
        }
        foreach (var badLobby in new[] { Lobby(mode: false), Lobby(name: "OtherPlayer"), Lobby().Append(Line("TKnight", 80, 475)).ToArray(), Lobby(true) })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(badLobby), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(input.Clicks == 0, "missing mode, unknown or ambiguous own identity, or already-open menu cannot open a lobby dropdown");
        }
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Random" }, now);
        assert(input.Clicks == 0, "unconfigured own identity never infers ownership from one visible selector");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby(name: "T Knight")), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        assert(input.Clicks == 1, "unique known own nickname tolerates observed OCR whitespace without inventing identity");
        var inviteSounds = new MatchAcceptSounds();
        inviteSounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(inviteSounds.ObserveScreen(Frame(Invite()), true, now) && !inviteSounds.ObserveScreen(Frame(Invite()), true, now),
            "party Game Invite acceptance cue fires once independently of auto-accept settings");
        var suppressedInviteSounds = new MatchAcceptSounds();
        suppressedInviteSounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
        assert(!suppressedInviteSounds.ObserveScreen(Frame(Invite()), false, now) && !suppressedInviteSounds.ObserveScreen(Frame(Invite()), true, now),
            "enabling acceptance cue does not replay an already consumed party invitation");
        foreach (var popup in new[] { Popup(), Invite() })
        {
            var covered = JsonNode.Parse(Frame(popup, foreground: false).GetRawText())!;
            covered["capture"]!["unobscured"] = false;
            covered["capture"]!["method"] = "window";
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(JsonSerializer.SerializeToElement(covered, Store.Json), new() { AutoAcceptMatch = true }, now);
            assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0, "covered window capture recognizes invitations without authorizing input");
            var coveredSounds = new MatchAcceptSounds();
            coveredSounds.ObserveClient(Game(), Ui("ScreenHome"), true, now);
            assert(coveredSounds.ObserveScreen(JsonSerializer.SerializeToElement(covered, Store.Json), true, now)
                && !coveredSounds.ObserveScreen(JsonSerializer.SerializeToElement(covered, Store.Json), true, now), "covered-window invitation notification fires once per opportunity");
            covered["capture"]!["method"] = "desktop";
            automation = new(new FixtureInput()); Client(automation);
            automation.ObserveScreen(JsonSerializer.SerializeToElement(covered, Store.Json), new(), now);
            assert(!automation.SnapshotAt(now).AcceptNeeded, "covered desktop pixels never become invitation evidence");
            input = new(); automation = new(input); Client(automation);
            automation.ObserveScreen(Frame(popup, foreground: false), new() { AutoAcceptMatch = true }, now);
            assert(automation.SnapshotAt(now).AcceptNeeded && input.Clicks == 0 && automation.SnapshotAt(now).Status.Contains("not foreground"),
                "visible unobscured background popup marks acceptance needed while automatic input remains blocked");
            automation.ObserveScreen(Frame(popup), new() { AutoAcceptMatch = true }, now);
            assert(input.Clicks == 1, "foreground observation can accept a previously notified background opportunity once");
        }
        foreach (var popup in new[] { Party(), Invite() })
        {
            var regressionInput = new FixtureInput(); var regression = new Sc2Automation(regressionInput);
            var consumedAt = now.AddSeconds(3); regression.ObserveClient(Game(), Ui("ScreenHome"), true, consumedAt);
            var regressionSound = new MatchAcceptSounds(); regressionSound.ObserveClient(Game(), Ui("ScreenHome"), true, consumedAt);
            regression.ObserveScreen(Frame(popup, capturedAt: consumedAt), new() { AutoAcceptMatch = true }, consumedAt);
            assert(regressionSound.ObserveScreen(Frame(popup, capturedAt: consumedAt), true, consumedAt), "new invitation starts sound regression sequence");
            foreach (var oldFrame in new[] { now.AddSeconds(1), now.AddSeconds(2) })
            {
                regression.ObserveScreen(Frame(Menu(), capturedAt: oldFrame), new() { AutoAcceptMatch = true }, now.AddSeconds(4));
                regressionSound.ObserveScreen(Frame(Menu(), capturedAt: oldFrame), true, now.AddSeconds(4));
            }
            regression.ObserveScreen(Frame(popup, capturedAt: consumedAt), new() { AutoAcceptMatch = true }, now.AddSeconds(4));
            assert(regressionInput.Clicks == 1 && regression.AcceptRearmBoundary == default && !regressionSound.ObserveScreen(Frame(popup, capturedAt: consumedAt), true, now.AddSeconds(4)),
                "old clear-menu frames cannot rearm newer consumed invitation input or audio");
            input = new() { BackgroundEnabled = true, Current = new(123, 456, "SC2_x64", "SC2_x64.exe", false, true, false, true, new(0, 0, 1000, 800)) };
            automation = new(input); Client(automation);
            var cue = new MatchAcceptSounds(); cue.ObserveClient(Game(), Ui("ScreenHome"), true, now);
            assert(cue.ObserveScreen(Frame(popup, foreground: false), true, now), "background invitation emits its sound independently of input focus");
            automation.ObserveScreen(Frame(popup, foreground: false), new() { AutoAcceptMatch = true }, now);
            assert(input.Clicks == 1 && automation.SnapshotAt(now).Status.Contains("SC2 window"), "verified background invite routes to window-specific acceptance without a foreground mouse click");
            var at = now.AddSeconds(3); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(popup, capturedAt: at, foreground: false), new() { AutoAcceptMatch = true }, at);
            assert(input.Clicks == 2 && !cue.ObserveScreen(Frame(popup, capturedAt: at), true, at), "still-visible invitation retries delivery without replaying sound");
            at = now.AddSeconds(6); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(popup, capturedAt: at, foreground: false), new() { AutoAcceptMatch = true }, at);
            at = now.AddSeconds(9); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(popup, capturedAt: at, foreground: false), new() { AutoAcceptMatch = true }, at);
            assert(input.Clicks == 3 && automation.SnapshotAt(at).Status.Contains("3 attempts"), "ignored window input has a bounded three-attempt limit and never claims acceptance");
            input.Current = input.Current with { Foreground = true };
            at = now.AddSeconds(10); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(popup, capturedAt: at), new() { AutoAcceptMatch = true }, at);
            assert(input.Clicks == 4, "fresh foreground observation can retry ignored background delivery through window input only");
            assert(input.HardwareClicks == 0 && input.WindowClicks == 4, "party and game invitations never use cursor-moving hardware input even when SC2 is foreground");
            // Blank or incomplete recognition never proves disappearance.
            at = now.AddSeconds(11); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at); cue.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame([] , capturedAt: at), new() { AutoAcceptMatch = true }, at); cue.ObserveScreen(Frame([], capturedAt: at), true, at);
            at = now.AddSeconds(12); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at); cue.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(Menu().Concat(popup.Take(1)), capturedAt: at), new() { AutoAcceptMatch = true }, at); cue.ObserveScreen(Frame(Menu().Concat(popup.Take(1)), capturedAt: at), true, at);
            assert(automation.AcceptRearmBoundary == default && !cue.ObserveScreen(Frame(popup, capturedAt: at), true, at), "blank or popup-partial frames never rearm sound or input");
            at = now.AddSeconds(13); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at); cue.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(Menu(), capturedAt: at), new() { AutoAcceptMatch = true }, at); cue.ObserveScreen(Frame(Menu(), capturedAt: at), true, at);
            assert(automation.AcceptRearmBoundary == default, "one clear navigation frame cannot rearm an invite");
            at = now.AddSeconds(14); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at); cue.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(Menu(), capturedAt: at), new() { AutoAcceptMatch = true }, at); cue.ObserveScreen(Frame(Menu(), capturedAt: at), true, at);
            assert(automation.AcceptRearmBoundary == at, "two complete fresh menu frames rearm an invite without a client menu transition");
            automation.ObserveScreen(Frame(popup, capturedAt: now), new() { AutoAcceptMatch = true }, at);
            assert(input.Clicks == 4 && !cue.ObserveScreen(Frame(popup, capturedAt: now), true, at), "old pre-dismissal frames cannot replay acceptance or sound");
            at = now.AddSeconds(15); automation.ObserveClient(Game(), Ui("ScreenHome"), true, at); cue.ObserveClient(Game(), Ui("ScreenHome"), true, at);
            automation.ObserveScreen(Frame(popup, capturedAt: at), new() { AutoAcceptMatch = true }, at);
            assert(input.Clicks == 5 && cue.ObserveScreen(Frame(popup, capturedAt: at), true, at), "fresh same-kind invite in the same menu receives a new click and sound after proved dismissal");
        }
        foreach (var label in new[] { "8V3 Commanders", "3V8 Commanders", "3V3 Commarndeps" })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(Lobby(modeLabel: label)), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(input.Clicks == 1, "guarded lobby tolerates the exact observed mode OCR: " + label);
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(Lobby(modeLabel: label).Where((_, i) => i != 2)), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(input.Clicks == 0, "mode OCR repair still requires both roster panels: " + label);
        }
        foreach (var label in new[] { "8V8 Commanders", "2V3 Commanders", "3V3 Comanders", "8V3 Standard" })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(Lobby(modeLabel: label)), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(input.Clicks == 0, "mode OCR repair rejects unobserved or different mode labels: " + label);
        }
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby(), foreground: false), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        assert(input.Clicks == 0, "readable background lobby never authorizes commander input");
        foreach (var scenario in new[] { "missing", "old", "preference", "context", "expired", "replay" })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
            next = now.AddSeconds(scenario == "expired" ? 31 : 1);
            automation.ObserveClient(Game(replay: scenario == "replay"), Ui("ScreenLobby"), true, next);
            input.ChangedContext = scenario == "context";
            var expanded = scenario == "missing" ? Lobby(true).Where(o => !JsonSerializer.Serialize(o).Contains("Random")) : Lobby(true).AsEnumerable();
            automation.ObserveScreen(Frame(expanded, capturedAt: scenario == "old" ? now : next),
                new() { AutoPickCommander = scenario == "preference" ? "Raynor" : "Random" }, next, ["TKnight"]);
            assert(input.Clicks == 1, "dropdown opening cannot authorize missing, old, changed preference/context, expired or replay selection: " + scenario);
        }
        using (var stream = typeof(Sc2AutomationTests).Assembly.GetManifestResourceStream("DscTest:sc2-commander-dropdown"))
        {
            assert(stream != null, "supplied dropdown OCR geometry is bundled as a non-live fixture");
            using var fixture = JsonDocument.Parse(stream!);
            var f = fixture.RootElement;
            var screenshot = new ScreenCapture(false, now, 123, 456, "SC2_x64", false, false,
                new(0, 0, f.GetProperty("width").GetInt32(), f.GetProperty("height").GetInt32()), f.GetProperty("width").GetInt32(), f.GetProperty("height").GetInt32());
            var detected = Detect(f, screenshot, ["TKnight"]);
            assert(detected.Lobby is { HasChoices: true } && detected.Lobby.Options.Keys.Order().SequenceEqual(new[] { "Abathur", "Alarak", "Artanis", "Dehaka", "Fenix", "Random" }),
                "actual EN/RU screenshot resolves mode 3V8, own T Knight and split Deh aka without requiring equal recognizer subsets");
        }
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Tychus" }, now, ["TKnight"]);
        next = now.AddSeconds(1); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = "Tychus" }, next, ["TKnight"]);
        automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = "Tychus" }, next, ["TKnight"]);
        assert(input.Clicks == 1 && input.Scrolls.SequenceEqual(new[] { -120 }), "off-page preferred commander scrolls one proved page, never clicks a guessed row or repeats a stale frame");
        next = now.AddSeconds(2); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Lobby(true, choices: ["Stukov", "Swann", "Tychus", "Vorazun", "Zagara", "Zeratul"]), capturedAt: next), new() { AutoPickCommander = "Tychus" }, next, ["TKnight"]);
        assert(input.Clicks == 2 && input.Targets.Last().CenterY == 342 && automation.SnapshotAt(next).CommanderStatus.Contains("not confirmed"), "new page clicks the exact observed Tychus text and remains unconfirmed");
        next = now.AddSeconds(3); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Lobby(selected: "Tychus"), capturedAt: next), new() { AutoPickCommander = "Tychus" }, next, ["TKnight"]);
        assert(input.Clicks == 2 && automation.SnapshotAt(next).CommanderStatus == "Commander selected: Tychus", "closed own-row selector visibly confirms the configured commander without another click");
        foreach (var scenario in new[] { "stalled", "background", "pixels", "context", "unordered", "missing-label" })
        {
            input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
            string wanted = scenario == "missing-label" ? "Artanis" : "Tychus";
            automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = wanted }, now, ["TKnight"]);
            input.ChangedPixels = scenario == "pixels"; input.ChangedContext = scenario == "context";
            for (int tick = 1; tick <= 5; tick++)
            {
                next = now.AddSeconds(tick); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
                var choices = scenario == "unordered" ? new[] { "Random", "Fenix", "Abathur" } : scenario == "missing-label" ? ["Random", "Abathur", "Alarak", "Dehaka", "Fenix"] : null;
                automation.ObserveScreen(Frame(Lobby(true, choices: choices), capturedAt: next, foreground: scenario != "background"), new() { AutoPickCommander = wanted }, next, ["TKnight"]);
            }
            assert(input.Clicks == 1 && input.Scrolls.Count == (scenario == "stalled" ? 2 : 0), "bounded scroll never guesses through unchanged pages, background, altered proofs or unreadable/unordered choices: " + scenario);
        }
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby(true)), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        next = now.AddSeconds(1); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = "Random" }, next, ["TKnight"]);
        assert(input.Clicks == 1 && input.Targets.Single().CenterY == 272, "already-open own-row dropdown selects only after a second fresh observed page");
        foreach (int tick in new[] { 2, 3, 5, 7 })
        {
            next = now.AddSeconds(tick); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
            automation.ObserveScreen(Frame(Lobby(true), capturedAt: next), new() { AutoPickCommander = "Random" }, next, ["TKnight"]);
        }
        assert(input.Clicks == 3 && automation.SnapshotAt(next).CommanderStatus.Contains("confirmation"), "visible unchanged dropdown gets at most three exact-choice attempts and never claims success from delivery alone");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby(selected: "Raynor")), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        assert(input.Clicks == 0 && automation.SnapshotAt(now).CommanderStatus.Contains("Raynor"), "a different already-selected commander is reported without overriding a manual choice");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Random" }, now, ["TKnight"]);
        next = now.AddSeconds(1); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
        automation.ObserveScreen(Frame(Lobby(true, choices: ["Tychus", "Vorazun", "Zagara"]), capturedAt: next), new() { AutoPickCommander = "Random" }, next, ["TKnight"]);
        assert(input.Scrolls.SequenceEqual(new[] { 120 }) && input.Clicks == 1, "a proved lower page scrolls upward for Random without selecting the first visible commander");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        automation.ObserveScreen(Frame(Lobby()), new() { AutoPickCommander = "Tychus" }, now, ["TKnight"]);
        for (int tick = 1; tick <= 22; tick++)
        {
            next = now.AddMilliseconds(tick * 200); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
            automation.ObserveScreen(Frame(Lobby(true, choices: tick % 2 == 0 ? ["Artanis", "Dehaka", "Fenix"] : ["Random", "Abathur", "Alarak"]), capturedAt: next), new() { AutoPickCommander = "Tychus" }, next, ["TKnight"]);
        }
        assert(input.Scrolls.Count == 20 && input.Clicks == 1, "even changing observed pages cannot exceed the twenty-scroll opportunity budget");
        input = new(); automation = new(input); Client(automation, ui: Ui("ScreenLobby"));
        for (int tick = 0; tick <= 8; tick++)
        {
            next = now.AddSeconds(tick); automation.ObserveClient(Game(), Ui("ScreenLobby"), true, next);
            automation.ObserveScreen(Frame(Lobby(), capturedAt: next), new() { AutoPickCommander = "Random" }, next, ["TKnight"]);
        }
        assert(input.Clicks == 3 && input.Scrolls.Count == 0, "ignored dropdown-open deliveries retry at two-second spacing with a three-open cap");
        var disagreement = JsonNode.Parse(Frame(Lobby(true)).GetRawText())!;
        var conflicting = JsonNode.Parse(Frame(Lobby(true, choices: ["Random", "Fenix", "Alarak", "Artanis", "Dehaka", "Abathur"])).GetRawText())!;
        disagreement["screenReadings"]!.AsArray().Add(conflicting["screenReadings"]![0]!.DeepClone());
        var disagreementResult = JsonSerializer.SerializeToElement(disagreement, Store.Json);
        assert(Detect(disagreementResult, ReadCapture(disagreementResult)!, ["TKnight"]).Lobby == null,
            "contradictory names at the same bilingual dropdown positions cannot authorize any lobby input");
    }
}
