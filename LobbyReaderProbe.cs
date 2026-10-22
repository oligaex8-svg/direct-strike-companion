using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class LobbyReaderProbe
{
    internal static async Task RunAsync(string[] args)
    {
        var index = Array.IndexOf(args, "--probe-lobby-reader");
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var scriptPath = Path.Combine(root, "runtime-probe-LobbyOcr.ps1");
        var unusableTemp = args.Contains("--unusable-temp");
        var unusableTempPath = Path.Combine(root, "temp-is-a-file-" + Guid.NewGuid().ToString("N") + ".txt");
        ProcessStartInfo ProbeLaunch()
        {
            var info = LobbyOcrWorker.LaunchInfo(scriptPath, Environment.ProcessPath!);
            if (unusableTemp) { info.Environment["TEMP"] = unusableTempPath; info.Environment["TMP"] = unusableTempPath; }
            return info;
        }
        try
        {
            if (index < 0 || index + 1 >= args.Length || !File.Exists(args[index + 1])) throw new ArgumentException("A screenshot fixture is required.");
            if (unusableTemp) File.WriteAllText(unusableTempPath, "Deliberately a file, so this path cannot act as a temporary directory.");
            EmbeddedAssets.ExtractOcrRuntime(scriptPath);
            var scriptHash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(scriptPath)));
            var image = Path.GetFullPath(args[index + 1]);
            // This diagnostic command is intentionally tied to the regression
            // screenshot; parity alone would miss a name omitted by both paths.
            string[] expected = ["Ваня Кузьмич", "Константин Юсупов", "TKnight", "bombplay", "jejo", "ChudoNapas"];
            var coldReads = new List<object>();
            string[]? baseline = null;
            for (var iteration = 0; iteration < 3; iteration++)
            {
                var info = ProbeLaunch();
                info.ArgumentList.Remove("-Worker");
                info.ArgumentList.Add("-ImagePath"); info.ArgumentList.Add(image); info.ArgumentList.Add("-Diagnostics");
                using var process = new Process { StartInfo = info };
                var clock = Stopwatch.StartNew();
                process.Start(); process.PriorityClass = ProcessPriorityClass.BelowNormal;
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
                var error = process.StandardError.ReadToEndAsync(timeout.Token);
                try { await process.WaitForExitAsync(timeout.Token); }
                catch { if (!process.HasExited) process.Kill(true); throw; }
                var stderr = await error;
                if (process.ExitCode != 0) throw new IOException(stderr);
                using var document = JsonDocument.Parse(await output);
                var names = Names(document.RootElement);
                if (!expected.SequenceEqual(names)) throw new InvalidDataException("The six-player screenshot has an omitted or incorrect nickname.");
                if (document.RootElement.GetProperty("capture").GetProperty("live").GetBoolean()) throw new InvalidDataException("A screenshot fixture gained live-input authority.");
                if (baseline != null && !baseline.SequenceEqual(names)) throw new InvalidDataException("Cold screenshot readings differ.");
                baseline = names;
                if (iteration == 0) File.WriteAllText(Path.Combine(root, "lobby-reader-fixture.json"), document.RootElement.GetRawText());
                coldReads.Add(new { milliseconds = clock.Elapsed.TotalMilliseconds, names, runtime = document.RootElement.GetProperty("runtime").Clone() });
            }
            var warmReads = new List<LobbyOcrTelemetry>();
            await using (var reader = new LobbyOcrWorker(ProbeLaunch))
            {
                int? pid = null;
                for (var iteration = 0; iteration < 5; iteration++)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                    using var frame = await reader.ReadAsync(timeout.Token, image, true);
                    if (!baseline!.SequenceEqual(Names(frame.Result))) throw new InvalidDataException("Warm reading differs from the exact cold screenshot result.");
                    if (pid != null && pid != frame.Telemetry.ProcessId) throw new InvalidDataException("Warm worker was replaced.");
                    if (frame.Result.GetProperty("capture").GetProperty("live").GetBoolean()) throw new InvalidDataException("A screenshot fixture gained live-input authority.");
                    pid = frame.Telemetry.ProcessId;
                    warmReads.Add(frame.Telemetry);
                }
            }
            var warmed = warmReads.Skip(1).Select(read => read.TotalElapsedMs).Order().ToArray();
            if (unusableTemp && (!File.Exists(unusableTempPath) || Directory.Exists(unusableTempPath))) throw new InvalidDataException("The invalid TEMP/TMP fixture changed.");
            var report = new { success = true, scriptHash, unusableTemp, names = baseline, coldReads, warmReads, warmedMedianMs = (warmed[1] + warmed[2]) / 2 };
            File.WriteAllText(Path.Combine(root, unusableTemp ? "lobby-reader-unusable-temp.json" : "lobby-reader-performance.json"), JsonSerializer.Serialize(report, Store.Json));
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(root, unusableTemp ? "lobby-reader-unusable-temp.json" : "lobby-reader-performance.json"), JsonSerializer.Serialize(new { success = false, error = ex.ToString() }, Store.Json));
            Environment.ExitCode = 1;
        }
        finally { if (unusableTemp && File.Exists(unusableTempPath)) File.Delete(unusableTempPath); }
    }

    private static string[] Names(JsonElement result) => result.GetProperty("rosterNames").EnumerateArray().Select(name => name.GetString()!).ToArray();

    // Read-only native capture probe. Results never reach automation or private
    // settings, and the normal borderless/window-identity gates still apply.
    internal static async Task RunLiveAsync()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var scriptPath = Path.Combine(root, "runtime-live-probe-LobbyOcr.ps1");
        try
        {
            EmbeddedAssets.ExtractOcrRuntime(scriptPath);
            var reads = new List<object>();
            var reader = new LobbyOcrWorker(scriptPath, Environment.ProcessPath!);
            await using (reader)
            {
                int? workerPid = null;
                DateTime? previousCapture = null;
                for (var index = 0; index < 3; index++)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                    using var frame = await reader.ReadAsync(timeout.Token);
                    var result = frame.Result;
                    if (!result.TryGetProperty("capture", out var capture) || !capture.GetProperty("live").GetBoolean())
                        throw new IOException(result.GetProperty("status").GetString());
                    var timestamp = capture.GetProperty("capturedAt").GetDateTime();
                    if (previousCapture != null && timestamp <= previousCapture) throw new InvalidDataException("Native capture timestamp did not advance.");
                    if (workerPid != null && workerPid != frame.Telemetry.ProcessId) throw new InvalidDataException("Live reader was replaced between captures.");
                    if (capture.TryGetProperty("method", out var method) && method.GetString() == "window" && !capture.GetProperty("borderless").GetBoolean())
                        throw new InvalidDataException("Background capture did not remain borderless.");
                    workerPid = frame.Telemetry.ProcessId;
                    previousCapture = timestamp;
                    reads.Add(new { telemetry = frame.Telemetry, capture = capture.Clone(), status = result.GetProperty("status").GetString(), names = Names(result) });
                }
            }
            if (reader.Snapshot.ProcessId != null) throw new InvalidDataException("Live probe left its reader running.");
            File.WriteAllText(Path.Combine(root, "lobby-reader-live.json"), JsonSerializer.Serialize(new { success = true, readOnly = true, readerStopped = true, reads }, Store.Json));
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(root, "lobby-reader-live.json"), JsonSerializer.Serialize(new { success = false, error = ex.ToString() }, Store.Json));
            Environment.ExitCode = 1;
        }
    }
}
