using System.Net;
using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class DsstatsTests
{
    internal static void Run(Action<bool, string> assert)
    {
        RunAsync(assert).GetAwaiter().GetResult();
        DsstatsLobbyTests.RunAsync(assert).GetAwaiter().GetResult();
    }

    private sealed class Clock : TimeProvider
    {
        internal DateTimeOffset Now = new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
        public override long GetTimestamp() => Now.Ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        internal void Advance(TimeSpan time) => Now += time;
    }
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        internal int Calls;
        internal List<string> Bodies = [];
        internal List<string> Paths = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Paths.Add(request.RequestUri!.AbsolutePath);
            Bodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            return await respond(request, cancellationToken);
        }
    }
    private static HttpResponseMessage Json(string value, HttpStatusCode status = HttpStatusCode.OK) => new(status)
        { Content = new StringContent(value, Encoding.UTF8, "application/json") };
    private static object Row(long id = 7408040, int region = 2, int realm = 1, string name = "TKnight", int type = 2,
        int games = 1990, int wins = 1546, double rating = 2556.641, double? cons = .9062, double? conf = .8279) => new
        { toonIdString = $"{id}x{region}x{realm}", regionId = region, name, ratingType = type, games, wins, rating, pos = 238, main = 90, cons, conf };
    private static string Overview(long id = 7408040, int region = 2, int realm = 1, int type = 2, object[]? rows = null) => JsonSerializer.Serialize(new
    {
        toonId = new { region, realm, id }, regionId = region, ratingType = type, name = "TKnight",
        ratings = rows ?? [Row(type: 0, rating: 9999), Row()],
        replays = new object[]
        {
            new { gametime = "2026-10-14T16:00:00Z", gameMode = 3, commandersTeam1 = new[] { 10, 20, 30 }, commandersTeam2 = new[] { 40, 50, 60 } },
            new { gametime = "2026-10-15T10:00:00Z", gameMode = 7, commandersTeam1 = new[] { 1, 2, 3 }, commandersTeam2 = new[] { 1, 2, 3 } },
            new { gametime = "2026-10-15T11:00:00Z", gameMode = 3, commandersTeam1 = new[] { 10, 20 }, commandersTeam2 = new[] { 40, 50 } }
        }
    });

    private static async Task RunAsync(Action<bool, string> assert)
    {
        var directory = Path.Combine(Path.GetTempPath(), "dsc-dsstats-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            Store NewStore(string name) => new(Path.Combine(directory, name));
            var clock = new Clock();
            assert(DsstatsService.LookupLifetime("Ready") == TimeSpan.FromMinutes(30)
                && DsstatsService.LookupLifetime("Candidates") == TimeSpan.FromMinutes(30)
                && new[] { "Unavailable", "Unrated", "Not found", "No exact match among first50", "Loading", "Pending" }
                    .All(status => DsstatsService.LookupLifetime(status) == TimeSpan.FromMinutes(5)),
                "dsstats successful evidence caches thirty minutes while unavailable and negative results retry after five");
            var answer = Overview();
            var handler = new Handler((_, _) => Task.FromResult(Json(answer)));
            using var http = new HttpClient(handler);
            var store = NewStore("native");
            var service = new DsstatsService(store, http, clock, TimeSpan.Zero);
            service.Queue(["2-S2-1-7408040", "2-S2-1-7408040", "3-S2-1-7408040", "name:TKnight", "2-S2-1-00042"]);
            assert(handler.Calls == 0 && service.QueuedCount == 1, "dsstats queue sends no HTTP and deduplicates only valid supported complete native identities");
            assert(await service.ProcessNextAsync(), "dsstats processes one bounded queued item");
            var lookup = store.Data.DsstatsLookups["2-S2-1-7408040"];
            var profile = lookup.Profiles.Single();
            assert(lookup.Status == "Ready" && profile.NativeId == "2-S2-1-7408040" && profile.Region == "EU"
                && profile.Rating == 2556.641 && profile.Games == 1990 && profile.Wins == 1546 && profile.Rank == 238 && profile.MainCommander == "Mengsk",
                "dsstats native lookup keeps only explicit Commanders rating and complete native identity");
            assert(profile.LastPlayed == new DateTime(2026, 10, 14, 16, 0, 0, DateTimeKind.Utc),
                "dsstats last played excludes Standard and incomplete team-size evidence");
            assert(profile.Consistency == .9062 && profile.Confidence == .8279 && profile.RatingStateVersion == 1,
                "dsstats overview preserves public Commanders consistency and confidence without another request");
            assert(profile.Url == "https://dsstats.pax77.org/ratings?Rt=2&Player=7408040x2x1",
                "dsstats profile link uses the verified Commanders ratings-page query route");
            using (var body = JsonDocument.Parse(handler.Bodies.Single()))
                assert(handler.Paths.Single() == "/api11/Players/overview" && body.RootElement.GetProperty("ratingType").GetInt32() == 2
                    && body.RootElement.GetProperty("toonId").GetProperty("id").GetInt64() == 7408040,
                    "dsstats requests native overview directly with ratingType Commanders");
            assert(!File.Exists(Path.Combine(store.DirectoryPath, "library.json")), "dsstats completed request does not flush the replay library per request");
            service.FlushPending();
            var reloaded = new Store(store.DirectoryPath);
            assert(reloaded.Data.DsstatsLookups[lookup.Key].Profiles.Single() == profile,
                "dsstats completed batch survives library persistence");
            service.Queue([lookup.Key]);
            assert(!await service.ProcessNextAsync() && handler.Calls == 1, "dsstats successful cache suppresses another HTTP request");
            clock.Advance(TimeSpan.FromMinutes(30));
            answer = "not json";
            service.Queue([lookup.Key]);
            await service.ProcessNextAsync();
            var failed = store.Data.DsstatsLookups[lookup.Key];
            assert(failed.Status == "Unavailable" && failed.Profiles.Single() == profile,
                "dsstats failed refresh preserves successful profiles without relabeling the failure Unrated");
            service.Queue([lookup.Key]);
            assert(service.QueuedCount == 0, "dsstats errors have a five-minute retry cache");
            clock.Advance(TimeSpan.FromMinutes(5));
            service.Queue([lookup.Key]);
            assert(service.QueuedCount == 1, "dsstats error cache expires at five minutes");
            answer = Overview(rows: [Row(type: 0, rating: 9999)]);
            await service.ProcessNextAsync();
            assert(store.Data.DsstatsLookups[lookup.Key] is { Status: "Unrated", Profiles.Count: 1 }
                && store.Data.DsstatsLookups[lookup.Key].Profiles[0].Rating == null,
                "dsstats All rating cannot leak when an existing profile has no Commanders rating");
            clock.Advance(TimeSpan.FromMinutes(30));
            answer = Overview().Replace("7408040x2x1", "");
            service.Queue([lookup.Key]); await service.ProcessNextAsync();
            assert(store.Data.DsstatsLookups[lookup.Key] is { Status: "Ready", Profiles.Count: 1 }
                && store.Data.DsstatsLookups[lookup.Key].Profiles[0].NativeId == lookup.Key,
                "dsstats verified enclosing native identity safely supplies the empty overview-row identity used by the live API");

            foreach (var invalid in new[]
            {
                Overview(id: 123), Overview(region: 1), Overview(realm: 2), Overview(type: 0),
                Overview(rows: [Row(id: 123)]), Overview(rows: [Row(region: 1)]), Overview(rows: [Row(realm: 2)]),
                Overview(rows: [Row(), Row()]), "{}", "[]", "{\"toonId\":{\"id\":\"7408040\",\"region\":2,\"realm\":1}}"
            })
            {
                var mismatchStore = NewStore("mismatch-" + Guid.NewGuid().ToString("N"));
                using var mismatchHttp = new HttpClient(new Handler((_, _) => Task.FromResult(Json(invalid))));
                var mismatch = new DsstatsService(mismatchStore, mismatchHttp, clock, TimeSpan.Zero);
                mismatch.Queue([lookup.Key]); await mismatch.ProcessNextAsync();
                assert(mismatchStore.Data.DsstatsLookups[lookup.Key] is { Status: "Unavailable", Profiles.Count: 0 },
                    "dsstats rejects mismatched native identity region rating type and malformed overview evidence");
            }

            var searchStore = NewStore("search");
            var searchAnswer = JsonSerializer.Serialize(new[]
            {
                Row(id: 1, name: "<Expend> TKnight", games: 10, wins: 5),
                Row(id: 2, name: "TKnight", games: 100, wins: 70), Row(id: 3, region: 1, games: 80, wins: 40),
                Row(id: 4, name: "TKnightElse", games: 9999, wins: 8000), Row(id: 5, name: "<TKnight> Else"),
                Row(id: 6, name: "TKnight (OldName)"), Row(id: 7, region: 3), Row(id: 8, type: 0)
            });
            var searchHandler = new Handler((_, _) => Task.FromResult(Json(searchAnswer)));
            using var searchHttp = new HttpClient(searchHandler);
            var search = new DsstatsService(searchStore, searchHttp, clock, TimeSpan.Zero);
            search.Queue([], [" &lt;Clan&gt; TKnight ", "TKnight"], "eu"); await search.ProcessNextAsync();
            var nameKey = SiteSyncService.NameLookupKey("TKnight", "EU");
            var exact = searchStore.Data.DsstatsLookups[nameKey];
            assert(exact.Status == "Candidates" && exact.Profiles.Select(p => p.NativeId).SequenceEqual(new[] { "2-S2-1-2", "2-S2-1-1" })
                && exact.Profiles.All(p => p.LastPlayed == null) && searchHandler.Calls == 1,
                "dsstats exact regional name candidates preserve separate accounts and sort by games without inventing recency");
            assert(exact.Profiles.All(p => p.Consistency == .9062 && p.Confidence == .8279 && p.RatingStateVersion == 1),
                "dsstats search preserves optional public state through its shared rating parser");
            assert(searchStore.Data.DsstatsLookups.Count == 1 && !searchStore.Data.DsstatsLookups.ContainsKey("2-S2-1-2")
                && searchStore.Data.Ratings.Count == 0 && searchStore.Data.Marks.Count == 0,
                "dsstats name candidates never promote identity or change DSR ratings and notes");
            using (var body = JsonDocument.Parse(searchHandler.Bodies[0]))
                assert(body.RootElement.GetProperty("regionId").GetInt32() == 2 && body.RootElement.GetProperty("take").GetInt32() == 50
                    && body.RootElement.GetProperty("pageSize").GetInt32() == 50 && searchHandler.Paths[0] == "/api10/Players/ratings",
                    "dsstats name search asks for one bounded regional page");
            search.Queue([], ["TKnight"]); await search.ProcessNextAsync();
            assert(searchStore.Data.DsstatsLookups[SiteSyncService.NameLookupKey("TKnight")].Profiles.Count == 3,
                "dsstats unscoped names keep EU and Americas candidates separate");
            searchAnswer = JsonSerializer.Serialize(Enumerable.Range(1, 60).Select(i => Row(id: i, name: i == 51 ? "Outside" : "TKnight",
                games: 10000 - i, wins: 0)).ToArray());
            search.Queue([], ["Outside"], "EU"); await search.ProcessNextAsync();
            assert(searchStore.Data.DsstatsLookups[SiteSyncService.NameLookupKey("Outside", "EU")].Status == "No exact match among first50",
                "dsstats search stops after fifty rows and reports the bounded-search limit");
            clock.Advance(TimeSpan.FromMinutes(30)); search.Queue([], ["TKnight"], "EU"); await search.ProcessNextAsync();
            assert(searchStore.Data.DsstatsLookups[nameKey].Profiles.Count == 8,
                "dsstats stores no more than eight exact candidates");

            var capStore = NewStore("limits");
            for (int i = 0; i < 505; i++) capStore.Data.DsstatsLookups[$"old-{i}"] = new($"old-{i}", "Ready", clock.Now.UtcDateTime.AddMinutes(-i), []);
            using var capHttp = new HttpClient(new Handler((_, _) => Task.FromResult(Json("null"))));
            var cap = new DsstatsService(capStore, capHttp, clock, TimeSpan.Zero);
            cap.Queue(Enumerable.Range(1, 200).Select(i => $"2-S2-1-{i}"));
            assert(cap.QueuedCount == 96 && capStore.Data.DsstatsLookups.Count == 500 && capStore.Data.DsstatsLookups.ContainsKey("old-0")
                && !capStore.Data.DsstatsLookups.ContainsKey("old-504"), "dsstats caps queued work and retains only the five hundred newest cache records");
            await cap.ProcessNextAsync();
            assert(capStore.Data.DsstatsLookups["2-S2-1-1"].Status == "Not found" && capStore.Data.DsstatsLookups.Count == 500,
                "dsstats absent native profiles remain distinct from unrated and unavailable records");
            var missingStore = NewStore("missing");
            using var missingHttp = new HttpClient(new Handler((_, _) => Task.FromResult(Json("", HttpStatusCode.NotFound))));
            var missing = new DsstatsService(missingStore, missingHttp, clock, TimeSpan.Zero);
            missing.Queue([lookup.Key]); await missing.ProcessNextAsync();
            assert(missingStore.Data.DsstatsLookups[lookup.Key] is { Status: "Not found", Profiles.Count: 0 },
                "dsstats native 404 is a missing profile rather than a request failure or unrated account");

            foreach (var response in new[]
            {
                new Func<HttpResponseMessage>(() => Json("{}", HttpStatusCode.ServiceUnavailable)),
                () => Json(new string(' ', DsstatsService.ResponseLimit + 1)),
                () => Json("[]"),
                () => throw new TaskCanceledException("mock HTTP timeout")
            })
            {
                var errorStore = NewStore("error-" + Guid.NewGuid().ToString("N"));
                using var errorHttp = new HttpClient(new Handler((_, _) => Task.FromResult(response())));
                var error = new DsstatsService(errorStore, errorHttp, clock, TimeSpan.Zero);
                error.Queue([lookup.Key]); await error.ProcessNextAsync();
                assert(errorStore.Data.DsstatsLookups[lookup.Key].Status == "Unavailable",
                    "dsstats HTTP failures oversized JSON and unexpected payloads fail closed");
            }

            var cancellationStore = NewStore("cancellation");
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var blockingHandler = new Handler(async (_, token) =>
            { started.TrySetResult(); await Task.Delay(Timeout.InfiniteTimeSpan, token); return Json("null"); });
            using var blockingHttp = new HttpClient(blockingHandler);
            var cancellationService = new DsstatsService(cancellationStore, blockingHttp, clock, TimeSpan.Zero);
            cancellationService.Queue([lookup.Key]);
            using var cancellation = new CancellationTokenSource();
            var run = cancellationService.RunAsync(cancellation.Token);
            await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
            cancellationService.Queue([lookup.Key]);
            assert(cancellationService.QueuedCount == 0 && blockingHandler.Calls == 1, "dsstats deduplicates the in-flight native request");
            cancellation.Cancel();
            await run.WaitAsync(TimeSpan.FromSeconds(2));
            assert(cancellationStore.Data.DsstatsLookups.Count == 0, "dsstats shutdown cancels in-flight HTTP without writing a false error or unrated result");

            var serialStore = NewStore("serial");
            var firstStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var serialHandler = new Handler(async (_, token) => { firstStarted.TrySetResult(); await release.Task.WaitAsync(token); return Json("null"); });
            using var serialHttp = new HttpClient(serialHandler);
            var serial = new DsstatsService(serialStore, serialHttp, clock, TimeSpan.Zero);
            serial.Queue(["2-S2-1-1", "2-S2-1-2"]);
            var one = serial.ProcessNextAsync(); await firstStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
            var two = serial.ProcessNextAsync();
            assert(serialHandler.Calls == 1 && !two.IsCompleted, "dsstats allows one HTTP request in flight even with concurrent process callers");
            release.TrySetResult(); await Task.WhenAll(one, two).WaitAsync(TimeSpan.FromSeconds(2));
            assert(serialHandler.Calls == 2 && serialStore.Data.DsstatsLookups.Count == 2,
                "dsstats serial worker completes each independent native account");

            foreach (var (optional, expectedConsistency, expectedConfidence) in new (string, double?, double?)[]
            {
                ("", null, null), (",\"cons\":null,\"conf\":null", null, null), (",\"cons\":\"0.5\",\"conf\":true", null, null),
                (",\"cons\":-0.01,\"conf\":1.01", null, null), (",\"cons\":1e400,\"conf\":{}", null, null),
                (",\"cons\":0,\"conf\":1", 0, 1), (",\"cons\":0.5,\"conf\":\"bad\"", .5, null)
            })
            {
                var stateStore = NewStore("state-" + Guid.NewGuid().ToString("N"));
                var row = "{\"toonIdString\":\"7408040x2x1\",\"regionId\":2,\"name\":\"TKnight\",\"ratingType\":2,\"games\":10,\"wins\":5,\"rating\":1500" + optional + "}";
                using var rowDocument = JsonDocument.Parse(row);
                var stateAnswer = Overview(rows: [rowDocument.RootElement.Clone()]);
                var stateHandler = new Handler((_, _) => Task.FromResult(Json(stateAnswer)));
                using var stateHttp = new HttpClient(stateHandler);
                var stateService = new DsstatsService(stateStore, stateHttp, clock, TimeSpan.Zero);
                // Legacy numeric evidence schedules one refresh, preserving its displayed rating until then.
                stateStore.Data.DsstatsLookups[lookup.Key] = new(lookup.Key, "Ready", clock.Now.UtcDateTime,
                    [profile with { Consistency = null, Confidence = null, RatingStateVersion = 0 }]);
                stateService.Queue([lookup.Key, lookup.Key]);
                assert(stateService.QueuedCount == 1 && stateStore.Data.DsstatsLookups[lookup.Key].Profiles[0].Rating == profile.Rating,
                    "dsstats legacy numeric cache queues one state upgrade without removing its rating");
                await stateService.ProcessNextAsync();
                var stateProfile = stateStore.Data.DsstatsLookups[lookup.Key].Profiles.Single();
                assert(stateProfile.Rating == 1500 && stateProfile.Consistency == expectedConsistency && stateProfile.Confidence == expectedConfidence && stateProfile.RatingStateVersion == 1,
                    "dsstats parses each optional state independently including boundaries without fabricating invalid precision");
                stateService.Queue([lookup.Key]);
                assert(stateService.QueuedCount == 0 && stateHandler.Calls == 1,
                    "dsstats parsed optional-state absence is fresh and cannot create an upgrade retry loop");
                stateStore.Data.DsstatsLookups[lookup.Key] = new(lookup.Key, "Unavailable", clock.Now.UtcDateTime,
                    [profile with { RatingStateVersion = 0 }]);
                stateService.Queue([lookup.Key]);
                assert(stateService.QueuedCount == 0, "dsstats legacy state never bypasses unavailable five-minute throttling");
                clock.Advance(TimeSpan.FromMinutes(5));
                stateService.Queue([lookup.Key]);
                assert(stateService.QueuedCount == 1, "dsstats unavailable legacy state retries at the ordinary five-minute boundary");
            }
            var migrationStore = NewStore("candidate-migration");
            using var migrationHttp = new HttpClient(new Handler((_, _) => Task.FromResult(Json("[]"))));
            var migration = new DsstatsService(migrationStore, migrationHttp, clock, TimeSpan.Zero);
            migrationStore.Data.DsstatsLookups[nameKey] = new(nameKey, "Candidates", clock.Now.UtcDateTime,
                [profile with { RatingStateVersion = 0 }]);
            migration.Queue([], ["TKnight"], "EU");
            assert(migration.QueuedCount == 1, "dsstats legacy numeric name candidates also schedule a bounded state upgrade");
            migrationStore.Data.DsstatsLookups[lookup.Key] = new(lookup.Key, "Unrated", clock.Now.UtcDateTime,
                [profile with { Rating = null, RatingStateVersion = 0 }]);
            migration.Queue([lookup.Key]);
            assert(migration.QueuedCount == 1, "dsstats fresh unrated profiles do not request a meaningless state upgrade");
        }
        finally { Directory.Delete(directory, true); }
    }
}
