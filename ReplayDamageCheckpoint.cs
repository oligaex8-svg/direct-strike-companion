using System.Text.Json;

namespace DirectStrikeCompanion;

// Local resumable work only: never exposed as match statistics or evidence.
internal sealed class ReplayDamageCheckpoint(string dataDirectory)
{
    internal sealed record Identity(string AccountId, int ScorePlayerId);
    internal sealed record Context(string ReplayHash, uint BaseBuild, string DataVersion, uint DurationLoops, List<Identity> Roster);
    private sealed record Document(int Version, Context Context, List<ReplayDamageCollector.PlayerResult> Players);
    private const int Version = 1, MaxBytes = 128 * 1024;
    private readonly string directory = Path.Combine(dataDirectory, "replay-damage-work");
    private static readonly JsonSerializerOptions Json = new() { MaxDepth = 12, RespectRequiredConstructorParameters = true };

    internal List<ReplayDamageCollector.PlayerResult> Load(Context context)
    {
        ValidateContext(context);
        string path = PathFor(context.ReplayHash);
        try
        {
            using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (input.Length > MaxBytes) return [];
            var document = JsonSerializer.Deserialize<Document>(input, Json);
            return document != null && Valid(document, context) ? document.Players : [];
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        { return []; }
    }

    internal async Task SaveAsync(Context context, IReadOnlyList<ReplayDamageCollector.PlayerResult> players, CancellationToken ct)
    {
        ValidateContext(context);
        var document = new Document(Version, context, players.ToList());
        if (!Valid(document, context)) throw new InvalidDataException("Cannot checkpoint invalid or inconsistent replay damage results.");
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(document, Json);
        if (bytes.Length > MaxBytes) throw new InvalidDataException("Replay damage checkpoint exceeds its size limit.");
        Directory.CreateDirectory(directory);
        string path = PathFor(context.ReplayHash), temp = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            await using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await output.WriteAsync(bytes, ct).ConfigureAwait(false);
                await output.FlushAsync(ct).ConfigureAwait(false);
                output.Flush(true);
            }
            ct.ThrowIfCancellationRequested();
            File.Move(temp, path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    internal void Delete(string replayHash) => File.Delete(PathFor(replayHash));
    private string PathFor(string hash)
    {
        if (hash.Length != 64 || hash.Any(c => !Uri.IsHexDigit(c))) throw new InvalidDataException("Invalid replay hash for damage checkpoint.");
        return Path.Combine(directory, hash.ToUpperInvariant() + ".json");
    }
    private static void ValidateContext(Context context)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (context.ReplayHash == null || context.ReplayHash.Length != 64 || context.ReplayHash.Any(c => !Uri.IsHexDigit(c)) ||
            context.BaseBuild == 0 || string.IsNullOrWhiteSpace(context.DataVersion) || context.DurationLoops == 0 || context.Roster == null || context.Roster.Count != 6 ||
            context.Roster.Any(p => p == null || string.IsNullOrWhiteSpace(p.AccountId) || p.ScorePlayerId <= 0) ||
            context.Roster.Select(p => p.AccountId).Distinct(StringComparer.Ordinal).Count() != 6 ||
            context.Roster.Select(p => p.ScorePlayerId).Distinct().Count() != 6)
            throw new InvalidDataException("Replay damage checkpoint context is invalid.");
    }
    private static bool Valid(Document document, Context expected)
    {
        var saved = document.Context;
        if (document.Version != Version || saved == null || document.Players == null ||
            !string.Equals(saved.ReplayHash, expected.ReplayHash, StringComparison.OrdinalIgnoreCase) || saved.BaseBuild != expected.BaseBuild ||
            !string.Equals(saved.DataVersion, expected.DataVersion, StringComparison.Ordinal) || saved.DurationLoops != expected.DurationLoops ||
            saved.Roster == null || saved.Roster.Count != 6 || saved.Roster.Any(p => p == null) ||
            saved.Roster.Select(p => (p.AccountId, p.ScorePlayerId)).Distinct().Count() != 6 ||
            !saved.Roster.Select(p => (p.AccountId, p.ScorePlayerId)).ToHashSet().SetEquals(expected.Roster.Select(p => (p.AccountId, p.ScorePlayerId))) ||
            document.Players.Count > 6 || document.Players.Any(p => p == null || p.FinalLoop < expected.DurationLoops ||
                !double.IsFinite(p.DamageDealt) || p.DamageDealt < 0 || !double.IsFinite(p.DamageTaken) || p.DamageTaken < 0)) return false;
        var allowed = expected.Roster.Select(p => (p.AccountId, p.ScorePlayerId)).ToHashSet();
        return document.Players.Select(p => (p.AccountId, p.ScorePlayerId)).Distinct().Count() == document.Players.Count &&
            document.Players.All(p => allowed.Contains((p.AccountId, p.ScorePlayerId)));
    }
}
