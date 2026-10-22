namespace DirectStrikeCompanion;

// One bounded, broadcast wake-up for all connected dashboards; no snapshot polling.
internal sealed class LiveUpdateSignal
{
    private readonly object gate = new();
    private long version;
    private TaskCompletionSource<long> next = NewCompletion();
    private static TaskCompletionSource<long> NewCompletion() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    public long Version { get { lock (gate) return version; } }
    public void Pulse()
    {
        TaskCompletionSource<long> completed;
        long value;
        lock (gate) { value = ++version; completed = next; next = NewCompletion(); }
        completed.TrySetResult(value);
    }
    public Task<long> WaitAfterAsync(long known, CancellationToken cancellationToken)
    {
        lock (gate) return version != known ? Task.FromResult(version) : next.Task.WaitAsync(cancellationToken);
    }
}
