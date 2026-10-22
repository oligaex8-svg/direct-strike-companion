namespace DirectStrikeCompanion;

internal static class UiText
{
    internal static string OpenDashboard(string language) => language == "ru" ? "Открыть панель" : "Open dashboard";
    internal static string TestNotification(string language) => language == "ru" ? "Проверить уведомление" : "Test notification";
    internal static string Exit(string language) => language == "ru" ? "Выход" : "Exit";
    internal static string NotificationTestTitle(string language) => language == "ru" ? "Проверка уведомления" : "Test notification";
    internal static string AcceptNeededTitle(string language) => language == "ru" ? "Direct Strike · требуется принятие" : "Direct Strike · accept needed";
    internal static string AcceptNeededMessage(string language) => language == "ru" ? "Приглашение или матч SC2 готов. Откройте SC2 для принятия." : "An SC2 invite or match is ready. Open SC2 to accept.";
    internal static string NotificationUnavailable(string language) => language == "ru" ? "Windows не смогла принять уведомление. Попробуйте ещё раз." : "Windows could not receive this alert. Try again.";
    internal static string SoundDescription(string language, string preset, int volume, bool enabled, string? customName = null)
    {
        NotificationSounds.Validate(preset, volume);
        if (!enabled) return language == "ru" ? "Звук выключен" : "Sound is off";
        if (volume == 0) return language == "ru" ? "Без звука · громкость 0%" : "Silent · volume 0%";
        var style = (language == "ru", preset) switch
        {
            (true, "soft") => "Мягкий перезвон", (true, "clear") => "Звонкий колокольчик", (true, "classic") => "Классические сигналы",
            (true, "terran") => "Связь терранов", (true, "protoss") => "Перезвон протоссов", (true, "zerg") => "Пульс зергов",
            (true, "orbital") => "Орбитальный сигнал", (true, "warp") => "Прибытие через варп", (true, "ready") => "Готовность к бою",
            (false, "soft") => "Soft chime", (false, "clear") => "Clear bell", (false, "classic") => "Classic tones",
            (false, "terran") => "Terran comms", (false, "protoss") => "Protoss chime", (false, "zerg") => "Zerg pulse",
            (false, "orbital") => "Orbital signal", (false, "warp") => "Warp arrival", _ => "Battle ready"
        };
        if (Sc2SoundClips.Labels.TryGetValue(preset, out var voice)) style = language == "ru" ? voice.Ru : voice.En;
        if (customName != null) style = (language == "ru" ? "Свой WAV: " : "Custom WAV: ") + customName;
        return language == "ru" ? $"{style} · громкость {volume}%" : $"{style} · volume {volume}%";
    }
    internal static string DesktopTest(string language, string preset, int volume, bool enabled, string? customName = null) =>
        SoundDescription(language, preset, volume, enabled, customName) + "\n" + (language == "ru"
            ? "Настройте уведомления в «Текущем лобби»." : "Manage alerts in Live lobby.");
    internal static string MarkedPlayerTitle(string language) => language == "ru" ? "Отмеченный игрок в группе" : "Marked player in your group";
    internal static string MarkedPlayerMessage(string language, string message)
    {
        const string prefix = "Marked name detected: ";
        const string suffix = ". Confirm the player and team.";
        if (!message.StartsWith(prefix, StringComparison.Ordinal) || !message.EndsWith(suffix, StringComparison.Ordinal) || message.Length < prefix.Length + suffix.Length) return message;
        // Only LobbyService's known wrapper changes; the player-name slice stays verbatim.
        var names = message.Substring(prefix.Length, message.Length - prefix.Length - suffix.Length);
        return names + "\n" + (language == "ru" ? "Подтвердите игрока и команду." : "Confirm the player and team.");
    }
}
