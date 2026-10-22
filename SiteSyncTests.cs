namespace DirectStrikeCompanion;

internal static class SiteSyncTests
{
    internal static void Run(Action<bool, string> assert)
    {
        assert(SiteSyncService.NormalizeName(" &lt;Expend&gt; [Clan] TKnight ") == "TKnight" && SiteSyncService.NormalizeName("Günther") == "Günther", "site comparisons decode and strip leading clan tags while preserving names");
        assert(SiteSyncService.ExactQuery("TKnight", "EU") == "\"TKnight\" @eu" && SiteSyncService.ExactQuery("TKnight", "Americas") == "\"TKnight\" @na", "automatic site search uses quoted legacy names and the native region");
        assert(SiteSyncService.ExactQuery(new string('a', 26), "EU")?.Length == 32 && SiteSyncService.ExactQuery(new string('a', 30), "EU")?.Length == 32 && SiteSyncService.ExactQuery(new string('a', 31), "EU") == null && SiteSyncService.ExactQuery("bad\"query", "EU") == null, "long exact names omit the region token while searches remain within the 32-character endpoint bound");
        assert(SiteSyncService.ExactQuery("Ваня Кузьмич", "EU") == "Ваня Кузьмич @eu"
            && SiteSyncService.CompleteNameMatches("<Clan> Ваня Кузьмич", "Ваня Кузьмич")
            && SiteSyncService.CompleteNameMatches("Renamed (Ваня Кузьмич)", "Ваня Кузьмич")
            && SiteSyncService.CompleteNameMatches("Ваня Кузьмич (FormerName)", "Ваня Кузьмич")
            && !SiteSyncService.CompleteNameMatches("<Ваня> Кузьмич", "Ваня Кузьмич")
            && !SiteSyncService.CompleteNameMatches("Кузьмич", "Ваня Кузьмич"), "spaced Unicode names use token search and require a complete current or displayed legacy name, never a clan or suffix match");
        assert(SiteSyncService.NativeRegion("2-S2-1-123") == "EU" && SiteSyncService.NativeRegion("1-S2-1-123") == "Americas" && SiteSyncService.NativeRegion("3-S2-1-123") == null && SiteSyncService.NativeRegion("name:abc") == null, "native region derives only from supported stable replay identities");
        RatingCandidate Candidate(string id, string name, string region) => new(id, name, 9999, region, 100, 99, "fixture");
        var candidates = new[] { Candidate("1", "Renamed", "eu"), Candidate("2", "TKnight", "na"), Candidate("1", "Renamed", "EU") };
        var regional = SiteSyncService.RegionalCandidates(candidates, "EU");
        assert(regional.Count == 1 && regional[0].Name == "Renamed", "quoted legacy search keeps renamed profiles and coalesces repeated profile IDs in the requested region");
        assert(SiteSyncService.RegionalCandidates([.. candidates, Candidate("3", "TKnight", "eu")], "EU").Count == 2, "different exact legacy-name candidates stay ambiguous instead of choosing a rating");
        assert(SiteSyncService.LookupLifetime("Name match") == TimeSpan.FromMinutes(30) && SiteSyncService.LookupLifetime("Candidates") == TimeSpan.FromMinutes(30)
            && SiteSyncService.LookupLifetime("Name match; game pending") == TimeSpan.FromMinutes(5) && SiteSyncService.LookupLifetime("Error: server") == TimeSpan.FromMinutes(5), "successes cache for 30 minutes while pending or failed evidence retries in five");
        string RatingRow(string mode, string value) => $"<tr><th><a href=\"/rating/{mode}\">{mode}</a></th><td>{value}</td></tr>";
        assert(RatingService.ParseCommanderRating(RatingRow("main_current", "9000") + RatingRow("commanders_3v3", "2,000")) == 2000
            && RatingService.ParseCommanderRating(RatingRow("main_current", "9000")) == null, "automatic cache reads only commanders_3v3 rather than mixed-mode main rating");
        assert(RatingService.ParseCommanderRating(RatingRow("commanders_3v3", "0")) == 0 && RatingService.ParseCommanderRating(RatingRow("commanders_3v3", "...")) == null, "a real zero mode rating remains distinct from a pending or absent rating");
        string RatingHeader(string id) => $"<h1 class='page-title'>Ratings of <a href='/player/{id}'>Known</a></h1>";
        assert(RatingService.ParseProfileCommanderRating("8713", RatingHeader("8713") + RatingRow("commanders_3v3", "7729")) == 7729
            && RatingService.ParseProfileCommanderRating("8713", RatingHeader("8713") + RatingRow("main_current", "9000")) == null, "only a verified rating profile can report a mode value or its absence");
        foreach (var html in new[] { "<html>Temporarily unavailable</html>", RatingHeader("123") + RatingRow("commanders_3v3", "9999") })
        {
            bool rejected = false;
            try { RatingService.ParseProfileCommanderRating("8713", html); } catch (InvalidDataException) { rejected = true; }
            assert(rejected, "a successful HTTP error page or redirected rating identity is retryable failure rather than no 3v3 rating");
        }

        const string stamp = "2026-10-06 18:50:48";
        string HistoryRow(string id = "3637491", string delta = "...", string mode = "3v3 commanders", string commander = "stetmann", string time = stamp) =>
            $"<tr><th><a class=\"text-success\" href=\"/game/{id}\">{time}</a></th><td class=\"text-left\">... <span class=\"text-success\">{delta}</span></td><td>{mode}</td><td>{commander}</td><td>36</td><td>3</td><td>4</td><td>20 min</td></tr>";
        var history = SiteSyncService.ParseRecentGames("<table>" + HistoryRow() + HistoryRow("3637490", "+6") + HistoryRow("3637489", "-15") + HistoryRow("3637488", "0") + "</table>");
        assert(history.Count == 4 && history[0].Time.Kind == DateTimeKind.Utc && history[0].Time == new DateTime(2026, 10, 6, 18, 50, 48, DateTimeKind.Utc)
            && history[0].Delta == null && history[1].Delta == 6 && history[2].Delta == -15 && history[3].Delta == 0, "recent game rows parse UTC seconds and signed or zero deltas without converting pending into zero");
        assert(SiteSyncService.ParseRecentGames(string.Concat(Enumerable.Range(1, 110).Select(i => HistoryRow(i.ToString())))).Count == 100, "recent game parsing remains bounded at 100 valid rows");
        assert(SiteSyncService.ParseRecentGames(HistoryRow(time: "2026-10-06") + "<tr><td>malformed</td></tr>").Count == 0, "incomplete timestamps and malformed history rows cannot become match evidence");

        var sourcePlayers = new[]
        {
            ("154496", "Vanea", "Dehaka"), ("21525", "&lt;Expend&gt; makuwow", "Raynor"), ("8713", "&lt;Expend&gt; TKnight", "Stetmann"),
            ("24712", "BigBalls", "Zagara"), ("17664", "xylink", "Karax"), ("20097", "Günther", "Zagara")
        };
        string GameHtml(bool pending)
        {
            string PlayerRow(int i)
            {
                var p = sourcePlayers[i];
                var delta = pending ? "..." : i == 3 ? "0" : i < 3 ? "+6" : "-6";
                return $"<tr><td class=\"race-portrait\"><a title=\"by the moment of this game {stamp}\" href=\"/player/{p.Item1}/commander/{p.Item3.ToLowerInvariant()}\"><img alt=\"{p.Item3}\"></a></td><td class=\"player-data align-middle\"><div class=\"player-name\"><a style=\"color: white\" href=\"/player/{p.Item1}\">{p.Item2}</a></div></td><td class=\"text-right align-middle\"><span>7500</span><span class=\"text-success\">{delta}</span></td></tr>";
            }
            return "<h1 class=\"page-title\">Game #3637491 — 2026-10-06</h1><a href=\"/mode/commanders\">commanders</a><h6 class=\"text-muted\">duration</h6><h3 title=\"loops&#013;27 494\">20:27</h3>"
                + "<table><tbody>" + string.Concat(Enumerable.Range(0, 3).Select(PlayerRow)) + "</tbody></table>"
                + "<table><tbody>" + string.Concat(Enumerable.Range(3, 3).Select(PlayerRow)) + "</tbody></table><table><tr><td>unrelated statistics</td></tr></table>";
        }
        var pendingGame = SiteSyncService.ParseGame("3637491", GameHtml(true));
        var numericGame = SiteSyncService.ParseGame("3637491", GameHtml(false));
        assert(pendingGame.Players.Count == 6 && pendingGame.Players.All(p => p.Delta == null) && pendingGame.Players.Select(p => p.Team).SequenceEqual(new[] { 0, 0, 0, 1, 1, 1 })
            && pendingGame.Time == history[0].Time && pendingGame.Seconds == 1227 && pendingGame.Players[2].Name == "<Expend> TKnight", "game page parser reads the two actual roster tables with time duration decoded names and pending rating cells");
        assert(numericGame.Players[0].Delta == 6 && numericGame.Players[3].Delta == 0 && numericGame.Players[4].Delta == -6, "game detail parser distinguishes signed changes and real zero from rating totals");
        var replayPlayers = sourcePlayers.Select((p, i) => new ReplayPlayer($"2-S2-1-{i + 1}", SiteSyncService.NormalizeName(p.Item2), i < 3 ? 8 : 3, p.Item3, i < 3 ? "Win" : "Loss", 0, 0, 0)).ToList();
        var match = new Match("site-fixture", "fixture", "Direct Strike", "Commanders", history[0].Time, 1227, 8, replayPlayers);
        var before = replayPlayers.ToArray();
        var changes = SiteSyncService.VerifyGame(match, history[0], numericGame, replayPlayers[2].Id, "8713");
        assert(changes?.Count == 6 && changes[3].Delta == 0 && changes.All(c => c.Kind == "confirmed" && c.SiteGameId == "3637491" && c.Detail.Contains("main_current") && c.Detail.Contains("not commanders_3v3"))
            && changes.Select(c => c.PlayerId).SequenceEqual(replayPlayers.Select(p => p.Id)), "six-player replay fingerprint confirms main DSR changes with explicit rating scope and replay ordering");
        assert(SiteSyncService.VerifyGame(match, history[0], pendingGame, replayPlayers[2].Id, "8713")?.Count == 0, "fully verified pending game produces no confirmed deltas so estimates can remain visible");
        var changedName = numericGame with { Players = numericGame.Players.Select(p => p.ProfileId == "154496" ? p with { Name = "Other" } : p).ToList() };
        var changedCommander = numericGame with { Players = numericGame.Players.Select(p => p.ProfileId == "154496" ? p with { Commander = "nova" } : p).ToList() };
        var changedTeam = numericGame with { Players = numericGame.Players.Select(p => p.ProfileId == "154496" ? p with { Team = 1 } : p.ProfileId == "24712" ? p with { Team = 0 } : p).ToList() };
        assert(SiteSyncService.VerifyGame(match, history[0], changedName, replayPlayers[2].Id, "8713") == null && SiteSyncService.VerifyGame(match, history[0], changedCommander, replayPlayers[2].Id, "8713") == null
            && SiteSyncService.VerifyGame(match, history[0], changedTeam, replayPlayers[2].Id, "8713") == null, "timestamp alone cannot confirm a changed participant commander or team partition");
        assert(SiteSyncService.VerifyGame(match, history[0], numericGame, replayPlayers[2].Id, "9999") == null
            && SiteSyncService.VerifyGame(match, history[0], numericGame with { Time = numericGame.Time!.Value.AddSeconds(3) }, replayPlayers[2].Id, "8713") == null
            && SiteSyncService.VerifyGame(match, history[0], numericGame with { Seconds = 1234 }, replayPlayers[2].Id, "8713") == null, "wrong anchor profile inconsistent site timestamps or duration outside six seconds reject confirmation");
        assert(SiteSyncService.ParseGame("9999", GameHtml(false)).Mode == "", "a redirected or mismatched game page cannot become requested game evidence");
        assert(SiteSyncService.VerifyGame(match with { Time = match.Time.AddSeconds(6), Seconds = match.Seconds + 6 }, history[0], numericGame, replayPlayers[2].Id, "8713")?.Count == 6
            && SiteSyncService.VerifyGame(match with { Time = match.Time.AddSeconds(7) }, history[0], numericGame, replayPlayers[2].Id, "8713") == null
            && SiteSyncService.VerifyGame(match with { Seconds = match.Seconds + 7 }, history[0], numericGame, replayPlayers[2].Id, "8713") == null, "parser clock tolerance accepts six seconds and rejects seven for time and duration");
        // Actual local replay 6083D338... vs verification/ds-game-3637491.html: 18:50:51.9117471/1231.0267857 vs 18:50:48/1227.
        var actualClock = match with { Time = history[0].Time.AddTicks(39_117_471), Seconds = 1231.0267857 };
        assert(SiteSyncService.VerifyGame(actualClock, history[0], pendingGame, replayPlayers[2].Id, "8713")?.Count == 0
            && SiteSyncService.VerifyGame(actualClock, history[0], numericGame, replayPlayers[2].Id, "8713")?.Count == 6, "actual local and supplied site clock pair preserves pending and permits full-fingerprint published changes");
        assert(SiteSyncService.VerifyGame(match with { Seconds = 1261 }, history[0], numericGame with { Seconds = 1259 }, replayPlayers[2].Id, "8713")?.Count == 6, "shortlist minute boundaries permit a small footer clock offset while exact game duration still verifies");
        var mixedRegions = match with { Players = replayPlayers.Select(p => p.Id == replayPlayers[0].Id ? p with { Id = "1-S2-1-1" } : p).ToList() };
        assert(SiteSyncService.VerifyGame(mixedRegions, history[0], numericGame, replayPlayers[2].Id, "8713") == null, "cross-region replay identities cannot gain same-server site evidence");
        assert(SiteSyncService.ParseRecentGames(HistoryRow(commander: "hanhorner"))[0].Commander == "hanhorner"
            && SiteSyncService.RecentMatches(match, replayPlayers[2] with { Commander = "Horner" }, history[0] with { Commander = "hanhorner" }), "site hanhorner names match the replay Horner commander enum");
        assert(replayPlayers.SequenceEqual(before) && numericGame.Players[0].Delta == 6, "pure site parsing and verification preserve replay and parsed input records");
        ProgressiveLookups(assert).GetAwaiter().GetResult();
        RegionalVisibleLookups(assert).GetAwaiter().GetResult();
        ProfileEstimates(assert).GetAwaiter().GetResult();
        PriorityCandidates(assert).GetAwaiter().GetResult();
        SearchRatingEvidence(assert).GetAwaiter().GetResult();
        IndependentSearchCacheEvidence(assert).GetAwaiter().GetResult();
        CachedModeEvidence(assert).GetAwaiter().GetResult();
        StoreSlots(assert);
        DownloadedFixture(assert);
    }

