/**
 * EdgeAlertsBreachDrilldownDialog — read-only breach drilldown for operators.
 *
 * Renders the full breach payload for one (fn, metric) pair:
 *  - dispatch snapshot (last fire, cooldown expiry, fire count)
 *  - cooldown logic (last_fired_at + cooldown_minutes = next eligible)
 *  - full webhook retry history (all attempts for the same fn+metric)
 *  - matching live breach entries (fired / suppressed) if present in the
 *    current alert-check window
 *
 * SAFETY: presentation-only. All reads are already RLS-gated on the parent
 * queries; this component never issues its own network calls.
 */
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AttemptOutcome = "delivered" | "transient_failure" | "permanent_failure" | "exhausted";

export interface DrilldownDispatch {
  fn: string;
  metric: string;
  last_fired_at: string;
  last_value: number | null;
  last_threshold: number | null;
  last_requests_in_window: number | null;
  fire_count: number | null;
  updated_at: string;
  expires_at: string | null;
  cooldown_active: boolean;
}

export interface DrilldownAttempt {
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

export interface DrilldownLiveBreach {
  fn: string;
  metric: string;
  value: number;
  threshold: number;
  requests_in_window: number;
  last_fired_at?: string;
  next_eligible_at?: string;
  cooldown_remaining_seconds?: number;
  suppressed?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fn: string | null;
  metric: string | null;
  dispatch: DrilldownDispatch | null;
  attempts: DrilldownAttempt[];
  liveBreaches: DrilldownLiveBreach[];
  cooldownMinutes: number | null;
  now: number;
  metricLabel: (m: string) => string;
  formatValue: (m: string, v: number | null | undefined) => string;
  formatAbsolute: (iso: string) => string;
  formatRelative: (iso: string, now: number) => string;
}

function outcomeVariant(
  outcome: AttemptOutcome,
): "default" | "destructive" | "secondary" | "outline" {
  if (outcome === "delivered") return "default";
  if (outcome === "exhausted" || outcome === "permanent_failure") return "destructive";
  return "secondary";
}

export default function EdgeAlertsBreachDrilldownDialog({
  open,
  onOpenChange,
  fn,
  metric,
  dispatch,
  attempts,
  liveBreaches,
  cooldownMinutes,
  now,
  metricLabel,
  formatValue,
  formatAbsolute,
  formatRelative,
}: Props) {
  const orderedAttempts = useMemo(
    () => [...attempts].sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at)),
    [attempts],
  );

  const summary = useMemo(() => {
    const total = attempts.length;
    let delivered = 0;
    let transient = 0;
    let permanent = 0;
    let exhausted = 0;
    for (const a of attempts) {
      if (a.outcome === "delivered") delivered += 1;
      else if (a.outcome === "transient_failure") transient += 1;
      else if (a.outcome === "permanent_failure") permanent += 1;
      else if (a.outcome === "exhausted") exhausted += 1;
    }
    return { total, delivered, transient, permanent, exhausted };
  }, [attempts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{fn ?? "—"}</span>
            <Badge variant="outline">{metric ? metricLabel(metric) : "—"}</Badge>
          </DialogTitle>
          <DialogDescription>
            Full breach payload, cooldown logic, and webhook retry history for this function/metric
            pair.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Breach payload
              </h3>
              {dispatch ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">Fire count</dt>
                  <dd className="tabular-nums">{dispatch.fire_count ?? "—"}</dd>
                  <dt className="text-muted-foreground">Last value</dt>
                  <dd className="tabular-nums">
                    {formatValue(dispatch.metric, dispatch.last_value ?? undefined)}
                  </dd>
                  <dt className="text-muted-foreground">Last threshold</dt>
                  <dd className="tabular-nums">
                    {formatValue(dispatch.metric, dispatch.last_threshold ?? undefined)}
                  </dd>
                  <dt className="text-muted-foreground">Requests in window</dt>
                  <dd className="tabular-nums">{dispatch.last_requests_in_window ?? "—"}</dd>
                  <dt className="text-muted-foreground">Last fired</dt>
                  <dd className="tabular-nums" title={formatAbsolute(dispatch.last_fired_at)}>
                    {formatRelative(dispatch.last_fired_at, now)} ·{" "}
                    <span className="text-muted-foreground">
                      {formatAbsolute(dispatch.last_fired_at)}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">Row updated</dt>
                  <dd className="tabular-nums" title={formatAbsolute(dispatch.updated_at)}>
                    {formatRelative(dispatch.updated_at, now)}
                  </dd>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No persisted dispatch row for this pair yet. It has not fired since the cooldown
                  table began recording.
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cooldown logic
              </h3>
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-mono text-[11px] leading-relaxed">
                  cooldown_expiry = last_fired_at + cooldown_minutes
                  {cooldownMinutes !== null ? ` (${cooldownMinutes} min)` : ""}
                </div>
                {dispatch ? (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Status</span>
                    <span>
                      {dispatch.cooldown_active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Expired</Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground">Expires</span>
                    <span
                      className="tabular-nums"
                      title={dispatch.expires_at ? formatAbsolute(dispatch.expires_at) : ""}
                    >
                      {dispatch.expires_at
                        ? `${formatRelative(dispatch.expires_at, now)} · ${formatAbsolute(dispatch.expires_at)}`
                        : "—"}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    No cooldown state — nothing to suppress.
                  </p>
                )}
              </div>
            </section>

            {liveBreaches.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Current window ({liveBreaches.length})
                </h3>
                <div className="space-y-2">
                  {liveBreaches.map((b, i) => (
                    <div
                      key={`${b.fn}::${b.metric}::${i}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs"
                    >
                      <Badge variant={b.suppressed ? "secondary" : "destructive"}>
                        {b.suppressed ? "Suppressed" : "Fired"}
                      </Badge>
                      <span className="tabular-nums">
                        value {formatValue(b.metric, b.value)} · threshold{" "}
                        {formatValue(b.metric, b.threshold)} · {b.requests_in_window} req
                      </span>
                      {b.next_eligible_at ? (
                        <span
                          className="text-muted-foreground"
                          title={formatAbsolute(b.next_eligible_at)}
                        >
                          eligible {formatRelative(b.next_eligible_at, now)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Webhook retry history ({summary.total})
                </h3>
                {summary.total > 0 ? (
                  <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    <Badge variant="default">{summary.delivered} delivered</Badge>
                    {summary.transient > 0 ? (
                      <Badge variant="secondary">{summary.transient} transient</Badge>
                    ) : null}
                    {summary.permanent > 0 ? (
                      <Badge variant="destructive">{summary.permanent} permanent</Badge>
                    ) : null}
                    {summary.exhausted > 0 ? (
                      <Badge variant="destructive">{summary.exhausted} exhausted</Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {orderedAttempts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No webhook attempts recorded for this pair.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Attempt</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="text-right">Delay</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedAttempts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell
                          className="text-xs text-muted-foreground whitespace-nowrap"
                          title={`${formatAbsolute(a.attempted_at)}${
                            a.request_id ? ` · req ${a.request_id}` : ""
                          }`}
                        >
                          {formatRelative(a.attempted_at, now)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.attempt}</TableCell>
                        <TableCell>
                          <Badge variant={outcomeVariant(a.outcome)}>
                            {a.outcome.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {a.status_code ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {a.delay_before_ms}ms
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {a.duration_ms}ms
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[14rem] truncate"
                          title={a.error ?? ""}
                        >
                          {a.error ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
