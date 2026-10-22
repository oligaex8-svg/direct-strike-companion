using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace DirectStrikeCompanion;

public sealed record DsstatsLookup(string Key, string Status, DateTime Checked, List<DsstatsProfile> Profiles,
    DateTime? StateChecked = null);
public sealed record DsstatsProfile(string NativeId, string Name, string Region, double? Rating, int Games, int Wins,
    DateTime? LastPlayed, string Url, int? Rank = null, string MainCommander = "",
    double? Consistency = null, double? Confidence = null, int RatingStateVersion = 0);

// Independent, read-only public API client. Nothing here changes replay identity or DSR data.
public sealed class DsstatsService
{
    internal const int QueueLimit = 96, CacheLimit = 500, ResponseLimit = 2 * 1024 * 1024;
    private const string SourceUrl = "https://dsstats.pax77.org/";
    private sealed record Toon(int Region, int Realm, long Id)
    {
        public string NativeId => $"{Region}-S2-{Realm}-{Id}";
    }
    private sealed record Work(string Key, Toon? Toon, string? Name, int Region, bool RequiresState = false);
    private readonly Store store;
    private readonly HttpClient http;
    private readonly TimeProvider clock;
    private readonly TimeSpan interval;
    private readonly object queueGate = new();
    private readonly Queue<Work> queue = new();
    private readonly HashSet<string> queued = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim worker = new(1, 1), signal = new(0, 1);
    private readonly List<Work> lobbyQueue = [];
    private readonly List<Work> stateQueue = [];
    private List<Work> currentLobby = [];
    private HashSet<string> lobbyStateIds = new(StringComparer.Ordinal);
    private HashSet<string> currentStateKeys = new(StringComparer.Ordinal);
    private readonly HashSet<string> lobbyActive = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim lobbySignal = new(0, 2);
    private DateTime backoffUntil;
    private string? active;
    private bool running, dirty;
    private long? lastRequest;

    public DsstatsService(Store store, HttpClient? http = null, TimeProvider? clock = null)
        : this(store, http ?? new HttpClient(), clock ?? TimeProvider.System, TimeSpan.FromMilliseconds(3100)) { }

    internal DsstatsService(Store store, HttpClient http, TimeProvider clock, TimeSpan interval)
    {
        this.store = store; this.http = http; this.clock = clock; this.interval = interval;
        lock (store.Gate) TrimCache();
    }

