using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class SiteHistoryTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var selected = new SiteProfile("100", "Known", "EU", null, DateTime.UtcNow);
        var candidateLookup = new SiteLookup("name:known", "Candidates", DateTime.UtcNow, [selected]);
        assert(SiteSyncService.ResolveCandidate([candidateLookup], "100", "EU") == selected, "explicit site selection resolves only a cached regional candidate");
        foreach (var candidate in new[] { ("100", "Americas"), ("200", "EU"), ("2-S2-1-100", "EU"), ("100", "Other") })
        {
            bool rejected = false;
            try { SiteSyncService.ResolveCandidate([candidateLookup], candidate.Item1, candidate.Item2); } catch (ArgumentException) { rejected = true; }
            assert(rejected, "site selection rejects unknown or cross-region identity: " + candidate);
        }
        const string stamp = "2026-10-07 17:41:58";
        string Row(string id = "10", string signal = "text-success", string delta = "...", string mode = "3v3 commanders") =>
            $"<tr><th><a class='{signal}' href='/game/{id}'>{stamp}</a></th><td>7000 <span class='text-danger'>{delta}</span></td><td>{mode}</td><td>han &amp; horner</td><td>30</td><td>3</td><td>4</td><td>15 min</td></tr>";
        var recent = SiteSyncService.ParseRecentGames(Row() + Row("11", "text-danger", "+8") + Row("12", "text-muted", "-4")
            + Row("13", "text-warning", "+9") + Row("14", "unrelated", "-7") + Row("15", "text-success text-danger", "0"));
        assert(recent.Select(g => g.Result).SequenceEqual(new[] { "Win", "Loss", "Unknown", "Unknown", "Unknown", "Unknown" })
            && recent[0].Delta == null && recent[1].Delta == 8, "site history outcomes use game-link colours independently of pending or contrary numeric deltas");
        assert(recent[0].Commander == "hanhorner", "online histories share the replay commander spelling normalization");
        assert(SiteSyncService.ParseRecentGames(Row() + Row() + Row("11", mode: "2v2 commanders") + Row("12", mode: "3v3 standard")
            + Row("13", mode: "3v3 brawl commanders")).Count == 1, "online history accepts only exact 3v3 commanders and counts each game ID once");
        assert(SiteSyncService.ParseRecentGames(string.Concat(Enumerable.Range(1, 105).Select(i => Row(i.ToString()) + Row(i.ToString())))).Count == 100,
            "history duplicates never consume the one hundred unique game bound");
        var profile = new SiteProfile("8713", "TKnight", "EU", 2000, DateTime.UtcNow,
            ProfileChecked: DateTime.UtcNow, ProfileStatsVersion: RatingService.CurrentProfileStatsVersion);
        string Header(string id = "8713", string name = "&lt;Expend&gt; TKnight") => $"<h1>Recent games of <a href='/player/{id}'>{name}</a></h1>";
        var history = SiteSyncService.ParseHistory(profile, Header() + Row());
        assert(history.ProfileId == "8713" && history.Region == "EU" && history.Status == "Ready" && history.Games.Count == 1,
            "history validates the actual numeric site profile header without fabricating a native SC2 handle");
        bool Rejected(string html)
        {
            try { SiteSyncService.ParseHistory(profile, html); return false; }
            catch (InvalidDataException) { return true; }
        }
        assert(Rejected(Header("123")) && Rejected(Header(name: " ")) && Rejected(Row()),
            "redirected numeric profiles, empty names and missing history headers cannot attach online history");
        var renamed = SiteSyncService.ParseHistory(profile, Header(name: "NewName") + Row());
        assert(renamed.ProfileId == profile.ProfileId && renamed.Name == "NewName" && renamed.Games.Count == 1,
            "same numeric site profile retains game history across a nickname change");
        assert(SiteSyncService.ParseHistory(profile with { Name = "NewName (TKnight)" }, Header(name: "NewName")).Games.Count == 0,
            "an alias-bearing search label and a valid empty history preserve stable website identity");
        var lookup = new SiteLookup("2-S2-1-1", "Name match", DateTime.UtcNow, [profile]);
        var histories = new Dictionary<string, SiteHistory>();
        assert(!SiteSyncService.IsLookupFresh(lookup, histories, DateTime.UtcNow), "legacy rating caches refresh when the newly required history is absent");
        histories[profile.ProfileId] = history;
        var batchHistory = Enumerable.Range(1, 9).Select(n => new SiteRecentGame(n.ToString(), DateTime.UtcNow.Date.AddMinutes(10 * n), "3v3 commanders", "raynor", 10, null, "Win")).Reverse().ToList();
        var batchLocal = batchHistory.Take(6).Select(g => new Match("local-" + g.GameId, "", "", "Commanders", g.Time, 600, 1,
            [new ReplayPlayer("2-S2-1-1", "Me", 1, "Raynor", "Win", 0, 0, 0)])).ToArray();
        assert(SiteSyncService.HistoryRequests(batchLocal, batchHistory, "2-S2-1-1").Take(6).Select(g => g.GameId).SequenceEqual(new[] { "9", "8", "7", "3", "2", "1" }),
            "pending local rating checks leave three full-page slots for previously missing site matchup games");
        assert(SiteSyncService.IsLookupFresh(lookup, histories, DateTime.UtcNow), "a current unique lookup reuses its bounded history cache");
        assert(SiteSyncService.IsLookupFresh(lookup with { Status = "Ambiguous", Profiles = [profile, profile with { ProfileId = "25627", DetailsPending = true }] }, histories, DateTime.UtcNow),
            "ambiguous native names only demand the priority account history, keeping alternates on demand");
        var failed = SiteHistoryCache.Failure(profile, history, "offline");
        assert(failed.Games.SequenceEqual(history.Games) && failed.Status.StartsWith("Error:") && !ReferenceEquals(failed.Games, history.Games),
            "failed history refresh retains prior games in a separate cached list");
        histories[profile.ProfileId] = failed;
        assert(SiteSyncService.IsLookupFresh(lookup, histories, failed.Checked.AddMinutes(4))
            && !SiteSyncService.IsLookupFresh(lookup, histories, failed.Checked.AddMinutes(6)), "history failure retries after five minutes while keeping offline evidence");

        string Player(int i, string signal, string delta = "...") => $"<tr><td class='race-portrait'><a title='by the moment of this game {stamp}' href='/player/{i}/commander/raynor'></a></td>"
            + $"<td class='player-data'><div class='player-name'><a href='/player/{i}'>Player{i}</a></div><span class='text-danger'>unrelated highlight</span></td>"
            + $"<td class='text-right'><span>7000</span><span class='{signal}'>{delta}</span></td></tr>";
        string Game(string loser = "text-danger", string mode = "commanders") => $"<h1>Game #10</h1><h6>mode</h6><h3><a href='/mode/{mode}'>{mode}</a></h3>"
            + $"<h6>duration</h6><h3>15:16</h3><table>{Player(1, "text-success")}{Player(2, "text-success")}{Player(3, "text-success")}</table>"
            + $"<table>{Player(4, loser)}{Player(5, "text-danger")}{Player(6, "text-muted cursor-tooltip", "-7")}</table>";
        var game = SiteSyncService.ParseGame("10", Game());
        assert(SiteSyncService.IsCacheableGame(game) && game.Players.Select(p => p.Result).SequenceEqual(new[] { "Win", "Win", "Win", "Loss", "Loss", "Unknown" })
            && game.Players.Take(5).All(p => p.Delta == null), "six-player game cache accepts consistent explicit team outcomes with pending deltas and an unknown leaver");
        assert(!SiteSyncService.IsCacheableGame(SiteSyncService.ParseGame("10", Game("text-success")))
            && !SiteSyncService.IsCacheableGame(game with { Players = game.Players.Select(p => p with { Result = "Unknown" }).ToList() }),
            "contradictory team signals or entirely unknown outcomes cannot become matchup evidence");
        assert(!SiteSyncService.IsCacheableGame(SiteSyncService.ParseGame("999", Game()))
            && !SiteSyncService.IsCacheableGame(SiteSyncService.ParseGame("10", Game(mode: "standard") + "<a href='/mode/commanders'>unrelated navigation</a>"))
            && !SiteSyncService.IsCacheableGame(game with { Players = [.. game.Players.Take(5), game.Players[0]] })
            && !SiteSyncService.IsCacheableGame(game with { Seconds = null }), "site game caching rejects wrong IDs wrong actual modes duplicate profiles and missing duration");
        var legacy = JsonSerializer.Deserialize<SiteGamePlayer>("{\"profileId\":\"1\",\"name\":\"Player\",\"commander\":\"raynor\",\"team\":0,\"delta\":5}", Store.Json);
        assert(legacy?.Result == "Unknown", "old game player records deserialize with unknown outcome rather than guessing from delta");

        var data = new Database();
        data.Settings.SelfIds = [lookup.PlayerId];
        data.SiteLookups[lookup.PlayerId] = lookup with { Checked = DateTime.UnixEpoch };
        data.SiteHistories[profile.ProfileId] = history with { Checked = DateTime.UnixEpoch };
        for (int i = 1; i <= 505; i++)
        {
            var key = "name:fixture" + i;
            data.SiteLookups[key] = new(key, "Candidates", DateTime.UnixEpoch.AddDays(i), []);
            data.SiteHistories[i.ToString()] = history with { ProfileId = i.ToString(), Checked = DateTime.UnixEpoch.AddDays(i) };
            data.SiteGames[i.ToString()] = game with { GameId = i.ToString(), Time = DateTime.UnixEpoch.AddDays(i) };
        }
        SiteHistoryCache.Trim(data, "name:fixture1");
        assert(data.SiteLookups.Count == 500 && data.SiteHistories.Count == 500 && data.SiteGames.Count == 120
            && data.SiteLookups.ContainsKey(lookup.PlayerId) && data.SiteLookups.ContainsKey("name:fixture1") && data.SiteHistories.ContainsKey(profile.ProfileId)
            && data.SiteGames.ContainsKey("505") && !data.SiteGames.ContainsKey("1"), "online caches stay bounded and protect current or selected own profiles before evicting oldest evidence");
    }
}
