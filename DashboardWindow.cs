using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DirectStrikeCompanion;

internal sealed record DashboardWindowStatus(bool Ready, bool Visible, string Title, string? RuntimeVersion,
    string? Error, long WindowHandle, bool HasIcon);

// ApplicationContext owns shutdown. Closing exits the companion; explicit Hide
// in its tray menu keeps watchers running without disposing this dashboard.
internal sealed class DashboardWindow : Form
{
    private static readonly Color DashboardBackground = Color.FromArgb(11, 17, 27);
    private static readonly Color DashboardCaptionBackground = Color.FromArgb(34, 50, 71);
    private readonly Uri dashboardUri;
    private readonly string language;
    private readonly Icon windowIcon;
    private readonly HashSet<ulong> blockedNavigations = [];
    private WebView2 browser;
    private Panel? failurePanel;
    private DashboardWindowStatus status = new(false, false, AppBranding.Name, null, null, 0, false);
    private bool initializationStarted;
    private bool initializing;
    private bool closing;
    private int initializationVersion;
    private readonly string placementPath;
    private readonly System.Windows.Forms.Timer placementTimer = new() { Interval = 600 };
    private DashboardPlacement? placement;
    private DashboardPlacement? savedPlacement;
    private bool placementReady;
    internal event EventHandler? CloseRequested;

    internal DashboardWindowStatus Status => Volatile.Read(ref status);

