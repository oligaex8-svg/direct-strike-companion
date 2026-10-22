using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

public sealed record RatingCandidate(string ProfileId, string Name, double? Rating, string Region, int Games, double? WinRate, string Url,
    DateTime? PlayedLast = null);
public sealed record SiteCommanderStat(string Commander, int Games, double? WinRate);
public sealed record SiteProfileEstimate(double? EstimatedRating, int? DiscoveredGames, double? WinRate, DateTime? Checked = null,
    List<SiteCommanderStat>? CommanderStats = null, int ProfileStatsVersion = 0, double? MainRating = null);
public sealed class RatingService
{
    public const int CurrentProfileStatsVersion = 2;
    public const int CommanderStatLimit = 12;
    private readonly HttpClient http;
    private readonly TimeSpan requestInterval;
    private readonly TimeProvider clock;
    public RatingService() : this(new HttpClient { Timeout = TimeSpan.FromSeconds(12) }, TimeSpan.Zero) { }
    internal RatingService(HttpClient http, TimeSpan requestInterval, TimeProvider? clock = null)
    { this.http = http; this.requestInterval = requestInterval; this.clock = clock ?? TimeProvider.System; }
    // Two lobby discoveries can progress while one normal profile request is pending.
    private readonly SemaphoreSlim gate = new(3, 3);
    private readonly SemaphoreSlim throttleGate = new(1, 1);
    private readonly Dictionary<string, (DateTime Time, List<RatingCandidate> Players)> cache = [];
    private readonly object ratingCacheGate = new();
    private readonly Dictionary<string, (DateTime Time, double? Value)> commanderCache = [];
    private readonly Dictionary<string, (DateTime Time, SiteProfileEstimate Value)> profileCache = [];
    private DateTime lastCall;
    internal DateTime UtcNow => clock.GetUtcNow().UtcDateTime;
    public static string? NormalizeRegion(string? region) => region?.Trim().ToLowerInvariant() switch
    {
        "eu" or "europe" or "2" => "EU",
        "na" or "us" or "america" or "americas" or "north america" or "1" => "Americas",
        _ => null
    };
    public async Task<double?> CommanderRatingAsync(string profileId, CancellationToken cancellationToken = default, bool refresh = false)
    {
        if (!long.TryParse(profileId, out var id) || id <= 0) throw new ArgumentException("Invalid profile.");
        cancellationToken.ThrowIfCancellationRequested();
        lock (ratingCacheGate)
            if (!refresh && commanderCache.TryGetValue(profileId, out var cached) && clock.GetUtcNow().UtcDateTime - cached.Time
                < (cached.Value.HasValue ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5))) return cached.Value;
        try
        {
            var value = ParseProfileCommanderRating(profileId, await PageAsync($"/player/{id}/ratings", cancellationToken));
            lock (ratingCacheGate)
            {
                commanderCache[profileId] = (clock.GetUtcNow().UtcDateTime, value);
                foreach (var key in commanderCache.OrderBy(p => p.Value.Time).Take(Math.Max(0, commanderCache.Count - 500)).Select(p => p.Key).ToArray()) commanderCache.Remove(key);
            }
            return value;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { cancellationToken.ThrowIfCancellationRequested(); throw new InvalidOperationException("The 3v3 Commanders rating is unavailable. Try again later.", ex); }
    }
    public static double? ParseCommanderRating(string html)
    {
        var row = Regex.Match(html, "<a\\s+href=\"/rating/commanders_3v3\"[^>]*>commanders_3v3</a>\\s*</th>\\s*<td[^>]*>([^<]*)</td>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        return row.Success && double.TryParse(WebUtilityDecode(row.Groups[1].Value).Trim(), NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : null;
    }
    public static double? ParseProfileCommanderRating(string profileId, string html)
    {
        var header = Regex.Match(html, @"<h1\b[^>]*>\s*Ratings of\s+(.*?)</h1>", RegexOptions.IgnoreCase | RegexOptions.Singleline, TimeSpan.FromSeconds(1));
        var identity = Regex.Match(header.Groups[1].Value, "<a\\b[^>]*href=[\"']/player/([1-9][0-9]*)[\"'][^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        if (!identity.Success || identity.Groups[1].Value != profileId)
            throw new InvalidDataException("ds-rating.com returned an unexpected rating profile. Try again later.");
        return ParseCommanderRating(html);
    }
    public async Task<SiteProfileEstimate> ProfileEstimateAsync(string profileId, CancellationToken cancellationToken = default, bool refresh = false)
    {
        if (!long.TryParse(profileId, out var id) || id <= 0) throw new ArgumentException("Invalid profile.");
        cancellationToken.ThrowIfCancellationRequested();
        lock (ratingCacheGate)
            if (!refresh && profileCache.TryGetValue(profileId, out var cached) && clock.GetUtcNow().UtcDateTime - cached.Time
                < (cached.Value.EstimatedRating.HasValue ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(5))) return cached.Value;
        try
        {
            var value = ParseProfileEstimate(profileId, await PageAsync($"/player/{id}", cancellationToken)) with { Checked = clock.GetUtcNow().UtcDateTime };
            lock (ratingCacheGate)
            {
                profileCache[profileId] = (clock.GetUtcNow().UtcDateTime, value);
                foreach (var key in profileCache.OrderBy(p => p.Value.Time).Take(Math.Max(0, profileCache.Count - 500)).Select(p => p.Key).ToArray()) profileCache.Remove(key);
            }
            return value;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { cancellationToken.ThrowIfCancellationRequested(); throw new InvalidOperationException("The site profile estimate is unavailable. Try again later.", ex); }
    }

    public static SiteProfileEstimate ParseProfileEstimate(string profileId, string html)
    {
        const RegexOptions options = RegexOptions.IgnoreCase | RegexOptions.Singleline;
        string Text(string value) => Regex.Replace(WebUtilityDecode(Regex.Replace(value, "<[^>]+>", "", options, TimeSpan.FromSeconds(1))), @"\s+", " ").Trim();
        string Attribute(string tag, string name)
        {
            var match = Regex.Match(tag, $@"\b{name}\s*=\s*[""']([^""']*)[""']", options, TimeSpan.FromSeconds(1));
            return WebUtilityDecode(match.Groups[1].Value);
        }
        var tags = Regex.Matches(html, @"<(?:meta|link)\b[^>]*>", options, TimeSpan.FromSeconds(1)).Cast<System.Text.RegularExpressions.Match>().ToArray();
        var identities = tags.Where(tag => Attribute(tag.Value, "property") == "og:url" || Attribute(tag.Value, "rel") == "canonical")
            .Select(tag => Attribute(tag.Value, "property") == "og:url" ? Attribute(tag.Value, "content") : Attribute(tag.Value, "href")).ToArray();
        var header = Regex.Match(html, @"<h1\b[^>]*class\s*=\s*[""'][^""']*\bpage-title\b[^""']*[""'][^>]*>(.*?)</h1>", options, TimeSpan.FromSeconds(1));
        var title = Regex.Match(html, @"<title\b[^>]*>(.*?)</title>", options, TimeSpan.FromSeconds(1));
        var name = Text(header.Groups[1].Value);
        var titleName = Regex.Match(Text(title.Groups[1].Value), @"^(.*?) player profile\s*[—–-]", options, TimeSpan.FromSeconds(1));
        if (identities.Length == 0 || identities.Any(url => !Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || uri.Scheme != "https" || uri.Host != "ds-rating.com" || uri.AbsolutePath.TrimEnd('/') != "/player/" + profileId
            || uri.Query.Length != 0 || uri.Fragment.Length != 0) || name.Length == 0 || !titleName.Success || titleName.Groups[1].Value != name)
            throw new InvalidDataException("ds-rating.com returned an unexpected player profile. Try again later.");

        var box = Regex.Match(html, @"<div\b[^>]*id\s*=\s*[""']rating-box[""'][^>]*>(.*?)</div>", options, TimeSpan.FromSeconds(1));
        var label = Regex.Match(box.Groups[1].Value, @"<h6\b[^>]*>(.*?)</h6>", options, TimeSpan.FromSeconds(1));
        var number = Regex.Match(box.Groups[1].Value, @"<h3\b[^>]*>([^<]*)", options, TimeSpan.FromSeconds(1));
        if (!box.Success || !label.Success || !number.Success) throw new InvalidDataException("ds-rating.com returned an incomplete player rating card. Try again later.");
        double? estimate = null, mainRating = null;
        bool estimatedCard = Text(label.Groups[1].Value).Equals("Estimated rating", StringComparison.OrdinalIgnoreCase);
        if (estimatedCard || Text(label.Groups[1].Value).Equals("Rating", StringComparison.OrdinalIgnoreCase))
        {
            var text = Text(number.Groups[1].Value);
            if (text is not ("" or "..." or "—" or "-"))
            {
                if (!double.TryParse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
                    throw new InvalidDataException("ds-rating.com returned an invalid profile estimate. Try again later.");
                if (estimatedCard) estimate = value; else mainRating = value;
            }
        }
        else if (!Text(label.Groups[1].Value).Equals("Rating", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("ds-rating.com returned an unexpected player rating card. Try again later.");
        double? CardNumber(string labelText, bool percent = false)
        {
            var card = Regex.Match(html, @"<h6\b[^>]*>\s*" + Regex.Escape(labelText) + @"\s*</h6>\s*<h3\b[^>]*>([^<]*)", options, TimeSpan.FromSeconds(1));
            var text = Text(card.Groups[1].Value).TrimEnd('%');
            return card.Success && double.TryParse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value)
                && double.IsFinite(value) && value >= 0 && (!percent || value <= 100) ? value : null;
        }
        var games = CardNumber("Discovered games") ?? CardNumber("Games");
        var commanderStats = new List<SiteCommanderStat>();
        var commanderTable = Regex.Match(html, @"<h4\b[^>]*>\s*<a\b[^>]*href\s*=\s*[""']/player/" + Regex.Escape(profileId)
            + @"/commanders[""'][^>]*>\s*Commanders stats\s*</a>\s*</h4>\s*(?:<div\b[^>]*>\s*)?<table\b[^>]*>(.*?)</table>", options, TimeSpan.FromSeconds(1));
        var commanders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (System.Text.RegularExpressions.Match row in Regex.Matches(commanderTable.Groups[1].Value, @"<tr\b[^>]*>(.*?)</tr>", options, TimeSpan.FromSeconds(1)))
        {
            var cells = Regex.Matches(row.Groups[1].Value, @"<(?:th|td)\b[^>]*>(.*?)</(?:th|td)>", options, TimeSpan.FromSeconds(1));
            if (cells.Count < 3) continue;
            var commander = Regex.Match(cells[0].Groups[1].Value, @"<a\b[^>]*href\s*=\s*[""']/player/" + Regex.Escape(profileId)
                + @"/commander/([a-z0-9_-]+)[""'][^>]*>(.*?)</a>", options, TimeSpan.FromSeconds(1));
            var commanderName = Text(commander.Groups[2].Value);
            if (!commander.Success || commanderName.Length is < 1 or > 80 || commanders.Contains(commander.Groups[1].Value)
                || !int.TryParse(Text(cells[1].Groups[1].Value), NumberStyles.Integer | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var played) || played < 0) continue;
            var winText = Text(cells[2].Groups[1].Value).TrimEnd('%');
            double? winRate = null;
            if (winText is not ("" or "..." or "—" or "-"))
            {
                if (!double.TryParse(winText, NumberStyles.Float, CultureInfo.InvariantCulture, out var win) || !double.IsFinite(win) || win is < 0 or > 100) continue;
                winRate = win;
            }
            commanders.Add(commander.Groups[1].Value);
            commanderStats.Add(new(commanderName, played, winRate));
            if (commanderStats.Count == CommanderStatLimit) break;
        }
        return new(estimate, games is >= 0 and <= int.MaxValue && games == Math.Truncate(games.Value) ? (int)games.Value : null,
            CardNumber("Winrate", percent: true), CommanderStats: commanderStats, ProfileStatsVersion: CurrentProfileStatsVersion, MainRating: mainRating);
    }
    // All site requests share three bounded in-flight slots. Production adds no fixed delay;
    // the bounded caches and visible-name queue contain repeat/public-site work.
    public async Task<string> PageAsync(string path, CancellationToken cancellationToken = default)
    {
        if (!Regex.IsMatch(path, @"^/(?:player/[1-9][0-9]*(?:/(?:ratings|games))?|game/[1-9][0-9]*)$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)))
            throw new ArgumentException("Unsupported site page.");
        await gate.WaitAsync(cancellationToken);
        try
        {
            using var request = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            request.CancelAfter(TimeSpan.FromSeconds(12));
            await ThrottleAsync(request.Token);
            using var response = await http.GetAsync("https://ds-rating.com" + path, HttpCompletionOption.ResponseHeadersRead, request.Token);
            response.EnsureSuccessStatusCode();
            var bytes = await ReadBoundedAsync(response, request.Token);
            return System.Text.Encoding.UTF8.GetString(bytes);
        }
        finally { gate.Release(); }
    }
    private async Task ThrottleAsync(CancellationToken cancellationToken)
    {
        await throttleGate.WaitAsync(cancellationToken);
        try
        {
            var delay = requestInterval - (DateTime.UtcNow - lastCall);
            if (delay > TimeSpan.Zero) await Task.Delay(delay, cancellationToken);
            lastCall = DateTime.UtcNow;
        }
        finally { throttleGate.Release(); }
    }
    private static async Task<byte[]> ReadBoundedAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        const int limit = 2_000_000;
        if (response.Content.Headers.ContentLength > limit) throw new InvalidDataException("Site response too large.");
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[16_384];
        int read;
        while ((read = await stream.ReadAsync(buffer, cancellationToken)) != 0)
        {
            if (output.Length + read > limit) throw new InvalidDataException("Site response too large.");
            output.Write(buffer, 0, read);
        }
        return output.ToArray();
    }
    private static string WebUtilityDecode(string value) => System.Net.WebUtility.HtmlDecode(value);
    public async Task<List<RatingCandidate>> SearchAsync(string name, bool refresh = false, CancellationToken cancellationToken = default)
    {
        name = name.Trim();
        if (name.Length is < 1 or > 32) throw new ArgumentException("Enter a player name from 1 to 32 characters.");
        await gate.WaitAsync(cancellationToken);
        try
        {
            lock (ratingCacheGate)
                if (!refresh && cache.TryGetValue(name, out var existing) && clock.GetUtcNow().UtcDateTime - existing.Time < TimeSpan.FromMinutes(5)) return existing.Players;
            using var request = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            request.CancelAfter(TimeSpan.FromSeconds(12));
            await ThrottleAsync(request.Token);
            using var response = await http.GetAsync("https://ds-rating.com/dsr/search_players.php?s=" + Uri.EscapeDataString(name.ToLowerInvariant()), HttpCompletionOption.ResponseHeadersRead, request.Token);
            response.EnsureSuccessStatusCode();
            var bytes = await ReadBoundedAsync(response, request.Token);
            using var doc = JsonDocument.Parse(bytes);
            if (doc.RootElement.TryGetProperty("fail", out var failure) && failure.ValueKind is not (JsonValueKind.Null or JsonValueKind.False))
                throw new InvalidDataException("ds-rating.com could not complete the player search. Try again later.");
            if (!doc.RootElement.TryGetProperty("players", out var array) || array.ValueKind != JsonValueKind.Array) throw new InvalidDataException("ds-rating.com returned an unexpected response.");
            var players = new List<RatingCandidate>();
            foreach (var p in array.EnumerateArray())
            {
                string Text(string key) => p.TryGetProperty(key, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : "";
                double? Number(string key, bool percent = false) => double.TryParse(percent ? Text(key).Trim().TrimEnd('%') : Text(key),
                    NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n) ? n : null;
                var id = Text("id");
                if (!long.TryParse(id, out var profile) || profile <= 0) continue;
                var games = Number("games");
                var winRate = Number("winrate", percent: true);
                DateTime? playedLast = DateTime.TryParseExact(Text("played_last"), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var playedAt) ? playedAt : null;
                players.Add(new(id, Text("player_name"), Number("rating"), Text("region"),
                    games is >= 0 and <= int.MaxValue && games == Math.Truncate(games.Value) ? (int)games.Value : 0,
                    winRate is >= 0 and <= 100 ? winRate : null, "https://ds-rating.com/player/" + id, playedLast));
            }
            lock (ratingCacheGate)
            {
                cache[name] = (clock.GetUtcNow().UtcDateTime, players);
                foreach (var key in cache.OrderBy(p => p.Value.Time).Take(Math.Max(0, cache.Count - 500)).Select(p => p.Key).ToArray()) cache.Remove(key);
            }
            return players;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        { cancellationToken.ThrowIfCancellationRequested(); throw new InvalidOperationException("ds-rating.com is unavailable. Try again later.", ex); }
        finally { gate.Release(); }
    }
}
