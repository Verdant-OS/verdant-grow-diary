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
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, BellOff, CheckCircle2, Clock, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface Breach {
  fn: string;
  metric: "rpc_error_count" | "rpc_error_rate" | "startup_import_failed";
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
    noindex: true,
  });

  const { hasRole: isOperator, loading: roleLoading } = useHasRole("operator");
  const [now, setNow] = useState<number>(() => Date.now());

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
        .limit(200);
      if (error) throw error;
      return (data ?? []) as DispatchRow[];
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
      const active =
        expiresAt !== null ? Date.parse(expiresAt) > now : false;
      return { ...r, expires_at: expiresAt, cooldown_active: active };
    });
  }, [dispatchesQuery.data, cooldownMinutes, now]);

  const activeCooldownCount = dispatchesWithExpiry.filter((r) => r.cooldown_active).length;

  const refresh = () => {
    setNow(Date.now());
    liveQuery.refetch();
    dispatchesQuery.refetch();
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
            <CardDescription>
              This page is only available to operators.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const live = liveQuery.data;
  const fired = live?.fired ?? [];
  const suppressed = live?.suppressed ?? [];

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edge alerts</h1>
          <p className="text-sm text-muted-foreground">
            Live breach state from <code>edge-metrics-alert-check</code> and
            cooldown history from <code>edge_metrics_alert_dispatches</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={liveQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${liveQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Fired this check
            </CardDescription>
            <CardTitle className="text-3xl">{fired.length}</CardTitle>
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
            <CardTitle className="text-3xl">{suppressed.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Breaches skipped because they fired within the last{" "}
            {cooldownMinutes ?? "?"} min.
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
            <CardDescription>
              {(liveQuery.error as Error).message}
            </CardDescription>
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
              <Bell className="h-4 w-4" /> Fired ({fired.length})
            </h2>
            {fired.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No breaches
                fired in this window.
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
                  {fired.map((b) => (
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
              <BellOff className="h-4 w-4" /> Suppressed by cooldown ({suppressed.length})
            </h2>
            {suppressed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing suppressed — every breach in this window would fire.
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
                  {suppressed.map((b) => (
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
                      <TableCell
                        className="text-xs"
                        title={formatAbsolute(b.next_eligible_at)}
                      >
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
            All persisted dispatch rows. Cooldown expiry = last_fired_at +{" "}
            {cooldownMinutes ?? "?"} min (from the alert function config).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dispatchesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading dispatch history…</p>
          ) : dispatchesQuery.error ? (
            <p className="text-sm text-destructive">
              {(dispatchesQuery.error as Error).message}
            </p>
          ) : dispatchesWithExpiry.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dispatches recorded yet.
            </p>
          ) : (
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
                {dispatchesWithExpiry.map((r) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
