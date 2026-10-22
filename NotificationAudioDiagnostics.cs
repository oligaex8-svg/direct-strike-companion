using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class NotificationAudioDiagnostics
{
    internal static void Run(string[] args)
    {
        int index = Array.IndexOf(args, "--probe-notification-audio");
        string preset = index + 1 < args.Length ? args[index + 1] : "sc1-roll-out";
        int volume = index + 2 < args.Length && int.TryParse(args[index + 2], out var parsed) ? parsed : 50;
        using var audio = new NotificationSounds();
        audio.Play(GameSound.Accept, preset, volume);
        var deadline = DateTime.UtcNow.AddSeconds(8);
        NotificationPlaybackSnapshot snapshot;
        do
        {
            Thread.Sleep(50);
            snapshot = audio.Snapshot();
        } while (snapshot.Status is "Queued" or "Playing" && DateTime.UtcNow < deadline);
        var report = new { success = snapshot.Status == "Playback completed", snapshot, scope = "Native Windows sound playback returned successfully; speaker audibility is unverified." };
        var directory = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "native-notification-audio.json"), JsonSerializer.Serialize(report, Store.Json));
        Console.WriteLine(JsonSerializer.Serialize(report, Store.Json));
        if (!report.success) Environment.ExitCode = 1;
    }
}
