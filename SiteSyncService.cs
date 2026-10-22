using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using RegexMatch = System.Text.RegularExpressions.Match;

namespace DirectStrikeCompanion;

public sealed record SiteProfile(string ProfileId, string Name, string Region, double? Rating, DateTime Checked,
    double? EstimatedRating = null, DateTime? ProfileChecked = null, int? DiscoveredGames = null, double? WinRate = null,
    DateTime? ProfileAttempted = null, List<SiteCommanderStat>? CommanderStats = null, int ProfileStatsVersion = 0,
    DateTime? LastPlayed = null, int? SearchGames = null, double? SearchWinRate = null, bool DetailsPending = false,
    double? SearchRating = null, DateTime? SearchChecked = null, double? MainRating = null);
public sealed record SiteLookup(string PlayerId, string Status, DateTime Checked, List<SiteProfile> Profiles);
public sealed record SiteSyncSnapshot(bool Running, int Queued, string? Active, DateTime? LastSync, string? Error);
public sealed record SiteRecentGame(string GameId, DateTime Time, string Mode, string Commander, int Minutes, double? Delta, string Result = "Unknown");
public sealed record SiteGamePlayer(string ProfileId, string Name, string Commander, int Team, double? Delta, string Result = "Unknown");
public sealed record SiteGameEvidence(string GameId, DateTime? Time, double? Seconds, string Mode, List<SiteGamePlayer> Players);

public sealed class SiteSyncService(Store store, RatingService ratings)
{
    private const double ReplayClockToleranceSeconds = 6;
    private enum WorkStage { Discovery, Rating, MainProfile, History, OwnGames }
    private sealed record LookupWork(string Key, string? Id, string? Region, RegionalRatingSlot? Slot, bool Own,
        SiteLookup Lookup, bool RatingUnavailable = false, SiteHistory? History = null, List<SiteRecentGame>? Games = null,
        bool ProfileUnavailable = false, bool ExplicitProfile = false, int SelectedIndex = 0);
    private sealed record Work(string Key, string? Id, string? Name, SiteProfile? Profile = null,
        WorkStage Stage = WorkStage.Discovery, LookupWork? Lookup = null, int Index = 0, string? Region = null, bool Lobby = false);
    internal const int CandidateLimit = 128;
    private readonly object queueGate = new();
    private readonly LinkedList<Work> queue = new();
    private readonly HashSet<string> queued = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim signal = new(0, 1);
    private bool running;
    private string? active, activeLookup, error;
    private DateTime? lastSync;
    private DateTime lastOwnPoll;

    public SiteSyncSnapshot Snapshot()
    {
        lock (queueGate) return new(running, queue.Count, active, lastSync, error);
    }