    private sealed class SiteHandler(Func<string, string> reply) : HttpMessageHandler
    {
        internal List<string> Requests { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var path = Uri.UnescapeDataString(request.RequestUri!.PathAndQuery);
            Requests.Add(path);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent(reply(path)) });
        }
    }

    private sealed class SiteClock : TimeProvider
    {
        internal DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static string ProfilePage(string id, string value = "...", string label = "Estimated rating") =>
        $"<meta property='og:url' content='https://ds-rating.com/player/{id}'><link rel='canonical' href='https://ds-rating.com/player/{id}'>"
        + $"<title>Known player profile &mdash; StarCraft II Direct Strike rating</title><h1 class='page-title'>Known</h1>"
        + $"<div id='rating-box'><h6>{label}</h6><h3>{value}</h3></div>";

    private static async Task CachedModeEvidence(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeCachedModeEvidenceTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        var now = DateTime.UtcNow;
        var olderPublished = new SiteProfile("3128", "BlackJoker", "EU", 4321, now.AddDays(-1),
            ProfileChecked: now.AddMinutes(1));
        var newerAbsence = new SiteProfile("3128", "BlackJoker", "EU", null, now, 3968, now);
        var handler = new SiteHandler(path => "{\"players\":[{\"id\":\"3128\",\"player_name\":\"BlackJoker\",\"region\":\"eu\",\"rating\":9999}]}");
        using var client = new HttpClient(handler);
        var ratings = new RatingService(client, TimeSpan.Zero);
        async Task<SiteProfile> Discover(string name, SiteProfile first, SiteProfile second, string secondStatus = "Site estimate")
        {
            store.Data.SiteLookups.Clear();
            store.Data.SiteLookups["older"] = new("older", "Name match", now, [first]);
            store.Data.SiteLookups["newer"] = new("newer", secondStatus, now, [second]);
            var sync = new SiteSyncService(store, ratings);
            sync.Queue([], ["BlackJoker"], "EU");
            await sync.ProcessNextAsync();
            return store.Data.SiteLookups[SiteSyncService.NameLookupKey("BlackJoker", "EU")].Profiles.Single();
        }
        try
        {
            var absent = await Discover("VerifiedNull", olderPublished, newerAbsence);
            assert(absent.Rating == null && absent.EstimatedRating == 3968 && absent.Checked == now,
                "discovery reuses newer verified scoped absence and site estimate rather than an older published duplicate, independent of main-profile checked time");
            foreach (var status in new[] { "Candidates; rating pending", "Candidates; rating unavailable", "Error: fixture unavailable" })
            {
                var incomplete = await Discover("Incomplete" + handler.Requests.Count, olderPublished,
                    newerAbsence with { Checked = now.AddMinutes(1) }, status);
                assert(incomplete.Rating == 4321 && incomplete.Checked == olderPublished.Checked,
                    "pending or failed duplicate with main-profile markers cannot replace earlier verified published mode evidence");
            }
            var unhydrated = await Discover("Unhydrated", olderPublished,
                new("3128", "BlackJoker", "EU", null, now.AddMinutes(1)), "Candidates");
            assert(unhydrated.Rating == 4321, "new discovery null without mode-absence evidence preserves an earlier published mode value");
            var profileFailure = await Discover("ProfileFailed", olderPublished, newerAbsence with { ProfileChecked = null, ProfileAttempted = now },
                "No 3v3 rating; profile unavailable");
            assert(profileFailure.Rating == null && profileFailure.EstimatedRating == 3968,
                "successful mode absence remains newer evidence when only the subsequent main-profile request failed");
            var published = await Discover("NewPublished", newerAbsence with { Checked = now.AddDays(-1), ProfileChecked = now.AddMinutes(1) },
                olderPublished with { Rating = 5000, Checked = now }, "Name match");
            assert(published.Rating == 5000 && published.Checked == now,
                "newer successful published mode evidence replaces an older estimate using the mode checked timestamp");
            const string native = "2-S2-1-55";
            store.SetRegionRating(native, "EU", new(native, 6000, "Linked profile", "fixture", now.AddDays(-2), "3128", Region: "EU", ProfileName: "BlackJoker"));
            store.Data.SiteLookups.Clear();
            store.Data.SiteLookups["older"] = new("older", "Name match", now, [olderPublished]);
            store.Data.SiteLookups["newer"] = new("newer", "Site estimate", now, [newerAbsence]);
            var manualSync = new SiteSyncService(store, ratings);
            var requests = handler.Requests.Count;
            manualSync.Queue([native]);
            await manualSync.ProcessNextAsync();
            var manual = store.Data.SiteLookups[native].Profiles.Single();
            assert(manual.Rating == 6000 && manual.Checked == now.AddDays(-2) && manual.EstimatedRating == 3968
                && store.ResolveRegionRating(native, "EU").Rating!.Value == 6000 && handler.Requests.Count == requests,
                "primary manual slot keeps priority over newer automatic absence while preserving its separate cached estimate");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task ProfileEstimates(Action<bool, string> assert)
    {
        using var fixtureStream = typeof(SiteSyncTests).Assembly.GetManifestResourceStream("DscTest:site-profile-3128-current")
            ?? throw new InvalidDataException("The downloaded BlackJoker profile fixture is missing.");
        using var fixtureReader = new StreamReader(fixtureStream);
        var html = fixtureReader.ReadToEnd();
        var parsed = RatingService.ParseProfileEstimate("3128", html);
        assert(parsed.EstimatedRating == 3968 && parsed.DiscoveredGames == 1048 && parsed.WinRate == 45.1,
            "downloaded BlackJoker main profile supplies its 3968 site estimate, 1048 discovered games and 45.1 percent win rate");
        assert(parsed.ProfileStatsVersion == RatingService.CurrentProfileStatsVersion && parsed.CommanderStats!.SequenceEqual(new SiteCommanderStat[]
            { new("artanis", 97, 48.5), new("mengsk", 95, 47.4), new("raynor", 93, 53.8), new("nova", 82, 46.3), new("karax", 70, 48.6) }),
            "downloaded main profile retains exactly its five visible commander rows and reported percentages without inferring pick shares from a truncated table");
        var wrongCommander = RatingService.ParseProfileEstimate("3128", html.Replace("/player/3128/commander/artanis", "/player/999/commander/artanis"));
        assert(wrongCommander.CommanderStats!.Count == 4 && wrongCommander.CommanderStats.All(row => row.Commander != "artanis")
            && RatingService.ParseProfileEstimate("3128", html.Replace("/player/3128/commanders\"", "/player/999/commanders\"")).CommanderStats!.Count == 0,
            "commander statistics require both the verified player's section link and its row links, never unrelated profile rows");
        string StatRow(string slug, string games, string win) => $"<tr><th><a href='/player/1/commander/{slug}'>{slug}</a></th><td>{games}</td><td>{win}</td></tr>";
        string StatTable(string rows) => "<h4><a href='/player/1/commanders'>Commanders stats</a></h4><table>" + rows + "</table>";
        var boundedStats = RatingService.ParseProfileEstimate("1", ProfilePage("1") + StatTable(StatRow("negative", "-1", "50%")
            + StatRow("nan", "1", "NaN") + StatRow("over", "1", "100.1%") + StatRow("missing", "0", "...")
            + string.Concat(Enumerable.Range(1, 20).Select(i => StatRow("commander" + i, "1", "0%")))));
        assert(boundedStats.CommanderStats!.Count == RatingService.CommanderStatLimit && boundedStats.CommanderStats[0] == new SiteCommanderStat("missing", 0, null)
            && boundedStats.CommanderStats.Skip(1).All(row => row.WinRate == 0),
            "commander rows reject negative counts and invalid percentages, retain explicit zero and unknown percentages, and remain bounded to twelve");
        assert(RatingService.ParseProfileEstimate("1", ProfilePage("1", "9000", "Rating")).MainRating == 9000
            && RatingService.ParseProfileEstimate("1", ProfilePage("1", "2500")).MainRating == null,
            "published general rating card is retained independently of mode and estimated ratings");
        assert(RatingService.ParseProfileEstimate("1", ProfilePage("1")).EstimatedRating == null
            && RatingService.ParseProfileEstimate("1", ProfilePage("1", "9000", "Rating")).EstimatedRating == null
            && RatingService.ParseProfileEstimate("1", ProfilePage("1", "0")).EstimatedRating == 0,
            "validated empty card and generic published main rating cannot become an estimate, while explicit estimated zero is retained");
        foreach (var bad in new[] { ProfilePage("2", "3968"), ProfilePage("1", "NaN"), ProfilePage("1", "broken"),
            ProfilePage("1", "3968").Replace("Known</h1>", "Other</h1>"), ProfilePage("1", "3968").Replace("<h3>", "<p>"),
            ProfilePage("1", "3968").Replace("rel='canonical' href='https://ds-rating.com/player/1'", "rel='canonical' href='https://ds-rating.com/player/2'"),
            "<html>Temporarily unavailable</html>" })
        {
            bool rejected = false;
            try { RatingService.ParseProfileEstimate("1", bad); } catch (InvalidDataException) { rejected = true; }
            assert(rejected, "wrong profile identity, inconsistent title or malformed estimated rating remains a retryable parser failure");
        }
        var legacy = System.Text.Json.JsonSerializer.Deserialize<SiteProfile>("{\"profileId\":\"3128\",\"name\":\"BlackJoker\",\"region\":\"EU\",\"rating\":null,\"checked\":\"2026-10-10T00:00:00Z\"}", Store.Json)!;
        var migrated = new SiteLookup("name:EU:blackjoker", "Candidates", DateTime.UtcNow, [legacy with { Checked = DateTime.UtcNow }]);
        assert(legacy.EstimatedRating == null && legacy.ProfileChecked == null && legacy.CommanderStats == null && legacy.ProfileStatsVersion == 0
            && legacy.SearchRating == null && legacy.SearchChecked == null
            && !SiteSyncService.IsLookupFresh(migrated, new Dictionary<string, SiteHistory>(), DateTime.UtcNow)
            && !SiteSyncService.IsLookupFresh(migrated with { Status = "Candidates; rating unavailable" }, new Dictionary<string, SiteHistory>(), DateTime.UtcNow),
            "old saved null-mode profiles deserialize compatibly and bypass fresh lookup lifetime until the main profile is checked");
        var attempted = migrated with { Status = "Candidates; profile unavailable", Profiles = [legacy with { ProfileAttempted = DateTime.UtcNow }] };
        assert(SiteSyncService.IsLookupFresh(attempted, new Dictionary<string, SiteHistory>(), DateTime.UtcNow)
            && !SiteSyncService.IsLookupFresh(attempted, new Dictionary<string, SiteHistory>(), DateTime.UtcNow.AddMinutes(6)),
            "new failed main-profile attempts retain the five-minute retry delay even when no prior estimate exists");
        var emptyAt = DateTime.UtcNow;
        var emptyProfiles = new SiteLookup("name:empty", "Candidates", emptyAt,
            [legacy with { ProfileChecked = emptyAt, ProfileStatsVersion = RatingService.CurrentProfileStatsVersion }, legacy with { ProfileId = "1", ProfileChecked = emptyAt, ProfileStatsVersion = RatingService.CurrentProfileStatsVersion }]);
        var emptyHistories = new Dictionary<string, SiteHistory> { ["1"] = new("1", "Known", "EU", emptyAt, "Ready", []) };
        assert(SiteSyncService.IsLookupFresh(emptyProfiles, emptyHistories, emptyAt)
            && !SiteSyncService.IsLookupFresh(emptyProfiles, emptyHistories, emptyAt.AddMinutes(6)),
            "validated empty main-profile results retry after five minutes rather than the positive estimate lifetime");
        var oldEstimate = legacy with { EstimatedRating = 3968, ProfileChecked = emptyAt, DiscoveredGames = 1048, WinRate = 45.1 };
        assert(!SiteSyncService.IsLookupFresh(migrated with { Profiles = [oldEstimate] }, new Dictionary<string, SiteHistory>(), emptyAt),
            "already checked legacy estimates still migrate immediately when main commander statistics predate the current version");
        var failedMigration = migrated with { Status = "Candidates; profile unavailable", Profiles = [oldEstimate with { ProfileAttempted = emptyAt }] };
        assert(SiteSyncService.IsLookupFresh(failedMigration, new Dictionary<string, SiteHistory>(), emptyAt)
            && !SiteSyncService.IsLookupFresh(failedMigration, new Dictionary<string, SiteHistory>(), emptyAt.AddMinutes(6)),
            "a failed commander-stat migration preserves the old estimate and obeys the same five-minute attempt backoff");
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeProfileEstimateTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        var clock = new SiteClock();
        bool published = false, failProfile = false, failRating = false;
        var handler = new SiteHandler(path =>
        {
            if (path.Contains("search_players")) return "{\"players\":[{\"id\":\"3128\",\"player_name\":\"BlackJoker\",\"region\":\"eu\",\"rating\":9999}]}";
            if (path.EndsWith("/ratings"))
            {
                if (failRating) throw new HttpRequestException("fixture rating unavailable");
                return "<h1>Ratings of <a href='/player/3128'>BlackJoker</a></h1>"
                    + (published ? "<th><a href=\"/rating/commanders_3v3\">commanders_3v3</a></th><td>4321</td>" : "");
            }
            if (path == "/player/3128") { if (failProfile) throw new HttpRequestException("fixture offline"); return html; }
            return "<h1>Recent games of <a href='/player/3128'>BlackJoker</a></h1>";
        });
        using var client = new HttpClient(handler);
        var ratings = new RatingService(client, TimeSpan.Zero, clock);
        var sync = new SiteSyncService(store, ratings);
        var key = SiteSyncService.NameLookupKey("BlackJoker", "EU");
        try
        {
            store.Data.SiteLookups[key] = migrated with { PlayerId = key, Profiles = [oldEstimate] };
            sync.Queue([], ["BlackJoker"], "EU");
            assert(sync.Snapshot().Queued == 1, "fresh legacy null-mode lookup is queued immediately for automatic profile estimate migration");
            await sync.ProcessNextAsync();
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1] == "/player/3128/ratings" && store.Data.SiteLookups[key].Profiles.Single().EstimatedRating == 3968,
                "formal mode absence publishes before one deferred main-profile request");
            await sync.ProcessNextAsync();
            var estimated = store.Data.SiteLookups[key].Profiles.Single();
            assert(handler.Requests[^1] == "/player/3128" && estimated.Rating == null && estimated.EstimatedRating == 3968
                && estimated.ProfileChecked.HasValue && estimated.CommanderStats!.SequenceEqual(parsed.CommanderStats!)
                && estimated.ProfileStatsVersion == RatingService.CurrentProfileStatsVersion && store.Data.SiteLookups[key].Status.Contains("history pending"),
                "automatic main-profile estimate is published before history without substituting the formal commanders rating");
            while (await sync.ProcessNextAsync()) { }
            int count = handler.Requests.Count;
            sync.Queue([], ["BlackJoker"], "EU");
            assert(sync.Snapshot().Queued == 0 && handler.Requests.Count == count,
                "successfully checked estimate lookup reuses fresh saved profile and history without repeated requests");
            const string native = "2-S2-1-55";
            store.SetRegionRating(native, "EU", new(native, null, "Linked profile", "fixture", DateTime.UnixEpoch, "3128", Region: "EU", ProfileName: "BlackJoker"));
            sync.Queue([native]);
            await sync.ProcessNextAsync();
            assert(store.Data.SiteLookups[native].Profiles.Single().EstimatedRating == 3968, "selected link discovery preserves earlier site estimate and provenance");
            await sync.ProcessNextAsync();
            assert(store.Data.SiteLookups[native].Profiles.Single().EstimatedRating == 3968, "intermediate mode-only publication retains prior known estimate");
            await sync.ProcessNextAsync();
            assert(handler.Requests.Count == count && store.ResolveRegionRating(native, "EU").Rating!.Value == null,
                "cached main estimate hydrates selected link without requests or promotion to a confirmed manual mode value");
            while (await sync.ProcessNextAsync()) { }
            clock.Now += TimeSpan.FromMinutes(31);
            store.Data.SiteLookups[key] = store.Data.SiteLookups[key] with { Checked = DateTime.UnixEpoch };
            failProfile = true;
            sync.Queue([], ["BlackJoker"], "EU");
            while (await sync.ProcessNextAsync()) { }
            var failed = store.Data.SiteLookups[key];
            assert(failed.Profiles.Single().EstimatedRating == 3968 && failed.Profiles.Single().ProfileChecked == estimated.ProfileChecked
                && failed.Profiles.Single().CommanderStats!.SequenceEqual(estimated.CommanderStats!) && failed.Profiles.Single().ProfileStatsVersion == RatingService.CurrentProfileStatsVersion
                && failed.Status.Contains("profile unavailable")
                && SiteSyncService.IsLookupFresh(failed, store.Data.SiteHistories, DateTime.UtcNow)
                && !SiteSyncService.IsLookupFresh(failed, store.Data.SiteHistories, DateTime.UtcNow.AddMinutes(6)),
                "failed profile refresh preserves known estimate and timestamp and is retryable after its bounded failure lifetime");
            failProfile = false;
            failRating = true;
            clock.Now += TimeSpan.FromMinutes(31);
            store.Data.SiteLookups[key] = failed with { Checked = DateTime.UnixEpoch };
            sync.Queue([], ["BlackJoker"], "EU");
            while (await sync.ProcessNextAsync()) { }
            assert(store.Data.SiteLookups[key].Profiles.Single().Rating == null
                && store.Data.SiteLookups[key].Profiles.Single().EstimatedRating == 3968 && store.Data.SiteLookups[key].Status.Contains("rating unavailable"),
                "a readable main estimate remains available when the formal mode request fails and its failure remains retryable");
            failRating = false;
            published = true;
            clock.Now += TimeSpan.FromMinutes(31);
            store.Data.SiteLookups[key] = store.Data.SiteLookups[key] with { Checked = DateTime.UnixEpoch };
            count = handler.Requests.Count(path => path == "/player/3128");
            sync.Queue([], ["BlackJoker"], "EU");
            while (await sync.ProcessNextAsync()) { }
            assert(store.Data.SiteLookups[key].Profiles.Single().Rating == 4321
                && store.Data.SiteLookups[key].Profiles.Single().CommanderStats!.SequenceEqual(parsed.CommanderStats!)
                && handler.Requests.Count(path => path == "/player/3128") == count + 1,
                "published commanders mode retains rating priority while its expired main profile refreshes commander statistics");
            await ratings.ProfileEstimateAsync("3128", refresh: true);
            count = handler.Requests.Count;
            bool cacheFailure = false;
            failProfile = true;
            try { await ratings.ProfileEstimateAsync("3128", refresh: true); } catch (InvalidOperationException) { cacheFailure = true; }
            var retained = await ratings.ProfileEstimateAsync("3128");
            assert(cacheFailure && retained.EstimatedRating == 3968 && retained.CommanderStats!.SequenceEqual(parsed.CommanderStats!)
                && retained.ProfileStatsVersion == RatingService.CurrentProfileStatsVersion && handler.Requests.Count == count + 1,
                "explicit failed profile refresh retains the earlier successful HTTP estimate cache");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task IndependentSearchCacheEvidence(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeSearchMergeTests", Guid.NewGuid().ToString());
        try
        {
            foreach (var currentSearch in new double?[] { null, 6500 })
            foreach (var failHttp in new[] { false, true })
            {
                var store = new Store(Path.Combine(root, (currentSearch.HasValue ? "value" : "null") + (failHttp ? "-offline" : "-ready")));
                var now = DateTime.UtcNow;
                const string native = "2-S2-1-55";
                var nameKey = SiteSyncService.NameLookupKey("Merged", "EU");
                var formal = new SiteProfile("50", "Merged", "EU", 4100, now, EstimatedRating: 3968, ProfileChecked: now.AddHours(-1),
                    SearchRating: 6000, SearchGames: 10, SearchWinRate: 50, LastPlayed: now.AddDays(-10), SearchChecked: now.AddMinutes(-20));
                var latestSearch = formal with { Rating = 3000, Checked = now.AddHours(-2), SearchRating = currentSearch,
                    SearchGames = 77, SearchWinRate = 73.3, LastPlayed = now.AddDays(-1), SearchChecked = now.AddMinutes(-1) };
                var otherRegion = latestSearch with { Region = "Americas", SearchRating = 9999, SearchChecked = now.AddMinutes(1) };
                store.SetRegionRating(native, "EU", new(native, 4100, "Linked profile", "fixture", now, "50", Region: "EU", ProfileName: "Merged"));
                void Seed()
                {
                    store.Data.SiteLookups[native] = new(native, "Manual link", now, [formal]);
                    store.Data.SiteLookups[nameKey] = new(nameKey, "Candidates", now.AddMinutes(-5), [latestSearch]);
                    store.Data.SiteLookups["other-region"] = new("other-region", "Candidates", now, [otherRegion]);
                }
                bool HasLatestSearch(SiteProfile profile) => profile.SearchRating == latestSearch.SearchRating
                    && profile.SearchGames == latestSearch.SearchGames && profile.SearchWinRate == latestSearch.SearchWinRate
                    && profile.LastPlayed == latestSearch.LastPlayed && profile.SearchChecked == latestSearch.SearchChecked;
                Seed();
                var resolved = SiteSyncService.ResolveCandidate(store.Data.SiteLookups.Values, "50", "EU");
                assert(resolved.Rating == formal.Rating && resolved.Checked == formal.Checked && HasLatestSearch(resolved),
                    "explicit candidate resolution keeps newest formal evidence and independently merges the newest search tuple including a current null");
                var handler = new SiteHandler(path =>
                {
                    if (failHttp) throw new HttpRequestException("fixture offline");
                    if (path.EndsWith("/ratings")) return "<h1>Ratings of <a href='/player/50'>Merged</a></h1>"
                        + "<th><a href=\"/rating/commanders_3v3\">commanders_3v3</a></th><td>4321</td>";
                    if (path.EndsWith("/games")) return "<h1>Recent games of <a href='/player/50'>Merged</a></h1>";
                    return ProfilePage("50", "3968");
                });
                using var client = new HttpClient(handler);
                var discovery = new SiteSyncService(store, new RatingService(client, TimeSpan.Zero));
                discovery.Queue([native]);
                await discovery.ProcessNextAsync();
                var discovered = store.Data.SiteLookups[native].Profiles.Single();
                assert(handler.Requests.Count == 0 && discovered.Rating == formal.Rating && discovered.Checked == formal.Checked
                    && HasLatestSearch(discovered) && store.ResolveRegionRating(native, "EU").Rating!.Value == 4100,
                    "selected manual discovery groups cached mode evidence independently from newer search metadata without changing its formal rating slot");

                // Start explicit loading from the conflicting caches, not the merged discovery result.
                Seed();
                var explicitSync = new SiteSyncService(store, new RatingService(client, TimeSpan.Zero));
                explicitSync.QueueProfile("50", "EU");
                while (await explicitSync.ProcessNextAsync()) { }
                var duplicates = new[] { store.Data.SiteLookups[native].Profiles.Single(), store.Data.SiteLookups[nameKey].Profiles.Single() };
                assert(duplicates.All(HasLatestSearch) && duplicates.All(profile => profile.Rating == (failHttp ? 4100 : 4321)
                    && profile.EstimatedRating == formal.EstimatedRating)
                    && store.ResolveRegionRating(native, "EU").Rating!.Value == 4100
                    && store.Data.SiteLookups["other-region"].Profiles.Single() == otherRegion,
                    "explicit hydration republishes the newest search null or value across same-region duplicates while preserving manual binding and the other region");
                if (failHttp)
                    assert(duplicates.All(profile => profile.Checked == formal.Checked && profile.ProfileChecked == formal.ProfileChecked)
                        && store.Data.SiteLookups[native].Status.Contains("rating unavailable") && handler.Requests.Count > 0,
                        "failed explicit HTTP hydration preserves formal and main evidence together with the independently newest search tuple");
            }
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task SearchRatingEvidence(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeSearchRatingTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        var clock = new SiteClock();
        double? searchValue = 6000;
        string Candidate(int id) => System.Text.Json.JsonSerializer.Serialize(new
        {
            id = id.ToString(), player_name = "SearchOnly", region = "eu",
            rating = id == 1 ? searchValue : id == 2 ? 0.0 : (double?)null,
            played_last = id == 1 ? "2026-10-10" : "2026-10-09"
        });
        var handler = new SiteHandler(path =>
        {
            if (path.Contains("search_players")) return "{\"players\":[" + string.Join(",", Enumerable.Range(1, 3).Select(Candidate)) + "]}";
            var id = path.Split('/')[2];
            if (path.EndsWith("/ratings")) return $"<h1>Ratings of <a href='/player/{id}'>SearchOnly</a></h1>";
            if (path.EndsWith("/games")) return $"<h1>Recent games of <a href='/player/{id}'>SearchOnly</a></h1>";
            return ProfilePage(id);
        });
        using var client = new HttpClient(handler);
        var sync = new SiteSyncService(store, new RatingService(client, TimeSpan.Zero, clock));
        var key = SiteSyncService.NameLookupKey("SearchOnly", "EU");
        const string native = "2-S2-1-55";
        try
        {
            sync.Queue([], ["SearchOnly"], "EU");
            await sync.ProcessNextAsync();
            var profiles = store.Data.SiteLookups[key].Profiles;
            assert(profiles.Single(profile => profile.ProfileId == "1").SearchRating == 6000
                && profiles.Single(profile => profile.ProfileId == "2").SearchRating == 0
                && profiles.Single(profile => profile.ProfileId == "3").SearchRating == null
                && profiles.All(profile => profile.SearchChecked == clock.Now.UtcDateTime)
                && profiles.All(profile => profile.Rating == null && profile.EstimatedRating == null),
                "search DSR timestamps numeric, explicit zero and unavailable values on every ambiguous candidate without promoting their rating scope");
            while (await sync.ProcessNextAsync()) { }
            assert(store.Data.SiteLookups[key].Profiles.All(profile => profile.Rating == null && profile.EstimatedRating == null)
                && store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1").SearchRating == 6000
                && store.Data.RegionalRatings.Count == 0,
                "a verified absent mode and empty main estimate retain search DSR while creating no formal regional links");

            var roster = Enumerable.Range(1, 6).Select(i => new ReplayPlayer(i == 1 ? native : $"2-S2-1-{100 + i}", $"Player{i}", i <= 3 ? 1 : 2,
                i switch { 1 => "Raynor", 2 => "Kerrigan", 3 => "Artanis", 4 => "Nova", 5 => "Tychus", _ => "Zeratul" },
                i <= 3 ? "Win" : "Loss", 0, 0, 0)).ToList();
            var game = new Match("search-scope-fixture", "fixture", "Direct Strike", "Commanders", DateTime.UnixEpoch, 600, 1, roster);
            store.Data.Matches = [game];
            double? SummaryDelta()
            {
                using var summary = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(store.Summary(), Store.Json));
                var delta = summary.RootElement.GetProperty("ratingChanges").GetProperty(game.Hash).EnumerateArray()
                    .Single(change => change.GetProperty("playerId").GetString() == native).GetProperty("delta");
                return delta.ValueKind == System.Text.Json.JsonValueKind.Number ? delta.GetDouble() : null;
            }
            var baseline = SummaryDelta();
            assert(baseline == null, "an incomplete six-player rating set cannot produce a default-opponent forecast");
            var searchOnly = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1");
            store.Data.SiteLookups[native] = new(native, "Name match", DateTime.UtcNow, [searchOnly]);
            assert(SummaryDelta() == baseline,
                "a unique native lookup with a large generic search DSR leaves actual replay Commanders delta calculations unchanged");
            store.SetRegionRating(native, "EU", new(native, null, "Linked profile", "fixture", DateTime.UnixEpoch, "1", Region: "EU", ProfileName: "SearchOnly"));
            sync.Queue([native]);
            while (await sync.ProcessNextAsync()) { }
            assert(store.ResolveRegionRating(native, "EU").Rating!.Value == null
                && store.Data.SiteLookups[native].Profiles.Single().SearchRating == 6000 && SummaryDelta() == baseline,
                "selected manual profiles retain search DSR for display while their unavailable formal mode slot and replay estimates remain separate");
            store.ClearRegionRating(native, "EU");

            var checkedProfile = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1")
                with { Rating = 3210, EstimatedRating = 3968 };
            store.Data.SiteLookups[key] = store.Data.SiteLookups[key] with { Checked = DateTime.UnixEpoch,
                Profiles = store.Data.SiteLookups[key].Profiles.Select(profile => profile.ProfileId == "1" ? checkedProfile : profile).ToList() };
            searchValue = null;
            clock.Now += TimeSpan.FromMinutes(31);
            sync.Queue([], ["SearchOnly"], "EU");
            await sync.ProcessNextAsync();
            var cleared = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1");
            assert(cleared.SearchRating == null && cleared.Rating == checkedProfile.Rating && cleared.EstimatedRating == checkedProfile.EstimatedRating
                && cleared.ProfileChecked == checkedProfile.ProfileChecked && cleared.ProfileStatsVersion == checkedProfile.ProfileStatsVersion
                && cleared.SearchChecked == clock.Now.UtcDateTime && cleared.SearchChecked > checkedProfile.SearchChecked
                && cleared.Checked == checkedProfile.Checked && cleared.SearchChecked > cleared.Checked,
                "a current explicit null search DSR gets its own newer timestamp while discovery preserves verified mode and main evidence timestamps");
            while (await sync.ProcessNextAsync()) { }
            var beforeZero = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1");
            assert(beforeZero.SearchChecked == cleared.SearchChecked,
                "mode and main hydration preserve the separate search timestamp after an explicit null search response");
            searchValue = 0;
            clock.Now += TimeSpan.FromMinutes(31);
            store.Data.SiteLookups[key] = store.Data.SiteLookups[key] with { Checked = DateTime.UnixEpoch };
            sync.Queue([], ["SearchOnly"], "EU");
            await sync.ProcessNextAsync();
            var zero = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1");
            assert(zero.SearchRating == 0 && zero.Rating == null && zero.EstimatedRating == null
                && zero.SearchChecked == clock.Now.UtcDateTime && zero.SearchChecked > beforeZero.SearchChecked
                && zero.Checked == beforeZero.Checked && zero.SearchChecked > zero.Checked,
                "refreshing an existing candidate independently timestamps explicit search DSR zero without changing either verified rating field or formal checked time");
            while (await sync.ProcessNextAsync()) { }
            assert(store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "1").SearchChecked == zero.SearchChecked,
                "hydrating an explicit search DSR zero retains its search timestamp");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task PriorityCandidates(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikePriorityCandidateTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        string Candidate(int id, string name = "ZEUS", string region = "eu") => System.Text.Json.JsonSerializer.Serialize(new
        {
            id = id.ToString(), player_name = name, region, games = id.ToString(), winrate = "73.3%", rating = "9999",
            played_last = id == 40 ? "2026-10-10" : "2026-10-09"
        });
        var handler = new SiteHandler(path =>
        {
            if (path.Contains("search_players")) return "{\"players\":["
                + string.Join(",", Enumerable.Range(1, 40).Select(id => Candidate(id, id == 40 ? "<Clan> ZEUS" : "ZEUS")))
                + "," + Candidate(41, "ZeusBruce") + "," + Candidate(99, "ZEUS", "na") + "," + Candidate(42, "Name (ZEUS)") + "]}";
            var id = path.Split('/')[2];
            if (path.EndsWith("/ratings")) return $"<h1>Ratings of <a href='/player/{id}'>ZEUS</a></h1>"
                + "<th><a href=\"/rating/commanders_3v3\">commanders_3v3</a></th><td>4321</td>";
            if (path.EndsWith("/games")) return $"<h1>Recent games of <a href='/player/{id}'>ZEUS</a></h1>";
            return ProfilePage(id, "9999", "Rating") + $"<h4><a href='/player/{id}/commanders'>Commanders stats</a></h4>"
                + $"<table><tr><th><a href='/player/{id}/commander/Nova'>Nova</a></th><td>7</td><td>71.4%</td></tr></table>";
        });
        using var client = new HttpClient(handler);
        var sync = new SiteSyncService(store, new RatingService(client, TimeSpan.Zero));
        var key = SiteSyncService.NameLookupKey("ZEUS", "EU");
        try
        {
            var cachedAt = DateTime.UtcNow;
            var legacyAlternate = new SiteProfile("38", "ZEUS", "EU", 4100, cachedAt, EstimatedRating: 3968, ProfileChecked: cachedAt.AddDays(-1));
            var failedAlternate = new SiteProfile("37", "ZEUS", "EU", 4200, cachedAt, EstimatedRating: 4000,
                ProfileChecked: cachedAt.AddMinutes(-1), ProfileAttempted: cachedAt);
            store.Data.SiteLookups["legacy-alternates"] = new("legacy-alternates", "Candidates; profile unavailable", cachedAt,
                [legacyAlternate, failedAlternate]);
            sync.Queue([], ["ZEUS"], "EU");
            await sync.ProcessNextAsync();
            var discovered = store.Data.SiteLookups[key];
            assert(discovered.Profiles.Count == 41 && discovered.Profiles[0].ProfileId == "40" && discovered.Profiles[1].ProfileId == "42"
                && discovered.Profiles.All(profile => profile.ProfileId is not ("41" or "99"))
                && discovered.Profiles[0].LastPlayed == new DateTime(2026, 10, 10, 0, 0, 0, DateTimeKind.Utc)
                && discovered.Profiles[0].SearchGames == 40 && discovered.Profiles[0].SearchWinRate == 73.3,
                "single-word search filters prefix and foreign-region results, preserves clan and legacy names, and ranks activity before game count with percentage metadata");
            assert(discovered.Profiles.All(profile => profile.SearchRating == 9999)
                && discovered.Profiles.Where(profile => profile.ProfileId is not ("38" or "37")).All(profile => profile.Rating == null && profile.EstimatedRating == null),
                "every ambiguous candidate retains generic search DSR separately without treating it as published Commanders or a main-page estimate");
            var discoveredLegacy = discovered.Profiles.Single(profile => profile.ProfileId == "38");
            var discoveredFailure = discovered.Profiles.Single(profile => profile.ProfileId == "37");
            assert(discoveredLegacy.DetailsPending && discoveredLegacy.Rating == legacyAlternate.Rating
                && discoveredLegacy.EstimatedRating == legacyAlternate.EstimatedRating && discoveredLegacy.ProfileChecked == legacyAlternate.ProfileChecked
                && discoveredFailure.DetailsPending && discoveredFailure.Rating == failedAlternate.Rating
                && discoveredFailure.EstimatedRating == failedAlternate.EstimatedRating && discoveredFailure.ProfileAttempted == failedAlternate.ProfileAttempted
                && SiteSyncService.IsLookupFresh(store.Data.SiteLookups["legacy-alternates"], store.Data.SiteHistories, cachedAt),
                "incomplete cached alternates become available for explicit detail loading while preserving scoped values and recent main-failure backoff");
            await sync.ProcessNextAsync();
            assert(store.Data.SiteLookups[key].Profiles[0].Rating == 4321 && handler.Requests[^1] == "/player/40/ratings",
                "the leading candidate's published Commanders mode value appears before its main statistics request");
            while (await sync.ProcessNextAsync()) { }
            var ready = store.Data.SiteLookups[key];
            assert(handler.Requests.Count == 4 && ready.Profiles.Count(profile => !profile.DetailsPending) == 1
                && ready.Profiles[0].CommanderStats!.Single() == new SiteCommanderStat("Nova", 7, 71.4)
                && ready.Profiles[0].EstimatedRating == null && !ready.Status.Contains("rating pending")
                && store.Data.SiteHistories.Keys.SequenceEqual(new[] { "40" }),
                "large same-region lists load only the leading account's mode, main stats and history, never promote generic main rating, and leave alternates for explicit loading");
            sync.Queue([], ["ZEUS"], "EU");
            assert(sync.Snapshot().Queued == 0 && SiteSyncService.IsLookupFresh(ready, store.Data.SiteHistories, DateTime.UtcNow),
                "untouched alternate profiles do not force repeated default migration or loading loops");
            var alternate = ready.Profiles.Single(profile => profile.ProfileId == "39");
            store.Data.SiteLookups["alias"] = new("alias", "Candidates", DateTime.UtcNow.AddMinutes(-1), [alternate]);
            sync.QueueProfile("39", "EU");
            while (await sync.ProcessNextAsync()) { }
            var loaded = store.Data.SiteLookups[key].Profiles.Single(profile => profile.ProfileId == "39");
            assert(handler.Requests.TakeLast(3).SequenceEqual(new[] { "/player/39/ratings", "/player/39", "/player/39/games" })
                && loaded.Rating == 4321 && loaded.CommanderStats!.Count == 1 && !loaded.DetailsPending
                && store.Data.SiteLookups["alias"].Profiles.Single() == loaded && store.Data.SiteHistories["39"].Status == "Ready",
                "explicit alternate loading hydrates mode, main stats and history in order and republishes only that known regional profile across lookup caches");
            var before = handler.Requests.Count;
            sync.QueueProfile("39", "EU");
            assert(sync.Snapshot().Queued == 0 && handler.Requests.Count == before && store.Data.RegionalRatings.Count == 0
                && store.Data.Matches.Count == 0 && store.Data.Marks.Count == 0,
                "a fresh explicitly loaded alternate reuses its cache and never becomes a native account, manual rating link, replay or mark");
            sync.Queue([], ["ZEUS"]);
            while (await sync.ProcessNextAsync()) { }
            var both = store.Data.SiteLookups[SiteSyncService.NameLookupKey("ZEUS")];
            assert(both.Profiles.Count(profile => !profile.DetailsPending && profile.Region == "Americas") == 1
                && handler.Requests.Count(path => path == "/player/99/ratings") == 1
                && handler.Requests.Count(path => path.EndsWith("/ratings")) == 3,
                "an unknown-region lookup hydrates only each region's leading account while retaining independent regional identities");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task ProgressiveLookups(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeProgressiveSiteTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        string Player(string id, string name) => $"{{\"id\":\"{id}\",\"player_name\":\"{name}\",\"region\":\"eu\",\"rating\":9999}}";
        string RatingPage(string id) => $"<h1>Ratings of <a href='/player/{id}'>Known</a></h1><th><a href=\"/rating/commanders_3v3\">commanders_3v3</a></th><td>3210</td>";
        bool failRating = false, ownHistory = false, absentRating = false;
        var handler = new SiteHandler(path =>
        {
            if (path.Contains("search_players"))
            {
                var queryName = path.Contains("unrated") ? "Unrated" : path.Contains("cancelled") ? "Cancelled"
                    : path.Contains("newname") ? "NewName" : path.Contains("interruptown") ? "InterruptOwn" : "Unique";
                var players = path.EndsWith("@na", StringComparison.Ordinal) ? "" : path.Contains("crowded")
                    ? string.Join(",", Enumerable.Range(1, 9).Select(i => Player(i.ToString(), "Crowded"))) : Player(path.Contains("unrated") ? "21" : path.Contains("cancelled") ? "22" : "20", queryName);
                return "{\"players\":[" + players + "]}";
            }
            var id = path.Split('/')[2];
            if (path.EndsWith("/ratings"))
            {
                if (failRating) throw new HttpRequestException("fixture offline");
                return absentRating ? $"<h1>Ratings of <a href='/player/{id}'>Known</a></h1><p>Upload replays to get ratings</p>" : RatingPage(id);
            }
            if (path == "/player/" + id) return ProfilePage(id);
            var rows = ownHistory && path.EndsWith("/games") ? string.Concat(Enumerable.Range(1, 6).Select(i =>
                $"<tr><th><a href=\"/game/{100 + i}\">2026-10-06 18:50:{i:00}</a></th><td>...</td><td>3v3 commanders</td><td>raynor</td><td>1</td><td>1</td><td>1</td><td>10 min</td></tr>")) : "";
            return $"<h1>Recent games of <a href='/player/{id}'>Unique</a></h1>" + rows;
        });
        using var client = new HttpClient(handler);
        var clock = new SiteClock();
        var sync = new SiteSyncService(store, new RatingService(client, TimeSpan.Zero, clock));
        try
        {
            sync.Queue([], ["Crowded", "Unique"]);
            await sync.ProcessNextAsync();
            var crowded = store.Data.SiteLookups["name:crowded"];
            assert(handler.Requests.Count == 2 && crowded.Profiles.Count == 9 && crowded.Status.StartsWith("Candidates")
                && crowded.Status.Contains("rating pending") && crowded.Profiles.All(p => p.Rating == null && p.SearchRating == 9999),
                "all nine same-name candidates publish after two regional searches with separate generic DSR, before any scoped rating page");
            await sync.ProcessNextAsync();
            assert(handler.Requests.Count == 4 && store.Data.SiteLookups["name:unique"].Profiles.Single().ProfileId == "20",
                "next visible name discovery precedes all irrelevant ambiguous profile ratings");
            sync.Queue([], ["Crowded", "Unique"]);
            assert(sync.Snapshot().Queued == 2, "polling pending lookups deduplicates their queued continuations");
            var beforeTransient = store.Snapshot();
            var durableBefore = File.ReadAllText(Path.Combine(root, "library.json"));
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1] == "/player/20/ratings" && store.Data.SiteLookups["name:unique"].Profiles.Single().Rating == 3210
                && store.Data.SiteLookups["name:unique"].Status.Contains("rating pending") && !store.Data.SiteHistories.ContainsKey("20"),
                "unique scoped rating publishes before history and before same-name candidate rating pages");
            var afterTransient = store.Snapshot(beforeTransient.Version);
            assert(afterTransient.Version != beforeTransient.Version && afterTransient.Library != null
                && File.ReadAllText(Path.Combine(root, "library.json")) == durableBefore,
                "transient rating publication advances the library snapshot without rewriting the durable replay library");
            for (int i = 0; i < 3; i++) await sync.ProcessNextAsync();
            assert(handler.Requests[^1] == "/player/1" && store.Data.SiteLookups["name:crowded"].Profiles.Count(p => p.Rating == 3210) == 1
                && store.Data.SiteLookups["name:crowded"].Profiles.Count(p => p.DetailsPending) == 8
                && !store.Data.SiteLookups["name:crowded"].Status.Contains("rating pending")
                && !store.Data.SiteHistories.ContainsKey("20"), "only the leading same-name candidate hydrates before unrelated history, with untouched alternates ready for explicit loading");
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1] == "/player/20/games" && store.Data.SiteHistories["20"].Status == "Ready",
                "unique profile history completes after visible candidate ratings");
            int beforeCache = handler.Requests.Count;
            int queuedBeforeCache = sync.Snapshot().Queued;
            sync.Queue([], ["Unique"]);
            assert(sync.Snapshot().Queued == queuedBeforeCache && handler.Requests.Count == beforeCache,
                "completed fresh unique lookup adds no queue work or site requests while another candidate's history remains pending");
            sync.Queue([], ["NewName"]);
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1].Contains("search_players") && store.Data.SiteLookups.ContainsKey("name:newname"),
                "a new lobby name interrupts remaining ambiguous hydration at the next serial request boundary");
            while (await sync.ProcessNextAsync()) { }
            assert(store.Data.SiteHistories.Keys.All(id => id is "20" or "1") && store.Data.RegionalRatings.Count == 0,
                "same-region ambiguous names load only priority history without a guessed native identity or manual rating link");

            var old = store.Data.SiteLookups["name:unique"] with { Checked = DateTime.UnixEpoch };
            store.Data.SiteLookups["name:unique"] = old;
            clock.Now += TimeSpan.FromMinutes(31);
            sync.Queue([], ["Unique"]);
            await sync.ProcessNextAsync();
            failRating = true;
            await sync.ProcessNextAsync();
            await sync.ProcessNextAsync();
            await sync.ProcessNextAsync();
            var offline = store.Data.SiteLookups["name:unique"];
            assert(offline.Profiles.Single().Rating == 3210 && offline.Status.Contains("rating unavailable") && store.Data.SiteHistories["20"].Status == "Ready",
                "offline rating refresh preserves previously scoped rating, verified candidate and cached history");
            failRating = false;

            const string native = "2-S2-1-99";
            store.SetRegionRating(native, "EU", new(native, 1000, "Linked profile", "fixture", DateTime.UnixEpoch, "20", Region: "EU", ProfileName: "Unique"));
            sync.Queue([native]);
            beforeCache = handler.Requests.Count;
            await sync.ProcessNextAsync();
            assert(handler.Requests.Count == beforeCache && store.Data.SiteLookups[native].Status.Contains("rating pending"),
                "manual link discovery publishes cached selected profile immediately without a network request");
            await sync.ProcessNextAsync();
            assert(store.ResolveRegionRating(native, "EU").Rating!.Value == 3210 && store.Data.SiteLookups[native].Status.Contains("history pending"),
                "selected regional rating refresh publishes before its deferred history");
            var edited = store.ResolveRegionRating(native, "EU").Rating! with { ProfileId = "30", Value = 7000 };
            store.SetRegionRating(native, "EU", edited);
            beforeCache = handler.Requests.Count;
            await sync.ProcessNextAsync();
            assert(handler.Requests.Count == beforeCache && store.ResolveRegionRating(native, "EU").Rating == edited && !store.Data.SiteLookups.ContainsKey(native),
                "manual profile edit invalidates stale continuation without overwriting the new slot or fetching old history");

            store.Data.Settings.SelfIds = [native];
            store.SetRegionRating(native, "EU", edited with { ProfileId = "20", ProfileName = "Unique" });
            store.Data.SiteHistories.Remove("20");
            ownHistory = true;
            sync.Queue([native]);
            await sync.ProcessNextAsync(); // Cached linked identity.
            await sync.ProcessNextAsync(); // Mode rating.
            await sync.ProcessNextAsync(); // History.
            var ownLookup = store.Data.SiteLookups[native];
            assert(ownLookup.Profiles.Single().Rating == 3210 && store.Data.SiteHistories["20"].Games.Count == 6
                && handler.Requests[^1] == "/player/20/games", "own profile rating and bounded history publish before six own game evidence pages");
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1] == "/game/101", "own game evidence makes one serial request per queue step");
            sync.Queue([], ["InterruptOwn"]);
            await sync.ProcessNextAsync();
            assert(handler.Requests[^1].Contains("search_players") && store.Data.SiteLookups.ContainsKey("name:interruptown"),
                "new visible roster discovery preempts the five remaining own-game evidence requests");
            while (await sync.ProcessNextAsync()) { }
            assert(handler.Requests.Count(p => p.StartsWith("/game/")) == 6, "deferred own game work retains its six-page bound and completes after discovery");
            ownHistory = false;
            absentRating = true;
            sync.Queue([], ["Unrated"]);
            await sync.ProcessNextAsync();
            await sync.ProcessNextAsync();
            await sync.ProcessNextAsync();
            assert(store.Data.SiteLookups["name:unrated"].Profiles.Single().Rating == null
                && store.Data.SiteLookups["name:unrated"].Profiles.Single().EstimatedRating == null
                && store.Data.SiteLookups["name:unrated"].Profiles.Single().ProfileChecked.HasValue
                && !store.Data.SiteLookups["name:unrated"].Status.Contains("rating pending"),
                "verified profile without mode rows completes with unavailable numeric rating, never search DSR");
            while (await sync.ProcessNextAsync()) { }
            absentRating = false;

            sync.Queue([], ["Cancelled"]);
            await sync.ProcessNextAsync();
            var pending = store.Data.SiteLookups["name:cancelled"];
            using var cancelled = new CancellationTokenSource();
            cancelled.Cancel();
            bool stopped = false;
            try { await sync.ProcessNextAsync(cancelled.Token); } catch (OperationCanceledException) { stopped = true; }
            assert(stopped && store.Data.SiteLookups["name:cancelled"] == pending && !SiteSyncService.IsLookupFresh(pending, store.Data.SiteHistories, DateTime.UtcNow),
                "cancelled hydration preserves published candidates and leaves interrupted pending lookup retryable");
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task RegionalVisibleLookups(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeRegionalSiteTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        var clock = new SiteClock();
        bool failRating = false;
        string Player(int id, string region, string name = "Twin") => $"{{\"id\":\"{id}\",\"player_name\":\"{name}\",\"region\":\"{region}\",\"rating\":9999,"
            + $"\"played_last\":\"{(name == "Dense" && id == SiteSyncService.CandidateLimit + 2 ? "2026-10-10" : "2026-10-01")}\"}}";
        var handler = new SiteHandler(path =>
        {
            if (path.Contains("search_players")) return "{\"players\":[" + (path.Contains("dense")
                ? string.Join(",", Enumerable.Range(1, SiteSyncService.CandidateLimit + 2).Select(id => Player(id, "eu", "Dense")))
                : path.EndsWith("@na", StringComparison.Ordinal) ? Player(3, "na") : Player(1, "eu") + "," + Player(2, "eu")) + "]}";
            var id = path.Split('/')[2];
            if (path.EndsWith("/ratings"))
            {
                if (failRating) throw new HttpRequestException("fixture offline");
                return $"<h1>Ratings of <a href='/player/{id}'>Twin</a></h1><th><a href=\"/rating/commanders_3v3\">commanders_3v3</a></th><td>4321</td>";
            }
            if (path == "/player/" + id) return ProfilePage(id);
            return $"<h1>Recent games of <a href='/player/{id}'>Twin</a></h1>";
        });
        using var client = new HttpClient(handler);
        var ratings = new RatingService(client, TimeSpan.Zero, clock);
        var sync = new SiteSyncService(store, ratings);
        try
        {
            const string native = "2-S2-1-55";
            store.Data.SiteLookups[native] = new(native, "Name match", DateTime.UtcNow, [new("1", "Twin", "EU", 4321, DateTime.UtcNow)]);
            sync.Queue([], ["<Clan> Twin"], "EU");
            await sync.ProcessNextAsync();
            var eu = store.Data.SiteLookups[SiteSyncService.NameLookupKey("Twin", "EU")];
            assert(handler.Requests.Count == 1 && handler.Requests[0].EndsWith("@eu", StringComparison.Ordinal)
                && eu.Profiles.Count == 2 && eu.Profiles[0].Rating == 4321 && eu.Profiles[1].Rating == null,
                "current-region name discovery uses one search and publishes earlier verified mode values while new accounts hydrate");
            sync.Queue([], ["Twin"], "Americas");
            await sync.ProcessNextAsync();
            var us = store.Data.SiteLookups[SiteSyncService.NameLookupKey("Twin", "Americas")];
            assert(us.Profiles.Single().ProfileId == "3" && us.Profiles.Single().Rating == null && eu.Profiles.All(p => p.Region == "EU")
                && handler.Requests.Count == 2, "same nickname in different regions has separate candidates and independent lookup caches");
            while (await sync.ProcessNextAsync()) { }
            int requests = handler.Requests.Count;
            assert(await ratings.CommanderRatingAsync("1") == 4321 && handler.Requests.Count == requests,
                "reused mode profile gets its verified cached value without another page request");
            failRating = true;
            bool offline = false;
            try { await ratings.CommanderRatingAsync("1", refresh: true); } catch (InvalidOperationException) { offline = true; }
            assert(offline && await ratings.CommanderRatingAsync("1") == 4321, "an explicit failed refresh keeps earlier verified mode evidence available");
            failRating = false;
            sync.Queue(Enumerable.Range(1, 13).Select(id => $"2-S2-1-{100 + id}"), Enumerable.Range(1, 7).Select(id => "Visible" + id), "EU");
            assert(sync.Snapshot().Queued == 20, "visible batch retains more than twelve native IDs and more than six displayed names");
            while (await sync.ProcessNextAsync()) { }
            assert(Enumerable.Range(1, 7).All(id => store.Data.SiteLookups.ContainsKey(SiteSyncService.NameLookupKey("Visible" + id, "EU"))),
                "every displayed name in the bounded batch receives a site lookup");
            sync.Queue([], ["Dense"], "EU");
            await sync.ProcessNextAsync();
            var dense = store.Data.SiteLookups[SiteSyncService.NameLookupKey("Dense", "EU")];
            assert(dense.Profiles.Count == SiteSyncService.CandidateLimit && dense.Status.Contains("site returned 130")
                && dense.Profiles[0].ProfileId == "130",
                "pathological same-name sets sort all results by activity before retaining 128 profiles and explicitly disclose truncation");
            assert(store.Data.RegionalRatings.Count == 0 && store.Data.Matches.Count == 0 && store.Data.Marks.Count == 0,
                "regional candidate discovery never invents a native identity, manual link, replay or private mark");
        }
        finally { Directory.Delete(root, true); }
    }

    private static void DownloadedFixture(Action<bool, string> assert)
    {
        var root = AppContext.BaseDirectory;
        var gamePath = Path.Combine(root, "verification", "ds-game-3637491.html");
        var historyPath = Path.Combine(root, "verification", "ds-games-8713.html");
        var libraryPath = Path.Combine(root, "data", "library.json");
        if (!File.Exists(gamePath) || !File.Exists(historyPath) || !File.Exists(libraryPath)) return;
        var game = SiteSyncService.ParseGame("3637491", File.ReadAllText(gamePath));
        var history = SiteSyncService.ParseRecentGames(File.ReadAllText(historyPath)).Single(g => g.GameId == "3637491");
        assert(game.Players.Count == 6 && game.Seconds == 1227 && game.Players.All(p => p.Delta == null), "downloaded actual site game retains all six players and pending cells");
        using var library = System.Text.Json.JsonDocument.Parse(File.ReadAllText(libraryPath));
        var replayJson = library.RootElement.GetProperty("matches").EnumerateArray().FirstOrDefault(m => m.GetProperty("hash").GetString() == "6083D338277D2618059F835B0828DE8CA30F8B0F43D78BCB6285A11EF16CCE7B");
        if (replayJson.ValueKind == System.Text.Json.JsonValueKind.Undefined) return;
        var replay = System.Text.Json.JsonSerializer.Deserialize<Match>(replayJson.GetRawText(), Store.Json)!;
        assert(SiteSyncService.RecentMatches(replay, replay.Players.Single(p => p.Id == "2-S2-1-7408040"), history), "actual imported replay and downloaded history match despite parser clock precision");
        assert(SiteSyncService.VerifyGame(replay, history, game, "2-S2-1-7408040", "8713")?.Count == 0, "actual downloaded six-player game verifies against imported replay while pending cells remain unconfirmed");
    }

    private static void StoreSlots(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeSiteSlotTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        try
        {
            const string eu = "2-S2-1-10", us = "1-S2-1-20", extra = "2-S2-1-30";
            store.Data.Settings.SelfIds = [eu, us];
            OwnAccountGroup Group(bool trusted = true, bool third = false) => new("fixture-group", "123", third
                ? [new(eu, "EU"), new(us, "Americas"), new(extra, "EU")] : [new(eu, "EU"), new(us, "Americas")], "fixture", "linked", trusted, []);
            store.Data.OwnAccountGroups = [Group()];
            Rating Link(string id, string region, double? value, string profile) => new(id, value, "Linked profile", "fixture", DateTime.UnixEpoch, profile, Region: region, ProfileName: "Fixture");
            var earlierEu = Link(us, "EU", 3000, "111");
            var nativeUs = Link(us, "Americas", 7000, "222");
            store.SetRegionRating(us, "EU", earlierEu);
            store.SetRegionRating(us, "Americas", nativeUs);
            assert(store.ResolveRegionRating(eu, "EU") == new RegionalRatingSlot(us, earlierEu)
                && store.ResolveRegionRating(eu, "Americas") == new RegionalRatingSlot(us, nativeUs), "trusted own accounts resolve each region from its original earlier-link storage slot");
            SiteLookup Cached(string id, string region, double value) => new(id, "Manual link", DateTime.UtcNow, [new("333", "Cached", region, value, DateTime.UtcNow)]);
            var usCache = Cached(us, "Americas", 7000);
            store.Data.SiteLookups[eu] = Cached(eu, "EU", 2000);
            store.Data.SiteLookups[us] = usCache;
            var roster = Enumerable.Range(1, 6).Select(i => new ReplayPlayer(i == 1 ? eu : $"2-S2-1-{100 + i}", $"Player{i}", i <= 3 ? 1 : 2,
                i switch { 1 => "Raynor", 2 => "Kerrigan", 3 => "Artanis", 4 => "Nova", 5 => "Tychus", _ => "Zeratul" }, i <= 3 ? "Win" : "Loss", 0, 0, 0)).ToList();
            var game = new Match("slot-fixture", "fixture", "Direct Strike", "Commanders", DateTime.UnixEpoch, 600, 1, roster);
            foreach (var player in roster.Skip(1)) store.Data.SiteLookups[player.Id] = Cached(player.Id, "EU", 2000);
            store.Data.Matches = [game];
            RatingChange SummaryChange()
            {
                using var summary = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(store.Summary(), Store.Json));
                return summary.RootElement.GetProperty("ratingChanges").GetProperty(game.Hash).EnumerateArray()
                    .Where(c => c.GetProperty("playerId").GetString() == eu).Select(c => System.Text.Json.JsonSerializer.Deserialize<RatingChange>(c.GetRawText(), Store.Json)!).Single();
            }
            assert(SummaryChange().Delta == 35, "replay estimator uses preserved manual native-region link over an automatic value and foreign region rating");
            var canonical = Link(eu, "EU", 3500, "444");
            store.SetRegionRating(eu, "EU", canonical);
            assert(store.ResolveRegionRating(us, "EU") == new RegionalRatingSlot(eu, canonical) && !store.Data.SiteLookups.ContainsKey(eu)
                && store.Data.SiteLookups[us] == usCache && store.GetRegionRatings(us).Americas == nativeUs, "canonical native manual link takes priority and invalidates only its own region cache");
            store.Data.SiteLookups[eu] = Cached(eu, "EU", 3500);
            store.ClearRegionRating(eu, "EU");
            assert(store.ResolveRegionRating(eu, "EU") == new RegionalRatingSlot(us, earlierEu) && !store.Data.SiteLookups.ContainsKey(eu)
                && store.Data.SiteLookups[us] == usCache, "unlinking canonical profile falls back to preserved sibling manual slot without reviving its cached profile");
            store.Data.SiteLookups[eu] = Cached(eu, "EU", 3000);
            var captured = store.ResolveRegionRating(eu, "EU");
            var refreshed = earlierEu with { Value = 3200, Checked = DateTime.UtcNow };
            store.SetRegionRating(captured.Id, "EU", refreshed);
            assert(store.ResolveRegionRating(eu, "EU") == new RegionalRatingSlot(us, refreshed) && store.ResolveRegionRating(eu, "EU") != captured
                && !store.Data.SiteLookups.ContainsKey(eu) && store.GetRegionRatings(us).Americas == nativeUs && store.Data.SiteLookups[us] == usCache,
                "refreshing original earlier-link slot changes its concurrency snapshot and clears canonical sibling cache while preserving the other region");
            store.SetRegionRating(us, "EU", refreshed with { Value = null });
            store.Data.SiteLookups[eu] = Cached(eu, "EU", 9000);
            assert(SummaryChange().Delta == null, "explicit manual profile with no mode rating keeps precedence without fabricating a starting rating");
            store.Data.MatchRatings[game.Hash] = [new(eu, 0, "confirmed", "Site main DSR", "555")];
            assert(SummaryChange().Kind == "confirmed" && SummaryChange().Delta == 0 && SummaryChange().Scope == "main_current"
                && store.Data.MatchRatings[game.Hash][0].Kind == "confirmed" && store.Data.MatchRatings[game.Hash][0].Delta == 0,
                "confirmed overall site zero is shown with its own scope and remains unchanged in storage");
            store.ClearRegionRating(us, "EU");
            assert(store.ResolveRegionRating(eu, "EU").Rating == null && !store.Data.SiteLookups.ContainsKey(eu)
                && store.GetRegionRatings(us).Americas == nativeUs && store.Data.SiteLookups[us] == usCache, "unlinking a preserved earlier link invalidates native automatic fallback and preserves the opposite slot");

            store.SetRegionRating(us, "EU", earlierEu);
            store.Data.OwnAccountGroups = [Group(false)];
            assert(store.ResolveRegionRating(eu, "EU").Rating == null, "untrusted own groups never share a sibling manual rating");
            store.Data.OwnAccountGroups = [Group()];
            store.Data.Settings.SelfIds = [eu];
            assert(store.ResolveRegionRating(eu, "EU").Rating == null, "a sibling outside the selected self identities cannot supply an earlier rating link");
            store.Data.Settings.SelfIds = [eu, us, extra];
            store.Data.OwnAccountGroups = [Group(third: true)];
            var second = Link(extra, "EU", 4000, "666");
            store.SetRegionRating(extra, "EU", second);
            assert(store.ResolveRegionRating(us, "EU") == new RegionalRatingSlot(us, earlierEu) && store.ResolveRegionRating(eu, "EU").Rating == null,
                "requesting identity keeps its manual slot while multiple preserved sibling links remain ambiguous");
        }
        finally { Directory.Delete(root, true); }
    }
}
