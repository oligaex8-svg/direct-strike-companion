using System.Drawing;
using System.Runtime.InteropServices;

namespace DirectStrikeCompanion;

internal static class DashboardWindowTests
{
    internal static void Run(Action<bool, string> assert)
    {
        DashboardCaptionPaletteTests.Run(assert);
        CheckPlacementPreferences(assert);
        assert(Program.ResolveDataDirectory("D:/Example/Companion", null) == Path.Combine("D:/Example/Companion", "data"),
            "single-instance discovery and storage share the default data directory");
        assert(Program.ResolveDataDirectory("D:/Example/Companion", "D:/Custom/PrivateData") == "D:/Custom/PrivateData",
            "single-instance discovery respects the same custom data directory as storage");
        var origin = DashboardWindow.ValidateDashboardUri("http://127.0.0.1:64527");
        assert(DashboardWindow.CanNavigate(origin, "http://127.0.0.1:64527/settings?tab=alerts#sounds"),
            "dashboard permits paths, query and fragments on its exact app origin");
        foreach (var target in new[]
        {
            "http://127.0.0.1:64528/", "https://127.0.0.1:64527/", "http://localhost:64527/",
            "http://127.0.0.1.evil.example:64527/", "http://127.0.0.1:64527@evil.example/",
            "http://user:password@127.0.0.1:64527/", "http://127.0.0.1.:64527/",
            "http://[::1]:64527/", "http://127.0.0.1:64527\\@evil.example/", "http://127.0.0.1:64527/\n",
            "https://ds-rating.com/", "file:///C:/Windows/win.ini", "data:text/html,hello",
            "about:blank", "javascript:alert(1)", "ms-settings:display", "/settings", ""
        })
            assert(!DashboardWindow.CanNavigate(origin, target), "dashboard rejects a different or unsafe primary navigation: " + target);
        assert(DashboardWindow.TryBrowserUri("https://ds-rating.com/player/123/ratings", out var profile) &&
            profile.Scheme == Uri.UriSchemeHttps, "external public profile URL can open in the user's browser");
        assert(!DashboardWindow.TryBrowserUri("https://user:secret@ds-rating.com/", out _) &&
            !DashboardWindow.TryBrowserUri("javascript:alert(1)", out _) &&
            !DashboardWindow.TryBrowserUri("file:///C:/Windows/win.ini", out _) &&
            !DashboardWindow.TryBrowserUri("https://ds-rating.com/\r\n", out _),
            "browser fallback rejects credentials, non-web schemes and hidden control characters");
        foreach (var target in new[] { "https://127.0.0.1:64527", "http://localhost:64527", "http://evil.example", "http://127.0.0.1:0" })
        {
            var rejected = false;
            try { DashboardWindow.ValidateDashboardUri(target); }
            catch (ArgumentException) { rejected = true; }
            assert(rejected, "dashboard constructor requires our local HTTP listener: " + target);
        }

        // Form construction can install a UI synchronization context. These tests have
        // no message pump, and later asynchronous suites must retain their caller's context.
        var context = SynchronizationContext.Current;
        var autoInstall = WindowsFormsSynchronizationContext.AutoInstall;
        WindowsFormsSynchronizationContext.AutoInstall = false;
        try { CheckUnopenedWindow(origin, assert); CheckNativeFrame(origin, assert); CheckUnshownPlacementLifecycle(origin, assert); }
        finally
        {
            SynchronizationContext.SetSynchronizationContext(context);
            WindowsFormsSynchronizationContext.AutoInstall = autoInstall;
        }
        assert(ReferenceEquals(SynchronizationContext.Current, context) && WindowsFormsSynchronizationContext.AutoInstall == autoInstall,
            "unopened desktop checks preserve the caller's synchronization context");
    }

