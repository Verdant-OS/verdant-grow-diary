import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRole } from "@/hooks/useHasRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  parseBillingSubscriptionUpdateAuditResponse,
  type BillingSubscriptionUpdateAuditStatus,
  type BillingSubscriptionUpdateAuditViewModel,
} from "@/lib/billingSubscriptionUpdateAuditViewModel";

type SubUpdateAuditRpcClient = {
  rpc(
    fn: "billing_subscription_update_operator_audit",
    args: { p_limit: number },
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

const LIMIT_OPTIONS = [25, 50, 100] as const;
type LimitOption = typeof LIMIT_OPTIONS[number];

function StatusPill({ status, label }: { status: BillingSubscriptionUpdateAuditStatus; label: string }) {
  const cls: Record<BillingSubscriptionUpdateAuditStatus, string> = {
    created: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    updated: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    noop: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    blocked: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    skipped: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cls[status]}`}>
      {label}
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

async function fetchSubUpdateAudit(limit: number): Promise<BillingSubscriptionUpdateAuditViewModel> {
  const { data, error } = await (supabase as unknown as SubUpdateAuditRpcClient).rpc(
    "billing_subscription_update_operator_audit",
    { p_limit: limit },
  );
  if (error) throw new Error(error.message ?? "billing_subscription_update_audit_failed");
  return parseBillingSubscriptionUpdateAuditResponse(data);
}

export default function OperatorBillingSubscriptionUpdateAudit() {
  const role = useHasRole("operator");
  const [limit, setLimit] = useState<LimitOption>(50);

  const auditQuery = useQuery({
    queryKey: ["operator", "billing-subscription-update-audit", limit],
    queryFn: () => fetchSubUpdateAudit(limit),
    enabled: role.granted,
    staleTime: 30_000,
  });

  const audit = auditQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <section className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operator Mode
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Subscription updater audit
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Sanitized, read-only view of subscription updater outcomes. Rows show status, reason,
              candidate plan, and subscription status only. Raw provider identifiers, webhook bodies,
              and internal extra fields are intentionally hidden.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="sub-update-audit-limit">
              Rows
            </label>
            <select
              id="sub-update-audit-limit"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) as LimitOption)}
              disabled={!role.granted || auditQuery.isFetching}
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => auditQuery.refetch()}
              disabled={!role.granted || auditQuery.isFetching}
            >
              {auditQuery.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
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
              This audit surface is hidden from non-operator accounts. No subscription data was requested.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && auditQuery.isError && (
        <Card data-testid="sub-update-audit-error">
          <CardHeader>
            <CardTitle>Subscription updater audit unavailable.</CardTitle>
            <CardDescription>
              The read-only updater audit RPC failed. No entitlement data was changed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && audit && !audit.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription updater audit unavailable.</CardTitle>
            <CardDescription>{audit.reasonLabel ?? "Operator audit is not available."}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && audit?.ok && (
        <section className="space-y-4" aria-label="Subscription updater audit">
          <section className="grid gap-3 md:grid-cols-4" aria-label="Updater counts">
            <CountCard label="Total" value={audit.counts.total} />
            <CountCard label="Created" value={audit.counts.created} />
            <CountCard label="Updated" value={audit.counts.updated} />
            <CountCard label="No change" value={audit.counts.noop} />
          </section>
          <section className="grid gap-3 md:grid-cols-3" aria-label="Updater outcome counts">
            <CountCard label="Blocked" value={audit.counts.blocked} />
            <CountCard label="Failed" value={audit.counts.failed} />
            <CountCard label="Skipped" value={audit.counts.skipped} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Latest sanitized rows</CardTitle>
              <CardDescription>
                Showing up to {audit.limit || limit} sanitized rows. Provider customer IDs,
                subscription IDs, price IDs, and webhook payloads are not displayed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.latest.length === 0 ? (
                <div
                  data-testid="sub-update-audit-empty"
                  className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
                >
                  No subscription updater audit rows found for this window.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Created</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Reason</th>
                        <th className="py-2 pr-3">Plan</th>
                        <th className="py-2 pr-3">Candidate status</th>
                        <th className="py-2 pr-3">Subscription status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.latest.map((row, index) => (
                        <tr key={`${row.createdAt ?? "row"}-${index}`} className="border-b last:border-0">
                          <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                            {row.createdAt ?? "—"}
                          </td>
                          <td className="py-3 pr-3">
                            <StatusPill status={row.resultStatus} label={row.resultStatusLabel} />
                          </td>
                          <td className="max-w-[260px] py-3 pr-3 text-muted-foreground">
                            {row.resultReasonLabel}
                          </td>
                          <td className="py-3 pr-3">{row.candidatePlanLabel}</td>
                          <td className="py-3 pr-3">{row.candidateStatusLabel}</td>
                          <td className="py-3 pr-3">{row.subscriptionStatusLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
