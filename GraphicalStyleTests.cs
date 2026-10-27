using System.Text.Json;
using System.Text.Json.Nodes;

namespace DirectStrikeCompanion;

internal static class GraphicalStyleTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var directory = Path.Combine(Path.GetTempPath(), "DirectStrikeGraphicalStyleTests", Guid.NewGuid().ToString("N"));
        try
        {
            var store = new Store(directory);
            assert(store.Data.Settings.GraphicalStyle == "default", "new settings use the current default graphical style");
            store.Data.Settings.Language = "ru";
            store.Data.Settings.Sound = false;
            store.Data.Settings.NotificationSoundVolume = 27;
            store.Data.Settings.AutoDetectSelf = false;
            store.Data.Settings.SelfIds = ["2-S2-1-123"];
            store.Data.Settings.ReplayFolders = [directory];
            store.Data.Settings.SortPreferences["players"] = new("name", "asc");
            store.Data.Marks["2-S2-1-456"] = new("2-S2-1-456", "Player", "Keep note", DateTime.UtcNow);
            store.Save();
            var preserved = WithoutAppearance(store.Data);
            int signals = 0;
            store.Changed += () => signals++;
            var styles = new[] { "default", "protoss", "nerazim", "alarak", "ihanrii", "terran", "nova", "mira", "machined", "tyrador", "zerg", "abathur", "dehaka", "cerberus", "mecha", "fenix", "arcade", "classic-terran", "classic-protoss", "classic-zerg" };
            foreach (var style in styles)
            {
                assert(EmbeddedAssets.HasAsset($"themes/previews/{style}.webp") &&
                    EmbeddedAssets.Serve($"themes/previews/{style}.webp") is Microsoft.AspNetCore.Http.IContentTypeHttpResult { ContentType: "image/webp" },
                    "theme interface preview is bundled and served as WebP for offline use: " + style);
                var before = store.Snapshot();
                var response = JsonSerializer.SerializeToElement(new GraphicalStyleRequest(style).Apply(store), Store.Json);
                var snapshot = store.Snapshot();
                assert(response.GetProperty("style").GetString() == style && response.EnumerateObject().Count() == 1,
                    "appearance request returns only canonical style: " + style);
                assert(snapshot.Version != before.Version && snapshot.Library!.Value.GetProperty("settings").GetProperty("graphicalStyle").GetString() == style,
                    "appearance save publishes the chosen graphical style: " + style);
                var restored = new Store(directory);
                assert(restored.Data.Settings.GraphicalStyle == style && WithoutAppearance(restored.Data) == preserved,
                    "appearance survives reload and preserves all other library data: " + style);
            }
            assert(signals == styles.Length, "successful appearance saves notify live dashboard subscribers");

            var durable = File.ReadAllText(Path.Combine(directory, "library.json"));
            var version = store.Snapshot().Version;
            foreach (string? style in new string?[] { null, "", "Terran", " terran ", "unknown", "../zerg", "Fenix", "classic-protoss ", "classic_zerg" })
            {
                bool rejected = false;
                try { new GraphicalStyleRequest(style).Apply(store); } catch (ArgumentException) { rejected = true; }
                assert(rejected && store.Data.Settings.GraphicalStyle == "classic-zerg" && store.Snapshot().Version == version
                    && File.ReadAllText(Path.Combine(directory, "library.json")) == durable && signals == styles.Length,
                    "invalid appearance request leaves memory disk and published state unchanged: " + (style ?? "null"));
            }

            var stale = JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(store.Data.Settings, Store.Json), Store.Json)!;
            store.SetGraphicalStyle("protoss");
            stale.Language = "en";
            lock (store.Gate)
            {
                // Same preservation boundary used by the general settings route.
                GraphicalStyles.PreservePreference(store.Data.Settings, stale);
                store.Data.Settings = stale;
                store.Save();
            }
            var saved = new Store(directory);
            assert(saved.Data.Settings.GraphicalStyle == "protoss" && saved.Data.Settings.Language == "en",
                "stale general settings save preserves the latest appearance while applying ordinary settings");

            using (var blocked = new FileStream(Path.Combine(directory, "library.json.tmp"), FileMode.Create, FileAccess.ReadWrite, FileShare.None))
            {
                bool failed = false;
                try { store.SetGraphicalStyle("zerg"); } catch (IOException) { failed = true; }
                assert(failed && store.Data.Settings.GraphicalStyle == "protoss" && new Store(directory).Data.Settings.GraphicalStyle == "protoss",
                    "failed appearance persistence restores memory and keeps the durable selection");
            }

            var library = JsonSerializer.SerializeToNode(store.Data, Store.Json)!;
            library["settings"]!.AsObject().Remove("graphicalStyle");
            WriteLibrary(library);
            assert(new Store(directory).Data.Settings.GraphicalStyle == "default", "legacy library without an appearance field opens in the current default style");
            foreach (var invalid in new string?[] { "unsupported", "ZERG", null })
            {
                library["settings"]!["graphicalStyle"] = invalid;
                WriteLibrary(library);
                var restored = new Store(directory);
                assert(restored.Data.Settings.GraphicalStyle == "default" && restored.Data.Marks["2-S2-1-456"].Note == "Keep note",
                    "invalid saved appearance falls back without losing existing library data: " + (invalid ?? "null"));
            }
            void WriteLibrary(JsonNode value) => File.WriteAllText(Path.Combine(directory, "library.json"), value.ToJsonString(Store.Json));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
    }

    private static string WithoutAppearance(Database database)
    {
        var json = JsonSerializer.SerializeToNode(database, Store.Json)!;
        json["settings"]!.AsObject().Remove("graphicalStyle");
        return json.ToJsonString(Store.Json);
    }
}
