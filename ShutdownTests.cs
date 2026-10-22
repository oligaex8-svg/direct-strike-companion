namespace DirectStrikeCompanion;

internal static class ShutdownTests
{
    internal static void Run(Action<bool, string> assert) => RunAsync(assert).GetAwaiter().GetResult();
    private static async Task RunAsync(Action<bool, string> assert)
    {
        using var cancel = new CancellationTokenSource();
        var jobs = new CompanionBackgroundTasks(cancel);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cleanupStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var saved = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        bool checkpointed = false;
        assert(jobs.TryRun(async token =>
        {
            started.SetResult();
            try { await Task.Delay(Timeout.Infinite, token); }
            finally { cleanupStarted.SetResult(); await saved.Task; checkpointed = true; }
        }), "shutdown coordinator admits cancellable background work");
        await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var drain = jobs.StopAsync(TimeSpan.FromSeconds(2));
        await cleanupStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        assert(!drain.IsCompleted && !checkpointed, "shutdown returns promptly while awaiting asynchronous replay cleanup");
        assert(!jobs.TryRun(_ => Task.CompletedTask), "shutdown refuses a late import before the tracked drain completes");
        assert(ReferenceEquals(drain, jobs.StopAsync(TimeSpan.FromSeconds(2))), "repeated exit requests share one cancellation and drain");
        saved.SetResult();
        assert(await drain && checkpointed, "shutdown waits for accepted cancellation cleanup before completing");

        using var stalledCancel = new CancellationTokenSource();
        var stalled = new CompanionBackgroundTasks(stalledCancel);
        var blocked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var stalledStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stalled.TryRun(async _ => { stalledStarted.SetResult(); await blocked.Task; });
        await stalledStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        assert(!await stalled.StopAsync(TimeSpan.FromMilliseconds(30)), "stalled background work cannot hold shutdown beyond its deadline");
        assert(!stalled.TryRun(_ => Task.CompletedTask), "deadline expiry never reopens admission to imports");
        blocked.SetResult();
    }
}
