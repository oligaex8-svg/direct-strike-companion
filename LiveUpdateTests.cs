namespace DirectStrikeCompanion;

internal static class LiveUpdateTests
{
    public static void Run(Action<bool, string> assert)
    {
        var updates = new LiveUpdateSignal();
        var first = updates.WaitAfterAsync(0, CancellationToken.None);
        var second = updates.WaitAfterAsync(0, CancellationToken.None);
        assert(!first.IsCompleted && !second.IsCompleted, "live listeners await a real change without snapshot polling");
        updates.Pulse();
        assert(first.GetAwaiter().GetResult() == 1 && second.GetAwaiter().GetResult() == 1, "one live change wakes every connected dashboard");
        updates.Pulse();
        assert(updates.WaitAfterAsync(1, CancellationToken.None).GetAwaiter().GetResult() == 2, "a change during rendering is retained for the next subscription");
        using var cancel = new CancellationTokenSource();
        var cancelled = updates.WaitAfterAsync(2, cancel.Token);
        var survivor = updates.WaitAfterAsync(2, CancellationToken.None);
        cancel.Cancel();
        bool rejected = false;
        try { cancelled.GetAwaiter().GetResult(); } catch (OperationCanceledException) { rejected = true; }
        updates.Pulse();
        assert(rejected && survivor.GetAwaiter().GetResult() == 3, "closing one dashboard cancels only its own live wait");

        var directory = Path.Combine(Path.GetTempPath(), "dsc-live-update-" + Guid.NewGuid());
        try
        {
            var store = new Store(directory);
            int changes = 0; string? region = null; IReadOnlyList<string> names = [];
            var lobby = new LobbyService(store, (_, _, _) => { }, rosterChanged: (current, server) => { changes++; names = current; region = server; });
            var now = DateTime.UtcNow;
            lobby.ApplyScreenObservation("", true, now, ["Player"], [1], "EU");
            assert(changes == 1 && names.SequenceEqual(["Player"]) && region == "EU", "a detected lobby publishes its names and server directly to rating lookup");
            lobby.ApplyScreenObservation("", true, now.AddSeconds(1), ["Player"], [1], "EU");
            assert(changes == 1, "unchanged OCR observations cannot flood the rating queue");
            lobby.ApplyScreenObservation("", true, now.AddSeconds(2), ["Player", "Joined"], [1, 2], "EU");
            assert(changes == 2 && names.Count == 2, "joining players trigger lookup without waiting for dashboard polling");
            lobby.ApplyScreenObservation("", true, now.AddSeconds(3), ["Player", "Joined"], [1, 2], "Americas");
            assert(changes == 3 && region == "Americas", "a changed game region triggers a distinct lookup");
            long revision = updates.Version;
            store.Changed += updates.Pulse;
            store.NotifyChanged();
            assert(updates.Version == revision + 1, "intermediate site-cache publication wakes the dashboard immediately");
            revision = updates.Version;
            store.Save();
            assert(updates.Version == revision, "ordinary replay persistence cannot flood the live dashboard update stream");
            store.SetMark("2-S2-1-123", "Player", "Latest saved note", list: "losers");
            var saved = store.SetPlayerList("2-S2-1-123", "Player", "friends");
            assert(saved.List == "friends" && saved.Note == "Latest saved note", "list-only replay buttons preserve the latest server note without trusting stale dashboard text");
            store.SetMark("name:ваня кузьмич", "Ваня Кузьмич", "Keep this private note", list: "friends");
            var byName = store.SetPlayerList("name:ваня кузьмич", "Ваня Кузьмич", "losers");
            assert(byName.List == "losers" && byName.Name == "Ваня Кузьмич" && byName.Note == "Keep this private note",
                "live name-only list action preserves Unicode names and the latest durable private note");
            var reloaded = new Store(directory);
            assert(reloaded.Data.Marks[byName.Id].List == "losers"
                && reloaded.Data.Marks[byName.Id].Name == "Ваня Кузьмич"
                && reloaded.Data.Marks[byName.Id].Note == "Keep this private note"
                && reloaded.Data.Marks[saved.Id].List == "friends", "native and name-only quick lists persist independently across restart");
        }
        finally { Directory.Delete(directory, true); }
    }
}
