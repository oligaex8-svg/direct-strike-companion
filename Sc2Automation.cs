using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

public sealed record Sc2AutomationSnapshot(bool AcceptNeeded, string Status, string CommanderStatus, DateTime? ObservedAt, string? LastAction, string? AcceptKind = null, string? LastAcceptStatus = null, DateTime? LastAcceptObservedAt = null);

public sealed class Sc2Automation
{
    public static readonly IReadOnlyList<string> Commanders = Array.AsReadOnly(new[] { "Raynor", "Kerrigan", "Artanis", "Swann", "Zagara", "Vorazun", "Karax", "Abathur", "Alarak", "Nova", "Stukov", "Fenix", "Dehaka", "Horner", "Tychus", "Zeratul", "Stetmann", "Mengsk" });
    private static readonly Dictionary<string, string> Labels = CommanderLabels();
    private static readonly HashSet<string> MatchHeadings = new(["MATCH FOUND", "МАТЧ НАЙДЕН", "ИГРА НАЙДЕНА", "НАЙДЕН МАТЧ"], StringComparer.Ordinal);
    private static readonly HashSet<string> InviteHeadings = new(["GAME INVITE", "ПРИГЛАШЕНИЕ В ИГРУ", "ПРИГЛАШЕНИЕ НА ИГРУ"], StringComparer.Ordinal);
    private static readonly HashSet<string> PartyInviteContexts = new(["THE PARTY LEADER HAS INVITED YOU TO", "ЛИДЕР ГРУППЫ ПРИГЛАСИЛ ВАС В", "ЛИДЕР ГРУППЫ ПРИГЛАШАЕТ ВАС В"], StringComparer.Ordinal);
    private static readonly HashSet<string> SelectionHeadings = new(["SELECT COMMANDER", "SELECT YOUR COMMANDER", "CHOOSE COMMANDER", "CHOOSE YOUR COMMANDER", "COMMANDER SELECTION", "ВЫБЕРИТЕ КОМАНДИРА", "ВЫБОР КОМАНДИРА"], StringComparer.Ordinal);
    private static readonly HashSet<string> AcceptLabels = new(["ACCEPT", "ПРИНЯТЬ"], StringComparer.Ordinal);
    private static readonly HashSet<string> DeclineLabels = new(["DECLINE", "CANCEL", "ОТКЛОНИТЬ", "ОТМЕНА"], StringComparer.Ordinal);
    internal static readonly TimeSpan MarkerFreshness = TimeSpan.FromSeconds(18), InputFreshness = TimeSpan.FromSeconds(5);
    private readonly object gate = new();
    private readonly ISc2Input input;
    private bool clientReady, earlySelection, acceptAllowed, acceptNeeded, acceptAttempted, pickAttempted;
    private DateTime clientAt;
    private HashSet<string>? clientScreens, attemptedAcceptScreens;
    private DateTime? acceptAttemptedAt;
    private DateTime? observedAt;
    private string status = "Waiting for a readable SC2 popup", commanderStatus = "Commander selection off";
    private string? lastAction;
    private string? acceptKind;
    private string? lastAcceptStatus;
    private DateTime? lastAcceptObservedAt;
    private readonly HashSet<string> attemptedAcceptKinds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, int> acceptAttempts = new(StringComparer.Ordinal);
    private DateTime acceptRearmBoundary;
    private DateTime latestAcceptFrame, latestScreenFrame;
    private DateTime? clearMenuFrame;
    private bool lastAcceptBackground;
    private bool lastAcceptDelivered;
    private long observedWindow;
    private bool dropdownAttempted;
    private DateTime dropdownAt;
    private string? dropdownIdentity, dropdownPreference;
    private ScreenBox dropdownBounds;
    public Sc2Automation() : this(new WindowsSc2Input()) { }
    internal Sc2Automation(ISc2Input input) => this.input = input;

    public static void ValidateSettings(Settings settings)
    {
        if (settings.AutoPickCommander == null || settings.AutoPickCommander != "" && settings.AutoPickCommander != "Random" && !Commanders.Contains(settings.AutoPickCommander, StringComparer.Ordinal))
            throw new ArgumentException("Choose off, Random or a supported commander.");
    }

