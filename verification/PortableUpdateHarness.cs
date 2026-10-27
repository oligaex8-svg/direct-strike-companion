using System.Text.Json;
using DirectStrikeCompanion;

// Compiled separately by Test-PortableUpdate.ps1 with the production updater.
internal static class PortableUpdateHarness
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--apply-update") { ReleaseUpdater.Apply(args[1]); return; }
        var root = Environment.GetEnvironmentVariable("DSC_UPDATE_TEST_ROOT")!;
        try
        {
            if (args.Contains("--tests"))
            {
                var checks = new List<string>();
                ReleaseUpdaterTests.Run((ok, name) => { if (!ok) throw new Exception(name); checks.Add(name); });
                File.WriteAllText(Path.Combine(root, "unit-checks.json"), JsonSerializer.Serialize(checks));
                return;
            }
            if (args.Length == 2 && args[0] == "--reject-linked-target")
            {
                try { ReleaseUpdater.ValidateInstallTarget(args[1]); }
                catch (IOException) { return; }
                throw new Exception("Linked target was accepted.");
            }
            // Real anonymous GitHub metadata + asset download, production
            // preparation, DPAPI ticket and helper-driven replacement/restart.
            var updater = new ReleaseUpdater(credentialPath: Path.Combine(root, "no-credentials.bin"));
            var status = updater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult();
            if (status.State != "available" || status.AvailableVersion != "1.1.8")
                throw new Exception("This bounded test requires the public 1.1.8 release.");
            updater.PrepareInstallAsync("1.1.8", CancellationToken.None).GetAwaiter().GetResult();
            File.WriteAllText(Path.Combine(root, "prepared.json"), JsonSerializer.Serialize(updater.Snapshot()));
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(root, "failure.txt"), error.ToString());
            Environment.ExitCode = 1;
        }
    }
}
