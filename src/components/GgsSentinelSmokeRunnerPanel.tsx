/**
 * GgsSentinelSmokeRunnerPanel — dev/operator-only one-click read-only
 * smoke runner. Fetches recent sensor_readings + calls the
 * `get_latest_tent_sensor_snapshot` RPC, then runs the pure evaluator.
 *
 * READ-ONLY. NEVER inserts, updates, or deletes. NEVER creates Quick
 * Log entries. NEVER calls AI / alerts / Action Queue / device control.
 * NEVER renders raw_payload bodies.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  HelpCircle,
  Loader2,
  TimerOff,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import {
  evaluateGgsSentinelReadiness,
  GGS_SENTINEL_METRICS,
  GGS_METRIC_FRIENDLY_NAME,
  formatGgsWindowLabel,
  type GgsSentinelEvaluation,
  type GgsSentinelInputRow,
  type GgsSentinelSnapshot,
  type GgsSentinelMetricFreshness,
  type GgsFreshnessStatus,
} from "@/lib/ggsSentinelSmokeRunner";
import { SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";

const WINDOW_HOURS = 4;

export default function GgsSentinelSmokeRunnerPanel() {
  const { data: tents = [] } = useTents();
  const [tentId, setTentId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [evaluation, setEvaluation] = useState<GgsSentinelEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSmoke() {
    if (!tentId) return;
    setRunning(true);
    setError(null);
    setEvaluation(null);
    try {
      const sinceIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data: rows, error: rowsErr } = await supabase
        .from("sensor_readings")
        .select("metric, value, source, captured_at, raw_payload")
        .eq("tent_id", tentId)
        .in("metric", GGS_SENTINEL_METRICS as unknown as string[])
        .gte("captured_at", sinceIso)
        .order("captured_at", { ascending: false })
        .limit(200);
      if (rowsErr) throw rowsErr;

      const { data: snap, error: snapErr } = await supabase.rpc(
        "get_latest_tent_sensor_snapshot",
        { _tent_id: tentId },
      );
      if (snapErr) throw snapErr;

      const ev = evaluateGgsSentinelReadiness({
        rows: (rows ?? []) as GgsSentinelInputRow[],
        snapshot: (snap ?? null) as unknown as GgsSentinelSnapshot | null,
      });
      setEvaluation(ev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "smoke_runner_failed");
      setEvaluation({
        state: "BLOCKED_VALIDATION_ERROR",
        checks: [],
        safeMetrics: [],
        metricFreshness: [],
        snapshot: null,
        passed: false,
      });
    } finally {
      setRunning(false);
    }

  }

  const passed = evaluation?.passed === true;
  const stateBadgeVariant = useMemo(
    () => (passed ? "default" : "destructive"),
    [passed],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>GGS Sentinel smoke check</CardTitle>
        <CardDescription>
          Read-only. Confirms recent GGS rows + snapshot RPC + provenance + freshness for the
          selected tent. Does not write anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label>Tent</Label>
            <Select value={tentId} onValueChange={setTentId}>
              <SelectTrigger><SelectValue placeholder="Select tent" /></SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name ?? t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runSmoke} disabled={!tentId || running}>
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…</>
            ) : (
              "Run GGS Sentinel Smoke Check"
            )}
          </Button>
        </div>

        {!evaluation && !running && !error && (
          <Alert data-testid="ggs-sentinel-panel-not-run-yet">
            <Clock3 className="h-4 w-4" />
            <AlertTitle>Not run yet</AlertTitle>
            <AlertDescription>
              Select a tent and run the smoke check. Read-only — no alerts, Action Queue, or
              device control will be written.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Smoke runner error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}


        {evaluation && (
          <div className="space-y-3">
            <Alert variant={stateBadgeVariant === "default" ? "default" : "destructive"}>
              {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertTitle>{evaluation.state}</AlertTitle>
              <AlertDescription>
                {passed
                  ? "Live Sentinel sign-off can pass for this tent."
                  : "Sentinel sign-off blocked. Resolve the failing checks below."}
              </AlertDescription>
            </Alert>

            <ul className="divide-y rounded-md border">
              {evaluation.checks.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <div>{c.label}</div>
                    {c.detail && (
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                    )}
                  </div>
                  <CheckBadge status={c.status} />
                </li>
              ))}
            </ul>

            <GgsSentinelFreshnessGuidanceList metricFreshness={evaluation.metricFreshness} />

            {evaluation.safeMetrics.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Latest safe metric summary</h3>
                <ul className="divide-y rounded-md border text-sm">
                  {evaluation.safeMetrics.map((m) => (
                    <li key={m.metric} className="grid grid-cols-2 gap-2 px-3 py-2 md:grid-cols-5">
                      <span className="font-mono">{m.metric}</span>
                      <span className="font-mono">{m.value}</span>
                      <span><Badge variant="outline">{m.source}</Badge></span>
                      <span><Badge variant="secondary">{m.vendor ?? "—"}</Badge></span>
                      <span className="text-xs text-muted-foreground">
                        {m.captured_at} ({m.age_seconds}s ago)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.snapshot && (
              <div className="rounded-md border p-3 text-sm">
                <h3 className="mb-2 font-medium">Snapshot RPC</h3>
                <div className="grid gap-1 md:grid-cols-3">
                  <div>moisture: <span className="font-mono">{fmt(evaluation.snapshot.soil_moisture)}</span></div>
                  <div>soil_temp: <span className="font-mono">{fmt(evaluation.snapshot.soil_temp)}</span></div>
                  <div>soil_ec: <span className="font-mono">{fmt(evaluation.snapshot.soil_ec)}</span></div>
                  <div>source: <span className="font-mono">{evaluation.snapshot.source ?? "—"}</span></div>
                  <div>captured_at: <span className="font-mono">{evaluation.snapshot.captured_at ?? "—"}</span></div>
                  <div>age: <span className="font-mono">{evaluation.snapshot.age_seconds ?? "—"}s</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GgsSentinelFreshnessGuidanceList({
  metricFreshness,
}: {
  metricFreshness: GgsSentinelMetricFreshness[];
}) {
  if (metricFreshness.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Freshness guidance</h3>
        <span className="text-xs text-muted-foreground">
          Freshness window: {formatGgsWindowLabel(SPIDER_FARMER_GGS_STALE_MS)}
        </span>
      </div>
      <p className="mb-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-testid="ggs-freshness-priority-note">
        Freshness guidance explains metric timing only; result-state priority still comes from the smoke-check result above.
      </p>
      <TooltipProvider delayDuration={150}>
        <ul className="divide-y rounded-md border text-xs sm:text-sm" data-testid="ggs-freshness-compact-list">
          {metricFreshness.map((f) => (
            <li
              key={f.metric}
              className={`grid grid-cols-[minmax(6.5rem,1.15fr)_auto_auto_minmax(7.5rem,1fr)] items-center gap-2 px-2 py-2 sm:px-3 ${freshnessRowClass(f.freshnessStatus)}`}
              data-testid={`ggs-freshness-row-${f.freshnessStatus}`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <FreshnessStatusIcon status={f.freshnessStatus} />
                <span className="truncate font-medium">{GGS_METRIC_FRIENDLY_NAME[f.metric]}</span>
                <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                  {f.metric}
                </span>
              </div>
              <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground" title={f.capturedAt ?? "No row found"}>
                {f.ageLabel}
              </span>
              <FreshnessBadge freshness={f} />
              <span className="truncate text-[11px] text-muted-foreground" title={f.nextActionLabel}>
                {f.nextActionLabel}
              </span>
            </li>
          ))}
        </ul>
      </TooltipProvider>
    </div>
  );
}

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

function CheckBadge({ status }: { status: "pass" | "fail" | "warn" | "skipped" }) {
  if (status === "pass") return <Badge variant="default">pass</Badge>;
  if (status === "fail") return <Badge variant="destructive">fail</Badge>;
  if (status === "warn") return <Badge variant="secondary">warn</Badge>;
  return <Badge variant="outline">skipped</Badge>;
}

function freshnessRowClass(status: GgsFreshnessStatus): string {
  if (status === "stale") return "border-l-4 border-l-destructive bg-destructive/10";
  if (status === "missing") return "border-l-4 border-l-muted-foreground/60 border-dashed bg-muted/40";
  if (status === "aging") return "border-l-4 border-l-amber-500/70 bg-amber-500/10";
  return "border-l-4 border-l-emerald-500/70 bg-emerald-500/10";
}

function FreshnessStatusIcon({ status }: { status: GgsFreshnessStatus }) {
  if (status === "stale") {
    return <TimerOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="row expired" />;
  }
  if (status === "missing") {
    return <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="no row found" />;
  }
  if (status === "aging") {
    return <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="row aging" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="row fresh" />;
}

function FreshnessBadge({ freshness }: { freshness: GgsSentinelMetricFreshness }) {
  const s = freshness.freshnessStatus;
  const label = s === "aging" ? "aging" : s;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label={`${label} freshness details`}
          data-testid={`ggs-freshness-badge-${s}`}
        >
          <Badge variant={freshnessBadgeVariant(s)} className={freshnessBadgeClass(s)}>
            <HelpCircle className="mr-1 h-3 w-3" aria-hidden="true" />
            {label}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {freshnessTooltip(freshness)}
      </TooltipContent>
    </Tooltip>
  );
}

function freshnessBadgeVariant(status: GgsFreshnessStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "fresh") return "default";
  if (status === "aging") return "secondary";
  if (status === "stale") return "destructive";
  return "outline";
}

function freshnessBadgeClass(status: GgsFreshnessStatus): string {
  if (status === "missing") return "border-dashed text-muted-foreground";
  if (status === "aging") return "border-amber-500/50 text-amber-700 dark:text-amber-300";
  return "";
}

function freshnessTooltip(freshness: GgsSentinelMetricFreshness): string {
  const window = freshness.freshnessWindowLabel;
  const base = `${window} window: fresh through 75% of the window, aging after 75% until ${window}, stale after ${window}.`;
  if (freshness.freshnessStatus === "missing") {
    return `${base} Missing means no row was found for this metric in the checked rows.`;
  }
  return `${base} This ${GGS_METRIC_FRIENDLY_NAME[freshness.metric]} row is ${freshness.freshnessStatus} (${freshness.ageLabel}).`;
}
