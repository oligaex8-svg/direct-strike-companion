using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace DirectStrikeCompanion;

// One persistent PDH query per decoder owner. No helper process, WMI polling or
// GPU work is started by this monitor. Reads within 500 ms reuse one observation.
internal sealed class ReplaySystemResources : IDisposable
{
    private const int SampleMilliseconds = 500;
    private readonly PdhGpuEngines gpu = new();
    private (ulong Idle, ulong Total)? previous;
    private long? collectedAt;
    private ReplayWorkerResources cached = new(double.NaN, 100, double.NaN);

    internal async Task PrimeAsync(CancellationToken ct)
    {
        long now = Environment.TickCount64;
        if (collectedAt is { } last && now - last <= SampleMilliseconds) return;
        if (collectedAt == null || now - collectedAt.Value > 2 * SampleMilliseconds)
        {
            // Rate counters require a baseline and a later observation. After
            // idle scans, discard the long idle average before admitting work.
            previous = CpuTimes();
            gpu.CollectBaseline();
            collectedAt = now;
            cached = new(double.NaN, ResourceGuard.RamPercent(), double.NaN);
            await RefreshAsync(ct).ConfigureAwait(false);
        }
        Read();
    }

    internal async Task RefreshAsync(CancellationToken ct)
    {
        // A retry must advance the collection, not return the cached invalid
        // reading. Loop for coarse Windows timer ticks and early delay wakeups.
        long? before = collectedAt;
        do
        {
            long age = collectedAt is { } last ? Environment.TickCount64 - last : 0;
            await Task.Delay((int)Math.Max(1, SampleMilliseconds + 1 - age), ct).ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();
            Read();
        } while (collectedAt == before);
    }

    internal ReplayWorkerResources Read()
    {
        long now = Environment.TickCount64;
        if (collectedAt is { } last && now - last <= SampleMilliseconds) return cached;
        var current = CpuTimes();
        double cpu = previous is { } before && current is { } after && after.Total > before.Total && after.Idle >= before.Idle
            ? 100.0 * (1 - (double)(after.Idle - before.Idle) / (after.Total - before.Total)) : double.NaN;
        previous = current;
        collectedAt = now;
        cached = new(cpu, ResourceGuard.RamPercent(), gpu.Read());
        return cached;
    }

    private static (ulong Idle, ulong Total)? CpuTimes() => GetSystemTimes(out var idle, out var kernel, out var user) ? (idle, kernel + user) : null;
    public void Dispose() => gpu.Dispose();
    [DllImport("kernel32.dll")] private static extern bool GetSystemTimes(out ulong idle, out ulong kernel, out ulong user);

    internal readonly record struct GpuEngineSample(string Name, double Percent, uint Status = 0);
    private static readonly Regex EngineName = new(@"^pid_\d+_(?<engine>luid_0x[0-9a-f]+_0x[0-9a-f]+_phys_\d+_eng_\d+)_engtype_.+$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    internal static double BusiestEngine(IEnumerable<GpuEngineSample> samples)
    {
        var engines = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var sample in samples)
        {
            // A process disappearing between collections is expected. Other
            // invalid readings cannot establish sufficient GPU headroom.
            if (sample.Status == 0x800007D1) continue; // PDH_CSTATUS_NO_INSTANCE
            var match = EngineName.Match(sample.Name);
            if (sample.Status is not (0 or 1) || !double.IsFinite(sample.Percent) || sample.Percent < 0 || !match.Success) return double.NaN;
            string engine = match.Groups["engine"].Value;
            engines[engine] = engines.GetValueOrDefault(engine) + sample.Percent;
        }
        return engines.Count == 0 ? double.NaN : Math.Clamp(engines.Values.Max(), 0, 100);
    }

    private sealed class PdhGpuEngines : IDisposable
    {
        private const uint MoreData = 0x800007D2, FormatDouble = 0x200, NoCap100 = 0x8000;
        private IntPtr query, counter;
        private bool failed;

        private bool Open()
        {
            if (failed) return false;
            if (query != IntPtr.Zero) return true;
            if (PdhOpenQuery(null, UIntPtr.Zero, out query) == 0 &&
                PdhAddEnglishCounter(query, @"\GPU Engine(*)\Utilization Percentage", UIntPtr.Zero, out counter) == 0) return true;
            failed = true;
            Dispose();
            return false;
        }

        internal void CollectBaseline()
        {
            try { if (Open()) PdhCollectQueryData(query); }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { failed = true; Dispose(); }
        }

        internal double Read()
        {
            try
            {
                if (!Open() || PdhCollectQueryData(query) != 0) return double.NaN;
                // The array API accepts wildcard counter handles and discovers
                // newly-created process instances on subsequent collections.
                // https://learn.microsoft.com/windows/win32/api/pdh/nf-pdh-pdhgetformattedcounterarrayw
                for (int attempt = 0; attempt < 2; attempt++)
                {
                    uint bytes = 0;
                    if (PdhGetFormattedCounterArray(counter, FormatDouble | NoCap100, ref bytes, out _, IntPtr.Zero) != MoreData || bytes == 0 || bytes > 16 * 1024 * 1024) return double.NaN;
                    IntPtr buffer = Marshal.AllocHGlobal((int)bytes);
                    try
                    {
                        uint result = PdhGetFormattedCounterArray(counter, FormatDouble | NoCap100, ref bytes, out uint count, buffer);
                        if (result == MoreData) continue; // Process list grew; query the required size again.
                        if (result != 0 || count == 0 || (long)count * Marshal.SizeOf<CounterItem>() > bytes) return double.NaN;
                        var samples = new List<GpuEngineSample>((int)count);
                        int itemSize = Marshal.SizeOf<CounterItem>();
                        for (int i = 0; i < count; i++)
                        {
                            var item = Marshal.PtrToStructure<CounterItem>(IntPtr.Add(buffer, i * itemSize));
                            samples.Add(new(Marshal.PtrToStringUni(item.Name) ?? "", item.Value.Percent, item.Value.Status));
                        }
                        return BusiestEngine(samples);
                    }
                    finally { Marshal.FreeHGlobal(buffer); }
                }
                return double.NaN;
            }
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { failed = true; Dispose(); return double.NaN; }
        }

        public void Dispose()
        {
            if (query != IntPtr.Zero) { PdhCloseQuery(query); query = IntPtr.Zero; counter = IntPtr.Zero; }
        }

        [StructLayout(LayoutKind.Explicit)] private struct CounterValue { [FieldOffset(0)] public uint Status; [FieldOffset(8)] public double Percent; }
        [StructLayout(LayoutKind.Sequential)] private struct CounterItem { public IntPtr Name; public CounterValue Value; }
        [DllImport("pdh.dll", EntryPoint = "PdhOpenQueryW", CharSet = CharSet.Unicode)] private static extern uint PdhOpenQuery(string? source, UIntPtr userData, out IntPtr query);
        [DllImport("pdh.dll", EntryPoint = "PdhAddEnglishCounterW", CharSet = CharSet.Unicode)] private static extern uint PdhAddEnglishCounter(IntPtr query, string path, UIntPtr userData, out IntPtr counter);
        [DllImport("pdh.dll")] private static extern uint PdhCollectQueryData(IntPtr query);
        [DllImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterArrayW")] private static extern uint PdhGetFormattedCounterArray(IntPtr counter, uint format, ref uint bytes, out uint count, IntPtr buffer);
        [DllImport("pdh.dll")] private static extern uint PdhCloseQuery(IntPtr query);
    }
}
