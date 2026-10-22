using System.Text.Json;
using static DirectStrikeCompanion.Sc2Automation;

namespace DirectStrikeCompanion;

internal static class Sc2ScreenshotTests
{
    private sealed class RejectInput : ISc2Input
    {
        public InputResult TryClick(ScreenCapture capture, ScreenControl target, DateTime now) => throw new Exception("Offline screenshot must never generate native input.");
    }
    internal static void Run(Action<bool, string> assert)
    {
        var detections = new List<object>();
        foreach (var key in new[] { "sc2-invite", "sc2-current-invite", "sc2-repeat-invite", "sc2-party-toast", "sc2-latest-party", "sc2-latest-game", "sc2-lobby" })
        {
            using var source = typeof(Sc2ScreenshotTests).Assembly.GetManifestResourceStream("DscTest:" + key)!;
            using var json = JsonDocument.Parse(source);
            var frame = json.RootElement;
            int width = frame.GetProperty("capture").GetProperty("width").GetInt32(), height = frame.GetProperty("capture").GetProperty("height").GetInt32();
            var now = DateTime.UtcNow;
            var capture = new ScreenCapture(false, now, 123, 456, "SC2_x64", true, true, new(0, 0, width, height), width, height);
            var scene = Detect(frame, capture, ["TKnight"]);
            detections.Add(new { key, width, height, kind = scene.AcceptKind, accept = scene.Accept?.Bounds, offline = true });
            if (key is "sc2-invite" or "sc2-current-invite" or "sc2-repeat-invite" or "sc2-latest-game")
                assert(scene.Accept is { ContextProofs.Count: 3 } && frame.GetProperty("screenReadings").EnumerateArray()
                    .SelectMany(reading => reading.GetProperty("lines").EnumerateArray())
                    .Any(line => line.TryGetProperty("acceptGold", out var gold) && gold.ValueKind == JsonValueKind.True),
                    "actual supplied Game Invite OCR identifies gold Accept and exact invitation context");
            else if (key is "sc2-party-toast" or "sc2-latest-party")
                assert(scene.Accept is { ContextProofs.Count: 1 } && scene.AcceptKind == "party-invite", "supplied party toast OCR identifies its separate invitation sentence and Accept/Decline layout");
            else
                assert(scene.Lobby is { Identity: "TKNIGHT", HasChoices: false }, "actual supplied partial lobby OCR identifies own closed Select dropdown");
            var automation = new Sc2Automation(new RejectInput());
            automation.ObserveClient(JsonSerializer.SerializeToElement(new { isReplay = false, displayTime = 0, players = Array.Empty<object>() }),
                JsonSerializer.SerializeToElement(new { activeScreens = new[] { "ScreenHome", "ScreenLobby" } }), true, now);
            automation.ObserveScreen(frame, new() { AutoAcceptMatch = true, AutoPickCommander = "Random" }, now, ["TKnight"]);
            assert(!automation.SnapshotAt(now).AcceptNeeded, "offline screenshot cannot become a live marker or native action: " + key);
        }
        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "test-output", "invite-screenshot-detection.json"), JsonSerializer.Serialize(detections, Store.Json));
    }
}
