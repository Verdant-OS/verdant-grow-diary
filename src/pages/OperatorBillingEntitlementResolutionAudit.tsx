import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRole } from "@/hooks/useHasRole";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  parseBillingEntitlementResolutionAuditResponse,
  type BillingEntitlementResolutionAuditState,
  type BillingEntitlementResolutionAuditViewModel,
} from "@/lib/billingEntitlementResolutionAuditViewModel";

type EntitlementAuditRpcClient = {
  rpc(
    fn: "billing_entitlement_resolution_operator_audit",
    args: { p_limit: number },
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

const LIMIT_OPTIONS = [25, 50, 100] as const;
type LimitOption = typeof LIMIT_OPTIONS[number];

function StatePill({
  state,
  label,
}: {
  state: BillingEntitlementResolutionAuditState;
  label: string;
}) {
  const cls: Record<BillingEntitlementResolutionAuditState, string> = {
    active:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    free_fallback:
      "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    expired_fallback:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    blocked: "border-destructive/40 bg-destructive/10 text-destructive",
    unknown:
      "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cls[state]}`}
    >
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

async function fetchEntitlementAudit(
  limit: number,
): Promise<BillingEntitlementResolutionAuditViewModel> {
  const { data, error } = await (
    supabase as unknown as EntitlementAuditRpcClient
  ).rpc("billing_entitlement_resolution_operator_audit", { p_limit: limit });
  if (error)
    throw new Error(
      error.message ?? "billing_entitlement_resolution_audit_failed",
    );
  return parseBillingEntitlementResolutionAuditResponse(data);
}

export default function OperatorBillingEntitlementResolutionAudit() {
  const role = useHasRole("operator");
  const [limit, setLimit] = useState<LimitOption>(50);

  const auditQuery = useQuery({
    queryKey: ["operator", "billing-entitlement-resolution-audit", limit],
    queryFn: () => fetchEntitlementAudit(limit),
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
              Billing Entitlement Resolution
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Sanitized operator audit. Provider IDs and webhook bodies are not
              shown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="entitlement-audit-limit"
            >
              Rows
            </label>
            <select
              id="entitlement-audit-limit"
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
          <CardContent className="p-6 text-sm text-muted-foreground">
            Checking operator access…
          </CardContent>
        </Card>
      )}

      {role.status === "unauthenticated" && (
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>
              Operator audit views require an authenticated operator session.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {(role.status === "denied" || role.status === "error") && (
        <Card>
          <CardHeader>
            <CardTitle>Operator access required</CardTitle>
            <CardDescription>
              This audit surface is hidden from non-operator accounts. No
              entitlement data was requested.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && auditQuery.isError && (
        <Card data-testid="entitlement-audit-error">
          <CardHeader>
            <CardTitle>Entitlement resolution audit unavailable.</CardTitle>
            <CardDescription>
              The read-only entitlement resolution RPC failed. No entitlement
              data was changed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && audit && !audit.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Entitlement resolution audit unavailable.</CardTitle>
            <CardDescription>
              {audit.reasonLabel ?? "Operator audit is not available."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && audit?.ok && (
        <section
          className="space-y-4"
          aria-label="Billing entitlement resolution audit"
        >
          <section
            className="grid gap-3 md:grid-cols-3 lg:grid-cols-6"
            aria-label="Entitlement resolution counts"
          >
            <CountCard label="Total" value={audit.counts.total} />
            <CountCard label="Active" value={audit.counts.active} />
            <CountCard label="Free fallback" value={audit.counts.free_fallback} />
            <CountCard
              label="Expired fallback"
              value={audit.counts.expired_fallback}
            />
            <CountCard label="Blocked" value={audit.counts.blocked} />
            <CountCard label="Unknown" value={audit.counts.unknown} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Latest sanitized rows</CardTitle>
              <CardDescription>
                Showing up to {audit.limit || limit} sanitized rows. Provider
                customer identifiers, subscription identifiers, price
                identifiers, address fields, and webhook bodies are not
                displayed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.latest.length === 0 ? (
                <div
                  data-testid="entitlement-audit-empty"
                  className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
                >
                  No entitlement resolution rows found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Plan</th>
                        <th className="py-2 pr-3">Subscription status</th>
                        <th className="py-2 pr-3">Entitlement</th>
                        <th className="py-2 pr-3">Reason</th>
                        <th className="py-2 pr-3">AI credits</th>
                        <th className="py-2 pr-3">Cycle / updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.latest.map((row, index) => (
                        <tr
                          key={`${row.updatedAtLabel ?? "row"}-${index}`}
                          className="border-b last:border-0"
                        >
                          <td className="py-3 pr-3">{row.planLabel}</td>
                          <td className="py-3 pr-3">
                            {row.subscriptionStatusLabel}
                          </td>
                          <td className="py-3 pr-3">
                            <StatePill
                              state={row.entitlementState}
                              label={row.entitlementStateLabel}
                            />
                          </td>
                          <td className="max-w-[260px] py-3 pr-3 text-muted-foreground">
                            {row.fallbackReasonLabel}
                          </td>
                          <td className="py-3 pr-3">
                            {row.aiCreditsPerMonthLabel}
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                            {row.updatedAtLabel}
                          </td>
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
