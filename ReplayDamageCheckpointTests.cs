using System.Text.Json.Nodes;

namespace DirectStrikeCompanion;

internal static class ReplayDamageCheckpointTests
{
    internal static void Run(Action<bool, string> assert)
    {
        string directory = Path.Combine(Path.GetTempPath(), "dsc-damage-checkpoint-" + Guid.NewGuid().ToString("N"));
        try
        {
            var checkpoint = new ReplayDamageCheckpoint(directory);
            string hash = new('A', 64);
            var roster = Enumerable.Range(1, 6).Select(i => new ReplayDamageCheckpoint.Identity("account" + i, i)).ToList();
            var context = new ReplayDamageCheckpoint.Context(hash, 98310, "data-version", 100, roster);
            var first = new ReplayDamageCollector.PlayerResult("account1", 1, 100, 42, 0);
            var second = new ReplayDamageCollector.PlayerResult("account2", 2, 110, 10, 20);
            checkpoint.SaveAsync(context, [first, second], CancellationToken.None).GetAwaiter().GetResult();
            assert(new ReplayDamageCheckpoint(directory).Load(context).SequenceEqual([first, second]), "verified player checkpoint survives restart including explicit zero");
            assert(checkpoint.Load(context with { BaseBuild = 1 }).Count == 0 &&
                checkpoint.Load(context with { DataVersion = "other" }).Count == 0 &&
                checkpoint.Load(context with { DurationLoops = 101 }).Count == 0 &&
                checkpoint.Load(context with { ReplayHash = new string('B', 64) }).Count == 0,
                "checkpoint cannot cross replay hash, build, data version, or duration");
            var swapped = roster.ToList();
            swapped[0] = new("account1", 2); swapped[1] = new("account2", 1);
            assert(checkpoint.Load(context with { Roster = swapped }).Count == 0, "checkpoint rejects changed account-to-score-ID mapping");
            bool Reject(params ReplayDamageCollector.PlayerResult[] results)
            {
                try { checkpoint.SaveAsync(context, results, CancellationToken.None).GetAwaiter().GetResult(); return false; }
                catch (InvalidDataException) { return true; }
            }
            assert(Reject(first, first) && Reject(first with { FinalLoop = 99 }) && Reject(first with { DamageDealt = double.NaN }) &&
                Reject(first with { DamageTaken = -1 }) && Reject(first with { ScorePlayerId = 2 }) && Reject(first with { AccountId = "unknown" }),
                "invalid duplicate, partial, nonfinite, negative or wrong-identity measurements cannot be saved");
            string file = Path.Combine(directory, "replay-damage-work", hash + ".json");
            string valid = File.ReadAllText(file);
            var data = JsonNode.Parse(valid)!.AsObject();
            data["Players"]!.AsArray()[0]!["FinalLoop"] = 99;
            File.WriteAllText(file, data.ToJsonString());
            assert(checkpoint.Load(context).Count == 0, "tampered incomplete checkpoint is ignored");
            foreach (string missingField in new[] { "DamageDealt", "DamageTaken", "FinalLoop", "ScorePlayerId", "AccountId" })
            {
                var missing = JsonNode.Parse(valid)!.AsObject();
                missing["Players"]!.AsArray()[0]!.AsObject().Remove(missingField);
                File.WriteAllText(file, missing.ToJsonString());
                assert(checkpoint.Load(context).Count == 0, "checkpoint rejects missing required player field " + missingField);
            }
            foreach (string missingField in new[] { "ReplayHash", "BaseBuild", "DataVersion", "DurationLoops", "Roster" })
            {
                var missing = JsonNode.Parse(valid)!.AsObject();
                missing["Context"]!.AsObject().Remove(missingField);
                File.WriteAllText(file, missing.ToJsonString());
                assert(checkpoint.Load(context).Count == 0, "checkpoint rejects missing required metadata field " + missingField);
            }
            var noVersion = JsonNode.Parse(valid)!.AsObject(); noVersion.Remove("Version");
            File.WriteAllText(file, noVersion.ToJsonString());
            assert(checkpoint.Load(context).Count == 0, "checkpoint rejects missing schema version");
            File.WriteAllText(file, "{invalid");
            assert(checkpoint.Load(context).Count == 0, "corrupt checkpoint is ignored");
            File.WriteAllText(file, valid);
            using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
            try { checkpoint.SaveAsync(context, [first], cancelled.Token).GetAwaiter().GetResult(); } catch (OperationCanceledException) { }
            assert(checkpoint.Load(context).SequenceEqual([first, second]), "cancelled atomic update preserves prior verified checkpoint");
            var transport = new IOException("socket closed");
            var monitor = new IOException("GPU threshold");
            var combined = ReplayDamageCollector.CombineMonitorFailure(transport, monitor) as AggregateException;
            assert(combined != null && combined.InnerExceptions.Contains(transport) && combined.InnerExceptions.Contains(monitor),
                "transport failure retains the simultaneous safety-monitor failure");
            var cancellationFailure = ReplayDamageCollector.CombineMonitorFailure(new OperationCanceledException(), monitor);
            assert(cancellationFailure is IOException && cancellationFailure.InnerException == monitor,
                "monitor-triggered cancellation retains the safety cause");
            checkpoint.Delete(hash);
            assert(checkpoint.Load(context).Count == 0, "completed checkpoint can be removed");
        }
        finally
        {
            string full = Path.GetFullPath(directory), parent = Path.GetFullPath(Path.GetTempPath());
            if (full.StartsWith(parent, StringComparison.OrdinalIgnoreCase) && Directory.Exists(full)) Directory.Delete(full, true);
        }
    }
}