    internal void ObserveClient(JsonElement game, JsonElement ui, bool connected, DateTime now)
    {
        bool validGame = game.ValueKind == JsonValueKind.Object && game.TryGetProperty("isReplay", out var replay) && replay.ValueKind is JsonValueKind.True or JsonValueKind.False;
        var currentScreens = Sc2ClientUi.ReadScreens(ui);
        bool validUi = currentScreens != null;
        bool isReplay = validGame && game.GetProperty("isReplay").GetBoolean();
        bool loading = currentScreens?.Contains("ScreenLoading") == true;
        bool inGame = validUi && ui.GetProperty("activeScreens").GetArrayLength() == 0;
        bool early = false;
        if (inGame && validGame && !isReplay && game.TryGetProperty("displayTime", out var clock) && clock.TryGetDouble(out var seconds) && double.IsFinite(seconds) && seconds is >= 0 and <= 60
            && game.TryGetProperty("players", out var players) && players.ValueKind == JsonValueKind.Array && players.GetArrayLength() == 6)
        {
            var names = new List<string>();
            foreach (var p in players.EnumerateArray())
            {
                if (p.ValueKind != JsonValueKind.Object || !p.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.String || result.GetString() != "Undecided"
                    || !p.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(name.GetString()) || name.GetString()!.Length > 64) break;
                names.Add(name.GetString()!);
            }
            early = names.Count == 6 && names.Distinct(StringComparer.OrdinalIgnoreCase).Count() == 6;
        }
        lock (gate)
        {
            if (dropdownAttempted && connected && validGame && validUi && !isReplay && !loading && now > dropdownAt && now >= clientAt
                && Sc2ClientUi.HasLobby(clientScreens) && Sc2ClientUi.IsMenu(currentScreens) && !Sc2ClientUi.HasLobby(currentScreens))
                dropdownAttempted = pickAttempted = false; // Affirmative departure from this lobby.
            // A missing/ambiguous OCR scene cannot prove another queue attempt.
            // Only a later affirmative menu transition rearms the same window.
            if (attemptedAcceptKinds.Count > 0 && connected && validGame && validUi && !isReplay && !loading && now >= clientAt
                && acceptAttemptedAt.HasValue && now > acceptAttemptedAt.Value && attemptedAcceptScreens != null
                && Sc2ClientUi.MenuChanged(attemptedAcceptScreens, currentScreens))
            {
                acceptAttempted = false;
                attemptedAcceptKinds.Clear();
                acceptAttempts.Clear();
                acceptRearmBoundary = now;
                attemptedAcceptScreens = null;
                acceptAttemptedAt = null;
                acceptNeeded = false;
                observedAt = null;
            }
            clientAt = now;
            clientScreens = currentScreens;
            earlySelection = early;
            clientReady = connected && validGame && validUi && !isReplay && !loading && (!inGame || early);
            acceptAllowed = clientReady && !inGame;
            if (!acceptAllowed) acceptNeeded = false;
            if (!clientReady) Clear(!connected ? "SC2 client disconnected" : isReplay ? "Replay playback · automation paused" : loading ? "Loading · automation paused" : inGame ? "Match underway · automation paused" : "SC2 client state unavailable", loading || inGame);
        }
    }
    internal bool CanReadCommanderSelection(DateTime now)
    {
        lock (gate) return clientReady && earlySelection && now >= clientAt && now - clientAt <= TimeSpan.FromSeconds(8);
    }
    internal void Suppress(string reason)
    {
        lock (gate) { clientReady = false; Clear(reason, reason.StartsWith("Match underway", StringComparison.Ordinal)); }
    }
    private void Clear(string reason, bool resetInputs)
    {
        acceptNeeded = false;
        observedAt = null;
        status = reason;
        commanderStatus = reason;
        clearMenuFrame = null;
        if (resetInputs) { acceptAttempted = pickAttempted = dropdownAttempted = false; attemptedAcceptKinds.Clear(); acceptAttempts.Clear(); observedWindow = 0; }
    }
    internal DateTime AcceptRearmBoundary { get { lock (gate) return acceptRearmBoundary; } }
    // A notification can rearm on one affirmative clear frame. Automatic input
    // retains its separate two-frame dismissal requirement.
    internal DateTime? AcceptAbsentFrame { get { lock (gate) return clearMenuFrame; } }
    public Sc2AutomationSnapshot Snapshot() => SnapshotAt(DateTime.UtcNow);
    internal Sc2AutomationSnapshot SnapshotAt(DateTime now)
    {
        lock (gate)
        {
            if (observedAt.HasValue && (now < observedAt.Value || now - observedAt.Value > MarkerFreshness)) Clear("SC2 observation expired · waiting for a fresh screen", false);
            return new(acceptNeeded, status, commanderStatus, observedAt, lastAction, acceptNeeded ? acceptKind : null, lastAcceptStatus, lastAcceptObservedAt);
        }
    }
    internal bool AwaitingLobbyDropdown(DateTime now)
    {
        lock (gate) return dropdownAttempted && !pickAttempted && now >= dropdownAt && now - dropdownAt < TimeSpan.FromSeconds(30);
    }
    internal void ObserveScreen(JsonElement result, Settings settings, DateTime now, IEnumerable<string>? ownNames = null)
    {
        ValidateSettings(settings);
        var capture = ReadCapture(result);
        lock (gate)
        {
            if (!clientReady || now < clientAt || now - clientAt > TimeSpan.FromSeconds(8)) { Clear("SC2 client state unavailable or stale", false); return; }
            if (capture == null || !capture.Live || (!capture.Unobscured && !capture.WindowCapture) || now < capture.CapturedAt || now - capture.CapturedAt > MarkerFreshness)
            { Clear("Waiting for a fresh unobscured SC2 screen", false); return; }
            if (observedWindow != capture.WindowHandle) { acceptAttempted = pickAttempted = dropdownAttempted = false; attemptedAcceptKinds.Clear(); acceptAttempts.Clear(); clearMenuFrame = null; latestAcceptFrame = latestScreenFrame = default; observedWindow = capture.WindowHandle; }
            if (capture.CapturedAt < latestScreenFrame) { status = "Older SC2 frame ignored · waiting for a fresh screen"; return; }
            latestScreenFrame = capture.CapturedAt;
            observedAt = capture.CapturedAt;
            var scene = Detect(result, capture, ownNames);
            if (acceptAllowed && scene.AcceptAbsent && capture.CapturedAt >= acceptRearmBoundary && capture.CapturedAt > latestAcceptFrame)
            {
                // Two distinct complete menu frames prove dismissal. A blank,
                // partial or ambiguous OCR result never rearms an invitation.
                if (clearMenuFrame.HasValue && capture.CapturedAt > clearMenuFrame.Value && capture.CapturedAt - clearMenuFrame.Value <= MarkerFreshness)
                {
                    attemptedAcceptKinds.Clear(); acceptAttempts.Clear(); acceptAttempted = false;
                    acceptRearmBoundary = capture.CapturedAt;
                    if (acceptAttemptedAt.HasValue) lastAcceptStatus = "Invite closed · waiting for another invite";
                    acceptAttemptedAt = null;
                }
                clearMenuFrame = capture.CapturedAt;
            }
            else clearMenuFrame = null;
            acceptNeeded = acceptAllowed && scene.Accept != null;
            if (acceptNeeded)
            {
                acceptKind = scene.AcceptKind;
                latestAcceptFrame = capture.CapturedAt;
                // Accepting a party toast can be followed by a distinct game
                // invite without any change to the client menu screen set.
                acceptAttempted = attemptedAcceptKinds.Contains(acceptKind!);
                status = !settings.AutoAcceptMatch ? "Accept needed · automatic acceptance off" : acceptAttempted ? "Accept input already attempted · waiting for SC2 confirmation" : "Accept needed · checking input safety";
                commanderStatus = "Waiting for commander selection";
                if (capture.CapturedAt < acceptRearmBoundary) { status = "Older invite frame · waiting for a fresh screen"; return; }
                int attempts = acceptAttempts.GetValueOrDefault(acceptKind!);
                if (acceptAttempted && lastAcceptBackground && capture.Foreground) { attempts = 0; acceptAttempts[acceptKind!] = 0; }
                bool retry = acceptAttempted && lastAcceptDelivered && attempts < 3 && acceptAttemptedAt.HasValue && capture.CapturedAt > acceptAttemptedAt.Value
                    && (now - acceptAttemptedAt.Value >= TimeSpan.FromSeconds(2) && now - acceptAttemptedAt.Value <= MarkerFreshness || lastAcceptBackground && capture.Foreground);
                if (settings.AutoAcceptMatch && (!acceptAttempted || retry)) Send(capture, scene.Accept!, now, true);
                else if (settings.AutoAcceptMatch && attempts >= 3) status = "Invite still visible after 3 attempts · SC2 has not confirmed acceptance";
                lastAcceptStatus = status;
                lastAcceptObservedAt = capture.CapturedAt;
                return;
            }
            status = "No recognized match-accept popup";
            if (scene.Lobby != null && settings.AutoPickCommander != "")
            {
                if (!acceptAllowed || !Sc2ClientUi.IsMenu(clientScreens))
                { commanderStatus = "Lobby commander selection requires a current SC2 lobby · no action"; return; }
                var lobby = scene.Lobby;
                if (pickAttempted) { commanderStatus = "Commander input already attempted · selection not confirmed"; return; }
                if (!dropdownAttempted)
                {
                    // Do not act on a menu that the user has already opened.
                    if (lobby.HasChoices) { commanderStatus = "Commander dropdown already open · no action"; return; }
                    var opening = Click(capture, lobby.Selector, now);
                    dropdownAttempted |= opening.Attempted;
                    if (opening.Attempted) { dropdownAt = now; dropdownIdentity = lobby.Identity; dropdownPreference = settings.AutoPickCommander; dropdownBounds = lobby.Selector.Bounds; }
                    commanderStatus = opening.Sent ? "Commander dropdown opened · waiting for observed choices" : opening.Status;
                    if (opening.Attempted) lastAction = commanderStatus;
                    return;
                }
                if (now - dropdownAt > TimeSpan.FromSeconds(30) || dropdownIdentity != lobby.Identity || dropdownPreference != settings.AutoPickCommander
                    || !SameTarget(dropdownBounds, lobby.Selector.Bounds))
                { commanderStatus = "Commander dropdown opportunity changed or expired · no action"; return; }
                if (capture.CapturedAt <= dropdownAt) { commanderStatus = "Waiting for a fresh commander dropdown observation"; return; }
                if (lobby.Options.TryGetValue(settings.AutoPickCommander, out var option)) Send(capture, option, now, false);
                else commanderStatus = "Preferred commander choice not observed · no action";
                return;
            }
            commanderStatus = settings.AutoPickCommander == "" ? "Commander selection off" : scene.Commanders.Count < 6 ? "Commander selection layout not recognized · no action" : pickAttempted ? "Commander input already attempted · selection not confirmed" : "Commander selection ready";
            if (scene.Commanders.Count >= 6)
            {
                if (!earlySelection) { commanderStatus = "Commander selection requires an early live match · no action"; return; }
                acceptAttempted = false; // A recognized next phase proves the popup ended.
                if (!scene.DirectStrikeCommanders) { commanderStatus = "Commander selector found; Direct Strike mode unconfirmed · no action"; return; }
                if (settings.AutoPickCommander != "" && !pickAttempted)
                {
                    if (scene.Commanders.TryGetValue(settings.AutoPickCommander, out var target)) Send(capture, target, now, false);
                    else commanderStatus = "Preferred commander button unavailable · no action";
                }
            }
        }
    }
    private void Send(ScreenCapture capture, ScreenControl target, DateTime now, bool accept)
    {
        if (now - capture.CapturedAt > InputFreshness) { if (accept) status = "Accept needed · capture too old for input"; else commanderStatus = "Commander capture too old for input · no action"; return; }
        var result = Click(capture, target, now, accept);
        if (accept)
        {
            acceptAttempted |= result.Attempted;
            if (result.Attempted) { attemptedAcceptScreens = clientScreens == null ? null : new(clientScreens, StringComparer.Ordinal); acceptAttemptedAt = now; attemptedAcceptKinds.Add(acceptKind!); acceptAttempts[acceptKind!] = acceptAttempts.GetValueOrDefault(acceptKind!) + 1; lastAcceptBackground = !capture.Foreground; lastAcceptDelivered = result.Sent; }
            status = result.Sent ? "Accept sent to SC2 window · waiting for confirmation" : result.Status;
        }
        else { pickAttempted |= result.Attempted; commanderStatus = result.Sent ? "Commander click sent · selection not confirmed" : result.Status; }
        if (result.Attempted) lastAction = accept ? status : commanderStatus;
    }
    private InputResult Click(ScreenCapture capture, ScreenControl target, DateTime now, bool accept = false) => now - capture.CapturedAt > InputFreshness
        ? new(false, false, "SC2 capture too old for input · no action")
        : accept ? input is ISc2BackgroundInput background ? background.TryAccept(capture, target, now)
            : new(false, false, "SC2 background input unavailable · no action")
        : !capture.Foreground ? new(false, false, "SC2 is not foreground · input paused") : input.TryClick(capture, target, now);
    private static bool SameTarget(ScreenBox a, ScreenBox b) => Math.Abs(a.CenterX - b.CenterX) < 12 && Math.Abs(a.CenterY - b.CenterY) < 12;

