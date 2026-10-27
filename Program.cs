using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--apply-update") { ReleaseUpdater.Apply(args[1]); return; }
        if (args.Contains("--fake-lobby-ocr-worker")) { LobbyOcrWorkerTests.RunFakeWorker(args); return; }
        if (args.Contains("--replay-worker")) { ReplayDecodeWorker.Run(); return; }
        if (args.Contains("--replay-worker-fixture")) { ReplayDecodeWorker.RunFixture(args); return; }
        if (args.Contains("--import-recovery-fixture")) { ReplayRecoveryTests.RunFixture(args); return; }
        if (args.Contains("--probe-worker")) { ReplayRecoveryTests.RunProbe(args); return; }
        if (args.Contains("--probe-clans")) { ReplayDiagnostics.RunClans(args); return; }
        if (args.Contains("--probe-summary")) { SummaryPerformanceTests.RunProbe(args); return; }
        if (args.Contains("--probe-replay")) { ReplayDiagnostics.Run(args); return; }
        if (args.Contains("--probe-impact")) { ImpactDiagnostics.RunAsync(args).GetAwaiter().GetResult(); return; }
        if (args.Contains("--probe-site-profiles")) { SiteProfileDiagnostics.Run(); return; }
        if (args.Contains("--probe-dsstats")) { DsstatsDiagnostics.RunAsync().GetAwaiter().GetResult(); return; }
        if (args.Contains("--probe-lobby-ratings")) { LiveLobbyRatingDiagnostics.RunAsync().GetAwaiter().GetResult(); return; }
        if (args.Contains("--probe-notification-audio")) { NotificationAudioDiagnostics.Run(args); return; }
        if (args.Contains("--self-test")) { SelfTests.Run(args); return; }
        if (args.Contains("--capture-sc2-window")) { Sc2WindowCapture.Run(args); return; }
        if (args.Contains("--probe-lobby-reader")) { LobbyReaderProbe.RunAsync(args).GetAwaiter().GetResult(); return; }
        if (args.Contains("--probe-lobby-reader-live")) { LobbyReaderProbe.RunLiveAsync().GetAwaiter().GetResult(); return; }
        AppBranding.ApplyWindowsIdentity();
        using var mutex = new Mutex(true, @"Local\DirectStrikeCompanion", out bool first);
        if (!first)
        {
            var urlFile = Path.Combine(DataDirectory(), "running-url.txt");
            if (File.Exists(urlFile) && Uri.TryCreate(File.ReadAllText(urlFile).Trim(), UriKind.Absolute, out var existing) && existing.Scheme == "http" && existing.Host == "127.0.0.1")
                OpenExistingDashboard(existing);
            else MessageBox.Show("Direct Strike Companion is running. Open it from the system tray.");
            return;
        }
        ApplicationConfiguration.Initialize();
        try { Application.Run(new CompanionContext(args)); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Direct Strike Companion"); }
    }
    private static void OpenExistingDashboard(Uri url)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            client.DefaultRequestHeaders.Add("X-DS-Companion", "1");
            using var response = client.PostAsync(new Uri(url, "/api/desktop/open"), null).GetAwaiter().GetResult();
            if (response.IsSuccessStatusCode) return;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) { }
        // Keep compatibility with an older tray app that has no desktop-window endpoint.
        Process.Start(new ProcessStartInfo(url.ToString()) { UseShellExecute = true });
    }
    internal static string ResolveDataDirectory(string root, string? configured) => configured ?? Path.Combine(root, "data");
    internal static string DataDirectory() => ResolveDataDirectory(ProjectRoot(), Environment.GetEnvironmentVariable("DSC_DATA_DIR"));
    internal static string ProjectRoot() => FindInstallationRoot(AppContext.BaseDirectory,
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Projects", "DirectStrikeCompanion"));

    internal static string FindInstallationRoot(string baseDirectory, string fallback)
    {
        string? sourceRoot = null;
        for (var current = new DirectoryInfo(baseDirectory); current != null; current = current.Parent)
        {
            // Prefer the installation over the nested development project, so
            // development builds and compatibility launchers share its private data.
            if (File.Exists(Path.Combine(current.FullName, "Support", "Development", "DirectStrikeCompanion.csproj")))
                return current.FullName;
            if (sourceRoot is null && File.Exists(Path.Combine(current.FullName, "DirectStrikeCompanion.csproj")))
                sourceRoot = current.FullName;
        }
        return sourceRoot ?? fallback;
    }
}

