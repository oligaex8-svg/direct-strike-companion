namespace DirectStrikeCompanion;

internal static class ReplayHeavyWork
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    internal static async Task<IDisposable> AcquireAsync(CancellationToken ct)
    {
        await Gate.WaitAsync(ct).ConfigureAwait(false);
        return new Lease();
    }
    private sealed class Lease : IDisposable
    {
        private int released;
        public void Dispose() { if (Interlocked.Exchange(ref released, 1) == 0) Gate.Release(); }
    }
}

public sealed record ReplayDamagePlayer(string AccountId, int ScorePlayerId, uint FinalLoop, double DamageDealt, double DamageTaken);
public sealed record ReplayDamageEvidence(uint BaseBuild, string DataVersion, DateTime MeasuredAt, List<ReplayDamagePlayer> Players);
internal sealed record ReplayDamageStatus(string? Hash = null, bool Busy = false, int Completed = 0, int Total = 6, string Phase = "idle", string? Message = null);

internal sealed class ReplayDamageService(Store store)
{
    private readonly object gate = new();
    private ReplayDamageStatus status = new();
    private CancellationTokenSource? cancellation;
    private Task completion = Task.CompletedTask;
    internal Task Completion { get { lock (gate) return completion; } }
    internal ReplayDamageStatus Snapshot() { lock (gate) return status; }
    internal void Cancel() { lock (gate) cancellation?.Cancel(); }

    internal bool Start(string hash, CancellationToken shutdown)
    {
        var match = store.ReplayForDamage(hash);
        if (match == null) throw new InvalidOperationException("Replay not found.");
        lock (gate)
        {
            if (status.Busy) return false;
            cancellation?.Dispose();
            cancellation = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
            status = new(hash, true, Phase: "preparing", Message: "Preparing replay damage analysis.");
            completion = Task.Run(() => RunAsync(match, cancellation.Token));
            return true;
        }
    }

    private async Task RunAsync(Match match, CancellationToken ct)
    {
        try
        {
            // Decode again for the exact tracker/account mapping, including older libraries.
            await using var decoder = new ReplayDecodeWorker();
            var result = await decoder.DecodeAsync(new(match.Path, match.Hash, false), ct).ConfigureAwait(false);
            var decoded = result.Match ?? throw new InvalidDataException(result.Error ?? "Replay identity could not be verified.");
            if (decoded.Hash != match.Hash) throw new InvalidDataException("The replay file changed. Rescan it before measuring damage.");
            using var lease = await ReplayHeavyWork.AcquireAsync(ct).ConfigureAwait(false);
            var checkpoint = new ReplayDamageCheckpoint(store.DirectoryPath);
            var batch = await ReplayDamageCollector.CollectAsync(decoded, (done, total, message) =>
            {
                lock (gate) status = new(match.Hash, true, done, total, "measuring", message);
            }, ct, checkpoint).ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();
            var evidence = new ReplayDamageEvidence(batch.BaseBuild, batch.DataVersion, DateTime.UtcNow,
                batch.Players.Select(p => new ReplayDamagePlayer(p.AccountId, p.ScorePlayerId, p.FinalLoop, p.DamageDealt, p.DamageTaken)).ToList());
            store.AttachReplayDamage(match.Hash, evidence);
            if (batch.Warning != null)
            {
                lock (gate) status = new(match.Hash, false, batch.Players.Count, 6, "partial", batch.Warning);
                return; // Incomplete perspectives remain checkpointed for retry.
            }
            try { checkpoint.Delete(match.Hash); }
            catch (Exception ex)
            {
                lock (gate) status = new(match.Hash, false, 6, 6, "complete", "Measured damage saved. The retry checkpoint could not be removed.");
                await TryLogErrorAsync("Damage was saved, but its work checkpoint could not be removed: " + ex).ConfigureAwait(false);
                return;
            }
            lock (gate) status = new(match.Hash, false, 6, 6, "complete", "Measured damage saved. Player Impact now includes damage dealt and received.");
        }
        catch (OperationCanceledException)
        {
            lock (gate) status = status with { Busy = false, Phase = "cancelled", Message = "Damage analysis cancelled. Verified passes are kept for retry; partial measurements do not affect match statistics." };
        }
        catch (Exception ex)
        {
            lock (gate) status = status with { Busy = false, Phase = "error", Message = ex.Message };
            await TryLogErrorAsync(ex.ToString()).ConfigureAwait(false);
        }
    }