    internal DashboardWindow(string url, string language, string? placementPath = null)
    {
        dashboardUri = ValidateDashboardUri(url);
        this.placementPath = placementPath ?? DashboardPlacementPreferences.DefaultPath;
        this.language = language;
        windowIcon = AppBranding.LoadIcon();
        Text = AppBranding.Name;
        Icon = windowIcon;
        ShowIcon = true;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1000, 700);
        MinimumSize = new Size(820, 560);
        BackColor = DashboardBackground;
        browser = CreateBrowser();
        Controls.Add(browser);
        placementTimer.Tick += (_, _) => SavePlacement();
        Publish(Status with { HasIcon = true });
        // Do not set Source here: that would implicitly start WebView2 before the form opens.
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        var workingArea = Screen.FromControl(this).WorkingArea;
        var restored = DashboardPlacementPreferences.Read(placementPath);
        MinimumSize = new Size(Math.Min(MinimumSize.Width, workingArea.Width), Math.Min(MinimumSize.Height, workingArea.Height));
        Size = DashboardPlacementPreferences.RestoreSize(restored ??
            DashboardPlacementPreferences.Capture(Size, DeviceDpi, FormWindowState.Normal, null),
            DeviceDpi, MinimumSize, workingArea.Size);
        Location = new Point(workingArea.Left + (workingArea.Width - Width) / 2,
            workingArea.Top + (workingArea.Height - Height) / 2);
        placement = DashboardPlacementPreferences.Capture(Size, DeviceDpi,
            restored?.Maximized == true ? FormWindowState.Maximized : FormWindowState.Normal, null);
        savedPlacement = restored;
        if (restored?.Maximized == true) WindowState = FormWindowState.Maximized;
        placementReady = true;
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (!placementReady || closing || WindowState == FormWindowState.Minimized) return;
        placement = DashboardPlacementPreferences.Capture(
            WindowState == FormWindowState.Normal ? Size : RestoreBounds.Size, DeviceDpi, WindowState, placement);
        placementTimer.Stop();
        placementTimer.Start();
    }

    protected override void OnResizeEnd(EventArgs e)
    {
        base.OnResizeEnd(e);
        SavePlacement();
    }

    private void SavePlacement()
    {
        placementTimer.Stop();
        if (!placementReady || placement is null || placement == savedPlacement) return;
        if (DashboardPlacementPreferences.Write(placementPath, placement)) savedPlacement = placement;
    }

    private static WebView2 CreateBrowser() => new()
    {
        Dock = DockStyle.Fill,
        DefaultBackgroundColor = DashboardBackground
    };

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (closing || initializationStarted) return;
        initializationStarted = true;
        _ = InitializeAsync(); // All failures, including late disposal, are handled inside the task.
    }

    private async Task InitializeAsync()
    {
        if (closing || IsDisposed || initializing) return;
        initializing = true;
        var version = ++initializationVersion;
        var currentBrowser = browser;
        try
        {
            RemoveFailurePanel();
            Publish(Status with { Ready = false, Error = null });
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DirectStrikeCompanion", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            if (!IsCurrentInitialization(version, currentBrowser)) return;
            Publish(Status with { RuntimeVersion = environment.BrowserVersionString });
            await currentBrowser.EnsureCoreWebView2Async(environment);
            if (!IsCurrentInitialization(version, currentBrowser)) return;
            var core = currentBrowser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.NavigationStarting += NavigationStarting;
            core.NavigationCompleted += NavigationCompleted;
            core.NewWindowRequested += NewWindowRequested;
            core.PermissionRequested += PermissionRequested;
            core.ProcessFailed += ProcessFailed;
            core.Navigate(dashboardUri.AbsoluteUri);
        }
        catch (Exception exception)
        {
            if (IsCurrentInitialization(version, currentBrowser))
                ShowFailure(exception is WebView2RuntimeNotFoundException
                    ? Localized("Microsoft Edge WebView2 Runtime is unavailable. Open the dashboard in your browser or try again.",
                        "Среда Microsoft Edge WebView2 недоступна. Откройте панель в браузере или попробуйте ещё раз.")
                    : DashboardUnavailable());
        }
        finally
        {
            if (version == initializationVersion) initializing = false;
        }
    }

    private bool IsCurrentInitialization(int version, WebView2 currentBrowser) =>
        !closing && !IsDisposed && !Disposing && version == initializationVersion &&
        ReferenceEquals(browser, currentBrowser) && !currentBrowser.IsDisposed;

    private void NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (closing || !CanNavigate(dashboardUri, e.Uri))
        {
            e.Cancel = true;
            blockedNavigations.Add(e.NavigationId);
        }
    }

    private void NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (closing || IsDisposed || blockedNavigations.Remove(e.NavigationId)) return;
        if (!e.IsSuccess) { ShowFailure(DashboardUnavailable()); return; }
        RemoveFailurePanel();
        Publish(Status with { Ready = true, Error = null });
    }

    private void NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (closing || IsDisposed) return;
        // Queue same-app links until this event completes; no additional WebView/window is needed.
        if (CanNavigate(dashboardUri, e.Uri))
        {
            var target = e.Uri;
            BeginInvoke((Action)(() =>
            {
                if (closing || IsDisposed || browser.IsDisposed || browser.CoreWebView2 is null) return;
                try { browser.CoreWebView2.Navigate(target); }
                catch (Exception) { ShowFailure(DashboardUnavailable()); }
            }));
        }
        else if (e.IsUserInitiated && TryBrowserUri(e.Uri, out var external))
            OpenInBrowser(external);
    }

    private static void PermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e) =>
        e.State = CoreWebView2PermissionState.Deny;

    private void ProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        if (!closing && !IsDisposed) ShowFailure(DashboardUnavailable());
    }

    private string DashboardUnavailable() => Localized(
        "The dashboard could not open. Try again or open it in your browser.",
        "Не удалось открыть панель. Попробуйте ещё раз или откройте её в браузере.");

    private string Localized(string english, string russian) => language == "ru" ? russian : english;

    private void ShowFailure(string message)
    {
        if (closing || IsDisposed) return;
        Publish(Status with { Ready = false, Error = message });
        RemoveFailurePanel();
        failurePanel = new Panel { Dock = DockStyle.Fill, BackColor = DashboardBackground, Padding = new Padding(40) };
        var content = new FlowLayoutPanel
        {
            Dock = DockStyle.Top, AutoSize = true, FlowDirection = FlowDirection.TopDown,
            WrapContents = false, Padding = new Padding(0, 60, 0, 0)
        };
        var headingFont = new Font(SystemFonts.MessageBoxFont!.FontFamily, 20, FontStyle.Bold);
        var heading = new Label
        {
            Text = AppBranding.Name, AutoSize = true, ForeColor = Color.White,
            Font = headingFont, Margin = new Padding(0, 0, 0, 18)
        };
        heading.Disposed += (_, _) => headingFont.Dispose();
        content.Controls.Add(heading);
        content.Controls.Add(new Label
        {
            Text = message, AutoSize = true, MaximumSize = new Size(760, 0), ForeColor = Color.Gainsboro,
            Margin = new Padding(0, 0, 0, 22)
        });
        var actions = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = Padding.Empty };
        var retry = new Button { Text = Localized("Retry", "Повторить"), AutoSize = true, Padding = new Padding(12, 6, 12, 6) };
        retry.Click += (_, _) => Retry();
        var fallback = new Button
        {
            Text = Localized("Open in browser", "Открыть в браузере"), AutoSize = true, Padding = new Padding(12, 6, 12, 6)
        };
        fallback.Click += (_, _) => OpenInBrowser(dashboardUri);
        actions.Controls.Add(retry);
        actions.Controls.Add(fallback);
        content.Controls.Add(actions);
        failurePanel.Controls.Add(content);
        Controls.Add(failurePanel);
        failurePanel.BringToFront();
    }

    private void Retry()
    {
        if (closing || IsDisposed || initializing) return;
        try
        {
            ++initializationVersion;
            DetachBrowserEvents();
            Controls.Remove(browser);
            browser.Dispose();
            blockedNavigations.Clear();
            browser = CreateBrowser();
            Controls.Add(browser);
            _ = InitializeAsync();
        }
        catch (Exception) { ShowFailure(DashboardUnavailable()); }
    }

    private void OpenInBrowser(Uri target)
    {
        try { Process.Start(new ProcessStartInfo(target.AbsoluteUri) { UseShellExecute = true }); }
        catch (Exception)
        {
            ShowFailure(Localized("Windows could not open your browser. Try again.",
                "Windows не удалось открыть браузер. Попробуйте ещё раз."));
        }
    }

    private void RemoveFailurePanel()
    {
        if (failurePanel is null) return;
        Controls.Remove(failurePanel);
        failurePanel.Dispose();
        failurePanel = null;
    }

    private void DetachBrowserEvents()
    {
        if (browser.IsDisposed || browser.CoreWebView2 is not { } core) return;
        core.NavigationStarting -= NavigationStarting;
        core.NavigationCompleted -= NavigationCompleted;
        core.NewWindowRequested -= NewWindowRequested;
        core.PermissionRequested -= PermissionRequested;
        core.ProcessFailed -= ProcessFailed;
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (status is not null) Publish(Status with { Visible = !closing && Visible });
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyNativeTheme(Handle, SystemInformation.HighContrast);
        Publish(Status with { WindowHandle = Handle.ToInt64() });
    }

    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);
        // Reapply after Windows theme/accessibility changes, without replacing
        // the native caption, resize borders, system menu or Snap controls.
        if ((message.Msg is 0x001A or 0x031A) && IsHandleCreated && !Disposing)
            ApplyNativeTheme(Handle, SystemInformation.HighContrast);
    }

    internal static bool ApplyNativeTheme(nint handle, bool highContrast)
    {
        var dark = highContrast ? 0 : 1;
        var caption = highContrast ? -1 : ColorTranslator.ToWin32(DashboardCaptionBackground);
        var text = highContrast ? -1 : ColorTranslator.ToWin32(Color.FromArgb(226, 234, 244));
        // Unsupported attributes return an HRESULT; older Windows keeps its
        // normal frame. COLOR_DEFAULT restores accessibility theme ownership.
        var darkResult = DwmSetWindowAttribute(handle, 20, ref dark, sizeof(int));
        var captionResult = DwmSetWindowAttribute(handle, 35, ref caption, sizeof(int));
        var textResult = DwmSetWindowAttribute(handle, 36, ref text, sizeof(int));
        return darkResult >= 0 && captionResult >= 0 && textResult >= 0;
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(nint window, int attribute, ref int value, int size);

    protected override void OnHandleDestroyed(EventArgs e)
    {
        Publish(Status with { WindowHandle = 0 });
        base.OnHandleDestroyed(e);
    }

    private void Publish(DashboardWindowStatus snapshot) => Volatile.Write(ref status, snapshot);

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
        if (e.Cancel) return;
        Hide();
        // Let the owner remove the tray before synchronous WebView2 disposal.
        // FormClosed occurs too late: the Forms close path already disposed controls.
        if (CloseRequested is not null)
        {
            e.Cancel = true;
            CloseRequested.Invoke(this, EventArgs.Empty);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !closing)
        {
            SavePlacement();
            placementTimer.Dispose();
            closing = true;
            ++initializationVersion;
            Publish(Status with { Ready = false, Visible = false, WindowHandle = 0, HasIcon = false });
            DetachBrowserEvents();
            browser.Dispose();
            Icon = null;
            windowIcon.Dispose();
        }
        base.Dispose(disposing);
    }

    internal static Uri ValidateDashboardUri(string url)
    {
        if (!TryBrowserUri(url, out var uri) || uri.Scheme != Uri.UriSchemeHttp || uri.Host != "127.0.0.1" || uri.Port <= 0)
            throw new ArgumentException("The dashboard address must use the app's loopback HTTP server.", nameof(url));
        return uri;
    }

    internal static bool CanNavigate(Uri origin, string? target) => TryBrowserUri(target, out var uri) &&
        uri.Scheme == origin.Scheme && string.Equals(uri.Host, origin.Host, StringComparison.OrdinalIgnoreCase) && uri.Port == origin.Port;

    internal static bool TryBrowserUri(string? target, out Uri uri)
    {
        uri = null!;
        return !string.IsNullOrWhiteSpace(target) && !target.Any(char.IsControl) && !target.Contains('\\') &&
            Uri.TryCreate(target, UriKind.Absolute, out uri!) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) &&
            uri.Host.Length > 0 && uri.UserInfo.Length == 0;
    }
}