    internal int QueuedCount { get { lock (queueGate) return queue.Count + stateQueue.Count; } }
    internal int LobbyQueuedCount { get { lock (queueGate) return lobbyQueue.Count; } }
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;
    public static TimeSpan LookupLifetime(string status) => status is "Ready" or "Candidates"
        ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5);

    // Queue is synchronous, bounded and never sends HTTP or serializes the library.
    public void Queue(IEnumerable<string> ids, IEnumerable<string>? names = null, string? region = null)
    {
        var normalizedRegion = RatingService.NormalizeRegion(region);
        if (region != null && normalizedRegion == null) throw new ArgumentException("Choose EU or Americas.");
        foreach (var id in ids.Take(QueueLimit * 2))
            if (ParseNative(id) is { } toon) Enqueue(new(toon.NativeId, toon, null, toon.Region));
        foreach (var raw in (names ?? []).Take(QueueLimit * 2))
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Length > 256) continue;
            var name = SiteSyncService.NormalizeName(raw);
            if (name.Length is 0 or > 64 || name.Any(char.IsControl)) continue;
            Enqueue(new(SiteSyncService.NameLookupKey(name, normalizedRegion), null, name,
                normalizedRegion == "EU" ? 2 : normalizedRegion == "Americas" ? 1 : 0));
        }
    }

    // The ratings search endpoint has no overview fixed-window limiter. Keep its
    // live roster independent of the paced native/background queue, with two I/O workers.
    public void QueueLobby(IEnumerable<string> names, string? region = null, IEnumerable<string>? stateNativeIds = null)
    {
        var normalizedRegion = RatingService.NormalizeRegion(region);
        var requests = new List<Work>();
        foreach (var raw in names.Take(QueueLimit * 2))
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Length > 256) continue;
            var name = SiteSyncService.NormalizeName(raw);
            if (name.Length is 0 or > 64 || name.Any(char.IsControl)) continue;
            var key = SiteSyncService.NameLookupKey(name, normalizedRegion);
            if (requests.Any(work => work.Key == key)) continue;
            requests.Add(new(key, null, name, normalizedRegion == "EU" ? 2 : normalizedRegion == "Americas" ? 1 : 0));
            if (requests.Count == 6) break;
        }
        var changed = false;
        lock (store.Gate)
        {
            lock (queueGate)
            {
                currentLobby = requests.ToList();
                lobbyStateIds = (stateNativeIds ?? []).Take(QueueLimit).Where(id => ParseNative(id) != null)
                    .ToHashSet(StringComparer.Ordinal);
            }
            foreach (var work in requests)
            {
                if (IsFresh(work.Key)) continue;
                // Copy exact native evidence into a name result only. Never write
                // name matches back to native identity slots or change private data.
                var matches = store.Data.DsstatsLookups.Values
                    .Where(value => (value.Status is "Ready" or "Unrated") && IsFresh(value.Key))
                    .SelectMany(value => value.Profiles.Where(profile => value.Key == profile.NativeId
                        && string.Equals(SiteSyncService.NormalizeName(profile.Name), work.Name, StringComparison.OrdinalIgnoreCase)
                        && (work.Region == 0 || profile.Region == Region(work.Region)))
                        .Select(profile => (Profile: profile, value.Checked)))
                    .OrderByDescending(value => value.Profile.Games).ThenBy(value => value.Profile.NativeId, StringComparer.Ordinal)
                    .Take(8).ToList();
                if (matches.Count == 0) continue;
                store.Data.DsstatsLookups[work.Key] = new(work.Key,
                    matches.Any(value => value.Profile.Rating != null) ? "Candidates" : "Unrated",
                    matches.Min(value => value.Checked), matches.Select(value => value.Profile).ToList());
                dirty = changed = true;
            }
            if (changed) TrimCache();
            requests.RemoveAll(work => IsFresh(work.Key));
        }
        lock (queueGate)
        {
            var previous = lobbyQueue.Select(work => work.Key).ToHashSet(StringComparer.Ordinal);
            lobbyQueue.Clear();
            var keys = requests.Select(work => work.Key).ToHashSet(StringComparer.Ordinal);
            // Promote background name work instead of issuing the same request twice.
            var remaining = queue.Where(work => !keys.Contains(work.Key)).ToArray();
            queue.Clear();
            foreach (var work in remaining) queue.Enqueue(work);
            queued.ExceptWith(keys);
            lobbyQueue.AddRange(requests.Where(work => active != work.Key && !lobbyActive.Contains(work.Key))
                .OrderBy(work => previous.Contains(work.Key)));
            var wake = 2 - lobbySignal.CurrentCount;
            if (wake > 0) try { lobbySignal.Release(wake); } catch (SemaphoreFullException) { }
        }
        RefreshLobbyState();
        if (changed) store.NotifyChanged();
    }

    private static bool HasState(DsstatsProfile profile) => profile.Rating != null && profile.RatingStateVersion >= 1
        && profile.Consistency is >= 0 and <= 1 && profile.Confidence is >= 0 and <= 1;

    // State hydration is independent of numeric-cache freshness. An actual native
    // attempt (including absent optional fields) gets a bounded five-minute retry.
    private bool IsStateFresh(string key) => store.Data.DsstatsLookups.TryGetValue(key, out var lookup)
        && (IsFresh(key) && lookup.Profiles.Any(profile => profile.NativeId == key && HasState(profile))
            || lookup.StateChecked is { } checkedAt && UtcNow - checkedAt < TimeSpan.FromMinutes(5)
            || lookup.Status is not ("Ready" or "Candidates") && UtcNow - lookup.Checked < LookupLifetime(lookup.Status));

    private bool IsWorkFresh(Work work) => work.RequiresState ? IsStateFresh(work.Key) : IsFresh(work.Key);

    // Always take store then queue when both locks are needed. No HTTP, persistence,
    // replay scan or native binding happens during admission/reconciliation.
    private void RefreshLobbyState()
    {
        var changed = false;
        lock (store.Gate)
        lock (queueGate)
        {
            var wanted = new Dictionary<string, Work>(StringComparer.Ordinal);
            foreach (var work in currentLobby)
            {
                if (!store.Data.DsstatsLookups.TryGetValue(work.Key, out var lookup)) continue;
                var profiles = lookup.Profiles.Select(profile =>
                {
                    if (store.Data.DsstatsLookups.TryGetValue(profile.NativeId, out var native)
                        && IsFresh(native.Key))
                    {
                        var complete = native.Profiles.FirstOrDefault(candidate => candidate.NativeId == profile.NativeId
                            && candidate.Region == profile.Region && HasState(candidate));
                        if (complete != null && !HasState(profile))
                            return complete with { Name = profile.Name, LastPlayed = complete.LastPlayed ?? profile.LastPlayed };
                    }
                    return profile;
                }).ToList();
                if (!profiles.SequenceEqual(lookup.Profiles))
                {
                    store.Data.DsstatsLookups[work.Key] = lookup with { Profiles = profiles };
                    dirty = changed = true;
                }
                var primary = profiles.OrderByDescending(profile => profile.LastPlayed ?? DateTime.MinValue)
                    .ThenByDescending(profile => profile.Games).ThenBy(profile => profile.NativeId, StringComparer.Ordinal).FirstOrDefault();
                if (primary != null) Want(primary, work);
                foreach (var profile in profiles.Where(profile => profile != primary && lobbyStateIds.Contains(profile.NativeId))
                    .OrderBy(profile => profile.NativeId, StringComparer.Ordinal))
                    Want(profile, work);
            }
            // A nominated exact account may have current exact-name native evidence
            // before the search result is available. Nomination alone is insufficient.
            foreach (var id in lobbyStateIds.Order(StringComparer.Ordinal))
                if (store.Data.DsstatsLookups.TryGetValue(id, out var native))
                    foreach (var profile in native.Profiles.Where(profile => profile.NativeId == id))
                    {
                        var work = currentLobby.FirstOrDefault(work => string.Equals(work.Name,
                            SiteSyncService.NormalizeName(profile.Name), StringComparison.OrdinalIgnoreCase)
                            && (work.Region == 0 || profile.Region == Region(work.Region)));
                        if (work != null) Want(profile, work);
                    }
            currentStateKeys = wanted.Keys.ToHashSet(StringComparer.Ordinal);
            stateQueue.RemoveAll(work => !currentStateKeys.Contains(work.Key));
            foreach (var work in wanted.Values)
            {
                if (active == work.Key || stateQueue.Any(pending => pending.Key == work.Key)) continue;
                // Promote queued native work; share its existing paced worker.
                var remaining = queue.Where(pending => pending.Key != work.Key).ToArray();
                queue.Clear();
                foreach (var pending in remaining) queue.Enqueue(pending);
                queued.Remove(work.Key);
                if (queue.Count + stateQueue.Count < QueueLimit) stateQueue.Add(work);
            }
            if (stateQueue.Count > 0) try { signal.Release(); } catch (SemaphoreFullException) { }

            void Want(DsstatsProfile profile, Work nameWork)
            {
                if (profile.Rating == null || HasState(profile) || IsStateFresh(profile.NativeId)
                    || ParseNative(profile.NativeId) is not { } toon || profile.Region != Region(toon.Region)
                    || nameWork.Region != 0 && nameWork.Region != toon.Region) return;
                wanted.TryAdd(toon.NativeId, new(toon.NativeId, toon, null, toon.Region, RequiresState: true));
            }
        }
        if (changed) store.NotifyChanged();
    }

    // Called with the store lock, including before dispatch to handle a result
    // completed by another lane since this work was originally queued.
    private bool IsFresh(string key) => store.Data.DsstatsLookups.TryGetValue(key, out var existing)
        && UtcNow - existing.Checked < LookupLifetime(existing.Status)
        && !((existing.Status is "Ready" or "Candidates")
            && existing.Profiles.Any(profile => profile.Rating != null && profile.RatingStateVersion < 1));

    private void Enqueue(Work work)
    {
        lock (store.Gate) if (IsFresh(work.Key)) return;
        lock (queueGate)
        {
            if (queue.Count + stateQueue.Count >= QueueLimit || active == work.Key || lobbyActive.Contains(work.Key)
                || stateQueue.Any(pending => pending.Key == work.Key)
                || lobbyQueue.Any(pending => pending.Key == work.Key) || !queued.Add(work.Key)) return;
            queue.Enqueue(work);
            try { signal.Release(); } catch (SemaphoreFullException) { }
        }
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        lock (queueGate) { if (running) return; running = true; }
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        async Task RunWorkerAsync(Func<CancellationToken, Task> loop)
        {
            try { await loop(lifetime.Token); }
            catch { lifetime.Cancel(); throw; }
        }
        try
        {
            await Task.WhenAll(RunWorkerAsync(RunNormalAsync), RunWorkerAsync(RunLobbyAsync), RunWorkerAsync(RunLobbyAsync));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        finally
        {
            FlushPending();
            lock (queueGate) running = false;
        }
    }

    private async Task RunNormalAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            if (await ProcessNextAsync(token)) continue;
            FlushIfIdle();
            await signal.WaitAsync(token);
        }
    }

    private async Task RunLobbyAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            Work? work = null;
            TimeSpan backoff;
            lock (queueGate)
            {
                backoff = backoffUntil - UtcNow;
                if (lobbyQueue.Count > 0 && backoff <= TimeSpan.Zero)
                {
                    work = lobbyQueue[0]; lobbyQueue.RemoveAt(0); lobbyActive.Add(work.Key);
                }
            }
            if (work == null)
            {
                FlushIfIdle();
                if (backoff > TimeSpan.Zero) await Task.Delay(backoff, clock, token);
                else await lobbySignal.WaitAsync(token);
                continue;
            }
            try
            {
                await WaitForBackoffAsync(token);
                bool fresh;
                lock (store.Gate)
                lock (queueGate)
                    fresh = IsFresh(work.Key) || !currentLobby.Any(current => current.Key == work.Key);
                if (!fresh) await ProcessWorkAsync(work, token);
            }
            finally { lock (queueGate) lobbyActive.Remove(work.Key); }
        }
    }

    private void FlushIfIdle()
    {
        lock (queueGate)
            if (active != null || queue.Count != 0 || stateQueue.Count != 0 || lobbyActive.Count != 0 || lobbyQueue.Count != 0) return;
        FlushPending();
    }

    // One work item equals at most one request; a semaphore also protects explicit test callers.
    internal async Task<bool> ProcessNextAsync(CancellationToken cancellationToken = default)
    {
        await worker.WaitAsync(cancellationToken);
        Work? work = null;
        try
        {
            lock (queueGate)
            {
                if (stateQueue.Count > 0) { work = stateQueue[0]; stateQueue.RemoveAt(0); }
                else if (queue.Count > 0) { work = queue.Dequeue(); queued.Remove(work.Key); }
                else return false;
                if (lobbyActive.Contains(work.Key)) { work = null; return true; }
                active = work.Key;
            }
            lock (store.Gate) if (IsWorkFresh(work)) return true;
            if (lastRequest is { } last)
            {
                var wait = interval - clock.GetElapsedTime(last);
                if (wait > TimeSpan.Zero) await Task.Delay(wait, clock, cancellationToken);
            }
            await WaitForBackoffAsync(cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            // A result or roster can change during either native pacing or a
            // shared Retry-After wait. Recheck immediately before actual dispatch.
            lock (store.Gate)
            lock (queueGate)
                if (IsWorkFresh(work) || work.RequiresState && !currentStateKeys.Contains(work.Key)) return true;
            lastRequest = clock.GetTimestamp();
            await ProcessWorkAsync(work, cancellationToken);
            return true;
        }
        finally
        {
            if (work != null) lock (queueGate) active = null;
            worker.Release();
        }
    }

    private async Task WaitForBackoffAsync(CancellationToken token)
    {
        while (true)
        {
            TimeSpan backoff;
            lock (queueGate) backoff = backoffUntil - UtcNow;
            if (backoff <= TimeSpan.Zero) return;
            await Task.Delay(backoff, clock, token);
        }
    }

    private async Task ProcessWorkAsync(Work work, CancellationToken cancellationToken)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8), clock);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        DsstatsLookup result;
        try
        {
            using var response = await RequestAsync(work, linked.Token);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                var retry = response.Headers.RetryAfter?.Delta
                    ?? (response.Headers.RetryAfter?.Date - clock.GetUtcNow()) ?? TimeSpan.FromSeconds(15);
                retry = TimeSpan.FromSeconds(Math.Clamp(retry.TotalSeconds, 5, 60));
                lock (queueGate)
                {
                    var until = UtcNow + retry;
                    if (until > backoffUntil) backoffUntil = until;
                }
            }
            if (response.StatusCode == HttpStatusCode.NotFound && work.Toon != null)
                result = new(work.Key, "Not found", UtcNow, []);
            else
            {
                response.EnsureSuccessStatusCode();
                using var json = await ReadJsonAsync(response, linked.Token);
                result = work.Toon != null ? ParseOverview(work, json.RootElement) : ParseSearch(work, json.RootElement);
            }
            cancellationToken.ThrowIfCancellationRequested();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex) when (ex is HttpRequestException or IOException or JsonException or InvalidDataException or OperationCanceledException)
        {
            lock (store.Gate)
                result = new(work.Key, "Unavailable", UtcNow, store.Data.DsstatsLookups.GetValueOrDefault(work.Key)?.Profiles.ToList() ?? []);
        }
        lock (store.Gate)
        {
            if (work.Toon != null) result = result with { StateChecked = UtcNow };
            store.Data.DsstatsLookups[work.Key] = result;
            dirty = true;
            TrimCache();
        }
        RefreshLobbyState();
        store.NotifyChanged();
    }

    private Task<HttpResponseMessage> RequestAsync(Work work, CancellationToken token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, SourceUrl + (work.Toon != null ? "api11/Players/overview" : "api10/Players/ratings"));
        request.Content = work.Toon is { } toon
            ? JsonContent.Create(new { toonId = new { region = toon.Region, realm = toon.Realm, id = toon.Id }, ratingType = 2 })
            : JsonContent.Create(new { ratingType = 2, name = work.Name, regionId = work.Region, page = 1, pageSize = 50, take = 50,
                orders = new[] { new { column = "Games", ascending = false } } });
        return SendAsync(request, token);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        using (request) return await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response, CancellationToken token)
    {
        if (response.Content.Headers.ContentLength > ResponseLimit) throw new InvalidDataException("dsstats response exceeds limit.");
        await using var input = await response.Content.ReadAsStreamAsync(token);
        using var output = new MemoryStream();
        var buffer = new byte[16 * 1024];
        int count;
        while ((count = await input.ReadAsync(buffer, token)) != 0)
        {
            if (output.Length + count > ResponseLimit) throw new InvalidDataException("dsstats response exceeds limit.");
            output.Write(buffer, 0, count);
        }
        return JsonDocument.Parse(output.ToArray(), new JsonDocumentOptions { MaxDepth = 48 });
    }

    private DsstatsLookup ParseOverview(Work work, JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Null) return new(work.Key, "Not found", UtcNow, []);
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("toonId", out var identity)
            || ParseToon(identity) != work.Toon || Number(root, "regionId") != work.Region || Number(root, "ratingType") != 2
            || Text(root, "name") is not { Length: > 0 and <= 128 } name
            || !root.TryGetProperty("ratings", out var ratings) || ratings.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("dsstats overview identity or rating type mismatch.");
        var rows = ratings.EnumerateArray().Where(row => Number(row, "ratingType") == 2).Take(2).ToArray();
        if (rows.Length > 1) throw new InvalidDataException("Duplicate Commanders ratings.");
        DsstatsProfile profile;
        if (rows.Length == 0)
            profile = new(work.Toon!.NativeId, name, Region(work.Region), null, 0, 0, LastPlayed(root), ProfileUrl(work.Toon));
        else
        {
            // Overview rows currently omit ToonIdString. The enclosing verified
            // ToonId supplies it; any nonempty row identity must still agree.
            profile = ParseRating(rows[0], work.Region, work.Toon);
            if (profile.NativeId != work.Toon!.NativeId) throw new InvalidDataException("dsstats rating identity mismatch.");
            profile = profile with { Name = name, LastPlayed = LastPlayed(root) };
        }
        return new(work.Key, profile.Rating == null ? "Unrated" : "Ready", UtcNow, [profile]);
    }

    private DsstatsLookup ParseSearch(Work work, JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array) throw new InvalidDataException("Expected dsstats search array.");
        var profiles = new List<DsstatsProfile>();
        var count = 0;
        foreach (var row in root.EnumerateArray().Take(50))
        {
            count++;
            // Search is substring-based upstream. Only complete, normalized names qualify locally.
            if (Text(row, "name") is not { Length: > 0 and <= 128 } name
                || !string.Equals(SiteSyncService.NormalizeName(name), work.Name, StringComparison.OrdinalIgnoreCase)) continue;
            var region = Number(row, "regionId");
            if (region is not (1 or 2) || work.Region != 0 && work.Region != region || Number(row, "ratingType") != 2) continue;
            profiles.Add(ParseRating(row, region.Value));
        }
        profiles = profiles.OrderByDescending(profile => profile.Games).ThenBy(profile => profile.NativeId, StringComparer.Ordinal)
            .DistinctBy(profile => profile.NativeId).Take(8).ToList();
        var status = profiles.Count > 0 ? "Candidates" : count >= 50 ? "No exact match among first50" : "Not found";
        return new(work.Key, status, UtcNow, profiles);
    }

    private static DsstatsProfile ParseRating(JsonElement row, int region, Toon? verifiedToon = null)
    {
        var rowId = Text(row, "toonIdString");
        var toon = string.IsNullOrEmpty(rowId) ? verifiedToon : ParseSiteId(rowId);
        var games = Number(row, "games"); var wins = Number(row, "wins");
        if (toon == null || toon.Region != region || Number(row, "regionId") != region || Number(row, "ratingType") != 2
            || Text(row, "name") is not { Length: > 0 and <= 128 } name || games is null or < 0 || wins is null or < 0 || wins > games
            || !row.TryGetProperty("rating", out var rating) || rating.ValueKind != JsonValueKind.Number
            || !rating.TryGetDouble(out var value) || !double.IsFinite(value))
            throw new InvalidDataException("Invalid dsstats Commanders rating.");
        var rank = Number(row, "pos");
        return new(toon.NativeId, name, Region(region), value, games.Value, wins.Value, null, ProfileUrl(toon),
            rank > 0 ? rank : null, Commander(Number(row, "main")), UnitInterval(row, "cons"), UnitInterval(row, "conf"), 1);
    }

    // Public optional state may be absent on older responses/caches. Invalid state
    // cannot make a valid rating unavailable or become invented precise evidence.
    private static double? UnitInterval(JsonElement row, string key) => row.TryGetProperty(key, out var field)
        && field.ValueKind == JsonValueKind.Number && field.TryGetDouble(out var value)
        && double.IsFinite(value) && value is >= 0 and <= 1 ? value : null;

    private static DateTime? LastPlayed(JsonElement root)
    {
        if (!root.TryGetProperty("replays", out var replays) || replays.ValueKind != JsonValueKind.Array) return null;
        return replays.EnumerateArray().Take(12)
            .Where(row => Number(row, "gameMode") == 3 && TeamSize(row, "commandersTeam1") == 3 && TeamSize(row, "commandersTeam2") == 3)
            .Select(row => Text(row, "gametime")).Select(text => DateTime.TryParse(text, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var date) ? (DateTime?)date : null)
            .Max();
    }

    private static int TeamSize(JsonElement row, string property) => row.ValueKind == JsonValueKind.Object
        && row.TryGetProperty(property, out var team) && team.ValueKind == JsonValueKind.Array ? team.GetArrayLength() : 0;
    private static string Region(int region) => region == 2 ? "EU" : "Americas";
    // RatingsPage.razor reads Rt and Player query parameters, then opens the profile.
    private static string ProfileUrl(Toon toon) => $"{SourceUrl}ratings?Rt=2&Player={toon.Id}x{toon.Region}x{toon.Realm}";
    private static string? Text(JsonElement row, string key) => row.ValueKind == JsonValueKind.Object && row.TryGetProperty(key, out var field)
        && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
    private static int? Number(JsonElement row, string key) => row.ValueKind == JsonValueKind.Object && row.TryGetProperty(key, out var field)
        && field.ValueKind == JsonValueKind.Number && field.TryGetInt32(out var value) ? value : null;
    private static Toon? ParseToon(JsonElement row)
    {
        var region = Number(row, "region"); var realm = Number(row, "realm");
        return region is (1 or 2) && realm > 0 && row.TryGetProperty("id", out var field)
            && field.ValueKind == JsonValueKind.Number && field.TryGetInt64(out var id) && id > 0
            ? new(region.Value, realm.Value, id) : null;
    }
    private static Toon? ParseNative(string? value)
    {
        var parts = value?.Split('-');
        if (parts is not { Length: 4 } || parts[1] != "S2" || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var region)
            || region is not (1 or 2) || !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var realm) || realm <= 0
            || !long.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out var id) || id <= 0) return null;
        var toon = new Toon(region, realm, id);
        return toon.NativeId == value ? toon : null;
    }
    private static Toon? ParseSiteId(string? value)
    {
        var parts = value?.Split('x');
        return parts is { Length: 3 } ? ParseNative($"{parts[1]}-S2-{parts[2]}-{parts[0]}") : null;
    }
    private static string Commander(int? commander) => commander switch
    {
        10 => "Abathur", 20 => "Alarak", 30 => "Artanis", 40 => "Dehaka", 50 => "Fenix", 60 => "Horner", 70 => "Karax",
        80 => "Kerrigan", 90 => "Mengsk", 100 => "Nova", 110 => "Raynor", 120 => "Stetmann", 130 => "Stukov", 140 => "Swann",
        150 => "Tychus", 160 => "Vorazun", 170 => "Zagara", 180 => "Zeratul", _ => ""
    };

    private void TrimCache()
    {
        foreach (var key in store.Data.DsstatsLookups.OrderByDescending(pair => pair.Value.Checked).ThenBy(pair => pair.Key, StringComparer.Ordinal)
            .Skip(CacheLimit).Select(pair => pair.Key).ToArray())
        { store.Data.DsstatsLookups.Remove(key); dirty = true; }
    }

    // Completed batches persist once at idle/shutdown. Loading states are never persisted.
    internal void FlushPending()
    {
        lock (store.Gate)
        {
            if (!dirty) return;
            try { store.Save(); dirty = false; }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        }
    }
}
