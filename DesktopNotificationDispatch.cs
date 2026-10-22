namespace DirectStrikeCompanion;

internal static class DesktopNotificationDispatch
{
    // Pending HTTP requests must finish even if shutdown prevents the UI queue from draining.
    internal static async Task<bool> InvokeAsync(CancellationToken cancellation, Action<Action> enqueue, Func<bool> send)
    {
        if (cancellation.IsCancellationRequested) return false;
        var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var registration = cancellation.Register(() => completion.TrySetResult(false));
        if (!completion.Task.IsCompleted)
        {
            try
            {
                enqueue(() =>
                {
                    if (cancellation.IsCancellationRequested) { completion.TrySetResult(false); return; }
                    try { completion.TrySetResult(send()); }
                    catch (Exception ex) { completion.TrySetException(ex); }
                });
            }
            catch (InvalidOperationException) { completion.TrySetResult(false); }
        }
        return await completion.Task.ConfigureAwait(false);
    }
}
