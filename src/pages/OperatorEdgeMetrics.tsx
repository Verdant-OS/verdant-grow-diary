/**
 * OperatorEdgeMetrics — internal analytics page charting long-term trends
 * from public.edge_function_metric_events.
 *
 * SAFETY:
 *  - Route sits under <RequireOperatorRole /> in App.tsx. RLS on
 *    edge_function_metric_events also restricts SELECT to the operator role,
 *    so a non-operator hitting the table directly gets zero rows.
 *  - Read-only. No mutation UI. No PII surfaced (rows only contain function
 *    names, event types, outcomes, latencies, counters, request IDs, and env
 *    labels).
 *  - Aggregation and bucketing live in `edgeMetricTrendRules` and are
 *    covered by unit tests.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHasRole } from "@/hooks/useHasRole";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  bucketRequestMetrics,
  bucketSnapshots,
  distinctOutcomes,
  distinctValues,
  TREND_RANGES,
  type EdgeMetricEventRow,
} from "@/lib/edgeMetricTrendRules";

const RANGE_KEYS = ["24h", "7d", "30d"] as const;
type RangeKey = (typeof RANGE_KEYS)[number];

const ANY = "__any__";

// Deterministic palette using semantic tokens so it works in both themes.
const SERIES_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--chart-3, var(--muted-foreground)))",
  "hsl(var(--chart-4, var(--accent)))",
  "hsl(var(--chart-5, var(--secondary)))",
  "hsl(var(--ring))",
];

function colorFor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

async function fetchRows(rangeKey: RangeKey): Promise<EdgeMetricEventRow[]> {
  const range = TREND_RANGES[rangeKey];
  const since = new Date(Date.now() - range.windowMs).toISOString();
  const { data, error } = await supabase
    .from("edge_function_metric_events")
    .select(
      "event_type,outcome,duration_ms,requests_in_window,duration_ms_mean_in_window,duration_ms_max_in_window,counters,supabase_env,fn,created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10_000);
  if (error) {
    throw new Error(error.message || "edge_metric_events_select_failed");
  }
  return (data ?? []) as unknown as EdgeMetricEventRow[];
}

function tickFormatter(bucket: "hour" | "day") {
  return (value: number) =>
    format(new Date(value), bucket === "hour" ? "HH:mm" : "MMM d");
}

function tooltipLabelFormatter(bucket: "hour" | "day") {
  return (value: unknown) => {
    if (typeof value !== "number") return String(value ?? "");
    return format(new Date(value), bucket === "hour" ? "MMM d, HH:mm 'UTC'" : "PPP");
  };
}

export default function OperatorEdgeMetrics() {
  usePageSeo({
    path: "/operator/edge-metrics",
    title: "Edge function metrics — operator",
    description: "Internal analytics for edge function request and snapshot trends.",
    noindex: true,
  });

  const role = useHasRole("operator");
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [fnFilter, setFnFilter] = useState<string>(ANY);
  const [envFilter, setEnvFilter] = useState<string>(ANY);

  const rowsQuery = useQuery({
    queryKey: ["operator", "edge-metrics", rangeKey],
    queryFn: () => fetchRows(rangeKey),
    enabled: role.granted,
    staleTime: 30_000,
  });

  const rows = rowsQuery.data ?? [];
  const range = TREND_RANGES[rangeKey];

  const fnOptions = useMemo(() => distinctValues(rows, "fn"), [rows]);
  const envOptions = useMemo(() => distinctValues(rows, "supabase_env"), [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (fnFilter !== ANY && r.fn !== fnFilter) return false;
      if (envFilter !== ANY && (r.supabase_env ?? "(none)") !== envFilter) return false;
      return true;
    });
  }, [rows, fnFilter, envFilter]);

  const requestBuckets = useMemo(
    () => bucketRequestMetrics(filteredRows, range, Date.now()),
    [filteredRows, range],
  );
  const snapshotBuckets = useMemo(
    () => bucketSnapshots(filteredRows, range, Date.now()),
    [filteredRows, range],
  );

  const outcomes = useMemo(() => distinctOutcomes(requestBuckets), [requestBuckets]);

  const outcomeSeries = useMemo(
    () =>
      requestBuckets.map((b) => {
        const point: Record<string, number> = { t: b.bucketStartMs };
        for (const o of outcomes) point[o] = b.byOutcome[o] ?? 0;
        return point;
      }),
    [requestBuckets, outcomes],
  );

  const latencySeries = useMemo(
    () =>
      requestBuckets.map((b) => ({
        t: b.bucketStartMs,
        mean: b.latencyMeanMs ?? 0,
        max: b.latencyMaxMs ?? 0,
      })),
    [requestBuckets],
  );

  const snapshotSeries = useMemo(
    () =>
      snapshotBuckets.map((b) => ({
        t: b.bucketStartMs,
        requests: b.requestsInWindow,
        mean: b.latencyMeanMs ?? 0,
        max: b.latencyMaxMs ?? 0,
      })),
    [snapshotBuckets],
  );

  const totals = useMemo(() => {
    let requests = 0;
    let errors = 0;
    for (const b of requestBuckets) {
      requests += b.total;
      for (const [k, v] of Object.entries(b.byOutcome)) {
        if (k !== "success") errors += v;
      }
    }
    const errorRate = requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;
    return { requests, errors, errorRate };
  }, [requestBuckets]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operator Mode
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Edge function metrics</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Long-term trends from <code>edge_function_metric_events</code>. Per-request rows retain
          for 14 days; window snapshots retain for 90 days. All buckets are UTC.
        </p>
      </header>

      {role.status === "loading" && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Checking operator access…
          </CardContent>
        </Card>
      )}

      {role.status === "denied" && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Operator role required to view internal metrics.
          </CardContent>
        </Card>
      )}

      {role.granted && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="range">
                  Range
                </label>
                <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
                  <SelectTrigger id="range" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {TREND_RANGES[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="fn">
                  Function
                </label>
                <Select value={fnFilter} onValueChange={setFnFilter}>
                  <SelectTrigger id="fn" className="w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All functions</SelectItem>
                    {fnOptions.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env">
                  Environment
                </label>
                <Select value={envFilter} onValueChange={setEnvFilter}>
                  <SelectTrigger id="env" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All environments</SelectItem>
                    {envOptions.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void rowsQuery.refetch()}
                disabled={rowsQuery.isFetching}
              >
                {rowsQuery.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
            </CardContent>
          </Card>

          <section className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Requests in range</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{totals.requests}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Non-success outcomes</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{totals.errors}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Error rate</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{totals.errorRate}%</CardTitle>
              </CardHeader>
            </Card>
          </section>

          {rowsQuery.isError && (
            <Card>
              <CardHeader>
                <CardTitle>Metrics query failed.</CardTitle>
                <CardDescription>
                  No data was changed. Try refreshing or narrowing the range.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Request outcomes over time</CardTitle>
              <CardDescription>
                From <code>event_type = 'request_metric'</code>. Bucketed by{" "}
                {range.bucket === "hour" ? "hour" : "day"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {outcomeSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No request-metric rows in range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={outcomeSeries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={tickFormatter(range.bucket)}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      labelFormatter={tooltipLabelFormatter(range.bucket)}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                      }}
                    />
                    <Legend />
                    {outcomes.map((o, i) => (
                      <Line
                        key={o}
                        type="monotone"
                        dataKey={o}
                        stroke={colorFor(i)}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per-request latency</CardTitle>
              <CardDescription>
                Mean and max <code>duration_ms</code> per bucket, from{" "}
                <code>request_metric</code> rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {latencySeries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No latency samples in range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencySeries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={tickFormatter(range.bucket)}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${v}ms`}
                    />
                    <Tooltip
                      labelFormatter={tooltipLabelFormatter(range.bucket)}
                      formatter={(v: unknown) => `${Number(v).toFixed(2)} ms`}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="mean"
                      stroke={colorFor(0)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="max"
                      stroke={colorFor(1)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Snapshot requests-per-window</CardTitle>
              <CardDescription>
                From <code>event_type = 'metric_snapshot'</code>. Multiple snapshots inside a bucket
                are summed. Latency mean is weighted by requests-in-window.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {snapshotSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No snapshot rows in range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshotSeries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={tickFormatter(range.bucket)}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${v}ms`}
                    />
                    <Tooltip
                      labelFormatter={tooltipLabelFormatter(range.bucket)}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="requests"
                      name="requests / window"
                      stroke={colorFor(0)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="mean"
                      name="latency mean (ms)"
                      stroke={colorFor(2)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="max"
                      name="latency max (ms)"
                      stroke={colorFor(1)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Retention: per-request rows purge after 14 days, snapshots after 90 days, other events
            after 30 days. Rows loaded: {rows.length.toLocaleString()} (capped at 10,000).
          </p>
        </>
      )}
    </div>
  );
}
