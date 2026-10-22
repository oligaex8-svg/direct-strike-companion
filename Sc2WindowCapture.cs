using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Windows.Foundation.Metadata;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using Windows.Security.Authorization.AppCapabilityAccess;

namespace DirectStrikeCompanion;

// One bounded capture runs in the OCR child tree. Only a verified SC2 HWND is
// accepted; no desktop pixels, input or foreground changes are involved.
internal static class Sc2WindowCapture
{
    internal static byte[] CaptureForInput(IntPtr window)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        return Task.Run(() =>
        {
            Marshal.ThrowExceptionForHR(RoInitialize(1));
            try { return CaptureAsync(window, deadline.Token).GetAwaiter().GetResult(); }
            finally { RoUninitialize(); }
        }).GetAwaiter().GetResult();
    }
    internal static void Run(string[] args)
    {
        try
        {
            var index = Array.IndexOf(args, "--capture-sc2-window");
            if (index < 0 || index + 1 >= args.Length || !long.TryParse(args[index + 1], out var value) || value <= 0)
                throw new ArgumentException("An SC2 window is required.");
            SetProcessDPIAware();
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            // Main is STA for the dashboard. Keep the free-threaded capture on an
            // explicitly initialized MTA, and balance initialization on that thread.
            var image = Task.Run(() =>
            {
                Marshal.ThrowExceptionForHR(RoInitialize(1));
                try { return CaptureAsync(new IntPtr(value), deadline.Token).GetAwaiter().GetResult(); }
                finally { RoUninitialize(); }
            }).GetAwaiter().GetResult();
            Console.WriteLine(JsonSerializer.Serialize(new { success = true, borderless = true, imageBase64 = Convert.ToBase64String(image) }));
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex is OperationCanceledException ? "SC2 is not supplying a rendered frame; the last lobby is retained." : ex.Message }));
        }
    }

    internal static async Task<byte[]> CaptureAsync(IntPtr window, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var before = ReadWindow(window);
        RequireSameWindow(before, before);
        if (!GraphicsCaptureSession.IsSupported()) throw new NotSupportedException("Windows window capture is unavailable.");
        // Request the supported borderless mode before creating any capture.
        // A denied/unsupported request must never fall back to a flashing border.
        var borderlessSupported = ApiInformation.IsPropertyPresent("Windows.Graphics.Capture.GraphicsCaptureSession", "IsBorderRequired")
            && ApiInformation.IsTypePresent("Windows.Graphics.Capture.GraphicsCaptureAccess");
        if (!borderlessSupported) throw new NotSupportedException("Background reading without a capture border is unavailable on this Windows version; the last lobby is retained.");
        var access = await GraphicsCaptureAccess.RequestAccessAsync(GraphicsCaptureAccessKind.Borderless).AsTask(token).ConfigureAwait(false);
        RequireBorderlessAccess(borderlessSupported, access);
        token.ThrowIfCancellationRequested();
        RequireSameWindow(before, ReadWindow(window));
        var item = CreateCaptureItem(window);
        if (!ValidSize(item.Size.Width, item.Size.Height)) throw new InvalidOperationException("SC2 capture dimensions unavailable.");
        token.ThrowIfCancellationRequested();
        using var device = CreateDevice();
        using var pool = Direct3D11CaptureFramePool.CreateFreeThreaded(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 1, item.Size);
        using var session = pool.CreateCaptureSession(item);
        session.IsCursorCaptureEnabled = false;
        session.IsBorderRequired = false;
        if (session.IsBorderRequired) throw new InvalidOperationException("Windows did not enable reading without a capture border; the last lobby is retained.");
        session.StartCapture();
        Direct3D11CaptureFrame? frame = null;
        try
        {
            while (frame is null)
            {
                token.ThrowIfCancellationRequested();
                frame = pool.TryGetNextFrame();
                if (frame is null) await Task.Delay(30, token).ConfigureAwait(false);
            }
            if (!ValidSize(frame.ContentSize.Width, frame.ContentSize.Height)
                || frame.ContentSize.Width != item.Size.Width || frame.ContentSize.Height != item.Size.Height)
                throw new InvalidOperationException("SC2 capture resized; waiting for the next observation.");
            RequireSameWindow(before, ReadWindow(window));
            using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface, BitmapAlphaMode.Ignore).AsTask(token).ConfigureAwait(false);
            if (bitmap.PixelWidth != frame.ContentSize.Width || bitmap.PixelHeight != frame.ContentSize.Height)
                throw new InvalidOperationException("SC2 capture surface resized; waiting for the next observation.");
            using var stream = new InMemoryRandomAccessStream();
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream).AsTask(token).ConfigureAwait(false);
            encoder.SetSoftwareBitmap(bitmap);
            await encoder.FlushAsync().AsTask(token).ConfigureAwait(false);
            if (stream.Size is < 1 or > 20 * 1024 * 1024) throw new InvalidOperationException("SC2 capture exceeded its size limit.");
            using var reader = new DataReader(stream.GetInputStreamAt(0));
            var loaded = await reader.LoadAsync((uint)stream.Size).AsTask(token).ConfigureAwait(false);
            if (loaded != stream.Size) throw new InvalidOperationException("SC2 capture image could not be read completely.");
            var bytes = new byte[(int)stream.Size];
            reader.ReadBytes(bytes);
            token.ThrowIfCancellationRequested();
            RequireSameWindow(before, ReadWindow(window));
            return bytes;
        }
        finally { frame?.Dispose(); }
    }

    internal static bool ValidSize(int width, int height) => width is >= 100 and <= 8000 && height is >= 100 and <= 8000 && (long)width * height <= 20_000_000;

    internal static void RequireBorderlessAccess(bool supported, AppCapabilityAccessStatus access)
    {
        if (!supported || access != AppCapabilityAccessStatus.Allowed)
            throw new InvalidOperationException("Windows has not allowed background reading without a capture border; the last lobby is retained.");
    }

    internal readonly record struct WindowState(long Handle, uint ProcessId, string ProcessName, string Executable,
        long ProcessStartedAt, bool Visible, bool Minimized, int Left, int Top, int Right, int Bottom);

    internal static bool SameWindow(WindowState before, WindowState after) => before == after
        && before.Handle > 0 && before.ProcessId > 0 && Sc2Automation.IsSc2(before.ProcessName)
        && string.Equals(Path.GetFileName(before.Executable), before.ProcessName + ".exe", StringComparison.OrdinalIgnoreCase)
        && before.ProcessStartedAt > 0 && before.Visible && !before.Minimized
        && (long)before.Right - before.Left is >= 100 and <= 8000
        && (long)before.Bottom - before.Top is >= 100 and <= 8000
        && ((long)before.Right - before.Left) * ((long)before.Bottom - before.Top) <= 20_000_000;

    private static void RequireSameWindow(WindowState before, WindowState after)
    {
        if (!SameWindow(before, after)) throw new InvalidOperationException("SC2 window changed or is not supplying a visible rendered frame; the last lobby is retained.");
    }

    private static WindowState ReadWindow(IntPtr window)
    {
        if (!IsWindow(window) || GetWindowThreadProcessId(window, out var pid) == 0 || pid == 0
            || !GetWindowRect(window, out var bounds)) throw new InvalidOperationException("SC2 window identity changed.");
        using var process = Process.GetProcessById(checked((int)pid));
        if (process.MainWindowHandle != window || !Sc2Automation.IsSc2(process.ProcessName))
            throw new InvalidOperationException("SC2 window identity changed.");
        return new(window.ToInt64(), pid, process.ProcessName, process.MainModule?.FileName ?? "", process.StartTime.ToUniversalTime().Ticks,
            IsWindowVisible(window), IsIconic(window), bounds.Left, bounds.Top, bounds.Right, bounds.Bottom);
    }

    private static GraphicsCaptureItem CreateCaptureItem(IntPtr window)
    {
        // IGraphicsCaptureItemInterop is a native IUnknown factory interface.
        // The SDK projection exposes FromAbi, but no GraphicsCaptureItemInterop helper.
        IntPtr className = IntPtr.Zero, factory = IntPtr.Zero, item = IntPtr.Zero;
        try
        {
            const string captureClass = "Windows.Graphics.Capture.GraphicsCaptureItem";
            Marshal.ThrowExceptionForHR(WindowsCreateString(captureClass, (uint)captureClass.Length, out className));
            var factoryId = new Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");
            Marshal.ThrowExceptionForHR(RoGetActivationFactory(className, ref factoryId, out factory));
            if (factory == IntPtr.Zero) throw new InvalidOperationException("Windows window capture factory is unavailable.");
            var create = Marshal.GetDelegateForFunctionPointer<CreateForWindow>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(factory), 3 * IntPtr.Size));
            var itemId = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
            Marshal.ThrowExceptionForHR(create(factory, window, ref itemId, out item));
            if (item == IntPtr.Zero) throw new InvalidOperationException("SC2 window capture is unavailable.");
            return GraphicsCaptureItem.FromAbi(item);
        }
        finally
        {
            if (item != IntPtr.Zero) Marshal.Release(item);
            if (factory != IntPtr.Zero) Marshal.Release(factory);
            if (className != IntPtr.Zero) WindowsDeleteString(className);
        }
    }

    private static IDirect3DDevice CreateDevice()
    {
        IntPtr native = IntPtr.Zero, context = IntPtr.Zero, dxgi = IntPtr.Zero, inspectable = IntPtr.Zero;
        try
        {
            Marshal.ThrowExceptionForHR(D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out native, out _, out context));
            var iid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(native, ref iid, out dxgi));
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out inspectable));
            return WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(inspectable);
        }
        finally
        {
            foreach (var pointer in new[] { inspectable, dxgi, context, native }) if (pointer != IntPtr.Zero) Marshal.Release(pointer);
        }
    }

    [DllImport("d3d11.dll")] private static extern int D3D11CreateDevice(IntPtr adapter, uint driverType, IntPtr software, uint flags, IntPtr levels, uint levelCount, uint sdkVersion, out IntPtr device, out uint level, out IntPtr context);
    [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr device);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int CreateForWindow(IntPtr factory, IntPtr window, ref Guid iid, out IntPtr item);
    [DllImport("combase.dll", ExactSpelling = true)] private static extern int RoInitialize(uint type);
    [DllImport("combase.dll", ExactSpelling = true)] private static extern void RoUninitialize();
    [DllImport("combase.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int WindowsCreateString(string value, uint length, out IntPtr text);
    [DllImport("combase.dll", ExactSpelling = true)] private static extern int WindowsDeleteString(IntPtr text);
    [DllImport("combase.dll", ExactSpelling = true)] private static extern int RoGetActivationFactory(IntPtr className, ref Guid iid, out IntPtr factory);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
}
