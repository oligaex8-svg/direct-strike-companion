using System.Security.Cryptography;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class Sc2SoundClipTests
{
    internal static void Run(Action<bool, string> assert)
    {
        assert(EmbeddedAssets.HasAsset("sound-library.js"), "standalone dashboard includes its expanded sound registry for offline startup");
        var hashes = new Dictionary<string, string>
        {
            ["sc1-nuclear"] = "FC7DF9B7AF556106D7E14B33D869AA0F3367A282293CCE4285138D14D04335ED",
            ["sc1-upgrade"] = "B69CEEAE55A84929E179B013BF72DDF5144DFB1403AC995DAEED379983652F9C",
            ["sc1-research"] = "E4E746866EEAF765F873E6DDA771C3A1B7AA00251DC4953D4DE8E6AFC709B0E3",
            ["sc1-pylons"] = "5E330AAE6230617509ED283868826F01201106EE5BAAE40AF767944160083285",
            ["sc1-warp"] = "844E68CC398DF4826AAD8496636492F84BE95C90FC13B67BB42866928FBCB45A",
            ["sc1-evolution"] = "E7A0FB78510A002634B032DCEAB0ED7DF99B0813956E0D35807638D0664673C3",
            ["sc2-evolution"] = "E8C2E063DF3948284B82ADA076200D24D17543B6F0F69A961332F07830B37209",
            ["sc2-nuclear"] = "0C89DC7B866BC47AF2F3E6E9A28EEA8F8EBC582F00EE84F4513A0957046452C0",
            ["sc2-pylons"] = "6953E9EC843DAB737C4E2058C55C2258B6123027C99B03001977B2F1E1614CED",
            ["sc2-research"] = "416AF5D80C753E661422BC471EA118CCE95D45F12B56F78C84018070BFF932A2",
            ["sc2-upgrade"] = "D42E9C19FEF2DD6006EB54B45E8B286B83991506FDC1C91487ABD057C9648D70",
            ["sc2-warp"] = "DC5A1A54D5C748844C5543A2A08662786A438F0B22C0AD2017BE5824017B51AD"
        };
        var legacy = JsonSerializer.Deserialize<Sc2SoundClips.Definition>(
            "{\"preset\":\"legacy\",\"en\":\"English\",\"ru\":\"Русский\",\"category\":\"legacy\",\"sha256\":\"legacy\"}",
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        assert(legacy?.Language == "en", "older sound catalogs without language metadata retain English recordings");
        var russian = Sc2SoundClips.Catalog.Values.Where(sound => sound.Language == "ru").ToArray();
        var englishHashes = Sc2SoundClips.Catalog.Values.Where(sound => sound.Language == "en").Select(sound => sound.Sha256).ToHashSet(StringComparer.OrdinalIgnoreCase);
        assert(russian.Length > 0 && englishHashes.Count > 0, "bundled catalog exposes both Russian and English recordings");
        assert(Sc2SoundClips.Catalog.Values.All(sound => sound.Language is "en" or "ru"), "every bundled recording has a supported audio language");
        foreach (var sound in russian)
        {
            assert(sound.Preset.StartsWith("sc2-ru-", StringComparison.Ordinal) && Sc2SoundClips.Contains(sound.Preset),
                "Russian recording has its own selectable preset: " + sound.Preset);
            assert(!englishHashes.Contains(Convert.ToHexString(SHA256.HashData(Sc2SoundClips.Resource(sound.Preset)))),
                "Russian recording is distinct from every English recording: " + sound.Preset);
        }
        using var resolver = new NotificationSounds();
        foreach (var (preset, definition) in Sc2SoundClips.Catalog)
        {
            var actual = Convert.ToHexString(SHA256.HashData(Sc2SoundClips.Resource(preset)));
            assert(actual == definition.Sha256, "game recording matches source manifest: " + preset);
            if (hashes.TryGetValue(preset, out var original))
                assert(actual == original, "previously selected game recording is unchanged: " + preset);
            var full = CustomNotificationSounds.Decode(NotificationSounds.Generate(GameSound.Loaded, preset, 100), normalize: false);
            var half = CustomNotificationSounds.Decode(NotificationSounds.Generate(GameSound.Loaded, preset, 50), normalize: false);
            assert(full.Length > NotificationSounds.SampleRate / 10 && full.Length <= NotificationSounds.SampleRate * 5
                && full.Max(sample => Math.Abs((int)sample)) is > 1000 and <= 26214,
                "bundled voice is short, audible, bounded and below clipping: " + preset);
            assert(full.Zip(half, (a, b) => Math.Abs(a / 2.0 - b)).All(difference => difference <= 1), "game voice volume scales every sample: " + preset);
            assert(CustomNotificationSounds.Decode(NotificationSounds.Generate(GameSound.Accept, preset, 0), normalize: false).All(sample => sample == 0), "game voice zero volume remains silent: " + preset);
            foreach (var cue in Enum.GetValues<GameSound>())
                assert(resolver.ResolveWaveform(new(cue, preset, 50, BuiltIn: true)).SequenceEqual(NotificationSounds.Generate(GameSound.Loaded, preset, 50)), "preview and every alert resolve selected game recording: " + preset + "/" + cue);
            assert(UiText.SoundDescription("en", preset, 80, true).Contains(Sc2SoundClips.Labels[preset].En)
                && UiText.SoundDescription("ru", preset, 80, true).Contains(Sc2SoundClips.Labels[preset].Ru), "native notification names selected SC2 voice in both languages: " + preset);
        }
        assert(Sc2SoundClips.Catalog.Count >= 75 && NotificationSounds.Presets.Length == Sc2SoundClips.Catalog.Count + 9
            && hashes.Keys.All(NotificationSounds.Presets.Contains), "expanded game library preserves original selections and hidden legacy compatibility keys");
    }
}
