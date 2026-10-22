using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class SelfTests
{
    public static void Run(string[] args)
    {
        if (args.Contains("--rating-estimates-only")) { RunSoundsCommand(ratingEstimates: true); return; }
        if (args.Contains("--updates-only")) { RunSoundsCommand(updates: true); return; }
        if (args.Contains("--dashboard-only")) { RunSoundsCommand(dashboard: true); return; }
        if (args.Contains("--nicknames-only")) { RunSoundsCommand(nicknames: true); return; }
        if (args.Contains("--sounds-only")) { RunSoundsCommand(); return; }
        if (args.Contains("--accept-alerts-only")) { RunSoundsCommand(acceptAlerts: true); return; }
        if (args.Contains("--impact-only")) { RunImpactCommand(); return; }
        if (args.Contains("--reader-package-only")) { RunReaderPackageCommand(); return; }
        if (args.Contains("--dsstats-only")) { RunDsstatsCommand(); return; }
        if (args.Contains("--lobby-ratings-only")) { RunDsstatsCommand(lobby: true); return; }
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var results = new List<string>();
        void Assert(bool passed, string name) { if (!passed) throw new Exception("FAILED: " + name); results.Add("PASS: " + name); }
        try
        {
            var testDir = Path.Combine(root, Guid.NewGuid().ToString());
            var store = new Store(testDir);
            var me = new ReplayPlayer("2-S2-1-1", "Me", 1, "Terran", "Win", 0, 0, 0);
            var enemy = new ReplayPlayer("2-S2-1-2", "Enemy", 2, "Zerg", "Loss", 0, 0, 0);
            var ally = new ReplayPlayer("2-S2-1-3", "Ally", 1, "Protoss", "Win", 0, 0, 0);
            Match Game(string hash, int winner) => new(hash, "fixture", "Direct Strike", "Commanders", DateTime.UtcNow, 600, winner, [me, enemy, ally, me with {Id="2-S2-1-4"}, enemy with {Id="2-S2-1-5"}, enemy with {Id="2-S2-1-6"}]);
            Assert(Store.IsEligible(Game("scope", 1)), "3v3 commanders included");
            Assert(!Store.IsEligible(Game("scope", 1) with { Mode="Standard" }), "standard games excluded");
            Assert(!Store.IsEligible(Game("scope", 1) with { Mode="BrawlCommanders" }), "brawl commanders excluded");
            Assert(!Store.IsEligible(Game("scope", 1) with { Players=[me,enemy] }), "1v1 commanders excluded");
            Assert(Store.Outcome(Game("a", 1), me) == true, "winner team determines win");
            Assert(Store.Outcome(Game("b", 2), me) == false, "winner team determines loss");
            Assert(Store.Outcome(Game("c", 0), me with { Result = "Undecided" }) == null, "unknown results excluded");
            store.Data.Settings.SelfIds = [me.Id];
            store.Data.Matches = [Game("a", 1), Game("b", 2), Game("c", 0) with { Players = [me with { Result = "Undecided" }, enemy, ally, me with {Id="2-S2-1-4"}, enemy with {Id="2-S2-1-5"}, enemy with {Id="2-S2-1-6"}] }, Game("excluded",1) with {Mode="Standard"}];
            using var summary = JsonDocument.Parse(JsonSerializer.Serialize(store.Summary(), Store.Json));
            Assert(summary.RootElement.GetProperty("winRate").GetDouble() == 50, "overall win rate excludes undecided games");
            var opponent = summary.RootElement.GetProperty("players").EnumerateArray().First(p => p.GetProperty("id").GetString() == enemy.Id);
            Assert(opponent.GetProperty("against").GetProperty("games").GetInt32() == 3 && opponent.GetProperty("against").GetProperty("wins").GetInt32() == 1, "opponent statistics preserve unknown sample count");
            var teammate = summary.RootElement.GetProperty("players").EnumerateArray().First(p => p.GetProperty("id").GetString() == ally.Id);
            Assert(teammate.GetProperty("against").GetProperty("games").GetInt32() == 0 && teammate.GetProperty("together").GetProperty("games").GetInt32() == 3, "teammates and opponents separated");
            store.Data.Marks[enemy.Id] = new(enemy.Id, "Enemy", "private note", DateTime.UtcNow);
            int notices = 0;
            var lobby = new LobbyService(store, (_, _, _) => notices++);
            Assert(lobby.Check("EnemyLong", "test").Count == 0, "substring names do not alert");
            Assert(lobby.Check("[Clan] Enemy\nAlly", "test").Count == 1, "exact marked name alerts");
            lobby.Check("Enemy", "test");
            Assert(notices == 1, "same roster does not repeatedly ping");
            store.Save(); var restored = new Store(testDir);
            Assert(restored.Data.Marks[enemy.Id].Note == "private note", "marks survive restart");
            LobbyRosterTests.Run(Assert);
            GameSoundTests.Run(Assert);
            NotificationSoundTests.Run(Assert);
            CustomNotificationSoundTests.Run(Assert);
            Sc2SoundClipTests.Run(Assert);
            ShutdownTests.Run(Assert);
            Sc2WindowCaptureTests.Run(Assert);
            NativeNotificationTests.Run(Assert);
            DesktopTrayIconTests.Run(Assert);
            DashboardWindowTests.Run(Assert);
            GraphicalStyleTests.Run(Assert);
            InstallationPathsTests.Run(Assert);
            Sc2AutomationTests.Run(Assert);
            Sc2TextProofTests.Run(Assert);
            Sc2ScreenshotTests.Run(Assert);
            ReplayRecoveryTests.Run(Assert);
            ReplayDecodeWorkerTests.Run(Assert);
            LobbyOcrWorkerTests.Run(Assert);
            var compatibleScript = Path.Combine(testDir, "compatible-ocr.ps1");
            var unicodeScript = "$name='Ваня'; $pattern='[а-яё]'";
            File.WriteAllText(compatibleScript, unicodeScript, new System.Text.UTF8Encoding(false));
            EmbeddedAssets.WriteOcrScript(compatibleScript, unicodeScript);
            Assert(File.ReadAllBytes(compatibleScript).AsSpan(0, 3).SequenceEqual(new byte[] { 0xEF, 0xBB, 0xBF })
                && File.ReadAllText(compatibleScript) == unicodeScript, "runtime OCR extraction repairs BOM-less Unicode scripts for Windows PowerShell");
            PlayerListTests.Run(Assert);
            MatchEconomyTests.Run(Assert);
            SortingTests.Run(Assert);
            RatingChangesTests.Run(Assert);
            SiteSyncTests.Run(Assert);
            LiveLobbyRatingsTests.Run(Assert);
            DsstatsTests.Run(Assert);
            LiveUpdateTests.Run(Assert);
            SiteHistoryTests.Run(Assert);
            CombatStatsTests.Run(Assert);
            ClanTagTests.Run(Assert);
            SummaryPerformanceTests.Run(Assert);
            OwnAccountTests.Run(Assert);
            Assert(OwnNicknames.ParseName("EuNick_775@2.lnk", "2-S2-1-99") == "EuNick" && OwnNicknames.ParseName("America_Nick_648@1.lnk", "1-S2-1-44") == "America_Nick", "regional nickname parsing accepts different names and underscores");
            Assert(OwnNicknames.ParseName("EuNick_775@2.lnk", "1-S2-1-44") == null && OwnNicknames.ParseName("NotASc2Shortcut.lnk", "2-S2-1-99") == null, "nickname shortcuts must match regional handle and SC2 format");
            Assert(EmbeddedAssets.HasAsset("index.html") && EmbeddedAssets.HasAsset("images/commanders/tychus.png"), "dashboard and portraits embedded for standalone executable");
            var upgradeStore = new Store(Path.Combine(root, Guid.NewGuid().ToString()));
            var legacyGame = Game("legacy-combat", 1);
            upgradeStore.Data.Matches.Add(legacyGame);
            upgradeStore.Data.Marks[me.Id] = new(me.Id, me.Name, "keep this note", DateTime.UtcNow);
            var enrichedGame = legacyGame with { Hash = "duplicate-payload", Winner = 2, StatsVersion = CombatStatsExtractor.CurrentVersion, Players = legacyGame.Players.Select(p => p with { Combat = new(new() { ["UnitKills"] = 12, ["DamageDealt"] = null }) }).ToList() };
            Assert(upgradeStore.ImportMatch(enrichedGame) == ReplayImportResult.Refreshed && upgradeStore.Data.Matches.Count == 1 && upgradeStore.Data.Matches[0].Winner == 1, "combat enrichment keeps semantic duplicate as one match and preserves outcome");
            Assert(upgradeStore.ImportMatch(enrichedGame) == ReplayImportResult.Duplicate && upgradeStore.Data.Marks[me.Id].Note == "keep this note", "repeated combat enrichment preserves notes and game count");
            upgradeStore.Save();
            var upgradeRestore = new Store(upgradeStore.DirectoryPath);
            Assert(upgradeRestore.Data.Matches[0].Players[0].Combat?.Values["UnitKills"] == 12 && upgradeRestore.Data.Matches[0].Players[0].Combat?.Values["DamageDealt"] == null, "combat values and unavailable damage survive persistence");
            Assert(new Store(testDir).Data.Matches.Any(m => m.StatsVersion == 0 && m.Players.All(p => p.Combat == null)), "legacy replay records stay readable before backfill");
            Assert(RatingService.NormalizeRegion("eu") == "EU" && RatingService.NormalizeRegion("na") == "Americas" && RatingService.NormalizeRegion("us") == "Americas", "provider regions map to separate EU and Americas slots");
            Assert(RatingService.NormalizeRegion("kr") == null, "unsupported region is not mistaken for Americas");
            var eu = new Rating(enemy.Id, 2000, "Linked profile", "https://ds-rating.com/player/1/ratings", DateTime.UtcNow, "1", Region: "EU", ProfileName: "EnemyEU");
            var america = new Rating(enemy.Id, 3100, "Linked profile", "https://ds-rating.com/player/2/ratings", DateTime.UtcNow, "2", Region: "Americas", ProfileName: "EnemyNA");
            store.SetRegionRating(enemy.Id, "EU", eu);
            store.SetRegionRating(enemy.Id, "Americas", america);
            store.SetRegionRating(enemy.Id, "EU", eu with { Value = 2200 });
            Assert(store.GetRegionRatings(enemy.Id).Eu?.Value == 2200 && store.GetRegionRatings(enemy.Id).Americas?.Value == 3100, "updating EU preserves the Americas rating");
            bool rejected = false;
            try { store.SetRegionRating(enemy.Id, "EU", america); } catch (ArgumentException) { rejected = true; }
            Assert(rejected && store.GetRegionRatings(enemy.Id).Eu?.ProfileId == "1", "wrong-region linking cannot replace a regional rating");
            store.SetRegionRating(enemy.Id, "EU", eu with { ProfileId = "9", Value = 2500 });
            rejected = false;
            try { store.RefreshRegionRating(enemy.Id, "EU", "1", 9999); } catch (InvalidOperationException) { rejected = true; }
            Assert(rejected && store.GetRegionRatings(enemy.Id).Eu?.Value == 2500, "late refresh cannot restore a replaced profile");
            store.SetRegionRating(enemy.Id, "EU", eu);
            store.ClearRegionRating(enemy.Id, "EU");
            Assert(store.GetRegionRatings(enemy.Id).Eu == null && store.GetRegionRatings(enemy.Id).Americas?.Value == 3100, "unlinking EU preserves the Americas account");
            store.SetRegionRating(enemy.Id, "EU", eu);
            store.Save();
            var regionalRestore = new Store(testDir);
            Assert(regionalRestore.GetRegionRatings(enemy.Id).Eu?.ProfileName == "EnemyEU" && regionalRestore.GetRegionRatings(enemy.Id).Americas?.ProfileName == "EnemyNA", "both regional identities survive restart");
            var legacyDir = Path.Combine(root, Guid.NewGuid().ToString());
            Directory.CreateDirectory(legacyDir);
            store.Data.Ratings[enemy.Id] = eu with { Region = "" };
            var legacy = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(store.Data, Store.Json))!.AsObject();
            legacy.Remove("regionalRatings");
            File.WriteAllText(Path.Combine(legacyDir, "library.json"), legacy.ToJsonString(Store.Json));
            var legacyStore = new Store(legacyDir);
            Assert(legacyStore.Data.Ratings[enemy.Id].Value == 2000 && legacyStore.GetRegionRatings(enemy.Id).Eu == null && legacyStore.Data.Marks[enemy.Id].Note == "private note", "older library and marks preserved without guessing a regional identity");
            LanguageTests(store, root, Assert);
            if (args.Contains("--network-test"))
            {
                var rating = new RatingService();
                var value = rating.CommanderRatingAsync("358976").GetAwaiter().GetResult();
                Assert(value is > 0, "public profile 3v3 commander rating row parses");
                results.Add("Public 3v3 Commanders rating read: " + value);
            }
            var embeddedUi = new Dictionary<string, string>();
            var assembly = typeof(Program).Assembly;
            foreach (var resource in assembly.GetManifestResourceNames().Where(name => name.StartsWith("DscAsset:", StringComparison.Ordinal)
                && (name.EndsWith(".js", StringComparison.Ordinal) || name.EndsWith(".css", StringComparison.Ordinal))))
            {
                using var asset = assembly.GetManifestResourceStream(resource)!;
                var path = resource["DscAsset:".Length..].Replace('\\', '/')["wwwroot/".Length..];
                embeddedUi[path] = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(asset));
            }
            File.WriteAllText(Path.Combine(root, "embedded-ui-assets.json"), JsonSerializer.Serialize(embeddedUi, Store.Json));
            RunReaderPackage(root, Assert);
            File.WriteAllText(Path.Combine(root, "results.json"), JsonSerializer.Serialize(new { success = true, results }, Store.Json));
        }
        catch (Exception ex) { File.WriteAllText(Path.Combine(root, "results.json"), JsonSerializer.Serialize(new { success = false, error = ex.ToString(), results }, Store.Json)); Environment.ExitCode = 1; }
    }
    private static void RunSoundsCommand(bool acceptAlerts = false, bool updates = false, bool ratingEstimates = false, bool dashboard = false, bool nicknames = false)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var checks = new List<string>();
        try
        {
            void Check(bool passed, string name) { if (!passed) throw new InvalidDataException(name); checks.Add(name); }
            GameSoundTests.Run(Check);
            if (updates) ReleaseUpdaterTests.Run(Check);
            if (dashboard) { DashboardWindowTests.Run(Check); GraphicalStyleTests.Run(Check); }
            if (nicknames) { PlayerNicknamesTests.Run(Check); LobbyRosterTests.Run(Check); SiteSyncTests.Run(Check); DsstatsTests.Run(Check); LiveLobbyRatingsTests.Run(Check); }
            if (ratingEstimates) { RatingChangesTests.Run(Check); SiteSyncTests.Run(Check); }
            if (acceptAlerts) { Sc2AutomationTests.Run(Check); Sc2TextProofTests.Run(Check); }
            NotificationSoundTests.Run(Check);
            CustomNotificationSoundTests.Run(Check);
            Sc2SoundClipTests.Run(Check);
            var assets = typeof(EmbeddedAssets).Assembly.GetManifestResourceNames()
                .Where(name => name.StartsWith("DscAsset:wwwroot", StringComparison.Ordinal)
                    || name.StartsWith("DscSound:", StringComparison.Ordinal) || name == "DscSoundCatalog")
                .ToDictionary(name => name.StartsWith("DscAsset:", StringComparison.Ordinal)
                    ? name["DscAsset:".Length..].Replace('\\', '/')["wwwroot/".Length..] : name, name =>
                {
                    using var stream = typeof(EmbeddedAssets).Assembly.GetManifestResourceStream(name)!;
                    return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream));
                });
            File.WriteAllText(Path.Combine(root, "sound-tests.json"), JsonSerializer.Serialize(new { success = true, checks, assets }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, "sound-tests.json"), JsonSerializer.Serialize(new { success = false, error = error.ToString(), checks }, Store.Json));
            Environment.ExitCode = 1;
        }
    }
    private static void RunImpactCommand()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var checks = new List<string>();
        try
        {
            void Check(bool passed, string name) { if (!passed) throw new InvalidDataException(name); checks.Add(name); }
            CombatStatsTests.Run(Check);
            ReplayImpactStorageTests.Run(Check);
            ReplayRecoveryTests.Run(Check);
            ReplayDecodeWorkerTests.Run(Check);
            var assets = typeof(EmbeddedAssets).Assembly.GetManifestResourceNames().Where(name => name.StartsWith("DscAsset:wwwroot", StringComparison.Ordinal))
                .ToDictionary(name => name["DscAsset:".Length..].Replace('\\', '/')["wwwroot/".Length..], name =>
                { using var stream = typeof(EmbeddedAssets).Assembly.GetManifestResourceStream(name)!;
                    return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream)); });
            File.WriteAllText(Path.Combine(root, "impact-tests.json"), JsonSerializer.Serialize(new { success = true, checks, assets }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, "impact-tests.json"), JsonSerializer.Serialize(new { success = false, error = error.ToString(), checks }, Store.Json));
            Environment.ExitCode = 1;
        }
    }
    private static void RunDsstatsCommand(bool lobby = false)
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var checks = new List<string>();
        try
        {
            DsstatsTests.Run((passed, name) => { if (!passed) throw new InvalidDataException(name); checks.Add(name); });
            if (lobby)
            {
                void Check(bool passed, string name) { if (!passed) throw new InvalidDataException(name); checks.Add(name); }
                SiteSyncTests.Run(Check);
                LiveLobbyRatingsTests.Run(Check);
                LobbyRosterTests.Run(Check);
                LiveUpdateTests.Run(Check);
            }
            var assets = typeof(EmbeddedAssets).Assembly.GetManifestResourceNames()
                .Where(name => name.StartsWith("DscAsset:wwwroot", StringComparison.Ordinal))
                .ToDictionary(name => name["DscAsset:".Length..].Replace('\\', '/')["wwwroot/".Length..], name =>
                {
                    using var stream = typeof(EmbeddedAssets).Assembly.GetManifestResourceStream(name)!;
                    return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream));
                });
            File.WriteAllText(Path.Combine(root, lobby ? "lobby-rating-tests.json" : "dsstats-tests.json"), JsonSerializer.Serialize(new { success = true, scope = lobby ? "automatic lobby rating integration" : "dsstats source integration", checkedAt = DateTime.UtcNow, checks, assets }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, lobby ? "lobby-rating-tests.json" : "dsstats-tests.json"), JsonSerializer.Serialize(new { success = false, error = error.ToString(), checks }, Store.Json));
            Environment.ExitCode = 1;
        }
    }

    private static void RunReaderPackageCommand()
    {
        var root = Path.Combine(AppContext.BaseDirectory, "test-output");
        Directory.CreateDirectory(root);
        var checks = new List<string>();
        try
        {
            RunReaderPackage(root, (passed, name) => { if (!passed) throw new InvalidDataException(name); checks.Add(name); });
            File.WriteAllText(Path.Combine(root, "reader-package-tests.json"), JsonSerializer.Serialize(new { success = true, scope = "compiled reader package", checks }, Store.Json));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, "reader-package-tests.json"), JsonSerializer.Serialize(new { success = false, error = error.ToString(), checks }, Store.Json));
            Environment.ExitCode = 1;
        }
    }

    private static void RunReaderPackage(string root, Action<bool, string> Assert)
    {
        var assembly = typeof(EmbeddedAssets).Assembly;
        using (var ocrResource = assembly.GetManifestResourceStream("DscTool:LobbyOcr.ps1"))
        {
            Assert(ocrResource is not null, "standalone executable bundles its screen reader");
            using var ocrBytes = new MemoryStream();
            ocrResource!.CopyTo(ocrBytes);
            var bytes = ocrBytes.ToArray();
            using var helperResource = assembly.GetManifestResourceStream("DscTool:DscCaptureHelper.dll");
            Assert(helperResource is not null, "standalone executable bundles its compiled capture helper");
            using var helperBytes = new MemoryStream();
            helperResource!.CopyTo(helperBytes);
            var helper = helperBytes.ToArray();
            var helperPath = Path.Combine(root, "DscCaptureHelper.dll");
            // Exercise repair of an incomplete previous extraction without
            // loading this legacy assembly into the application's CLR.
            File.WriteAllBytes(helperPath, [0, 1, 2]);
            var scriptPath = EmbeddedAssets.ExtractOcrRuntime(Path.Combine(root, "bundled-LobbyOcr.ps1"));
            var helperHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(helper));
            Assert(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(helperPath))) == helperHash,
                "runtime extraction restores the exact bundled capture helper beside the script");
            Assert(File.ReadAllBytes(scriptPath).AsSpan().SequenceEqual(bytes), "runtime extraction preserves bundled script bytes and Unicode BOM");
            var script = File.ReadAllText(scriptPath);
            Assert(!System.Text.RegularExpressions.Regex.IsMatch(script, @"(?im)^\s*Add-Type\b(?!\s+-AssemblyName\b)")
                && !script.Contains("public static class DscCapture", StringComparison.Ordinal)
                && script.Contains("[System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($helperPath))", StringComparison.Ordinal),
                "screen reader loads its compiled helper without runtime C# compilation");
            using var pe = new PEReader(new MemoryStream(helper));
            var metadata = pe.GetMetadataReader();
            var references = metadata.AssemblyReferences.Select(handle => metadata.GetAssemblyReference(handle))
                .ToDictionary(reference => metadata.GetString(reference.Name), reference => reference.Version, StringComparer.Ordinal);
            Assert(metadata.MetadataVersion.StartsWith("v4.0.30319", StringComparison.Ordinal)
                && references.TryGetValue("mscorlib", out var coreVersion) && coreVersion.Major == 4
                && references.TryGetValue("System.Drawing", out var drawingVersion) && drawingVersion.Major == 4
                && !references.ContainsKey("System.Private.CoreLib") && !references.ContainsKey("System.Drawing.Common"),
                "capture helper targets the legacy CLR and framework drawing references required by Windows PowerShell");
            Assert(metadata.TypeDefinitions.Any(handle => metadata.GetString(metadata.GetTypeDefinition(handle).Name) == "DscCapture"),
                "compiled helper exposes the existing DscCapture API");
            File.WriteAllText(Path.Combine(root, "embedded-ocr.json"), JsonSerializer.Serialize(new
            {
                resource = "DscTool:LobbyOcr.ps1",
                sha256 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)),
                helperResource = "DscTool:DscCaptureHelper.dll",
                helperSha256 = helperHash,
                helperMetadataVersion = metadata.MetadataVersion,
                helperReferences = references
            }, Store.Json));
        }
    }
    private static void LanguageTests(Store store, string root, Action<bool, string> assert)
    {
        assert(new Settings().Language == "en", "new settings default to English");
        var directory = Path.Combine(root, Guid.NewGuid().ToString());
        Directory.CreateDirectory(directory);
        var legacy = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(store.Data, Store.Json))!;
        legacy["settings"]!.AsObject().Remove("language");
        File.WriteAllText(Path.Combine(directory, "library.json"), legacy.ToJsonString(Store.Json));
        var languageStore = new Store(directory);
        assert(languageStore.Data.Settings.Language == "en" && languageStore.Data.Matches.Count == store.Data.Matches.Count && languageStore.Data.Marks.Count == store.Data.Marks.Count, "missing language migrates to English without discarding the library");
        languageStore.Data.Settings.ReplayFolders = [directory];
        languageStore.Data.Settings.Sound = false;
        languageStore.Data.Settings.ScreenWatch = true;
        languageStore.SetListAlert("friends", true);
        languageStore.SetSortPreference("players", "name", "asc");
        string WithoutLanguage(Database database)
        {
            var snapshot = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(database, Store.Json))!;
            snapshot["settings"]!.AsObject().Remove("language");
            return snapshot.ToJsonString(Store.Json);
        }
        var before = WithoutLanguage(languageStore.Data);
        languageStore.SetLanguage("ru");
        var restored = new Store(directory);
        assert(restored.Data.Settings.Language == "ru", "Russian preference is persisted and survives restart");
        assert(WithoutLanguage(restored.Data) == before, "language change preserves folders, identities, notes, alerts, sorting and all other library fields");
        var existingMatch = restored.Data.Matches.First(Store.IsEligible);
        assert(restored.ImportMatch(existingMatch) == ReplayImportResult.Duplicate && restored.Data.Settings.Language == "ru", "replay import preserves the selected language");
        var diskBefore = File.ReadAllText(Path.Combine(directory, "library.json"));
        foreach (var invalid in new string?[] { "de", "RU", "", null })
        {
            bool rejected = false;
            try { restored.SetLanguage(invalid!); } catch (ArgumentException) { rejected = true; }
            assert(rejected && restored.Data.Settings.Language == "ru" && File.ReadAllText(Path.Combine(directory, "library.json")) == diskBefore && WithoutLanguage(restored.Data) == before, "unsupported language rejected without memory or disk mutation: " + (invalid ?? "null"));
        }
        restored.SetLanguage("en");
        var switchedBack = new Store(directory);
        assert(switchedBack.Data.Settings.Language == "en" && WithoutLanguage(switchedBack.Data) == before, "switching back to English persists without unrelated changes");
        assert(UiText.OpenDashboard("ru") == "Открыть панель" && UiText.TestNotification("ru") == "Проверить уведомление" && UiText.Exit("ru") == "Выход", "Russian tray text is available");
        assert(UiText.NotificationTestTitle("ru") == "Проверка уведомления" && UiText.MarkedPlayerTitle("ru") == "Отмеченный игрок в группе", "Russian native notification titles describe the event");
        assert(UiText.OpenDashboard("en") == "Open dashboard" && UiText.NotificationTestTitle("en") == "Test notification", "English native text remains available after switchback");
        const string names = "[Clan] Игрок, Name.with.period, Уведомления работают.";
        var canonical = "Marked name detected: " + names + ". Confirm the player and team.";
        assert(UiText.MarkedPlayerMessage("ru", canonical) == names + "\nПодтвердите игрока и команду.", "native marked-player notification preserves multilingual names and punctuation verbatim");
        assert(UiText.MarkedPlayerMessage("en", canonical) == names + "\nConfirm the player and team." && UiText.MarkedPlayerMessage("ru", "private note: " + names) == "private note: " + names, "English alerts use compact copy and text outside the known wrapper stays untouched");
    }
}
