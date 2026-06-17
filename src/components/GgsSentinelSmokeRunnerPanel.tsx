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
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
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

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

function CheckBadge({ status }: { status: "pass" | "fail" | "warn" | "skipped" }) {
  if (status === "pass") return <Badge variant="default">pass</Badge>;
  if (status === "fail") return <Badge variant="destructive">fail</Badge>;
  if (status === "warn") return <Badge variant="secondary">warn</Badge>;
  return <Badge variant="outline">skipped</Badge>;
}
