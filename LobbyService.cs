using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

public sealed class LobbyService(Store store, Action<string, string, bool> notify, Action<GameSound>? playGameSound = null,
    Action<IReadOnlyList<string>, string?>? rosterChanged = null)
{
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly List<Alert> alerts = [];
    private readonly HashSet<string> notified = [];
    private readonly object noticeGate = new();
    private readonly SemaphoreSlim observationGate = new(1, 1);
    private readonly SemaphoreSlim refreshSignal = new(0, 1);
    private readonly object watchGate = new();
    private readonly OcrBudget ocrBudget = new();
    private readonly GameSounds gameSounds = new();
    private readonly MatchAcceptSounds acceptSounds = new();
    private readonly Sc2Automation automation = new();
    private LobbyOcrWorker? ocrWorker;
    private LobbyOcrTelemetry? lastOcrRead;
    private DateTime? lastWatch;
    private string session = "";
    private DateTime lastOcr;
    private double lastDisplayTime;
    private bool isPlaying;
    private string rosterSource = "none";
    private string phase = "waiting";
    private string clientPhase = "waiting";
    private string detectionStatus = "No current names detected";
    private DateTime? observedAt;
    private DateTime? rosterUpdatedAt;
    private bool screenHeld;
    private List<int> rosterTeams = [];
    private string? rosterRegion;
    private static readonly TimeSpan ScreenFreshness = TimeSpan.FromSeconds(18);
    private static readonly TimeSpan ManualLifetime = TimeSpan.FromMinutes(5);
    internal sealed record Candidate(string Id, string Name, List<string> Aliases, bool Marked, bool NameOnly, string? List = null);
    internal sealed record RosterEntry(string Name, List<Candidate> Candidates, bool Marked, bool NameOnly, bool Ambiguous,
        [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] int? Team = null);
    public string LiveStatus { get; private set; } = "Waiting for StarCraft II";
    public string OcrStatus { get; private set; } = "Lobby screen reader off";
    public List<string> Roster { get; private set; } = [];
    // Opening Live lobby also enables background monitoring. Heartbeats wake
    // client polling; screen checks remain serial and resource guarded.
    public void Watch() => WatchAt(DateTime.UtcNow);
    internal void WatchAt(DateTime now)
    {
        lock (watchGate)
        {
            lock (store.Gate)
            {
                var changed = !store.Data.Settings.LiveWatch || !store.Data.Settings.ScreenWatch;
                store.Data.Settings.LiveWatch = true;
                store.Data.Settings.ScreenWatch = true;
                if (changed) store.Save();
            }
            if (!lastWatch.HasValue || now - lastWatch.Value > TimeSpan.FromSeconds(15))
            {
                lock (alerts) OcrStatus = "Live lobby monitoring enabled · checking SC2";
            }
            lastWatch = now;
            try { refreshSignal.Release(); } catch (SemaphoreFullException) { }
        }
    }
    public object Snapshot() => SnapshotAt(DateTime.UtcNow);
    public void RefreshNicknameLinks()
    {
        string[] names; string? region;
        lock (alerts) { names = Roster.ToArray(); region = rosterRegion; }
        rosterChanged?.Invoke(names, region);
    }
    internal object SnapshotAt(DateTime now)
    {
        var known = KnownPlayers(store);
        lock (alerts)
        {
            Expire(now);
            var entries = Roster.Select((name, index) =>
            {
                var nickname = SiteSyncService.NormalizeName(name);
                var candidates = known.Where(p => nickname.Length > 0
                    && (rosterRegion == null || SiteSyncService.NativeRegion(p.Id) is not { } nativeRegion || nativeRegion == rosterRegion)
                    && p.Aliases.Any(alias => string.Equals(SiteSyncService.NormalizeName(alias), nickname, StringComparison.OrdinalIgnoreCase))).ToList();
                var team = index < rosterTeams.Count && rosterTeams[index] is 1 or 2 ? (int?)rosterTeams[index] : null;
                return new RosterEntry(name, candidates, candidates.Any(p => p.Marked), candidates.Count == 0 || candidates.All(p => p.NameOnly), candidates.Count(p => !p.NameOnly) > 1, team);
            }).ToList();
            var held = rosterSource == "screen" && (screenHeld || observedAt.HasValue && now - observedAt > ScreenFreshness);
            return new { liveStatus = LiveStatus, ocrStatus = OcrStatus, roster = Roster.ToList(), alerts = alerts.TakeLast(15).Reverse().ToList(), source = rosterSource, region = rosterRegion, phase, observedAt, rosterUpdatedAt, detectionStatus, held, partial = rosterSource is "screen" or "manual", rosterEntries = entries, automation = automation.SnapshotAt(now), reader = new { worker = ocrWorker?.Snapshot, lastRead = lastOcrRead } };
        }
    }
    internal static List<Candidate> KnownPlayers(Store store)
    {
        lock (store.Gate)
        {
            var sightings = store.Data.Matches.SelectMany(m => m.Players.Select(p => (m.Time, Player: p))).GroupBy(p => p.Player.Id).ToList();
            var players = sightings.ToDictionary(g => g.Key, g => g.Select(p => p.Player.Name).Where(n => !string.IsNullOrWhiteSpace(n)).Distinct(StringComparer.OrdinalIgnoreCase).ToList());
            var realNames = sightings.ToDictionary(g => g.Key, g => g.MaxBy(p => p.Time).Player.Name);
            foreach (var mark in store.Data.Marks.Values)
            {
                if (!players.TryGetValue(mark.Id, out var names)) players[mark.Id] = names = [];
                if (!string.IsNullOrWhiteSpace(mark.Name) && !names.Contains(mark.Name, StringComparer.OrdinalIgnoreCase)) names.Add(mark.Name);
            }
            foreach (var localName in store.Data.OwnLocalNames)
            {
                if (!store.Data.Settings.SelfIds.Contains(localName.Id)) continue;
                if (!players.TryGetValue(localName.Id, out var names)) players[localName.Id] = names = [];
                if (!names.Contains(localName.Name, StringComparer.OrdinalIgnoreCase)) names.Add(localName.Name);
            }
            return players.Select(p =>
            {
                var mark = store.Data.Marks.GetValueOrDefault(p.Key);
                var aliases = p.Value.Concat(store.Data.PlayerNicknames.GetValueOrDefault(p.Key, [])).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                return new Candidate(p.Key, realNames.GetValueOrDefault(p.Key) ?? p.Value.LastOrDefault() ?? "", aliases, mark != null && store.Data.Settings.IsListAlertEnabled(mark.List), p.Key.StartsWith("name:", StringComparison.Ordinal), mark?.List);
            }).ToList();
        }
    }
    internal static bool ContainsName(string text, string name) => name.Length > 0 && Regex.IsMatch(text, @"(?<![\p{L}\p{N}_])" + Regex.Escape(name) + @"(?![\p{L}\p{N}_])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    internal static bool IsFinishedClientMatch(JsonElement players) => players.ValueKind == JsonValueKind.Array && players.GetArrayLength() > 0 && players.EnumerateArray().All(p => p.ValueKind == JsonValueKind.Object && p.TryGetProperty("result", out var result) && result.ValueKind == JsonValueKind.String && result.GetString() is "Win" or "Loss" or "Victory" or "Defeat");
    private void SetRoster(List<string> names, string source, string nextPhase, string status, DateTime now, IReadOnlyList<int>? teams = null, string? region = null)
    {
        var nextTeams = ValidScreenTeams(teams, names.Count) ? teams!.ToList() : [];
        var nextRegion = source == "screen" && names.Count > 0 && region is "EU" or "Americas" ? region : null;
        bool changed = rosterSource != source || !Roster.SequenceEqual(names) || !rosterTeams.SequenceEqual(nextTeams) || rosterRegion != nextRegion;
        if (changed) rosterUpdatedAt = now;
        Roster = names;
        rosterTeams = nextTeams;
        rosterRegion = nextRegion;
        rosterSource = source;
        phase = nextPhase;
        detectionStatus = status;
        observedAt = now;
        screenHeld = false;
        if (changed) rosterChanged?.Invoke(names.ToArray(), nextRegion);
    }
    private void ClearRoster(string nextPhase, string status, DateTime now) => SetRoster([], "none", nextPhase, status, now);
    private void Expire(DateTime now)
    {
        if (observedAt.HasValue && rosterSource == "manual" && now - observedAt > ManualLifetime)
            ClearRoster(clientPhase, "Previous name observation expired", now);
    }
    internal void ApplyClientObservation(List<string> names, bool replay, bool finished, bool menuVisible, bool connected, bool enabled, DateTime now)
    {
        lock (alerts)
        {
            isPlaying = enabled && connected && !finished && !menuVisible && (replay || names.Count > 0);
            clientPhase = !enabled ? "off" : !connected ? "disconnected" : replay && !finished && !menuVisible ? "replay" : isPlaying ? "match" : finished ? "finished" : "pregame";
            if (!enabled || !connected || replay || isPlaying && !automation.CanReadCommanderSelection(now)) automation.Suppress(!enabled ? "Monitoring off" : !connected ? "SC2 client disconnected" : replay ? "Replay playback · automation paused" : "Match underway · automation paused");
            LiveStatus = !enabled ? "Match alerts off" : !connected ? "Waiting for SC2 client on port 6119" : replay ? "Replay playback · alerts suppressed" : finished ? "Match complete · waiting for lobby" : menuVisible ? "SC2 menus · client does not expose pregame names" : names.Count > 0 ? "Match roster detected · names only" : "SC2 connected · waiting for a match";
            if (enabled && connected && replay && !finished && !menuVisible) ClearRoster("replay", "Replay names suppressed", now);
            else if (isPlaying) SetRoster(names.ToList(), "client", "match", "Exact client names · identity and team unconfirmed", now);
            else
            {
                var nextPhase = clientPhase;
                // Manual observations remain explicitly manual until expiry or another source supersedes them.
                if (rosterSource == "client") ClearRoster(nextPhase, "No current client roster", now);
                else if (rosterSource == "none") { phase = nextPhase; detectionStatus = "No current names detected"; }
                Expire(now);
            }
        }
    }
    // Old callers can still supply text; the live reader always supplies player rows,
    // including an empty list when no lobby layout was recognized.
    internal void ApplyScreenObservation(string text, bool valid, DateTime now) => ApplyScreenObservation(text, valid, now, null);
    internal List<string> ApplyScreenObservation(string text, bool valid, DateTime now, IReadOnlyList<string>? rosterNames, IReadOnlyList<int>? teams = null, string? region = null)
    {
        var aliases = valid ? KnownPlayers(store).SelectMany(p => p.Aliases).Distinct(StringComparer.OrdinalIgnoreCase).ToList() : [];
        var names = !valid ? [] : rosterNames == null
            ? aliases.Where(n => ContainsName(text, n)).Take(12).ToList()
            : ScreenRosterNames(rosterNames, aliases);
        lock (alerts)
        {
            if (isPlaying) return [];
            var emptyStatus = rosterNames != null ? "No player rows observed on screen" : "No known names observed · OCR cannot establish a full roster";
            if (valid && names.Count > 0) SetRoster(names, "screen", "pregame", rosterNames != null ? "OCR player rows · verify names and identity on screen" : "Partial OCR name matches · verify names on screen", now, names.Count == rosterNames?.Count ? teams : null, names.Count == rosterNames?.Count ? region : null);
            else if (rosterSource == "screen")
            {
                // Keep the last pregame roster while the user checks the dashboard
                // or SC2 is covered. Only a fresh lobby or a loaded match replaces it.
                screenHeld = true;
                detectionStatus = "Last detected lobby · waiting for a fresh visible lobby";
            }
            else if (rosterSource == "none") detectionStatus = valid ? emptyStatus : "Waiting for a readable SC2 screen · see screen reader status";
            Expire(now);
            return names;
        }
    }
    internal static List<string> ReadScreenRoster(JsonElement result)
    {
        if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty("rosterNames", out var rows) || rows.ValueKind != JsonValueKind.Array) return [];
        return ScreenRosterNames(rows.EnumerateArray().Take(6).Select(row => row.ValueKind == JsonValueKind.String ? row.GetString() ?? "" : "").ToList(), []);
    }
    internal static List<int> ReadScreenTeams(JsonElement result)
    {
        if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty("rosterNames", out var names) || names.ValueKind != JsonValueKind.Array || names.GetArrayLength() > 6
            || !result.TryGetProperty("rosterTeams", out var teams) || teams.ValueKind != JsonValueKind.Array || teams.GetArrayLength() != names.GetArrayLength()
            || ReadScreenRoster(result).Count != names.GetArrayLength()) return [];
        var values = teams.EnumerateArray().Select(team => team.ValueKind == JsonValueKind.Number && team.TryGetInt32(out var value) ? value : 0).ToList();
        return ValidScreenTeams(values, names.GetArrayLength()) ? values : [];
    }
    internal static string? ReadScreenRegion(JsonElement result)
    {
        if (result.ValueKind != JsonValueKind.Object || !result.TryGetProperty("rosterNames", out var names) || names.ValueKind != JsonValueKind.Array
            || names.GetArrayLength() is < 1 or > 6 || ReadScreenRoster(result).Count != names.GetArrayLength()
            || !result.TryGetProperty("region", out var region) || region.ValueKind != JsonValueKind.String) return null;
        return region.GetString() is "EU" or "Americas" ? region.GetString() : null;
    }
    private static bool ValidScreenTeams(IReadOnlyList<int>? teams, int count) => teams != null && count is > 0 and <= 6 && teams.Count == count
        && teams.All(team => team is 1 or 2) && teams.Count(team => team == 1) <= 3 && teams.Count(team => team == 2) <= 3;
    private static List<string> ScreenRosterNames(IReadOnlyList<string> rows, List<string> aliases)
    {
        static string WithoutWhitespace(string name) => new(name.Where(c => !char.IsWhiteSpace(c)).ToArray());
        static bool HasUnsafeCharacters(string name) => name.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format);
        var names = new List<string>();
        var nicknames = aliases.Select(SiteSyncService.NormalizeName).Where(name => name.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        foreach (var row in rows.Take(6))
        {
            if (row == null) continue;
            var name = row.Trim();
            if (name.Length is 0 or > 64 || HasUnsafeCharacters(row)) continue;
            // An exact spelling wins. Whitespace repair chooses a spelling, never
            // an identity: multiple replay IDs sharing that alias remain candidates.
            var nickname = SiteSyncService.NormalizeName(name);
            if (!nicknames.Contains(nickname, StringComparer.OrdinalIgnoreCase))
            {
                var compact = WithoutWhitespace(nickname);
                var spellings = nicknames.Where(alias => WithoutWhitespace(alias).Equals(compact, StringComparison.OrdinalIgnoreCase)).Take(2).ToList();
                if (spellings.Count == 1 && spellings[0].Length <= 64 && !HasUnsafeCharacters(spellings[0]))
                {
                    var prefix = Regex.Match(name, @"^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)).Value;
                    var repaired = prefix + spellings[0];
                    if (repaired.Length <= 64) name = repaired;
                }
            }
            names.Add(name);
        }
        return names;
    }
    public List<Mark> Check(string text, string source, bool always = false)
    {
        List<Mark> marks;
        Dictionary<string, List<string>> aliases;
        string? region;
        lock (alerts) region = source == "SC2 screen · verify name" ? rosterRegion : null;
        lock (store.Gate)
        {
            marks = store.Data.Marks.Values.Where(m => store.Data.Settings.IsListAlertEnabled(m.List)
                && (region == null || SiteSyncService.NativeRegion(m.Id) is not { } nativeRegion || nativeRegion == region)).ToList();
            aliases = marks.ToDictionary(m => m.Id, m => store.Data.Matches.SelectMany(g => g.Players).Where(p => p.Id == m.Id).Select(p => p.Name).Append(m.Name).Concat(store.Data.PlayerNicknames.GetValueOrDefault(m.Id, [])).Where(n => !string.IsNullOrWhiteSpace(n)).Distinct(StringComparer.OrdinalIgnoreCase).ToList());
        }
        // Names are evidence only: client and OCR do not expose stable replay identities.
        var exactRosterNames = source is "Match roster" or "SC2 screen · verify name" ? text.Split('\n').ToHashSet(StringComparer.OrdinalIgnoreCase) : null;
        var hits = marks.Where(m => aliases[m.Id].Any(name => exactRosterNames != null ? exactRosterNames.Contains(name) : ContainsName(text, name))).DistinctBy(m => m.Id).ToList();
        lock (alerts)
        {
            if (phase == "replay") return hits;
            if (always && source == "Manual lobby check")
            {
                var names = text.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(12).ToList();
                if (names.Count > 0) SetRoster(names, "manual", "manual", "Manually supplied names · verify current lobby and identity", DateTime.UtcNow);
                else ClearRoster(clientPhase, "Manual roster cleared", DateTime.UtcNow);
            }
        }
        List<Mark> fresh;
        lock (noticeGate)
        {
            fresh = hits.Where(m => always || !notified.Contains(source + ":" + m.Id)).ToList();
            foreach (var mark in fresh) notified.Add(source + ":" + mark.Id);
        }
        if (fresh.Count > 0)
        {
            var names = fresh.Select(m => m.Name).Distinct().ToList();
            var message = "Marked name detected: " + string.Join(", ", names) + ". Confirm the player and team.";
            bool sound;
            lock (store.Gate) sound = store.Data.Settings.Sound;
            lock (alerts) { alerts.Add(new(DateTime.UtcNow, source, message, names)); if (alerts.Count > 100) alerts.RemoveAt(0); }
            notify("Direct Strike · marked player", message, sound);
        }
        return hits;
    }
    public async Task Poll(CancellationToken ct)
    {
        LobbyOcrWorker? reader = null;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                bool attemptedOcr = false;
                await observationGate.WaitAsync(ct);
                try
                {
                    bool live, ocr, sounds, actions, picking, acceptSound;
                    lock (store.Gate) { live = store.Data.Settings.LiveWatch; ocr = store.Data.Settings.ScreenWatch; acceptSound = store.Data.Settings.PingOnMatchAccept; sounds = store.Data.Settings.PingOnGameLoading || store.Data.Settings.PingOnGameLoaded || acceptSound; picking = store.Data.Settings.AutoPickCommander != ""; actions = store.Data.Settings.AutoAcceptMatch || picking; }
                    // Screen detection also needs client state to suppress names
                    // during matches and replay playback, even with match alerts off.
                    if (live || ocr || sounds || actions)
                    {
                        try
                        {
                            var json = await http.GetStringAsync("http://127.0.0.1:6119/game", ct);
                            using var doc = JsonDocument.Parse(json);
                            var root = doc.RootElement;
                            bool replay = root.TryGetProperty("isReplay", out var isReplay) && isReplay.ValueKind == JsonValueKind.True;
                            var displayTime = root.TryGetProperty("displayTime", out var clock) && clock.TryGetDouble(out var seconds) ? seconds : 0;
                            var names = root.TryGetProperty("players", out var players) && players.ValueKind == JsonValueKind.Array
                                ? players.EnumerateArray().Where(p => p.TryGetProperty("name", out _)).Select(p => p.GetProperty("name").GetString() ?? "").Where(n => n.Length > 0).ToList() : [];
                            bool finished = names.Count > 0 && IsFinishedClientMatch(players);
                            bool menuVisible = false;
                            JsonElement soundUi = default;
                            try
                            {
                                using var ui = JsonDocument.Parse(await http.GetStringAsync("http://127.0.0.1:6119/ui", ct));
                                soundUi = ui.RootElement.Clone();
                                menuVisible = ui.RootElement.TryGetProperty("activeScreens", out var screens) && screens.ValueKind == JsonValueKind.Array && screens.GetArrayLength() > 0;
                            }
                            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { }
                            ApplyGameSoundObservation(root, soundUi);
                            if (live || ocr)
                            {
                                var current = finished || menuVisible || replay ? "" : string.Join("|", names.Order());
                                if (current != session || displayTime + 5 < lastDisplayTime) { session = current; lock (noticeGate) notified.Clear(); }
                                lastDisplayTime = displayTime;
                            }
                            ApplyClientObservation(names, replay, finished, menuVisible, true, live || ocr || actions || acceptSound, DateTime.UtcNow);
                            if (live && !replay && !finished && !menuVisible && names.Count > 0) Check(string.Join("\n", names), "Match roster");
                        }
                        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { acceptSounds.ObserveClient(default, default, false, DateTime.UtcNow); ApplyClientObservation([], false, false, false, false, live || ocr || actions || acceptSound, DateTime.UtcNow); if ((live || ocr) && session != "") { session = ""; lock (noticeGate) notified.Clear(); } }
                    }
                    else { gameSounds.Suspend(); acceptSounds.ObserveClient(default, default, false, DateTime.UtcNow); ApplyClientObservation([], false, false, false, false, false, DateTime.UtcNow); }
                    if ((live || ocr || actions || acceptSound) && (!isPlaying || picking && automation.CanReadCommanderSelection(DateTime.UtcNow)) && DateTime.UtcNow - lastOcr > TimeSpan.FromMilliseconds(live || actions || acceptSound ? 500 : 10000))
                    {
                        attemptedOcr = true;
                        lastOcr = DateTime.UtcNow;
                        await ocrBudget.PrimeAsync(ct);
                        var budgetStatus = ocrBudget.PauseReason();
                        if (budgetStatus != null)
                        {
                            lock (alerts) OcrStatus = budgetStatus;
                            ApplyScreenObservation("", false, DateTime.UtcNow);
                            continue;
                        }
                        lock (alerts) OcrStatus = "Checking visible SC2 window…";
                        reader ??= new LobbyOcrWorker(EmbeddedAssets.EnsureOcrScript(), Environment.ProcessPath!);
                        lock (alerts) ocrWorker = reader;
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                        timeout.CancelAfter(TimeSpan.FromSeconds(8));
                        try
                        {
                            using var frame = await reader.ReadAsync(timeout.Token, resourcePauseReason: ocrBudget.PauseReason);
                            var result = frame.Result;
                            lock (alerts) lastOcrRead = frame.Telemetry;
                            var status = result.GetProperty("status").GetString() ?? "Ready";
                            lock (alerts) OcrStatus = status;
                            var text = result.GetProperty("text").GetString() ?? "";
                            lock (store.Gate) ocr = store.Data.Settings.ScreenWatch;
                            bool valid = ocr && status.StartsWith("SC2 screen reader active", StringComparison.Ordinal);
                            var rosterNames = ReadScreenRoster(result);
                            var acceptedNames = ApplyScreenObservation(text, valid, DateTime.UtcNow, rosterNames, ReadScreenTeams(result), ReadScreenRegion(result));
                            await ApplyAutomationScreenAsync(result, ct);
                            if (acceptedNames.Count > 0) Check(string.Join("\n", acceptedNames), "SC2 screen · verify name");
                            else
                            {
                                bool retained;
                                lock (alerts) retained = rosterSource == "screen" && Roster.Count > 0;
                                if (!retained) lock (noticeGate) notified.RemoveWhere(n => n.StartsWith("SC2 screen"));
                            }
                        }
                        catch (OperationCanceledException)
                        {
                            lock (alerts) OcrStatus = ct.IsCancellationRequested ? "Screen reader stopped" : "Screen reader timed out";
                            ApplyScreenObservation("", false, DateTime.UtcNow);
                            ct.ThrowIfCancellationRequested();
                        }
                        catch (LobbyOcrResourceException ex)
                        {
                            lock (alerts) OcrStatus = ex.Message;
                            ApplyScreenObservation("", false, DateTime.UtcNow);
                        }
                        catch (IOException ex)
                        {
                            lock (alerts) OcrStatus = ex.Message.Length <= 220 ? ex.Message : ex.Message[..220] + "…";
                            ApplyScreenObservation("", false, DateTime.UtcNow);
                        }
                    }
                    else if (!live && !ocr && !actions && !acceptSound) { lock (alerts) OcrStatus = "Lobby screen reader off"; ApplyScreenObservation("", false, DateTime.UtcNow); automation.Suppress("Monitoring off"); }
                    else if (isPlaying) { lock (alerts) OcrStatus = "Screen reader paused during match / replay"; }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (Exception ex) { lock (alerts) OcrStatus = "Check failed: " + ex.Message; ApplyScreenObservation("", false, DateTime.UtcNow); }
                finally { observationGate.Release(); }
                // The scheduling interval already includes capture/OCR work. A
                // fixed extra half-second here doubles the delay of a warm read.
                var pollDelay = attemptedOcr && !isPlaying
                    ? TimeSpan.FromMilliseconds(Math.Clamp(500 - (DateTime.UtcNow - lastOcr).TotalMilliseconds, 50, 500))
                    : TimeSpan.FromMilliseconds(500);
                await refreshSignal.WaitAsync(pollDelay, ct);
            }
        }
        finally
        {
            if (reader != null) await reader.DisposeAsync();
            lock (alerts) ocrWorker = null;
        }
    }
    internal void ApplyGameSoundObservation(JsonElement game, JsonElement ui)
    {
        automation.ObserveClient(game, ui, true, DateTime.UtcNow);
        acceptSounds.ObserveClient(game, ui, true, DateTime.UtcNow);
        lock (store.Gate)
        {
            foreach (var sound in gameSounds.Observe(game, ui, store.Data.Settings.PingOnGameLoading, store.Data.Settings.PingOnGameLoaded))
                playGameSound?.Invoke(sound);
        }
    }
    private async Task ApplyAutomationScreenAsync(JsonElement result, CancellationToken ct)
    {
        // Re-read the client after OCR, so a loading/replay transition during
        // recognition cannot authorize an input based on the earlier sample.
        try
        {
            using var game = JsonDocument.Parse(await http.GetStringAsync("http://127.0.0.1:6119/game", ct));
            using var ui = JsonDocument.Parse(await http.GetStringAsync("http://127.0.0.1:6119/ui", ct));
            automation.ObserveClient(game.RootElement, ui.RootElement, true, DateTime.UtcNow);
            acceptSounds.ObserveClient(game.RootElement, ui.RootElement, true, DateTime.UtcNow);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        { automation.ObserveClient(default, default, false, DateTime.UtcNow); acceptSounds.ObserveClient(default, default, false, DateTime.UtcNow); ct.ThrowIfCancellationRequested(); }
        Settings settings;
        List<string> ownNames;
        lock (store.Gate)
        {
            settings = new() { AutoAcceptMatch = store.Data.Settings.AutoAcceptMatch, AutoPickCommander = store.Data.Settings.AutoPickCommander, PingOnMatchAccept = store.Data.Settings.PingOnMatchAccept };
            var ownIds = store.Data.Settings.SelfIds.ToHashSet(StringComparer.Ordinal);
            ownNames = store.Data.OwnLocalNames.Where(n => ownIds.Contains(n.Id)).Select(n => n.Name)
                .Concat(store.Data.Matches.SelectMany(m => m.Players).Where(p => ownIds.Contains(p.Id)).Select(p => p.Name))
                .Where(n => !string.IsNullOrWhiteSpace(n)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
        // Consume the recognized opportunity before automatic input can close it.
        // Visual alerts are always delivered for a newly recognized opportunity.
        // The accept-sound checkbox controls audio only, not the desktop banner.
        if (acceptSounds.ObserveScreen(result, true, DateTime.UtcNow))
        {
            notify("Direct Strike · accept needed", "An SC2 invite or match is ready. Open SC2 to accept.", false);
            if (settings.PingOnMatchAccept) playGameSound?.Invoke(GameSound.Accept);
        }
        automation.ObserveScreen(result, settings, DateTime.UtcNow, ownNames);
    }
    // Keep a separate CPU sample from replay import so their measurements do not
    // race or erase each other's intervals. These checks do not cap the system.
    private sealed class OcrBudget
    {
        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        private struct FileTime { public uint Low, High; public ulong Ticks => ((ulong)High << 32) | Low; }
        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
        private (ulong Idle, ulong Total)? previous;
        public async Task PrimeAsync(CancellationToken ct)
        {
            SampleCpu();
            await Task.Delay(150, ct);
        }
        private double SampleCpu()
        {
            if (!GetSystemTimes(out var idle, out var kernel, out var user)) return 100;
            var current = (Idle: idle.Ticks, Total: kernel.Ticks + user.Ticks);
            var last = previous;
            previous = current;
            return last == null || current.Total <= last.Value.Total ? 0 : 100.0 * (1 - (double)(current.Idle - last.Value.Idle) / (current.Total - last.Value.Total));
        }
        public string? PauseReason() => ResourcePauseReason(ResourceGuard.RamPercent(), SampleCpu());
    }
    internal static string? ResourcePauseReason(uint ram, double cpu) => ram >= 98 ? "Screen reader paused: system RAM reached 98%" : cpu >= 90 ? "Screen reader paused: system CPU reached 90%" : null;
}
