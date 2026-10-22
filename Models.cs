using System.Text.Json;

namespace DirectStrikeCompanion;

public sealed record ReplayPlayer(string Id, string Name, int Team, string Commander, string Result, double Apm, int Killed, int Lost, CombatStats? Combat = null, string? ClanTag = null);
public sealed record Match(string Hash, string Path, string Title, string Mode, DateTime Time, double Seconds, int Winner, List<ReplayPlayer> Players, int StatsVersion = 0, MatchEconomy? Economy = null, int ClanVersion = 0);
public enum ReplayImportResult { Ignored, Added, Refreshed, Duplicate }
public sealed record LibrarySnapshot(string Version, JsonElement? Library);
public sealed record Mark(string Id, string Name, string Note, DateTime Updated, string List = "blocked");
public sealed record Rating(string Id, double? Value, string Status, string Url, DateTime Checked, string ProfileId, string Mode = "3v3 Commanders", string Region = "", string ProfileName = "");
public sealed record RegionRatingPair(Rating? Eu = null, Rating? Americas = null);
public sealed record RegionalRatingSlot(string Id, Rating? Rating);
public sealed record Alert(DateTime Time, string Source, string Message, List<string> Names);
public sealed record SortPreference(string Key, string Direction);
public sealed record CustomSoundMetadata(string Name, double Seconds);
public sealed class Settings
{
    public string Language { get; set; } = "en";
    public string GraphicalStyle { get; set; } = "default";
    public List<string> ReplayFolders { get; set; } = [];
    public List<string> SelfIds { get; set; } = [];
    public bool Sound { get; set; } = true;
    public bool ScreenWatch { get; set; }
    public bool LiveWatch { get; set; } = true;
    public bool PingOnGameLoading { get; set; }
    public bool PingOnGameLoaded { get; set; }
    public bool PingOnMatchAccept { get; set; }
    public string NotificationSoundPreset { get; set; } = "sc2-nuclear";
    public Dictionary<string, string> NotificationSoundStyles { get; set; } = new();
    public int NotificationSoundVolume { get; set; } = 55;
    public bool AutoAcceptMatch { get; set; }
    public string AutoPickCommander { get; set; } = "";
    public bool AutoDetectSelf { get; set; } = true;
    public Dictionary<string, bool> ListAlerts { get; set; } = new() { ["friends"] = false, ["blocked"] = true, ["losers"] = false };
    public Dictionary<string, SortPreference> SortPreferences { get; set; } = [];
    public bool IsListAlertEnabled(string list)
    {
        Store.ValidatePlayerList(list);
        return ListAlerts.GetValueOrDefault(list, list == "blocked");
    }
}
public sealed class Database
{
    public Settings Settings { get; set; } = new();
    public List<Match> Matches { get; set; } = [];
    public Dictionary<string, Mark> Marks { get; set; } = [];
    public Dictionary<string, List<string>> PlayerNicknames { get; set; } = [];
    public Dictionary<string, Rating> Ratings { get; set; } = [];
    public Dictionary<string, RegionRatingPair> RegionalRatings { get; set; } = [];
    public Dictionary<string, SiteLookup> SiteLookups { get; set; } = [];
    public Dictionary<string, DsstatsLookup> DsstatsLookups { get; set; } = [];
    public Dictionary<string, SiteHistory> SiteHistories { get; set; } = [];
    public Dictionary<string, SiteGameEvidence> SiteGames { get; set; } = [];
    public Dictionary<string, List<RatingChange>> MatchRatings { get; set; } = [];
    public Dictionary<string, long> Files { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Errors { get; set; } = [];
    public Dictionary<string, string> CombatFailures { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<OwnAccountGroup> OwnAccountGroups { get; set; } = [];
    public List<OwnLocalName> OwnLocalNames { get; set; } = [];
}
public sealed partial class Store
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    public readonly object Gate = new();
    public readonly string DirectoryPath;
    public Database Data { get; }
    private readonly string generation = Guid.NewGuid().ToString("N");
    private long revision;
    private LibrarySnapshot? publishedSnapshot;
    private DateTime snapshotPublishedAt;
    internal event Action? Changed;
    private void AdvanceVersion() { revision++; }
    internal void SignalLiveChange() => Changed?.Invoke();
    // Publish transient cache updates without serializing/flushing the replay
    // library for every intermediate site request. Callers persist completed work.
    internal void NotifyChanged() { lock (Gate) AdvanceVersion(); SignalLiveChange(); }
    public LibrarySnapshot Snapshot(string? knownVersion = null, TimeSpan minimumInterval = default)
    {
        lock (Gate)
        {
            var version = $"{generation}:{revision}";
            if (publishedSnapshot != null && publishedSnapshot.Version != version && DateTime.UtcNow - snapshotPublishedAt < minimumInterval)
                return new(publishedSnapshot.Version, publishedSnapshot.Version == knownVersion ? null : publishedSnapshot.Library);
            if (string.Equals(version, knownVersion, StringComparison.Ordinal)) return new(version, null);
            // Serialize while the store is locked: HTTP gets an owned JSON value,
            // never live settings/dictionaries that another request can mutate.
            if (publishedSnapshot?.Version != version)
            {
                publishedSnapshot = new(version, JsonSerializer.SerializeToElement(Summary(), Json));
                snapshotPublishedAt = DateTime.UtcNow;
            }
            return publishedSnapshot;
        }
    }
    public Store(string directory)
    {
        DirectoryPath = directory;
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "library.json");
        Data = LoadDatabase(path);
        Data.Settings.GraphicalStyle = GraphicalStyles.NormalizeStored(Data.Settings.GraphicalStyle);
        RecoverReplayJournal();
        ValidateLanguage(Data.Settings.Language);
        ValidateListAlerts(Data.Settings);
        ValidateSortPreferences(Data.Settings);
        foreach (var mark in Data.Marks.Values) ValidatePlayerList(mark.List);
    }
    public static void ValidatePlayerList(string? list)
    {
        if (list is not ("friends" or "blocked" or "losers")) throw new ArgumentException("Choose friends, blocked or losers.");
    }
    public static void ValidateLanguage(string? language)
    {
        if (language is not ("en" or "ru")) throw new ArgumentException("Choose English (en) or Russian (ru).");
    }
    public void SetLanguage(string language)
    {
        ValidateLanguage(language);
        lock (Gate)
        {
            Data.Settings.Language = language;
            Save();
        }
    }
    public static void ValidateListAlerts(Settings settings)
    {
        if (settings.ListAlerts == null) throw new ArgumentException("List alert settings are required.");
        foreach (var list in settings.ListAlerts.Keys) ValidatePlayerList(list);
    }
    public static void ValidateSortPreference(string? scope, string? key, string? direction)
    {
        bool validKey = scope switch
        {
            "players" => key is "encounters" or "name" or "commander" or "against" or "together" or "eu" or "americas" or "lastSeen",
            "matches" => key is "date" or "length",
            "marks" => key is "name" or "updated" or "encounters" or "against" or "together" or "eu" or "americas",
            _ => false
        };
        if (!validKey || direction is not ("asc" or "desc")) throw new ArgumentException("Choose a supported view, sort key and asc or desc direction.");
    }
    public static void ValidateSortPreferences(Settings settings)
    {
        if (settings.SortPreferences == null) throw new ArgumentException("Sort preferences are required.");
        foreach (var (scope, preference) in settings.SortPreferences)
        {
            if (preference == null) throw new ArgumentException("A sort preference is required.");
            ValidateSortPreference(scope, preference.Key, preference.Direction);
        }
    }
    public void SetSortPreference(string scope, string key, string direction)
    {
        ValidateSortPreference(scope, key, direction);
        lock (Gate)
        {
            ValidateSortPreferences(Data.Settings);
            Data.Settings.SortPreferences[scope] = new(key, direction);
        }
    }
    public void SetMark(string id, string name, string note = "", bool remove = false, string? list = null)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 100 || string.IsNullOrWhiteSpace(name) || name.Length > 64 || note == null || note.Length > 1000) throw new ArgumentException("Invalid player mark.");
        if (list != null) ValidatePlayerList(list);
        lock (Gate)
        {
            var category = list ?? Data.Marks.GetValueOrDefault(id)?.List ?? "blocked";
            ValidatePlayerList(category);
            if (remove) Data.Marks.Remove(id);
            else Data.Marks[id] = new(id, name.Trim(), note.Trim(), DateTime.UtcNow, category);
        }
    }
    public Mark SetPlayerList(string id, string name, string list)
    {
        if (list is not ("friends" or "losers")) throw new ArgumentException("Choose Friends or Losers.");
        lock (Gate)
        {
            // A list-only action must preserve the latest durable note, even if
            // the dashboard snapshot predates a save in another window.
            SetMark(id, name, Data.Marks.GetValueOrDefault(id)?.Note ?? "", list: list);
            Save();
            return Data.Marks[id];
        }
    }
    public void SetListAlert(string list, bool enabled)
    {
        ValidatePlayerList(list);
        lock (Gate)
        {
            ValidateListAlerts(Data.Settings);
            Data.Settings.ListAlerts[list] = enabled;
        }
    }
    public void Save()
    {
        lock (Gate)
        {
            // Production mutations outside ImportMatch publish through Save.
            // Invalidate even if disk persistence fails: memory has still changed.
            AdvanceVersion();
            var path = Path.Combine(DirectoryPath, "library.json");
            var temp = path + ".tmp";
            using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(stream, Data, Json);
                stream.Flush(true);
            }
            if (loadedBackup) { File.Move(temp, path, true); loadedBackup = false; }
            else if (File.Exists(path)) File.Replace(temp, path, path + ".bak");
            else File.Move(temp, path);
            // Only compact after the replacement is durable. Replaying a journal
            // left by a kill between these steps is deliberately idempotent.
            try
            {
                File.WriteAllText(ReplayJournalPath, "");
                journalWriteFaulted = false;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The library replacement already committed the settings and
                // replay records. Defer journal cleanup rather than report a
                // rejected save; surviving records recover idempotently.
                // Preserve journalWriteFaulted until cleanup actually succeeds.
            }
        }
    }
    public bool RefreshOwnAccounts()
    {
        List<string> seeds;
        lock (Gate) { if (!Data.Settings.AutoDetectSelf) return false; seeds = [.. Data.Settings.SelfIds]; }
        var groups = OwnAccounts.Scan(ReplayService.Sc2Roots(), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Battle.net", "Account"), seeds).ToList();
        var names = OwnNicknames.Read(groups);
        lock (Gate)
        {
            // A settings edit during discovery wins; the next periodic scan retries.
            if (!Data.Settings.AutoDetectSelf || !Data.Settings.SelfIds.SequenceEqual(seeds)) return false;
            string AccountState() => JsonSerializer.Serialize(new { Data.OwnAccountGroups, Data.OwnLocalNames, Data.Settings.SelfIds, Data.Settings.ReplayFolders });
            var before = AccountState();
            Data.OwnAccountGroups = groups;
            Data.OwnLocalNames = names;
            var profiles = groups.Where(g => g.CanAutoLink).SelectMany(g => g.Profiles).ToList();
            Data.Settings.SelfIds = seeds.Concat(profiles.Select(p => p.Id)).Distinct(StringComparer.Ordinal).ToList();
            var existingFolders = Data.Settings.ReplayFolders.ToList();
            var newFolders = profiles.Where(p => p.ReplayFolder != null).Select(p => p.ReplayFolder!).Where(candidate => !existingFolders.Any(folder => candidate.Equals(Path.GetFullPath(folder), StringComparison.OrdinalIgnoreCase) || candidate.StartsWith(Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder)) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)));
            Data.Settings.ReplayFolders = existingFolders.Concat(newFolders).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return before != AccountState();
        }
    }
    public RegionRatingPair GetRegionRatings(string id)
    {
        lock (Gate) return Data.RegionalRatings.GetValueOrDefault(id) ?? new();
    }
    // The dashboard preserves earlier links at their original storage identity.
    public RegionalRatingSlot ResolveRegionRating(string id, string region)
    {
        if (RatingService.NormalizeRegion(region) != region) throw new ArgumentException("Choose EU or Americas.");
        lock (Gate)
        {
            var profiles = TrustedOwnProfiles(id);
            var native = profiles.Where(p => p.Region == region).ToList();
            string target = native.Count == 1 ? native[0].Id : id;
            var identities = profiles.Count == 0 ? new[] { id } : profiles.Select(p => p.Id);
            var links = identities.Select(identity =>
            {
                var pair = GetRegionRatings(identity);
                return new RegionalRatingSlot(identity, region == "EU" ? pair.Eu : pair.Americas);
            }).Where(slot => slot.Rating != null).ToList();
            return links.FirstOrDefault(slot => slot.Id == target) ?? links.FirstOrDefault(slot => slot.Id == id)
                ?? (links.Count == 1 ? links[0] : new RegionalRatingSlot(target, null));
        }
    }
    private List<OwnProfile> TrustedOwnProfiles(string id)
    {
        if (!Data.Settings.SelfIds.Contains(id, StringComparer.Ordinal)) return [];
        var group = Data.OwnAccountGroups.FirstOrDefault(g => g.CanAutoLink && g.Profiles.Any(p => p.Id == id));
        return group?.Profiles.Where(p => Data.Settings.SelfIds.Contains(p.Id, StringComparer.Ordinal)).DistinctBy(p => p.Id).ToList() ?? [];
    }
    private void InvalidateSiteRegion(string id, string region)
    {
        var native = TrustedOwnProfiles(id).Where(p => p.Region == region).ToList();
        var keys = native.Count == 1 ? new[] { id, native[0].Id } : new[] { id };
        foreach (var key in keys.Distinct(StringComparer.Ordinal))
        {
            if (!Data.SiteLookups.TryGetValue(key, out var lookup)) continue;
            var remaining = lookup.Profiles.Where(p => p.Region != region).ToList();
            if (remaining.Count == lookup.Profiles.Count && SiteSyncService.NativeRegion(key) != region) continue;
            if (remaining.Count == 0) Data.SiteLookups.Remove(key);
            else Data.SiteLookups[key] = lookup with { Profiles = remaining };
        }
    }
    public void SetRegionRating(string id, string region, Rating rating)
    {
        if (RatingService.NormalizeRegion(region) != region || rating.Region != region || rating.Id != id) throw new ArgumentException("Rating identity or region does not match its slot.");
        lock (Gate)
        {
            var pair = GetRegionRatings(id);
            Data.RegionalRatings[id] = region == "EU" ? pair with { Eu = rating } : pair with { Americas = rating };
            InvalidateSiteRegion(id, region);
        }
    }
    public void RefreshRegionRating(string id, string region, string profileId, double? value)
    {
        lock (Gate)
        {
            var pair = GetRegionRatings(id);
            var linked = region == "EU" ? pair.Eu : pair.Americas;
            if (linked == null || linked.ProfileId != profileId) throw new InvalidOperationException("The linked profile changed. Refresh the new profile instead.");
            SetRegionRating(id, region, linked with { Value = value, Checked = DateTime.UtcNow, Status = value == null ? "No 3v3 Commanders rating found" : "Linked profile" });
        }
    }
    public void ClearRegionRating(string id, string region)
    {
        if (RatingService.NormalizeRegion(region) != region) throw new ArgumentException("Choose EU or Americas.");
        lock (Gate)
        {
            var pair = GetRegionRatings(id);
            pair = region == "EU" ? pair with { Eu = null } : pair with { Americas = null };
            if (pair.Eu == null && pair.Americas == null) Data.RegionalRatings.Remove(id);
            else Data.RegionalRatings[id] = pair;
            InvalidateSiteRegion(id, region);
        }
    }
    public ReplayImportResult ImportMatch(Match incoming)
    {
        if (!IsEligible(incoming)) return ReplayImportResult.Ignored;
        lock (Gate)
        {
            var roster = string.Join('|', incoming.Players.Select(p => p.Id).Order());
            var index = Data.Matches.FindIndex(m => m.Hash == incoming.Hash || (m.Time == incoming.Time && m.Title == incoming.Title && Math.Abs(m.Seconds - incoming.Seconds) < 1 && string.Join('|', m.Players.Select(p => p.Id).Order()) == roster));
            if (index < 0) { Data.Matches.Add(incoming); AdvanceVersion(); return ReplayImportResult.Added; }
            var existing = Data.Matches[index];
            bool enrichCombat = existing.StatsVersion < incoming.StatsVersion;
            bool enrichEconomy = incoming.Economy != null && (existing.Economy?.Version ?? 0) < incoming.Economy.Version;
            bool enrichClan = existing.ClanVersion < incoming.ClanVersion;
            if (!enrichCombat && !enrichEconomy && !enrichClan) return ReplayImportResult.Duplicate;
            var clans = enrichClan ? incoming.Players.GroupBy(p => p.Id, StringComparer.Ordinal).ToDictionary(g => g.Key, g =>
            {
                var tags = g.Select(p => ReplayClanTags.Normalize(p.ClanTag)).Distinct(StringComparer.Ordinal).ToList();
                return tags.Count == 1 ? tags[0] : null;
            }, StringComparer.Ordinal) : null;
            // Enrich the same match without changing its result, date, identity or marks.
            var players = !enrichCombat && !enrichClan ? existing.Players : existing.Players.Select(p =>
            {
                var refreshed = enrichCombat ? incoming.Players.FirstOrDefault(x => x.Id == p.Id) : null;
                var player = refreshed == null ? p : p with { Apm = refreshed.Apm, Killed = refreshed.Killed, Lost = refreshed.Lost, Combat = refreshed.Combat };
                return enrichClan ? player with { ClanTag = clans!.GetValueOrDefault(p.Id) ?? p.ClanTag } : player;
            }).ToList();
            Data.Matches[index] = existing with { Players = players, StatsVersion = enrichCombat ? incoming.StatsVersion : existing.StatsVersion, Path = enrichCombat || enrichEconomy ? incoming.Path : existing.Path, Economy = enrichEconomy ? incoming.Economy : existing.Economy, ClanVersion = enrichClan ? incoming.ClanVersion : existing.ClanVersion };
            AdvanceVersion();
            return ReplayImportResult.Refreshed;
        }
    }
    private sealed class OutcomeTotals
    {
        private int games, wins, losses;
        public void Add(bool? outcome) { games++; if (outcome == true) wins++; else if (outcome == false) losses++; }
        public object Summary() => new { games, wins, losses, unknown = games - wins - losses, winRate = wins + losses == 0 ? (double?)null : 100.0 * wins / (wins + losses) };
    }
    private sealed class EncounterTotals
    {
        public int Encounters;
        public readonly OutcomeTotals Against = new(), Together = new();
    }
    public object Summary()
    {
        lock (Gate)
        {
            var matches = Data.Matches.Where(IsEligible).ToList();
            var allMatchesByTime = Data.Matches.OrderByDescending(m => m.Time).ToList();
            var matchesByTime = allMatchesByTime.Where(IsEligible).ToList();
            var ownIds = Data.Settings.SelfIds.ToHashSet(StringComparer.Ordinal);
            var sightings = matches.SelectMany(m => m.Players.Select(p => (Match: m, Player: p))).GroupBy(p => p.Player.Id)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);
            var games = matches.Select(m => (Match: m, Me: m.Players.FirstOrDefault(p => ownIds.Contains(p.Id)))).Where(x => x.Me != null).ToList();
            var known = games.Where(x => Outcome(x.Match, x.Me!) != null).ToList();
            var wins = known.Count(x => Outcome(x.Match, x.Me!) == true);
            var encounters = new Dictionary<string, EncounterTotals>(StringComparer.Ordinal);
            foreach (var game in games)
            {
                var outcome = Outcome(game.Match, game.Me!);
                foreach (var group in game.Match.Players.GroupBy(p => p.Id).Where(g => !ownIds.Contains(g.Key)))
                {
                    if (!encounters.TryGetValue(group.Key, out var totals)) encounters[group.Key] = totals = new();
                    totals.Encounters++;
                    // Preserve Any semantics even for a malformed duplicate ID on
                    // both teams: it appears once in each relevant game category.
                    if (group.Any(p => p.Team != game.Me!.Team)) totals.Against.Add(outcome);
                    if (group.Any(p => p.Team == game.Me!.Team)) totals.Together.Add(outcome);
                }
            }
            var players = sightings.Where(g => !ownIds.Contains(g.Key)).Select(g =>
            {
                var recent = g.Value.MaxBy(p => p.Match.Time);
                var totals = encounters.GetValueOrDefault(g.Key) ?? new();
                return new { id = g.Key, name = recent.Player.Name, clanTag = recent.Player.ClanTag, aliases = g.Value.Select(p => p.Player.Name).Concat(Data.PlayerNicknames.GetValueOrDefault(g.Key, [])).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), encounters = totals.Encounters, against = totals.Against.Summary(), together = totals.Together.Summary(), mark = Data.Marks.GetValueOrDefault(g.Key), rating = Data.Ratings.GetValueOrDefault(g.Key), ratings = GetRegionRatings(g.Key), lastSeen = recent.Match.Time };
            }).OrderByDescending(p => p.mark != null).ThenByDescending(p => p.encounters).ToList();
            var ownHistory = allMatchesByTime.SelectMany(m => m.Players.Where(p => ownIds.Contains(p.Id)).Select(p => (Match: m, Player: p)))
                .GroupBy(p => p.Player.Id).ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);
            var shortcuts = Data.OwnLocalNames.OrderByDescending(n => n.ObservedAt).GroupBy(n => n.Id).ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);
            object Profile(OwnProfile profile)
            {
                var history = ownHistory.GetValueOrDefault(profile.Id) ?? [];
                var localNames = shortcuts.GetValueOrDefault(profile.Id) ?? [];
                var recent = history.FirstOrDefault();
                var shortcut = localNames.FirstOrDefault();
                bool preferShortcut = shortcut != null && (recent.Player == null || shortcut.ObservedAt > recent.Match.Time);
                string? name = preferShortcut ? shortcut!.Name : recent.Player?.Name;
                return new { profile.Id, profile.Region, name, clanTag = recent.Player?.ClanTag, aliases = history.Select(p => p.Player.Name).Concat(localNames.Select(n => n.Name)).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), nameSource = preferShortcut ? "SC2 profile shortcut" : name == null ? "No local name yet" : "Imported replay", ratings = GetRegionRatings(profile.Id) };
            }
            var ownAccountGroups = Data.OwnAccountGroups.Select(g => new { g.Key, g.LocalAccountId, g.Evidence, g.Status, g.CanAutoLink, g.Warnings, profiles = g.Profiles.Where(p => ownIds.Contains(p.Id)).Select(Profile).ToList() }).Where(g => g.profiles.Count > 0).ToList();
            var ratingBasis = sightings.Keys.ToDictionary(id => id, id =>
            {
                var region = id.StartsWith("2-S2-", StringComparison.Ordinal) ? "EU" : id.StartsWith("1-S2-", StringComparison.Ordinal) ? "Americas" : null;
                var linked = region == null ? null : ResolveRegionRating(id, region).Rating;
                var automatic = Data.SiteLookups.GetValueOrDefault(id)?.Profiles.Where(profile => profile.Region == region).ToList();
                return new RatingBasis(linked != null ? linked.Value : automatic?.Count == 1 ? automatic[0].Rating : null, null);
            });
            var mainBasis = sightings.ToDictionary(item => item.Key, item =>
            {
                var id = item.Key;
                var region = id.StartsWith("2-S2-", StringComparison.Ordinal) ? "EU" : id.StartsWith("1-S2-", StringComparison.Ordinal) ? "Americas" : null;
                if (region == null) return new RatingBasis(null, null);
                var linked = ResolveRegionRating(id, region).Rating;
                var name = item.Value.MaxBy(value => value.Match.Time).Player.Name;
                var candidates = Data.SiteLookups.GetValueOrDefault(id)?.Profiles
                    ?? Data.SiteLookups.GetValueOrDefault(SiteSyncService.NameLookupKey(name, region))?.Profiles ?? [];
                var profile = candidates.Where(p => p.Region == region && (linked == null || p.ProfileId == linked.ProfileId))
                    .OrderByDescending(p => p.LastPlayed).ThenByDescending(p => p.SearchGames ?? p.DiscoveredGames ?? 0).ThenBy(p => p.ProfileId, StringComparer.Ordinal).FirstOrDefault();
                return RatingChangeEstimator.MainBasis(profile);
            }, StringComparer.Ordinal);
            var ratingChanges = matches.ToDictionary(m => m.Hash, m => RatingChangeEstimator.BestAvailable(m, ratingBasis, mainBasis, Data.MatchRatings.GetValueOrDefault(m.Hash)).ToList());
            return new { settings = Data.Settings, playerNicknames = Data.PlayerNicknames.ToDictionary(pair => pair.Key, pair => pair.Value.ToList()), matches = matchesByTime.Select(WithoutImpactTrace).ToList(), players, marks = Data.Marks.Values.ToList(), ratings = Data.RegionalRatings.ToDictionary(x => x.Key, x => x.Value), siteLookups = Data.SiteLookups.ToDictionary(x => x.Key, x => x.Value), dsstatsLookups = Data.DsstatsLookups.ToDictionary(x => x.Key, x => x.Value), siteHistories = Data.SiteHistories.ToDictionary(x => x.Key, x => x.Value with { Games = x.Value.Games.ToList() }), siteGames = Data.SiteGames.ToDictionary(x => x.Key, x => x.Value with { Players = x.Value.Players.ToList() }), ratingChanges, errors = Data.Errors.TakeLast(20).ToList(), total = games.Count, known = known.Count, wins, losses = known.Count - wins, winRate = known.Count == 0 ? (double?)null : 100.0 * wins / known.Count, combatGames = matches.Count(m => m.StatsVersion >= CombatStatsExtractor.CurrentVersion), combatTotal = matches.Count, accounts = matchesByTime.SelectMany(m => m.Players).Where(p => ownIds.Contains(p.Id)).DistinctBy(p => p.Id).Select(p => new { p.Id, p.Name, p.ClanTag }).ToList(), ownAccountGroups };
        }
    }
    // Detailed traces are fetched on click, outside periodic lobby/library payloads.
    internal static Match WithoutImpactTrace(Match match) => match with { Players = match.Players.Select(player =>
        player.Combat?.Impact == null ? player : player with { Combat = player.Combat with { Impact = null } }).ToList() };
    public object? ImpactDetails(string hash)
    {
        lock (Gate)
        {
            var match = Data.Matches.FirstOrDefault(match => match.Hash == hash && IsEligible(match));
            return match == null ? null : new { hash = match.Hash, statsVersion = match.StatsVersion,
                pending = ReplayService.NeedsEnrichment(match),
                players = match.Players.Select(player => new { player.Id, impact = player.Combat?.Impact }).ToList() };
        }
    }
    public static bool IsEligible(Match match) => match.Mode == "Commanders" && match.Players.Count == 6 && match.Players.All(p => p.Team > 0) && match.Players.GroupBy(p => p.Team).Count() == 2 && match.Players.GroupBy(p => p.Team).All(g => g.Count() == 3);
    public static bool? Outcome(Match match, ReplayPlayer me)
    {
        if (match.Winner > 0 && me.Team > 0) return match.Winner == me.Team;
        return me.Result switch { "Win" => true, "Loss" => false, _ => null };
    }
}