internal sealed class CompanionContext : ApplicationContext
{
    private readonly DesktopTrayIcon tray;
    private readonly Control dispatch = new();
    private readonly CancellationTokenSource shutdown = new();
    private readonly CompanionBackgroundTasks background;
    private readonly WebApplication web;
    private readonly ReplayService replay;
    private readonly Store store;
    private readonly NotificationSounds notificationSounds;
    private readonly CustomNotificationSounds customSounds;
    private readonly ReleaseUpdater releaseUpdater;
    private readonly string url;
    private DashboardWindow? dashboard;
    private bool exiting;
    private string desktopLanguage = "en";
    public CompanionContext(string[] args)
    {
        background = new(shutdown);
        dispatch.CreateControl();
        store = new Store(Program.DataDirectory());
        releaseUpdater = new ReleaseUpdater();
        customSounds = new CustomNotificationSounds(store.DirectoryPath);
        notificationSounds = new NotificationSounds(customSounds);
        if (store.Data.Settings.ReplayFolders.Count == 0 && store.Data.Matches.Count == 0)
        {
            var listAlerts = store.Data.Settings.ListAlerts;
            var sortPreferences = store.Data.Settings.SortPreferences;
            var language = store.Data.Settings.Language;
            var graphicalStyle = store.Data.Settings.GraphicalStyle;
            var pingOnLoading = store.Data.Settings.PingOnGameLoading;
            var pingOnLoaded = store.Data.Settings.PingOnGameLoaded;
            var pingOnAccept = store.Data.Settings.PingOnMatchAccept;
            var sound = store.Data.Settings.Sound;
            var preset = store.Data.Settings.NotificationSoundPreset;
            var volume = store.Data.Settings.NotificationSoundVolume;
            var styles = store.Data.Settings.NotificationSoundStyles;
            var autoAccept = store.Data.Settings.AutoAcceptMatch;
            var autoCommander = store.Data.Settings.AutoPickCommander;
            store.Data.Settings = ReplayService.Discover();
            store.Data.Settings.ListAlerts = listAlerts;
            store.Data.Settings.SortPreferences = sortPreferences;
            store.Data.Settings.Language = language;
            store.Data.Settings.GraphicalStyle = graphicalStyle;
            store.Data.Settings.PingOnGameLoading = pingOnLoading;
            store.Data.Settings.PingOnGameLoaded = pingOnLoaded;
            store.Data.Settings.PingOnMatchAccept = pingOnAccept;
            store.Data.Settings.Sound = sound;
            store.Data.Settings.NotificationSoundPreset = preset;
            store.Data.Settings.NotificationSoundVolume = volume;
            store.Data.Settings.NotificationSoundStyles = styles;
            store.Data.Settings.AutoAcceptMatch = autoAccept;
            store.Data.Settings.AutoPickCommander = autoCommander;
            store.Save();
        }
        store.RefreshOwnAccounts(); store.Save();
        desktopLanguage = store.Data.Settings.Language;
        replay = new ReplayService(store);
        var rating = new RatingService();
        var siteSync = new SiteSyncService(store, rating);
        var dsstats = new DsstatsService(store);
        var lobbyRatings = new LiveLobbyRatings(store, siteSync, dsstats);
        var liveUpdates = new LiveUpdateSignal();
        releaseUpdater.Changed += liveUpdates.Pulse;
        store.Changed += liveUpdates.Pulse;
        void QueueRecentRatings()
        {
            List<string> ids;
            lock (store.Gate) ids = store.Data.Settings.SelfIds.Concat(store.Data.Matches.Where(Store.IsEligible).OrderByDescending(m => m.Time).Take(1).SelectMany(m => m.Players).Select(p => p.Id)).Distinct().ToList();
            siteSync.Queue(ids);
            dsstats.Queue(ids);
        }
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        url = $"http://127.0.0.1:{port}";
        var menu = new ContextMenuStrip();
        string Language() => Volatile.Read(ref desktopLanguage);
        Task<bool> TestNotification()
        {
            string language;
            bool sound;
            string preset;
            int volume;
            lock (store.Gate)
            {
                language = store.Data.Settings.Language; sound = store.Data.Settings.Sound;
                preset = NotificationSounds.SelectedPreset(store.Data.Settings, GameSound.Marked); volume = store.Data.Settings.NotificationSoundVolume;
            }
            // Copy and PCM playback use the same snapshot, even during a settings change.
            var customName = customSounds.Snapshot().GetValueOrDefault("marked")?.Name;
            return Notify(UiText.NotificationTestTitle(language), UiText.DesktopTest(language, preset, volume, sound, customName), sound, preset, volume);
        }
        var openItem = menu.Items.Add(UiText.OpenDashboard(Language()), null, (_, _) => Open());
        var testItem = menu.Items.Add(UiText.TestNotification(Language()), null, (_, _) => background.TryRun(async _ => { await TestNotification(); }));
        var exitItem = menu.Items.Add(UiText.Exit(Language()), null, (_, _) => ExitThread());
        string HideLabel() => Language() == "ru" ? "Скрыть панель · продолжить наблюдение" : "Hide dashboard · keep watching";
        var hideItem = menu.Items.Add(HideLabel(), null, (_, _) => dashboard?.Hide());
        // Opening is raised on the Windows UI thread; API requests only mutate the store.
        menu.Opening += (_, _) =>
        {
            var language = Language();
            openItem.Text = UiText.OpenDashboard(language);
            testItem.Text = UiText.TestNotification(language);
            exitItem.Text = UiText.Exit(language);
            hideItem.Text = HideLabel();
            hideItem.Enabled = !exiting && dashboard is { Visible: true };
        };
        using (var icon = AppBranding.LoadIcon()) tray = new DesktopTrayIcon(icon, menu, AppBranding.Name);
        tray.OpenRequested += (_, _) => Open();
        var lobby = new LobbyService(store, (title, message, sound) =>
        {
            var language = Language();
            bool markedPlayer = title == "Direct Strike · marked player";
            bool acceptNeeded = title == "Direct Strike · accept needed";
            _ = Notify(acceptNeeded ? UiText.AcceptNeededTitle(language) : markedPlayer ? UiText.MarkedPlayerTitle(language) : title,
                acceptNeeded ? UiText.AcceptNeededMessage(language) : markedPlayer ? UiText.MarkedPlayerMessage(language, message) : message, sound);
        }, PlayGameSound, (names, region) => { lobbyRatings.Observe(names, region); liveUpdates.Pulse(); });
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory, WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot") });
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls(url);
        builder.Services.ConfigureHttpJsonOptions(o => { o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase; });
        web = builder.Build();
        web.MapGet("/api/software-updates/status", () => releaseUpdater.Snapshot());
        web.MapPost("/api/software-updates/check", async () => await releaseUpdater.CheckAsync(shutdown.Token));
        web.MapPost("/api/software-updates/access", async (SoftwareUpdateAccess request) =>
        {
            await releaseUpdater.ConnectAsync(request.Token, shutdown.Token);
            return await releaseUpdater.CheckAsync(shutdown.Token);
        });
        web.MapDelete("/api/software-updates/access", async () =>
        {
            await releaseUpdater.DisconnectAsync(shutdown.Token); return releaseUpdater.Snapshot();
        });
        web.MapPost("/api/software-updates/install", async (SoftwareUpdateInstall request) =>
        {
            await releaseUpdater.PrepareInstallAsync(request.Version, shutdown.Token);
            dispatch.BeginInvoke(new Action(ExitThreadCore));
            return Results.Ok(new { restarting = true });
        });
        web.Use(async (context, next) =>
        {
            if (shutdown.IsCancellationRequested) { context.Response.StatusCode = 503; return; }
            if (context.Request.Host.Host != "127.0.0.1" || context.Request.Host.Port != port) { context.Response.StatusCode = 403; return; }
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.Length > 0 && origin != url) { context.Response.StatusCode = 403; return; }
            if (context.Request.Path.StartsWithSegments("/api") && context.Request.Headers["X-DS-Companion"] != "1") { context.Response.StatusCode = 403; return; }
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'";
            context.Response.Headers["Cache-Control"] = "no-store";
            try { await next(); }
            catch (Exception ex) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = ex.Message }); }
        });
        // Bundled assets are authoritative, including when upgrading an older
        // distribution that still contains loose dashboard files.
        web.MapGet("/api/state", (HttpRequest request) =>
        {
            var importProgress = replay.Snapshot();
            var snapshot = store.Snapshot(request.Query["libraryVersion"].ToString(), importProgress.Busy ? TimeSpan.FromSeconds(15) : TimeSpan.Zero);
            LobbyPreferencesRequest lobbyPreferences;
            lock (store.Gate) lobbyPreferences = LobbyPreferencesRequest.FromSettings(store.Data.Settings);
            return new { library = snapshot.Library, libraryVersion = snapshot.Version, replayStatus = replay.Status, busy = importProgress.Busy, importProgress, lobby = lobby.Snapshot(), lobbyPreferences, softwareUpdate = releaseUpdater.Snapshot(), siteSync = siteSync.Snapshot(), dataPath = store.DirectoryPath };
        });
        web.MapGet("/api/replay-impact/{hash}", (string hash) => store.ImpactDetails(hash) is { } detail ? Results.Ok(detail) : Results.NotFound());
        web.MapPost("/api/lobby/watch", () => { lobby.Watch(); return Results.Ok(lobby.Snapshot()); });
        web.MapGet("/api/live-state", () =>
        {
            // Publish site/lobby changes without rebuilding or transferring thousands of replays.
            JsonElement site;
            LobbyPreferencesRequest preferences;
            lock (store.Gate)
            {
                site = JsonSerializer.SerializeToElement(new { siteLookups = store.Data.SiteLookups,
                    ratings = store.Data.RegionalRatings, siteHistories = store.Data.SiteHistories,
                    siteGames = store.Data.SiteGames, dsstatsLookups = store.Data.DsstatsLookups }, Store.Json);
                preferences = LobbyPreferencesRequest.FromSettings(store.Data.Settings);
            }
            return new { site, lobby = lobby.Snapshot(), lobbyRatings = lobbyRatings.Snapshot(), lobbyPreferences = preferences, notificationAudio = notificationSounds.Snapshot(), softwareUpdate = releaseUpdater.Snapshot() };
        });
        web.MapGet("/api/updates", async (HttpContext context) =>
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers["X-Accel-Buffering"] = "no";
            using var cancel = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, shutdown.Token);
            long version = -1;
            try
            {
                while (!cancel.IsCancellationRequested)
                {
                    version = await liveUpdates.WaitAfterAsync(version, cancel.Token);
                    await context.Response.WriteAsync("data: update\n\n", cancel.Token);
                    await context.Response.Body.FlushAsync(cancel.Token);
                }
            }
            catch (OperationCanceledException) when (cancel.IsCancellationRequested) { }
        });
        web.MapPost("/api/lobby/sounds", (SoundSettingsRequest request) =>
        {
            lock (store.Gate)
            {
                store.Data.Settings.PingOnGameLoading = request.Loading;
                store.Data.Settings.PingOnGameLoaded = request.Loaded;
                store.Save();
                return Results.Ok(new { loading = store.Data.Settings.PingOnGameLoading, loaded = store.Data.Settings.PingOnGameLoaded });
            }
        });
        web.MapPost("/api/lobby/preferences", (LobbyPreferencesRequest request) => Results.Ok(request.Apply(store)));
        web.MapPost("/api/sounds/preview", (SoundPreviewRequest request) =>
        {
            var cue = request.Validate();
            notificationSounds.Play(cue, request.Preset, request.Volume, preview: true, builtIn: request.BuiltIn);
            return Results.Ok(request);
        });
        web.MapGet("/api/sounds/custom", () => Results.Ok(customSounds.Snapshot()));
        web.MapPost("/api/sounds/custom/{cue}", async (string cue, HttpRequest request) =>
        {
            CustomNotificationSounds.ValidateCue(cue);
            string name = request.Query["name"].ToString();
            CustomNotificationSounds.ValidateName(name);
            var bytes = await CustomNotificationSounds.ReadUpload(request);
            return Results.Ok(customSounds.Assign(cue, name, bytes));
        });
        web.MapDelete("/api/sounds/custom/{cue}", (string cue) => Results.Ok(customSounds.Remove(cue)));
        web.MapPost("/api/rating/sync", (SiteSyncRequest request) =>
        {
            if (request.Ids is null || request.Names is null) throw new ArgumentException("Provide profile IDs and names.");
            if (request.Ids.Count > 40 || request.Names.Count > 12) throw new ArgumentException("Too many profiles in one refresh.");
            siteSync.Queue(request.Ids, request.Names, request.Region);
            dsstats.Queue(request.Ids, request.Names, request.Region);
            return Results.Ok(siteSync.Snapshot());
        });
        web.MapPost("/api/rating/site-profile", (SiteProfileRequest request) =>
        {
            siteSync.QueueProfile(request.ProfileId, request.Region);
            return Results.Ok(siteSync.Snapshot());
        });
        web.MapPost("/api/import", (ImportRequest request) => background.TryRun(token => replay.ImportAsync(request.Retry, ct: token))
            ? Results.Ok(new { message = "Replay scan started" }) : Results.StatusCode(503));
        web.MapPost("/api/import/pause", () => { replay.Pause(); return Results.Ok(replay.Snapshot()); });
        web.MapPost("/api/settings", (Settings settings) =>
        {
            Sc2Automation.ValidateSettings(settings);
            NotificationSounds.Validate(settings.NotificationSoundPreset, settings.NotificationSoundVolume);
            NotificationSounds.ValidateStyles(settings.NotificationSoundStyles);
            Store.ValidateLanguage(settings.Language);
            Store.ValidateListAlerts(settings);
            Store.ValidateSortPreferences(settings);
            if (settings.ReplayFolders.Count > 20 || settings.SelfIds.Count > 20) throw new ArgumentException("Too many folders or accounts.");
            foreach (var path in settings.ReplayFolders) if (!Path.IsPathFullyQualified(path) || !Directory.Exists(path)) throw new ArgumentException("Replay folders must be existing absolute paths.");
            foreach (var id in settings.SelfIds) if (!System.Text.RegularExpressions.Regex.IsMatch(id, @"^\d-S2-\d-\d+$")) throw new ArgumentException("Use account IDs such as 2-S2-1-7408040.");
            lock (store.Gate)
            {
                NotificationSounds.PreservePreferences(store.Data.Settings, settings);
                GraphicalStyles.PreservePreference(store.Data.Settings, settings);
                store.Data.Settings = settings;
                Volatile.Write(ref desktopLanguage, settings.Language);
            }
            store.RefreshOwnAccounts();
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/language", (LanguageRequest request) =>
        {
            store.SetLanguage(request.Language);
            lock (store.Gate) Volatile.Write(ref desktopLanguage, store.Data.Settings.Language);
            return Results.Ok(new { language = request.Language });
        });
        web.MapPost("/api/appearance", (GraphicalStyleRequest request) =>
        {
            var result = request.Apply(store);
            RefreshDashboardTheme();
            return Results.Ok(result);
        });
        web.MapPost("/api/player-nicknames", (PlayerNicknamesRequest request) =>
        {
            store.SetPlayerNicknames(request.Id, request.Nicknames, request.Append);
            lobby.RefreshNicknameLinks();
            return Results.Ok();
        });
        web.MapPost("/api/mark", (MarkRequest request) =>
        {
            store.SetMark(request.Id, request.Name, request.Note, request.Remove, request.List);
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/list-alerts", (ListAlertRequest request) =>
        {
            store.SetListAlert(request.List, request.Enabled);
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/sort", (SortRequest request) =>
        {
            store.SetSortPreference(request.Scope, request.Key, request.Direction);
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/check", (RosterRequest request) =>
        {
            if (request.Text.Length > 4000) throw new ArgumentException("Roster text is too long.");
            return lobby.Check(request.Text, "Manual lobby check", true);
        });
        web.MapPost("/api/mark/list", (QuickListRequest request) => Results.Ok(store.SetPlayerList(request.Id, request.Name, request.List)));
        web.MapPost("/api/notify", async () => await TestNotification()
            ? (IResult)Results.Ok(new { accepted = true })
            : Results.BadRequest(new { error = UiText.NotificationUnavailable(Language()) }));
        web.MapGet("/api/desktop/status", () => Volatile.Read(ref dashboard)?.Status);
        web.MapPost("/api/desktop/open", async () => await DesktopNotificationDispatch.InvokeAsync(shutdown.Token, action => dispatch.BeginInvoke(action), () => { Open(); return true; })
            ? (IResult)Results.Ok(new { opened = true }) : Results.BadRequest(new { error = "The app is closing." }));
        web.MapPost("/api/rating/search", async (PlayerRequest request) =>
        {
            // Public name searches also support first-run account setup before any replay is imported.
            var name = string.IsNullOrWhiteSpace(request.Name) ? PlayerName(store, request.Id) : request.Name;
            var candidates = await rating.SearchAsync(name);
            if (string.IsNullOrWhiteSpace(request.Region)) return candidates;
            var region = RatingService.NormalizeRegion(request.Region) ?? throw new ArgumentException("Choose EU or Americas.");
            return candidates.Where(c => RatingService.NormalizeRegion(c.Region) == region).ToList();
        });
        web.MapPost("/api/rating/link", async (LinkRequest request) =>
        {
            var region = RatingService.NormalizeRegion(request.Region) ?? throw new ArgumentException("Choose EU or Americas.");
            var defaultName = PlayerName(store, request.Id);
            var name = string.IsNullOrWhiteSpace(request.Name) ? defaultName : request.Name;
            var candidates = await rating.SearchAsync(name);
            var selected = candidates.FirstOrDefault(c => c.ProfileId == request.ProfileId) ?? throw new ArgumentException("Select a profile from the search results.");
            if (RatingService.NormalizeRegion(selected.Region) != region) throw new ArgumentException("This profile belongs to a different region. Choose a profile in " + region + ".");
            var commanderRating = await rating.CommanderRatingAsync(selected.ProfileId);
            store.SetRegionRating(request.Id, region, new(request.Id, commanderRating, commanderRating == null ? "No 3v3 Commanders rating found" : "Linked profile", selected.Url + "/ratings", DateTime.UtcNow, selected.ProfileId, Region: region, ProfileName: selected.Name));
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/rating/refresh", async (PlayerRequest request) =>
        {
            var region = RatingService.NormalizeRegion(request.Region) ?? throw new ArgumentException("Choose EU or Americas.");
            var pair = store.GetRegionRatings(request.Id);
            var linked = region == "EU" ? pair.Eu : pair.Americas;
            if (linked == null) throw new ArgumentException("Link the correct ds-rating.com profile first.");
            var commanderRating = await rating.CommanderRatingAsync(linked.ProfileId, refresh: true);
            store.RefreshRegionRating(request.Id, region, linked.ProfileId, commanderRating);
            store.Save(); return Results.Ok();
        });
        web.MapPost("/api/rating/unlink", (PlayerRequest request) =>
        {
            var region = RatingService.NormalizeRegion(request.Region) ?? throw new ArgumentException("Choose EU or Americas.");
            store.ClearRegionRating(request.Id, region); store.Save(); return Results.Ok();
        });
        web.MapGet("/{**asset}", (string? asset) => EmbeddedAssets.Serve(asset));
        web.StartAsync().GetAwaiter().GetResult();
        File.WriteAllText(Path.Combine(store.DirectoryPath, "running-url.txt"), url);
        background.TryRun(lobby.Poll);
        background.TryRun(token => releaseUpdater.MonitorAsync(token));
        background.TryRun(siteSync.RunAsync);
        background.TryRun(dsstats.RunAsync);
        background.TryRun(lobbyRatings.RunAsync);
        QueueRecentRatings();
        if (!args.Contains("--no-import")) background.TryRun(token => replay.ImportAsync(false, ct: token, automatic: true));
        background.TryRun(async token =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(45));
            try { while (await timer.WaitForNextTickAsync(token)) { await replay.ImportAsync(false, ct: token, automatic: true); QueueRecentRatings(); } } catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        });
        if (!args.Contains("--no-browser")) Open();
    }
    private static string PlayerName(Store store, string id)
    {
        lock (store.Gate) return store.Data.Matches.OrderByDescending(m => m.Time).SelectMany(m => m.Players).FirstOrDefault(p => p.Id == id)?.Name ?? store.Data.OwnLocalNames.Where(p => p.Id == id).OrderByDescending(p => p.ObservedAt).FirstOrDefault()?.Name ?? store.Data.Marks.GetValueOrDefault(id)?.Name ?? (store.Data.Settings.SelfIds.Contains(id) ? "" : throw new ArgumentException("Player was not found."));
    }
    private void RefreshDashboardTheme()
    {
        if (shutdown.IsCancellationRequested || dispatch.IsDisposed) return;
        try
        {
            dispatch.BeginInvoke((Action)(() =>
            {
                if (shutdown.IsCancellationRequested || dashboard is null || dashboard.IsDisposed) return;
                string style;
                // Read on dispatch so overlapping requests cannot apply an older queued value.
                lock (store.Gate) style = store.Data.Settings.GraphicalStyle;
                dashboard.SetGraphicalStyle(style);
            }));
        }
        catch (InvalidOperationException) { /* Shutdown may dispose dispatch after the initial check. */ }
    }

    private void Open()
    {
        if (shutdown.IsCancellationRequested || dispatch.IsDisposed) return;
        if (dispatch.InvokeRequired) { dispatch.BeginInvoke(Open); return; }
        if (dashboard == null || dashboard.IsDisposed)
        {
            string language;
            language = Volatile.Read(ref desktopLanguage);
            string style;
            lock (store.Gate) style = store.Data.Settings.GraphicalStyle;
            var window = new DashboardWindow(url, language, graphicalStyle: style);
            Volatile.Write(ref dashboard, window);
            window.CloseRequested += (_, _) => ExitThread();
            window.FormClosed += (_, _) =>
            {
                if (ReferenceEquals(dashboard, window)) Volatile.Write(ref dashboard, null);
                // X exits the companion. Explicit Hide keeps monitoring in tray.
                if (!exiting) ExitThread();
            };
        }
        dashboard.Show();
        if (dashboard.WindowState == FormWindowState.Minimized) dashboard.WindowState = FormWindowState.Normal;
        dashboard.Activate();
    }
    private Task<bool> Notify(string title, string message, bool sound, string? preset = null, int? volume = null)
    {
        if (dispatch.IsDisposed || shutdown.IsCancellationRequested) return Task.FromResult(false);
        lock (store.Gate)
        {
            preset ??= NotificationSounds.SelectedPreset(store.Data.Settings, GameSound.Marked);
            volume ??= store.Data.Settings.NotificationSoundVolume;
        }
        return DesktopNotificationDispatch.InvokeAsync(shutdown.Token, action => dispatch.BeginInvoke(action), () =>
        {
            bool accepted = tray.ShowNotification(title, message);
            if (sound) notificationSounds.Play(GameSound.Marked, preset, volume.Value);
            return accepted;
        });
    }
    private void PlayGameSound(GameSound sound)
    {
        if (dispatch.IsDisposed) return;
        string preset;
        int volume;
        lock (store.Gate) { preset = NotificationSounds.SelectedPreset(store.Data.Settings, sound); volume = store.Data.Settings.NotificationSoundVolume; }
        notificationSounds.Play(sound, preset, volume);
    }
    protected override void ExitThreadCore()
    {
        if (exiting) return;
        exiting = true;
        dashboard?.Hide();
        _ = ExitAsync();
    }
    private async Task ExitAsync()
    {
        // Start cancellation immediately, then keep the UI message pump alive
        // while OCR/decoder children and HTTP operations finish off the UI thread.
        // Unwind the tray menu's click/dismissal before removing its native owner.
        await Task.Yield();
        var drain = background.StopAsync(TimeSpan.FromSeconds(5));
        try
        {
            tray.Dispose();
            var stopServer = Task.Run(StopServerAsync);
            dashboard?.Dispose();
            Volatile.Write(ref dashboard, null);
            notificationSounds.Dispose();
            if (!await drain) Trace.WriteLine("Shutdown background deadline reached; completed replay journal records remain durable.");
            await stopServer;
        }
        catch (Exception ex) { Trace.WriteLine("Companion shutdown: " + ex); }
        finally
        {
            dispatch.Dispose();
            base.ExitThreadCore();
        }
    }
    private async Task StopServerAsync()
    {
        try { await web.StopAsync(TimeSpan.FromSeconds(3)).WaitAsync(TimeSpan.FromSeconds(4)).ConfigureAwait(false); }
        catch (Exception ex) { Trace.WriteLine("HTTP shutdown: " + ex.Message); }
        try { await web.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false); }
        catch (Exception ex) { Trace.WriteLine("HTTP disposal: " + ex.Message); }
    }
}

