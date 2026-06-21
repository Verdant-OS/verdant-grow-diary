import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRole } from "@/hooks/useHasRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatPaddleProcessingPlan,
  formatPaddleProcessingStatus,
  parsePaddleProcessingAuditResponse,
  type PaddleProcessingAuditViewModel,
} from "@/lib/paddleEventProcessingAuditViewModel";

type PaddleAuditRpcClient = {
  rpc: (
    fn: "paddle_event_processing_operator_audit",
    args: { p_limit: number },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const ROW_LIMIT = 50;

function StatusPill({ status }: { status: "processed" | "ignored" | "blocked" | "failed" }) {
  const cls: Record<typeof status, string> = {
    processed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ignored: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    blocked: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cls[status]}`}>
      {formatPaddleProcessingStatus(status)}
    </span>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

async function fetchProcessingAudit(): Promise<PaddleProcessingAuditViewModel> {
  const { data, error } = await (supabase as unknown as PaddleAuditRpcClient).rpc(
    "paddle_event_processing_operator_audit",
    { p_limit: ROW_LIMIT },
  );
  if (error) throw new Error(error.message ?? "paddle_processing_audit_failed");
  return parsePaddleProcessingAuditResponse(data);
}

export default function OperatorPaddleProcessingAudit() {
  const role = useHasRole("operator");
  const auditQuery = useQuery({
    queryKey: ["operator", "paddle-processing-audit", ROW_LIMIT],
    queryFn: fetchProcessingAudit,
    enabled: role.granted,
    staleTime: 30_000,
  });

  const audit = auditQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <section className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operator audit
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Paddle processing audit
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Read-only view of verified Paddle event processing outcomes. This surface shows sanitized
              processing state only: no raw payload, no provider customer IDs, no subscription IDs, and no
              entitlement writes.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => auditQuery.refetch()}
            disabled={!role.granted || auditQuery.isFetching}
          >
            {auditQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </section>

      {role.status === "loading" && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Checking operator access…</CardContent>
        </Card>
      )}

      {role.status === "unauthenticated" && (
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Operator audit views require an authenticated operator session.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {(role.status === "denied" || role.status === "error") && (
        <Card>
          <CardHeader>
            <CardTitle>Operator access required</CardTitle>
            <CardDescription>
              This audit surface is hidden from non-operator accounts. No processing data was requested.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && auditQuery.isError && (
        <Card>
          <CardHeader>
            <CardTitle>Audit lookup failed</CardTitle>
            <CardDescription>
              The read-only processing audit RPC failed. No entitlement data was changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {auditQuery.error instanceof Error ? auditQuery.error.message : "Unknown error"}
          </CardContent>
        </Card>
      )}

      {role.granted && audit && !audit.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Audit unavailable</CardTitle>
            <CardDescription>{audit.reasonLabel ?? "Operator audit is not available."}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && audit?.ok && (
        <>
          <section className="grid gap-3 md:grid-cols-5" aria-label="Processing counts">
            <CountCard label="Total" value={audit.counts.total} />
            <CountCard label="Processed" value={audit.counts.processed} />
            <CountCard label="Ignored" value={audit.counts.ignored} />
            <CountCard label="Blocked" value={audit.counts.blocked} />
            <CountCard label="Failed" value={audit.counts.failed} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Latest processing rows</CardTitle>
              <CardDescription>
                Showing up to {audit.limit || ROW_LIMIT} sanitized rows. Event IDs, provider IDs, details JSON,
                and raw payload are intentionally hidden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.latest.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  No processing rows recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Processed</th>
                        <th className="py-2 pr-3">Event</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Reason</th>
                        <th className="py-2 pr-3">Plan</th>
                        <th className="py-2 pr-3">Candidate status</th>
                        <th className="py-2 pr-3">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.latest.map((row, index) => (
                        <tr key={`${row.processedAt ?? "row"}-${index}`} className="border-b last:border-0">
                          <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                            {row.processedAt ?? "—"}
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs">
                            <div>{row.eventType}</div>
                            <div className="text-muted-foreground">{row.environment}</div>
                          </td>
                          <td className="py-3 pr-3"><StatusPill status={row.status} /></td>
                          <td className="max-w-[260px] py-3 pr-3 text-muted-foreground">
                            {row.reasonLabel}
                          </td>
                          <td className="py-3 pr-3">{formatPaddleProcessingPlan(row.candidatePlanId)}</td>
                          <td className="py-3 pr-3">{row.candidateStatus ?? "—"}</td>
                          <td className="py-3 pr-3 text-xs text-muted-foreground">
                            {row.isFounderCandidate ? "Founder candidate" : "—"}
                            {row.cancelAtPeriodEnd ? " · cancel at period end" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
