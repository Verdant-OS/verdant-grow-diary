import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasRole } from "@/hooks/useHasRole";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSubscriberGrowthProgress,
  parseSubscriberGrowthSnapshot,
  SUBSCRIBER_GROWTH_GOAL_LABEL,
  type SubscriberGrowthSnapshot,
} from "@/lib/subscriberGrowthSnapshotRules";
import {
  parseSignupAcquisitionSnapshot,
  type SignupAcquisitionSnapshot,
} from "@/lib/signupAcquisitionSnapshotRules";
import SubscriberGrowthSprintBoard from "@/components/SubscriberGrowthSprintBoard";

type SubscriberGrowthRpcClient = {
  rpc(
    fn: "subscriber_growth_operator_snapshot" | "signup_acquisition_operator_snapshot",
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function fetchSubscriberGrowth(): Promise<SubscriberGrowthSnapshot> {
  const { data, error } = await (supabase as unknown as SubscriberGrowthRpcClient).rpc(
    "subscriber_growth_operator_snapshot",
  );
  if (error) {
    throw new Error(error.message ?? "subscriber_growth_snapshot_failed");
  }
  return parseSubscriberGrowthSnapshot(data);
}

async function fetchSignupAcquisition(): Promise<SignupAcquisitionSnapshot> {
  const { data, error } = await (supabase as unknown as SubscriberGrowthRpcClient).rpc(
    "signup_acquisition_operator_snapshot",
  );
  if (error) {
    throw new Error(error.message ?? "signup_acquisition_snapshot_failed");
  }
  return parseSignupAcquisitionSnapshot(data);
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {description && (
        <CardContent className="pt-0 text-xs text-muted-foreground">{description}</CardContent>
      )}
    </Card>
  );
}

export default function OperatorSubscriberGrowth() {
  const role = useHasRole("operator");
  const snapshotQuery = useQuery({
    queryKey: ["operator", "subscriber-growth"],
    queryFn: fetchSubscriberGrowth,
    enabled: role.granted,
    staleTime: 30_000,
  });
  const acquisitionQuery = useQuery({
    queryKey: ["operator", "signup-acquisition"],
    queryFn: fetchSignupAcquisition,
    enabled: role.granted,
    staleTime: 30_000,
  });

  const snapshot = snapshotQuery.data;
  const acquisition = acquisitionQuery.data;
  const refreshing = snapshotQuery.isFetching || acquisitionQuery.isFetching;
  const progress = useMemo(
    () => buildSubscriberGrowthProgress(snapshot?.counts.activePaid ?? 0, Date.now()),
    [snapshot?.counts.activePaid],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operator Mode
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Subscriber Growth</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {SUBSCRIBER_GROWTH_GOAL_LABEL}. Paid counts come only from the authoritative billing
              entitlement table.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline">
              <Link to="/admin/leads">Review interest leads</Link>
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/operator/billing-entitlement-resolution">Audit entitlements</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void snapshotQuery.refetch();
                void acquisitionQuery.refetch();
              }}
              disabled={!role.granted || refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
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

      {role.granted && snapshotQuery.isError && (
        <Card data-testid="subscriber-growth-error">
          <CardHeader>
            <CardTitle>Subscriber growth snapshot unavailable.</CardTitle>
            <CardDescription>
              The read-only operator snapshot failed. No billing or lead data was changed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && snapshot && !snapshot.ok && (
        <Card data-testid="subscriber-growth-denied">
          <CardHeader>
            <CardTitle>Subscriber growth snapshot unavailable.</CardTitle>
            <CardDescription>
              {snapshot.reasonLabel ?? "Operator snapshot is not available."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && acquisitionQuery.isError && (
        <Card data-testid="signup-acquisition-error">
          <CardHeader>
            <CardTitle>Account acquisition snapshot unavailable.</CardTitle>
            <CardDescription>
              Subscriber totals remain available. The read-only source report failed and no account,
              billing, or lead data was changed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && acquisition && !acquisition.ok && (
        <Card data-testid="signup-acquisition-denied">
          <CardHeader>
            <CardTitle>Account acquisition snapshot unavailable.</CardTitle>
            <CardDescription>
              {acquisition.reasonLabel ?? "Account acquisition data is not available."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {role.granted && snapshot?.ok && (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            aria-label="Subscriber growth goal progress"
          >
            <MetricCard
              label="Active paid subscribers"
              value={progress.activePaid}
              description="Authoritative active paid entitlements only"
            />
            <MetricCard label="Goal" value={progress.target} />
            <MetricCard label="Still needed" value={progress.remaining} />
            <MetricCard label="Days remaining" value={progress.daysRemaining} />
            <MetricCard
              label="Required pace"
              value={
                progress.requiredPerDay === null
                  ? "Deadline passed"
                  : `${progress.requiredPerDay}/day`
              }
              description={`${progress.progressPercent}% of goal`}
            />
          </section>

          <SubscriberGrowthSprintBoard
            progress={progress}
            counts={snapshot.counts}
            acquisitionCounts={acquisition?.ok ? acquisition.counts : null}
          />

          <Card>
            <CardHeader>
              <CardTitle>Authoritative paid entitlement mix</CardTitle>
              <CardDescription>
                Each person is counted once. Free rows, expired access, leads, and profile tiers are
                excluded.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Pro Monthly" value={snapshot.counts.proMonthly} />
              <MetricCard label="Pro Annual" value={snapshot.counts.proAnnual} />
              <MetricCard label="Founder Lifetime" value={snapshot.counts.founderLifetime} />
            </CardContent>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="New active — 7 days" value={snapshot.counts.newActive7d} />
            <MetricCard label="New active — 30 days" value={snapshot.counts.newActive30d} />
            <MetricCard
              label="At risk"
              value={snapshot.counts.atRisk}
              description="Past-due or paused paid plans"
            />
            <MetricCard
              label="Scheduled cancellation"
              value={snapshot.counts.scheduledCancellation}
            />
          </section>

          {acquisition?.ok && (
            <Card data-testid="signup-acquisition-snapshot">
              <CardHeader>
                <CardTitle>Account starts — not subscribers</CardTitle>
                <CardDescription>
                  Profile counts show signup volume. Campaign sources are allowlisted,
                  analytics-only first touch; they never grant billing, roles, credits, or Founder
                  access.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Accounts — all time" value={acquisition.counts.accountsTotal} />
                <MetricCard label="Accounts — 7 days" value={acquisition.counts.accounts7d} />
                <MetricCard label="Attributed — 7 days" value={acquisition.counts.attributed7d} />
                <MetricCard
                  label="Source unavailable"
                  value={acquisition.counts.unattributedTotal}
                  description="Includes accounts created before attribution launched"
                />
              </CardContent>
              <CardContent className="grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-2 lg:grid-cols-7">
                <MetricCard label="Landing signup" value={acquisition.counts.landingPage} />
                <MetricCard label="Pricing signup" value={acquisition.counts.pricingPage} />
                <MetricCard label="Founder page signup" value={acquisition.counts.founderPage} />
                <MetricCard label="Founder share signup" value={acquisition.counts.founderShare} />
                <MetricCard
                  label="Interest share signup"
                  value={acquisition.counts.pricingInterestShare}
                />
                <MetricCard label="Grower invite signup" value={acquisition.counts.growerInvite} />
                <MetricCard label="Context check signup" value={acquisition.counts.contextCheck} />
              </CardContent>
            </Card>
          )}

          <Card data-testid="subscriber-growth-interest">
            <CardHeader>
              <CardTitle>Interest signals — not subscribers</CardTitle>
              <CardDescription>
                Unique normalized email addresses only. These counts help prioritize follow-up; they
                never increase the paid-subscriber total and do not imply a charge, entitlement, or
                Founder reservation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <MetricCard
                label="Pricing interest — all time"
                value={snapshot.counts.pricingInterestTotal}
              />
              <MetricCard
                label="Pricing interest — 7 days"
                value={snapshot.counts.pricingInterest7d}
              />
              <MetricCard
                label="Needs first contact"
                value={snapshot.counts.pricingInterestNeedsContact}
              />
              <MetricCard
                label="Follow-up due"
                value={snapshot.counts.pricingInterestFollowUpDue}
              />
              <MetricCard
                label="Contacted — 7 days"
                value={snapshot.counts.pricingInterestContacted7d}
              />
              <MetricCard label="All leads — 7 days" value={snapshot.counts.allLeads7d} />
            </CardContent>
            <CardContent className="grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-2 lg:grid-cols-8">
              <MetricCard label="Direct pricing" value={snapshot.counts.pricingInterestDirect} />
              <MetricCard label="Landing page" value={snapshot.counts.pricingInterestLanding} />
              <MetricCard label="Pricing page" value={snapshot.counts.pricingInterestPricingPage} />
              <MetricCard label="Founder page" value={snapshot.counts.pricingInterestFounderPage} />
              <MetricCard
                label="Founder shares"
                value={snapshot.counts.pricingInterestFounderShare}
              />
              <MetricCard
                label="Paid-interest shares"
                value={snapshot.counts.pricingInterestReferral}
              />
              <MetricCard
                label="Grower invites"
                value={snapshot.counts.pricingInterestGrowerInvite}
              />
              <MetricCard
                label="Context check"
                value={snapshot.counts.pricingInterestContextCheck}
              />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground" data-testid="subscriber-growth-generated-at">
            Snapshot generated: {snapshot.generatedAt ?? "time unavailable"}
          </p>
        </>
      )}
    </main>
  );
}
