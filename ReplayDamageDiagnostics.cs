using System.Text.Json;
using System.Security.Cryptography;

namespace DirectStrikeCompanion;

internal static class ReplayDamageDiagnostics
{
    internal static async Task RunAsync(string[] args)
    {
        string Argument(string key) { int i = Array.IndexOf(args, key); return i >= 0 && i + 1 < args.Length ? args[i + 1] : throw new ArgumentException(key); }
        var fixture = Path.GetFullPath(Argument("--probe-damage"));
        var output = Path.GetFullPath(Argument("--output"));
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(fixture));
        var match = json.RootElement.GetProperty("match").Deserialize<Match>(Store.Json) ?? throw new InvalidDataException("Missing fixture match");
        var configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "StarCraft II", "Variables.txt");
        string ConfigHash() => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(configPath)));
        var before = ConfigHash();
        var store = new Store(output + ".data");
        store.ImportMatch(match);
        var service = new ReplayDamageService(store);
        using var cancel = new CancellationTokenSource(TimeSpan.FromMinutes(32));
        if (args.Contains("--cancel-after")) cancel.CancelAfter(TimeSpan.FromSeconds(int.Parse(Argument("--cancel-after"))));
        service.Start(match.Hash, cancel.Token);
        while (!service.Completion.IsCompleted)
        {
            await File.WriteAllTextAsync(output + ".status.json", JsonSerializer.Serialize(service.Snapshot(), Store.Json));
            await Task.WhenAny(service.Completion, Task.Delay(1000));
        }
        await service.Completion;
        var status = service.Snapshot();
        await File.WriteAllTextAsync(output + ".status.json", JsonSerializer.Serialize(status, Store.Json));
        bool success = status.Phase is "complete" or "partial";
        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { success, status,
            settingsRestored = before == ConfigHash(), match = store.ReplayForDamage(match.Hash) }, Store.Json));
        Environment.ExitCode = success ? 0 : 1;
    }
}
