using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class RatingChangesTests
{
    internal static void Run(Action<bool, string> assert)
    {
        // Interleaving checks public output order and each team's independent position order.
        var players = new List<ReplayPlayer>
        {
            new("a", "A", 1, "Raynor", "Win", 0, 0, 0), new("d", "D", 2, "Nova", "Loss", 0, 0, 0),
            new("b", "B", 1, "Kerrigan", "Win", 0, 0, 0), new("e", "E", 2, "Tychus", "Loss", 0, 0, 0),
            new("c", "C", 1, "Artanis", "Win", 0, 0, 0), new("f", "F", 2, "Zeratul", "Loss", 0, 0, 0)
        };
        var match = new Match("rating-fixture", "fixture", "Direct Strike", "Commanders", DateTime.UnixEpoch, 600, 1, players);
        Dictionary<string, RatingBasis> Ratings(double first = 2000, double second = 2000, int? games = 25) => players.ToDictionary(p => p.Id, p => new RatingBasis(p.Team == 1 ? first : second, games));
        IReadOnlyList<RatingChange> Estimate(Match? game = null, IReadOnlyDictionary<string, RatingBasis>? ratings = null) => RatingChangeEstimator.Estimate(game ?? match, ratings ?? Ratings());
        double? Delta(IReadOnlyList<RatingChange> changes, string id) => changes.Single(c => c.PlayerId == id).Delta;
        bool AllUnavailable(IReadOnlyList<RatingChange> changes) => changes.All(c => c.Kind == "unavailable" && c.Delta == null);

        var equal = Estimate();
        assert(equal.All(c => c.Kind == "estimated" && c.SiteGameId == null) && Delta(equal, "a") == 50 && Delta(equal, "d") == -50, "equal established teams estimate +50/-50 without a site confirmation");
        assert(equal.Select(c => c.PlayerId).SequenceEqual(players.Select(p => p.Id)), "rating changes retain interleaved replay player order");
        var underdog = Estimate(ratings: Ratings(2000, 3000));
        var favourite = Estimate(ratings: Ratings(3000, 2000));
        assert(Delta(underdog, "a") == 65 && Delta(underdog, "d") == -65 && Delta(favourite, "a") == 35 && Delta(favourite, "d") == -35, "underdog and favourite wins use floor-based asymmetric rewards");
        var strongest = Ratings();
        strongest["b"] = new(3000, 25);
        assert(Delta(Estimate(ratings: strongest), "a") == 35, "team strength uses its maximum rating rather than its average");
        var reversed = match with { Players = players.Select(p => p with { Team = p.Team == 1 ? 8 : 3 }).ToList(), Winner = 8 };
        assert(Delta(Estimate(reversed), "a") == 50 && Delta(Estimate(reversed), "d") == -50, "arbitrary replay team IDs normalize to calculator indices");

        var compressed = Estimate(ratings: Ratings(900, 900));
        var boundary = Estimate(ratings: Ratings(1000, 1000));
        var crossing = Estimate(ratings: Ratings(998, 998));
        assert(Delta(compressed, "a") == 5 && Delta(compressed, "d") == -5 && Delta(boundary, "a") == 50 && Delta(boundary, "d") == -5, "compressed ratings retain the distinct 1000 threshold for gains and losses");
        assert(Delta(crossing, "a") == 32 && Delta(crossing, "d") == -5, "rating changes account for crossing the compression threshold");
        var roundedCompression = Estimate(ratings: Ratings(900, 1000));
        assert(Delta(roundedCompression, "a") == 7 && Delta(roundedCompression, "d") == -7, "compressed rating rewards round upward before applying status sign");
        var fractional = Estimate(ratings: Ratings(900.9, 900.9));
        assert(Math.Abs(Delta(fractional, "a")!.Value - 4.1) < 0.000001 && Math.Abs(Delta(fractional, "d")!.Value + 5.9) < 0.000001, "compression truncates the site rating while delta retains the supplied fractional basis");
        assert(Delta(Estimate(ratings: Ratings(1, 2000)), "d") == -100 && Delta(Estimate(ratings: Ratings(2000, 1)), "d") == 0, "minimum site rating clamps losses without fabricating a negative delta");
        var noReward = Estimate(ratings: Ratings(10000, 2000));
        assert(Delta(noReward, "a") == 0 && Delta(noReward, "d") == 0 && noReward.All(c => c.Kind == "estimated"), "valid zero rewards remain numeric estimated changes");

        var mirrorPlayers = players.Select(p => p.Id switch
        {
            "d" => p with { Commander = "Raynor" },
            "e" => p with { Commander = "Kerrigan" },
            "f" => p with { Commander = "Artanis" },
            _ => p
        }).ToList();
        var mirror = match with { Players = mirrorPlayers };
        assert(Delta(Estimate(mirror), "a") == 100 && Delta(Estimate(mirror), "d") == -100, "full exact-order commander mirror doubles all rewards");
        var permuted = mirror with { Players = mirrorPlayers.Select(p => p.Id == "d" ? p with { Commander = "Kerrigan" } : p.Id == "e" ? p with { Commander = "Raynor" } : p).ToList() };
        assert(Delta(Estimate(permuted), "a") == 50, "same commander composition in a different 3v3 order is not a mirror");
        var unknownCommanders = match with { Players = players.Select(p => p with { Commander = "Unknown" }).ToList() };
        assert(Delta(Estimate(unknownCommanders), "a") == 50 && Estimate(unknownCommanders)[0].Detail.Contains("assumes x1"), "unknown commanders do not create a false mirror");

        assert(Delta(Estimate(ratings: Ratings(games: 0)), "a") == 500 && Delta(Estimate(ratings: Ratings(games: 25)), "a") == 50, "first mode game uses x10 and completed 25 games use established x1");
        // The source's double expression yields just below 86 before intval truncation.
        assert(Delta(Estimate(ratings: Ratings(games: 23)), "a") == 85, "novice reward preserves the site's floating-point expression and integer truncation");
        var mixedGames = Ratings();
        mixedGames["a"] = new(2000, 0);
        assert(Delta(Estimate(ratings: mixedGames), "a") == 500 && Delta(Estimate(ratings: mixedGames), "b") == 50, "novice multipliers apply per player rather than per team");
        var missing = Estimate(ratings: new Dictionary<string, RatingBasis>());
        assert(AllUnavailable(missing) && missing[0].Detail.Contains("all six"), "missing ratings never invent a 2000-point opponent or a numeric forecast");
        var modePartial = Ratings(7800, 2000); modePartial["d"] = new(null, null);
        var mainComplete = Ratings(6000, 6000, 100);
        var mainFallback = RatingChangeEstimator.BestAvailable(match, modePartial, mainComplete, null);
        assert(Delta(mainFallback, "a") == 50 && mainFallback.All(c => c.Scope == "main_current"), "complete general ratings replace an incomplete mode forecast as a separate scope, never a hybrid");
        var actual = RatingChangeEstimator.BestAvailable(match, Ratings(), mainComplete, [new("a", 17, "confirmed", "Verified main DSR", "site-game")]);
        assert(actual[0].Delta == 17 && actual[0].Kind == "confirmed" && actual[0].Scope == "main_current", "verified published delta supersedes a current-rating estimate");
        assert(Delta(RatingChangeEstimator.BestAvailable(match, Ratings(), new Dictionary<string, RatingBasis>(), null), "a") == 50, "complete Commanders bases remain available when main ratings are absent");
        var mainProfile = new SiteProfile("1", "Name", "EU", 9000, DateTime.UnixEpoch, EstimatedRating: 4000, ProfileChecked: DateTime.UnixEpoch, SearchRating: 4500, SearchChecked: DateTime.UnixEpoch.AddDays(1), SearchGames: 88);
        assert(RatingChangeEstimator.MainBasis(mainProfile) == new RatingBasis(4500, 88), "main basis uses freshest general evidence and general games, never the Commanders value");

        assert(AllUnavailable(Estimate(match with { Winner = 0 })) && AllUnavailable(Estimate(match with { Winner = 99 })), "unknown or absent winner team never invents an outcome");
        assert(AllUnavailable(Estimate(match with { Mode = "Standard" })) && AllUnavailable(Estimate(match with { Players = players.Take(4).ToList() })), "non-Commanders and non-3v3 matches cannot produce estimates");
        assert(AllUnavailable(Estimate(match with { Players = players.Select(p => p.Id == "f" ? p with { Id = "a" } : p).ToList() })), "duplicate replay identities cannot produce ambiguous rating changes");
        var unknownStatus = match with { Players = players.Select(p => p.Id == "a" ? p with { Result = "Undecided" } : p).ToList() };
        assert(Estimate(unknownStatus)[0].Kind == "unavailable" && Delta(Estimate(unknownStatus), "b") == 50, "known team outcome does not fabricate an unknown individual status");
        var winnerLoss = match with { Players = players.Select(p => p.Id == "a" ? p with { Result = "Loss" } : p).ToList() };
        assert(Delta(Estimate(winnerLoss, Ratings(3000, 2000)), "a") == -65, "winning-team Loss follows the site reverse reward with explicit missing-forfeit assumption");
        var contradictory = match with { Players = players.Select(p => p.Id == "d" ? p with { Result = "Win" } : p).ToList() };
        assert(Estimate(contradictory).Single(c => c.PlayerId == "d").Kind == "unavailable", "losing-team Win is rejected as a contradictory result");
        var badBasis = Ratings();
        badBasis["a"] = new(double.NaN, 25);
        assert(AllUnavailable(Estimate(ratings: badBasis)), "nonfinite rating rejects invalid team strength");
        badBasis["a"] = new(2000, -1);
        assert(Estimate(ratings: badBasis)[0].Kind == "unavailable" && Delta(Estimate(ratings: badBasis), "b") == 50, "negative mode-games count stays unavailable for that player");
        var input = Ratings(2000, 3000, 7);
        var inputSnapshot = input.ToArray();
        var playerSnapshot = players.ToArray();
        Estimate(ratings: input);
        assert(input.SequenceEqual(inputSnapshot) && players.SequenceEqual(playerSnapshot), "estimating cannot mutate cached bases or the replay roster");
        SummaryModeIsolation(assert);
    }

    private static void SummaryModeIsolation(Action<bool, string> assert)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output", "rating-mode-" + Guid.NewGuid());
        var store = new Store(root);
        string[] commanders = ["Raynor", "Kerrigan", "Artanis", "Nova", "Tychus", "Zeratul"];
        Match Game(int region) => new("mode-" + region, "fixture", "Direct Strike", "Commanders", DateTime.UnixEpoch, 600, 1,
            Enumerable.Range(0, 6).Select(i => new ReplayPlayer($"{region}-S2-1-{100 + i}", "Same nickname " + i, i < 3 ? 1 : 2, commanders[i], i < 3 ? "Win" : "Loss", 0, 0, 0, ClanTag: "Keep")).ToList());
        var eu = Game(2);
        var america = Game(1);
        store.Data.Matches = [eu, america];
        foreach (var player in eu.Players)
        {
            var native = new Rating(player.Id, player.Team == 1 ? 0 : 2000, "Linked profile", "fixture", DateTime.UnixEpoch, "eu", Region: "EU");
            var foreign = native with { Value = 200000, ProfileId = "foreign", Region = "Americas" };
            store.Data.RegionalRatings[player.Id] = new(native, foreign);
        }
        foreach (var player in america.Players)
        {
            // An opposite-region manual slot cannot supply this native account's basis.
            store.Data.RegionalRatings[player.Id] = new(Eu: new(player.Id, 1, "Linked profile", "fixture", DateTime.UnixEpoch, "foreign", Region: "EU"));
            store.Data.SiteLookups[player.Id] = new(player.Id, "Candidates", DateTime.UnixEpoch,
                [new("foreign", player.Name, "EU", 90000, DateTime.UnixEpoch), new("native", player.Name, "Americas", 2000, DateTime.UnixEpoch)]);
        }
        store.Data.MatchRatings[eu.Hash] = eu.Players.Select((p, i) => new RatingChange(p.Id, i == 0 ? 0 : 700000 + i, "confirmed", "Verified site main_current DSR, not commanders_3v3", "overall-eu")).ToList();
        store.Data.MatchRatings[america.Hash] = america.Players.Select(p => new RatingChange(p.Id, -900000, "confirmed", "Verified site main_current DSR", "overall-na")).ToList();
        store.Data.MatchRatings[eu.Hash].Add(new(america.Players[0].Id, 1234567, "confirmed", "Foreign native identity in cached evidence", "mismatched"));
        var evidenceBefore = JsonSerializer.Serialize(store.Data.MatchRatings, Store.Json);
        var replayBefore = JsonSerializer.Serialize(store.Data.Matches, Store.Json);
        using var summary = JsonDocument.Parse(JsonSerializer.Serialize(store.Summary(), Store.Json));
        var changes = summary.RootElement.GetProperty("ratingChanges");
        var euChanges = changes.GetProperty(eu.Hash).Deserialize<List<RatingChange>>(Store.Json)!;
        var americaChanges = changes.GetProperty(america.Hash).Deserialize<List<RatingChange>>(Store.Json)!;
        assert(euChanges.Count == 6 && americaChanges.Count == 6 && euChanges.Concat(americaChanges).All(c => c.Kind == "confirmed" && c.Scope == "main_current"), "summary exposes verified main deltas with scope while excluding foreign identities");
        assert(euChanges[0].Delta == 0 && euChanges[3].Delta == 700003 && americaChanges[0].Delta == -900000, "published zero and signed numeric deltas are retained instead of replaced by mode estimates");
        assert(JsonSerializer.Serialize(store.Data.MatchRatings, Store.Json) == evidenceBefore && JsonSerializer.Serialize(store.Data.Matches, Store.Json) == replayBefore, "summary preserves stored site confirmations including zero and leaves native replay identities, names, clans and statistics unchanged");
        store.Data.MatchRatings.Clear();
        foreach (var player in eu.Players)
            store.Data.SiteLookups[player.Id] = new(player.Id, "Ready", DateTime.UnixEpoch,
                [new("eu", player.Name, "EU", null, DateTime.UnixEpoch, SearchRating: 6000, SearchGames: 100, SearchChecked: DateTime.UnixEpoch)]);
        using var mainSummary = JsonDocument.Parse(JsonSerializer.Serialize(store.Summary(), Store.Json));
        var mainChanges = mainSummary.RootElement.GetProperty("ratingChanges").GetProperty(eu.Hash).Deserialize<List<RatingChange>>(Store.Json)!;
        assert(mainChanges.All(c => c.Scope == "main_current" && c.Kind == "estimated") && mainChanges[0].Delta == 50,
            "Store summary uses all six same-region general ratings when mode ratings are incomplete or on a different scale");
    }
}
