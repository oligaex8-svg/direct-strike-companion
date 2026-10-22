using System.Drawing;
using System.Runtime.InteropServices;

namespace DirectStrikeCompanion;

internal static class DesktopTrayIconTests
{
    internal static void Run(Action<bool, string> assert)
    {
        var expectedSize = IntPtr.Size == 8 ? 976 : 956;
        assert(Marshal.SizeOf<DesktopTrayIcon.NotifyIconData>() == expectedSize, "native Unicode NOTIFYICONDATA has the complete platform layout");
        assert(Marshal.OffsetOf<DesktopTrayIcon.NotifyIconData>(nameof(DesktopTrayIcon.NotifyIconData.BalloonIcon)).ToInt64() == (IntPtr.Size == 8 ? 968 : 952), "custom balloon HICON occupies the final native field");
        var data = DesktopTrayIcon.CreateNotificationData(new IntPtr(123), new IntPtr(456), new IntPtr(789), "Alert", "Body");
        assert(data.Size == expectedSize && data.Window == new IntPtr(123) && data.Id == DesktopTrayIcon.IconId && data.Id <= ushort.MaxValue, "notification targets our HWND and stable v4-compatible icon ID");
        assert(data.Flags == DesktopTrayIcon.NifInfo && data.InfoFlags == 0x34, "every native balloon requests custom large icon and explicitly suppresses Shell sound");
        assert(data.Icon == new IntPtr(456) && data.BalloonIcon == new IntPtr(789) && data.InfoTitle == "Alert" && data.Info == "Body", "tray and custom balloon icon handles remain distinct");
        var bounded = DesktopTrayIcon.CreateNotificationData(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, new string('t', 64), new string('b', 256));
        assert(bounded.InfoTitle.Length == 63 && bounded.Info.Length == 255, "notification text leaves room for both native null terminators");
        assert(DesktopTrayIcon.BoundText(new string('t', 62) + "\U0001F514", 63).Length == 62, "title truncation never cuts a surrogate pair");
        assert(DesktopTrayIcon.BoundText(new string('b', 254) + "\U0001F514", 255).Length == 254, "body truncation never cuts a surrogate pair");
        assert(DesktopTrayIcon.BoundText("A\U0001F514", 3) == "A\U0001F514" && DesktopTrayIcon.BoundText("A\0ignored", 63) == "A" && DesktopTrayIcon.BoundText(null, 63) == "", "bounded native text preserves complete Unicode and safely handles nulls");
        var callback = DesktopTrayIcon.DecodeCallback(new IntPtr(unchecked((int)0xfff6ffec)), new IntPtr(unchecked((int)0x00010401)));
        assert(callback.Event == DesktopTrayIcon.NinKeySelect && callback.IconId == DesktopTrayIcon.IconId && callback.Anchor == new Point(-20, -10), "v4 callback decodes high-word icon ID and signed multi-monitor coordinates");
        var other = DesktopTrayIcon.DecodeCallback(IntPtr.Zero, new IntPtr(unchecked((int)0xffff0203)));
        assert(other.Event == DesktopTrayIcon.WmLeftDoubleClick && other.IconId == ushort.MaxValue, "v4 callback permits the complete unsigned 16-bit icon ID");
        assert(DesktopTrayIcon.DecodeCallback(IntPtr.Zero, new IntPtr(0x00010400)).Event == DesktopTrayIcon.NinSelect, "mouse-selected icon activated with Enter reaches the supported selection callback");
        assert(DesktopTrayIcon.ActivationIsFresh(100, null, 500) && !DesktopTrayIcon.ActivationIsFresh(200, 100, 500) && DesktopTrayIcon.ActivationIsFresh(601, 100, 500), "tray activation suppresses duplicate selection and double-click events without blocking later actions");
        // Pure data checks: never create an HWND, call Shell_NotifyIcon or show desktop notifications here.
    }
}
