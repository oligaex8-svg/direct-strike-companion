using System.Buffers.Binary;
using System.Net.WebSockets;
using System.Text;

namespace DirectStrikeCompanion;

// Minimal SC2 API protocol subset. No game launch, identity inference, or persistence.
// Field numbers follow Blizzard's s2clientprotocol/sc2api.proto and score.proto.
internal sealed class ReplayDamageApi : IAsyncDisposable
{
    internal sealed record VersionInfo(string? GameVersion, string? DataVersion, uint? DataBuild, uint? BaseBuild);
    internal sealed record Player(uint? PlayerId, string? Name, uint? Type);
    internal sealed record ReplayInfo(IReadOnlyList<Player> Players, uint? DurationLoops, uint? BaseBuild, string? DataVersion);
    // Damage values are present only on an ended observation; null means unavailable.
    internal sealed record Observation(uint? Loop, uint? PlayerId, uint? Status, double? DamageDealt, double? DamageTaken);

    private const int MaxMessageBytes = 8 * 1024 * 1024;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(60);
    private readonly ClientWebSocket socket;
    private readonly SemaphoreSlim gate = new(1, 1);
    private uint requestId;
    private uint? startedPlayerId;
    private uint? lastValidLoop;
    private bool stopped;
    private ReplayDamageApi(ClientWebSocket socket) => this.socket = socket;

