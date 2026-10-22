using System.Text.Json;
using System.Text.Json.Nodes;

namespace DirectStrikeCompanion;

internal static class SortingTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var root = Path.Combine(Path.GetTempPath(), "DirectStrikeSortingTests", Guid.NewGuid().ToString());
        var store = new Store(root);
        try
        {
            bool Rejected(Action action)
            {
                try { action(); return false; }
                catch (ArgumentException) { return true; }
            }
            var legacy = JsonNode.Parse(JsonSerializer.Serialize(store.Data, Store.Json))!;
            legacy["settings"]!.AsObject().Remove("sortPreferences");
            File.WriteAllText(Path.Combine(root, "library.json"), legacy.ToJsonString(Store.Json));
            store = new Store(root);
            assert(store.Data.Settings.SortPreferences.Count == 0, "legacy libraries load with no saved sort overrides");
            store.SetSortPreference("players", "eu", "desc");
            store.SetSortPreference("matches", "length", "asc");
            store.SetSortPreference("marks", "updated", "desc");
            store.SetListAlert("friends", true);
            store.Data.Settings.Sound = false;
            store.SetSortPreference("players", "lastSeen", "asc");
            assert(store.Data.Settings.SortPreferences.Count == 3 && store.Data.Settings.SortPreferences["players"] == new SortPreference("lastSeen", "asc") && store.Data.Settings.SortPreferences["matches"] == new SortPreference("length", "asc") && store.Data.Settings.SortPreferences["marks"] == new SortPreference("updated", "desc") && store.Data.Settings.ListAlerts["friends"] && !store.Data.Settings.Sound, "changing one view sort preserves other views and settings");
            var before = JsonSerializer.Serialize(store.Data, Store.Json);
            assert(Rejected(() => store.SetSortPreference("unknown", "name", "asc")) && Rejected(() => store.SetSortPreference("matches", "eu", "asc")) && Rejected(() => store.SetSortPreference("players", "name", "up")) && JsonSerializer.Serialize(store.Data, Store.Json) == before, "invalid scope view key and direction cannot mutate saved preferences");
            assert(Rejected(() => Store.ValidateSortPreferences(new Settings { SortPreferences = null! })) && Rejected(() => Store.ValidateSortPreferences(new Settings { SortPreferences = new() { ["players"] = null! } })) && Rejected(() => Store.ValidateSortPreferences(new Settings { SortPreferences = new() { ["marks"] = new("commander", "asc") } })), "settings reject null and invalid sort dictionaries");
            store.Save();
            var restored = new Store(root);
            assert(JsonSerializer.Serialize(restored.Data.Settings.SortPreferences, Store.Json) == JsonSerializer.Serialize(store.Data.Settings.SortPreferences, Store.Json) && restored.Data.Settings.ListAlerts["friends"] && !restored.Data.Settings.Sound, "per-view sorting survives restart with unrelated settings intact");
        }
        finally { Directory.Delete(root, true); }
    }
}
