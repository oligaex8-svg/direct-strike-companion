using System.Net;
using System.Text;
using System.Text.Json;

namespace DirectStrikeCompanion;

internal static class ReleaseUpdaterTests
{
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel) => Task.FromResult(respond(request));
    }
    internal static void Run(Action<bool, string> check)
    {
        void Reject(Action action, string name)
        {
            bool rejected = false; try { action(); } catch (Exception error) when (error is ArgumentException or IOException or InvalidDataException) { rejected = true; }
            check(rejected, name);
        }
        foreach (var repository in new[] { "owner/tool", "owner-name/tool.test_1" }) ReleaseUpdater.ValidateRepository(repository);
        foreach (var repository in new[] { "https://github.com/a/b", "a/b/c", "a/..", "a/b?x=y", "a\\b" }) Reject(() => ReleaseUpdater.ValidateRepository(repository), "update repository rejects URL/path injection");
        foreach (var value in new[] { "v1.2.3", "1.2.3" }) check(ReleaseUpdater.ParseVersion(value) == new Version(1, 2, 3), "version tags normalize without lexical comparison");
        foreach (var value in new[] { "v1.2.3-beta", "1.2", "1.2.3.4", "https://bad/1.2.3", "v9999999.0.0" }) Reject(() => ReleaseUpdater.ParseVersion(value), "update version rejects prerelease and malformed tags");
        foreach (var url in new[] { "http://api.github.com/x", "https://api.github.com.evil.test/x", "https://evil.test/x", "https://user@api.github.com/x", "https://api.github.com:8443/x" })
            Reject(() => ReleaseUpdater.ValidateDownloadHost(new(url)), "update redirects reject insecure/foreign/credentialed hosts");
        ReleaseUpdater.ValidateDownloadHost(new("https://release-assets.githubusercontent.com/example"));
        JsonElement Release(string digest, long size = 4096, string tag = "v1.2.0", bool draft = false) => JsonSerializer.SerializeToElement(new
        { tag_name = tag, draft, prerelease = false, assets = new[] { new { id = 42, name = ReleaseUpdater.AssetName, size, digest } } });
        var sha = new string('A', 64);
        check(ReleaseUpdater.ReadRelease(Release("sha256:" + sha), new(1, 1, 0)).AssetId == 42, "stable newer release selects the exact x64 asset and trusted GitHub digest");
        foreach (var digest in new[] { "", "sha256:123", "md5:" + sha }) Reject(() => ReleaseUpdater.ReadRelease(Release(digest), new(1, 1, 0)), "missing or unsupported digest cannot authorize installation");
        Reject(() => ReleaseUpdater.ReadRelease(Release("sha256:" + sha, ReleaseUpdater.MaximumDownload + 1), new(1, 1, 0)), "oversized asset cannot authorize download");
        Reject(() => ReleaseUpdater.ReadRelease(Release("sha256:" + sha, tag: "v1.0.0"), new(1, 1, 0)), "downgrade cannot authorize installation");
        Reject(() => ReleaseUpdater.ReadRelease(Release("sha256:" + sha, draft: true), new(1, 1, 0)), "draft releases cannot authorize installation");
        var root = Path.Combine(Path.GetTempPath(), "DscUpdateTests", Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try
        {
            var secret = Encoding.UTF8.GetBytes("test-only-not-a-github-token");
            var cipher = UpdateSecret.Protect(secret);
            check(!cipher.SequenceEqual(secret) && UpdateSecret.Unprotect(cipher).SequenceEqual(secret), "update credentials round-trip through current-user DPAPI without plaintext storage");
            var token = "test-token-not-real-123456789";
            var credentials = Path.Combine(root, "credentials.bin"); File.WriteAllBytes(credentials, UpdateSecret.Protect(Encoding.UTF8.GetBytes(token)));
            var requests = new List<(string Host, bool Authorized)>();
            using var client = new HttpClient(new Handler(request =>
            {
                requests.Add((request.RequestUri!.Host, request.Headers.Authorization != null));
                if (request.RequestUri.AbsolutePath.EndsWith("/latest")) return new(HttpStatusCode.OK) { Content = new StringContent(Release("sha256:" + sha).GetRawText()) };
                return new(HttpStatusCode.OK) { Content = new StringContent("{}") };
            }));
            var updater = new ReleaseUpdater("owner/private", new(1, 1, 0), client, credentials);
            var status = updater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult();
            check(status.State == "available" && status.AvailableVersion == "1.2.0" && requests.Single().Authorized, "private release checks authenticate and expose only version/status");
            check(!JsonSerializer.Serialize(status).Contains(token), "API update status never exposes the GitHub credential");
            bool changedReleaseRejected = false;
            try { updater.PrepareInstallAsync("1.1.1", CancellationToken.None).GetAwaiter().GetResult(); }
            catch (InvalidOperationException) { changedReleaseRejected = true; }
            check(changedReleaseRejected && requests.Count == 1,
                "installation rejects a changed approved version before staging, downloading or restarting");
            using (var stopMonitor = new CancellationTokenSource(TimeSpan.FromSeconds(3)))
            {
                int polls = 0;
                using var monitorClient = new HttpClient(new Handler(request =>
                {
                    check(request.RequestUri!.AbsolutePath.EndsWith("/releases/latest") && request.Headers.Authorization == null, "public automatic update monitor requests metadata without a credential");
                    if (++polls == 2) stopMonitor.Cancel();
                    return new(HttpStatusCode.OK) { Content = new StringContent(Release("sha256:" + sha).GetRawText()) };
                }));
                var monitor = new ReleaseUpdater("oligaex8-svg/direct-strike-companion", new(1, 1, 0), monitorClient, Path.Combine(root, "public-monitor.bin"));
                try { monitor.MonitorAsync(stopMonitor.Token, TimeSpan.FromMilliseconds(10)).GetAwaiter().GetResult(); }
                catch (OperationCanceledException) when (stopMonitor.IsCancellationRequested) { }
                check(polls == 2, "automatic monitor checks at startup and again on its interval, then stops on shutdown cancellation");
            }
            updater.DisconnectAsync(CancellationToken.None).GetAwaiter().GetResult();
            check(!File.Exists(credentials) && !updater.Snapshot().Connected, "disconnect removes only protected updater credentials");
            check(updater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult().State == "available" && !requests.Last().Authorized, "disconnect keeps public release checks available without an Authorization header");
            File.WriteAllBytes(credentials, UpdateSecret.Protect(Encoding.UTF8.GetBytes(token)));
            var redirectRequests = new List<(string Host, bool Authorized)>();
            using var redirects = new HttpClient(new Handler(request =>
            {
                redirectRequests.Add((request.RequestUri!.Host, request.Headers.Authorization != null));
                return request.RequestUri.Host == "api.github.com"
                    ? new(HttpStatusCode.Found) { Headers = { Location = new("https://release-assets.githubusercontent.com/test") } }
                    : new(HttpStatusCode.OK) { Content = new StringContent(Release("sha256:" + sha).GetRawText()) };
            }));
            var redirected = new ReleaseUpdater("owner/private", new(1, 1, 0), redirects, credentials);
            redirected.CheckAsync(CancellationToken.None).GetAwaiter().GetResult();
            check(redirectRequests.Count == 2 && redirectRequests[0].Authorized && !redirectRequests[1].Authorized,
                "GitHub credential is stripped before following an asset CDN redirect");
            using var malicious = new HttpClient(new Handler(_ => new(HttpStatusCode.Found) { Headers = { Location = new("https://evil.test/update.exe") } }));
            var refused = new ReleaseUpdater("owner/private", new(1, 1, 0), malicious, credentials);
            check(refused.CheckAsync(CancellationToken.None).GetAwaiter().GetResult().State == "error", "foreign redirect is rejected before download or installation");
            var publicRequests = new List<(string Host, bool Authorized)>();
            var publicBytes = File.ReadAllBytes(Environment.ProcessPath!);
            using var publicClient = new HttpClient(new Handler(request =>
            {
                publicRequests.Add((request.RequestUri!.Host, request.Headers.Authorization != null));
                if (request.RequestUri.AbsolutePath.EndsWith("/latest"))
                    return new(HttpStatusCode.OK) { Content = new StringContent(Release("sha256:" + sha).GetRawText()) };
                return request.RequestUri.Host == "api.github.com"
                    ? new(HttpStatusCode.Found) { Headers = { Location = new("https://release-assets.githubusercontent.com/public-update") } }
                    : new(HttpStatusCode.OK) { Content = new ByteArrayContent(publicBytes) };
            }));
            var publicUpdater = new ReleaseUpdater("oligaex8-svg/direct-strike-companion", new(1, 1, 0), publicClient, Path.Combine(root, "public.bin"));
            var publicStatus = publicUpdater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult();
            check(publicStatus.State == "available" && !publicStatus.Connected, "public channel offers a newer release without requiring GitHub access");
            var publicDownload = Path.Combine(root, "public.exe");
            var publicRelease = new ReleaseDownload(ReleaseUpdater.BuildVersion.ToString(), 42, publicBytes.LongLength, ReleaseUpdater.FileHash(Environment.ProcessPath!));
            publicUpdater.DownloadAsync(publicRelease, publicDownload, CancellationToken.None).GetAwaiter().GetResult();
            check(File.ReadAllBytes(publicDownload).SequenceEqual(publicBytes) && publicRequests.Count == 3 && publicRequests.All(request => !request.Authorized),
                "public download follows the GitHub CDN redirect without credentials and verifies executable digest, size and version");
            foreach (var corrupt in new[] { false, true })
            {
                var optionalPath = Path.Combine(root, corrupt ? "corrupt.bin" : "revoked.bin");
                var stored = corrupt ? new byte[] { 1, 2, 3, 4 } : UpdateSecret.Protect(Encoding.UTF8.GetBytes(token));
                File.WriteAllBytes(optionalPath, stored);
                var optionalRequests = new List<(string Host, bool Authorized)>();
                using var optionalClient = new HttpClient(new Handler(request =>
                {
                    optionalRequests.Add((request.RequestUri!.Host, request.Headers.Authorization != null));
                    if (request.Headers.Authorization != null) return new(HttpStatusCode.Unauthorized);
                    if (request.RequestUri.AbsolutePath.EndsWith("/latest"))
                        return new(HttpStatusCode.OK) { Content = new StringContent(Release("sha256:" + sha).GetRawText()) };
                    return request.RequestUri.Host == "api.github.com"
                        ? new(HttpStatusCode.Found) { Headers = { Location = new("https://release-assets.githubusercontent.com/optional-access") } }
                        : new(HttpStatusCode.OK) { Content = new ByteArrayContent(publicBytes) };
                }));
                var optionalUpdater = new ReleaseUpdater("oligaex8-svg/direct-strike-companion", new(1, 1, 0), optionalClient, optionalPath);
                var optionalStatus = optionalUpdater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult();
                check(optionalStatus.State == "available" && !JsonSerializer.Serialize(optionalStatus).Contains(token),
                    "unusable optional credentials fall back to public metadata without exposing a token: " + corrupt);
                var optionalDownload = Path.Combine(root, corrupt ? "corrupt-public.exe" : "revoked-public.exe");
                optionalUpdater.DownloadAsync(publicRelease, optionalDownload, CancellationToken.None).GetAwaiter().GetResult();
                check(File.ReadAllBytes(optionalDownload).SequenceEqual(publicBytes)
                    && optionalRequests.Count == (corrupt ? 3 : 5)
                    && optionalRequests.Count(request => request.Authorized) == (corrupt ? 0 : 2)
                    && optionalRequests.Where(request => request.Host != "api.github.com").All(request => !request.Authorized),
                    "public asset download verifies content after bounded anonymous fallback and strips CDN credentials: " + corrupt);
                check(File.ReadAllBytes(optionalPath).SequenceEqual(stored), "anonymous fallback preserves the existing credential unchanged: " + corrupt);
            }
            int deniedRequests = 0;
            using (var unavailableClient = new HttpClient(new Handler(_ => { deniedRequests++; return new(HttpStatusCode.Unauthorized); })))
            {
                var unavailableUpdater = new ReleaseUpdater("owner/private", new(1, 1, 0), unavailableClient, credentials);
                check(unavailableUpdater.CheckAsync(CancellationToken.None).GetAwaiter().GetResult().State == "error" && deniedRequests == 2,
                    "authenticated denial followed by anonymous denial stops after one fallback request");
            }
            using (var deniedClient = new HttpClient(new Handler(_ => new(HttpStatusCode.Unauthorized))))
            {
                var deniedPath = Path.Combine(root, "denied-connect.bin");
                var deniedUpdater = new ReleaseUpdater("oligaex8-svg/direct-strike-companion", new(1, 1, 0), deniedClient, deniedPath);
                Reject(() => deniedUpdater.ConnectAsync(token, CancellationToken.None).GetAwaiter().GetResult(),
                    "explicit credential connection still rejects unauthorized access instead of accepting anonymous success");
                check(!File.Exists(deniedPath), "rejected credential connection creates no stored credential");
            }
            foreach (var invalidRelease in new[] { publicRelease with { Sha256 = new string('0', 64) }, publicRelease with { Size = publicRelease.Size + 1 }, publicRelease with { Version = "999.0.0" } })
            {
                var invalidDownload = Path.Combine(root, Guid.NewGuid().ToString("N") + ".exe");
                Reject(() => publicUpdater.DownloadAsync(invalidRelease, invalidDownload, CancellationToken.None).GetAwaiter().GetResult(),
                    "public download rejects a mismatched digest, size or executable version before installation");
            }
            var target = Path.Combine(root, "Direct Strike Companion.exe");
            var source = Environment.ProcessPath!; File.Copy(source, target);
            var bad = Path.Combine(root, "invalid.exe"); File.WriteAllBytes(bad, new byte[4096]);
            var before = ReleaseUpdater.FileHash(target);
            Reject(() => ReleaseUpdater.ReplaceInstalled(target, bad, new string('0', 64), 4096), "bad checksum fails before touching installed application");
            check(ReleaseUpdater.FileHash(target) == before, "failed update preserves the original executable");
            var download = Path.Combine(root, "download.exe"); File.Copy(source, download);
            var library = Path.Combine(root, "data", "library.json"); Directory.CreateDirectory(Path.GetDirectoryName(library)!); File.WriteAllText(library, "private-test-data");
            Reject(() => ReleaseUpdater.ReplaceInstalled(target, download, ReleaseUpdater.FileHash(download), new FileInfo(download).Length,
                (_, destination) => { File.WriteAllText(destination, "partial failed copy"); throw new IOException("Injected copy failure"); }),
                "partial installation failure propagates after restoring the previous app");
            check(ReleaseUpdater.FileHash(target) == before && File.ReadAllText(library) == "private-test-data", "copy failure rolls back the EXE without changing saved data");
            ReleaseUpdater.ReplaceInstalled(target, download, ReleaseUpdater.FileHash(download), new FileInfo(download).Length);
            check(ReleaseUpdater.FileHash(target) == before && File.ReadAllText(library) == "private-test-data", "verified EXE-only replacement leaves saved data unchanged");
            check(Directory.GetFiles(Path.Combine(root, "Support", "Update backups"), "*.exe", SearchOption.AllDirectories).Length == 1, "verified installation keeps the preceding EXE as a recovery backup");
        }
        finally { Directory.Delete(root, true); }
    }
}