    internal static async Task<ReplayDamageApi> ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        var socket = new ClientWebSocket();
        // This local SC2 channel uses serialized requests with explicit timeouts;
        // do not inject unsolicited WebSocket heartbeat frames between commands.
        socket.Options.KeepAliveInterval = TimeSpan.Zero;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);
            await socket.ConnectAsync(uri, timeout.Token).ConfigureAwait(false);
            return new ReplayDamageApi(socket);
        }
        catch { socket.Dispose(); throw; }
    }

    internal async Task<VersionInfo> PingAsync(CancellationToken cancellationToken = default)
    {
        var response = await RequestAsync(19, [], cancellationToken).ConfigureAwait(false);
        var fields = Proto.Read(response.Body);
        return new(fields.Text(1), fields.Text(2), fields.UInt(3), fields.UInt(4));
    }

    internal async Task<ReplayInfo> ReplayInfoAsync(string path, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var body = new Proto.Writer(); body.Text(1, path); body.UInt(3, 0); // Never download old game data.
        var response = await RequestAsync(16, body.Bytes(), cancellationToken).ConfigureAwait(false);
        var fields = Proto.Read(response.Body);
        CheckOperationError(fields, 9, 10, "ReplayInfo");
        var players = new List<Player>();
        foreach (var extra in fields.Messages(3))
        {
            var player = extra.Message(1);
            if (player != null) players.Add(new(player.UInt(1), player.Text(6), player.UInt(2)));
        }
        return new(players, fields.UInt(4), fields.UInt(8), fields.Text(11));
    }

    internal async Task StartReplayAsync(string path, uint observedPlayerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (observedPlayerId == 0 || observedPlayerId > int.MaxValue) throw new ArgumentOutOfRangeException(nameof(observedPlayerId));
        startedPlayerId = null; // A failed restart must not retain a previous replay identity.
        lastValidLoop = null;
        var options = new Proto.Writer(); options.UInt(2, 1); // score only; no raw unit stream.
        var body = new Proto.Writer(); body.Text(1, path); body.UInt(2, observedPlayerId); body.Message(3, options.Bytes());
        body.UInt(4, 1); body.UInt(7, 0);
        var response = await RequestAsync(4, body.Bytes(), cancellationToken).ConfigureAwait(false);
        CheckOperationError(Proto.Read(response.Body), 1, 2, "StartReplay");
        startedPlayerId = observedPlayerId;
    }

    internal async Task<Observation> ObserveAsync(CancellationToken cancellationToken = default)
    {
        var response = await RequestAsync(10, [], cancellationToken).ConfigureAwait(false);
        var observation = Proto.Read(response.Body).Message(3);
        uint? loop = observation?.UInt(9), player = observation?.Message(1)?.UInt(1);
        // A final result must be explicitly ended and tied to the requested player.
        if (loop.HasValue && player == startedPlayerId && startedPlayerId.HasValue && response.Status is 4 or 5) lastValidLoop = loop;
        bool final = response.Status == 5 && loop.HasValue && startedPlayerId.HasValue && player == startedPlayerId;
        var details = final ? observation?.Message(4)?.Message(8) : null;
        return new(loop, player, response.Status, SumVitals(details?.Message(24)), SumVitals(details?.Message(25)));
    }

    internal async Task StepAsync(uint count, CancellationToken cancellationToken = default)
    {
        if (count == 0) throw new ArgumentOutOfRangeException(nameof(count));
        var body = new Proto.Writer(); body.UInt(1, count);
        await RequestAsync(12, body.Bytes(), cancellationToken).ConfigureAwait(false);
    }

    // The SC2 protocol says quit has no response. Only call for a task-owned game.
    internal async Task QuitAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (stopped) return;
            var request = new Proto.Writer(); request.Message(8, []); request.UInt(97, NextId());
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);
            await socket.SendAsync(request.Bytes(), WebSocketMessageType.Binary, true, timeout.Token).ConfigureAwait(false);
            stopped = true;
        }
        catch { stopped = true; socket.Abort(); throw; }
        finally { gate.Release(); }
    }

    private uint NextId() { if (++requestId == 0) ++requestId; return requestId; }
    private sealed record Envelope(ReadOnlyMemory<byte> Body, uint? Status);
    private async Task<Envelope> RequestAsync(int field, byte[] body, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        uint? activeId = null;
        try
        {
            if (stopped) throw new InvalidOperationException("The SC2 API connection is closed.");
            uint id = NextId();
            activeId = id;
            var request = new Proto.Writer(); request.Message(field, body); request.UInt(97, id);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);
            await socket.SendAsync(request.Bytes(), WebSocketMessageType.Binary, true, timeout.Token).ConfigureAwait(false);
            var buffer = new byte[16 * 1024];
            using var message = new MemoryStream();
            WebSocketReceiveResult received;
            do
            {
                received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token).ConfigureAwait(false);
                if (received.MessageType == WebSocketMessageType.Close) throw new IOException($"SC2 API closed the WebSocket (status={socket.CloseStatus?.ToString() ?? "missing"}).");
                if (received.MessageType != WebSocketMessageType.Binary) throw new InvalidDataException("Expected a binary SC2 API response.");
                if (message.Length + received.Count > MaxMessageBytes) throw new InvalidDataException("SC2 API response exceeds the size limit.");
                message.Write(buffer, 0, received.Count);
            } while (!received.EndOfMessage);
            var fields = Proto.Read(message.ToArray());
            uint? receivedId = fields.UInt(97);
            if (receivedId != id)
            {
                string status = fields.UInt(99)?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "missing";
                string errors = string.Join("; ", fields.Texts(98)).Replace('\r', ' ').Replace('\n', ' ');
                if (errors.Length > 512) errors = errors[..512] + "…";
                if (errors.Length == 0) errors = "none";
                throw new InvalidDataException($"SC2 API response ID mismatch: requestField={field}, expectedId={id}, receivedId={receivedId?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "missing"}, status={status}, errors={errors}.");
            }
            var result = fields.Bytes(field);
            if (!result.HasValue)
            {
                var errors = fields.Texts(98);
                if (errors.Count > 0) throw new InvalidOperationException("SC2 API: " + string.Join("; ", errors));
                throw new InvalidDataException("SC2 API returned an unexpected response.");
            }
            // Field 98 carries warnings when a command response is present.
            return new(result.Value, fields.UInt(99));
        }
        catch (Exception ex) when (ex is WebSocketException || ex is IOException && ex is not InvalidDataException)
        {
            stopped = true; socket.Abort();
            throw new IOException($"SC2 API transport failed: requestField={field}, requestId={activeId?.ToString() ?? "missing"}, startedPlayerId={startedPlayerId?.ToString() ?? "missing"}, lastValidLoop={lastValidLoop?.ToString() ?? "missing"}.", ex);
        }
        catch { stopped = true; socket.Abort(); throw; } // A failed exchange cannot safely be resynchronized.
        finally { gate.Release(); }
    }

    private static void CheckOperationError(Proto.Fields fields, int errorField, int detailField, string operation)
    {
        var error = fields.UInt(errorField);
        if (error.HasValue) throw new InvalidOperationException($"SC2 {operation} failed ({error}): {fields.Text(detailField)}");
    }
    private static double? SumVitals(Proto.Fields? fields)
    {
        float? life = fields?.Float(1), shields = fields?.Float(2);
        if (!life.HasValue || !shields.HasValue || !float.IsFinite(life.Value) || !float.IsFinite(shields.Value) || life < 0 || shields < 0) return null;
        return (double)life.Value + shields.Value;
    }
    public ValueTask DisposeAsync() { stopped = true; socket.Dispose(); gate.Dispose(); return ValueTask.CompletedTask; }

    // Focused protobuf reader/writer: unknown fields are skipped; malformed wire data is rejected.
    private static class Proto
    {
        internal sealed record Field(int Number, int Wire, ulong Value, ReadOnlyMemory<byte> Data);
        internal sealed class Fields(List<Field> fields)
        {
            internal uint? UInt(int number)
            {
                var field = fields.LastOrDefault(f => f.Number == number && f.Wire == 0);
                if (field == null) return null;
                if (field.Value > uint.MaxValue) throw new InvalidDataException("SC2 protobuf integer is out of range.");
                return (uint)field.Value;
            }
            internal ReadOnlyMemory<byte>? Bytes(int number) => fields.LastOrDefault(f => f.Number == number && f.Wire == 2)?.Data;
            internal string? Text(int number) { var bytes = Bytes(number); return bytes.HasValue ? Encoding.UTF8.GetString(bytes.Value.Span) : null; }
            internal List<string> Texts(int number) => fields.Where(f => f.Number == number && f.Wire == 2).Select(f => Encoding.UTF8.GetString(f.Data.Span)).ToList();
            internal Fields? Message(int number) { var bytes = Bytes(number); return bytes.HasValue ? Read(bytes.Value) : null; }
            internal IEnumerable<Fields> Messages(int number) => fields.Where(f => f.Number == number && f.Wire == 2).Select(f => Read(f.Data));
            internal float? Float(int number)
            {
                var field = fields.LastOrDefault(f => f.Number == number && f.Wire == 5);
                return field == null ? null : BitConverter.Int32BitsToSingle(unchecked((int)field.Value));
            }
        }
        internal static Fields Read(ReadOnlyMemory<byte> memory)
        {
            var span = memory.Span; int index = 0; var fields = new List<Field>();
            while (index < span.Length)
            {
                ulong key = Varint(span, ref index); int number = checked((int)(key >> 3)), wire = (int)(key & 7);
                if (number == 0) throw new InvalidDataException("Invalid SC2 protobuf field number.");
                ulong value = 0; ReadOnlyMemory<byte> data = default;
                switch (wire)
                {
                    case 0: value = Varint(span, ref index); break;
                    case 1: if (span.Length - index < 8) throw new InvalidDataException("Truncated SC2 protobuf field."); index += 8; break;
                    case 2:
                        ulong length = Varint(span, ref index);
                        if (length > (ulong)(span.Length - index)) throw new InvalidDataException("Truncated SC2 protobuf message.");
                        data = memory.Slice(index, (int)length); index += (int)length; break;
                    case 5:
                        if (span.Length - index < 4) throw new InvalidDataException("Truncated SC2 protobuf field.");
                        value = BinaryPrimitives.ReadUInt32LittleEndian(span.Slice(index, 4)); index += 4; break;
                    default: throw new InvalidDataException("Unsupported SC2 protobuf wire type.");
                }
                fields.Add(new(number, wire, value, data));
            }
            return new(fields);
        }
        private static ulong Varint(ReadOnlySpan<byte> span, ref int index)
        {
            ulong value = 0;
            for (int shift = 0; shift < 70; shift += 7)
            {
                if (index >= span.Length) throw new InvalidDataException("Truncated SC2 protobuf varint.");
                byte b = span[index++];
                if (shift == 63 && (b & 0xfe) != 0) throw new InvalidDataException("Invalid SC2 protobuf varint.");
                value |= (ulong)(b & 0x7f) << shift;
                if ((b & 0x80) == 0) return value;
            }
            throw new InvalidDataException("Invalid SC2 protobuf varint.");
        }
        internal sealed class Writer
        {
            private readonly MemoryStream stream = new();
            private void Varint(ulong value) { while (value >= 128) { stream.WriteByte((byte)(value | 0x80)); value >>= 7; } stream.WriteByte((byte)value); }
            internal void UInt(int field, uint value) { Varint((ulong)field << 3); Varint(value); }
            internal void Message(int field, byte[] value) { Varint(((ulong)field << 3) | 2); Varint((ulong)value.Length); stream.Write(value); }
            internal void Text(int field, string value) => Message(field, Encoding.UTF8.GetBytes(value));
            internal byte[] Bytes() => stream.ToArray();
        }
    }
}