// Admission and shutdown share one gate so a queued import cannot start after
// the drain snapshot. Work always runs on the pool, and its failures are observed.
internal sealed class CompanionBackgroundTasks(CancellationTokenSource cancellation)
{
    private readonly object gate = new();
    private readonly List<Task> tasks = [];
    private Task<bool>? stopping;
    internal bool TryRun(Func<CancellationToken, Task> work)
    {
        lock (gate)
        {
            if (stopping != null || cancellation.IsCancellationRequested) return false;
            tasks.RemoveAll(t => t.IsCompleted);
            tasks.Add(Task.Run(async () =>
            {
                try { cancellation.Token.ThrowIfCancellationRequested(); await work(cancellation.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
                catch (Exception ex) { Trace.WriteLine("Companion background operation: " + ex); }
            }));
            return true;
        }
    }
    internal Task<bool> StopAsync(TimeSpan timeout)
    {
        lock (gate) return stopping ??= DrainAsync(tasks.ToArray(), timeout);
    }
    private async Task<bool> DrainAsync(Task[] active, TimeSpan timeout)
    {
        // CancelAsync marks the token now and runs potentially slow callbacks
        // asynchronously; admission has already closed under the shared gate.
        var cancelled = cancellation.CancelAsync();
        var stop = Task.Run(async () =>
        {
            await cancelled.ConfigureAwait(false);
            await Task.WhenAll(active).ConfigureAwait(false);
        });
        try { await stop.WaitAsync(timeout).ConfigureAwait(false); return true; }
        catch (TimeoutException)
        {
            // Keep observing a late failure without blocking the UI/app lifetime.
            _ = stop.ContinueWith(t => Trace.WriteLine(t.Exception), CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
            return false;
        }
    }
}
public sealed record ImportRequest(bool Retry = false);
public sealed record MarkRequest(string Id, string Name, string Note = "", bool Remove = false, string? List = null);
public sealed record ListAlertRequest(string List, bool Enabled);
public sealed record SortRequest(string Scope, string Key, string Direction);
public sealed record LanguageRequest(string Language);
[System.Text.Json.Serialization.JsonUnmappedMemberHandling(System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow)]
public sealed record SoundSettingsRequest(
    [property: System.Text.Json.Serialization.JsonRequired] bool Loading,
    [property: System.Text.Json.Serialization.JsonRequired] bool Loaded);
public sealed record RosterRequest(string Text);
public sealed record SiteSyncRequest(List<string> Ids, List<string> Names, string? Region = null);
public sealed record QuickListRequest(string Id, string Name, string List);
[System.Text.Json.Serialization.JsonUnmappedMemberHandling(System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow)]
public sealed record SiteProfileRequest(
    [property: System.Text.Json.Serialization.JsonRequired] string ProfileId,
    [property: System.Text.Json.Serialization.JsonRequired] string Region);
public sealed record PlayerRequest(string Id, string Region = "", string Name = "");
public sealed record LinkRequest(string Id, string ProfileId, string Region = "", string Name = "");
