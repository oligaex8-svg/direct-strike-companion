using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

public sealed record OwnLocalName(string Id, string Name, DateTime ObservedAt);

internal static class OwnNicknames
{
    // SC2 creates Name_<profile-code>@<region>.lnk pointing at its profile
    // directory. Read its target metadata only; never execute or save the link.
    internal static string? ParseName(string filename, string id)
    {
        var match = Regex.Match(Path.GetFileNameWithoutExtension(filename), @"^(.{1,64})_[0-9]+@([0-9]+)$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
        return match.Success && match.Groups[2].Value == id.Split('-')[0] ? match.Groups[1].Value : null;
    }
    internal static List<OwnLocalName> Read(IReadOnlyList<OwnAccountGroup> groups)
    {
        var profiles = groups.Where(g => g.CanAutoLink).SelectMany(g => g.Profiles).Where(p => p.ProfileDirectory != null && p.Sc2Root != null).ToList();
        var names = new List<OwnLocalName>();
        object? shell = null;
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return names;
            shell = Activator.CreateInstance(type);
            if (shell == null) return names;
            foreach (var root in profiles.Select(p => p.Sc2Root!).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                IEnumerable<string> files;
                try { files = Directory.GetFiles(root, "*.lnk").Take(100).ToArray(); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { continue; }
                foreach (var file in files)
                {
                    object? link = null;
                    try
                    {
                        link = ((dynamic)shell).CreateShortcut(file);
                        string target = ((dynamic)link).TargetPath;
                        if (string.IsNullOrWhiteSpace(target)) continue;
                        var fullTarget = Path.TrimEndingDirectorySeparator(Path.GetFullPath(target));
                        var profile = profiles.FirstOrDefault(p => string.Equals(p.ProfileDirectory, fullTarget, StringComparison.OrdinalIgnoreCase));
                        if (profile == null) continue;
                        var name = ParseName(file, profile.Id);
                        if (name != null) names.Add(new(profile.Id, name, File.GetLastWriteTimeUtc(file)));
                    }
                    catch (Exception ex) when (ex is COMException or IOException or UnauthorizedAccessException or ArgumentException) { }
                    finally { if (link != null && Marshal.IsComObject(link)) Marshal.FinalReleaseComObject(link); }
                }
            }
        }
        catch (COMException) { }
        finally { if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell); }
        return names.DistinctBy(n => (n.Id, n.Name)).OrderByDescending(n => n.ObservedAt).ToList();
    }
}
