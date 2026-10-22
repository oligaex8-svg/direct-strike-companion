namespace DirectStrikeCompanion;

internal static class AppBranding
{
    internal const string Name = "Direct Strike Companion";
    internal const string AppId = "DirectStrike.Companion.Desktop";

    internal static void ApplyWindowsIdentity() => SetCurrentProcessExplicitAppUserModelID(AppId);

    [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

    internal static Icon LoadIcon()
    {
        using var stream = typeof(AppBranding).Assembly.GetManifestResourceStream("DscBrand:companion.ico")
            ?? throw new InvalidDataException("The application icon is not bundled.");
        using var icon = new Icon(stream);
        return (Icon)icon.Clone();
    }
}
