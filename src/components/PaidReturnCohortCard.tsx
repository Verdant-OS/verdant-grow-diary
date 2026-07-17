import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildPaidReturnCohortViewModel,
  type PaidReturnSnapshot,
} from "@/lib/paidReturnSnapshotRules";

function CohortMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Presenter-only operator readout; all cohort and rate decisions stay pure. */
export default function PaidReturnCohortCard({ snapshot }: { snapshot: PaidReturnSnapshot }) {
  const vm = buildPaidReturnCohortViewModel(snapshot.counts);

  return (
    <Card data-testid="paid-return-cohort-card" data-status={vm.status}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>60-day paid return — forward cohort</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Activations are tracked only from this release forward; earlier subscribers are
              intentionally excluded rather than estimated. A qualified return is manual grow
              activity or a server-recorded, fresh validated AI Doctor review after payment and
              before day 60. Passive sensor ingestion, client-persisted AI sessions, and cached
              replays are excluded.
            </CardDescription>
          </div>
          <Badge variant={vm.status === "integrity_mismatch" ? "destructive" : "outline"}>
            {vm.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <CohortMetric label="Tracked paid activations" value={vm.trackedPaidActivations} />
        <CohortMetric label="Matured 60-day cohort" value={vm.maturedPaidActivations60d} />
        <CohortMetric label="Returned within 60 days" value={vm.paidReturned60d} />
        <CohortMetric
          label="60-day return rate"
          value={vm.returnRatePercent === null ? "Maturing" : `${vm.returnRatePercent}%`}
        />
        <CohortMetric label="Manual grow return" value={vm.manualGrowReturned60d} />
        <CohortMetric
          label="Server-validated AI Doctor return"
          value={vm.serverCompletedAiDoctorReturned60d}
        />
      </CardContent>
      <CardContent className="border-t border-border/60 pt-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            In-flight paid activations: <strong>{vm.inFlightPaidActivations}</strong>
          </span>
          <span>No billing or entitlement is changed by this report.</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{vm.guidance}</p>
      </CardContent>
    </Card>
  );
}
