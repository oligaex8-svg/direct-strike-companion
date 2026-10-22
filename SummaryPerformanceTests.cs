using System.Diagnostics;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class SummaryPerformanceTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output", "summary-" + Guid.NewGuid());
        var store = new Store(root);
        Populate(store, 24);
        var original = store.Data.Matches[0];
        var ownGame = store.Data.Matches.First(m => m.Players.Any(p => p.Id == "2-S2-1-1"));
        // Keep stable ties, excluded newer own names, and duplicate-ID Any semantics.
        store.Data.Matches.Add(original with { Hash = "tied", Players = original.Players.Select(p => p with { Name = "Tied name", ClanTag = "Tied" }).ToList() });
        store.Data.Matches.Add(ownGame with { Hash = "excluded", Mode = "Standard", Time = DateTime.UnixEpoch.AddYears(1), Players = ownGame.Players.Select(p => p with { Name = "Excluded latest name" }).ToList() });
        var duplicated = store.Data.Matches[1];
        store.Data.Matches.Add(duplicated with { Hash = "duplicate-id", Players = duplicated.Players.Select((p, i) => i == 3 ? p with { Id = duplicated.Players[1].Id } : p).ToList() });
        store.Data.OwnLocalNames.Add(new("2-S2-1-1", "Shortcut alias", DateTime.UnixEpoch.AddYears(2)));
        var expected = JsonSerializer.Serialize(LegacySummary(store), Store.Json);
        var actual = JsonSerializer.Serialize(store.Summary(), Store.Json);
        assert(actual == expected, "grouped summary equals the retained baseline including ties, aliases, no-own games, unknown outcomes, duplicate IDs, excluded own names, clan tags and mode estimates");
        using var equivalent = JsonDocument.Parse(actual);
        assert(equivalent.RootElement.GetProperty("ownAccountGroups")[0].GetProperty("profiles")[0].GetProperty("name").GetString() == "Shortcut alias" && equivalent.RootElement.GetProperty("ownAccountGroups")[0].GetProperty("profiles")[0].GetProperty("aliases").EnumerateArray().Any(n => n.GetString() == "Excluded latest name"), "own profile keeps newer shortcut preference and aliases from excluded match history");
        var empty = new Store(Path.Combine(root, "empty"));
        assert(JsonSerializer.Serialize(empty.Summary(), Store.Json) == JsonSerializer.Serialize(LegacySummary(empty), Store.Json), "empty summary retains its original fields, zero counts and null rates");

        var first = store.Snapshot();
        var frozen = first.Library!.Value.GetRawText();
        assert(first.Library.HasValue && frozen == actual && store.Snapshot(first.Version).Library == null, "initial snapshot contains the full library and matching version omits unchanged payload");
        assert(store.Snapshot("foreign-version").Version == first.Version && store.Snapshot("foreign-version").Library!.Value.GetRawText() == frozen, "unknown version returns the same frozen library without changing the revision");
        assert(store.ImportMatch(original) == ReplayImportResult.Duplicate && store.Snapshot(first.Version).Library == null, "duplicate import leaves the snapshot revision unchanged");
        var added = original with { Hash = "snapshot-added", Time = DateTime.UnixEpoch.AddYears(3) };
        assert(store.ImportMatch(added) == ReplayImportResult.Added && store.Snapshot(first.Version).Library.HasValue, "added replay publishes a new snapshot before the import disk checkpoint");
        var addedVersion = store.Snapshot().Version;
        assert(store.ImportMatch(added with { ClanVersion = added.ClanVersion + 1, Players = added.Players.Select(p => p with { ClanTag = "Refreshed" }).ToList() }) == ReplayImportResult.Refreshed && store.Snapshot(addedVersion).Library.HasValue, "metadata enrichment invalidates the snapshot without requiring Save");
        assert(first.Library.Value.GetRawText() == frozen, "an older returned snapshot stays frozen after later replay mutations");

        void Published(Action change, Func<JsonElement, bool> check, string description)
        {
            var previous = store.Snapshot().Version;
            change();
            var next = store.Snapshot(previous);
            assert(next.Version != previous && next.Library.HasValue && check(next.Library.Value), description);
        }
        Published(() => store.Save(), _ => true, "Save publishes a new library revision even when an unchanged scan saves");
        Published(() => { store.Data.Settings.Sound = false; store.Save(); }, lib => !lib.GetProperty("settings").GetProperty("sound").GetBoolean(), "saved settings edits invalidate the snapshot");
        Published(() => { store.SetMark("2-S2-1-101", "Native name", "Private note"); store.Save(); }, lib => lib.GetProperty("marks").EnumerateArray().Any(m => m.GetProperty("note").GetString() == "Private note"), "saved private marks invalidate the snapshot");
        Published(() => { store.SetRegionRating("2-S2-1-101", "EU", new("2-S2-1-101", 0, "Linked profile", "fixture", DateTime.UnixEpoch, "101", Region: "EU")); store.Save(); }, lib => lib.GetProperty("ratings").GetProperty("2-S2-1-101").GetProperty("eu").GetProperty("value").GetDouble() == 0, "saved regional rating changes invalidate the snapshot and retain numeric zero");
        Published(() => store.SetLanguage("ru"), lib => lib.GetProperty("settings").GetProperty("language").GetString() == "ru", "language's internal Save invalidates the snapshot");
        Published(() =>
        {
            store.Data.SiteLookups["native"] = new("native", "Ready", DateTime.UnixEpoch, [new("201", "Public name", "EU", 2000, DateTime.UnixEpoch)]);
            store.Data.SiteHistories["201"] = new("201", "Public name", "EU", DateTime.UnixEpoch, "Ready", []);
            store.Data.SiteGames["game"] = new("game", DateTime.UnixEpoch, 600, "commanders_3v3", []);
            store.Data.Errors.Add("Recorded diagnostic");
            store.Data.OwnLocalNames.Add(new("2-S2-1-1", "Newest shortcut", DateTime.UnixEpoch.AddYears(4)));
            store.Save();
        }, lib => lib.GetProperty("siteLookups").TryGetProperty("native", out _) && lib.GetProperty("siteHistories").TryGetProperty("201", out _) && lib.GetProperty("siteGames").TryGetProperty("game", out _) && lib.GetProperty("errors").EnumerateArray().Any(e => e.GetString() == "Recorded diagnostic") && lib.GetProperty("ownAccountGroups")[0].GetProperty("profiles")[0].GetProperty("name").GetString() == "Newest shortcut", "Save publishes site caches, error history and own shortcut changes together");
        var savedVersion = store.Snapshot().Version;
        var restored = new Store(root);
        assert(restored.Snapshot(savedVersion).Library.HasValue && restored.Snapshot().Version != savedVersion, "a new store generation cannot mistake a previous process token for unchanged data");
        assert(first.Library.Value.GetRawText() == frozen && first.Library.Value.GetProperty("settings").GetProperty("language").GetString() == "en", "older snapshots keep settings and private dictionaries immutable across Save and reload");
        store.Data.Settings.Sound = true;
        using var live = JsonDocument.Parse(JsonSerializer.Serialize(store.Summary(), Store.Json));
        assert(live.RootElement.GetProperty("settings").GetProperty("sound").GetBoolean(), "legacy Summary remains live for direct source and test callers");

        var cancelled = new Store(Path.Combine(root, "cancelled"));
        Populate(cancelled, 1);
        cancelled.Data.Settings.AutoDetectSelf = false;
        cancelled.Save();
        var service = new ReplayService(cancelled);
        using var cancellation = new CancellationTokenSource();
        var importing = service.ImportAsync(false, ct: cancellation.Token);
        cancellation.Cancel(); // The synchronous scan reached its initial async delay.
        importing.GetAwaiter().GetResult();
        assert(!service.Busy && service.Snapshot().Phase == "Interrupted" && new Store(cancelled.DirectoryPath).Data.Matches.Count == 1, "cancelling an active scan clears Busy and preserves its saved library");
    }

    private static void Populate(Store store, int count)
    {
        store.Data.Settings.SelfIds = ["2-S2-1-1", "1-S2-1-1"];
        store.Data.OwnAccountGroups = [new("fixture", "local", [new("2-S2-1-1", "EU"), new("1-S2-1-1", "Americas")], "Fixture", "Linked", true, [])];
        string[] commanders = ["Raynor", "Kerrigan", "Artanis", "Nova", "Tychus", "Zeratul"];
        for (int i = 0; i < count; i++)
        {
            int winner = i % 7 == 0 ? 0 : i % 2 + 1;
            var players = Enumerable.Range(0, 6).Select(slot =>
            {
                string id = slot == 0 ? i % 11 == 0 ? "2-S2-1-99" : "2-S2-1-1" : $"2-S2-1-{100 + (i * 5 + slot) % 1200}";
                int team = slot < 3 ? 1 : 2;
                return new ReplayPlayer(id, "Player " + id + (i % 5 == 0 ? " alias" : ""), team, commanders[slot], winner == 0 ? "Undecided" : team == winner ? "Win" : "Loss", 30 + i % 50, 100 + i, 200 + i, new(new() { ["UnitKills"] = i % 50, ["DamageDealt"] = null }), i % 3 == 0 ? "Clan" : "");
            }).ToList();
            store.Data.Matches.Add(new("synthetic-" + i, "fixture", "Direct Strike", "Commanders", DateTime.UnixEpoch.AddMinutes(i * 37 % Math.Max(1, count)), 600 + i % 120, winner, players, CombatStatsExtractor.CurrentVersion, null, ReplayClanTags.CurrentVersion));
        }
        store.Data.Marks["2-S2-1-101"] = new("2-S2-1-101", "Marked alias", "Private fixture", DateTime.UnixEpoch);
        store.Data.RegionalRatings["2-S2-1-101"] = new(Eu: new("2-S2-1-101", 2100, "Linked profile", "fixture", DateTime.UnixEpoch, "101", Region: "EU"));
        store.Data.Errors = Enumerable.Range(0, 25).Select(i => "Fixture error " + i).ToList();
    }

    // Opt-in only: normal self-tests use the small fixture above.
    internal static void RunProbe(string[] args)
    {
        var output = Path.Combine(Program.ProjectRoot(), "verification", "summary-performance-probe.json");
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        try
        {
            ResourceGuard.CpuPercent();
            Thread.Sleep(120);
            if (ResourceGuard.RamPercent() >= 94 || ResourceGuard.CpuPercent() >= 90)
                throw new InvalidOperationException("Summary probe deferred by the CPU/RAM resource budget.");
            var store = new Store(Path.Combine(Path.GetDirectoryName(output)!, "summary-probe-" + Guid.NewGuid()));
            var warmup = new Store(Path.Combine(store.DirectoryPath, "warmup"));
            Populate(warmup, 12);
            _ = JsonSerializer.Serialize(LegacySummary(warmup), Store.Json);
            _ = JsonSerializer.Serialize(warmup.Summary(), Store.Json);
            Populate(store, 4000);
            (string Json, double Milliseconds, long AllocatedBytes) Measure(Func<string> action)
            {
                var allocated = GC.GetAllocatedBytesForCurrentThread();
                var watch = Stopwatch.StartNew();
                var json = action();
                watch.Stop();
                return (json, watch.Elapsed.TotalMilliseconds, GC.GetAllocatedBytesForCurrentThread() - allocated);
            }
            var baseline = Measure(() => JsonSerializer.Serialize(LegacySummary(store), Store.Json));
            if (ResourceGuard.RamPercent() >= 94) throw new InvalidOperationException("Summary probe stopped: RAM reached 94%.");
            var optimized = Measure(() => JsonSerializer.Serialize(store.Summary(), Store.Json));
            var first = Measure(() => JsonSerializer.Serialize(store.Snapshot(), Store.Json));
            var version = store.Snapshot().Version;
            var cached = Measure(() => JsonSerializer.Serialize(store.Snapshot(), Store.Json));
            var conditional = Measure(() => JsonSerializer.Serialize(store.Snapshot(version), Store.Json));
            bool equivalent = baseline.Json == optimized.Json && store.Snapshot().Library!.Value.GetRawText() == optimized.Json;
            File.WriteAllText(output, JsonSerializer.Serialize(new
            {
                success = equivalent,
                synthetic = true,
                replayCount = store.Data.Matches.Count,
                uniquePlayers = store.Data.Matches.SelectMany(m => m.Players).Select(p => p.Id).Distinct().Count(),
                runsPerPath = 1,
                baseline = new { baseline.Milliseconds, baseline.AllocatedBytes, utf8Bytes = System.Text.Encoding.UTF8.GetByteCount(baseline.Json) },
                optimized = new { optimized.Milliseconds, optimized.AllocatedBytes },
                firstSnapshot = new { first.Milliseconds, first.AllocatedBytes },
                cachedFullSnapshot = new { cached.Milliseconds, cached.AllocatedBytes },
                unchangedSnapshot = new { conditional.Milliseconds, conditional.AllocatedBytes, payload = conditional.Json },
                equivalent,
                ramPercent = ResourceGuard.RamPercent(),
                note = "Synthetic warmed single-run summary plus serialization; excludes HTTP/browser rendering and real replay decoding. Current-thread allocations include the serialized result."
            }, Store.Json));
            if (!equivalent) Environment.ExitCode = 1;
        }
        catch (Exception ex) { File.WriteAllText(output, JsonSerializer.Serialize(new { success = false, error = ex.ToString() }, Store.Json)); Environment.ExitCode = 1; }
    }

    // Retained verbatim algorithm from before the optimization for equivalence
    // checks and the same-workload diagnostic; never used by production requests.
    internal static object LegacySummary(Store store)
    {
        lock (store.Gate)
        {
            var matches = store.Data.Matches.Where(Store.IsEligible).ToList();
            var ownIds = store.Data.Settings.SelfIds.ToHashSet(StringComparer.Ordinal);
            var games = matches.Select(m => (Match: m, Me: m.Players.FirstOrDefault(p => ownIds.Contains(p.Id)))).Where(x => x.Me != null).ToList();
            var known = games.Where(x => Store.Outcome(x.Match, x.Me!) != null).ToList();
            var wins = known.Count(x => Store.Outcome(x.Match, x.Me!) == true);
            var players = matches.SelectMany(m => m.Players).GroupBy(p => p.Id).Where(g => !ownIds.Contains(g.Key)).Select(g =>
            {
                var recent = matches.OrderByDescending(m => m.Time).SelectMany(m => m.Players).First(p => p.Id == g.Key);
                var name = recent.Name;
                var clanTag = recent.ClanTag;
                var against = games.Where(x => x.Match.Players.Any(p => p.Id == g.Key && p.Team != x.Me!.Team)).ToList();
                var together = games.Where(x => x.Match.Players.Any(p => p.Id == g.Key && p.Team == x.Me!.Team)).ToList();
                object Stats(List<(Match Match, ReplayPlayer? Me)> list)
                {
                    var decided = list.Where(x => Store.Outcome(x.Match, x.Me!) != null).ToList();
                    var w = decided.Count(x => Store.Outcome(x.Match, x.Me!) == true);
                    return new { games = list.Count, wins = w, losses = decided.Count - w, unknown = list.Count - decided.Count, winRate = decided.Count == 0 ? (double?)null : 100.0 * w / decided.Count };
                }
                return new { id = g.Key, name, clanTag, aliases = g.Select(p => p.Name).Distinct().ToList(), encounters = games.Count(x => x.Match.Players.Any(p => p.Id == g.Key)), against = Stats(against), together = Stats(together), mark = store.Data.Marks.GetValueOrDefault(g.Key), rating = store.Data.Ratings.GetValueOrDefault(g.Key), ratings = store.GetRegionRatings(g.Key), lastSeen = matches.Where(m => m.Players.Any(p => p.Id == g.Key)).Max(m => m.Time) };
            }).OrderByDescending(p => p.mark != null).ThenByDescending(p => p.encounters).ToList();
            object Profile(OwnProfile profile)
            {
                var history = store.Data.Matches.OrderByDescending(m => m.Time).SelectMany(m => m.Players.Select(p => (Match: m, Player: p))).Where(p => p.Player.Id == profile.Id).ToList();
                var localNames = store.Data.OwnLocalNames.Where(n => n.Id == profile.Id).OrderByDescending(n => n.ObservedAt).ToList();
                var recent = history.FirstOrDefault();
                var shortcut = localNames.FirstOrDefault();
                bool preferShortcut = shortcut != null && (recent.Player == null || shortcut.ObservedAt > recent.Match.Time);
                string? name = preferShortcut ? shortcut!.Name : recent.Player?.Name;
                return new { profile.Id, profile.Region, name, clanTag = recent.Player?.ClanTag, aliases = history.Select(p => p.Player.Name).Concat(localNames.Select(n => n.Name)).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), nameSource = preferShortcut ? "SC2 profile shortcut" : name == null ? "No local name yet" : "Imported replay", ratings = store.GetRegionRatings(profile.Id) };
            }
            var ownAccountGroups = store.Data.OwnAccountGroups.Select(g => new { g.Key, g.LocalAccountId, g.Evidence, g.Status, g.CanAutoLink, g.Warnings, profiles = g.Profiles.Where(p => ownIds.Contains(p.Id)).Select(Profile).ToList() }).Where(g => g.profiles.Count > 0).ToList();
            var ratingBasis = matches.SelectMany(m => m.Players).DistinctBy(p => p.Id).ToDictionary(p => p.Id, p =>
            {
                var region = p.Id.StartsWith("2-S2-", StringComparison.Ordinal) ? "EU" : p.Id.StartsWith("1-S2-", StringComparison.Ordinal) ? "Americas" : null;
                var linked = region == null ? null : store.ResolveRegionRating(p.Id, region).Rating;
                var automatic = store.Data.SiteLookups.GetValueOrDefault(p.Id)?.Profiles.Where(profile => profile.Region == region).ToList();
                return new RatingBasis(linked != null ? linked.Value : automatic?.Count == 1 ? automatic[0].Rating : null, null);
            });
            // Verified site MatchRatings are main_current DSR, not commanders_3v3.
            // Keep that evidence stored; this view uses only the selected mode basis.
            var ratingChanges = matches.ToDictionary(m => m.Hash, m => RatingChangeEstimator.Estimate(m, ratingBasis).ToList());
            return new { settings = store.Data.Settings, matches = matches.OrderByDescending(m => m.Time).ToList(), players, marks = store.Data.Marks.Values.ToList(), ratings = store.Data.RegionalRatings.ToDictionary(x => x.Key, x => x.Value), siteLookups = store.Data.SiteLookups.ToDictionary(x => x.Key, x => x.Value), siteHistories = store.Data.SiteHistories.ToDictionary(x => x.Key, x => x.Value with { Games = x.Value.Games.ToList() }), siteGames = store.Data.SiteGames.ToDictionary(x => x.Key, x => x.Value with { Players = x.Value.Players.ToList() }), ratingChanges, errors = store.Data.Errors.TakeLast(20).ToList(), total = games.Count, known = known.Count, wins, losses = known.Count - wins, winRate = known.Count == 0 ? (double?)null : 100.0 * wins / known.Count, combatGames = matches.Count(m => m.StatsVersion >= CombatStatsExtractor.CurrentVersion), combatTotal = matches.Count, accounts = matches.OrderByDescending(m => m.Time).SelectMany(m => m.Players).Where(p => ownIds.Contains(p.Id)).DistinctBy(p => p.Id).Select(p => new { p.Id, p.Name, p.ClanTag }).ToList(), ownAccountGroups };
        }
    }
}

