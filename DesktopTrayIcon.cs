using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DirectStrikeCompanion;

// Owns the HWND and HICONs used by the Shell; the caller owns the menu.
internal sealed class DesktopTrayIcon : NativeWindow, IDisposable
{
    internal const uint IconId = 1;
    internal const uint CallbackMessage = 0x8001;
    internal const uint NifInfo = 0x10;
    internal const uint NotificationFlags = 0x04 | 0x20 | 0x10; // USER | LARGE_ICON | NOSOUND
    internal const uint WmLeftDoubleClick = 0x0203;
    internal const uint WmContextMenu = 0x007B;
    internal const uint NinSelect = 0x0400;
    internal const uint NinKeySelect = 0x0401;
    internal const uint NinBalloonUserClick = 0x0405;
    private const uint NimAdd = 0, NimModify = 1, NimDelete = 2, NimSetFocus = 3, NimSetVersion = 4;
    private readonly int uiThread = Environment.CurrentManagedThreadId;
    private readonly ContextMenuStrip menu;
    private readonly Icon trayIcon;
    private readonly Icon balloonIcon;
    private readonly string text;
    private readonly uint taskbarCreated;
    private bool registered;
    private bool disposed;
    private long? lastActivation;

    internal event EventHandler? OpenRequested;
    internal event EventHandler? NotificationClicked;