    internal readonly record struct WindowBounds(int Left, int Top, int Right, int Bottom)
    {
        internal int Width => Right - Left;
        internal int Height => Bottom - Top;
    }
    internal readonly record struct ScreenBox(double X, double Y, double Width, double Height)
    {
        internal double CenterX => X + Width / 2;
        internal double CenterY => Y + Height / 2;
        internal bool Valid(int width, int height) => double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Width) && double.IsFinite(Height) && X >= 0 && Y >= 0 && Width >= 4 && Height >= 4 && X + Width <= width && Y + Height <= height;
    }
    internal sealed record ScreenCapture(bool Live, DateTime CapturedAt, long WindowHandle, int ProcessId, string ProcessName, bool Foreground, bool Unobscured, WindowBounds Bounds, int Width, int Height, bool WindowCapture = false);
    internal sealed record RegionProof(int Left, int Top, int Width, int Height, string Hash, string? GlyphMask = null)
    {
        internal bool Valid(WindowBounds window) => Left >= 0 && Top >= 0 && Width is > 0 and <= 2000 && Height is > 0 and <= 256 && (long)Width * Height <= 100000 && (long)Left + Width <= window.Width && (long)Top + Height <= window.Height && Hash is { Length: 64 } && Hash.All(Uri.IsHexDigit);
    }
    internal sealed record ScreenControl(ScreenBox Bounds, RegionProof? HeadingProof, RegionProof? TargetProof, IReadOnlyList<RegionProof?>? ContextProofs = null);
    internal sealed record LobbySelection(string Identity, ScreenControl Selector, Dictionary<string, ScreenControl> Options, bool HasChoices);
    internal sealed record DetectedScene(ScreenControl? Accept, Dictionary<string, ScreenControl> Commanders, bool DirectStrikeCommanders = false, LobbySelection? Lobby = null, string? AcceptKind = null, bool AcceptAbsent = false);
    private sealed record TextBox(string Text, ScreenBox Bounds, RegionProof? Proof, bool Gold);
    internal static bool IsSc2(string name) => name is "SC2" or "SC2_x64";
    internal static ScreenCapture? ReadCapture(JsonElement result)
    {
        try
        {
            var c = result.GetProperty("capture");
            var b = c.GetProperty("bounds");
            var capture = new ScreenCapture(c.GetProperty("live").GetBoolean(), DateTimeOffset.Parse(c.GetProperty("capturedAt").GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.None).UtcDateTime,
                c.GetProperty("windowHandle").GetInt64(), c.GetProperty("processId").GetInt32(), c.GetProperty("processName").GetString()!, c.GetProperty("foreground").GetBoolean(), c.GetProperty("unobscured").GetBoolean(),
                new(b.GetProperty("left").GetInt32(), b.GetProperty("top").GetInt32(), b.GetProperty("right").GetInt32(), b.GetProperty("bottom").GetInt32()), c.GetProperty("width").GetInt32(), c.GetProperty("height").GetInt32(), c.TryGetProperty("method", out var method) && method.GetString() == "window");
            return capture.Live && capture.WindowHandle > 0 && capture.ProcessId > 0 && IsSc2(capture.ProcessName) && capture.Bounds.Width is >= 100 and <= 8000 && capture.Bounds.Height is >= 100 and <= 8000 && capture.Width is >= 100 and <= 8000 && capture.Height is >= 100 and <= 8000 ? capture : null;
        }
        catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException or FormatException or ArgumentException or OverflowException) { return null; }
    }
    private static string Normalize(string text) => Regex.Replace(text.Trim().TrimEnd('!', ':', '.'), @"\s+", " ", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)).ToUpperInvariant();
    private static Dictionary<string, string> CommanderLabels()
    {
        var labels = Commanders.ToDictionary(Normalize, c => c, StringComparer.Ordinal);
        string[] russian = ["Рейнор", "Керриган", "Артанис", "Свонн", "Загара", "Воразун", "Каракс", "Абатур", "Аларак", "Нова", "Стуков", "Феникс", "Дехака", "Хан и Хорнер", "Тайкус", "Зератул", "Стетманн", "Менгск"];
        for (int i = 0; i < russian.Length; i++) labels[Normalize(russian[i])] = Commanders[i];
        labels["HAN & HORNER"] = "Horner";
        labels["RANDOM"] = labels["СЛУЧАЙНЫЙ"] = "Random";
        return labels;
    }
    internal static DetectedScene Detect(JsonElement result, ScreenCapture capture, IEnumerable<string>? ownNames = null)
    {
        var scenes = new List<DetectedScene>();
        bool ambiguous = false, popupVisible = false, clearMenu = false;
        if (!result.TryGetProperty("screenReadings", out var readings) || readings.ValueKind != JsonValueKind.Array) return new(null, []);
        foreach (var reading in readings.EnumerateArray().Take(2))
        {
            var lines = ReadLines(reading, capture);
            var headings = lines.Where(l => MatchHeadings.Contains(l.Text) || InviteHeadings.Contains(l.Text)).ToList();
            var accepts = lines.Where(l => AcceptLabels.Contains(l.Text)).ToList();
            var declines = lines.Where(l => DeclineLabels.Contains(l.Text)).ToList();
            // A complete navigation strip or both Direct Strike lobby panels
            // provide affirmative menu evidence even before own names resolve.
            clearMenu |= lines.Where(l => l.Bounds.Y < capture.Height * .16 && l.Text is "CAMPAIGN" or "CO-OP" or "VERSUS" or "CUSTOM" or "COLLECTION" or "REPLAYS").Select(l => l.Text).Distinct().Count() >= 3
                || lines.Any(l => l.Text == "DIRECT STRIKE" && l.Bounds.Y < capture.Height * .16)
                && lines.Any(l => l.Text is "HORDE" or "HOPDE" or "ОРДА") && lines.Any(l => l.Text is "ALLIANCE" or "АЛЬЯНС")
                && lines.Any(l => Regex.IsMatch(l.Text, @"^(?:3\s*V\s*3\s+(COMMANDERS|COMMARNDEPS|КОМАНДИРЫ)|8\s*V\s*3\s+COMMANDERS)(?: [V▼∨])?$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)));
            popupVisible |= accepts.Count > 0 || declines.Count > 0;
            if (headings.Count > 0 && (headings.Count > 1 || accepts.Count > 1 || declines.Count > 1)) ambiguous = true;
            ScreenControl? accept = null;
            string? kind = null;
            if (headings.Count == 1 && accepts.Count == 1 && declines.Count == 1)
            {
                var h = headings[0].Bounds; var a = accepts[0].Bounds; var d = declines[0].Bounds;
                bool invite = InviteHeadings.Contains(headings[0].Text);
                var context = lines.Where(l => PartyInviteContexts.Contains(l.Text) && l.Bounds.Y > h.Y + h.Height && l.Bounds.Y + l.Bounds.Height < a.Y).ToList();
                var modeContext = lines.Where(l => Regex.IsMatch(l.Text, @"^3\s*V\s*3\s+(COMMANDERS|КОМАНДИРЫ),?\s+DIRECT STRIKE$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))
                    && l.Bounds.Y > h.Y + h.Height && l.Bounds.Y + l.Bounds.Height < a.Y).ToList();
                if (h.CenterX > capture.Width * .15 && h.CenterX < capture.Width * .85 && a.Y > h.Y + h.Height && d.Y > h.Y + h.Height
                    && Math.Max(a.CenterY, d.CenterY) - h.CenterY < capture.Height * (invite ? .55 : .35) && Math.Abs(a.CenterY - d.CenterY) <= Math.Max(a.Height, d.Height) * 2
                    && Math.Abs(a.CenterX - d.CenterX) > Math.Max(a.Width, d.Width) && a.CenterX > capture.Width * .1 && a.CenterX < capture.Width * .9 && d.CenterX > capture.Width * .1 && d.CenterX < capture.Width * .9
                    && (!invite || a.CenterX < d.CenterX && context.Count == 1 && modeContext.Count == 1 && Math.Abs(context[0].Bounds.CenterX - h.CenterX) < capture.Width * .1 && Math.Abs(modeContext[0].Bounds.CenterX - h.CenterX) < capture.Width * .1))
                {
                    accept = new(a, headings[0].Proof, !invite || accepts[0].Gold ? accepts[0].Proof : null, invite ? [context[0].Proof, modeContext[0].Proof, declines[0].Proof] : null);
                    kind = invite ? "game-invite" : "match";
                }
            }
            // A party toast has no GAME INVITE heading or map name. Require
            // its complete invitation sentence above one gold Accept/Decline
            // pair in a compact horizontal layout, never a lone chat label.
            var party = lines.Where(l => Regex.IsMatch(l.Text, @"^.{1,64} INVITED YOU TO A PARTY$|^.{1,64} (?:ПРИГЛАСИЛ|ПРИГЛАСИЛА|ПРИГЛАШАЕТ) ВАС В ГРУППУ$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))).ToList();
            if (headings.Count == 0 && party.Count == 1 && accepts.Count == 1 && declines.Count == 1)
            {
                var h = party[0].Bounds; var a = accepts[0].Bounds; var d = declines[0].Bounds;
                if (a.CenterX < d.CenterX && a.Y >= h.Y + h.Height && d.Y >= h.Y + h.Height
                    && h.CenterX > capture.Width * .3
                    && a.Y - h.Y < Math.Max(h.Height * 6, capture.Height * .15)
                    && Math.Abs(a.CenterY - d.CenterY) < Math.Max(a.Height, d.Height)
                    && a.CenterX >= h.X && d.CenterX <= h.X + h.Width + capture.Width * .05
                    && d.CenterX - a.CenterX > Math.Max(a.Width, d.Width))
                {
                    accept = new(a, party[0].Proof, accepts[0].Gold ? accepts[0].Proof : null, [declines[0].Proof]);
                    kind = "party-invite";
                }
            }
            popupVisible |= headings.Count > 0 || party.Count > 0;
            var selection = lines.Where(l => SelectionHeadings.Contains(l.Text)).ToList();
            var buttons = new Dictionary<string, ScreenControl>(StringComparer.Ordinal);
            if (selection.Count > 1) ambiguous = true;
            if (selection.Count == 1 && selection[0].Bounds.CenterX > capture.Width * .15 && selection[0].Bounds.CenterX < capture.Width * .85)
            {
                var h = selection[0].Bounds;
                var found = lines.Where(l => Labels.ContainsKey(l.Text) && l.Bounds.Y > h.Y + h.Height && l.Bounds.CenterY < capture.Height * .9).GroupBy(l => Labels[l.Text], StringComparer.Ordinal).ToList();
                if (found.All(g => g.Count() == 1))
                {
                    foreach (var g in found) buttons[g.Key] = new(g.Single().Bounds, selection[0].Proof, g.Single().Proof);
                    var known = buttons.Where(b => b.Key != "Random").Select(b => b.Value.Bounds).ToList();
                    // A vertical chat list is not a commander button grid.
                    if (known.Count < 6 || known.Max(b => b.CenterX) - known.Min(b => b.CenterX) < capture.Width * .15 || known.Max(b => b.CenterY) - known.Min(b => b.CenterY) < capture.Height * .08
                        || known.Any(a => known.Any(b => a != b && Math.Abs(a.CenterX - b.CenterX) < Math.Max(a.Width, b.Width) && Math.Abs(a.CenterY - b.CenterY) < Math.Max(a.Height, b.Height)))) buttons.Clear();
                }
                else ambiguous = true;
            }
            bool mode = lines.Any(l => l.Text.StartsWith("DIRECT STRIKE", StringComparison.Ordinal)) && lines.Any(l => Regex.IsMatch(l.Text, @"^3\s*V\s*3\s+(COMMANDERS|КОМАНДИРЫ)$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)));
            scenes.Add(new(accept, buttons, mode, DetectLobby(lines, capture, ownNames), kind));
        }
        // Independent languages may agree or miss a scene; disagreement cannot
        // choose a click target. At most one complete scene kind is actionable.
        if (ambiguous) return new(null, []);
        var accepted = scenes.Where(s => s.Accept != null).Select(s => s.Accept!).ToList();
        var grids = scenes.Where(s => s.Commanders.Count >= 6).ToList();
        var lobbies = scenes.Where(s => s.Lobby != null).Select(s => s.Lobby!).ToList();
        // A genuine invite can overlay a still-readable lobby. It takes
        // precedence over commander selection in that underlying lobby.
        if (grids.Count > 0 && (accepted.Count > 0 || lobbies.Count > 0)) return new(null, []);
        if (accepted.Count > 0) return accepted.All(a => SameTarget(a.Bounds, accepted[0].Bounds)) && scenes.Where(s => s.Accept != null).Select(s => s.AcceptKind).Distinct().Count() == 1
            ? new(accepted[0], [], AcceptKind: scenes.First(s => s.Accept != null).AcceptKind) : new(null, []);
        if (grids.Count > 0 && grids.Skip(1).All(g => g.Commanders.Count == grids[0].Commanders.Count && g.Commanders.All(p => grids[0].Commanders.TryGetValue(p.Key, out var b) && Math.Abs(p.Value.Bounds.CenterX - b.Bounds.CenterX) < 12 && Math.Abs(p.Value.Bounds.CenterY - b.Bounds.CenterY) < 12))) return grids[0] with { DirectStrikeCommanders = grids.Any(g => g.DirectStrikeCommanders) };
        if (!popupVisible && lobbies.Count > 0 && lobbies.Skip(1).All(l => l.Identity == lobbies[0].Identity && SameTarget(l.Selector.Bounds, lobbies[0].Selector.Bounds)
            && l.HasChoices == lobbies[0].HasChoices && l.Options.Count == lobbies[0].Options.Count && l.Options.All(p => lobbies[0].Options.TryGetValue(p.Key, out var b) && SameTarget(p.Value.Bounds, b.Bounds)))) return new(null, [], true, lobbies[0], AcceptAbsent: true);
        return new(null, [], AcceptAbsent: clearMenu && !popupVisible);
    }
    private static LobbySelection? DetectLobby(List<TextBox> lines, ScreenCapture capture, IEnumerable<string>? ownNames)
    {
        var known = (ownNames ?? []).Where(n => !string.IsNullOrWhiteSpace(n)).Select(Normalize).ToHashSet(StringComparer.Ordinal);
        if (known.Count == 0) return null;
        var map = lines.Where(l => Regex.IsMatch(l.Text, @"^DIRECT STRIKE(?: [OО])?$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)) && l.Bounds.Y < capture.Height * .15).ToList();
        // Supplied lobby OCR reads the visible 3 as 8 in English and
        // Commanders as Commarndeps in Russian. Limit repair to these outputs;
        // map, both roster panels and exact own-row checks still apply.
        var modes = lines.Where(l => Regex.IsMatch(l.Text, @"^(?:3\s*V\s*3\s+(COMMANDERS|COMMARNDEPS|КОМАНДИРЫ)|8\s*V\s*3\s+COMMANDERS)(?: [V▼∨])?$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))).ToList();
        var horde = lines.Where(l => l.Text is "HORDE" or "HOPDE" or "ОРДА").ToList();
        var alliance = lines.Where(l => l.Text is "ALLIANCE" or "АЛЬЯНС").ToList();
        if (map.Count != 1 || modes.Count != 1 || horde.Count != 1 || alliance.Count != 1) return null;
        var first = horde[0].Bounds; var second = alliance[0].Bounds; double gap = second.Y - first.Y;
        if (first.X > capture.Width * .5 || second.X > capture.Width * .5 || gap < capture.Height * .15 || gap > capture.Height * .5 || Math.Abs(first.X - second.X) > capture.Width * .05) return null;
        // Existing OCR fixtures split TKnight as T Knight. Repair whitespace
        // only when it identifies one configured own nickname uniquely.
        var keys = known.GroupBy(n => n.Replace(" ", "", StringComparison.Ordinal)).Where(g => g.Count() == 1).ToDictionary(g => g.Key, g => g.Single(), StringComparer.Ordinal);
        string OwnRowKey(TextBox line) => Regex.Replace(line.Text, @"\s*\((?:HOST|ХОЗЯИН|СОЗДАТЕЛЬ)\)$", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)).Replace(" ", "", StringComparison.Ordinal);
        var names = lines.Where(l => keys.ContainsKey(OwnRowKey(l)) && l.Bounds.X > first.X && l.Bounds.X < first.X + capture.Width * .35
            && new[] { first, second }.Any(panel => l.Bounds.Y > panel.Y + gap * .12 && l.Bounds.Y < panel.Y + gap * .86)).ToList();
        if (names.Count != 1) return null;
        var own = names[0];
        var selectors = lines.Where(l => (l.Text is "SELECT" or "ВЫБРАТЬ") && l.Bounds.X > own.Bounds.X + own.Bounds.Width + capture.Width * .15
            && l.Bounds.CenterX < capture.Width * .82 && Math.Abs(l.Bounds.CenterY - own.Bounds.CenterY) < Math.Max(l.Bounds.Height, own.Bounds.Height) * 1.5).ToList();
        if (selectors.Count != 1) return null;
        var selector = selectors[0];
        IReadOnlyList<RegionProof?> proofs = [map[0].Proof, modes[0].Proof, horde[0].Proof, alliance[0].Proof, own.Proof];
        var control = new ScreenControl(selector.Bounds, own.Proof, selector.Proof, proofs);
        // An expanded list must expose several exact commander labels in one
        // non-overlapping column next to the observed selector, never chat.
        var options = lines.Where(l => Labels.ContainsKey(l.Text) && l.Bounds.Y > selector.Bounds.Y + selector.Bounds.Height
            && l.Bounds.CenterY < capture.Height * .95 && Math.Abs(l.Bounds.CenterX - selector.Bounds.CenterX) < capture.Width * .12).ToList();
        var found = new Dictionary<string, ScreenControl>(StringComparer.Ordinal);
        if (options.Count >= 6 && options.GroupBy(l => Labels[l.Text]).All(g => g.Count() == 1)
            && options.Max(l => l.Bounds.CenterX) - options.Min(l => l.Bounds.CenterX) < capture.Width * .05
            && options.All(a => options.All(b => a == b || Math.Abs(a.Bounds.CenterY - b.Bounds.CenterY) > Math.Max(a.Bounds.Height, b.Bounds.Height))))
            foreach (var option in options) found[Labels[option.Text]] = new(option.Bounds, own.Proof, option.Proof, proofs.Append(selector.Proof).ToArray());
        return new(keys[OwnRowKey(own)], control, found, options.Count > 0);
    }
    private static List<TextBox> ReadLines(JsonElement reading, ScreenCapture capture)
    {
        var result = new List<TextBox>();
        if (!reading.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array) return result;
        foreach (var line in lines.EnumerateArray().Take(160))
        {
            try
            {
                var words = line.GetProperty("words").EnumerateArray().Take(24).Select(w => new ScreenBox(w.GetProperty("x").GetDouble(), w.GetProperty("y").GetDouble(), w.GetProperty("width").GetDouble(), w.GetProperty("height").GetDouble())).ToList();
                if (words.Count == 0 || words.Any(w => !w.Valid(capture.Width, capture.Height))) continue;
                var left = words.Min(w => w.X); var top = words.Min(w => w.Y);
                RegionProof? proof = null;
                if (line.TryGetProperty("proof", out var p))
                {
                    proof = new(p.GetProperty("left").GetInt32(), p.GetProperty("top").GetInt32(), p.GetProperty("width").GetInt32(), p.GetProperty("height").GetInt32(), p.GetProperty("hash").GetString()!, p.TryGetProperty("glyphMask", out var mask) && mask.ValueKind == JsonValueKind.String ? mask.GetString() : null);
                    if (!proof.Valid(capture.Bounds)) proof = null;
                }
                var text = line.GetProperty("text").GetString();
                if (text == null) continue;
                result.Add(new(Normalize(text), new(left, top, words.Max(w => w.X + w.Width) - left, words.Max(w => w.Y + w.Height) - top), proof,
                    line.TryGetProperty("acceptGold", out var gold) && gold.ValueKind == JsonValueKind.True));
            }
            catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException or FormatException or ArgumentException) { }
        }
        return result;
    }

    internal sealed record WindowProof(long Handle, int ProcessId, string ProcessName, string Executable, bool Foreground, bool Visible, bool Minimized, bool Unobscured, WindowBounds Bounds, bool InputHeld = false);
    internal static string? InputBlockReason(ScreenCapture capture, ScreenBox target, WindowProof current, DateTime now)
    {
        if (!capture.Live || !capture.Foreground || !capture.Unobscured || now < capture.CapturedAt || now - capture.CapturedAt > InputFreshness) return "Fresh live SC2 capture required · no action";
        if (!target.Valid(capture.Width, capture.Height)) return "Control bounds invalid · no action";
        if (current.Handle != capture.WindowHandle || current.ProcessId != capture.ProcessId || current.ProcessName != capture.ProcessName || !IsSc2(current.ProcessName) || Path.GetFileName(current.Executable) != current.ProcessName + ".exe") return "SC2 process identity changed · no action";
        if (!current.Foreground || !current.Visible || current.Minimized || !current.Unobscured || current.Bounds != capture.Bounds) return "SC2 window changed, covered or not foreground · no action";
        if (current.InputHeld) return "User input held · waiting";
        return null;
    }
    internal sealed record InputResult(bool Sent, bool Attempted, string Status);
    internal static string? BackgroundInputBlockReason(ScreenCapture capture, ScreenBox target, WindowProof current, DateTime now)
    {
        if (!capture.Live || (!capture.Unobscured && !capture.WindowCapture) || now < capture.CapturedAt || now - capture.CapturedAt > InputFreshness)
            return "Fresh SC2 window capture required · no action";
        if (!target.Valid(capture.Width, capture.Height)) return "Control bounds invalid · no action";
        if (current.Handle != capture.WindowHandle || current.ProcessId != capture.ProcessId || current.ProcessName != capture.ProcessName || !IsSc2(current.ProcessName)
            || !string.Equals(Path.GetFileName(current.Executable), current.ProcessName + ".exe", StringComparison.OrdinalIgnoreCase)) return "SC2 process identity changed · no action";
        if (!current.Visible || current.Minimized || current.Bounds != capture.Bounds || !capture.WindowCapture && !current.Unobscured)
            return "SC2 window changed or stopped rendering · no action";
        if (current.InputHeld) return "User input held · waiting";
        return null;
    }
    internal static InputResult DeliveryResult(uint sent, int expected) => sent == expected
        ? new(true, true, "Click sent; SC2 result unconfirmed")
        : sent == 0 ? new(false, false, "SC2 did not receive automatic input · no click sent")
        : new(false, true, "Input delivery incomplete · verify SC2 manually");
    internal static InputResult DeliverWindowClick(Func<uint, bool> send, Action hold)
    {
        if (!send(0x200)) return new(false, false, "SC2 window did not acknowledge mouse position · no click sent");
        bool down = false, up = false;
        try
        {
            down = send(0x201);
            if (down) hold();
        }
        finally
        {
            // A timeout does not prove that down was never processed. Always
            // release and mark the opportunity attempted to avoid duplicates.
            up = send(0x202);
            if (!up) up = send(0x202);
        }
        return new(down && up, true, down && up
            ? "SC2 window click processed · acceptance unconfirmed"
            : "SC2 window input timed out or failed · acceptance unconfirmed");
    }
    internal static InputResult DeliverHardwareClick(Func<uint, uint> send, Action hold)
    {
        uint pressed = send(2);
        if (pressed != 2) return DeliveryResult(pressed, 3);
        uint released = 0;
        try { hold(); }
        finally
        {
            released = send(1);
            if (released == 0) released = send(1); // Best-effort cleanup of an injected down.
        }
        return DeliveryResult(pressed + released, 3);
    }
    internal interface ISc2Input { InputResult TryClick(ScreenCapture capture, ScreenControl target, DateTime now); }
    internal interface ISc2BackgroundInput
    {
        InputResult TryAccept(ScreenCapture capture, ScreenControl target, DateTime now);
    }
    private sealed class WindowsSc2Input : ISc2Input, ISc2BackgroundInput
    {
        public InputResult TryAccept(ScreenCapture capture, ScreenControl target, DateTime now)
        {
            try
            {
                var handle = new IntPtr(capture.WindowHandle);
                GetWindowThreadProcessId(handle, out var pid);
                using var process = Process.GetProcessById(checked((int)pid));
                if (!GetWindowRect(handle, out var rect)) return new(false, false, "SC2 bounds unavailable · no action");
                var bounds = new WindowBounds(rect.Left, rect.Top, rect.Right, rect.Bottom);
                var current = new WindowProof(handle.ToInt64(), process.Id, process.ProcessName, process.MainModule?.FileName ?? "", false, IsWindowVisible(handle), IsIconic(handle), Unobscured(handle, rect), bounds,
                    new[] { 1, 2, 4, 16, 17, 18 }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0));
                var reason = BackgroundInputBlockReason(capture, target.Bounds, current, DateTime.UtcNow);
                if (reason != null) return new(false, false, reason);
                using var imageStream = capture.WindowCapture ? new MemoryStream(Sc2WindowCapture.CaptureForInput(handle), false) : null;
                using var image = imageStream == null ? null : new System.Drawing.Bitmap(imageStream);
                var proofs = new[] { target.HeadingProof, target.TargetProof }.Concat(target.ContextProofs ?? []);
                if (proofs.Any(p => p == null || !p.Valid(bounds) || !RegionUnchanged(p, bounds, image))) return new(false, false, "SC2 invite changed after OCR · no action");
                var point = new Point { X = bounds.Left + (int)Math.Round(target.Bounds.CenterX * bounds.Width / capture.Width), Y = bounds.Top + (int)Math.Round(target.Bounds.CenterY * bounds.Height / capture.Height) };
                if (!ScreenToClient(handle, ref point) || !GetClientRect(handle, out var client) || point.X < 0 || point.Y < 0 || point.X >= client.Right || point.Y >= client.Bottom)
                    return new(false, false, "SC2 invite coordinates unavailable · no action");
                GetWindowThreadProcessId(handle, out var lastPid);
                if (lastPid != pid || !GetWindowRect(handle, out var last) || new WindowBounds(last.Left, last.Top, last.Right, last.Bottom) != bounds
                    || IsIconic(handle) || !IsWindowVisible(handle) || DateTime.UtcNow - capture.CapturedAt > InputFreshness
                    || new[] { 1, 2, 4, 16, 17, 18 }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0))
                    return new(false, false, "SC2 invite or user input changed · no action");
                // Address only the verified SC2 HWND using client coordinates.
                // No desktop cursor movement or focus change is involved.
                var coordinates = new IntPtr((point.Y << 16) | (point.X & 0xffff));
                return DeliverWindowClick(message => SendMessageTimeout(handle, message,
                    message == 0x201 ? new IntPtr(1) : IntPtr.Zero, coordinates, 0x23, 250, out _) != IntPtr.Zero,
                    () => Thread.Sleep(120));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or ExternalException or OverflowException or OperationCanceledException)
            { return new(false, false, "SC2 window input unavailable · " + ex.Message); }
        }
        public InputResult TryClick(ScreenCapture capture, ScreenControl target, DateTime now)
        {
            try
            {
                var handle = new IntPtr(capture.WindowHandle);
                GetWindowThreadProcessId(handle, out var pid);
                using var process = Process.GetProcessById(checked((int)pid));
                if (!GetWindowRect(handle, out var rect)) return new(false, false, "SC2 bounds unavailable · no action");
                var bounds = new WindowBounds(rect.Left, rect.Top, rect.Right, rect.Bottom);
                var proof = new WindowProof(handle.ToInt64(), process.Id, process.ProcessName, process.MainModule?.FileName ?? "", GetForegroundWindow() == handle, IsWindowVisible(handle), IsIconic(handle), Unobscured(handle, rect), bounds,
                    new[] { 1, 2, 4, 16, 17, 18 }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0));
                var reason = InputBlockReason(capture, target.Bounds, proof, DateTime.UtcNow);
                if (reason != null) return new(false, false, reason);
                if (target.HeadingProof == null || target.TargetProof == null || !target.HeadingProof.Valid(bounds) || !target.TargetProof.Valid(bounds)) return new(false, false, "Control pixel proof unavailable · no action");
                if (target.ContextProofs != null && target.ContextProofs.Any(p => p == null || !p.Valid(bounds) || !RegionUnchanged(p, bounds))) return new(false, false, "SC2 control context changed after OCR · no action");
                if (!RegionUnchanged(target.HeadingProof, bounds) || !RegionUnchanged(target.TargetProof, bounds)) return new(false, false, "SC2 control pixels changed after OCR · no action");
                int x = bounds.Left + (int)Math.Round(target.Bounds.CenterX * bounds.Width / capture.Width), y = bounds.Top + (int)Math.Round(target.Bounds.CenterY * bounds.Height / capture.Height);
                int left = GetSystemMetrics(76), top = GetSystemMetrics(77), width = GetSystemMetrics(78), height = GetSystemMetrics(79);
                if (width <= 1 || height <= 1 || x < left || y < top || x >= left + width || y >= top + height) return new(false, false, "Desktop control coordinates unavailable · no action");
                var move = new MouseInput { Dx = (int)Math.Round((x - left) * 65535.0 / (width - 1)), Dy = (int)Math.Round((y - top) * 65535.0 / (height - 1)), Flags = 0xC001 };
                Input[] inputs = [new() { Data = new() { Mouse = move } }, new() { Data = new() { Mouse = new() { Flags = 2 } } }, new() { Data = new() { Mouse = new() { Flags = 4 } } }];
                // No focus changes. Recheck identity/geometry immediately before
                // one serial move/down/up batch, as specified by Win32 SendInput.
                GetWindowThreadProcessId(handle, out var lastPid);
                if (lastPid != pid || GetForegroundWindow() != handle || DateTime.UtcNow - capture.CapturedAt > InputFreshness || !GetWindowRect(handle, out var last) || last.Left != rect.Left || last.Top != rect.Top || last.Right != rect.Right || last.Bottom != rect.Bottom || !Unobscured(handle, last)) return new(false, false, "SC2 changed before input · no action");
                if (!RegionUnchanged(target.HeadingProof, bounds) || !RegionUnchanged(target.TargetProof, bounds)
                    || target.ContextProofs != null && target.ContextProofs.Any(p => p == null || !RegionUnchanged(p, bounds))) return new(false, false, "SC2 control changed before input · no action");
                // Keep down visible across a game frame. A move/down/up batch
                // can finish before a game polling button state sees the press.
                return DeliverHardwareClick(count => SendInput(count, count == 2 ? inputs.Take(2).ToArray() : [inputs[2]], Marshal.SizeOf<Input>()), () => Thread.Sleep(80));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or ExternalException or OverflowException) { return new(false, false, "SC2 input validation unavailable · no action"); }
        }
        private static bool RegionUnchanged(RegionProof proof, WindowBounds bounds, System.Drawing.Bitmap? source = null)
        {
            using var image = new System.Drawing.Bitmap(proof.Width, proof.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using (var graphics = System.Drawing.Graphics.FromImage(image))
            {
                if (source == null) graphics.CopyFromScreen(bounds.Left + proof.Left, bounds.Top + proof.Top, 0, 0, image.Size);
                else
                {
                    if (source.Width != bounds.Width || source.Height != bounds.Height) return false;
                    graphics.DrawImage(source, new System.Drawing.Rectangle(0, 0, image.Width, image.Height), new System.Drawing.Rectangle(proof.Left, proof.Top, proof.Width, proof.Height), System.Drawing.GraphicsUnit.Pixel);
                }
            }
            var bits = image.LockBits(new(0, 0, image.Width, image.Height), System.Drawing.Imaging.ImageLockMode.ReadOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            try
            {
                var bytes = new byte[bits.Stride * image.Height];
                Marshal.Copy(bits.Scan0, bytes, 0, bytes.Length);
                for (int i = 3; i < bytes.Length; i += 4) bytes[i] = 255; // GDI alpha is not screen evidence.
                return Convert.ToHexString(SHA256.HashData(bytes)) == proof.Hash
                    || proof.GlyphMask != null && Sc2TextProof.Matches(proof.GlyphMask, bytes, image.Width, image.Height, bits.Stride);
            }
            finally { image.UnlockBits(bits); }
        }
        private static bool Unobscured(IntPtr handle, Rect rect)
        {
            var above = GetWindow(handle, 3);
            for (int i = 0; above != IntPtr.Zero; i++, above = GetWindow(above, 3))
            {
                if (i >= 512) return false;
                if (!IsWindowVisible(above) || IsIconic(above)) continue;
                if (DwmGetWindowAttribute(above, 14, out var cloaked, 4) == 0 && cloaked != 0) continue;
                if (!GetWindowRect(above, out var other)) return false;
                if (other.Left < rect.Right && other.Right > rect.Left && other.Top < rect.Bottom && other.Bottom > rect.Top) return false;
            }
            return true;
        }
        [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] private struct MouseInput { public int Dx, Dy; public uint MouseData, Flags, Time; public IntPtr ExtraInfo; }
        [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public MouseInput Mouse; }
        [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion Data; }
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h, out Rect rect);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr h, uint command);
        [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr h, uint attribute, out int value, int size);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
        [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW", SetLastError = true)] private static extern IntPtr SendMessageTimeout(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr handle, ref Point point);
        [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr handle, out Rect rect);
    }
}
