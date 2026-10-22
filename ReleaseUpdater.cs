using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

internal sealed record SoftwareUpdateStatus(string CurrentVersion, string Repository, bool Connected,
    string State, string Message, string? AvailableVersion = null);
internal sealed record SoftwareUpdateAccess(string Token);
internal sealed record SoftwareUpdateInstall(string Version);
internal sealed record ReleaseDownload(string Version, long AssetId, long Size, string Sha256);
internal sealed record UpdateInstallTicket(string Target, string Download, string Sha256, long Size, string Version, int ParentId, long ParentStartTicks);

internal sealed class ReleaseUpdater
{
    internal const string AssetName = "DirectStrikeCompanion-win-x64.exe";
    internal const long MaximumDownload = 512L * 1024 * 1024;
    private readonly object gate = new();
    private readonly SemaphoreSlim operation = new(1, 1);
    private readonly HttpClient http;
    private readonly string repository, credentialPath;
    private readonly Version current;
    private SoftwareUpdateStatus status;
    private ReleaseDownload? available;
    internal event Action? Changed;
    internal static string BuildRepository => typeof(ReleaseUpdater).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
        .FirstOrDefault(value => value.Key == "UpdateRepository")?.Value ?? "";
    internal static Version BuildVersion => typeof(ReleaseUpdater).Assembly.GetName().Version is { } version
        ? new(version.Major, version.Minor, Math.Max(0, version.Build)) : new(1, 0, 0);
    internal ReleaseUpdater(string? repository = null, Version? current = null, HttpClient? http = null, string? credentialPath = null)
    {
        this.repository = repository ?? BuildRepository;
        if (this.repository.Length > 0) ValidateRepository(this.repository);
        this.current = current ?? BuildVersion;
        this.http = http ?? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMinutes(4) };
        this.credentialPath = credentialPath ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DirectStrikeCompanion", "UpdateAccess", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(this.repository))) + ".bin");
        status = new(this.current.ToString(), this.repository, File.Exists(this.credentialPath), "idle",
            this.repository.Length == 0 ? "Update repository is not configured." : "Check for updates from GitHub.");
        if (credentialPath == null) CleanOldStages();
    }
    internal SoftwareUpdateStatus Snapshot() { lock (gate) return status; }
    private void Set(string state, string message, string? version = null)
    {
        lock (gate) status = new(current.ToString(), repository, File.Exists(credentialPath), state, message, version);
        Changed?.Invoke();
    }
    internal static void ValidateRepository(string repository)
    {
        if (!Regex.IsMatch(repository, @"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$", RegexOptions.CultureInvariant)
            || repository.EndsWith("/.", StringComparison.Ordinal) || repository.EndsWith("/..", StringComparison.Ordinal))
            throw new ArgumentException("Use a GitHub owner/repository name.");
    }
    internal static Version ParseVersion(string tag)
    {
        if (!Regex.IsMatch(tag, @"^v?\d{1,6}\.\d{1,6}\.\d{1,6}$", RegexOptions.CultureInvariant)
            || !Version.TryParse(tag.TrimStart('v'), out var version)) throw new InvalidDataException("Release version is invalid.");
        return version;
    }
    internal static ReleaseDownload ReadRelease(JsonElement release, Version current)
    {
        if (release.GetProperty("draft").GetBoolean() || release.GetProperty("prerelease").GetBoolean())
            throw new InvalidDataException("Only stable published releases can be installed.");
        var tag = release.GetProperty("tag_name").GetString() ?? "";
        if (ParseVersion(tag) <= current) throw new InvalidDataException("The release is not newer than this installation.");
        var assets = release.GetProperty("assets").EnumerateArray().Where(item => item.GetProperty("name").GetString() == AssetName).ToList();
        if (assets.Count != 1) throw new InvalidDataException("Release must contain one Windows x64 application asset.");
        var asset = assets[0]; var size = asset.GetProperty("size").GetInt64(); var id = asset.GetProperty("id").GetInt64();
        var digest = asset.TryGetProperty("digest", out var hash) ? hash.GetString() ?? "" : "";
        if (id <= 0 || size is < 4096 or > MaximumDownload || !Regex.IsMatch(digest, @"^sha256:[a-fA-F0-9]{64}$", RegexOptions.CultureInvariant))
            throw new InvalidDataException("Release has no valid size and GitHub SHA-256 digest. Publish a fresh release asset.");
        return new(ParseVersion(tag).ToString(), id, size, digest[7..].ToUpperInvariant());
    }
    private string? Token()
    {
        // Stored access is optional for public releases. Preserve an unreadable
        // credential so a transient file or Windows-account issue cannot erase it.
        try { return File.Exists(credentialPath) ? Encoding.UTF8.GetString(UpdateSecret.Unprotect(File.ReadAllBytes(credentialPath))) : null; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or CryptographicException) { return null; }
    }
    internal async Task ConnectAsync(string token, CancellationToken cancel)
    {
        if (repository.Length == 0) throw new InvalidOperationException("Update repository is not configured.");
        token = (token ?? "").Trim();
        if (token.Length is < 20 or > 512 || token.Any(char.IsWhiteSpace)) throw new ArgumentException("Enter a valid GitHub access token.");
        await operation.WaitAsync(cancel);
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel); deadline.CancelAfter(TimeSpan.FromSeconds(20)); cancel = deadline.Token;
            using var response = await SendAsync(new($"https://api.github.com/repos/{repository}"), token, false, cancel, optionalCredential: false);
            await ReadLimitedAsync(response, 65536, cancel);
            var directory = Path.GetDirectoryName(credentialPath)!; Directory.CreateDirectory(directory); EnsureNoLinks(directory);
            var encrypted = UpdateSecret.Protect(Encoding.UTF8.GetBytes(token));
            var temp = credentialPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try { File.WriteAllBytes(temp, encrypted); File.Move(temp, credentialPath, true); }
            finally { if (File.Exists(temp)) File.Delete(temp); }
            available = null; Set("idle", "GitHub connected. Check for updates.");
        }
        finally { operation.Release(); }
    }
    internal async Task DisconnectAsync(CancellationToken cancel)
    {
        await operation.WaitAsync(cancel);
        try { if (File.Exists(credentialPath)) File.Delete(credentialPath); available = null; Set("idle", "GitHub disconnected."); }
        finally { operation.Release(); }
    }
    internal async Task MonitorAsync(CancellationToken cancel, TimeSpan? interval = null)
    {
        await CheckAsync(cancel);
        using var timer = new PeriodicTimer(interval ?? TimeSpan.FromMinutes(30));
        while (await timer.WaitForNextTickAsync(cancel)) await CheckAsync(cancel);
    }
    internal async Task<SoftwareUpdateStatus> CheckAsync(CancellationToken cancel)
    {
        if (!await operation.WaitAsync(0, cancel)) return Snapshot();
        try
        {
            available = null;
            if (repository.Length == 0) { Set("idle", "Update repository is not configured."); return Snapshot(); }
            Set("checking", "Checking GitHub releases…");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel); timeout.CancelAfter(TimeSpan.FromSeconds(20));
            using var response = await SendAsync(new($"https://api.github.com/repos/{repository}/releases/latest"), Token(), false, timeout.Token);
            using var json = JsonDocument.Parse(await ReadLimitedAsync(response, 1024 * 1024, timeout.Token));
            var version = ParseVersion(json.RootElement.GetProperty("tag_name").GetString() ?? "");
            if (version <= current) Set("current", "You have the latest version.");
            else { available = ReadRelease(json.RootElement, current); Set("available", "An update is available.", available.Version); }
        }
        catch (OperationCanceledException) when (!cancel.IsCancellationRequested) { Set("error", "Update check timed out. Try again."); }
        catch (Exception error) when (error is HttpRequestException or IOException or InvalidDataException or JsonException or KeyNotFoundException or InvalidOperationException or CryptographicException)
        { Set("error", error is HttpRequestException ? "GitHub could not be reached. Check access and try again." : error.Message); }
        finally { operation.Release(); }
        return Snapshot();
    }
    private async Task<HttpResponseMessage> SendAsync(Uri url, string? token, bool binary, CancellationToken cancel, bool optionalCredential = true)
    {
        // The credential goes only to api.github.com, never to an asset CDN redirect.
        for (var hop = 0; hop < 4; hop++)
        {
            ValidateDownloadHost(url);
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd("DirectStrikeCompanion/" + current);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(binary ? "application/octet-stream" : "application/vnd.github+json"));
            if (url.Host == "api.github.com")
            {
                if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
            }
            var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancel);
            if (optionalCredential && token != null && url.Host == "api.github.com" && response.StatusCode == HttpStatusCode.Unauthorized)
            {
                // Retry once anonymously without consuming a redirect hop. The
                // same path covers release metadata and verified asset downloads.
                response.Dispose(); token = null; hop--; continue;
            }
            if (response.StatusCode is HttpStatusCode.MovedPermanently or HttpStatusCode.Found or HttpStatusCode.TemporaryRedirect or HttpStatusCode.PermanentRedirect)
            {
                var location = response.Headers.Location; response.Dispose();
                if (location == null || !location.IsAbsoluteUri) throw new InvalidDataException("GitHub returned an invalid download redirect.");
                url = location; continue;
            }
            if (!response.IsSuccessStatusCode)
            {
                var code = response.StatusCode; response.Dispose();
                throw new InvalidDataException(code is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.NotFound
                    ? "GitHub access denied, rate limited, or no release exists. Try later, or connect optional repository access."
                    : "GitHub request failed. Try again later.");
            }
            return response;
        }
        throw new InvalidDataException("Too many GitHub redirects.");
    }
    internal static void ValidateDownloadHost(Uri url)
    {
        if (url.Scheme != "https" || !url.IsDefaultPort || url.UserInfo.Length != 0 || url.Fragment.Length != 0
            || url.Host is not ("api.github.com" or "release-assets.githubusercontent.com" or "objects.githubusercontent.com" or "github.com"))
            throw new InvalidDataException("Update download must stay on GitHub HTTPS hosts.");
    }
    private static async Task<byte[]> ReadLimitedAsync(HttpResponseMessage response, int limit, CancellationToken cancel)
    {
        using var output = new MemoryStream(); await using var input = await response.Content.ReadAsStreamAsync(cancel);
        var buffer = new byte[16384]; int count;
        while ((count = await input.ReadAsync(buffer, cancel)) > 0)
        { if (output.Length + count > limit) throw new InvalidDataException("GitHub response exceeded its size limit."); await output.WriteAsync(buffer.AsMemory(0, count), cancel); }
        return output.ToArray();
    }
    internal async Task PrepareInstallAsync(string expectedVersion, CancellationToken cancel)
    {
        if (!await operation.WaitAsync(0, cancel)) throw new InvalidOperationException("An update operation is already running.");
        string? stage = null;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel); deadline.CancelAfter(TimeSpan.FromMinutes(4)); cancel = deadline.Token;
            var release = available ?? throw new InvalidOperationException("Check for a newer release before installing.");
            if (ParseVersion(expectedVersion ?? "").ToString() != release.Version)
                throw new InvalidOperationException("The offered update changed. Check for updates again.");
            var target = Environment.ProcessPath ?? throw new InvalidOperationException("Application path unavailable.");
            if (!target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(target) is not ("Direct Strike Companion.exe" or "DirectStrikeCompanion.exe"))
                throw new InvalidOperationException("Run the installed Windows application to update it.");
            EnsureNoLinks(target);
            var stagingRoot = StagingRoot;
            Directory.CreateDirectory(stagingRoot); EnsureNoLinks(stagingRoot);
            stage = Path.Combine(stagingRoot, Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stage); EnsureNoLinks(stage);
            var download = Path.Combine(stage, "download.exe");
            Set("downloading", "Downloading and verifying the update…", release.Version);
            await DownloadAsync(release, download, cancel);
            var helper = Path.Combine(stage, "updater.exe"); File.Copy(target, helper);
            using var parent = Process.GetCurrentProcess();
            var ticket = new UpdateInstallTicket(target, download, release.Sha256, release.Size, release.Version, parent.Id, parent.StartTime.ToUniversalTime().Ticks);
            var ticketPath = Path.Combine(stage, "install.bin");
            File.WriteAllBytes(ticketPath, UpdateSecret.Protect(JsonSerializer.SerializeToUtf8Bytes(ticket)));
            var start = new ProcessStartInfo(helper) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = stage };
            start.ArgumentList.Add("--apply-update"); start.ArgumentList.Add(ticketPath);
            using var worker = Process.Start(start) ?? throw new IOException("Could not start the update installer.");
            Set("restarting", "Restarting to install the verified update…", release.Version);
        }
        catch
        {
            Set("error", "Update installation could not be prepared. The installed app is unchanged.", available?.Version);
            if (stage != null && Directory.Exists(stage))
            {
                try { EnsureNoLinks(stage); if (Path.GetDirectoryName(stage) == StagingRoot) Directory.Delete(stage, true); }
                catch (IOException) { /* A running installer or changed path is left for safe cleanup. */ }
            }
            throw new InvalidOperationException(Snapshot().Message);
        }
        finally { operation.Release(); }
    }
    internal async Task DownloadAsync(ReleaseDownload release, string download, CancellationToken cancel)
    {
        using var response = await SendAsync(new($"https://api.github.com/repos/{repository}/releases/assets/{release.AssetId}"), Token(), true, cancel);
        await using (var input = await response.Content.ReadAsStreamAsync(cancel))
        await using (var output = new FileStream(download, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
        {
            var buffer = new byte[65536]; long total = 0; int count;
            while ((count = await input.ReadAsync(buffer, cancel)) > 0)
            { total += count; if (total > release.Size) throw new InvalidDataException("Update exceeded its declared size."); await output.WriteAsync(buffer.AsMemory(0, count), cancel); }
            if (total != release.Size) throw new InvalidDataException("Update download was incomplete.");
        }
        VerifyExecutable(download, release.Sha256, release.Size, release.Version);
    }
    internal static void EnsureNoLinks(string path)
    {
        for (var current = Path.GetFullPath(path); current != null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Updates cannot use linked files or folders.");
    }
    internal static string FileHash(string path) { using var input = File.OpenRead(path); return Convert.ToHexString(SHA256.HashData(input)); }
    private static string StagingRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DirectStrikeCompanion", "Updates");
    private static void CleanOldStages()
    {
        try
        {
            var root = StagingRoot; if (!Directory.Exists(root)) return; EnsureNoLinks(root);
            foreach (var directory in Directory.GetDirectories(root).Where(path => Guid.TryParseExact(Path.GetFileName(path), "N", out _)
                && Directory.GetLastWriteTimeUtc(path) < DateTime.UtcNow.AddDays(-1)).Take(4))
            {
                EnsureNoLinks(directory);
                if (Path.GetDirectoryName(Path.GetFullPath(directory)) == root) Directory.Delete(directory, true);
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { /* Never interrupt startup for optional cache cleanup. */ }
    }
    internal static void VerifyExecutable(string path, string hash, long size, string? expectedVersion = null)
    {
        if (!Regex.IsMatch(hash, @"^[A-Fa-f0-9]{64}$", RegexOptions.CultureInvariant) || size is < 4096 or > MaximumDownload
            || new FileInfo(path).Length != size || !FileHash(path).Equals(hash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Update checksum or size does not match GitHub.");
        var info = FileVersionInfo.GetVersionInfo(path);
        using var executable = File.OpenRead(path);
        if (executable.ReadByte() != 'M' || executable.ReadByte() != 'Z' || info.ProductName != "Direct Strike Companion")
            throw new InvalidDataException("Update is not Direct Strike Companion.");
        if (expectedVersion != null && (!Version.TryParse(info.FileVersion, out var version)
            || new Version(version.Major, version.Minor, Math.Max(0, version.Build)) != ParseVersion(expectedVersion)))
            throw new InvalidDataException("The downloaded app version does not match the release.");
    }
    internal static void Apply(string ticketPath)
    {
        try
        {
            EnsureNoLinks(ticketPath);
            var stage = Path.GetDirectoryName(Environment.ProcessPath!)!;
            if (Path.GetFullPath(ticketPath) != Path.Combine(stage, "install.bin")) throw new InvalidDataException("Invalid installer ticket location.");
            var ticket = JsonSerializer.Deserialize<UpdateInstallTicket>(UpdateSecret.Unprotect(File.ReadAllBytes(ticketPath))) ?? throw new InvalidDataException("Invalid update ticket.");
            EnsureNoLinks(ticket.Target); EnsureNoLinks(ticket.Download);
            if (ticket.Download != Path.Combine(stage, "download.exe") || ticket.Target == Environment.ProcessPath
                || Path.GetFileName(ticket.Target) is not ("Direct Strike Companion.exe" or "DirectStrikeCompanion.exe")
                || FileHash(ticket.Target) != FileHash(Environment.ProcessPath!)) throw new InvalidDataException("The installed application changed. Retry the update.");
            VerifyExecutable(ticket.Download, ticket.Sha256, ticket.Size, ticket.Version);
            try
            {
                using var parent = Process.GetProcessById(ticket.ParentId);
                if (parent.StartTime.ToUniversalTime().Ticks != ticket.ParentStartTicks) throw new InvalidDataException("Installer process identity changed.");
                if (!parent.WaitForExit(60000)) throw new IOException("The companion is still closing. Reopen it and retry the update.");
            }
            catch (ArgumentException) { /* The authorized parent has already exited. */ }
            ReplaceInstalled(ticket.Target, ticket.Download, ticket.Sha256, ticket.Size);
            Process.Start(new ProcessStartInfo(ticket.Target) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(ticket.Target) });
            File.Delete(ticketPath);
            File.Delete(ticket.Download);
        }
        catch (Exception error) { MessageBox.Show("Update was not installed. Your saved data was not changed.\n\n" + error.Message, "Direct Strike Companion update"); }
    }
    internal static void ReplaceInstalled(string target, string download, string hash, long size, Action<string, string>? copy = null)
    {
        EnsureNoLinks(target); EnsureNoLinks(download); VerifyExecutable(download, hash, size);
        var root = Path.GetDirectoryName(target)!;
        var backup = Path.Combine(root, "Support", "Update backups", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(backup); EnsureNoLinks(backup);
        var previous = Path.Combine(backup, Path.GetFileName(target));
        File.Move(target, previous);
        try { if (copy == null) File.Copy(download, target, false); else copy(download, target); VerifyExecutable(target, hash, size); }
        catch { if (File.Exists(target)) File.Delete(target); File.Move(previous, target); throw; }
    }
}

internal static class UpdateSecret
{
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr pointer);
    internal static byte[] Protect(byte[] value) => Transform(value, true);
    internal static byte[] Unprotect(byte[] value) => Transform(value, false);
    private static byte[] Transform(byte[] value, bool protect)
    {
        var input = new Blob { Length = value.Length, Data = Marshal.AllocHGlobal(value.Length) }; var output = new Blob();
        try
        {
            Marshal.Copy(value, 0, input.Data, value.Length);
            var success = protect ? CryptProtectData(ref input, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!success) throw new CryptographicException("GitHub credentials could not be protected for this Windows user.");
            var result = new byte[output.Length]; Marshal.Copy(output.Data, result, 0, result.Length); return result;
        }
        finally { Marshal.FreeHGlobal(input.Data); if (output.Data != IntPtr.Zero) LocalFree(output.Data); }
    }
}