    internal DesktopTrayIcon(Icon icon, ContextMenuStrip menu, string text)
    {
        ArgumentNullException.ThrowIfNull(icon);
        ArgumentNullException.ThrowIfNull(menu);
        if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA)
            throw new InvalidOperationException("Create the tray icon on the Windows Forms UI thread.");
        this.menu = menu;
        this.text = BoundText(text, 127);
        trayIcon = CopyIcon(icon, SystemInformation.SmallIconSize);
        try { balloonIcon = CopyIcon(icon, SystemInformation.IconSize); }
        catch { trayIcon.Dispose(); throw; }
        try
        {
            taskbarCreated = RegisterWindowMessage("TaskbarCreated");
            // A hidden top-level window, rather than a message-only HWND, receives Explorer's broadcast.
            CreateHandle(new CreateParams { Caption = AppBranding.Name, Style = 0 });
            SendMessage(Handle, 0x0080, new IntPtr(0), trayIcon.Handle); // WM_SETICON / ICON_SMALL
            SendMessage(Handle, 0x0080, new IntPtr(1), balloonIcon.Handle); // WM_SETICON / ICON_BIG
            menu.Closed += MenuClosed;
            AddIcon();
        }
        catch
        {
            menu.Closed -= MenuClosed;
            if (Handle != IntPtr.Zero) DestroyHandle();
            balloonIcon.Dispose();
            trayIcon.Dispose();
            throw;
        }
    }

    private static Icon CopyIcon(Icon source, Size size)
    {
        using var sized = new Icon(source, size);
        if (sized.Size == size) return (Icon)sized.Clone();
        // Icon's size constructor selects a resource frame; it cannot resize a single-frame ICO.
        using var original = sized.ToBitmap();
        using var bitmap = new Bitmap(original, size);
        var handle = bitmap.GetHicon();
        try
        {
            using var borrowed = Icon.FromHandle(handle);
            return (Icon)borrowed.Clone();
        }
        finally { DestroyIcon(handle); }
    }

    private void AddIcon()
    {
        if (disposed || registered) return;
        var data = CreateData(Handle, trayIcon.Handle, text);
        data.Flags = 0x01 | 0x02 | 0x04 | 0x80; // MESSAGE | ICON | TIP | SHOWTIP
        if (!ShellNotifyIcon(NimAdd, ref data)) return;
        data.TimeoutOrVersion = 4;
        if (ShellNotifyIcon(NimSetVersion, ref data)) registered = true;
        else ShellNotifyIcon(NimDelete, ref data); // Never silently fall back to old callback packing.
    }

    // Shell acceptance does not guarantee presentation; Windows owns notification timing and policy.
    internal bool ShowNotification(string title, string body)
    {
        if (disposed || Environment.CurrentManagedThreadId != uiThread) return false;
        AddIcon();
        if (!registered) return false;
        var data = CreateNotificationData(Handle, trayIcon.Handle, balloonIcon.Handle, title, body);
        return ShellNotifyIcon(NimModify, ref data);
    }

    protected override void WndProc(ref Message message)
    {
        if (!disposed && taskbarCreated != 0 && (uint)message.Msg == taskbarCreated)
        {
            registered = false;
            AddIcon();
        }
        else if (!disposed && (uint)message.Msg == CallbackMessage)
        {
            var callback = DecodeCallback(message.WParam, message.LParam);
            if (callback.IconId == IconId)
            {
                switch (callback.Event)
                {
                    case WmLeftDoubleClick:
                    case NinSelect:
                    case NinKeySelect:
                        // Selection and double-click can describe the same mouse action.
                        // Handle Enter after mouse selection too, without opening duplicate tabs.
                        var now = Environment.TickCount64;
                        if (ActivationIsFresh(now, lastActivation, SystemInformation.DoubleClickTime))
                        {
                            lastActivation = now;
                            OpenRequested?.Invoke(this, EventArgs.Empty);
                        }
                        break;
                    case NinBalloonUserClick:
                        NotificationClicked?.Invoke(this, EventArgs.Empty);
                        OpenRequested?.Invoke(this, EventArgs.Empty);
                        break;
                    case WmContextMenu:
                        ShowMenu();
                        break;
                }
            }
        }
        base.WndProc(ref message);
    }

    private void ShowMenu()
    {
        if (menu.IsDisposed || menu.Visible) return;
        var position = Cursor.Position;
        var identity = new NotifyIconIdentifier { Size = (uint)Marshal.SizeOf<NotifyIconIdentifier>(), Window = Handle, Id = IconId };
        // WM_CONTEXTMENU's v4 wParam is undefined. The icon rectangle also supports keyboard invocation.
        if (ShellNotifyIconGetRect(ref identity, out var rectangle) == 0)
            position = new Point(rectangle.Left, rectangle.Bottom);
        // Win32's notification-area menu practice: foreground only our own hidden owner for dismissal.
        SetForegroundWindow(Handle);
        menu.Show(position);
        PostMessage(Handle, 0, IntPtr.Zero, IntPtr.Zero);
    }

    private void MenuClosed(object? sender, ToolStripDropDownClosedEventArgs args)
    {
        if (disposed) return;
        PostMessage(Handle, 0, IntPtr.Zero, IntPtr.Zero);
        if (registered)
        {
            var data = CreateData(Handle, trayIcon.Handle, text);
            ShellNotifyIcon(NimSetFocus, ref data);
        }
    }

    public void Dispose()
    {
        if (disposed) return;
        if (Environment.CurrentManagedThreadId != uiThread)
            throw new InvalidOperationException("Dispose the tray icon on its Windows Forms UI thread.");
        disposed = true;
        menu.Closed -= MenuClosed;
        if (!menu.IsDisposed && menu.Visible) menu.Close();
        if (Handle != IntPtr.Zero)
        {
            var data = CreateData(Handle, trayIcon.Handle, text);
            ShellNotifyIcon(NimDelete, ref data);
            registered = false;
            DestroyHandle();
        }
        balloonIcon.Dispose();
        trayIcon.Dispose();
        GC.SuppressFinalize(this);
    }

    internal static NotifyIconData CreateData(IntPtr window, IntPtr icon, string text) => new()
    {
        Size = (uint)Marshal.SizeOf<NotifyIconData>(), Window = window, Id = IconId,
        CallbackMessage = CallbackMessage, Icon = icon, Tip = BoundText(text, 127), Info = "", InfoTitle = ""
    };

    internal static NotifyIconData CreateNotificationData(IntPtr window, IntPtr icon, IntPtr balloon, string title, string body)
    {
        var data = CreateData(window, icon, "");
        data.Flags = NifInfo;
        data.InfoTitle = BoundText(title, 63);
        data.Info = BoundText(body, 255);
        data.InfoFlags = NotificationFlags;
        data.BalloonIcon = balloon;
        return data;
    }

    internal static string BoundText(string? value, int maximum)
    {
        value ??= "";
        var nullAt = value.IndexOf('\0');
        var length = Math.Min(nullAt < 0 ? value.Length : nullAt, maximum);
        if (length > 0 && length < value.Length && char.IsHighSurrogate(value[length - 1]) && char.IsLowSurrogate(value[length])) length--;
        return value[..length];
    }

    internal static (uint Event, uint IconId, Point Anchor) DecodeCallback(IntPtr wParam, IntPtr lParam)
    {
        var packedEvent = unchecked((uint)lParam.ToInt64());
        var packedPoint = unchecked((uint)wParam.ToInt64());
        return (packedEvent & 0xffff, (packedEvent >> 16) & 0xffff,
            new Point(unchecked((short)(packedPoint & 0xffff)), unchecked((short)(packedPoint >> 16))));
    }

    internal static bool ActivationIsFresh(long now, long? previous, int interval) =>
        previous is null || now - previous.Value > interval;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct NotifyIconData
    {
        internal uint Size;
        internal IntPtr Window;
        internal uint Id;
        internal uint Flags;
        internal uint CallbackMessage;
        internal IntPtr Icon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] internal string Tip;
        internal uint State;
        internal uint StateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] internal string Info;
        internal uint TimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] internal string InfoTitle;
        internal uint InfoFlags;
        internal Guid Guid;
        internal IntPtr BalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NotifyIconIdentifier
    {
        internal uint Size;
        internal IntPtr Window;
        internal uint Id;
        internal Guid Guid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { internal int Left, Top, Right, Bottom; }

    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShellNotifyIcon(uint message, ref NotifyIconData data);
    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconGetRect")]
    private static extern int ShellNotifyIconGetRect(ref NotifyIconIdentifier identity, out NativeRect rectangle);
    [DllImport("user32.dll", EntryPoint = "RegisterWindowMessageW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint RegisterWindowMessage(string message);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "PostMessageW", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll", EntryPoint = "SendMessageW", ExactSpelling = true)]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
