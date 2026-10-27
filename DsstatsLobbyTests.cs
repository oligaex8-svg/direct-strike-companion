using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace DirectStrikeCompanion;

internal static class DsstatsLobbyTests
{
    private sealed record Call(string Path, string Name, int Region, string NativeId,
        TaskCompletionSource<HttpResponseMessage> Completion);

    private sealed class Handler : HttpMessageHandler
    {
        internal readonly Channel<Call> Started = Channel.CreateUnbounded<Call>();
        private int calls, active, maximum;
        internal int Calls => Volatile.Read(ref calls);
        internal int Active => Volatile.Read(ref active);
        internal int Maximum => Volatile.Read(ref maximum);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            var root = body.RootElement;
            var name = root.TryGetProperty("name", out var value) ? value.GetString()! : "";
            var region = root.TryGetProperty("regionId", out value) ? value.GetInt32() : 0;
            var completion = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
            var nativeId = root.TryGetProperty("toonId", out var toon)
                ? $"{toon.GetProperty("region").GetInt32()}-S2-{toon.GetProperty("realm").GetInt32()}-{toon.GetProperty("id").GetInt64()}" : "";
            var call = new Call(request.RequestUri!.AbsolutePath, name, region, nativeId, completion);
            Interlocked.Increment(ref calls);
            var current = Interlocked.Increment(ref active);
            int previous;
            do { previous = Volatile.Read(ref maximum); }
            while (current > previous && Interlocked.CompareExchange(ref maximum, current, previous) != previous);
            Started.Writer.TryWrite(call);
            try { return await completion.Task.WaitAsync(token); }
            finally { Interlocked.Decrement(ref active); }
        }
        internal async Task<Call> NextAsync() => await Started.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2));
    }

    // Deterministic timers make Retry-After and cache expiry checks instantaneous.
    private sealed class Clock : TimeProvider
    {
        private sealed class Timer(Clock owner, TimerCallback callback, object? state) : ITimer
        {
            internal DateTimeOffset? Due;
            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                lock (owner.timers)
                {
                    Due = dueTime == Timeout.InfiniteTimeSpan ? null : owner.now + dueTime;
                    owner.Scheduled.Writer.TryWrite(dueTime);
                    return true;
                }
            }
            internal void Fire() { Due = null; callback(state); }
            public void Dispose() { lock (owner.timers) { Due = null; owner.timers.Remove(this); } }
            public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
        }
        private readonly List<Timer> timers = [];
        private DateTimeOffset now = new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero);
        internal readonly Channel<TimeSpan> Scheduled = Channel.CreateUnbounded<TimeSpan>();
        public override DateTimeOffset GetUtcNow() { lock (timers) return now; }
        public override long GetTimestamp() => GetUtcNow().Ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = new Timer(this, callback, state);
            lock (timers) { timers.Add(timer); timer.Change(dueTime, period); }
            return timer;
        }
        internal void Advance(TimeSpan time)
        {
            lock (timers)
            {
                now += time;
                foreach (var timer in timers.Where(timer => timer.Due <= now).ToArray()) timer.Fire();
            }
        }
        internal async Task WaitForDelayAsync(TimeSpan delay)
        {
            while (await Scheduled.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2)) != delay) { }
        }
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) => new(status)
        { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    private static string Search(string name, int region = 2, long id = 42, bool state = true) => JsonSerializer.Serialize(new[]
    {
        new { name, regionId = region, toonIdString = $"{id}x{region}x1", ratingType = 2, games = 100, wins = 60, rating = 1500,
            cons = state ? (double?).7 : null, conf = state ? (double?).8 : null }
    });
    private static async Task ChangedAsync(Store store, string key, Action action)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Changed() { lock (store.Gate) if (store.Data.DsstatsLookups.ContainsKey(key)) completed.TrySetResult(); }
        store.Changed += Changed;
        try { action(); await completed.Task.WaitAsync(TimeSpan.FromSeconds(2)); }
        finally { store.Changed -= Changed; }
    }

    internal static async Task RunAsync(Action<bool, string> assert)
    {
        var directory = Path.Combine(Path.GetTempPath(), "dsc-dsstats-lobby-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            await RosterAsync(new Store(Path.Combine(directory, "roster")), assert);
            await CacheAsync(new Store(Path.Combine(directory, "cache")), assert);
            await BackoffAsync(new Store(Path.Combine(directory, "backoff")), assert);
            await StateCacheAsync(new Store(Path.Combine(directory, "state-cache")), assert);
            await StateResponseAsync(new Store(Path.Combine(directory, "state-response")), assert);
            await StateQueueAsync(new Store(Path.Combine(directory, "state-queue")), assert);
            await StateRetryAsync(new Store(Path.Combine(directory, "state-retry")), assert);
            await StatePacingAsync(new Store(Path.Combine(directory, "state-pacing")), assert);
            await StateBackoffAsync(new Store(Path.Combine(directory, "state-backoff")), assert);
        }
        finally { Directory.Delete(directory, true); }
    }

    private static async Task RosterAsync(Store store, Action<bool, string> assert)
    {
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, TimeProvider.System, TimeSpan.FromMilliseconds(3100));
        service.Queue(["2-S2-1-1"], ["Enemy3"], "EU");
        var roster = new[] { "Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Enemy3" };
        service.QueueLobby(roster, "EU");
        assert(handler.Calls == 0 && service.LobbyQueuedCount == 6 && service.QueuedCount == 1,
            "dsstats lobby admission is synchronous, bounded and promotes matching background name work");
        using var cancellation = new CancellationTokenSource();
        var run = service.RunAsync(cancellation.Token);
        try
        {
            var first = await handler.NextAsync();
            var second = await handler.NextAsync();
            var third = await handler.NextAsync();
            var started = new[] { first, second, third };
            var overview = started.Single(call => call.Path == "/api11/Players/overview");
            var searches = started.Where(call => call.Name.Length > 0).ToArray();
            assert(searches.Length == 2 && searches.All(call => call.Path == "/api10/Players/ratings" && call.Region == 2)
                && !overview.Completion.Task.IsCompleted && handler.Maximum == 3,
                "dsstats starts two live requests before slow responses finish despite a blocked native overview");
            service.QueueLobby(roster, "EU");
            service.Queue([], roster, "EU");
            assert(handler.Calls == 3 && service.LobbyQueuedCount == 4 && service.QueuedCount == 0,
                "dsstats repeated roster and normal queue calls deduplicate pending and in-flight names");

            // A new player is dispatched before old pending slots once one fast lane is free.
            service.QueueLobby(["Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Joined"], "EU");
            var key = SiteSyncService.NameLookupKey(searches[0].Name, "EU");
            await ChangedAsync(store, key, () => searches[0].Completion.TrySetResult(Json(Search(searches[0].Name))));
            var joined = await handler.NextAsync();
            assert(joined.Name == "Joined" && !searches[1].Completion.Task.IsCompleted && !overview.Completion.Task.IsCompleted,
                "dsstats newly joined name gets the next lane while other old requests remain withheld");
            assert(!File.Exists(Path.Combine(store.DirectoryPath, "library.json")),
                "dsstats publishes an early lobby result without saving the library per lookup");

            var dispatched = searches.Select(call => call.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            dispatched.Add(joined.Name);
            // Response completion is earlier than publication into the store.
            // Await both results before shutdown can cancel their continuations.
            await ChangedAsync(store, SiteSyncService.NameLookupKey(searches[1].Name, "EU"),
                () => searches[1].Completion.TrySetResult(Json(Search(searches[1].Name))));
            await ChangedAsync(store, SiteSyncService.NameLookupKey(joined.Name, "EU"),
                () => joined.Completion.TrySetResult(Json(Search(joined.Name))));
            for (var i = 0; i < 3; i++)
            {
                var next = await handler.NextAsync();
                dispatched.Add(next.Name);
                await ChangedAsync(store, SiteSyncService.NameLookupKey(next.Name, "EU"),
                    () => next.Completion.TrySetResult(Json(Search(next.Name))));
            }
            assert(dispatched.SetEquals(new[] { "Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Joined" })
                && handler.Calls == 7 && handler.Maximum == 3,
                "dsstats current six-player lobby covers allies and enemies with at most two live searches");
            service.QueueLobby([], "EU");
            service.QueueLobby(["Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Joined"], "EU");
            assert(service.LobbyQueuedCount == 0 && handler.Calls == 7,
                "dsstats leaving and rejoining a cached roster issues no duplicate HTTP");
        }
        finally { cancellation.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(2)); }
        assert(handler.Active == 0 && !store.Data.DsstatsLookups.ContainsKey("2-S2-1-1"),
            "dsstats shutdown awaits cancellation of native and lobby workers without false failed results");
        var restored = new Store(store.DirectoryPath);
        assert(restored.Data.DsstatsLookups.Count == 6,
            "dsstats shutdown coalesces completed lobby results into durable cache");
    }

    private static async Task CacheAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        var native = new DsstatsProfile("2-S2-1-12", "Cached", "EU", 1600, 300, 200,
            clock.GetUtcNow().UtcDateTime.AddDays(-1), "https://dsstats.pax77.org/ratings?Rt=2&Player=12x2x1", 10, "Nova",
            Consistency: .7, Confidence: .8, RatingStateVersion: 1);
        store.Data.DsstatsLookups[native.NativeId] = new(native.NativeId, "Ready", clock.GetUtcNow().UtcDateTime, [native]);
        store.Data.Marks["private"] = new("private", "Cached", "keep note", clock.GetUtcNow().UtcDateTime);
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        service.QueueLobby(["<Clan> Cached", "Cached"], "EU");
        var key = SiteSyncService.NameLookupKey("Cached", "EU");
        assert(service.LobbyQueuedCount == 0 && handler.Calls == 0
            && store.Data.DsstatsLookups[key].Profiles.Single() == native
            && store.Data.DsstatsLookups[key].Status == "Candidates"
            && store.Data.DsstatsLookups[native.NativeId].Status == "Ready" && store.Data.Marks["private"].Note == "keep note",
            "dsstats reuses richer exact native cache immediately as name candidates without binding identity or changing notes");
        service.QueueLobby(Enumerable.Range(1, 20).Select(index => "Name" + index), "unknown");
        assert(service.LobbyQueuedCount == 6, "dsstats lobby queue admits at most six normalized names");
        service.QueueLobby(["UnknownRegion"], "unknown");
        using var cancellation = new CancellationTokenSource();
        var run = service.RunAsync(cancellation.Token);
        try
        {
            var request = await handler.NextAsync();
            var unknownKey = SiteSyncService.NameLookupKey("UnknownRegion");
            var rows = "[" + Search("UnknownRegion", 1, 21).Trim('[', ']') + ","
                + Search("UnknownRegion", 2, 22).Trim('[', ']') + ","
                + Search("UnknownRegionSuffix", 2, 23).Trim('[', ']') + "]";
            await ChangedAsync(store, unknownKey, () => request.Completion.TrySetResult(Json(rows)));
            assert(request.Region == 0 && store.Data.DsstatsLookups[unknownKey].Profiles.Count == 2
                && store.Data.DsstatsLookups[unknownKey].Profiles.All(profile => profile.Name == "UnknownRegion"),
                "dsstats unknown lobby region requests region zero and retains only exact supported EU and Americas names");
            service.QueueLobby(["UnknownRegion"]);
            assert(handler.Calls == 1 && service.LobbyQueuedCount == 0,
                "dsstats fresh exact lobby cache suppresses a repeated lookup");
            clock.Advance(TimeSpan.FromMinutes(30));
            service.QueueLobby(["UnknownRegion"]);
            var failed = await handler.NextAsync();
            var updated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            void Changed() { lock (store.Gate) if (store.Data.DsstatsLookups[unknownKey].Status == "Unavailable") updated.TrySetResult(); }
            store.Changed += Changed;
            try
            {
                failed.Completion.TrySetResult(Json("{}", HttpStatusCode.ServiceUnavailable));
                await updated.Task.WaitAsync(TimeSpan.FromSeconds(2));
            }
            finally { store.Changed -= Changed; }
            assert(store.Data.DsstatsLookups[unknownKey] is { Status: "Unavailable", Profiles.Count: 2 },
                "dsstats failed lobby refresh retains prior ratings and reports Unavailable instead of Unrated");
            service.QueueLobby(["UnknownRegion"]);
            assert(service.LobbyQueuedCount == 0 && handler.Calls == 2,
                "dsstats lobby failures use the five-minute negative retry cache");
            clock.Advance(TimeSpan.FromMinutes(5));
            service.QueueLobby(["UnknownRegion"]);
            var shutdown = await handler.NextAsync();
            assert(shutdown.Name == "UnknownRegion", "dsstats lobby retry becomes eligible after five minutes");
        }
        finally { cancellation.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(2)); }
        assert(handler.Active == 0 && store.Data.DsstatsLookups[SiteSyncService.NameLookupKey("UnknownRegion")].Status == "Unavailable",
            "dsstats lobby shutdown cancels outstanding HTTP and preserves preceding cache status");
    }

    private static DsstatsProfile StateProfile(string name, long id, bool complete = false, int games = 100,
        DateTime? lastPlayed = null) => new($"2-S2-1-{id}", name, "EU", 1500, games, 60, lastPlayed, "",
            Consistency: complete ? .7 : null, Confidence: complete ? .8 : null, RatingStateVersion: 1);

    private static string StateOverview(string name, long id, bool complete = true) =>
        "{\"toonId\":{\"region\":2,\"realm\":1,\"id\":" + id + "},\"regionId\":2,\"ratingType\":2,\"name\":"
        + JsonSerializer.Serialize(name) + ",\"ratings\":" + Search(name, id: id, state: complete) + "}";

    private static void CacheName(Store store, Clock clock, string name, params DsstatsProfile[] profiles)
    {
        var key = SiteSyncService.NameLookupKey(name, "EU");
        store.Data.DsstatsLookups[key] = new(key, "Candidates", clock.GetUtcNow().UtcDateTime, profiles.ToList());
    }

    private static async Task StateCacheAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        var complete = StateProfile("RenamedNative", 11, true);
        store.Data.DsstatsLookups[complete.NativeId] = new(complete.NativeId, "Ready", clock.GetUtcNow().UtcDateTime, [complete]);
        CacheName(store, clock, "Cached", complete with { Name = "Cached", Consistency = null, Confidence = 1.1 });
        service.QueueLobby(["Cached"], "EU");
        var key = SiteSyncService.NameLookupKey("Cached", "EU");
        assert(service.QueuedCount == 0 && service.LobbyQueuedCount == 0 && handler.Calls == 0
            && store.Data.DsstatsLookups[key].Profiles.Single() is { Consistency: .7, Confidence: .8 },
            "dsstats fresh version-one name cache with missing or invalid state reuses exact complete native evidence without HTTP");

        var stale = store.Data.DsstatsLookups[key];
        store.Data.DsstatsLookups[key] = stale with
        {
            Checked = stale.Checked.AddHours(-1), Profiles = [
                complete with { Name = "Cached", Consistency = null },
                complete with { NativeId = "2-S2-1-12", Name = "Cached", Games = 50, Consistency = null },
                complete with { Region = "Americas", Name = "Cached", Games = 40, Consistency = null }]
        };
        service.QueueLobby(["Cached"], "EU");
        var enriched = store.Data.DsstatsLookups[key].Profiles;
        assert(enriched[0].Consistency == .7 && enriched[1].Consistency == null && enriched[2].Consistency == null
            && service.LobbyQueuedCount == 1 && handler.Calls == 0,
            "dsstats enriches stale partial names only by exact native ID plus region while retaining normal stale-name refresh");
        service.QueueLobby([], "EU");
        assert(!await service.ProcessNextAsync(), "dsstats complete cached native state never needs fallback work");
    }

    private static async Task StateResponseAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        service.QueueLobby(["Joining"], "EU");
        using var cancellation = new CancellationTokenSource();
        var run = service.RunAsync(cancellation.Token);
        try
        {
            var search = await handler.NextAsync();
            assert(search.Name == "Joining" && search.Path == "/api10/Players/ratings",
                "dsstats starts automatic prefetch on a one-player partial roster before the full lobby");
            var key = SiteSyncService.NameLookupKey("Joining", "EU");
            await ChangedAsync(store, key, () => search.Completion.TrySetResult(Json(Search("Joining", id: 21, state: false))));
            var state = await handler.NextAsync();
            assert(state.NativeId == "2-S2-1-21" && state.Path == "/api11/Players/overview"
                && store.Data.DsstatsLookups[key].Profiles.Single().Rating == 1500,
                "dsstats missing-state name response immediately schedules exact native hydration while its numeric rating remains visible");
            service.QueueLobby(["Joining"], "EU");
            service.Queue([state.NativeId]);
            assert(handler.Calls == 2 && service.QueuedCount == 0,
                "dsstats state request deduplicates active native work across roster and background lanes");
            await ChangedAsync(store, state.NativeId, () => state.Completion.TrySetResult(Json(StateOverview("Joining", 21))));
            assert(store.Data.DsstatsLookups[key].Profiles.Single() is { Consistency: .7, Confidence: .8 }
                && store.Data.DsstatsLookups[state.NativeId].StateChecked == clock.GetUtcNow().UtcDateTime,
                "dsstats verified native state flows back to its matching name result without choosing a profile");
            service.QueueLobby(["Joining", "Complete"], "EU");
            var complete = await handler.NextAsync();
            var completeKey = SiteSyncService.NameLookupKey("Complete", "EU");
            await ChangedAsync(store, completeKey, () => complete.Completion.TrySetResult(Json(Search("Complete", id: 22))));
            service.QueueLobby(["Joining", "Complete"], "EU");
            assert(handler.Calls == 3 && service.QueuedCount == 0 && service.LobbyQueuedCount == 0
                && !store.Data.DsstatsLookups.ContainsKey("2-S2-1-22"),
                "dsstats public state in the name response is immediately ready and performs no overview or native identity binding");
            service.QueueLobby(["OwnJoining"], "EU", ["2-S2-1-24"]);
            var ownSearch = await handler.NextAsync();
            var ownRows = "[" + Search("OwnJoining", id: 23).Trim('[', ']') + ","
                + Search("OwnJoining", id: 24, state: false).Trim('[', ']') + "]";
            await ChangedAsync(store, SiteSyncService.NameLookupKey("OwnJoining", "EU"),
                () => ownSearch.Completion.TrySetResult(Json(ownRows)));
            var ownState = await handler.NextAsync();
            assert(ownState.NativeId == "2-S2-1-24",
                "dsstats retained own-account nomination becomes eligible immediately when a new search returns its exact regional alternative");
            await ChangedAsync(store, ownState.NativeId,
                () => ownState.Completion.TrySetResult(Json(StateOverview("OwnJoining", 24))));
        }
        finally { cancellation.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(2)); }
    }

    private static async Task StateQueueAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        var recent = StateProfile("First", 31, lastPlayed: clock.GetUtcNow().UtcDateTime);
        var old = StateProfile("First", 32, games: 999);
        CacheName(store, clock, "First", old, recent);
        CacheName(store, clock, "Alias", recent with { Name = "Alias" });
        CacheName(store, clock, "Departed", StateProfile("Departed", 33));
        service.Queue(["2-S2-1-99", recent.NativeId]);
        service.QueueLobby(["First", "Alias", "Departed"], "EU", [old.NativeId, "2-S2-1-888"]);
        assert(service.QueuedCount == 4 && service.LobbyQueuedCount == 0,
            "dsstats prioritizes recent primary over games and admits evidenced own alternative, deduplicating shared native state and rejecting unrelated nominations");
        var process = service.ProcessNextAsync();
        var first = await handler.NextAsync();
        assert(first.NativeId == recent.NativeId,
            "dsstats state work promotes queued matching native request ahead of old background work");
        service.QueueLobby(["First", "Alias"], "EU", [old.NativeId]);
        service.Queue([recent.NativeId]);
        assert(service.QueuedCount == 2 && handler.Calls == 1,
            "dsstats removes departed pending state work and retains one nominated own alternative plus unrelated background work");
        first.Completion.TrySetResult(Json(StateOverview("First", 31)));
        await process;
        assert(store.Data.DsstatsLookups[SiteSyncService.NameLookupKey("Alias", "EU")].Profiles.Single().Confidence == .8,
            "dsstats one verified native response completes every exact-ID alias candidate");
        var own = service.ProcessNextAsync();
        var ownCall = await handler.NextAsync();
        assert(ownCall.NativeId == old.NativeId, "dsstats hydrates configured own alternative even when another account is the name primary");
        service.QueueLobby([], "EU");
        ownCall.Completion.TrySetResult(Json(StateOverview("First", 32)));
        await own;
        assert(store.Data.DsstatsLookups.ContainsKey(old.NativeId) && service.QueuedCount == 1,
            "dsstats an active departed request may finish into cache while only independent background work remains");
        var background = service.ProcessNextAsync();
        var backgroundCall = await handler.NextAsync();
        backgroundCall.Completion.TrySetResult(Json("null"));
        await background;
        assert(backgroundCall.NativeId == "2-S2-1-99" && !await service.ProcessNextAsync(),
            "dsstats normal background queue remains intact after state priority and roster departure");
        CacheName(store, clock, "LocalOpponent", StateProfile("LocalOpponent", 34, true), StateProfile("LocalOpponent", 35));
        service.QueueLobby(["LocalOpponent"], "EU", ["2-S2-1-35"]);
        var opponentWork = service.ProcessNextAsync();
        var opponent = await handler.NextAsync();
        assert(opponent.NativeId == "2-S2-1-35",
            "dsstats hydrates a nominated exact local opponent alternative even when a complete different account is the name primary");
        opponent.Completion.TrySetResult(Json(StateOverview("LocalOpponent", 35)));
        await opponentWork;
    }

    private static async Task StateRetryAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        var profile = StateProfile("Retry", 41);
        CacheName(store, clock, "Retry", profile);
        store.Data.DsstatsLookups[profile.NativeId] = new(profile.NativeId, "Ready", clock.GetUtcNow().UtcDateTime, [profile]);
        foreach (var status in new[] { HttpStatusCode.OK, HttpStatusCode.ServiceUnavailable, HttpStatusCode.TooManyRequests })
        {
            service.QueueLobby(["Retry"], "EU");
            assert(service.QueuedCount == 1, "dsstats fresh numeric version-one cache cannot suppress an eligible missing-state retry");
            var process = service.ProcessNextAsync();
            var call = await handler.NextAsync();
            call.Completion.TrySetResult(Json(status == HttpStatusCode.OK ? StateOverview("Retry", 41, false) : "{}", status));
            await process;
            var result = store.Data.DsstatsLookups[profile.NativeId];
            assert(result.Profiles.Single().Rating == 1500 && result.StateChecked == clock.GetUtcNow().UtcDateTime
                && result.Status == (status == HttpStatusCode.OK ? "Ready" : "Unavailable"),
                "dsstats absent remote state and native HTTP failures retain rating evidence with an actual-attempt timestamp");
            service.QueueLobby(["Retry"], "EU");
            service.QueueLobby(["Retry"], "EU");
            assert(service.QueuedCount == 0 && !await service.ProcessNextAsync(),
                "dsstats absent fields, unavailable responses and 429 cannot trigger an immediate repeated state request");
            clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromTicks(1));
            service.QueueLobby(["Retry"], "EU");
            assert(service.QueuedCount == 0, "dsstats missing-state retry remains throttled until the full five-minute boundary");
            clock.Advance(TimeSpan.FromTicks(1));
        }
        service.FlushPending();
        assert(new Store(store.DirectoryPath).Data.DsstatsLookups[profile.NativeId].StateChecked
            == store.Data.DsstatsLookups[profile.NativeId].StateChecked,
            "dsstats state-attempt throttle survives cache persistence and restart");
    }

    private static async Task StatePacingAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var interval = TimeSpan.FromMilliseconds(3100);
        var service = new DsstatsService(store, http, clock, interval);
        service.Queue(["2-S2-1-51"]);
        var background = service.ProcessNextAsync();
        var first = await handler.NextAsync();
        first.Completion.TrySetResult(Json("null"));
        await background;
        CacheName(store, clock, "Paced", StateProfile("Paced", 52));
        service.QueueLobby(["Paced"], "EU");
        var process = service.ProcessNextAsync();
        await clock.WaitForDelayAsync(interval);
        clock.Advance(TimeSpan.FromSeconds(3));
        assert(handler.Calls == 1 && !process.IsCompleted,
            "dsstats automatic overview fallback honors the existing shared 3.1-second native interval");
        clock.Advance(TimeSpan.FromMilliseconds(100));
        var state = await handler.NextAsync();
        state.Completion.TrySetResult(Json(StateOverview("Paced", 52)));
        await process;
        CacheName(store, clock, "LeavesWhileWaiting", StateProfile("LeavesWhileWaiting", 53));
        service.QueueLobby(["LeavesWhileWaiting"], "EU");
        var departed = service.ProcessNextAsync();
        await clock.WaitForDelayAsync(interval);
        service.QueueLobby([], "EU");
        clock.Advance(interval);
        await departed;
        assert(handler.Calls == 2 && service.QueuedCount == 0,
            "dsstats state-only work that leaves during the pacing wait is dropped before HTTP dispatch");
    }

    private static async Task StateBackoffAsync(Store directory, Action<bool, string> assert)
    {
        foreach (var scenario in new[] { "state", "departed", "fresh", "background", "name" })
        {
            var store = new Store(Path.Combine(directory.DirectoryPath, scenario));
            var clock = new Clock();
            using var handler = new Handler();
            using var http = new HttpClient(handler);
            var interval = TimeSpan.FromMilliseconds(3100);
            var cooldown = TimeSpan.FromSeconds(60);
            var service = new DsstatsService(store, http, clock, interval);
            if (scenario == "background") service.Queue(["2-S2-1-61", "2-S2-1-62"]);
            else if (scenario == "name") service.Queue(["2-S2-1-61"], ["Second"], "EU");
            else
            {
                CacheName(store, clock, "First", StateProfile("First", 61));
                CacheName(store, clock, "Second", StateProfile("Second", 62));
                service.QueueLobby(["First", "Second"], "EU");
            }
            var firstWork = service.ProcessNextAsync();
            var first = await handler.NextAsync();
            var limited = Json("{}", HttpStatusCode.TooManyRequests);
            limited.Headers.RetryAfter = new RetryConditionHeaderValue(cooldown);
            first.Completion.TrySetResult(limited);
            await firstWork;

            var secondWork = service.ProcessNextAsync();
            await clock.WaitForDelayAsync(interval);
            clock.Advance(interval);
            await clock.WaitForDelayAsync(cooldown - interval);
            assert(first.NativeId == "2-S2-1-61" && handler.Calls == 1 && !secondWork.IsCompleted,
                "dsstats native 429 Retry-After holds the next " + scenario + " request beyond the 3.1-second native interval");
            if (scenario == "departed") service.QueueLobby([], "EU");
            else if (scenario == "fresh")
            {
                var complete = StateProfile("Second", 62, true);
                lock (store.Gate)
                    store.Data.DsstatsLookups[complete.NativeId] = new(complete.NativeId, "Ready", clock.GetUtcNow().UtcDateTime, [complete]);
            }
            clock.Advance(cooldown - interval - TimeSpan.FromMilliseconds(1));
            assert(handler.Calls == 1 && !secondWork.IsCompleted,
                "dsstats shared native cooldown does not expire before the full bounded Retry-After");
            clock.Advance(TimeSpan.FromMilliseconds(1));
            if (scenario is "departed" or "fresh")
            {
                await secondWork.WaitAsync(TimeSpan.FromSeconds(2));
                assert(handler.Calls == 1 && service.QueuedCount == 0,
                    "dsstats rechecks " + scenario + " state work after shared cooldown and skips unnecessary HTTP");
            }
            else
            {
                var second = await handler.NextAsync();
                assert(scenario == "name" ? second.Name == "Second" : second.NativeId == "2-S2-1-62",
                    "dsstats shared native Retry-After releases the next " + scenario + " request only at sixty seconds");
                second.Completion.TrySetResult(Json(scenario == "name" ? Search("Second", id: 62) : StateOverview("Second", 62)));
                await secondWork;
            }
        }
    }

    private static async Task BackoffAsync(Store store, Action<bool, string> assert)
    {
        var clock = new Clock();
        using var handler = new Handler();
        using var http = new HttpClient(handler);
        var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
        service.QueueLobby(["RateLimited", "InFlight", "Waiting"], "EU");
        using var cancellation = new CancellationTokenSource();
        var run = service.RunAsync(cancellation.Token);
        try
        {
            var limited = await handler.NextAsync();
            var inFlight = await handler.NextAsync();
            var response = Json("{}", HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.Zero);
            await ChangedAsync(store, SiteSyncService.NameLookupKey(limited.Name, "EU"),
                () => limited.Completion.TrySetResult(response));
            await clock.WaitForDelayAsync(TimeSpan.FromSeconds(5));
            clock.Advance(TimeSpan.FromSeconds(4));
            service.QueueLobby(["RateLimited", "InFlight", "Waiting"], "EU");
            assert(handler.Calls == 2 && service.LobbyQueuedCount == 1
                && store.Data.DsstatsLookups[SiteSyncService.NameLookupKey(limited.Name, "EU")].Status == "Unavailable",
                "dsstats 429 applies a shared minimum backoff and does not immediately retry the failed name");
            clock.Advance(TimeSpan.FromSeconds(1));
            var waiting = await handler.NextAsync();
            assert(waiting.Name == "Waiting" && !inFlight.Completion.Task.IsCompleted && handler.Maximum == 2,
                "dsstats live queue resumes after Retry-After without exceeding its two-request bound");
            var longRetry = Json("{}", HttpStatusCode.TooManyRequests);
            longRetry.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromHours(1));
            await ChangedAsync(store, SiteSyncService.NameLookupKey(waiting.Name, "EU"),
                () => waiting.Completion.TrySetResult(longRetry));
            await clock.WaitForDelayAsync(TimeSpan.FromSeconds(60));
            service.QueueLobby(["InFlight", "AfterRateLimit"], "EU");
            assert(handler.Calls == 3 && service.LobbyQueuedCount == 1,
                "dsstats caps excessive Retry-After at sixty seconds and keeps newly queued names behind the shared cooldown");
        }
        finally { cancellation.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(2)); }
        assert(handler.Active == 0 && store.Data.DsstatsLookups.Count == 2,
            "dsstats shutdown cancels backoff and in-flight searches without persisting false missing or unrated values");
    }
}
