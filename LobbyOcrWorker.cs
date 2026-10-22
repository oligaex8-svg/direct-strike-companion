using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal sealed record LobbyOcrTelemetry(bool Warm, int ProcessId, int StartCount, double ReaderElapsedMs, double TotalElapsedMs);
internal sealed record LobbyOcrWorkerSnapshot(int? ProcessId, int StartCount, string? LastError, string StderrTail);
internal sealed class LobbyOcrResourceException(string reason) : IOException(reason);

// The result borrows its JSON from Document; dispose after consuming this frame.
internal sealed class LobbyOcrFrame(JsonDocument document, LobbyOcrTelemetry telemetry) : IDisposable
{
    internal JsonDocument Document { get; } = document;
    internal JsonElement Result => Document.RootElement.GetProperty("result");
    internal LobbyOcrTelemetry Telemetry { get; } = telemetry;
    public void Dispose() => Document.Dispose();
}

// Windows OCR initialization remains in one contained child. Requests are strictly
// serialized, correlated and never retried: a lost frame must be captured anew.
internal sealed class LobbyOcrWorker : IAsyncDisposable
{
    internal const int MaxResponseBytes = 2 * 1024 * 1024;
    internal const int MaxStderrChars = 3000;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly UTF8Encoding StderrUtf8 = new(false, false);
    private readonly SemaphoreSlim serial = new(1, 1);
    private readonly CancellationTokenSource lifetime = new();
    private readonly object gate = new();
    private readonly Func<ProcessStartInfo> launch;
    private readonly TimeSpan startupTimeout, readTimeout;
    private WorkerState? worker;
    private int disposed, startCount;
    private string? lastError;
    private string lastStderr = "";

    internal LobbyOcrWorker(string scriptPath, string captureExecutable)
        : this(() => LaunchInfo(scriptPath, captureExecutable)) { }

    internal LobbyOcrWorker(Func<ProcessStartInfo> launch, TimeSpan? startupTimeout = null, TimeSpan? readTimeout = null)
    {
        this.launch = launch ?? throw new ArgumentNullException(nameof(launch));
        this.startupTimeout = ValidateTimeout(startupTimeout);
        this.readTimeout = ValidateTimeout(readTimeout);
    }

    private static TimeSpan ValidateTimeout(TimeSpan? value)
    {
        var result = value ?? TimeSpan.FromSeconds(8);
        if (result <= TimeSpan.Zero || result > TimeSpan.FromSeconds(8)) throw new ArgumentOutOfRangeException(nameof(value));
        return result;
    }

