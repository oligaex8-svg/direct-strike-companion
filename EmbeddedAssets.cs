using System.Reflection;
using Microsoft.AspNetCore.StaticFiles;

namespace DirectStrikeCompanion;

internal static class EmbeddedAssets
{
    private static readonly Assembly assembly = typeof(EmbeddedAssets).Assembly;
    private static readonly Dictionary<string, byte[]> assets = Load();
    private static readonly FileExtensionContentTypeProvider contentTypes = new();

    private static Dictionary<string, byte[]> Load()
    {
        var result = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var resource in assembly.GetManifestResourceNames().Where(n => n.StartsWith("DscAsset:", StringComparison.Ordinal)))
        {
            var path = resource["DscAsset:".Length..].Replace('\\', '/');
            if (!path.StartsWith("wwwroot/", StringComparison.Ordinal)) continue;
            using var stream = assembly.GetManifestResourceStream(resource)!;
            using var memory = new MemoryStream();
            stream.CopyTo(memory);
            result[path["wwwroot/".Length..]] = memory.ToArray();
        }
        return result;
    }

    public static IResult Serve(string? path)
    {
        path = string.IsNullOrEmpty(path) ? "index.html" : path;
        if (!assets.TryGetValue(path, out var bytes) || !contentTypes.TryGetContentType(path, out var contentType)) return Results.NotFound();
        return Results.File(bytes, contentType);
    }

    public static bool HasAsset(string path) => assets.ContainsKey(path);

    public static string EnsureOcrScript()
    {
        var directory = Path.Combine(Program.ProjectRoot(), "data", "tools");
        return ExtractOcrRuntime(Path.Combine(directory, "LobbyOcr.ps1"));
    }

    internal static string ExtractOcrRuntime(string path)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Directory.CreateDirectory(directory);
        // Publish the helper first so a newly extracted script always has its
        // Windows PowerShell-compatible dependency beside it.
        using (var helper = assembly.GetManifestResourceStream("DscTool:DscCaptureHelper.dll")
            ?? throw new InvalidDataException("The screen capture helper is not bundled. Reinstall Direct Strike Companion."))
        {
            using var memory = new MemoryStream();
            helper.CopyTo(memory);
            var bytes = memory.ToArray();
            var helperPath = Path.Combine(directory, "DscCaptureHelper.dll");
            if (!File.Exists(helperPath) || !File.ReadAllBytes(helperPath).AsSpan().SequenceEqual(bytes)) File.WriteAllBytes(helperPath, bytes);
        }
        using var stream = assembly.GetManifestResourceStream("DscTool:LobbyOcr.ps1") ?? throw new InvalidDataException("The screen reader is not bundled.");
        using var reader = new StreamReader(stream);
        WriteOcrScript(path, reader.ReadToEnd());
        return path;
    }

    internal static void WriteOcrScript(string path, string script)
    {
        // Windows PowerShell 5.1 otherwise reads a BOM-less file through the
        // machine's ANSI code page, corrupting Cyrillic patterns and quotes.
        var encoding = new System.Text.UTF8Encoding(true);
        var preamble = encoding.GetPreamble();
        var body = encoding.GetBytes(script);
        var bytes = new byte[preamble.Length + body.Length];
        preamble.CopyTo(bytes, 0); body.CopyTo(bytes, preamble.Length);
        if (!File.Exists(path) || !File.ReadAllBytes(path).AsSpan().SequenceEqual(bytes)) File.WriteAllBytes(path, bytes);
    }
}
