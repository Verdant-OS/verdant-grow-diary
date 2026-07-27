/**
 * OperatorEdgeAlerts — internal operator view of edge alert state.
 *
 * Shows:
 *  - Live breach evaluation from the `edge-metrics-alert-check` edge function
 *    (fired vs suppressed-by-cooldown breaches in the current window).
 *  - Historical cooldown state from `public.edge_metrics_alert_dispatches`,
 *    with computed cooldown expiry (`last_fired_at + cooldown_minutes`).
 *
 * SAFETY:
 *  - Route sits under <RequireOperatorRole /> in App.tsx.
 *  - `edge_metrics_alert_dispatches` is RLS-gated to the operator role (SELECT
 *    only); writes remain service-role only.
 *  - The alert-check function itself verifies operator role server-side, so
 *    the manual invocation this page performs is safe to expose here.
 *  - Read-only. No PII. Aggregate counts + function names + env labels only.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import EdgeAlertsDryRunDialog from "@/components/EdgeAlertsDryRunDialog";
import EdgeAlertsBreachDrilldownDialog from "@/components/EdgeAlertsBreachDrilldownDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHasRole } from "@/hooks/useHasRole";
import { usePageSeo } from "@/hooks/usePageSeo";

type MetricKey = "rpc_error_count" | "rpc_error_rate" | "startup_import_failed";

interface Breach {
  fn: string;
  metric: MetricKey;
  value: number;
  threshold: number;
  requests_in_window: number;
}

interface SuppressedBreach extends Breach {
  last_fired_at: string;
  next_eligible_at: string;
  cooldown_remaining_seconds: number;
}

interface AlertCheckResponse {
  ok: boolean;
  window_minutes: number;
  sampled_events: number;
  thresholds: {
    windowMinutes: number;
    rpcErrorCount: number;
    rpcErrorRate: number;
    startupFailureCount: number;
    minRequests: number;
    cooldownMinutes: number;
  };
  breaches: Breach[];
  fired: Breach[];
  suppressed: SuppressedBreach[];
  webhook: {
    posted: boolean;
    status?: number;
    error?: string;
    attempts?: unknown[];
    gave_up_transient?: boolean;
  };
  invoked_via: string;
}

interface DispatchRow {
  fn: string;
  metric: string;
  last_fired_at: string;
  last_value: number | null;
  last_threshold: number | null;
  last_requests_in_window: number | null;
  fire_count: number | null;
  updated_at: string;
}

type AttemptOutcome = "delivered" | "transient_failure" | "permanent_failure" | "exhausted";

interface WebhookAttemptRow {
  id: string;
  dispatch_id: string;
  fn: string;
  metric: string;
  attempt: number;
  outcome: AttemptOutcome;
  status_code: number | null;
  ok: boolean;
  transient: boolean;
  error: string | null;
  delay_before_ms: number;
  duration_ms: number;
  value: number | null;
  threshold: number | null;
  requests_in_window: number | null;
  request_id: string | null;
  attempted_at: string;
}

type MetricFilter = "all" | MetricKey;
type StatusFilter = "all" | "active" | "expired";
type TimeFilter = "all" | "1h" | "24h" | "7d" | "30d";

const TIME_WINDOW_MS: Record<Exclude<TimeFilter, "all">, number> = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

const PAGE_SIZE = 25;

function formatRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const deltaSec = Math.round((t - now) / 1000);
  const abs = Math.abs(deltaSec);
  const sign = deltaSec < 0 ? "ago" : "from now";
  if (abs < 60) return `${abs}s ${sign}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${sign}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${sign}`;
  return `${Math.round(abs / 86400)}d ${sign}`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function metricLabel(m: string): string {
  switch (m) {
    case "rpc_error_count":
      return "RPC error count";
    case "rpc_error_rate":
      return "RPC error rate";
    case "startup_import_failed":
      return "Startup import failed";
    default:
      return m;
  }
}

function formatValue(metric: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (metric === "rpc_error_rate") return `${(value * 100).toFixed(1)}%`;
  return String(value);
}

export default function OperatorEdgeAlerts() {
  usePageSeo({
    title: "Operator · Edge alerts",
    description: "Fired vs suppressed edge alert breaches and cooldown expiry state.",
    path: "/operator/edge-alerts",
    noindex: true,
  });

  const roleResult = useHasRole("operator");
  const isOperator = roleResult.granted;
  const roleLoading = roleResult.status === "loading";
  const [now, setNow] = useState<number>(() => Date.now());

  // Filter state
  const [search, setSearch] = useState("");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [dispatchPage, setDispatchPage] = useState(0);
  const [attemptsPage, setAttemptsPage] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const liveQuery = useQuery({
    queryKey: ["operator", "edge-alerts", "live"],
    enabled: isOperator === true,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AlertCheckResponse> => {
      const { data, error } = await supabase.functions.invoke<AlertCheckResponse>(
        "edge-metrics-alert-check",
        { method: "GET" },
      );
      if (error) throw error;
      if (!data) throw new Error("empty response");
      return data;
    },
  });

  const dispatchesQuery = useQuery({
    queryKey: ["operator", "edge-alerts", "dispatches"],
    enabled: isOperator === true,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DispatchRow[]> => {
      const { data, error } = await supabase
        .from("edge_metrics_alert_dispatches")
        .select(
          "fn, metric, last_fired_at, last_value, last_threshold, last_requests_in_window, fire_count, updated_at",
        )
        .order("last_fired_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as DispatchRow[];
    },
  });

  const attemptsQuery = useQuery({
    queryKey: ["operator", "edge-alerts", "attempts"],
    enabled: isOperator === true,
    refetchInterval: 60_000,
    queryFn: async (): Promise<WebhookAttemptRow[]> => {
      const { data, error } = await supabase
        .from("edge_metrics_webhook_attempts")
        .select(
          "id, dispatch_id, fn, metric, attempt, outcome, status_code, ok, transient, error, delay_before_ms, duration_ms, value, threshold, requests_in_window, request_id, attempted_at",
        )
        .order("attempted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as WebhookAttemptRow[];
    },
  });

  const cooldownMinutes = liveQuery.data?.thresholds.cooldownMinutes ?? null;

  const dispatchesWithExpiry = useMemo(() => {
    const rows = dispatchesQuery.data ?? [];
    return rows.map((r) => {
      const lastMs = Date.parse(r.last_fired_at);
      const expiresAt =
        cooldownMinutes !== null && Number.isFinite(lastMs)
          ? new Date(lastMs + cooldownMinutes * 60_000).toISOString()
          : null;
      const active = expiresAt !== null ? Date.parse(expiresAt) > now : false;
      return { ...r, expires_at: expiresAt, cooldown_active: active };
    });
  }, [dispatchesQuery.data, cooldownMinutes, now]);

  const searchNeedle = search.trim().toLowerCase();

  const matchesCommonFilters = (fn: string, metric: string) => {
    if (searchNeedle && !fn.toLowerCase().includes(searchNeedle)) return false;
    if (metricFilter !== "all" && metric !== metricFilter) return false;
    return true;
  };

  const timeCutoff = timeFilter === "all" ? null : now - TIME_WINDOW_MS[timeFilter];

  const filteredFired = useMemo(
    () => (liveQuery.data?.fired ?? []).filter((b) => matchesCommonFilters(b.fn, b.metric)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveQuery.data, searchNeedle, metricFilter],
  );

  const filteredSuppressed = useMemo(
    () =>
      (liveQuery.data?.suppressed ?? []).filter((b) => {
        if (!matchesCommonFilters(b.fn, b.metric)) return false;
        if (timeCutoff !== null) {
          const t = Date.parse(b.last_fired_at);
          if (!Number.isFinite(t) || t < timeCutoff) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveQuery.data, searchNeedle, metricFilter, timeCutoff],
  );

  const filteredDispatches = useMemo(() => {
    return dispatchesWithExpiry.filter((r) => {
      if (!matchesCommonFilters(r.fn, r.metric)) return false;
      if (statusFilter === "active" && !r.cooldown_active) return false;
      if (statusFilter === "expired" && r.cooldown_active) return false;
      if (timeCutoff !== null) {
        const t = Date.parse(r.last_fired_at);
        if (!Number.isFinite(t) || t < timeCutoff) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchesWithExpiry, searchNeedle, metricFilter, statusFilter, timeCutoff]);

  const pageCount = Math.max(1, Math.ceil(filteredDispatches.length / PAGE_SIZE));

  useEffect(() => {
    if (dispatchPage >= pageCount) setDispatchPage(0);
  }, [pageCount, dispatchPage]);

  const pagedDispatches = filteredDispatches.slice(
    dispatchPage * PAGE_SIZE,
    dispatchPage * PAGE_SIZE + PAGE_SIZE,
  );

  const filteredAttempts = useMemo(() => {
    return (attemptsQuery.data ?? []).filter((r) => {
      if (!matchesCommonFilters(r.fn, r.metric)) return false;
      if (timeCutoff !== null) {
        const t = Date.parse(r.attempted_at);
        if (!Number.isFinite(t) || t < timeCutoff) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptsQuery.data, searchNeedle, metricFilter, timeCutoff]);

  const attemptsPageCount = Math.max(1, Math.ceil(filteredAttempts.length / PAGE_SIZE));

  useEffect(() => {
    if (attemptsPage >= attemptsPageCount) setAttemptsPage(0);
  }, [attemptsPageCount, attemptsPage]);

  const pagedAttempts = filteredAttempts.slice(
    attemptsPage * PAGE_SIZE,
    attemptsPage * PAGE_SIZE + PAGE_SIZE,
  );

  const activeCooldownCount = dispatchesWithExpiry.filter((r) => r.cooldown_active).length;

  const filtersActive =
    searchNeedle.length > 0 ||
    metricFilter !== "all" ||
    statusFilter !== "all" ||
    timeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setMetricFilter("all");
    setStatusFilter("all");
    setTimeFilter("all");
    setDispatchPage(0);
    setAttemptsPage(0);
  };

  const refresh = () => {
    setNow(Date.now());
    liveQuery.refetch();
    dispatchesQuery.refetch();
    attemptsQuery.refetch();
  };

  if (roleLoading) {
    return (
      <div className="container max-w-5xl py-10 text-sm text-muted-foreground">
        Checking operator access…
      </div>
    );
  }

  if (!isOperator) {
    return (
      <div className="container max-w-5xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>This page is only available to operators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const live = liveQuery.data;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edge alerts</h1>
          <p className="text-sm text-muted-foreground">
            Live breach state from <code>edge-metrics-alert-check</code> and cooldown history from{" "}
            <code>edge_metrics_alert_dispatches</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EdgeAlertsDryRunDialog />
          <Button variant="outline" size="sm" onClick={refresh} disabled={liveQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${liveQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <Card className="sticky top-0 z-30 -mx-2 rounded-none border-x-0 bg-background/95 px-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:static sm:mx-0 sm:rounded-lg sm:border-x sm:px-0 sm:bg-card sm:shadow-none sm:backdrop-blur-none">
        <CardHeader className="hidden pb-3 sm:block">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Narrow by function name, metric, cooldown status, or time range. Applies to fired,
            suppressed, and cooldown tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 py-3 sm:py-6">
          {/* Mobile: compact row with search + toggle */}
          <div className="flex items-center gap-2 sm:hidden">
            <Input
              id="edge-alerts-search-mobile"
              placeholder="Search function…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDispatchPage(0);
              }}
              className="h-11 flex-1"
              inputMode="search"
            />
            <Button
              variant={mobileFiltersOpen || filtersActive ? "default" : "outline"}
              size="icon"
              aria-label={mobileFiltersOpen ? "Hide filters" : "Show filters"}
              aria-expanded={mobileFiltersOpen}
              className="h-11 w-11 shrink-0"
              onClick={() => setMobileFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </Button>
          </div>

          {/* Full filter grid: always on desktop, toggled on mobile */}
          <div
            className={`${mobileFiltersOpen ? "grid" : "hidden"} gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-5`}
          >
            <div className="hidden gap-1.5 sm:grid lg:col-span-2">
              <Label htmlFor="edge-alerts-search" className="text-xs">
                Function / rule
              </Label>
              <Input
                id="edge-alerts-search"
                placeholder="e.g. ai-coach"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setDispatchPage(0);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Metric</Label>
              <Select
                value={metricFilter}
                onValueChange={(v) => {
                  setMetricFilter(v as MetricFilter);
                  setDispatchPage(0);
                }}
              >
                <SelectTrigger className="h-11 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All metrics</SelectItem>
                  <SelectItem value="rpc_error_count">RPC error count</SelectItem>
                  <SelectItem value="rpc_error_rate">RPC error rate</SelectItem>
                  <SelectItem value="startup_import_failed">Startup import failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as StatusFilter);
                  setDispatchPage(0);
                }}
              >
                <SelectTrigger className="h-11 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Cooldown active</SelectItem>
                  <SelectItem value="expired">Cooldown expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Last fired</Label>
              <Select
                value={timeFilter}
                onValueChange={(v) => {
                  setTimeFilter(v as TimeFilter);
                  setDispatchPage(0);
                }}
              >
                <SelectTrigger className="h-11 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="1h">Last 1 hour</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {filtersActive ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {filteredDispatches.length}/{dispatchesWithExpiry.length} dispatch
                {" · "}
                {filteredFired.length} fired · {filteredSuppressed.length} suppressed
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>


      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Fired this check
            </CardDescription>
            <CardTitle className="text-3xl">{filteredFired.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Breaches that passed cooldown and were dispatched to the webhook.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BellOff className="h-4 w-4" /> Suppressed by cooldown
            </CardDescription>
            <CardTitle className="text-3xl">{filteredSuppressed.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Breaches skipped because they fired within the last {cooldownMinutes ?? "?"} min.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Active cooldowns
            </CardDescription>
            <CardTitle className="text-3xl">{activeCooldownCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            (fn, metric) pairs currently inside their cooldown window.
          </CardContent>
        </Card>
      </div>

      {liveQuery.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Live check failed
            </CardTitle>
            <CardDescription>{(liveQuery.error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current window</CardTitle>
          <CardDescription>
            {live
              ? `Last ${live.window_minutes} min · ${live.sampled_events} events sampled · invoked via ${live.invoked_via}`
              : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4" /> Fired ({filteredFired.length})
            </h2>
            {filteredFired.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {filtersActive
                  ? "No fired breaches match the current filters."
                  : "No breaches fired in this window."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Function</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFired.map((b) => (
                    <TableRow key={`${b.fn}::${b.metric}`}>
                      <TableCell className="font-mono text-xs">{b.fn}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{metricLabel(b.metric)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatValue(b.metric, b.value)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatValue(b.metric, b.threshold)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {b.requests_in_window}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium flex items-center gap-2">
              <BellOff className="h-4 w-4" /> Suppressed by cooldown ({filteredSuppressed.length})
            </h2>
            {filteredSuppressed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {filtersActive
                  ? "No suppressed breaches match the current filters."
                  : "Nothing suppressed — every breach in this window would fire."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Function</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Last fired</TableHead>
                    <TableHead>Eligible again</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppressed.map((b) => (
                    <TableRow key={`${b.fn}::${b.metric}`}>
                      <TableCell className="font-mono text-xs">{b.fn}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{metricLabel(b.metric)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatValue(b.metric, b.value)}</TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground"
                        title={formatAbsolute(b.last_fired_at)}
                      >
                        {formatRelative(b.last_fired_at, now)}
                      </TableCell>
                      <TableCell className="text-xs" title={formatAbsolute(b.next_eligible_at)}>
                        {formatRelative(b.next_eligible_at, now)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cooldown state</CardTitle>
          <CardDescription>
            Persisted dispatch rows. Cooldown expiry = last_fired_at + {cooldownMinutes ?? "?"} min
            (from the alert function config).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dispatchesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading dispatch history…</p>
          ) : dispatchesQuery.error ? (
            <p className="text-sm text-destructive">{(dispatchesQuery.error as Error).message}</p>
          ) : filteredDispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {dispatchesWithExpiry.length === 0
                ? "No dispatches recorded yet."
                : "No dispatch rows match the current filters."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Function</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Fires</TableHead>
                    <TableHead className="text-right">Last value</TableHead>
                    <TableHead>Last fired</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedDispatches.map((r) => (
                    <TableRow key={`${r.fn}::${r.metric}`}>
                      <TableCell className="font-mono text-xs">{r.fn}</TableCell>
                      <TableCell>{metricLabel(r.metric)}</TableCell>
                      <TableCell className="text-right">{r.fire_count ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatValue(r.metric, r.last_value ?? undefined)}
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground"
                        title={formatAbsolute(r.last_fired_at)}
                      >
                        {formatRelative(r.last_fired_at, now)}
                      </TableCell>
                      <TableCell>
                        {r.cooldown_active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="outline">Expired</Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-xs"
                        title={r.expires_at ? formatAbsolute(r.expires_at) : ""}
                      >
                        {r.expires_at ? formatRelative(r.expires_at, now) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 flex flex-col items-stretch gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center sm:text-left">
                  Showing {dispatchPage * PAGE_SIZE + 1}–
                  {Math.min(filteredDispatches.length, (dispatchPage + 1) * PAGE_SIZE)} of{" "}
                  {filteredDispatches.length}
                </span>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    onClick={() => setDispatchPage(0)}
                    disabled={dispatchPage === 0}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                    onClick={() => setDispatchPage((p) => Math.max(0, p - 1))}
                    disabled={dispatchPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <span className="tabular-nums whitespace-nowrap px-1">
                    {dispatchPage + 1} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                    onClick={() => setDispatchPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={dispatchPage >= pageCount - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    onClick={() => setDispatchPage(pageCount - 1)}
                    disabled={dispatchPage >= pageCount - 1}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook attempts</CardTitle>
          <CardDescription>
            Per-attempt delivery history from <code>edge_metrics_webhook_attempts</code>. Each
            breach fire produces one row per attempt (delivered, transient retry, permanent
            failure, or exhausted after retries).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attemptsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading attempt history…</p>
          ) : attemptsQuery.error ? (
            <p className="text-sm text-destructive">
              {(attemptsQuery.error as Error).message}
            </p>
          ) : filteredAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {(attemptsQuery.data ?? []).length === 0
                ? "No webhook attempts recorded yet."
                : "No attempts match the current filters."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Function</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Attempt</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead className="text-right">Delay</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedAttempts.map((r) => {
                    const variant: "default" | "destructive" | "secondary" | "outline" =
                      r.outcome === "delivered"
                        ? "default"
                        : r.outcome === "exhausted" || r.outcome === "permanent_failure"
                        ? "destructive"
                        : "secondary";
                    return (
                      <TableRow key={r.id}>
                        <TableCell
                          className="text-xs text-muted-foreground whitespace-nowrap"
                          title={`${formatAbsolute(r.attempted_at)}${
                            r.request_id ? ` · req ${r.request_id}` : ""
                          }`}
                        >
                          {formatRelative(r.attempted_at, now)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.fn}</TableCell>
                        <TableCell className="text-xs">{metricLabel(r.metric)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.attempt}</TableCell>
                        <TableCell>
                          <Badge variant={variant}>{r.outcome.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.status_code ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.delay_before_ms}ms
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.duration_ms}ms
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[16rem] truncate"
                          title={r.error ?? ""}
                        >
                          {r.error ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-3 flex flex-col items-stretch gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center sm:text-left">
                  Showing {attemptsPage * PAGE_SIZE + 1}–
                  {Math.min(filteredAttempts.length, (attemptsPage + 1) * PAGE_SIZE)} of{" "}
                  {filteredAttempts.length}
                </span>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    onClick={() => setAttemptsPage(0)}
                    disabled={attemptsPage === 0}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                    onClick={() => setAttemptsPage((p) => Math.max(0, p - 1))}
                    disabled={attemptsPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <span className="tabular-nums whitespace-nowrap px-1">
                    {attemptsPage + 1} / {attemptsPageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 sm:h-9 sm:flex-none"
                    onClick={() =>
                      setAttemptsPage((p) => Math.min(attemptsPageCount - 1, p + 1))
                    }
                    disabled={attemptsPage >= attemptsPageCount - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    onClick={() => setAttemptsPage(attemptsPageCount - 1)}
                    disabled={attemptsPage >= attemptsPageCount - 1}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
