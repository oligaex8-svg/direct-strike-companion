namespace DirectStrikeCompanion;

internal static class ReplayDamagePersistenceTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var players = Enumerable.Range(1, 6).Select(i => new ReplayPlayer("account" + i, "Player " + i,
            i <= 3 ? 1 : 2, "Zagara", "Win", 0, 10, 5, new CombatStats(new() { ["UnitKills"] = 10 }))).ToList();
        var match = new Match("original-hash", "original.SC2Replay", "Direct Strike", "Commanders", DateTime.UtcNow, 100, 1, players, 5);
        var evidence = new ReplayDamageEvidence(98310, "verified-data-version", DateTime.UtcNow,
            players.Select((p, i) => new ReplayDamagePlayer(p.Id, i + 1, 2240, 1000 + i * 100, 800 + i * 50)).Reverse().ToList());
        var measured = Store.WithReplayDamage(match, evidence);
        assert(measured.Players[2].Combat!.Values["DamageDealt"] == 1200 && measured.Players[2].Combat!.Values["DamageTaken"] == 900,
            "measured player damage is attached by account with both channels");
        assert(match.Players.All(p => !p.Combat!.Values.ContainsKey("DamageDealt")), "damage attachment does not mutate the original values");
        bool Reject(ReplayDamageEvidence value)
        {
            try { Store.WithReplayDamage(match, value); return false; }
            catch (InvalidDataException) { return true; }
        }
        assert(Reject(evidence with { Players = evidence.Players.Take(5).ToList() }), "partial damage batches cannot affect Impact");
        assert(Reject(evidence with { Players = evidence.Players.Select((p, i) => i == 0 ? p with { AccountId = "wrong-account" } : p).ToList() }), "wrong damage account is rejected");
        assert(Reject(evidence with { Players = evidence.Players.Select((p, i) => i == 0 ? p with { DamageDealt = double.NaN } : p).ToList() }), "nonfinite damage is rejected");
        assert(Reject(evidence with { Players = evidence.Players.Select(p => p with { ScorePlayerId = 1 }).ToList() }), "duplicate score perspective is rejected");
        var team1 = evidence with { Players = evidence.Players.Where(p => rosterTeam(p.AccountId) == 1).ToList() };
        var team2 = evidence with { Players = evidence.Players.Where(p => rosterTeam(p.AccountId) == 2).ToList() };
        int rosterTeam(string id) => players.Single(p => p.Id == id).Team;
        var firstTeam = Store.WithReplayDamage(match, team1);
        assert(firstTeam.Damage?.Players.Count == 3 && firstTeam.Players.Take(3).All(p => p.Combat!.Values.ContainsKey("DamageDealt")) &&
            firstTeam.Players.Skip(3).All(p => !p.Combat!.Values.ContainsKey("DamageDealt")),
            "complete-team damage is attached without fabricating the opposing team's damage");
        var bothTeams = Store.WithReplayDamage(firstTeam, team2);
        assert(bothTeams.Damage?.Players.Count == 6 && bothTeams.Players.All(p => p.Combat!.Values.ContainsKey("DamageDealt")),
            "a later complete team merges with prior measured team");
        var remeasured = Store.WithReplayDamage(bothTeams, team1 with { Players = team1.Players.Select(p => p with { DamageDealt = p.DamageDealt + 1 }).ToList() });
        assert(remeasured.Damage?.Players.Count == 6 && remeasured.Players[4].Combat!.Values["DamageDealt"] == bothTeams.Players[4].Combat!.Values["DamageDealt"],
            "remeasuring one team does not downgrade the other measured team");
        assert(Reject(evidence with { Players = evidence.Players.Take(2).ToList() }) &&
            Reject(evidence with { Players = [evidence.Players[0], evidence.Players[1], evidence.Players[5]] }) &&
            Reject(evidence with { Players = evidence.Players.Take(4).ToList() }),
            "one, two, mixed incomplete teams and incomplete four-player batches are rejected");
        bool RejectMerge(ReplayDamageEvidence value)
        {
            try { Store.WithReplayDamage(firstTeam, value); return false; }
            catch (InvalidDataException) { return true; }
        }
        assert(RejectMerge(team2 with { DataVersion = "different" }) &&
            RejectMerge(team2 with { Players = team2.Players.Select((p, i) => i == 0 ? p with { ScorePlayerId = 1 } : p).ToList() }),
            "merging complete teams rejects conflicting provenance and tracker IDs");
        var decodedPlayers = players.Select((p, i) => p with { Combat = p.Combat! with { ScorePlayerId = i + 1 } }).ToList();
        var decoded = match with { Players = decodedPlayers };
        var rawResults = decodedPlayers.Select((p, i) => new ReplayDamageCollector.PlayerResult(p.Id, i + 1, 100, 1, 2)).ToList();
        assert(ReplayDamageCollector.CompleteTeams(decoded, rawResults.Take(2).ToList()).Count == 0 &&
            ReplayDamageCollector.CompleteTeams(decoded, rawResults.Take(4).ToList()).Count == 3 &&
            ReplayDamageCollector.CompleteTeams(decoded, rawResults).Count == 6,
            "only fully represented teams are eligible after an interrupted pass");
        var timeout = new ReplayDamageCollector.ApiResponseTimeoutException(new OperationCanceledException());
        var transport = new ReplayDamageCollector.ApiTransportFailureException(new IOException("SC2 API transport failed", new IOException("closed")));
        assert(ReplayDamageCollector.CanPublishPartial(timeout, null, false, false) &&
            ReplayDamageCollector.CanPublishPartial(transport, null, false, false) &&
            !ReplayDamageCollector.CanPublishPartial(transport, new IOException("GPU unavailable"), false, false) &&
            !ReplayDamageCollector.CanPublishPartial(transport, null, true, false) &&
            !ReplayDamageCollector.CanPublishPartial(transport, null, false, true) &&
            !ReplayDamageCollector.CanPublishPartial(new InvalidDataException("identity mismatch"), null, false, false) &&
            !ReplayDamageCollector.CanPublishPartial(new IOException("checkpoint failure"), null, false, false),
            "only API transport or response timeout after safe cleanup permits complete-team publication");
        var gameExit = new ReplayDamageCollector.OwnedGameExitedException(1234, 42);
        assert(gameExit.ProcessId == 1234 && gameExit.ExitCode == 42 &&
            ReplayDamageCollector.CanPublishPartial(new OperationCanceledException(), gameExit, false, false) &&
            ReplayDamageCollector.CanPublishPartial(transport, gameExit, false, false) &&
            !ReplayDamageCollector.CanPublishPartial(new InvalidDataException("invalid response"), gameExit, false, false) &&
            !ReplayDamageCollector.CanPublishPartial(new OperationCanceledException(), gameExit, true, false) &&
            !ReplayDamageCollector.CanPublishPartial(new OperationCanceledException(), gameExit, false, true),
            "confirmed owned-game exit permits complete teams only after cleanup and without cancellation or batch deadline");
        var directory = Path.Combine(Path.GetTempPath(), "dsc-damage-persistence-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new Store(directory);
            store.ImportMatch(match);
            store.Save();
            using (var blockedSave = new FileStream(Path.Combine(directory, "library.json.tmp"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                bool failed = false;
                try { store.AttachReplayDamage(match.Hash, evidence); }
                catch (IOException) { failed = true; }
                assert(failed && store.Data.Matches.Single().Damage == null &&
                    !store.Data.Matches.Single().Players[2].Combat!.Values.ContainsKey("DamageDealt"),
                    "failed damage persistence rolls back visible in-memory statistics");
                assert(new Store(directory).Data.Matches.Single().Damage == null,
                    "failed damage persistence leaves the saved match unchanged");
            }
            store.AttachReplayDamage(match.Hash, evidence);
            var restored = new Store(directory).Data.Matches.Single();
            assert(restored.Damage?.Players.Count == 6 && restored.Damage.BaseBuild == evidence.BaseBuild && restored.Damage.DataVersion == evidence.DataVersion && restored.Damage.MeasuredAt == evidence.MeasuredAt && restored.Players[2].Combat!.Values["DamageDealt"] == 1200,
                "complete damage and provenance survive saving and reopening");
            store.ImportMatch(match with { Hash = "other-file-hash", Path = "other.SC2Replay", StatsVersion = 6 });
            var enriched = store.Data.Matches.Single();
            assert(enriched.Hash == match.Hash && enriched.Path == match.Path, "semantic enrichment preserves a matching replay hash and path");
            assert(enriched.Damage != null && enriched.Players[2].Combat!.Values["DamageDealt"] == 1200,
                "later combat enrichment preserves measured damage channels");
        }
        finally
        {
            var full = Path.GetFullPath(directory);
            if (full.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) && Directory.Exists(full)) Directory.Delete(full, true);
        }
    }
}
