using System.Reflection;

namespace DirectStrikeCompanion;

internal static class NativeNotificationTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var styles = new[] { ("soft", "Soft chime", "Мягкий перезвон"), ("clear", "Clear bell", "Звонкий колокольчик"), ("classic", "Classic tones", "Классические сигналы") };
        foreach (var (preset, english, russian) in styles)
        {
            assert(UiText.DesktopTest("en", preset, 55, true) == $"{english} · volume 55%\nManage alerts in Live lobby.", "desktop test reports the exact English sound preset: " + preset);
            assert(UiText.DesktopTest("ru", preset, 55, true) == $"{russian} · громкость 55%\nНастройте уведомления в «Текущем лобби».", "desktop test reports the exact Russian sound preset: " + preset);
        }
        assert(UiText.SoundDescription("en", "soft", 0, true) == "Silent · volume 0%" && UiText.SoundDescription("ru", "clear", 0, true) == "Без звука · громкость 0%", "zero-volume test truthfully reports silence in both languages");
        assert(UiText.SoundDescription("en", "soft", 55, false) == "Sound is off" && UiText.SoundDescription("ru", "clear", 100, false) == "Звук выключен", "disabled sound does not promise an audible test");
        assert(UiText.SoundDescription("en", "classic", 100, true) == "Classic tones · volume 100%", "notification copy retains the configured volume endpoint");
        var assembly = typeof(AppBranding).Assembly;
        assert(assembly.GetCustomAttribute<AssemblyTitleAttribute>()?.Title == AppBranding.Name && assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product == AppBranding.Name, "application metadata uses the friendly spaced notification name");
        using var stream = assembly.GetManifestResourceStream("DscBrand:companion.ico");
        using var reader = new BinaryReader(stream!);
        assert(reader.ReadUInt16() == 0 && reader.ReadUInt16() == 1 && reader.ReadUInt16() == 8, "standalone EXE bundles eight original icon sizes");
        using var icon = AppBranding.LoadIcon();
        using var tray = new Icon(icon, SystemInformation.SmallIconSize);
        using var balloon = new Icon(icon, SystemInformation.IconSize);
        assert(tray.Size == SystemInformation.SmallIconSize && balloon.Size == SystemInformation.IconSize, "branded icon loads independent DPI-appropriate tray and notification sizes");
        using var cancellation = new CancellationTokenSource();
        Action? queued = null;
        int deliveries = 0;
        var pending = DesktopNotificationDispatch.InvokeAsync(cancellation.Token, action => queued = action, () => { deliveries++; return true; });
        assert(!pending.IsCompleted && queued != null, "notification request waits for actual UI dispatch before acknowledging delivery");
        cancellation.Cancel();
        assert(pending.Wait(TimeSpan.FromSeconds(2)) && !pending.Result, "shutdown completes a queued notification without needing the stopped UI message pump");
        queued!();
        assert(deliveries == 0, "late queued notification does not show or play sound after shutdown");
        assert(!DesktopNotificationDispatch.InvokeAsync(cancellation.Token, _ => throw new Exception("must not enqueue"), () => true).Result, "already-cancelled notification is never queued");
        assert(DesktopNotificationDispatch.InvokeAsync(CancellationToken.None, action => action(), () => true).Result && !DesktopNotificationDispatch.InvokeAsync(CancellationToken.None, action => action(), () => false).Result, "test API acknowledgement preserves the Shell submission result");
        assert(!DesktopNotificationDispatch.InvokeAsync(CancellationToken.None, _ => throw new ObjectDisposedException("UI dispatch"), () => true).Result, "disposed UI dispatch completes the request without a notification");
    }
}
