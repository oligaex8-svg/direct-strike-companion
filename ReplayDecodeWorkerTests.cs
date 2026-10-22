using System.Diagnostics;
using System.Security.Cryptography;

namespace DirectStrikeCompanion;

internal static class ReplayDecodeWorkerTests
{
    internal static void Run(Action<bool, string> assert) => RunAsync(assert).GetAwaiter().GetResult();

    private static async Task RunAsync(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DscReplayWorkerTests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var replay = Path.Combine(root, "fixture.SC2Replay");
        File.WriteAllBytes(replay, [1, 2, 3, 4]);
        ReplayDecodeRequest Request(string behavior) => new(replay, behavior, false);
        ReplayDecodeWorker Fixture(TimeSpan? timeout = null, Func<ReplayWorkerResources>? budget = null) => new(timeout ?? TimeSpan.FromSeconds(5), budget ?? (() => new(0, 0)), true);
        try
        {
            await using (var worker = Fixture())
            {
                var first = await worker.DecodeAsync(Request("first"));
                var second = await worker.DecodeAsync(Request("stderr"));
                assert(first.Clans?["fixturePid"] == second.Clans?["fixturePid"] && second.Clans?["hash"] == "stderr", "serial requests reuse one contained decoder and drain a full stderr pipe");
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                var error = await worker.DecodeAsync(Request("error"));
                assert(error.Error != null && process.HasExited && worker.ProcessId == null, "decoder error response discards its process and archive handles");
                var next = await worker.DecodeAsync(Request("healthy"));
                assert(next.Error == null && next.Clans?["hash"] == "healthy" && next.Clans?["fixturePid"] != first.Clans?["fixturePid"], "request after decoder failure starts a clean child");
            }

            await using (var worker = Fixture(TimeSpan.FromSeconds(3)))
            {
                await worker.DecodeAsync(Request("healthy"));
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                var elapsed = Stopwatch.StartNew();
                var timedOut = false;
                try { await worker.DecodeAsync(Request("hang")); } catch (TimeoutException) { timedOut = true; }
                assert(timedOut && elapsed.Elapsed < TimeSpan.FromSeconds(7) && process.HasExited && worker.ProcessId == null, "hard timeout kills an unresponsive parser process within a bounded wait");
                var next = await worker.DecodeAsync(Request("after-timeout"));
                assert(next.Clans?["hash"] == "after-timeout", "request after timeout receives no stale response");
            }

            await using (var worker = Fixture())
            {
                await worker.DecodeAsync(Request("healthy"));
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                using var cancellation = new CancellationTokenSource(250);
                var canceled = false;
                try { await worker.DecodeAsync(Request("slow"), cancellation.Token); } catch (OperationCanceledException) { canceled = true; }
                assert(canceled && process.HasExited && worker.ProcessId == null, "caller cancellation terminates a child instead of abandoning its decoder");
                var next = await worker.DecodeAsync(Request("after-cancel"));
                assert(next.Clans?["hash"] == "after-cancel", "request after cancellation starts fresh without the canceled response");
                using var fresh = Process.GetProcessById(worker.ProcessId!.Value);
                var pending = worker.DecodeAsync(Request("hang"));
                await Task.Delay(100);
                await worker.DisposeAsync();
                try { await pending; } catch (OperationCanceledException) { }
                assert(fresh.HasExited && pending.IsCompleted, "disposing an active scan stops the decoder and releases its pending request");
            }

            foreach (var failure in new[] { "invalid", "oversize", "eof" })
            {
                await using var worker = Fixture();
                await worker.DecodeAsync(Request("healthy"));
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                var rejected = false;
                try { await worker.DecodeAsync(Request(failure)); } catch (Exception ex) when (ex is IOException or InvalidDataException) { rejected = true; }
                assert(rejected && process.HasExited && worker.ProcessId == null, $"{failure} decoder protocol failure is bounded and discards its process");
                var next = await worker.DecodeAsync(Request("after-" + failure));
                assert(next.Clans?["hash"] == "after-" + failure, $"healthy request succeeds after {failure} protocol failure");
            }

            foreach (var resource in new[] { "RAM", "CPU", "GPU", "GPU unavailable" })
            {
                var exceeded = false;
                ReplayWorkerResources Usage() => !exceeded ? new(0, 0, 0) : resource switch
                {
                    "RAM" => new(0, 98, 0), "CPU" => new(90, 0, 0), "GPU" => new(0, 0, 94), _ => new(0, 0, double.NaN)
                };
                await using var worker = Fixture(budget: Usage);
                await worker.DecodeAsync(Request("healthy"));
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                var pending = worker.DecodeAsync(Request("hang"));
                await Task.Delay(100);
                exceeded = true;
                ReplayWorkerResourceException? error = null;
                try { await pending; } catch (ReplayWorkerResourceException ex) { error = ex; }
                assert(error?.Resource == (resource == "GPU unavailable" ? "GPU" : resource) && process.HasExited && worker.ProcessId == null, $"{resource} threshold during decode stops the child with a distinct resumable budget error");
                exceeded = false;
                assert((await worker.DecodeAsync(Request("after-budget"))).Clans?["hash"] == "after-budget", $"decoder recovers after {resource} budget becomes available");
            }

            foreach (var usage in new[] { new ReplayWorkerResources(0, 0, 94), new ReplayWorkerResources(0, 0, double.NaN) })
            {
                await using var worker = Fixture(budget: () => usage);
                bool deferred = false;
                try { await worker.DecodeAsync(Request("healthy")); } catch (ReplayWorkerResourceException ex) { deferred = ex.Resource == "GPU"; }
                assert(deferred && worker.ProcessId == null, "GPU pressure or an unavailable GPU reading blocks decoder startup");
            }
            await TelemetryRecoveryAsync(replay, assert);
            ReplayDecodeWorker.CheckResources(new(89.99, 97.99, 93.99));
            assert(true, "CPU RAM and GPU immediately below their independent thresholds permit replay work");
            static ReplaySystemResources.GpuEngineSample Engine(int pid, string adapter, int engine, double percent, uint status = 0)
                => new($"pid_{pid}_luid_0x00000000_0x{adapter}_phys_0_eng_{engine}_engtype_3D", percent, status);
            var gpu = ReplaySystemResources.BusiestEngine([Engine(1, "00000001", 0, 55), Engine(2, "00000001", 0, 40), Engine(1, "00000001", 1, 35), Engine(3, "00000002", 0, 20)]);
            assert(gpu == 95, "GPU budget sums process utilization on each physical engine and chooses the busiest engine across adapters");
            assert(ReplaySystemResources.BusiestEngine([Engine(1, "00000001", 0, 60), Engine(2, "00000001", 1, 60)]) == 60,
                "independent GPU engines are not added into a false system total");
            assert(double.IsNaN(ReplaySystemResources.BusiestEngine([])) && double.IsNaN(ReplaySystemResources.BusiestEngine([Engine(1, "00000001", 0, double.NaN)])) &&
                double.IsNaN(ReplaySystemResources.BusiestEngine([new("unrecognized", 1)])), "missing invalid and unrecognized GPU observations stay unavailable");
            assert(ReplaySystemResources.BusiestEngine([Engine(1, "00000001", 0, 0), Engine(2, "00000001", 0, 70, 0x800007D1)]) == 0 &&
                ReplaySystemResources.BusiestEngine([Engine(1, "00000001", 0, 70), Engine(2, "00000001", 0, 70)]) == 100,
                "GPU reducer handles exited processes and caps a busy engine without losing recorded idle zeros");

            await using (var worker = new ReplayDecodeWorker(TimeSpan.FromSeconds(5), () => new(0, 0), false))
            {
                var hash = await worker.DecodeAsync(new(replay, "", false, HashOnly: true));
                assert(hash.Hash == Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(replay))) && hash.Match == null && hash.Error == null, "real child hashes a replay without invoking parsing or loading application state");
                using var process = Process.GetProcessById(worker.ProcessId!.Value);
                File.AppendAllText(replay, "changed");
                var changed = await worker.DecodeAsync(new(replay, hash.Hash!, true));
                assert(changed.Error?.Contains("changed after hashing", StringComparison.Ordinal) == true && process.HasExited, "changed replay cannot attach metadata to the previous hash and discards its decoder");
                var oversized = Path.Combine(root, "oversized.SC2Replay");
                using (var stream = File.Create(oversized)) stream.SetLength(ReplayDecodeWorker.MaxReplayBytes + 1L);
                var rejected = false;
                try { await worker.DecodeAsync(new(oversized, "", false, HashOnly: true)); } catch (InvalidDataException) { rejected = true; }
                assert(rejected && worker.ProcessId == null, "oversized replay is rejected before worker startup or file hashing");
                rejected = false;
                try { await worker.DecodeAsync(new(root, "", false, HashOnly: true)); } catch (InvalidDataException) { rejected = true; }
                assert(rejected, "decoder rejects directory requests instead of treating them as replay files");
            }

