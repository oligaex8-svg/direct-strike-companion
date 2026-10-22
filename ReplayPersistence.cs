using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal sealed record ReplayFileCompletion(string Path, long LastWriteTicks, Match? Match = null, string? Error = null, string? FailureSignature = null);

public sealed partial class Store
{
    private static readonly JsonSerializerOptions JournalJson = new(JsonSerializerDefaults.Web);
    private string ReplayJournalPath => Path.Combine(DirectoryPath, "replay-completions.jsonl");
    private bool loadedBackup;
    private bool journalWriteFaulted;
    public string? RecoveryNotice { get; private set; }

    private Database LoadDatabase(string path)
    {
        Database Read(string file) => JsonSerializer.Deserialize<Database>(File.ReadAllText(file), Json) ?? throw new InvalidDataException("Library is empty.");
        try
        {
            if (File.Exists(path)) return Read(path);
            if (!File.Exists(path + ".bak")) return new();
        }
        catch (Exception ex) when (ex is JsonException or InvalidDataException)
        {
            if (!File.Exists(path + ".bak")) throw;
        }
        var backup = Read(path + ".bak");
        loadedBackup = true;
        RecoveryNotice = "Recovered saved library from its backup.";
        return backup;
    }

    internal ReplayImportResult CommitReplay(ReplayFileCompletion completion, Action<Stream, byte[]>? append = null)
    {
        lock (Gate)
        {
            if (journalWriteFaulted) { RecoverReplayJournal(); journalWriteFaulted = false; }
            // Write first: a Task Manager kill can occur at any following instruction.
            // Flush(true) makes each completed replay durable without serializing
            // the whole library after every small batch.
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(completion, JournalJson) + "\n");
            using (var stream = new FileStream(ReplayJournalPath, FileMode.Append, FileAccess.Write, FileShare.Read))
            {
                long previousLength = stream.Length;
                try { if (append == null) stream.Write(bytes); else append(stream, bytes); stream.Flush(true); }
                catch
                {
                    journalWriteFaulted = true;
                    try { stream.SetLength(previousLength); stream.Flush(true); journalWriteFaulted = false; }
                    catch (IOException) { /* The next commit must recover before appending. */ }
                    throw;
                }
            }
            return ApplyCompletion(completion);
        }
    }

    private ReplayImportResult ApplyCompletion(ReplayFileCompletion completion)
    {
        var result = completion.Match == null ? ReplayImportResult.Ignored : ImportMatch(completion.Match);
        Data.Files[completion.Path] = completion.LastWriteTicks;
        if (completion.FailureSignature == null) Data.CombatFailures.Remove(completion.Path);
        else Data.CombatFailures[completion.Path] = completion.FailureSignature;
        if (completion.Error != null && !Data.Errors.Contains(completion.Error, StringComparer.Ordinal))
        {
            Data.Errors.Add(completion.Error);
            Data.Errors = Data.Errors.TakeLast(100).ToList();
            AdvanceVersion();
        }
        return result;
    }

    private void RecoverReplayJournal()
    {
        if (!File.Exists(ReplayJournalPath)) return;
        long validBytes = 0;
        int recovered = 0;
        using (var stream = new FileStream(ReplayJournalPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
        {
            if (stream.Length == 0) return;
            stream.Position = stream.Length - 1;
            bool completeTail = stream.ReadByte() == '\n';
            stream.Position = 0;
            using var reader = new StreamReader(stream, new UTF8Encoding(false), false, 4096, leaveOpen: true);
            while (reader.ReadLine() is { } line)
            {
                // A partial final append was never acknowledged as a completion.
                // Keep all preceding records and retry that file on the next scan.
                bool lastPartial = !completeTail && reader.EndOfStream;
                if (lastPartial) { stream.SetLength(validBytes); break; }
                var completion = JsonSerializer.Deserialize<ReplayFileCompletion>(line, JournalJson)
                    ?? throw new InvalidDataException("Replay recovery journal contains an invalid completed record.");
                ApplyCompletion(completion);
                validBytes += Encoding.UTF8.GetByteCount(line) + 1;
                recovered++;
            }
        }
        if (recovered > 0) RecoveryNotice = $"Restored {recovered} completed replay records after an interrupted analysis.";
    }
}