    // Visible/requested IDs lead each small batch. Never scans every library identity.
    public void Queue(IEnumerable<string> ids, IEnumerable<string>? names = null, string? region = null)
    {
        if (region != null && RatingService.NormalizeRegion(region) == null) throw new ArgumentException("Choose EU or Americas.");
        region = RatingService.NormalizeRegion(region);
        foreach (var id in ids.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).Take(40))
            Enqueue(new(id, id, null));
        foreach (var name in (names ?? []).Where(name => !string.IsNullOrWhiteSpace(name)).Select(NormalizeName).Distinct(StringComparer.OrdinalIgnoreCase).Take(12))
            if (name.Length > 0) Enqueue(new(NameLookupKey(name, region), null, name, Region: region));
    }

    public static string NameLookupKey(string name, string? region = null) => "name:"
        + (RatingService.NormalizeRegion(region) is { } normalized ? normalized + ":" : "") + NormalizeName(name).ToLowerInvariant();

    public void QueueProfile(string profileId, string region)
    {
        SiteProfile profile;
        lock (store.Gate) profile = ResolveCandidate(store.Data.SiteLookups.Values, profileId, region);
        Enqueue(new("site:" + region + ":" + profileId, null, null, profile));
    }

    internal static SiteProfile ResolveCandidate(IEnumerable<SiteLookup> lookups, string profileId, string region)
    {
        if (region is not ("EU" or "Americas") || !Regex.IsMatch(profileId ?? "", @"^[1-9][0-9]*$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)))
            throw new ArgumentException("Choose a known regional site profile.");
        var candidates = lookups.SelectMany(lookup => lookup.Profiles).Where(profile => profile.ProfileId == profileId && profile.Region == region).ToArray();
        var formal = candidates.OrderByDescending(profile => profile.Checked).FirstOrDefault()
            ?? throw new ArgumentException("Choose a known regional site profile.");
        return MergeSearchEvidence(formal, candidates);
    }

    private static SiteProfile MergeSearchEvidence(SiteProfile formal, IEnumerable<SiteProfile> candidates)
    {
        var latest = candidates.Where(profile => profile.ProfileId == formal.ProfileId && profile.Region == formal.Region)
            .Prepend(formal).OrderByDescending(profile => profile.SearchChecked).First();
        return formal with { SearchRating = latest.SearchRating, SearchGames = latest.SearchGames, SearchWinRate = latest.SearchWinRate,
            LastPlayed = latest.LastPlayed, SearchChecked = latest.SearchChecked };
    }

    private void Enqueue(Work work, bool continuation = false)
    {
        lock (store.Gate)
        {
            if (!continuation)
            {
                if (work.Profile != null)
                {
                    var history = store.Data.SiteHistories.GetValueOrDefault(work.Profile.ProfileId);
                    if (!work.Profile.DetailsPending && work.Profile.ProfileStatsVersion >= RatingService.CurrentProfileStatsVersion
                        && work.Profile.ProfileChecked is { } profileChecked && DateTime.UtcNow - profileChecked < TimeSpan.FromMinutes(30)
                        && DateTime.UtcNow - work.Profile.Checked < (work.Profile.Rating.HasValue ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5)) && history != null
                        && DateTime.UtcNow - history.Checked < (history.Status == "Ready" ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5))) return;
                }
                else if (store.Data.SiteLookups.TryGetValue(work.Key, out var lookup) && IsLookupFresh(lookup, store.Data.SiteHistories, DateTime.UtcNow)) return;
            }
            if (continuation && work.Lookup != null && !IsCurrent(work.Lookup)) return;
            lock (queueGate)
            {
                // A new discovery can supersede the lookup behind a queued phase.
                // Replace that phase instead of dropping the newest generation.
                if (continuation && work.Lookup != null && queued.Contains(work.Key))
                {
                    var previous = queue.First;
                    while (previous != null && previous.Value.Key != work.Key) previous = previous.Next;
                    if (previous?.Value.Lookup?.Lookup != work.Lookup.Lookup && previous != null)
                    { queue.Remove(previous); queued.Remove(work.Key); }
                }
                if ((!continuation && queue.Count >= 96) || queued.Contains(work.Key) || (!continuation && active == work.Key)) return;
                if (!continuation && work.Lookup == null && work.Profile == null
                    && (activeLookup == work.Key || queue.Any(p => p.Lookup?.Key == work.Key))) return;
                queued.Add(work.Key);
                // Discovery runs before hydration; unique ratings run before ambiguous candidates.
                // Continuations release the serial worker after each HTTP request.
                var next = queue.First;
                while (next != null && Priority(next.Value) <= Priority(work)) next = next.Next;
                if (next == null) queue.AddLast(work); else queue.AddBefore(next, work);
                try { signal.Release(); } catch (SemaphoreFullException) { }
                }
        }
    }

    private static int Priority(Work work) => work.Lobby && (work.Stage is WorkStage.Rating or WorkStage.MainProfile) ? -1 : work.Stage switch
    {
        WorkStage.Discovery when work.Profile == null => 0,
        WorkStage.Rating or WorkStage.MainProfile when work.Lookup!.Lookup.Profiles.Count == 1 => 1,
        WorkStage.Rating or WorkStage.MainProfile => 2,
        WorkStage.History => 3,
        WorkStage.Discovery => 3, // Explicitly selected candidate history.
        _ => 4
    };

    public static TimeSpan LookupLifetime(string status) => status is "Name match" or "Manual link" or "Candidates" or "Site estimate"
        ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5);

    internal static bool IsLobbyDiscoveryFresh(SiteLookup lookup, DateTime now) =>
        lookup.Profiles.Count > 0 && lookup.Profiles.All(profile => profile.SearchChecked is { } at && now - at < TimeSpan.FromMinutes(30))
        || lookup.Profiles.Count == 0 && !lookup.Status.Contains("pending", StringComparison.OrdinalIgnoreCase)
            && now - lookup.Checked < TimeSpan.FromMinutes(5);

    // Called only by the two bounded lobby discovery workers. The ordinary
    // worker retains profile/history hydration; discovery publishes first.
    internal Task DiscoverLobbyAsync(string name, string? region, CancellationToken cancellationToken)
    {
        name = NormalizeName(name);
        return ProcessAsync(new(NameLookupKey(name, region), null, name, Region: region, Lobby: true), cancellationToken);
    }

    public static bool IsLookupFresh(SiteLookup lookup, IReadOnlyDictionary<string, SiteHistory> histories, DateTime now)
    {
        if (lookup.Status.Contains("rating pending", StringComparison.Ordinal) || lookup.Status.Contains("history pending", StringComparison.Ordinal)) return false;
        // Old saved null-mode profiles predate main-profile evidence: hydrate them immediately.
        // A failed new request still uses the existing bounded retry lifetime.
        var priorityProfiles = PriorityProfileIndexes(lookup.Profiles).Select(index => lookup.Profiles[index]).ToArray();
        if (priorityProfiles.Any(profile => profile.Rating == null && profile.ProfileChecked == null && profile.ProfileAttempted == null)) return false;
        if (priorityProfiles.Any(profile => profile.ProfileStatsVersion < RatingService.CurrentProfileStatsVersion
            && (profile.ProfileAttempted == null || !lookup.Status.Contains("profile unavailable", StringComparison.Ordinal)
                || now - profile.ProfileAttempted.Value >= TimeSpan.FromMinutes(5)))) return false;
        if (now - lookup.Checked >= LookupLifetime(lookup.Status)) return false;
        // Failed requests retain their earlier successful evidence and retry after five minutes.
        if (lookup.Status.StartsWith("Error:", StringComparison.Ordinal) || lookup.Status.Contains("unavailable", StringComparison.Ordinal)) return true;
        if (priorityProfiles.Any(profile => profile.Rating == null && profile.ProfileChecked is { } checkedAt
            && now - checkedAt >= (profile.EstimatedRating.HasValue ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5)))) return false;
        if (priorityProfiles.Length != 1) return true;
        return histories.TryGetValue(priorityProfiles[0].ProfileId, out var history)
            && now - history.Checked < (history.Status == "Ready" ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5));
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        lock (queueGate) { if (running) return; running = true; }
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                if (DateTime.UtcNow - lastOwnPoll >= TimeSpan.FromMinutes(1))
                {
                    string[] own;
                    lock (store.Gate) own = store.Data.Settings.SelfIds.Take(12).ToArray();
                    Queue(own);
                    lastOwnPoll = DateTime.UtcNow;
                }
                if (!await ProcessNextAsync(cancellationToken))
                    await signal.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        finally { lock (queueGate) { running = false; active = null; } }
    }

    internal async Task<bool> ProcessNextAsync(CancellationToken cancellationToken = default)
    {
        Work? work;
        lock (queueGate)
        {
            work = queue.First?.Value;
            if (work != null)
            {
                queue.RemoveFirst(); queued.Remove(work.Key); active = work.Key;
                activeLookup = work.Lookup?.Key ?? work.Key;
            }
        }
        if (work == null) return false;
        try { await ProcessAsync(work, cancellationToken); }
        finally { lock (queueGate) { active = null; activeLookup = null; lastSync = DateTime.UtcNow; } }
        return true;
    }

    private async Task ProcessAsync(Work work, CancellationToken cancellationToken)
    {
        if (work.Lookup != null) { await HydrateAsync(work, cancellationToken); return; }
        if (work.Profile != null)
        {
            SiteLookup? selectedLookup;
            int index;
            lock (store.Gate)
            {
                selectedLookup = store.Data.SiteLookups.Values.Where(lookup => lookup.Profiles.Any(profile => profile.ProfileId == work.Profile.ProfileId
                    && profile.Region == work.Profile.Region)).OrderByDescending(lookup => lookup.Checked).FirstOrDefault();
                if (selectedLookup == null) return;
                index = selectedLookup.Profiles.FindIndex(profile => profile.ProfileId == work.Profile.ProfileId && profile.Region == work.Profile.Region);
            }
            var selectedContext = new LookupWork(selectedLookup.PlayerId, null, work.Profile.Region, null, false, selectedLookup,
                ExplicitProfile: true, SelectedIndex: index);
            var publishedContext = Publish(selectedContext, selectedLookup.Status + "; rating pending", persist: false);
            if (publishedContext != null) Enqueue(work with { Profile = null, Stage = WorkStage.Rating, Lookup = publishedContext, Index = index }, continuation: true);
            return;
        }
        string? region = work.Id == null ? work.Region : NativeRegion(work.Id);
        Rating? manual = null;
        RegionalRatingSlot? manualSlot = null;
        string[] aliases = [];
        bool own = false;
        List<SiteProfile> previous;
        Dictionary<(string ProfileId, string Region), SiteProfile> cachedProfiles;
        lock (store.Gate)
        {
            cachedProfiles = store.Data.SiteLookups.Values.SelectMany(lookup => lookup.Profiles.Select(profile => (Lookup: lookup, Profile: profile)))
                .Where(item => region == null || item.Profile.Region == region)
                .OrderByDescending(item => HasModeEvidence(item.Lookup, item.Profile)).ThenByDescending(item => item.Profile.Checked)
                .Select(item => item.Profile).GroupBy(profile => (profile.ProfileId, profile.Region))
                .ToDictionary(group => group.Key, group => MergeSearchEvidence(group.First(), group));
            previous = store.Data.SiteLookups.GetValueOrDefault(work.Key)?.Profiles.ToList()
                ?? (work.Name == null ? [] : cachedProfiles.Values.Where(profile => CompleteNameMatches(profile.Name, work.Name)).ToList());
            if (work.Id != null)
            {
                manualSlot = region == null ? null : store.ResolveRegionRating(work.Id, region);
                manual = manualSlot?.Rating;
                own = store.Data.Settings.SelfIds.Contains(work.Id, StringComparer.Ordinal);
                aliases = store.Data.Matches.SelectMany(m => m.Players.Where(p => p.Id == work.Id).Select(p => (p.Name, At: m.Time)))
                    .Concat(store.Data.OwnLocalNames.Where(n => n.Id == work.Id).Select(n => (n.Name, At: n.ObservedAt)))
                    .OrderByDescending(n => n.At).Select(n => NormalizeName(n.Name)).Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(3).ToArray();
            }
            else aliases = [work.Name!];
        }
        try
        {
            if (work.Id != null && region == null) { CommitLookup(new(work.Key, "Unsupported native region", DateTime.UtcNow, [])); return; }
            if (manual == null && !aliases.Any(alias => ExactQuery(alias, region ?? "EU") != null))
            { CommitLookup(new(work.Key, "Name unavailable", DateTime.UtcNow, [])); return; }
            var profiles = new List<SiteProfile>();
            string status;
            if (manual != null)
            {
                var earlier = cachedProfiles.GetValueOrDefault((manual.ProfileId, region!));
                profiles.Add(earlier == null ? new(manual.ProfileId, manual.ProfileName, region!, manual.Value, manual.Checked)
                    : earlier with { Name = manual.ProfileName, Rating = manual.Value, Checked = manual.Checked });
                status = "Manual link";
            }
            else
            {
                var candidates = new List<RatingCandidate>();
                foreach (var searchRegion in region == null ? new[] { "EU", "Americas" } : new[] { region })
                {
                    foreach (var alias in aliases)
                    {
                        var query = ExactQuery(alias, searchRegion);
                        if (query == null) continue;
                        var found = RegionalCandidates(await ratings.SearchAsync(query, cancellationToken: cancellationToken), searchRegion);
                        // Search can return prefixes even for quoted single-word names.
                        found = found.Where(candidate => CompleteNameMatches(candidate.Name, alias)).ToList();
                        if (found.Count == 0) continue;
                        candidates.AddRange(found);
                        // An ambiguous latest alias must never become a unique older-alias guess.
                        break;
                    }
                }
                candidates = candidates.DistinctBy(c => c.ProfileId).OrderByDescending(c => c.PlayedLast)
                    .ThenByDescending(c => c.Games).ThenBy(c => long.TryParse(c.ProfileId, out var number) ? number : long.MaxValue)
                    .ThenBy(c => c.ProfileId, StringComparer.Ordinal).ToList();
                bool ambiguous = work.Id != null && candidates.Count > 1;
                var searchChecked = ratings.UtcNow;
                // Generic search DSR stays separate from verified mode and main-profile evidence.
                foreach (var candidate in candidates.Take(CandidateLimit))
                {
                    var candidateRegion = RatingService.NormalizeRegion(candidate.Region)!;
                    var earlier = cachedProfiles.GetValueOrDefault((candidate.ProfileId, candidateRegion));
                    profiles.Add(earlier == null ? new(candidate.ProfileId, candidate.Name, candidateRegion, null, DateTime.UtcNow,
                            LastPlayed: candidate.PlayedLast, SearchGames: candidate.Games, SearchWinRate: candidate.WinRate, DetailsPending: true,
                            SearchRating: candidate.Rating, SearchChecked: searchChecked)
                        : earlier with { Name = candidate.Name, LastPlayed = candidate.PlayedLast, SearchGames = candidate.Games, SearchWinRate = candidate.WinRate,
                            DetailsPending = earlier.DetailsPending || earlier.ProfileStatsVersion < RatingService.CurrentProfileStatsVersion
                                || earlier.ProfileChecked == null, SearchRating = candidate.Rating, SearchChecked = searchChecked });
                }
                status = candidates.Count == 0 ? "Not found" : ambiguous ? "Ambiguous" : work.Id == null ? "Candidates" : "Name match";
                if (candidates.Count > CandidateLimit) status = $"Ambiguous (first {CandidateLimit} candidates shown; site returned {candidates.Count})";
            }
            cancellationToken.ThrowIfCancellationRequested();
            lock (store.Gate)
            {
                if (work.Id != null)
                {
                    var current = store.ResolveRegionRating(work.Id, region!);
                    if (current != manualSlot) return; // A live slot or manual edit wins over this in-flight lookup.
                }
                store.Data.SiteLookups[work.Key] = new(work.Key, status + (profiles.Count > 0 ? "; rating pending" : ""), DateTime.UtcNow, profiles);
                SiteHistoryCache.Trim(store.Data, work.Key);
            }
            if (work.Lobby) store.NotifyChanged(); else Persist();
            if (profiles.Count > 0)
            {
                SiteLookup lookup;
                lock (store.Gate) lookup = store.Data.SiteLookups[work.Key];
                var context = new LookupWork(work.Key, work.Id, region, manualSlot, own, lookup);
                Enqueue(new("rating:" + work.Key, null, null, Stage: WorkStage.Rating, Lookup: context,
                    Index: PriorityProfileIndexes(profiles)[0], Lobby: work.Lobby), continuation: true);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            SetError(ex.Message);
            lock (store.Gate)
            {
                if (work.Id != null && region != null && store.ResolveRegionRating(work.Id, region) != manualSlot) return;
                store.Data.SiteLookups[work.Key] = new(work.Key, "Error: " + ex.Message, DateTime.UtcNow, previous);
                SiteHistoryCache.Trim(store.Data, work.Key);
            }
            if (work.Lobby) store.NotifyChanged(); else Persist();
        }
    }

    private bool IsCurrent(LookupWork context)
    {
        lock (store.Gate) return store.Data.SiteLookups.GetValueOrDefault(context.Key) == context.Lookup
            && (context.Id == null || store.ResolveRegionRating(context.Id, context.Region!) == context.Slot);
    }

    private static bool HasModeEvidence(SiteLookup lookup, SiteProfile profile) =>
        profile.Rating is { } value && double.IsFinite(value)
        || profile.Rating == null && (profile.ProfileChecked.HasValue || profile.ProfileAttempted.HasValue)
            && !lookup.Status.StartsWith("Error:", StringComparison.Ordinal)
            && !lookup.Status.Contains("rating unavailable", StringComparison.Ordinal)
            && !lookup.Status.Contains("rating pending", StringComparison.Ordinal);

    private static int[] PriorityProfileIndexes(List<SiteProfile> profiles) => profiles.Select((profile, index) => (profile, index))
        .GroupBy(item => item.profile.Region).Select(group => group.OrderByDescending(item => item.profile.LastPlayed)
            .ThenByDescending(item => item.profile.SearchGames ?? item.profile.DiscoveredGames ?? 0)
            .ThenBy(item => long.TryParse(item.profile.ProfileId, out var number) ? number : long.MaxValue)
            .ThenBy(item => item.profile.ProfileId, StringComparer.Ordinal).First().index).Order().ToArray();

    private static bool RecentMainFailure(SiteProfile profile, DateTime now) => profile.ProfileAttempted is { } attempted
        && (profile.ProfileChecked == null || attempted > profile.ProfileChecked.Value) && now - attempted < TimeSpan.FromMinutes(5);

    private static bool NeedsMainProfile(SiteProfile profile, DateTime now) => !RecentMainFailure(profile, now) && (profile.Rating == null
        || profile.ProfileStatsVersion < RatingService.CurrentProfileStatsVersion || profile.ProfileChecked == null
        || now - profile.ProfileChecked.Value >= TimeSpan.FromMinutes(30));

    private LookupWork? Publish(LookupWork context, string status, List<SiteProfile>? profiles = null, bool persist = true)
    {
        lock (store.Gate)
        {
            if (!IsCurrent(context)) return null;
            if (context.ExplicitProfile && profiles != null)
            {
                profiles = profiles.ToList();
                profiles[context.SelectedIndex] = MergeSearchEvidence(profiles[context.SelectedIndex], store.Data.SiteLookups.Values.SelectMany(lookup => lookup.Profiles));
            }
            var lookup = new SiteLookup(context.Key, status, DateTime.UtcNow, profiles ?? context.Lookup.Profiles);
            store.Data.SiteLookups[context.Key] = lookup;
            if (context.ExplicitProfile && profiles != null)
            {
                var selected = profiles[context.SelectedIndex];
                foreach (var other in store.Data.SiteLookups.Values.Where(other => other.PlayerId != context.Key).ToArray())
                    if (other.Profiles.Any(profile => profile.ProfileId == selected.ProfileId && profile.Region == selected.Region))
                        store.Data.SiteLookups[other.PlayerId] = other with { Profiles = other.Profiles.Select(profile =>
                            profile.ProfileId == selected.ProfileId && profile.Region == selected.Region ? selected : profile).ToList() };
            }
            SiteHistoryCache.Trim(store.Data, context.Key);
            context = context with { Lookup = lookup };
            if (!persist) store.NotifyChanged();
        }
        if (persist) Persist();
        return context;
    }

    private async Task HydrateAsync(Work work, CancellationToken cancellationToken)
    {
        var context = work.Lookup!;
        if (!IsCurrent(context)) return;
        var profile = context.Lookup.Profiles[work.Stage == WorkStage.OwnGames ? 0 : work.Index];
        var status = context.Lookup.Status.Replace("; rating pending", "").Replace("; history pending", "");
        if (work.Stage is WorkStage.Rating or WorkStage.MainProfile)
        {
            bool needsMainProfile = false;
            try
            {
                if (work.Stage == WorkStage.Rating)
                {
                    profile = profile with { Rating = await ratings.CommanderRatingAsync(profile.ProfileId, cancellationToken), Checked = DateTime.UtcNow };
                    needsMainProfile = NeedsMainProfile(profile, ratings.UtcNow);
                    if (RecentMainFailure(profile, ratings.UtcNow)) context = context with { ProfileUnavailable = true };
                }
                else
                {
                    profile = profile with { ProfileAttempted = ratings.UtcNow };
                    var estimate = await ratings.ProfileEstimateAsync(profile.ProfileId, cancellationToken);
                    profile = profile with { EstimatedRating = estimate.EstimatedRating, MainRating = estimate.MainRating, ProfileChecked = estimate.Checked,
                        DiscoveredGames = estimate.DiscoveredGames, WinRate = estimate.WinRate,
                        CommanderStats = estimate.CommanderStats, ProfileStatsVersion = estimate.ProfileStatsVersion, ProfileAttempted = estimate.Checked };
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                context = work.Stage == WorkStage.Rating ? context with { RatingUnavailable = true } : context with { ProfileUnavailable = true };
                needsMainProfile = work.Stage == WorkStage.Rating && NeedsMainProfile(profile, ratings.UtcNow);
                SetError(ex.Message);
            }
            cancellationToken.ThrowIfCancellationRequested();
            var profiles = context.Lookup.Profiles.ToList();
            if (!needsMainProfile) profile = profile with { DetailsPending = false };
            profiles[work.Index] = profile;
            // Publish a selected regional mode value before deferred main-page statistics.
            lock (store.Gate)
            {
                if (!IsCurrent(context)) return;
                if (work.Stage == WorkStage.Rating && context.Slot?.Rating is { } manual && !context.RatingUnavailable)
                {
                    store.SetRegionRating(context.Slot.Id, context.Region!, manual with { Value = profile.Rating, Checked = profile.Checked });
                    context = context with { Slot = store.ResolveRegionRating(context.Id!, context.Region!) };
                    store.Data.SiteLookups[context.Key] = context.Lookup;
                }
            }
            if (needsMainProfile)
            {
                context = Publish(context, status + "; rating pending", profiles, persist: false);
                if (context != null) Enqueue(work with { Stage = WorkStage.MainProfile, Lookup = context }, continuation: true);
                return;
            }
            var nextIndex = context.ExplicitProfile ? -1 : PriorityProfileIndexes(profiles).FirstOrDefault(index => index > work.Index, -1);
            bool more = nextIndex >= 0;
            if (!more && profiles.Count == 1 && profile.Rating == null && !context.RatingUnavailable)
                status = profile.EstimatedRating.HasValue ? "Site estimate" : context.Id != null ? "No 3v3 rating" : status;
            if (!more && context.RatingUnavailable) status += "; rating unavailable";
            if (!more && context.ProfileUnavailable) status += "; profile unavailable";
            bool fetchHistory = PriorityProfileIndexes(profiles).Length == 1 || context.ExplicitProfile;
            context = Publish(context, status + (more ? "; rating pending" : fetchHistory ? "; history pending" : ""), profiles, persist: !more && !fetchHistory);
            if (context == null) return;
            if (more) Enqueue(work with { Stage = WorkStage.Rating, Lookup = context, Index = nextIndex }, continuation: true);
            else if (fetchHistory) Enqueue(new("history:" + context.Key, null, null, Stage: WorkStage.History, Lookup: context, Index: work.Index), continuation: true);
            return;
        }
        if (work.Stage == WorkStage.History)
        {
            var history = await FetchHistoryAsync(profile, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            lock (store.Gate)
            {
                if (!IsCurrent(context)) return;
                store.Data.SiteHistories[history.ProfileId] = history;
            }
            context = Publish(context, status + (history.Status != "Ready" ? "; history unavailable" : ""));
            if (context == null || !context.Own || history.Status != "Ready") return;
            Match[] local;
            lock (store.Gate) local = store.Data.Matches.Where(Store.IsEligible).Where(m => m.Players.Any(p => p.Id == context.Id)).OrderByDescending(m => m.Time).ToArray();
            var localGames = local.Take(6).SelectMany(m => history.Games.Where(g => RecentMatches(m, m.Players.Single(p => p.Id == context.Id), g)))
                .Select(g => g.GameId).ToHashSet(StringComparer.Ordinal);
            List<SiteRecentGame> games;
            lock (store.Gate) games = HistoryRequests(local, history.Games, context.Id!).Where(g =>
            {
                var cached = store.Data.SiteGames.GetValueOrDefault(g.GameId);
                return cached == null || !IsCacheableGame(cached) || (localGames.Contains(g.GameId) && cached.Players.Any(p => !p.Delta.HasValue));
            }).Take(6).ToList();
            context = context with { History = history, Games = games };
            Enqueue(new("games:" + context.Key, null, null, Stage: WorkStage.OwnGames, Lookup: context), continuation: true);
            return;
        }
        try
        {
            if (work.Index < context.Games!.Count)
            {
                var recent = context.Games[work.Index];
                var game = ParseGame(recent.GameId, await ratings.PageAsync($"/game/{recent.GameId}", cancellationToken));
                cancellationToken.ThrowIfCancellationRequested();
                lock (store.Gate)
                {
                    if (!IsCurrent(context)) return;
                    if (MatchesHistoryGame(game, recent, profile)) { store.Data.SiteGames[game.GameId] = game; SiteHistoryCache.Trim(store.Data); }
                }
                if (work.Index + 1 < context.Games.Count)
                {
                    Enqueue(work with { Index = work.Index + 1 }, continuation: true);
                    return;
                }
            }
            if (SyncOwnGames(context.Id!, profile, context.History!.Games, context.Slot!)) status += "; game pending";
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex) { status += "; game evidence unavailable"; SetError(ex.Message); }
        Publish(context, status);
    }

    private static bool MatchesHistoryGame(SiteGameEvidence game, SiteRecentGame recent, SiteProfile profile) =>
        IsCacheableGame(game) && game.Time == recent.Time && game.Players.Any(p => p.ProfileId == profile.ProfileId
            && p.Commander == recent.Commander && (recent.Result == "Unknown" || p.Result == recent.Result))
        && game.Seconds >= recent.Minutes * 60 && game.Seconds < (recent.Minutes + 1) * 60;

    private async Task<SiteHistory> FetchHistoryAsync(SiteProfile profile, CancellationToken cancellationToken)
    {
        SiteHistory? previous;
        lock (store.Gate) previous = store.Data.SiteHistories.GetValueOrDefault(profile.ProfileId);
        if (previous != null && DateTime.UtcNow - previous.Checked < (previous.Status == "Ready" ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5))) return previous;
        try
        {
            return ParseHistory(profile, await ratings.PageAsync($"/player/{profile.ProfileId}/games", cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            SetError(ex.Message);
            return SiteHistoryCache.Failure(profile, previous, ex.Message);
        }
    }

    internal static IEnumerable<SiteRecentGame> HistoryRequests(Match[] local, List<SiteRecentGame> history, string id)
    {
        // Reserve half of each six-page allowance for expanding missing history.
        var priority = local.Take(6).SelectMany(m => history.Where(g => RecentMatches(m, m.Players.Single(p => p.Id == id), g)))
            .DistinctBy(g => g.GameId).Take(3);
        var missing = history.Where(g => !local.Any(m => Math.Abs((DateTime.SpecifyKind(m.Time, DateTimeKind.Utc) - g.Time).TotalSeconds) <= ReplayClockToleranceSeconds));
        return priority.Concat(missing).Concat(history).DistinctBy(g => g.GameId);
    }

    private bool SyncOwnGames(string id, SiteProfile profile, List<SiteRecentGame> history, RegionalRatingSlot manualSlot)
    {
        Match[] matches;
        lock (store.Gate)
            matches = store.Data.Matches.Where(Store.IsEligible).Where(m => m.Players.Any(p => p.Id == id))
                .OrderByDescending(m => m.Time).Take(6).Where(m => !store.Data.MatchRatings.TryGetValue(m.Hash, out var changes) || changes.Count(c => c.Kind == "confirmed") < 6).ToArray();
        if (matches.Length == 0) return false;
        bool pending = false;
        foreach (var match in matches)
        {
            var player = match.Players.Single(p => p.Id == id);
            var candidates = history.Where(g => RecentMatches(match, player, g)).ToArray();
            if (candidates.Length != 1) { if (DateTime.UtcNow - match.Time < TimeSpan.FromDays(1)) pending = true; continue; }
            SiteGameEvidence? game;
            lock (store.Gate) game = store.Data.SiteGames.GetValueOrDefault(candidates[0].GameId);
            if (game == null) { pending = true; continue; }
            var changes = VerifyGame(match, candidates[0], game, id, profile.ProfileId);
            if (changes == null) continue;
            if (changes.Count < 6) pending = true;
            if (changes.Count == 0) continue;
            lock (store.Gate)
            {
                if (store.ResolveRegionRating(id, profile.Region) != manualSlot) return pending;
                var current = store.Data.Matches.FirstOrDefault(m => m.Hash == match.Hash);
                if (current != match) continue;
                var existing = store.Data.MatchRatings.GetValueOrDefault(match.Hash) ?? [];
                // Pending cells never replace already confirmed numeric cells.
                var merged = existing.Where(c => c.Kind == "confirmed").ToDictionary(c => c.PlayerId, StringComparer.Ordinal);
                foreach (var change in changes) merged[change.PlayerId] = change;
                store.Data.MatchRatings[match.Hash] = match.Players.Where(p => merged.ContainsKey(p.Id)).Select(p => merged[p.Id]).ToList();
            }
        }
        return pending;
    }

    private void CommitLookup(SiteLookup lookup)
    {
        lock (store.Gate)
        {
            store.Data.SiteLookups[lookup.PlayerId] = lookup;
            SiteHistoryCache.Trim(store.Data, lookup.PlayerId);
        }
        Persist();
    }
    private void Persist()
    {
        try { store.Save(); store.SignalLiveChange(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { SetError(ex.Message); }
    }
    private void SetError(string message) { lock (queueGate) error = message; }

    public static string? NativeRegion(string id)
    {
        var match = Rx(id, @"^([12])-S2-[0-9]+-[1-9][0-9]*$");
        return match.Success ? match.Groups[1].Value == "2" ? "EU" : "Americas" : null;
    }
    public static string NormalizeName(string name)
    {
        name = WebUtility.HtmlDecode(name).Trim();
        return Regex.Replace(name, @"^(?:(?:<[^<>]+>|\[[^\[\]]+\])\s*)+", "", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)).Trim();
    }
    public static string? ExactQuery(string name, string region)
    {
        name = NormalizeName(name);
        region = RatingService.NormalizeRegion(region) ?? "";
        if (name.Length == 0 || name.Contains('"') || region.Length == 0) return null;
        bool spaced = name.Any(char.IsWhiteSpace);
        string query = $"{(spaced ? name : $"\"{name}\"")} @{(region == "EU" ? "eu" : "na")}";
        if (query.Length <= 32) return query;
        // An exact single-token search can omit the region; results are still
        // filtered to the native region before any profile is accepted.
        return !spaced && name.Length <= 30 ? $"\"{name}\"" : null;
    }
    internal static bool CompleteNameMatches(string candidate, string name)
    {
        candidate = NormalizeName(candidate);
        name = NormalizeName(name);
        return string.Equals(candidate, name, StringComparison.OrdinalIgnoreCase)
            || candidate.EndsWith(" (" + name + ")", StringComparison.OrdinalIgnoreCase)
            || Regex.IsMatch(candidate, @"^" + Regex.Escape(name) + @" \([^()]+\)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    }
    public static List<RatingCandidate> RegionalCandidates(IEnumerable<RatingCandidate> candidates, string region) => candidates
        .Where(c => RatingService.NormalizeRegion(c.Region) == region).DistinctBy(c => c.ProfileId).ToList();

    private static RegexMatch Rx(string text, string pattern) => Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
    private static MatchCollection Rxs(string text, string pattern) => Regex.Matches(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
    private static string Plain(string html) => WebUtility.HtmlDecode(Regex.Replace(html, "<[^>]*>", "", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1))).Trim();
    private static string Commander(string name) => Plain(name).ToLowerInvariant() switch { "horner" or "han & horner" or "hanhorner" => "hanhorner", var value => value };
    private static double? Delta(string text)
    {
        text = Plain(text).Replace('−', '-');
        if (!Rx(text, @"^(?:[+-][0-9]+(?:\.[0-9]+)?|0)$").Success) return null;
        return double.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : null;
    }
    private static double? SpanDelta(string html)
    {
        var spans = Rxs(html, @"<span\b[^>]*>(.*?)</span>");
        return spans.Count == 0 ? null : Delta(spans[^1].Groups[1].Value);
    }
    private static DateTime? Utc(string text) => DateTime.TryParseExact(Plain(text), "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var time) ? time : null;

    private static string ResultFromAttributes(string attributes)
    {
        var match = Rx(attributes, "\\bclass\\s*=\\s*[\"']([^\"']*)[\"']");
        var classes = match.Groups[1].Value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (classes.Contains("text-muted") || classes.Contains("text-warning")) return "Unknown";
        bool win = classes.Contains("text-success"), loss = classes.Contains("text-danger");
        return win == loss ? "Unknown" : win ? "Win" : "Loss";
    }

    public static SiteHistory ParseHistory(SiteProfile profile, string html)
    {
        var header = Rx(html, @"<h1\b[^>]*>\s*Recent games of\s+(.*?)</h1>");
        var identity = Rx(header.Groups[1].Value, "<a\\b[^>]*href=[\"']/player/([1-9][0-9]*)[\"'][^>]*>(.*?)</a>");
        var currentName = Plain(identity.Groups[2].Value).Trim();
        if (!identity.Success || identity.Groups[1].Value != profile.ProfileId
            || currentName.Length is < 1 or > 128 || currentName.Any(char.IsControl)
            || RatingService.NormalizeRegion(profile.Region) == null)
            throw new InvalidDataException("The recent games page did not match the requested site profile.");
        // The numeric profile is stable; the search name may contain an older
        // nickname/alias or clan. Renames cannot invalidate the same account.
        return new(profile.ProfileId, currentName, profile.Region, DateTime.UtcNow, "Ready", ParseRecentGames(html));
    }

    public static bool IsCacheableGame(SiteGameEvidence game)
    {
        if (!Rx(game.GameId, @"^[1-9][0-9]*$").Success || game.Mode != "3v3 commanders" || game.Time == null
            || game.Time.Value.Kind != DateTimeKind.Utc || game.Seconds is not > 0 || !double.IsFinite(game.Seconds.Value)
            || game.Players.Count != 6 || game.Players.Any(p => !Rx(p.ProfileId, @"^[1-9][0-9]*$").Success || string.IsNullOrWhiteSpace(p.Name) || !KnownCommander(p.Commander))
            || game.Players.Select(p => p.ProfileId).Distinct(StringComparer.Ordinal).Count() != 6) return false;
        var teams = game.Players.GroupBy(p => p.Team).ToArray();
        if (teams.Length != 2 || teams.Any(t => t.Count() != 3 || t.Any(p => p.Result is not ("Win" or "Loss" or "Unknown")))) return false;
        var outcomes = teams.Select(t => t.Where(p => p.Result != "Unknown").Select(p => p.Result).Distinct().ToArray()).ToArray();
        // A leaver can be Unknown, but each team must have one unambiguous, opposing published result.
        return outcomes.All(t => t.Length == 1) && outcomes[0][0] != outcomes[1][0];
    }

    private static bool KnownCommander(string commander) => commander is "raynor" or "kerrigan" or "artanis" or "swann" or "zagara" or "vorazun"
        or "karax" or "abathur" or "alarak" or "nova" or "stukov" or "fenix" or "dehaka" or "hanhorner" or "tychus" or "zeratul" or "stetmann" or "mengsk";

    public static List<SiteRecentGame> ParseRecentGames(string html)
    {
        var games = new List<SiteRecentGame>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (System.Text.RegularExpressions.Match row in Rxs(html, @"<tr\b[^>]*>(.*?)</tr>"))
        {
            var link = Rx(row.Groups[1].Value, "<a\\b([^>]*href=[\"']/game/([1-9][0-9]*)[\"'][^>]*)>(.*?)</a>");
            var time = link.Success ? Utc(link.Groups[3].Value) : null;
            var cells = Rxs(row.Groups[1].Value, @"<td\b[^>]*>(.*?)</td>");
            if (time == null || cells.Count != 7 || Plain(cells[1].Groups[1].Value).ToLowerInvariant() != "3v3 commanders") continue;
            var duration = Rx(Plain(cells[6].Groups[1].Value), @"^([0-9]+) min$");
            if (!duration.Success || !int.TryParse(duration.Groups[1].Value, out var minutes)) continue;
            if (!seen.Add(link.Groups[2].Value)) continue;
            games.Add(new(link.Groups[2].Value, time.Value, "3v3 commanders", Commander(cells[2].Groups[1].Value), minutes,
                SpanDelta(cells[0].Groups[1].Value), ResultFromAttributes(link.Groups[1].Value)));
            if (games.Count == 100) break;
        }
        return games;
    }

    public static SiteGameEvidence ParseGame(string gameId, string html)
    {
        var players = new List<SiteGamePlayer>();
        int team = 0;
        foreach (System.Text.RegularExpressions.Match table in Rxs(html, @"<table\b[^>]*>(.*?)</table>"))
        {
            if (!table.Groups[1].Value.Contains("player-name", StringComparison.Ordinal)) continue;
            foreach (System.Text.RegularExpressions.Match row in Rxs(table.Groups[1].Value, @"<tr\b[^>]*>(.*?)</tr>"))
            {
                var body = row.Groups[1].Value;
                var nameBox = Rx(body, "<div\\b[^>]*class=[\"'][^\"']*\\bplayer-name\\b[^\"']*[\"'][^>]*>(.*?)</div>");
                var name = Rx(nameBox.Groups[1].Value, "<a\\b[^>]*href=[\"']/player/([1-9][0-9]*)[\"'][^>]*>(.*?)</a>");
                var commander = Rx(body, "href=[\"']/player/([1-9][0-9]*)/commander/([a-z]+)[\"']");
                if (!name.Success || !commander.Success || name.Groups[1].Value != commander.Groups[1].Value) continue;
                var cells = Rxs(body, @"<td\b([^>]*)>(.*?)</td>");
                double? delta = null;
                string result = "Unknown";
                foreach (System.Text.RegularExpressions.Match cell in cells)
                    if (!cell.Groups[1].Value.Contains("player-data", StringComparison.Ordinal) && !cell.Groups[1].Value.Contains("race-portrait", StringComparison.Ordinal))
                    {
                        delta = SpanDelta(cell.Groups[2].Value);
                        var spans = Rxs(cell.Groups[2].Value, @"<span\b([^>]*)>(.*?)</span>");
                        result = spans.Count == 0 ? "Unknown" : ResultFromAttributes(spans[^1].Groups[1].Value);
                    }
                players.Add(new(name.Groups[1].Value, Plain(name.Groups[2].Value), Commander(commander.Groups[2].Value), team, delta, result));
            }
            team++;
        }
        var moments = Rxs(html, @"by the moment of this game ([0-9]{4}-[0-9-]{5} [0-9:]{8})").Cast<System.Text.RegularExpressions.Match>().Select(m => Utc(m.Groups[1].Value)).Distinct().ToArray();
        var duration = Rx(html, "<h6[^>]*>duration</h6>\\s*<h3[^>]*>([0-9]+):([0-9]{2})</h3>");
        double? seconds = duration.Success && int.TryParse(duration.Groups[1].Value, out int minutes) && int.TryParse(duration.Groups[2].Value, out int remainder) && remainder < 60 ? minutes * 60.0 + remainder : null;
        var pageId = Rx(html, @"<h1\b[^>]*>Game #([1-9][0-9]*)");
        var modeBox = Rx(html, @"<h6\b[^>]*>mode</h6>\s*<h3\b[^>]*>(.*?)</h3>");
        string mode = pageId.Success && pageId.Groups[1].Value == gameId
            && Rx(modeBox.Success ? modeBox.Groups[1].Value : html, "href=[\"']/mode/commanders[\"']").Success ? "3v3 commanders" : "";
        return new(gameId, moments.Length == 1 ? moments[0] : null, seconds, mode, players);
    }

    public static bool RecentMatches(Match match, ReplayPlayer player, SiteRecentGame game) => game.Mode == "3v3 commanders"
        && Math.Abs((DateTime.SpecifyKind(match.Time, DateTimeKind.Utc) - game.Time).TotalSeconds) <= ReplayClockToleranceSeconds
        && Commander(player.Commander) == game.Commander && double.IsFinite(match.Seconds) && match.Seconds >= 0
        && match.Seconds >= game.Minutes * 60.0 - ReplayClockToleranceSeconds && match.Seconds < (game.Minutes + 1) * 60.0 + ReplayClockToleranceSeconds;

    // Null means the replay fingerprint was not proven. An empty list means verified but all deltas pending.
    public static List<RatingChange>? VerifyGame(Match match, SiteRecentGame recent, SiteGameEvidence game, string anchorId, string anchorProfileId)
    {
        var anchor = match.Players.FirstOrDefault(p => p.Id == anchorId);
        if (anchor == null || !Store.IsEligible(match) || !RecentMatches(match, anchor, recent) || game.GameId != recent.GameId || game.Mode != "3v3 commanders"
            || game.Time == null || Math.Abs((game.Time.Value - recent.Time).TotalSeconds) > 2
            || Math.Abs((DateTime.SpecifyKind(match.Time, DateTimeKind.Utc) - game.Time.Value).TotalSeconds) > ReplayClockToleranceSeconds
            || game.Seconds == null || Math.Abs(game.Seconds.Value - match.Seconds) > ReplayClockToleranceSeconds
            || game.Players.Count != 6 || game.Players.Select(p => p.ProfileId).Distinct(StringComparer.Ordinal).Count() != 6
            || game.Players.GroupBy(p => p.Team).Count() != 2 || game.Players.GroupBy(p => p.Team).Any(g => g.Count() != 3)) return null;
        string? region = NativeRegion(anchorId);
        if (region == null || match.Players.Any(p => NativeRegion(p.Id) != region) || match.Players.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != 6) return null;
        var pairs = new List<(ReplayPlayer Replay, SiteGamePlayer Site)>();
        foreach (var player in match.Players)
        {
            var found = game.Players.Where(p => string.Equals(NormalizeName(p.Name), NormalizeName(player.Name), StringComparison.OrdinalIgnoreCase) && p.Commander == Commander(player.Commander)).ToArray();
            if (found.Length != 1) return null;
            pairs.Add((player, found[0]));
        }
        if (pairs.Select(p => p.Site.ProfileId).Distinct(StringComparer.Ordinal).Count() != 6 || pairs.Single(p => p.Replay.Id == anchorId).Site.ProfileId != anchorProfileId) return null;
        foreach (var team in pairs.GroupBy(p => p.Replay.Team))
            if (team.Select(p => p.Site.Team).Distinct().Count() != 1) return null;
        if (pairs.GroupBy(p => p.Replay.Team).Select(g => g.First().Site.Team).Distinct().Count() != 2) return null;
        return pairs.Where(p => p.Site.Delta.HasValue).Select(p => new RatingChange(p.Replay.Id, p.Site.Delta, "confirmed",
            "Confirmed site main DSR (main_current), not commanders_3v3 historical change. Verified all six names/commanders/team membership and UTC time/duration within 6 seconds; site and parser clock precision may differ.", game.GameId, "main_current")).ToList();
    }
}