    internal static ProcessStartInfo LaunchInfo(string scriptPath, string captureExecutable)
    {
        var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"));
        foreach (var argument in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-CaptureExecutable", captureExecutable, "-Worker" })
            info.ArgumentList.Add(argument);
        return ConfigurePipes(info);
    }

    private static ProcessStartInfo ConfigurePipes(ProcessStartInfo info)
    {
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
        info.StandardInputEncoding = info.StandardOutputEncoding = Utf8;
        // Diagnostics may contain legacy or malformed bytes. Replacement keeps
        // the bounded collector alive without relaxing the JSON protocol pipe.
        info.StandardErrorEncoding = StderrUtf8;
        return info;
    }

    internal LobbyOcrWorkerSnapshot Snapshot
    {
        get { lock (gate) return new(worker?.Process.Id, startCount, lastError, worker?.StderrTail ?? lastStderr); }
    }

    internal async Task<LobbyOcrFrame> ReadAsync(CancellationToken ct = default, string? imagePath = null,
        bool diagnostics = false, Func<string?>? resourcePauseReason = null)
    {
        var total = Stopwatch.StartNew();
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, lifetime.Token);
        await serial.WaitAsync(linked.Token).ConfigureAwait(false);
        Task? pending = null;
        string phase = "startup";
        try
        {
            ObjectDisposedException.ThrowIf(Volatile.Read(ref disposed) != 0, this);
            CheckBudget(linked.Token, resourcePauseReason);
            var requestId = Guid.NewGuid().ToString("N");
            var request = JsonSerializer.SerializeToUtf8Bytes(new { requestId, imagePath, diagnostics });
            if (request.Length > 64 * 1024) throw new InvalidDataException("Screen reader request exceeds 64 KiB.");
            WorkerState current;
            bool warm;
            lock (gate)
            {
                ObjectDisposedException.ThrowIf(disposed != 0, this);
                warm = worker != null;
                current = worker ?? Start();
            }
            if (!warm)
            {
                var startup = ReadReadyAsync(current, linked.Token);
                pending = startup;
                await AwaitBoundedAsync(startup, current.Process, startupTimeout, phase, linked.Token, resourcePauseReason).ConfigureAwait(false);
            }
            phase = "frame";
            CheckBudget(linked.Token, resourcePauseReason);
            var exchange = ExchangeAsync(current, request, requestId, linked.Token);
            pending = exchange;
            var response = await AwaitBoundedAsync(exchange, current.Process, readTimeout, phase, linked.Token, resourcePauseReason).ConfigureAwait(false);
            lock (gate) lastError = null;
            return new(response.Document, new(warm, current.Process.Id, current.StartCount, response.ReaderElapsedMs, total.Elapsed.TotalMilliseconds));
        }
        catch (Exception ex)
        {
            await StopAsync().ConfigureAwait(false);
            lock (gate) lastError = $"Screen reader {phase}: {ex.Message}" + (string.IsNullOrWhiteSpace(lastStderr) ? "" : $" Stderr: {lastStderr}");
            // The killed child's pipe IO can complete after the bounded stop.
            // Dispose a response that lost the deadline race and observe faults.
            if (pending != null) _ = pending.ContinueWith(task =>
            {
                if (task is Task<Response> result && result.Status == TaskStatus.RanToCompletion) result.Result.Document.Dispose();
                _ = task.Exception;
            }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            if (ex is OperationCanceledException or LobbyOcrResourceException) throw;
            if (ex is TimeoutException) throw new TimeoutException(Snapshot.LastError, ex);
            throw new IOException(Snapshot.LastError, ex);
        }
        finally { serial.Release(); }
    }

    private WorkerState Start()
    {
        var job = ReplayDecodeWorker.KillOnCloseJob.Create();
        Process? process = null;
        try
        {
            process = Process.Start(ConfigurePipes(launch())) ?? throw new IOException("Screen reader process did not start.");
            var count = ++startCount;
            // Do not send any capture request until assignment succeeds.
            job.Assign(process);
            process.PriorityClass = ProcessPriorityClass.BelowNormal;
            worker = new(process, job, count);
            lastStderr = "";
            return worker;
        }
        catch
        {
            job.Dispose();
            if (process != null)
            {
                try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } catch (Win32Exception) { }
                process.Dispose();
            }
            throw;
        }
    }

