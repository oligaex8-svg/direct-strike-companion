using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class ImpactDiagnostics
{
    internal static async Task RunAsync(string[] args)
    {
        var output = Path.Combine(Program.ProjectRoot(), "verification", "impact-real-replay.json");
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        try
        {
            var index = Array.IndexOf(args, "--probe-impact");
            var path = args.ElementAtOrDefault(index + 1) ?? throw new ArgumentException("Replay path required.");
            await using var worker = new ReplayDecodeWorker();
            using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(2));
            var hashed = await worker.DecodeAsync(new(path, "", false, HashOnly: true), cancellation.Token);
            if (hashed.Hash == null || hashed.Error != null) throw new InvalidDataException(hashed.Error ?? "No hash.");
            var result = await worker.DecodeAsync(new(path, hashed.Hash, false), cancellation.Token);
            var match = result.Match ?? throw new InvalidDataException(result.Error ?? "No replay data.");
            if (!Store.IsEligible(match) || match.StatsVersion < 2 || match.Players.Any(player => player.Combat?.Impact == null))
                throw new InvalidDataException("Detailed six-player replay data unavailable.");
            File.WriteAllText(output, JsonSerializer.Serialize(new { success = true, checkedAt = DateTime.UtcNow,
                scope = "Actual replay decoded by the packaged contained worker; no installed library changes", match,
                counts = match.Players.Select(player => new { player.Id, samples = player.Combat!.Impact!.Samples.Count,
                    waves = player.Combat.Impact.Waves.Count, units = player.Combat.Impact.Units.Count,
                    opponents = player.Combat.Impact.Opponents.Count }) }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(output, JsonSerializer.Serialize(new { success = false, error = error.ToString() }, Store.Json));
            Environment.ExitCode = 1;
        }
    }
}
