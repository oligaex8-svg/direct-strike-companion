namespace DirectStrikeCompanion;

internal static class ReplayDamageGpuTests
{
    internal static void Run(Action<bool, string> assert)
    {
        const string header = "instance of Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine";
        string valid = header + " { Name = \"pid_1_luid_0x00000000_0x00000001_phys_0_eng_0_engtype_3D\"; UtilizationPercentage = \"12\"; };";
        var parsed = ReplayDamageGpu.ParseMof(valid);
        assert((string)parsed.Value! == "12", "WMI MOF parser reads an explicit utilization value");
        foreach (string bad in new[] { header + " { Name = \"x\"; };", header + " { Name = \"x\"; Name = \"y\"; };",
            header + " { Name = \"x\"; UtilizationPercentage = null; };", valid + " junk" })
        {
            bool rejected = false;
            try { ReplayDamageGpu.ParseMof(bad); } catch (IOException) { rejected = true; }
            assert(rejected, "WMI MOF parser rejects missing, duplicate and malformed fields");
        }
        string first = "pid_1_luid_0x00000000_0x00000001_phys_0_eng_0_engtype_3D";
        string second = "pid_2_luid_0x00000000_0x00000001_phys_0_eng_0_engtype_3D";
        string otherAdapter = "pid_3_luid_0x00000000_0x00000002_phys_0_eng_0_engtype_3D";
        assert(ReplayDamageGpu.Aggregate([(first, 40u), (second, "55"), (otherAdapter, 20u)]) == 95,
            "WMI GPU fallback sums same-engine processes and considers all adapters");
        List<(string Name, object? Value)>[] invalid = [[], [(first, null)], [("unrecognized", 1u)],
            [(first, -1)], [(first, double.NaN)], [(first, 1u), (first, 1u)], [(first, "not a number")]];
        foreach (var rows in invalid)
        {
            bool rejected = false;
            try { ReplayDamageGpu.Aggregate(rows); } catch (IOException) { rejected = true; }
            assert(rejected, "WMI GPU fallback rejects incomplete or invalid engine rows");
        }
        int calls = 0;
        Task<double> Fallback(CancellationToken _) { calls++; return Task.FromResult(25d); }
        static bool Rejected(Func<Task> action)
        {
            try { action().GetAwaiter().GetResult(); return false; }
            catch (IOException) { return true; }
        }
        assert(Rejected(() => ReplayDamageCollector.CheckBudgetAsync(() => new(95, 50, double.NaN), Fallback, CancellationToken.None)) && calls == 0,
            "unsafe CPU never waits for the WMI fallback");
        assert(Rejected(() => ReplayDamageCollector.CheckBudgetAsync(() => new(20, 50, 95), Fallback, CancellationToken.None)) && calls == 0,
            "valid high PDH GPU reading is never bypassed");
        var reads = 0;
        ReplayWorkerResources Read() => new(20, 50, ++reads == 1 ? double.NaN : 96);
        assert(Rejected(() => ReplayDamageCollector.CheckBudgetAsync(Read, Fallback, CancellationToken.None)) && calls == 1,
            "a valid high PDH reading after fallback still stops collection");
        ReplayDamageCollector.CheckBudgetAsync(() => new(20, 50, double.NaN), Fallback, CancellationToken.None).GetAwaiter().GetResult();
        assert(calls == 2, "valid WMI fallback can replace an unavailable PDH GPU reading");
        Task<double> Unavailable(CancellationToken _) => Task.FromException<double>(new IOException("WMI unavailable"));
        ReplayDamageCollector.WarmBudgetAsync(() => new(20, 50, 10), Unavailable, CancellationToken.None).GetAwaiter().GetResult();
        assert(true, "WMI warm-up failure does not block a fresh safe PDH reading");
        assert(Rejected(() => ReplayDamageCollector.WarmBudgetAsync(() => new(20, 50, double.NaN), Unavailable, CancellationToken.None)),
            "unavailable WMI and PDH both fail closed");
        assert(Rejected(() => ReplayDamageCollector.WarmBudgetAsync(() => new(95, 50, 10), Unavailable, CancellationToken.None)),
            "unsafe CPU is not ignored when WMI warm-up fails");
        assert(Rejected(() => ReplayDamageCollector.WarmBudgetAsync(() => new(20, 50, 95), Unavailable, CancellationToken.None)),
            "unsafe PDH is not ignored when WMI warm-up fails");
        assert(Rejected(() => ReplayDamageCollector.WarmBudgetAsync(() => new(20, 50, 10), _ => Task.FromResult(95d), CancellationToken.None)),
            "unsafe WMI warm-up is not ignored when PDH is safe");
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        bool cancellationPropagated = false;
        try { ReplayDamageCollector.WarmBudgetAsync(() => new(20, 50, 10), _ => Task.FromCanceled<double>(cancelled.Token), cancelled.Token).GetAwaiter().GetResult(); }
        catch (OperationCanceledException) { cancellationPropagated = true; }
        assert(cancellationPropagated, "WMI warm-up cancellation propagates");

    }
}
