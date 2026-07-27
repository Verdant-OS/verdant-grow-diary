/**
 * EdgeAlertsDryRunDialog — operator-only tool to simulate a breach against
 * `edge-metrics-alert-check` without posting the webhook or writing to
 * `edge_metrics_alert_dispatches`.
 *
 * The edge function honors `{ dry_run: true, simulate: { fn, metric, value?,
 * requests_in_window? } }` on POST: it evaluates real events, injects the
 * synthetic breach, runs cooldown partitioning against real dispatch rows,
 * and returns fired/suppressed without side effects.
 */
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MetricKey = "rpc_error_count" | "rpc_error_rate" | "startup_import_failed";

interface SimulatedBreach {
  fn: string;
  metric: MetricKey;
  value: number;
  threshold: number;
  requests_in_window: number;
}

interface DryRunResult {
  ok: boolean;
  dry_run: boolean;
  simulated: SimulatedBreach | null;
  fired: SimulatedBreach[];
  suppressed: (SimulatedBreach & { last_fired_at: string; next_eligible_at: string })[];
  thresholds: { cooldownMinutes: number };
  invoked_via: string;
}

const METRIC_LABELS: Record<MetricKey, string> = {
  rpc_error_count: "RPC error count",
  rpc_error_rate: "RPC error rate",
  startup_import_failed: "Startup import failed",
};

function formatValue(metric: MetricKey, value: number): string {
  if (metric === "rpc_error_rate") return `${(value * 100).toFixed(1)}%`;
  return String(value);
}

function isSimulated(row: { fn: string; metric: string }, sim: SimulatedBreach | null): boolean {
  return !!sim && row.fn === sim.fn && row.metric === sim.metric;
}

export default function EdgeAlertsDryRunDialog() {
  const [open, setOpen] = useState(false);
  const [fn, setFn] = useState("");
  const [metric, setMetric] = useState<MetricKey>("rpc_error_count");
  const [valueOverride, setValueOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!fn.trim()) {
      setError("Function name is required.");
      return;
    }
    const parsedValue = valueOverride.trim() === "" ? undefined : Number(valueOverride);
    if (parsedValue !== undefined && !Number.isFinite(parsedValue)) {
      setError("Value override must be a number.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<DryRunResult>(
        "edge-metrics-alert-check",
        {
          method: "POST",
          body: {
            dry_run: true,
            simulate: {
              fn: fn.trim(),
              metric,
              ...(parsedValue !== undefined ? { value: parsedValue } : {}),
            },
          },
        },
      );
      if (fnError) throw fnError;
      if (!data) throw new Error("empty response");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FlaskConical className="mr-2 h-4 w-4" />
          Dry-run evaluate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dry-run breach evaluation</DialogTitle>
          <DialogDescription>
            Simulates a breach for the chosen function + metric. Runs cooldown partitioning against
            real dispatch rows, but does <strong>not</strong> post the webhook or write to
            <code className="mx-1">edge_metrics_alert_dispatches</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="dry-run-fn">Function name</Label>
            <Input
              id="dry-run-fn"
              placeholder="e.g. ai-coach"
              value={fn}
              onChange={(e) => setFn(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rpc_error_count">RPC error count</SelectItem>
                <SelectItem value="rpc_error_rate">RPC error rate (0–1)</SelectItem>
                <SelectItem value="startup_import_failed">Startup import failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dry-run-value">Value override (optional)</Label>
            <Input
              id="dry-run-value"
              type="number"
              step="any"
              placeholder="Defaults to threshold"
              value={valueOverride}
              onChange={(e) => setValueOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the current threshold as the breach value.
            </p>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Result</span>
              <Badge variant={result.dry_run ? "secondary" : "destructive"}>
                {result.dry_run ? "dry-run · no side effects" : "not a dry-run"}
              </Badge>
            </div>
            {result.simulated ? (
              <p className="text-xs text-muted-foreground">
                Injected {METRIC_LABELS[result.simulated.metric]} = {" "}
                {formatValue(result.simulated.metric, result.simulated.value)} for{" "}
                <code>{result.simulated.fn}</code> (threshold{" "}
                {formatValue(result.simulated.metric, result.simulated.threshold)}).
              </p>
            ) : null}
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Would fire</Badge>
                <span className="text-xs text-muted-foreground">
                  {result.fired.length} breach{result.fired.length === 1 ? "" : "es"} (incl. real)
                </span>
              </div>
              <ul className="ml-1 text-xs">
                {result.fired.length === 0 ? (
                  <li className="text-muted-foreground">— none —</li>
                ) : (
                  result.fired.map((b) => (
                    <li key={`fire-${b.fn}-${b.metric}`}>
                      <code>{b.fn}</code> · {METRIC_LABELS[b.metric]} ={" "}
                      {formatValue(b.metric, b.value)}
                      {isSimulated(b, result.simulated) ? (
                        <span className="ml-1 text-primary">(simulated)</span>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Suppressed by cooldown</Badge>
                <span className="text-xs text-muted-foreground">{result.suppressed.length}</span>
              </div>
              <ul className="ml-1 text-xs">
                {result.suppressed.length === 0 ? (
                  <li className="text-muted-foreground">— none —</li>
                ) : (
                  result.suppressed.map((b) => (
                    <li key={`sup-${b.fn}-${b.metric}`}>
                      <code>{b.fn}</code> · {METRIC_LABELS[b.metric]} — eligible again at{" "}
                      {new Date(b.next_eligible_at).toISOString().slice(0, 19)}Z
                      {isSimulated(b, result.simulated) ? (
                        <span className="ml-1 text-primary">(simulated)</span>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <p className="text-[11px] text-muted-foreground">
              invoked_via: <code>{result.invoked_via}</code>
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={reset} disabled={submitting || (!result && !error)}>
            Reset
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run dry-run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
