using System.Collections;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

namespace DirectStrikeCompanion;

// Fallback for unavailable PDH only. WMI returns calculated engine counters;
// every invocation issues a new query. On this system the formatted provider
// exposes no usable timestamps, so provider-level freshness cannot be proven.
internal static class ReplayDamageGpu
{
    private static readonly object Sync = new();
    private static Task<double>? outstanding;
    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(2);
    private sealed class QueryTrace
    {
        internal readonly Stopwatch Clock = Stopwatch.StartNew();
        internal string Phase = "queued";
        internal int Rows;
        internal long LocatorEnd = -1, ConnectEnd = -1, QueryEnd = -1, EnumerationEnd = -1;
        internal string Describe() => $"phase={Volatile.Read(ref Phase)}, elapsed={Clock.Elapsed.TotalMilliseconds:F0}ms, rows={Volatile.Read(ref Rows)}, " +
            $"stage-end-ms(locator={Volatile.Read(ref LocatorEnd)}, connect={Volatile.Read(ref ConnectEnd)}, query={Volatile.Read(ref QueryEnd)}, enumeration={Volatile.Read(ref EnumerationEnd)})";
    }

    internal static async Task<double> ReadAsync(CancellationToken cancellationToken)
    {
        Task<double> query;
        var trace = new QueryTrace();
        lock (Sync)
        {
            if (outstanding is { IsCompleted: false })
                throw new IOException("A previous WMI GPU query is still running; telemetry is unavailable.");
            query = Task.Run(() => Query(trace));
            outstanding = query;
            // Observe failures even if the bounded caller has already timed out.
            _ = query.ContinueWith(task => _ = task.Exception, CancellationToken.None,
                TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        }
        var clock = Stopwatch.StartNew();
        try
        {
            double value = await query.WaitAsync(Deadline, cancellationToken).ConfigureAwait(false);
            if (clock.Elapsed > Deadline) throw new TimeoutException("WMI GPU query exceeded its deadline.");
            return value;
        }
        catch (TimeoutException ex) { throw new IOException($"WMI GPU query timed out ({trace.Describe()}); telemetry is unavailable.", ex); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        { throw new IOException($"WMI GPU query failed ({trace.Describe()}): {ex.Message}", ex); }
    }

    private static double Query(QueryTrace trace)
    {
        object? locator = null, services = null, results = null, enumerator = null;
        try
        {
            Volatile.Write(ref trace.Phase, "locator");
            var type = Type.GetTypeFromProgID("WbemScripting.SWbemLocator") ?? throw new IOException("Windows WMI is unavailable.");
            locator = Activator.CreateInstance(type) ?? throw new IOException("Cannot initialize Windows WMI.");
            Volatile.Write(ref trace.LocatorEnd, trace.Clock.ElapsedMilliseconds);
            Volatile.Write(ref trace.Phase, "connect");
            services = ((dynamic)locator).ConnectServer(".", @"root\cimv2");
            Volatile.Write(ref trace.ConnectEnd, trace.Clock.ElapsedMilliseconds);
            Volatile.Write(ref trace.Phase, "query");
            results = ((dynamic)services).ExecQuery("SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine", "WQL", 0x10);
            Volatile.Write(ref trace.QueryEnd, trace.Clock.ElapsedMilliseconds);
            Volatile.Write(ref trace.Phase, "enumeration");
            enumerator = ((IEnumerable)results).GetEnumerator();
            var rows = new List<(string Name, object? Value)>();
            while (((IEnumerator)enumerator).MoveNext())
            {
                object? item = ((IEnumerator)enumerator).Current;
                try
                {
                    if (item == null || rows.Count >= 250000) throw new IOException("Invalid or oversized WMI GPU engine enumeration.");
                    // SWbemObject.GetObjectText_ is one COM call per instance.
                    // The query selects exactly two fields; an unexpected MOF
                    // shape is rejected rather than converted to a zero.
                    string text = ((dynamic)item).GetObjectText_();
                    rows.Add(ParseMof(text));
                    Volatile.Write(ref trace.Rows, rows.Count);
                }
                finally { Release(item); }
            }
            Volatile.Write(ref trace.EnumerationEnd, trace.Clock.ElapsedMilliseconds);
            Volatile.Write(ref trace.Phase, "aggregate");
            double value = Aggregate(rows);
            Volatile.Write(ref trace.Phase, "complete");
            return value;
        }
        finally { Release(enumerator); Release(results); Release(services); Release(locator); }
    }

    internal static (string Name, object? Value) ParseMof(string? text)
    {
        if (text == null || text.Length > 4096) throw new IOException("Invalid WMI GPU object text.");
        int open = text.IndexOf('{'), close = text.LastIndexOf('}');
        if (open < 0 || close <= open || text[(close + 1)..].Trim() != ";") throw new IOException("Malformed WMI GPU object.");
        string[] header = text[..open].Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (header.Length != 3 || !header[0].Equals("instance", StringComparison.OrdinalIgnoreCase) ||
            !header[1].Equals("of", StringComparison.OrdinalIgnoreCase) ||
            !header[2].Equals("Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine", StringComparison.OrdinalIgnoreCase))
            throw new IOException("Unexpected WMI GPU object class.");
        string[] assignments = text[(open + 1)..close].Split(';');
        if (assignments.Length != 3 || !string.IsNullOrWhiteSpace(assignments[2]))
            throw new IOException("WMI GPU object has missing or extra fields.");
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string assignment in assignments.Take(2))
        {
            string[] parts = assignment.Split('=', 2);
            if (parts.Length != 2) throw new IOException("Malformed WMI GPU field.");
            string key = parts[0].Trim(), quoted = parts[1].Trim();
            if (key is not ("Name" or "UtilizationPercentage") || quoted.Length < 2 || quoted[0] != '"' || quoted[^1] != '"')
                throw new IOException("Invalid WMI GPU field.");
            string value = quoted[1..^1];
            if (value.Any(c => c is '"' or '\\' || char.IsControl(c)) || !values.TryAdd(key, value))
                throw new IOException("Invalid or duplicate WMI GPU field.");
        }
        if (!values.TryGetValue("Name", out var name) || !values.TryGetValue("UtilizationPercentage", out var utilization))
            throw new IOException("WMI GPU fields are missing.");
        return (name, utilization);
    }

    // Kept separate for focused tests: no invalid, duplicate, missing, or
    // unrecognised instance can silently become a zero reading.
    internal static double Aggregate(IEnumerable<(string Name, object? Value)> rows)
    {
        var samples = new List<ReplaySystemResources.GpuEngineSample>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, value) in rows)
        {
            if (string.IsNullOrWhiteSpace(name) || !seen.Add(name) || !TryNumber(value, out double percent))
                throw new IOException("WMI GPU engine data is missing, duplicate, or invalid.");
            samples.Add(new(name, percent));
        }
        double maximum = ReplaySystemResources.BusiestEngine(samples);
        if (!double.IsFinite(maximum) || maximum < 0) throw new IOException("WMI GPU engine data is unavailable or unrecognised.");
        return maximum;
    }

    private static bool TryNumber(object? value, out double number)
    {
        number = double.NaN;
        switch (value)
        {
            case string text:
                if (!ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var integer)) return false;
                number = integer; break;
            case byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal:
                number = Convert.ToDouble(value, CultureInfo.InvariantCulture); break;
            default: return false;
        }
        return double.IsFinite(number) && number >= 0;
    }

    private static void Release(object? value)
    {
        if (value != null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
    }
}