            await ParentTerminationAsync(replay, Path.Combine(root, "child-pid.txt"), assert);
        }
        finally { Directory.Delete(root, true); }
    }

    private static async Task TelemetryRecoveryAsync(string replay, Action<bool, string> assert)
    {
        ReplayDecodeRequest request = new(replay, "telemetry-recovery", false);
        int reads = 0;
        await using (var worker = new ReplayDecodeWorker(TimeSpan.FromSeconds(5), () => ++reads <= 2 ? new(0, 0, double.NaN) : new(0, 0, 0), true))
        {
            var result = await worker.DecodeAsync(request);
            assert(reads >= 3 && result.Clans?["hash"] == request.Hash, "two transient unavailable GPU preflights recover after bounded fresh observation windows");
        }
        reads = 0;
        await using (var worker = new ReplayDecodeWorker(TimeSpan.FromSeconds(5), () => { reads++; return new(0, 0, double.NaN); }, true))
        {
            bool unavailable = false;
            try { await worker.DecodeAsync(request); } catch (ReplayWorkerResourceException ex) { unavailable = ex.GpuUnavailable; }
            assert(unavailable && reads == 3 && worker.ProcessId == null, "persistent unavailable GPU telemetry stops after three preflight observations without starting a child");
        }
        foreach (var usage in new[] { new ReplayWorkerResources(90, 0, double.NaN), new ReplayWorkerResources(0, 98, double.NaN), new ReplayWorkerResources(0, 0, 94) })
        {
            reads = 0;
            await using var worker = new ReplayDecodeWorker(TimeSpan.FromSeconds(5), () => { reads++; return usage; }, true);
            bool deferred = false;
            try { await worker.DecodeAsync(request); } catch (ReplayWorkerResourceException) { deferred = true; }
            assert(deferred && reads == 1 && worker.ProcessId == null, "a measured CPU RAM or GPU threshold defers immediately without telemetry retries");
        }
        foreach (int failures in new[] { 1, 3 })
        {
            ReplayDecodeWorker? worker = null;
            var children = new List<Process>();
            bool stoppedBeforeFreshObservation = true;
            ReplayWorkerResources Budget()
            {
                if (worker!.ProcessId is { } pid && children.All(p => p.Id != pid))
                {
                    children.Add(Process.GetProcessById(pid));
                    if (children.Count <= failures) return new(0, 0, double.NaN);
                }
                if (worker.ProcessId == null && children.Count > 0) stoppedBeforeFreshObservation &= children.All(p => p.HasExited);
                return new(0, 0, 0);
            }
            worker = new(TimeSpan.FromSeconds(5), Budget, true);
            try
            {
                bool unavailable = false;
                ReplayDecodeResult? result = null;
                try { result = await worker.DecodeAsync(request); } catch (ReplayWorkerResourceException ex) { unavailable = ex.GpuUnavailable; }
                assert(stoppedBeforeFreshObservation && (failures == 1
                    ? result?.Clans?["hash"] == request.Hash && children.Count == 2 && children[0].HasExited
                    : unavailable && children.Count == 3 && children.All(p => p.HasExited) && worker.ProcessId == null),
                    failures == 1 ? "an active unknown GPU reading kills the old child before a fresh preflight and retries the same request successfully"
                        : "repeated active GPU telemetry failures stop after two restarts and leave every attempted child stopped");
            }
            finally { await worker.DisposeAsync(); foreach (var process in children) process.Dispose(); }
        }
        reads = 0;
        using (var cancellation = new CancellationTokenSource())
        await using (var worker = new ReplayDecodeWorker(TimeSpan.FromSeconds(5), () => { reads++; cancellation.CancelAfter(100); return new(0, 0, double.NaN); }, true))
        {
            bool canceled = false;
            try { await worker.DecodeAsync(request, cancellation.Token); } catch (OperationCanceledException) { canceled = true; }
            assert(canceled && reads == 1 && worker.ProcessId == null, "cancellation ends a fresh-telemetry preflight wait without starting a decoder");
        }
        ReplayDecodeWorker? cancelWorker = null;
        Process? stopped = null;
        using var activeCancellation = new CancellationTokenSource();
        ReplayWorkerResources CancelBudget()
        {
            if (cancelWorker!.ProcessId is { } pid && stopped == null)
            {
                stopped = Process.GetProcessById(pid);
                activeCancellation.CancelAfter(100);
                return new(0, 0, double.NaN);
            }
            return new(0, 0, 0);
        }
        cancelWorker = new(TimeSpan.FromSeconds(5), CancelBudget, true);
        try
        {
            bool canceled = false;
            try { await cancelWorker.DecodeAsync(request, activeCancellation.Token); } catch (OperationCanceledException) { canceled = true; }
            assert(canceled && stopped?.HasExited == true && cancelWorker.ProcessId == null,
                "cancellation during active GPU recovery leaves the failed child stopped and prevents a restart");
        }
        finally { await cancelWorker.DisposeAsync(); stopped?.Dispose(); }
    }

    private static async Task ParentTerminationAsync(string replay, string marker, Action<bool, string> assert)
    {
        using var supervisor = Process.Start(ReplayDecodeWorker.LaunchInfo("--replay-worker-fixture", "--fixture-supervisor", replay, marker)) ?? throw new IOException("Could not launch worker termination fixture.");
        Process? decoder = null;
        try
        {
            var waiting = Stopwatch.StartNew();
            int pid = 0;
            while (waiting.Elapsed < TimeSpan.FromSeconds(10) && !supervisor.HasExited)
            {
                if (File.Exists(marker) && int.TryParse(File.ReadAllText(marker), out pid)) break;
                await Task.Delay(50);
            }
            assert(pid != 0, "parent termination fixture assigned a decoder to its own job before reporting readiness");
            decoder = Process.GetProcessById(pid);
            supervisor.Kill(); // Deliberately do not kill the tree: the Job Object must do it.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await supervisor.WaitForExitAsync(timeout.Token);
            try { await decoder.WaitForExitAsync(timeout.Token); } catch (OperationCanceledException) { }
            assert(decoder.HasExited, "force-closing the owning parent automatically kills its hung decoder through KILL_ON_JOB_CLOSE");
        }
        finally
        {
            // These handles refer only to fixture processes created by this test.
            if (!supervisor.HasExited) { supervisor.Kill(true); await supervisor.WaitForExitAsync(); }
            if (decoder != null) { if (!decoder.HasExited) { decoder.Kill(); await decoder.WaitForExitAsync(); } decoder.Dispose(); }
        }
    }
}
