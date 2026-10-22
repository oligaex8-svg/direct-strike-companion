using Windows.Security.Authorization.AppCapabilityAccess;

namespace DirectStrikeCompanion;

// Pure eligibility checks only: never start native capture or touch a game window.
internal static class Sc2WindowCaptureTests
{
    internal static void Run(Action<bool, string> assert)
    {
        assert(Sc2WindowCapture.ValidSize(1920, 1080), "window capture accepts a normal rendered frame");
        foreach (var access in Enum.GetValues<AppCapabilityAccessStatus>())
        {
            bool rejected = false;
            try { Sc2WindowCapture.RequireBorderlessAccess(true, access); }
            catch (InvalidOperationException) { rejected = true; }
            assert(rejected == (access != AppCapabilityAccessStatus.Allowed), $"borderless capture accepts only granted permission ({access})");
        }
        bool unsupported = false;
        try { Sc2WindowCapture.RequireBorderlessAccess(false, AppCapabilityAccessStatus.Allowed); }
        catch (InvalidOperationException) { unsupported = true; }
        assert(unsupported, "unsupported borderless capture never falls back to a visible capture border");
        assert(Sc2WindowCapture.ValidSize(8000, 2500), "window capture accepts its exact dimension and pixel limits");
        assert(!Sc2WindowCapture.ValidSize(8001, 100), "window capture rejects an oversized frame axis");
        assert(!Sc2WindowCapture.ValidSize(5000, 4001), "window capture rejects frames above the memory pixel limit");
        assert(!Sc2WindowCapture.ValidSize(0, 1080) && !Sc2WindowCapture.ValidSize(1920, 99), "window capture rejects empty or unavailable frame sizes");
        assert(!Sc2WindowCapture.ValidSize(int.MaxValue, int.MaxValue), "window capture bounds checks cannot overflow on corrupt dimensions");

        var window = new Sc2WindowCapture.WindowState(123, 456, "SC2_x64", @"C:\Games\SC2\SC2_x64.exe", 987654321,
            true, false, -1920, 0, 0, 1080);
        assert(Sc2WindowCapture.SameWindow(window, window), "stable visible SC2 window is eligible on a negative-coordinate monitor");
        var x86 = window with { ProcessName = "SC2", Executable = @"C:\Games\SC2\SC2.exe" };
        assert(Sc2WindowCapture.SameWindow(x86, x86), "window capture also accepts verified 32-bit SC2");
        assert(!Sc2WindowCapture.SameWindow(window, window with { Handle = 124 }), "capture rejects a replaced game window");
        assert(!Sc2WindowCapture.SameWindow(window, window with { ProcessId = 457 }), "capture rejects a replaced game process");
        assert(!Sc2WindowCapture.SameWindow(window, window with { ProcessStartedAt = 987654322 }), "capture rejects process ID reuse");
        assert(!Sc2WindowCapture.SameWindow(window, window with { Left = -1910, Right = 10 }), "capture rejects a moved window even when its dimensions remain identical");
        assert(!Sc2WindowCapture.SameWindow(window, window with { Bottom = 1090 }), "capture rejects resizing during frame conversion");
        var minimized = window with { Minimized = true };
        var hidden = window with { Visible = false };
        assert(!Sc2WindowCapture.SameWindow(minimized, minimized), "minimized game has no eligible rendered capture");
        assert(!Sc2WindowCapture.SameWindow(hidden, hidden), "hidden game has no eligible rendered capture");
        var wrongExe = window with { Executable = @"C:\Games\Other.exe" };
        assert(!Sc2WindowCapture.SameWindow(wrongExe, wrongExe), "SC2 process name alone cannot authorize capture of a different executable");
        var other = window with { ProcessName = "Other", Executable = @"C:\Games\Other.exe" };
        assert(!Sc2WindowCapture.SameWindow(other, other), "window capture refuses non-SC2 clients");
        var huge = window with { Left = int.MinValue, Right = int.MaxValue };
        assert(!Sc2WindowCapture.SameWindow(huge, huge), "window capture rejects corrupt desktop bounds without arithmetic overflow");
        var noWindow = window with { Handle = 0 };
        assert(!Sc2WindowCapture.SameWindow(noWindow, noWindow), "window capture requires a real window identity");

        using var canceled = new CancellationTokenSource();
        canceled.Cancel();
        bool stopped = false;
        try { Sc2WindowCapture.CaptureAsync(IntPtr.Zero, canceled.Token).GetAwaiter().GetResult(); }
        catch (OperationCanceledException) { stopped = true; }
        assert(stopped, "expired capture deadline stops before any native window access");
    }
}
