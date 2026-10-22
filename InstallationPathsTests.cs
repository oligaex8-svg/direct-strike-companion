namespace DirectStrikeCompanion;

internal static class InstallationPathsTests
{
    internal static void Run(Action<bool, string> assert)
    {
        // Discovery walks through ancestors, so fixtures must be outside the real installation.
        var temporaryRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
        var fixture = Path.GetFullPath(Path.Combine(temporaryRoot, "DscInstallPaths-" + Guid.NewGuid().ToString("N")));
        try { CheckFixture(fixture, assert); }
        finally
        {
            if (Directory.GetParent(fixture)?.FullName != temporaryRoot || !Path.GetFileName(fixture).StartsWith("DscInstallPaths-", StringComparison.Ordinal))
                throw new InvalidOperationException("Path fixture cleanup escaped its temporary directory.");
            if (Directory.Exists(fixture)) Directory.Delete(fixture, true);
        }
    }

    private static void CheckFixture(string fixture, Action<bool, string> assert)
    {
        var fallback = Path.Combine(fixture, "fallback");
        var flat = Path.Combine(fixture, "flat");
        Directory.CreateDirectory(flat);
        File.WriteAllText(Path.Combine(flat, "DirectStrikeCompanion.csproj"), "fixture");
        assert(Program.FindInstallationRoot(flat, fallback) == flat,
            "flat installation still finds its existing private-data root");
        var flatBuild = Directory.CreateDirectory(Path.Combine(flat, "release")).FullName;
        assert(Program.FindInstallationRoot(flatBuild, fallback) == flat,
            "flat development build uses the installation data root");

        var install = Path.Combine(fixture, "clean");
        var development = Directory.CreateDirectory(Path.Combine(install, "Support", "Development")).FullName;
        File.WriteAllText(Path.Combine(development, "DirectStrikeCompanion.csproj"), "fixture");
        assert(!File.Exists(Path.Combine(install, "DirectStrikeCompanion.csproj")) &&
            Program.FindInstallationRoot(install, fallback) == install,
            "clean root launcher finds its private data without a root project file");
        var build = Directory.CreateDirectory(Path.Combine(development, "release")).FullName;
        assert(Program.FindInstallationRoot(build, fallback) == install,
            "nested development build prefers the installation over its project folder");
        var legacy = Directory.CreateDirectory(Path.Combine(install, "Support", "Launcher resources")).FullName;
        assert(Program.FindInstallationRoot(legacy, fallback) == install,
            "legacy launcher location shares the clean installation data root");
        assert(Program.ResolveDataDirectory(Program.FindInstallationRoot(build, fallback), null) == Path.Combine(install, "data"),
            "clean layout resolves existing root data for runtime and single-instance discovery");
        assert(Program.ResolveDataDirectory(Program.FindInstallationRoot(build, fallback), Path.Combine(fixture, "custom")) == Path.Combine(fixture, "custom"),
            "custom data directory continues to override clean-layout discovery");
        var unattached = Directory.CreateDirectory(Path.Combine(fixture, "unattached")).FullName;
        assert(Program.FindInstallationRoot(unattached, fallback) == fallback,
            "standalone distribution retains its previous fallback when no installation is found");
    }
}
