using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace DirectStrikeCompanion;

internal static class LiveLobbyRatingsTests
{
    private sealed class ImmediateHandler(Func<string, string> reply) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(reply(request.RequestUri!.AbsolutePath)) });
    }
    private sealed record Call(string Name, TaskCompletionSource<HttpResponseMessage> Reply);
    private sealed class Handler : HttpMessageHandler
    {
        internal readonly Channel<Call> Requests = Channel.CreateUnbounded<Call>();
        internal readonly TaskCompletionSource BackgroundStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal readonly TaskCompletionSource<HttpResponseMessage> Background = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal int Calls;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            if (request.RequestUri!.AbsolutePath == "/player/999/games")
            {
                BackgroundStarted.TrySetResult();
                return await Background.Task.WaitAsync(token);
            }
            var query = Uri.UnescapeDataString(request.RequestUri.Query[3..]);
            var name = Regex.Replace(query, @"\s+@(eu|na)$", "").Trim('"');
            var reply = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
            Interlocked.Increment(ref Calls);
            Requests.Writer.TryWrite(new(name, reply));
            return await reply.Task.WaitAsync(token);
        }
    }
    private static HttpResponseMessage Search(Call call, int id) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(new { players = new[] { new { id = id.ToString(), player_name = call.Name, region = "eu", rating = 2500 + id, games = 42, winrate = 55, played_last = "2026-10-15" } } }), Encoding.UTF8, "application/json")
    };
    private static async Task<Call> Next(Handler handler) => await handler.Requests.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
    private static async Task Until(Func<bool> predicate)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (!predicate()) await Task.Delay(5, timeout.Token);
    }
    internal static void Run(Action<bool, string> assert) => RunAsync(assert).GetAwaiter().GetResult();

    private static async Task RunAsync(Action<bool, string> assert)
    {
        var directory = Path.Combine(Path.GetTempPath(), "dsc-live-ratings-" + Guid.NewGuid().ToString("N"));
        var store = new Store(directory);
        using var handler = new Handler(); using var http = new HttpClient(handler);
        var ratings = new RatingService(http, TimeSpan.Zero);
        var site = new SiteSyncService(store, ratings);
        var dsstats = new DsstatsService(store);
        var live = new LiveLobbyRatings(store, site, dsstats);
        using var cancellation = new CancellationTokenSource();
        var background = ratings.PageAsync("/player/999/games", cancellation.Token);
        await handler.BackgroundStarted.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var run = live.RunAsync(cancellation.Token);
        var lobby = new LobbyService(store, (_, _, _) => { }, rosterChanged: live.Observe);
        string[] names = ["Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Enemy3"];
        try
        {
            await RepeatedDiscoveryAsync(directory, assert);
            CandidateStateAdmission(directory, assert);
            lobby.ApplyScreenObservation("", true, DateTime.UtcNow, names, [1, 1, 1, 2, 2, 2], "EU");
            var first = await Next(handler); var second = await Next(handler);
            assert(!background.IsCompleted && handler.Calls == 2 && live.Snapshot().Active == 2,
                "two lobby rating searches start while a background profile request remains blocked");
            assert(dsstats.LobbyQueuedCount == 6, "the same server roster event queues all three allies and all three enemies on dsstats without a browser");
            first.Reply.SetResult(Search(first, 101));
            var third = await Next(handler);
            lock (store.Gate) assert(store.Data.SiteLookups[SiteSyncService.NameLookupKey(first.Name, "EU")].Profiles[0].SearchRating == 2601,
                "the first numeric site rating publishes while other lobby requests are still waiting");
            second.Reply.SetResult(Search(second, 102)); third.Reply.SetResult(Search(third, 103));
            for (int index = 0; index < 3; index++) { var call = await Next(handler); call.Reply.SetResult(Search(call, 104 + index)); }
            await Until(() => live.Snapshot().Publications.Count == 6);
            lock (store.Gate)
            {
                assert(names.All(name => store.Data.SiteLookups[SiteSyncService.NameLookupKey(name, "EU")].Profiles.Count == 1),
                    "every ally and enemy receives an automatic name/region rating without profile selection");
                assert(store.Data.RegionalRatings.Count == 0 && store.Data.Marks.Count == 0,
                    "automatic public name discovery cannot link native identities or alter private lists");
            }
            var changes = new LiveUpdateSignal(); store.Changed += changes.Pulse;
            var before = changes.Version;
            lobby.ApplyScreenObservation("", true, DateTime.UtcNow.AddSeconds(1), ["Ally1", "Ally2", "Ally3", "Enemy1", "Enemy2", "Joined"], [1, 1, 1, 2, 2, 2], "EU");
            var joined = await Next(handler);
            assert(joined.Name.Equals("Joined", StringComparison.OrdinalIgnoreCase) && changes.Version > before,
                "an enemy joining publishes a pending row and starts its lookup without waiting for dashboard polling");
            joined.Reply.SetResult(Search(joined, 110));
            // Previously completed source responses are reused; hydration stays in the ordinary queue.
            await Until(() => live.Snapshot().Publications.Any(value => value.Name == "Joined"));
            assert(site.Snapshot().Queued > 0, "mode/profile hydration remains automatic after the fast numeric discovery");
            handler.Background.TrySetResult(new(HttpStatusCode.OK) { Content = new StringContent("<html></html>") });
            await background;
            cancellation.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(3));
            assert(live.Snapshot().Active == 0, "shutdown cancels both live discovery workers and leaves no active requests");

            var priorityStore = new Store(Path.Combine(directory, "priority"));
            using var priorityHandler = new Handler(); using var priorityHttp = new HttpClient(priorityHandler);
            var prioritySource = new SiteSyncService(priorityStore, new RatingService(priorityHttp, TimeSpan.Zero));
            var priority = new LiveLobbyRatings(priorityStore, prioritySource, new DsstatsService(priorityStore));
            using var priorityCancel = new CancellationTokenSource();
            var priorityRun = priority.RunAsync(priorityCancel.Token);
            priority.Observe(names, "EU");
            var held = await Next(priorityHandler); var heldToo = await Next(priorityHandler);
            priority.Observe(["Ally1", "Ally2", "NewJoin", "Enemy1", "Enemy2", "Enemy3"], "EU");
            held.Reply.SetResult(Search(held, 200));
            var next = await Next(priorityHandler);
            assert(next.Name.Equals("NewJoin", StringComparison.OrdinalIgnoreCase), "a new arrival takes the next free request slot before the older pending roster batch");
            priorityCancel.Cancel(); await priorityRun.WaitAsync(TimeSpan.FromSeconds(3));
            assert(priority.Snapshot().Active == 0 && !heldToo.Reply.Task.IsCompleted && !next.Reply.Task.IsCompleted,
                "cancellation retires blocked lobby HTTP rather than waiting for their responses");
        }
        finally
        {
            cancellation.Cancel();
            try { await run; } catch (OperationCanceledException) { }
            try { await background; } catch (OperationCanceledException) { }
            Directory.Delete(directory, true);
        }
    }

    private static void CandidateStateAdmission(string directory, Action<bool, string> assert)
    {
        var store = new Store(Path.Combine(directory, "candidate-state"));
        var now = DateTime.UtcNow;
        var primary = new DsstatsProfile("2-S2-1-71", "Enemy", "EU", 1700, 200, 100, now,
            "https://dsstats.pax77.org/player/2-S2-1-71", Consistency: .9, Confidence: .8, RatingStateVersion: 1);
        var exact = primary with { NativeId = "2-S2-1-72", LastPlayed = now.AddDays(-1), Consistency = null, Confidence = null };
        var key = SiteSyncService.NameLookupKey("Enemy", "EU");
        store.Data.DsstatsLookups[key] = new(key, "Candidates", now, [primary, exact]);
        store.Data.DsstatsLookups[exact.NativeId] = new(exact.NativeId, "Ready", now, [exact]);
        var enemy = new ReplayPlayer(exact.NativeId, "<Clan> Enemy", 2, "", "", 0, 0, 0);
        store.Data.Matches.Add(new("candidate-state", "fixture", "Direct Strike", "Commanders", now, 600, 1,
            [enemy, enemy with { Id = "1-S2-1-72", Name = "Enemy" }]));
        var dsstats = new DsstatsService(store);
        var live = new LiveLobbyRatings(store, new SiteSyncService(store, new RatingService()), dsstats);
        live.Observe(["Enemy"], "EU");
        assert(dsstats.QueuedCount == 1 && dsstats.LobbyQueuedCount == 0,
            "server roster event hydrates the unique exact regional opponent even when it is a non-primary fresh numeric-only site alternative");
        store.Data.Matches.Add(new("candidate-ambiguous", "fixture", "Direct Strike", "Commanders", now, 600, 1,
            [enemy with { Id = "2-S2-1-73" }]));
        live.Observe(["Enemy"], "EU");
        assert(dsstats.QueuedCount == 0 && store.Data.RegionalRatings.Count == 0 && store.Data.Marks.Count == 0,
            "ambiguous replay identities revoke extra state nomination without linking public accounts or changing private lists");
    }

    private static async Task RepeatedDiscoveryAsync(string directory, Action<bool, string> assert)
    {
        var store = new Store(Path.Combine(directory, "repeated"));
        using var handler = new ImmediateHandler(path => path switch
        {
            "/dsr/search_players.php" => """{"players":[{"id":"101","player_name":"Twin","region":"eu","rating":2800,"games":42}]}""",
            "/player/101/ratings" => """<h1>Ratings of <a href="/player/101">Twin</a></h1><table><tr><th><a href="/rating/commanders_3v3">commanders_3v3</a></th><td>3000</td></tr></table>""",
            "/player/101" => """<title>Twin player profile — DS Rating</title><link rel="canonical" href="https://ds-rating.com/player/101"><h1 class="page-title">Twin</h1><div id="rating-box"><h6>Rating</h6><h3>3000</h3></div><h6>Discovered games</h6><h3>42</h3><h6>Winrate</h6><h3>50%</h3>""",
            _ => "<html></html>"
        });
        using var http = new HttpClient(handler);
        var source = new SiteSyncService(store, new RatingService(http, TimeSpan.Zero));
        await source.DiscoverLobbyAsync("Twin", "EU", CancellationToken.None);
        await source.DiscoverLobbyAsync("Twin", "EU", CancellationToken.None);
        var key = SiteSyncService.NameLookupKey("Twin", "EU");
        assert(source.Snapshot().Queued == 1 && SiteSyncService.IsLobbyDiscoveryFresh(store.Data.SiteLookups[key], DateTime.UtcNow),
            "repeated discovery replaces a stale queued generation and reuses fresh search evidence");
        int count = 0;
        while (count++ < 12 && await source.ProcessNextAsync()) { }
        var lookup = store.Data.SiteLookups[key];
        assert(lookup.Profiles[0].Rating == 3000 && lookup.Profiles[0].ProfileChecked != null
            && !lookup.Profiles[0].DetailsPending && !lookup.Status.Contains("pending", StringComparison.Ordinal),
            "the newest discovery generation automatically completes published mode/profile hydration without a profile choice");
        assert(!SiteSyncService.IsLobbyDiscoveryFresh(lookup, DateTime.UtcNow.AddMinutes(31)),
            "fresh discovery reuse expires rather than retaining old lobby ratings indefinitely");
    }
}