    private static void CheckPlacementPreferences(Action<bool, string> assert)
    {
        var minimum = new Size(820, 560);
        var work = new Size(1920, 1040);
        var normal = DashboardPlacementPreferences.Capture(new Size(1200, 800), 96, FormWindowState.Normal, null);
        assert(normal == new DashboardPlacement(1200, 800, false) &&
            DashboardPlacementPreferences.RestoreSize(normal, 96, minimum, work) == new Size(1200, 800),
            "normal dashboard dimensions survive placement capture and restore");
        var maximized = DashboardPlacementPreferences.Capture(new Size(1200, 800), 96, FormWindowState.Maximized, normal);
        assert(maximized.Maximized && maximized.Width == 1200 && maximized.Height == 800,
            "maximized placement retains the normal restore dimensions");
        assert(DashboardPlacementPreferences.Capture(new Size(160, 30), 96, FormWindowState.Minimized, maximized) == maximized &&
            DashboardPlacementPreferences.Capture(new Size(160, 30), 96, FormWindowState.Minimized, normal) == normal &&
            !DashboardPlacementPreferences.Capture(new Size(1200, 800), 96, FormWindowState.Minimized, null).Maximized,
            "minimizing preserves the prior normal or maximized state and never persists minimized state");
        var highDpi = DashboardPlacementPreferences.Capture(new Size(1800, 1200), 144, FormWindowState.Normal, null);
        assert(highDpi == normal && DashboardPlacementPreferences.RestoreSize(highDpi, 144, minimum, new Size(2560, 1400)) == new Size(1800, 1200),
            "placement stores logical dimensions and scales them to the current monitor DPI");
        assert(DashboardPlacementPreferences.RestoreSize(new(100000, 100000, true), 192, minimum, new Size(1280, 720)) == new Size(1280, 720) &&
            DashboardPlacementPreferences.RestoreSize(new(1, 1, false), 96, minimum, work) == minimum &&
            DashboardPlacementPreferences.RestoreSize(normal, 96, minimum, new Size(640, 480)) == new Size(640, 480),
            "oversized, undersized and small-monitor placement remains within the current working area");
        var directory = Path.Combine(Path.GetTempPath(), "DscPlacementTests-" + Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "preferences", "window-placement.json");
        try
        {
            assert(DashboardPlacementPreferences.Read(path) is null, "missing placement uses the default window");
            DashboardPlacementPreferences.Write(path, maximized);
            assert(DashboardPlacementPreferences.Read(path) == maximized && Directory.GetFiles(Path.GetDirectoryName(path)!).Length == 1,
                "placement round trips through an isolated preference file without temporary leftovers");
            DashboardPlacementPreferences.Write(path, normal);
            assert(DashboardPlacementPreferences.Read(path) == normal, "a later normal size replaces the saved maximized placement");
            foreach (var invalid in new[] { "{", "null", "{}", "{\"Width\":-1,\"Height\":700}",
                "{\"Width\":1e100,\"Height\":700}", "{\"Width\":1000,\"Height\":0}", new string(' ', 4097) })
            {
                File.WriteAllText(path, invalid);
                assert(DashboardPlacementPreferences.Read(path) is null, "invalid or excessive placement preferences are ignored");
            }
            File.WriteAllText(path, "blocked parent");
            assert(!DashboardPlacementPreferences.Write(Path.Combine(path, "unwritable.json"), normal) &&
                File.ReadAllText(path) == "blocked parent", "unwritable preferences do not interrupt the window lifecycle");
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
    }

    private static void CheckUnshownPlacementLifecycle(Uri origin, Action<bool, string> assert)
    {
        var directory = Path.Combine(Path.GetTempPath(), "DscPlacementLifecycle-" + Guid.NewGuid().ToString("N"));
        var path = Path.Combine(directory, "window-placement.json");
        var foreground = GetForegroundWindow();
        try
        {
            var fixture = new DashboardPlacement(900, 620, false);
            assert(DashboardPlacementPreferences.Write(path, fixture), "unshown placement lifecycle creates its isolated fixture");
            using var window = new DashboardWindow(origin.AbsoluteUri, "en", path);
            // OnLoad reads the injected fixture and may create an unshown HWND for
            // monitor discovery. Only OnShown starts WebView2; never call Show here.
            typeof(DashboardWindow).GetMethod("OnLoad", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
                .Invoke(window, [EventArgs.Empty]);
            var work = Screen.FromControl(window).WorkingArea;
            var expected = DashboardPlacementPreferences.RestoreSize(fixture, window.DeviceDpi, window.MinimumSize, work.Size);
            assert(window.Size == expected && work.Contains(window.Bounds) && window.WindowState == FormWindowState.Normal,
                "native load applies saved normal dimensions within the current monitor working area");
            assert(!window.Visible && !window.Status.Visible && !window.Status.Ready && window.Status.RuntimeVersion is null &&
                GetForegroundWindow() == foreground,
                "loading placement on an unshown form preserves focus without initializing WebView2");
            var beforeResize = DashboardPlacementPreferences.Capture(window.Size, window.DeviceDpi, FormWindowState.Normal, null);
            window.Size = new Size(window.Width + 17, window.Height + 13);
            var changed = DashboardPlacementPreferences.Capture(window.Size, window.DeviceDpi, FormWindowState.Normal, null);
            assert(changed != beforeResize && DashboardPlacementPreferences.Read(path) == fixture,
                "unshown resize defers preference writes until its debounce or disposal");
            window.Dispose();
            assert(DashboardPlacementPreferences.Read(path) == changed && window.IsDisposed &&
                !window.Status.Visible && !window.Status.Ready && window.Status.RuntimeVersion is null &&
                GetForegroundWindow() == foreground,
                "disposing an unshown dashboard persists its changed size to the injected fixture without taking focus");
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
    }

    private static void CheckNativeFrame(Uri origin, Action<bool, string> assert)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) return;
        var foreground = GetForegroundWindow();
        using var window = new DashboardWindow(origin.AbsoluteUri, "en");
        var handle = window.Handle; // Unshown: no WebView initialization or input.
        // Caption/text colors support setting, not reading (Get returns E_INVALIDARG).
        assert(DashboardWindow.ApplyNativeTheme(handle, false),
            "Windows accepts the native dark caption, background color and readable title text");
        window.SetGraphicalStyle("nerazim");
        assert(DashboardWindow.ApplyNativeTheme(handle, false, "nerazim"),
            "Windows accepts the selected native caption palette on an existing unshown handle");
        assert(DashboardWindow.ApplyNativeTheme(handle, true, "nerazim"),
            "Windows accepts restoring default caption colors for high contrast");
        assert(!window.Visible && !window.Status.Ready && window.Status.RuntimeVersion is null &&
            window.FormBorderStyle == FormBorderStyle.Sizable && window.MaximizeBox && window.MinimizeBox &&
            GetForegroundWindow() == foreground, "native theme verification preserves focus and standard window controls without opening the dashboard");
    }

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    private static void CheckUnopenedWindow(Uri origin, Action<bool, string> assert)
    {
        using var window = new DashboardWindow(origin.AbsoluteUri, "en");
        assert(window.Text == AppBranding.Name && window.ShowIcon && window.ShowInTaskbar && window.Icon is not null,
            "dashboard uses the bundled application branding in a genuine taskbar form");
        assert(window.ClientSize == new Size(1000, 700) && window.MinimumSize == new Size(820, 560) &&
            window.StartPosition == FormStartPosition.CenterScreen && window.BackColor == Color.FromArgb(11, 17, 27),
            "dashboard starts compact and permits the smaller responsive layout with a dark background");
        window.Size = new Size(840, 600);
        assert(window.Size == new Size(840, 600) && !window.IsHandleCreated && !window.Visible,
            "dashboard accepts a small desktop window without opening WebView or changing focus");
        var initial = window.Status;
        assert(!window.IsHandleCreated && !window.Visible && !initial.Ready && !initial.Visible && initial.WindowHandle == 0 &&
            initial.RuntimeVersion is null && initial.Error is null && initial.HasIcon,
            "constructing a dashboard does not create an HWND or initialize WebView2");
        int closeRequests = 0;
        window.CloseRequested += (_, _) => closeRequests++;
        var close = new FormClosingEventArgs(CloseReason.UserClosing, false);
        typeof(DashboardWindow).GetMethod("OnFormClosing", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(window, [close]);
        assert(close.Cancel && closeRequests == 1 && !window.IsDisposed && !window.IsHandleCreated,
            "dashboard close delegates to its owner before disposing browser controls or creating native windows");
        var cancelledClose = new FormClosingEventArgs(CloseReason.UserClosing, true);
        typeof(DashboardWindow).GetMethod("OnFormClosing", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(window, [cancelledClose]);
        assert(closeRequests == 1 && cancelledClose.Cancel, "an already cancelled close never begins companion shutdown");
        window.Dispose();
        var disposed = window.Status;
        assert(window.IsDisposed && !disposed.Ready && !disposed.Visible && disposed.WindowHandle == 0 && !disposed.HasIcon,
            "an unopened dashboard disposes its native resources without starting the browser");
        assert(initial.HasIcon && !ReferenceEquals(initial, disposed),
            "desktop status snapshots remain immutable after lifecycle changes");
        // Never Show, access Handle, initialize WebView2, launch a browser or send notifications in these checks.
    }
}
