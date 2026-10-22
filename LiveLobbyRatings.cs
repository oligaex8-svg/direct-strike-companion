namespace DirectStrikeCompanion;

public sealed record LobbyRatingPublication(string Name, string? Region, DateTime ObservedAt, DateTime PublishedAt, double ElapsedMs);
public sealed record LiveLobbyRatingSnapshot(int Queued, int Active, List<LobbyRatingPublication> Publications);

// Discovery starts at the server's roster event, even with the dashboard hidden.
// The six current names have a small, independent two-request lane; replay and
// history hydration cannot occupy it. Name matches never establish identities.
public sealed class LiveLobbyRatings(Store store, SiteSyncService site, DsstatsService dsstats)
{
    private sealed record Work(string Key, string Name, string? Region, DateTime ObservedAt);
    private readonly object gate = new();
    private readonly LinkedList<Work> pending = new();
    private readonly HashSet<string> active = new(StringComparer.Ordinal);
    private readonly List<LobbyRatingPublication> publications = [];
    private readonly SemaphoreSlim signal = new(0, 2);
    private HashSet<string> current = new(StringComparer.Ordinal);
    private bool running, dirty;

    public LiveLobbyRatingSnapshot Snapshot()
    {
        lock (gate) return new(pending.Count, active.Count, publications.ToList());
    }

    public void Observe(IReadOnlyList<string> names, string? region)
    {
        region = RatingService.NormalizeRegion(region);
        var now = DateTime.UtcNow;
        var observations = names.Take(6).Where(name => !string.IsNullOrWhiteSpace(name)).Select(name => new { Name = name, Player = store.ResolvePlayerNickname(name, region) }).ToArray();
        var linked = observations.Select(item => item.Player).Where(player => player != null).Cast<ReplayPlayer>().DistinctBy(player => player.Id).ToArray();
        var work = observations.Select(item => item.Player?.Name ?? item.Name)
            .Select(SiteSyncService.NormalizeName).Where(name => name.Length is > 0 and <= 64 && !name.Any(char.IsControl))
            .Distinct(StringComparer.OrdinalIgnoreCase).Select(name => new Work(SiteSyncService.NameLookupKey(name, region), name, region, now)).ToArray();
        string[] ownIds;
        lock (store.Gate) ownIds = store.Data.Settings.SelfIds.ToArray();
        // Match the native candidates used by the lobby renderer, including a
        // non-primary public name alternative. This is transient fetch evidence.
        var known = LobbyService.KnownPlayers(store);
        var candidateIds = work.Select(item => known.Where(candidate => !candidate.NameOnly
                && SiteSyncService.NativeRegion(candidate.Id) is { } nativeRegion
                && (region == null || region == nativeRegion)
                && candidate.Aliases.Any(alias => string.Equals(SiteSyncService.NormalizeName(alias), item.Name,
                    StringComparison.OrdinalIgnoreCase))).ToList())
            .Where(candidates => candidates.Count == 1).Select(candidates => candidates[0].Id);
        dsstats.QueueLobby(work.Select(item => item.Name), region, ownIds.Concat(candidateIds).Concat(linked.Select(player => player.Id)));
        if (linked.Length > 0) site.Queue(linked.Select(player => player.Id), [], region);
        bool published = false;
        var needed = new List<Work>();
        var hydrate = new List<string>();
        lock (store.Gate)
        {
            foreach (var item in work)
            {
                var cached = store.Data.SiteLookups.GetValueOrDefault(item.Key);
                if (cached != null && SiteSyncService.IsLookupFresh(cached, store.Data.SiteHistories, now)) continue;
                if (cached != null && SiteSyncService.IsLobbyDiscoveryFresh(cached, now))
                { hydrate.Add(item.Name); continue; }
                needed.Add(item);
                if (cached == null)
                {
                    store.Data.SiteLookups[item.Key] = new(item.Key, "Lobby; rating pending", now, []);
                    published = true;
                }
            }
        }
        if (hydrate.Count > 0) site.Queue([], hydrate, region);
        lock (gate)
        {
            var next = work.Select(item => item.Key).ToHashSet(StringComparer.Ordinal);
            var previous = current;
            current = next;
            publications.RemoveAll(item => !next.Contains(SiteSyncService.NameLookupKey(item.Name, item.Region)));
            // Drop left players and old ordering; new arrivals lead the remaining batch.
            pending.Clear();
            foreach (var item in needed.OrderBy(item => previous.Contains(item.Key)))
                if (!active.Contains(item.Key)) pending.AddLast(item);
            dirty |= published;
            for (int index = 0; index < Math.Min(2, pending.Count); index++)
                try { signal.Release(); } catch (SemaphoreFullException) { }
        }
        if (published) store.NotifyChanged();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        lock (gate) { if (running) return; running = true; }
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        async Task GuardedWorker()
        {
            try { await RunWorkerAsync(lifetime.Token); }
            catch { lifetime.Cancel(); throw; }
        }
        try { await Task.WhenAll(GuardedWorker(), GuardedWorker()); }
        finally { FlushIfIdle(force: true); lock (gate) running = false; }
    }

    private async Task RunWorkerAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                Work? item;
                lock (gate)
                {
                    item = pending.First?.Value;
                    if (item != null) { pending.RemoveFirst(); active.Add(item.Key); }
                }
                if (item == null)
                {
                    FlushIfIdle();
                    await signal.WaitAsync(cancellationToken);
                    continue;
                }
                try
                {
                    await site.DiscoverLobbyAsync(item.Name, item.Region, cancellationToken);
                    var at = DateTime.UtcNow;
                    lock (gate)
                    {
                        dirty = true;
                        if (current.Contains(item.Key))
                        {
                            publications.RemoveAll(value => SiteSyncService.NameLookupKey(value.Name, value.Region) == item.Key);
                            publications.Add(new(item.Name, item.Region, item.ObservedAt, at, (at - item.ObservedAt).TotalMilliseconds));
                        }
                    }
                }
                finally { lock (gate) active.Remove(item.Key); }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }

    private void FlushIfIdle(bool force = false)
    {
        lock (gate)
        {
            if (!dirty || !force && (pending.Count > 0 || active.Count > 0)) return;
            dirty = false;
        }
        try { store.Save(); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { lock (gate) dirty = true; }
    }
}
