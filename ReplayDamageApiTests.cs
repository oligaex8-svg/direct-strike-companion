using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;

namespace DirectStrikeCompanion;

// Independent loopback server for the protocol contract; no SC2 installation required.
internal static class ReplayDamageApiTests
{
    internal static void Run(Action<bool, string> assert)
    {
        RunCore().GetAwaiter().GetResult();
        InvalidResponse([.. Message(19, []), .. UInt(97, 2), .. UInt(99, 5), .. Text(98, "test error")],
            "requestField=19, expectedId=1, receivedId=2, status=5, errors=test error").GetAwaiter().GetResult();
        InvalidResponse([0x9a, 0x01, 0x00, 0x88, 0x06, 0x80]).GetAwaiter().GetResult();
        InterruptedTransport().GetAwaiter().GetResult();
        assert(true, "SC2 API loopback wire, final-only damage, presence and malformed response checks");
    }

    private static void Check(bool condition, string name)
    {
        if (!condition) throw new Exception("SC2 API test failed: " + name);
    }

    private static async Task RunCore()
    {
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var listener = CreateListener(out var uri);
        var server = Task.Run(async () =>
        {
            var context = await listener.GetContextAsync().WaitAsync(cancel.Token);
            using var socket = (await context.AcceptWebSocketAsync(null)).WebSocket;
            int observations = 0;
            while (true)
            {
                using var request = new MemoryStream();
                var buffer = new byte[4096];
                WebSocketReceiveResult received;
                do
                {
                    received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancel.Token);
                    request.Write(buffer, 0, received.Count);
                } while (!received.EndOfMessage);
                var (field, id, body) = ParseRequest(request.ToArray());
                if (field == 8) break; // Quit has no response.
                byte[] answer = field switch
                {
                    19 => [.. Text(1, "v"), .. Text(2, "data"), .. UInt(4, 98310)],
                    16 => [.. Message(3, Message(1, [.. UInt(1, 3), .. UInt(2, 1), .. Text(6, "test")])),
                           .. UInt(4, 100), .. UInt(8, 98310), .. Text(11, "data")],
                    4 => [],
                    10 => Sample((uint)++observations, observations == 4 ? 4u : 3u, observations != 3),
                    12 => [],
                    _ => throw new Exception("Unexpected request")
                };
                if (field == 4) Check(body.Contains((byte)0x1a), "start options present");
                uint status = field == 10 && observations > 1 ? 5u : 4u;
                byte[] response = [.. Message(field, answer), .. UInt(97, id), .. UInt(99, status),
                                   .. (field == 19 ? Text(98, "warning") : [])];
                int split = response.Length / 2;
                await socket.SendAsync(response.AsMemory(0, split), WebSocketMessageType.Binary, false, cancel.Token);
                await socket.SendAsync(response.AsMemory(split), WebSocketMessageType.Binary, true, cancel.Token);
            }
        });
        await using var api = await ReplayDamageApi.ConnectAsync(uri, cancel.Token);
        var ping = await api.PingAsync(cancel.Token);
        Check(ping.BaseBuild == 98310 && ping.DataVersion == "data", "ping and warning");
        var info = await api.ReplayInfoAsync("fixture", cancel.Token);
        Check(info.Players.Single().PlayerId == 3 && info.Players.Single().Name == "test" && info.DurationLoops == 100, "replay info");
        await api.StartReplayAsync("fixture", 3, cancel.Token);
        var unfinished = await api.ObserveAsync(cancel.Token);
        Check(unfinished.Status == 4 && unfinished.DamageDealt is null && unfinished.DamageTaken is null, "unfinished damage withheld");
        await api.StepAsync(2240, cancel.Token);
        var final = await api.ObserveAsync(cancel.Token);
        Check(final.Status == 5 && Math.Abs(final.DamageDealt!.Value - 1782.7588) < .001 &&
            Math.Abs(final.DamageTaken!.Value - 1265.0938) < .001, "final cumulative totals");
        var missing = await api.ObserveAsync(cancel.Token);
        Check(missing.DamageDealt is null && missing.DamageTaken is not null, "missing shield versus explicit zero");
        var wrongPlayer = await api.ObserveAsync(cancel.Token);
        Check(wrongPlayer.PlayerId == 4 && wrongPlayer.DamageDealt is null && wrongPlayer.DamageTaken is null, "wrong player withheld");
        await api.QuitAsync(cancel.Token);
        await server.WaitAsync(cancel.Token);
    }

    private static async Task InterruptedTransport()
    {
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var listener = CreateListener(out var uri);
        var server = Task.Run(async () =>
        {
            var context = await listener.GetContextAsync().WaitAsync(cancel.Token);
            using var socket = (await context.AcceptWebSocketAsync(null)).WebSocket;
            var buffer = new byte[1024];
            for (int step = 0; step < 3; step++)
            {
                var received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancel.Token);
                var (field, id, _) = ParseRequest(buffer[..received.Count]);
                if (step == 2) { socket.Abort(); return; }
                byte[] body = field == 10 ? Sample(123, 3, true) : [];
                byte[] response = [.. Message(field, body), .. UInt(97, id), .. UInt(99, 4)];
                await socket.SendAsync(response, WebSocketMessageType.Binary, true, cancel.Token);
            }
        });
        await using var api = await ReplayDamageApi.ConnectAsync(uri, cancel.Token);
        await api.StartReplayAsync("fixture", 3, cancel.Token);
        var sample = await api.ObserveAsync(cancel.Token);
        Check(sample.Loop == 123, "valid loop observed before interruption");
        try { await api.StepAsync(2240, cancel.Token); throw new Exception("Interrupted transport was accepted"); }
        catch (IOException ex)
        {
            Check(ex.Message.Contains("requestField=12, requestId=3, startedPlayerId=3, lastValidLoop=123", StringComparison.Ordinal),
                "transport diagnostic retains request, player and last valid loop");
            Check(ex.InnerException != null, "transport diagnostic retains original cause");
        }
        await server.WaitAsync(cancel.Token);
    }

    private static async Task InvalidResponse(byte[] response, string? expectedMessage = null)
    {
        using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var listener = CreateListener(out var uri);
        var server = Task.Run(async () =>
        {
            var context = await listener.GetContextAsync().WaitAsync(cancel.Token);
            using var socket = (await context.AcceptWebSocketAsync(null)).WebSocket;
            await socket.ReceiveAsync(new ArraySegment<byte>(new byte[1024]), cancel.Token);
            await socket.SendAsync(response, WebSocketMessageType.Binary, true, cancel.Token);
        });
        await using var api = await ReplayDamageApi.ConnectAsync(uri, cancel.Token);
        try { await api.PingAsync(cancel.Token); throw new Exception("Malformed or mismatched SC2 response was accepted"); }
        catch (InvalidDataException ex)
        {
            if (expectedMessage != null) Check(ex.Message.Contains(expectedMessage, StringComparison.Ordinal), "mismatch diagnostic");
        }
        await server.WaitAsync(cancel.Token);
    }

    private static HttpListener CreateListener(out Uri uri)
    {
        var tcp = new TcpListener(IPAddress.Loopback, 0);
        tcp.Start();
        int port = ((IPEndPoint)tcp.LocalEndpoint).Port;
        tcp.Stop();
        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        uri = new Uri($"ws://127.0.0.1:{port}/sc2api");
        return listener;
    }

    private static byte[] Sample(uint loop, uint player, bool shields)
    {
        byte[] dealt = [.. Float(1, 1283.7588f), .. (shields ? Float(2, 499) : [])];
        byte[] taken = [.. Float(1, 1265.0938f), .. Float(2, 0)];
        byte[] score = Message(8, [.. Message(24, dealt), .. Message(25, taken)]);
        return Message(3, [.. UInt(9, loop), .. Message(1, UInt(1, player)), .. Message(4, score)]);
    }

    private static (int Field, uint Id, byte[] Body) ParseRequest(byte[] bytes)
    {
        int position = 0, field = 0;
        uint id = 0;
        byte[] body = [];
        while (position < bytes.Length)
        {
            ulong key = ReadVarint(bytes, ref position);
            int number = (int)(key >> 3), wire = (int)(key & 7);
            if (wire == 0) { uint value = (uint)ReadVarint(bytes, ref position); if (number == 97) id = value; }
            else if (wire == 2)
            {
                int length = (int)ReadVarint(bytes, ref position);
                field = number; body = bytes[position..(position + length)]; position += length;
            }
            else throw new Exception("Unexpected request wire type");
        }
        return (field, id, body);
    }

    private static ulong ReadVarint(byte[] bytes, ref int position)
    {
        ulong value = 0; int shift = 0; byte next;
        do { next = bytes[position++]; value |= (ulong)(next & 127) << shift; shift += 7; } while ((next & 128) != 0);
        return value;
    }
    private static byte[] Varint(ulong value)
    {
        var bytes = new List<byte>();
        while (value >= 128) { bytes.Add((byte)(value | 128)); value >>= 7; }
        bytes.Add((byte)value); return bytes.ToArray();
    }
    private static byte[] UInt(int field, uint value) => [.. Varint((ulong)field << 3), .. Varint(value)];
    private static byte[] Message(int field, byte[] value) => [.. Varint(((ulong)field << 3) | 2), .. Varint((ulong)value.Length), .. value];
    private static byte[] Text(int field, string value) => Message(field, Encoding.UTF8.GetBytes(value));
    private static byte[] Float(int field, float value)
    {
        var bytes = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(bytes, BitConverter.SingleToInt32Bits(value));
        return [.. Varint(((ulong)field << 3) | 5), .. bytes];
    }
}