    private static async Task<bool> ReadReadyAsync(WorkerState current, CancellationToken ct)
    {
        var line = await current.Lines.ReadAsync(ct).ConfigureAwait(false) ?? throw new IOException("Screen reader exited before startup readiness.");
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("ready", out var ready) || ready.ValueKind != JsonValueKind.True
            || !root.TryGetProperty("protocol", out var protocol) || !protocol.TryGetInt32(out var version) || version != 1)
            throw new InvalidDataException("Screen reader returned invalid startup readiness (expected protocol 1).");
        return true;
    }

    private sealed record Response(JsonDocument Document, double ReaderElapsedMs);
    private static async Task<Response> ExchangeAsync(WorkerState current, byte[] request, string requestId, CancellationToken ct)
    {
        var input = current.Process.StandardInput.BaseStream;
        await input.WriteAsync(request, ct).ConfigureAwait(false);
        await input.WriteAsync(new byte[] { (byte)'\n' }, ct).ConfigureAwait(false);
        await input.FlushAsync(ct).ConfigureAwait(false);
        var line = await current.Lines.ReadAsync(ct).ConfigureAwait(false) ?? throw new IOException("Screen reader exited without a frame response.");
        var document = JsonDocument.Parse(line);
        try
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("requestId", out var correlation)
                || correlation.ValueKind != JsonValueKind.String || correlation.GetString() != requestId)
                throw new InvalidDataException("Screen reader frame response has the wrong request correlation.");
            if (!root.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("readerElapsedMs", out var elapsed) || elapsed.ValueKind != JsonValueKind.Number
                || !elapsed.TryGetDouble(out var milliseconds) || !double.IsFinite(milliseconds) || milliseconds < 0)
                throw new InvalidDataException("Screen reader frame response is incomplete.");
            return new(document, milliseconds);
        }
        catch { document.Dispose(); throw; }
    }

    private static void CheckBudget(CancellationToken ct, Func<string?>? resourcePauseReason)
    {
        ct.ThrowIfCancellationRequested();
        if (resourcePauseReason?.Invoke() is { } reason) throw new LobbyOcrResourceException(reason);
    }

    private static async Task<T> AwaitBoundedAsync<T>(Task<T> pending, Process process, TimeSpan timeout, string phase, CancellationToken ct, Func<string?>? budget)
    {
        var clock = Stopwatch.StartNew();
        while (true)
        {
            CheckBudget(ct, budget);
            var remaining = timeout - clock.Elapsed;
            if (remaining <= TimeSpan.Zero) throw new TimeoutException($"Screen reader {phase} exceeded {timeout.TotalSeconds:g} seconds; worker stopped.");
            if (pending.IsCompleted) return await pending.ConfigureAwait(false);
            // A descendant can inherit the worker's stdout handle and keep its
            // pipe open after the worker exits. Parent death must retire the job
            // independently of pipe EOF, rather than wait for the frame timeout.
            if (process.HasExited) throw new IOException($"Screen reader process exited (code {process.ExitCode}) before its {phase} response; worker stopped.");
            await Task.WhenAny(pending, Task.Delay(remaining < TimeSpan.FromMilliseconds(250) ? remaining : TimeSpan.FromMilliseconds(250), ct)).ConfigureAwait(false);
        }
    }

    private async Task StopAsync()
    {
        WorkerState? previous;
        lock (gate) { previous = worker; worker = null; }
        if (previous == null) return;
        var clock = Stopwatch.StartNew();
        previous.Job.Dispose(); // Includes descendants even if the parent exited first.
        try
        {
            try
            {
                if (!previous.Process.HasExited) previous.Process.Kill(true);
                using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(1500));
                await previous.Process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { } catch (InvalidOperationException) { } catch (Win32Exception) { }
            // Process.Dispose closes redirected streams. Drain bytes already
            // written at EOF before that close, within the same stop deadline.
            var remaining = TimeSpan.FromMilliseconds(1750) - clock.Elapsed;
            if (remaining > TimeSpan.Zero) await Task.WhenAny(previous.StderrDrain, Task.Delay(remaining)).ConfigureAwait(false);
            lock (gate) lastStderr = previous.StderrTail;
        }
        finally { previous.Process.Dispose(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        lifetime.Cancel();
        // Cancellation wakes a serialized active exchange. Closing containment
        // immediately also stops a healthy child which is waiting idle on stdin.
        await StopAsync().ConfigureAwait(false);
    }

    private sealed class WorkerState
    {
        internal Process Process { get; }
        internal ReplayDecodeWorker.KillOnCloseJob Job { get; }
        internal BoundedLines Lines { get; }
        internal Task StderrDrain { get; }
        internal int StartCount { get; }
        private readonly object stderrGate = new();
        private string stderr = "";
        internal string StderrTail { get { lock (stderrGate) return stderr; } }
        internal WorkerState(Process process, ReplayDecodeWorker.KillOnCloseJob job, int startCount)
        {
            Process = process; Job = job; StartCount = startCount;
            Lines = new(process.StandardOutput.BaseStream);
            StderrDrain = DrainAsync(process.StandardError);
        }
        private async Task DrainAsync(StreamReader stream)
        {
            try
            {
                var buffer = new char[1024];
                int count;
                while ((count = await stream.ReadAsync(buffer).ConfigureAwait(false)) != 0)
                {
                    lock (stderrGate)
                    {
                        stderr += new string(buffer, 0, count);
                        if (stderr.Length > MaxStderrChars) stderr = stderr[^MaxStderrChars..];
                    }
                }
            }
            catch (IOException) { } catch (ObjectDisposedException) { } catch (DecoderFallbackException) { }
        }
    }

    private sealed class BoundedLines(Stream stream)
    {
        private readonly byte[] buffer = new byte[4096];
        private int offset, count;
        internal async Task<byte[]?> ReadAsync(CancellationToken ct)
        {
            using var line = new MemoryStream();
            while (true)
            {
                if (offset == count)
                {
                    count = await stream.ReadAsync(buffer, ct).ConfigureAwait(false); offset = 0;
                    if (count == 0)
                    {
                        if (line.Length == 0) return null;
                        throw new InvalidDataException("Screen reader line ended before its newline.");
                    }
                }
                var end = Array.IndexOf(buffer, (byte)'\n', offset, count - offset);
                var length = (end < 0 ? count : end) - offset;
                if (line.Length + length > MaxResponseBytes) throw new InvalidDataException("Screen reader line exceeds 2 MiB.");
                line.Write(buffer, offset, length); offset += length;
                if (end >= 0) { offset++; return line.ToArray(); }
            }
        }
    }
}