    private async Task TryLogErrorAsync(string text)
    {
        // Diagnostics must never strand a completed/cancelled operation as busy.
        try { await File.WriteAllTextAsync(Path.Combine(store.DirectoryPath, "replay-damage-error.txt"), text).ConfigureAwait(false); }
        catch (Exception) { }
    }
}

public sealed partial class Store
{
    internal Match? ReplayForDamage(string hash)
    {
        lock (Gate) return Data.Matches.FirstOrDefault(m => m.Hash == hash && IsEligible(m));
    }

    internal void AttachReplayDamage(string hash, ReplayDamageEvidence evidence)
    {
        lock (Gate)
        {
            var index = Data.Matches.FindIndex(m => m.Hash == hash && IsEligible(m));
            if (index < 0) throw new InvalidOperationException("The replay is no longer in the library.");
            var previous = Data.Matches[index];
            Data.Matches[index] = WithReplayDamage(previous, evidence);
            try { Save(); }
            catch
            {
                // Save invalidates the summary revision before writing. Restore
                // the old match while holding the same lock if persistence fails.
                Data.Matches[index] = previous;
                throw;
            }
        }
        SignalLiveChange();
    }

    internal static Match WithReplayDamage(Match match, ReplayDamageEvidence evidence)
    {
        if (!IsEligible(match) || match.Players.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != 6)
            throw new InvalidDataException("Damage measurements require a unique eligible replay roster.");
        var roster = match.Players.ToDictionary(p => p.Id, StringComparer.Ordinal);
        void Validate(ReplayDamageEvidence value)
        {
            if (value == null || value.BaseBuild == 0 || string.IsNullOrWhiteSpace(value.DataVersion) || value.Players == null ||
                value.Players.Count is not (3 or 6) || value.Players.Any(p => p == null || string.IsNullOrWhiteSpace(p.AccountId) ||
                    p.ScorePlayerId <= 0 || p.FinalLoop == 0 || !double.IsFinite(p.DamageDealt) || p.DamageDealt < 0 ||
                    !double.IsFinite(p.DamageTaken) || p.DamageTaken < 0) ||
                value.Players.Select(p => p.AccountId).Distinct(StringComparer.Ordinal).Count() != value.Players.Count ||
                value.Players.Select(p => p.ScorePlayerId).Distinct().Count() != value.Players.Count ||
                value.Players.Any(p => !roster.ContainsKey(p.AccountId)) ||
                value.Players.GroupBy(p => roster[p.AccountId].Team).Any(group => group.Count() != 3))
                throw new InvalidDataException("Damage measurements must cover complete replay teams with unique verified identities.");
            if (value.Players.Any(p => roster[p.AccountId].Combat?.ScorePlayerId is int known && known != p.ScorePlayerId))
                throw new InvalidDataException("Damage score player IDs conflict with the replay roster.");
        }
        Validate(evidence);
        if (match.Damage != null)
        {
            Validate(match.Damage);
            if (match.Damage.BaseBuild != evidence.BaseBuild || !string.Equals(match.Damage.DataVersion, evidence.DataVersion, StringComparison.Ordinal))
                throw new InvalidDataException("Damage measurements have conflicting replay versions.");
        }
        var measurements = match.Damage?.Players.ToDictionary(p => p.AccountId, StringComparer.Ordinal) ?? new Dictionary<string, ReplayDamagePlayer>(StringComparer.Ordinal);
        foreach (var player in evidence.Players)
        {
            if (measurements.TryGetValue(player.AccountId, out var previous) && previous.ScorePlayerId != player.ScorePlayerId ||
                measurements.Values.Any(p => p.AccountId != player.AccountId && p.ScorePlayerId == player.ScorePlayerId))
                throw new InvalidDataException("Damage measurements contain conflicting player identities.");
            measurements[player.AccountId] = player;
        }
        var combined = evidence with { Players = match.Players.Where(p => measurements.ContainsKey(p.Id)).Select(p => measurements[p.Id]).ToList() };
        Validate(combined);
        return match with { Damage = combined, Players = match.Players.Select(player =>
        {
            if (!measurements.TryGetValue(player.Id, out var measured)) return player;
            var combat = player.Combat ?? new CombatStats([]);
            var values = new Dictionary<string, double?>(combat.Values, StringComparer.Ordinal)
            {
                ["DamageDealt"] = measured.DamageDealt,
                ["DamageTaken"] = measured.DamageTaken
            };
            return player with { Combat = combat with { Values = values, ScorePlayerId = measured.ScorePlayerId } };
        }).ToList() };
    }
}
