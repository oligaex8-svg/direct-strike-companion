using System.Diagnostics;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class LobbyOcrWorkerTests
{
    internal static void Run(Action<bool, string> assert) => RunAsync(assert).GetAwaiter().GetResult();

    private static ProcessStartInfo FakeLaunch(string startup = "ready")
        => ReplayDecodeWorker.LaunchInfo("--fake-lobby-ocr-worker", "--startup", startup);

    private static async Task RunAsync(Action<bool, string> assert)
    {
        LobbyOcrWorker Fixture(TimeSpan? timeout = null) => new(() => FakeLaunch(), readTimeout: timeout);
        var launch = LobbyOcrWorker.LaunchInfo("C:\\fixture with spaces\\reader.ps1", "C:\\fixture with spaces\\companion.exe");
        assert(launch.FileName == Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe")
            && launch.ArgumentList.Contains("-Worker") && launch.ArgumentList.Contains("C:\\fixture with spaces\\reader.ps1")
            && launch.StandardInputEncoding?.WebName == "utf-8" && launch.StandardOutputEncoding?.WebName == "utf-8"
            && launch.StandardErrorEncoding?.WebName == "utf-8" && launch.CreateNoWindow && !launch.UseShellExecute,
            "screen reader launches system Windows PowerShell with separate arguments and UTF-8 redirected pipes");
        assert(launch.StandardOutputEncoding?.DecoderFallback is DecoderExceptionFallback
            && launch.StandardErrorEncoding?.DecoderFallback is DecoderReplacementFallback,
            "screen reader keeps protocol decoding strict and diagnostic decoding tolerant");

        await using (var worker = Fixture())
        {
            assert(worker.Snapshot.ProcessId == null && worker.Snapshot.StartCount == 0, "screen reader starts lazily before the first requested frame");
            using var first = await worker.ReadAsync(imagePath: "first", diagnostics: true);
            using var second = await worker.ReadAsync(imagePath: "stderr");
            assert(!first.Telemetry.Warm && second.Telemetry.Warm && first.Telemetry.ProcessId == second.Telemetry.ProcessId
                && worker.Snapshot.StartCount == 1 && first.Result.GetProperty("diagnostics").GetBoolean()
                && first.Result.GetProperty("text").GetString() == "Игрок 名字",
                "two screen frames reuse one contained process and preserve request options and Unicode");
            assert(second.Telemetry.ReaderElapsedMs == 7 && second.Telemetry.TotalElapsedMs >= 0
                && worker.Snapshot.StderrTail.Length == LobbyOcrWorker.MaxStderrChars
                && worker.Snapshot.StderrTail.EndsWith("fixture stderr tail", StringComparison.Ordinal),
                "screen reader drains a full stderr pipe continuously with bounded tail and frame telemetry");
            using var unavailable = await worker.ReadAsync(imagePath: "unavailable");
            using var next = await worker.ReadAsync(imagePath: "after-unavailable");
            assert(unavailable.Result.GetProperty("status").GetString() == "unavailable"
                && next.Telemetry.ProcessId == first.Telemetry.ProcessId && next.Telemetry.Warm,
                "ordinary unavailable frame keeps the screen reader healthy for a fresh request");
            var a = worker.ReadAsync(imagePath: "serial-a");
            var b = worker.ReadAsync(imagePath: "serial-b");
            using var frameA = await a;
            using var frameB = await b;
            assert(frameA.Result.GetProperty("fixture").GetString() == "serial-a"
                && frameB.Result.GetProperty("fixture").GetString() == "serial-b"
                && frameA.Document.RootElement.GetProperty("requestId").GetString() != frameB.Document.RootElement.GetProperty("requestId").GetString()
                && frameA.Telemetry.ProcessId == frameB.Telemetry.ProcessId,
                "concurrent callers are serialized and receive only their own correlated frames");
            using var process = Process.GetProcessById(first.Telemetry.ProcessId);
            var clock = Stopwatch.StartNew();
            await worker.DisposeAsync();
            await WaitExitedAsync(process);
            assert(process.HasExited && clock.Elapsed < TimeSpan.FromSeconds(2) && worker.Snapshot.ProcessId == null,
                "idle disposal kills the waiting screen reader within two seconds");
        }

        foreach (var malformedStderr in new[] { false, true })
        {
            await using var worker = Fixture();
            using var first = await worker.ReadAsync(imagePath: "healthy");
            if (malformedStderr)
            {
                using var healthy = await worker.ReadAsync(imagePath: "stderr-invalid-utf8");
                assert(healthy.Telemetry.Warm && healthy.Telemetry.ProcessId == first.Telemetry.ProcessId,
                    "invalid UTF-8 diagnostic bytes leave the protocol and healthy worker intact");
            }
            IOException? error = null;
            var clock = Stopwatch.StartNew();
            try { using var ignored = await worker.ReadAsync(imagePath: "stderr-eof"); }
            catch (IOException ex) { error = ex; }
            var snapshot = worker.Snapshot;
            assert(error?.Message.Contains("fixture fatal stderr at EOF", StringComparison.Ordinal) == true
                && snapshot.StderrTail.Contains("fixture fatal stderr at EOF", StringComparison.Ordinal)
                && snapshot.StderrTail.Length <= LobbyOcrWorker.MaxStderrChars && snapshot.ProcessId == null
                && clock.Elapsed < TimeSpan.FromSeconds(4),
                malformedStderr ? "diagnostic collector continues after invalid UTF-8 and preserves the subsequent EOF error"
                    : "immediate stderr and EOF preserve the fatal diagnostic before bounded stream disposal");
            if (malformedStderr)
                assert(snapshot.StderrTail.Contains("fixture text before invalid UTF-8", StringComparison.Ordinal)
                    && snapshot.StderrTail.Contains("fixture text after invalid UTF-8", StringComparison.Ordinal)
                    && snapshot.StderrTail.Contains('\uFFFD'),
                    "malformed diagnostic bytes are replaced while surrounding diagnostic text survives");
        }

        foreach (var failure in new[] { "invalid", "correlation", "oversize", "eof", "truncated", "incomplete" })
        {
            await using var worker = Fixture();
            using var before = await worker.ReadAsync(imagePath: "healthy");
            using var process = Process.GetProcessById(before.Telemetry.ProcessId);
            var rejected = false;
            try { using var ignored = await worker.ReadAsync(imagePath: failure); }
            catch (IOException) { rejected = true; }
            await WaitExitedAsync(process);
            assert(rejected && process.HasExited && worker.Snapshot.ProcessId == null
                && worker.Snapshot.LastError?.Contains("Screen reader frame", StringComparison.Ordinal) == true,
                $"{failure} screen reader protocol failure retires its contained process with the exact frame error");
            using var after = await worker.ReadAsync(imagePath: "after-" + failure);
            assert(!after.Telemetry.Warm && after.Telemetry.ProcessId != before.Telemetry.ProcessId
                && after.Telemetry.StartCount == 2 && after.Result.GetProperty("fixture").GetString() == "after-" + failure,
                $"screen reader starts a new process after {failure} without resubmitting the failed frame");
        }

        foreach (var startup in new[] { "invalid", "version", "eof", "hang" })
        {
            int starts = 0;
            await using var worker = new LobbyOcrWorker(() => FakeLaunch(starts++ == 0 ? startup : "ready"), startupTimeout: TimeSpan.FromSeconds(1));
            bool rejected = false;
            var clock = Stopwatch.StartNew();
            try { using var ignored = await worker.ReadAsync(imagePath: "never-sent"); }
            catch (Exception ex) when (ex is IOException or TimeoutException) { rejected = true; }
            assert(rejected && clock.Elapsed < TimeSpan.FromSeconds(4) && worker.Snapshot.ProcessId == null
                && worker.Snapshot.LastError?.Contains("startup", StringComparison.Ordinal) == true,
                $"{startup} screen reader startup is bounded and reports its actual startup failure");
            using var recovered = await worker.ReadAsync(imagePath: "first-after-startup");
            assert(recovered.Result.GetProperty("fixture").GetString() == "first-after-startup" && recovered.Telemetry.StartCount == 2,
                $"reader recovers after {startup} startup without sending the abandoned request");
        }

        await using (var worker = Fixture(TimeSpan.FromSeconds(1)))
        {
            using var before = await worker.ReadAsync(imagePath: "healthy");
            using var process = Process.GetProcessById(before.Telemetry.ProcessId);
            bool timedOut = false;
            var clock = Stopwatch.StartNew();
            try { using var ignored = await worker.ReadAsync(imagePath: "hang"); } catch (TimeoutException) { timedOut = true; }
            await WaitExitedAsync(process);
            assert(timedOut && process.HasExited && clock.Elapsed < TimeSpan.FromSeconds(4), "frame deadline terminates a stalled screen reader with a bounded timeout");
            using var after = await worker.ReadAsync(imagePath: "after-timeout");
            assert(after.Result.GetProperty("fixture").GetString() == "after-timeout" && !after.Telemetry.Warm,
                "fresh frame after timeout cannot receive or replay the stale request");
        }

        var testRoot = Path.Combine(Path.GetTempPath(), "DscOcrWorkerTests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testRoot);
        try
        {
            foreach (var failure in new[] { "timeout", "cancel", "resource", "dispose", "eof" })
                await TreeCleanupAsync(failure, Path.Combine(testRoot, failure + ".pid"), assert);
        }
        finally { Directory.Delete(testRoot, true); }

        await using (var worker = Fixture())
        {
            using var alreadyCanceled = new CancellationTokenSource();
            alreadyCanceled.Cancel();
            bool canceled = false;
            try { using var ignored = await worker.ReadAsync(alreadyCanceled.Token); } catch (OperationCanceledException) { canceled = true; }
            assert(canceled && worker.Snapshot.StartCount == 0, "already canceled frame never starts a screen reader");
            bool paused = false;
            try { using var ignored = await worker.ReadAsync(resourcePauseReason: () => "fixture CPU pause"); } catch (LobbyOcrResourceException) { paused = true; }
            assert(paused && worker.Snapshot.StartCount == 0, "preexisting resource pause prevents screen reader startup");
        }
    }

    private static async Task TreeCleanupAsync(string failure, string marker, Action<bool, string> assert)
    {
        await using var worker = new LobbyOcrWorker(() => FakeLaunch(), readTimeout: failure == "timeout" ? TimeSpan.FromSeconds(1) : null);
        using var before = await worker.ReadAsync(imagePath: "healthy");
        using var parent = Process.GetProcessById(before.Telemetry.ProcessId);
        using var cancellation = new CancellationTokenSource();
        bool resourceExceeded = false;
        var pending = worker.ReadAsync(cancellation.Token, "tree-" + failure + ":" + marker,
            resourcePauseReason: () => resourceExceeded ? "fixture CPU pause" : null);
        Process? descendant = null;
        try
        {
            var waiting = Stopwatch.StartNew();
            int pid = 0;
            while (waiting.Elapsed < TimeSpan.FromSeconds(5))
            {
                if (File.Exists(marker) && int.TryParse(File.ReadAllText(marker), out pid)) break;
                if (pending.IsCompleted) break;
                await Task.Delay(25);
            }
            assert(pid != 0, $"{failure} fixture creates an owned descendant after job assignment");
            descendant = Process.GetProcessById(pid);
            var clock = Stopwatch.StartNew();
            if (failure == "cancel") cancellation.Cancel();
            if (failure == "resource") resourceExceeded = true;
            if (failure == "dispose") await worker.DisposeAsync();
            if (failure == "eof") File.WriteAllText(marker + ".release", "exit");
            Exception? error = null;
            try { using var ignored = await pending; } catch (Exception ex) { error = ex; }
            await WaitExitedAsync(parent);
            await WaitExitedAsync(descendant);
            assert(error != null && (failure != "cancel" && failure != "dispose" || error is OperationCanceledException)
                && (failure != "resource" || error is LobbyOcrResourceException)
                && (failure != "timeout" || error is TimeoutException)
                && (failure != "eof" || error is IOException && error.Message.Contains("exited", StringComparison.OrdinalIgnoreCase))
                && parent.HasExited && descendant.HasExited && worker.Snapshot.ProcessId == null
                && clock.Elapsed < TimeSpan.FromSeconds(failure == "dispose" ? 2 : 4),
                $"{failure} stops the screen reader and its owned descendants within a bounded wait (error={error?.GetType().Name}, parentExited={parent.HasExited}, descendantExited={descendant.HasExited}, elapsed={clock.Elapsed.TotalSeconds:F3}s)");
            if (failure != "dispose")
            {
                resourceExceeded = false;
                using var after = await worker.ReadAsync(imagePath: "after-" + failure);
                assert(after.Telemetry.ProcessId != before.Telemetry.ProcessId && after.Result.GetProperty("fixture").GetString() == "after-" + failure,
                    $"fresh frame recovers after {failure} without consuming a stale response");
            }
        }
        finally
        {
            cancellation.Cancel();
            await worker.DisposeAsync();
            try { using var ignored = await pending; } catch { }
            if (descendant != null)
            {
                if (!descendant.HasExited) { descendant.Kill(true); await WaitExitedAsync(descendant); }
                descendant.Dispose();
            }
        }
    }

    private static async Task WaitExitedAsync(Process process)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        try { await process.WaitForExitAsync(timeout.Token); } catch (OperationCanceledException) { }
    }

    // CLI-only child: no OCR, capture, settings, UI or game input is initialized.
    internal static void RunFakeWorker(string[] args) => RunFakeWorkerAsync(args).GetAwaiter().GetResult();
    private static async Task RunFakeWorkerAsync(string[] args)
    {
        if (args.Contains("--descendant")) { await Task.Delay(Timeout.Infinite); return; }
        var index = Array.IndexOf(args, "--startup");
        var startup = index >= 0 && index + 1 < args.Length ? args[index + 1] : "ready";
        var output = Console.OpenStandardOutput();
        async Task Write(string value) { await output.WriteAsync(Encoding.UTF8.GetBytes(value + "\n")); await output.FlushAsync(); }
        if (startup == "hang") { await Task.Delay(Timeout.Infinite); return; }
        if (startup == "eof") return;
        if (startup == "invalid") { await Write("fixture invalid readiness"); await Task.Delay(Timeout.Infinite); return; }
        if (startup == "version") { await Write("{\"ready\":true,\"protocol\":2}"); await Task.Delay(Timeout.Infinite); return; }
        await Write("{\"ready\":true,\"protocol\":1}");
        using var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false, true));
        while (await input.ReadLineAsync() is { } line)
        {
            using var request = JsonDocument.Parse(line);
            var requestId = request.RootElement.GetProperty("requestId").GetString();
            var behavior = request.RootElement.GetProperty("imagePath").GetString() ?? "healthy";
            if (behavior.StartsWith("tree-", StringComparison.Ordinal))
            {
                var separator = behavior.IndexOf(':');
                var mode = behavior[5..separator];
                using var descendant = Process.Start(ReplayDecodeWorker.LaunchInfo("--fake-lobby-ocr-worker", "--descendant"))
                    ?? throw new IOException("Cannot start fake OCR descendant.");
                File.WriteAllText(behavior[(separator + 1)..], descendant.Id.ToString());
                if (mode == "eof")
                {
                    while (!File.Exists(behavior[(separator + 1)..] + ".release")) await Task.Delay(25);
                    return;
                }
                await Task.Delay(Timeout.Infinite);
                return;
            }
            if (behavior == "hang") { await Task.Delay(Timeout.Infinite); return; }
            if (behavior == "eof") return;
            if (behavior == "stderr-eof")
            {
                var stderr = Console.OpenStandardError();
                await stderr.WriteAsync(Encoding.UTF8.GetBytes("fixture fatal stderr at EOF"));
                await stderr.FlushAsync();
                return; // No artificial delay between diagnostics and EOF.
            }
            if (behavior == "stderr-invalid-utf8")
            {
                var stderr = Console.OpenStandardError();
                await stderr.WriteAsync(Encoding.UTF8.GetBytes("fixture text before invalid UTF-8 "));
                await stderr.WriteAsync(new byte[] { 0xC3, 0x28, 0xFF });
                await stderr.WriteAsync(Encoding.UTF8.GetBytes(" fixture text after invalid UTF-8 "));
                await stderr.FlushAsync();
            }
            if (behavior == "invalid") { await Write("fixture invalid JSON"); continue; }
            if (behavior == "oversize") { await output.WriteAsync(new byte[LobbyOcrWorker.MaxResponseBytes + 1]); await output.FlushAsync(); continue; }
            if (behavior == "truncated") { await output.WriteAsync(Encoding.UTF8.GetBytes("{\"requestId\":")); await output.FlushAsync(); return; }
            if (behavior == "stderr")
            {
                var stderr = Console.OpenStandardError();
                await stderr.WriteAsync(Encoding.UTF8.GetBytes(new string('x', 128 * 1024) + "fixture stderr tail"));
                await stderr.FlushAsync();
                // Ordering between the two pipes is not guaranteed; give the
                // continuously running tail reader a deterministic opportunity.
                await Task.Delay(100);
            }
            if (behavior == "incomplete") { await Write(JsonSerializer.Serialize(new { requestId, result = new { }, readerElapsedMs = -1 })); continue; }
            await Write(JsonSerializer.Serialize(new
            {
                requestId = behavior == "correlation" ? "wrong-request" : requestId,
                result = new
                {
                    fixture = behavior, pid = Environment.ProcessId, text = "Игрок 名字",
                    status = behavior == "unavailable" ? "unavailable" : "fixture",
                    diagnostics = request.RootElement.GetProperty("diagnostics").GetBoolean(),
                    captureTimestampUtcMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                },
                readerElapsedMs = 7
            }, new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        }
    }
}
