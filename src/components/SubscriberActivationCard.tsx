import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSubscriberActivationViewModel } from "@/lib/subscriberActivationRules";
import type { SubscriberGrowthCounts } from "@/lib/subscriberGrowthSnapshotRules";

function ActivationMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function SubscriberActivationCard({ counts }: { counts: SubscriberGrowthCounts }) {
  const vm = buildSubscriberActivationViewModel(counts);

  return (
    <Card data-testid="subscriber-activation-card" data-status={vm.status}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Paid core-loop activation</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Aggregate product activity for authoritative active-paid subscribers. Activity never
              grants or proves an entitlement.
            </CardDescription>
          </div>
          <Badge variant={vm.status === "integrity_mismatch" ? "destructive" : "outline"}>
            {vm.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <ActivationMetric label="Active paid" value={vm.activePaid} />
        <ActivationMetric label="With grow" value={vm.withGrow} />
        <ActivationMetric label="With tent" value={vm.withTent} />
        <ActivationMetric label="With plant" value={vm.withPlant} />
        <ActivationMetric label="First log or sensor" value={vm.withFirstSignal} />
        <ActivationMetric label="Core activated" value={vm.coreActivated} />
      </CardContent>
      <CardContent className="border-t border-border/60 pt-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            Activation rate:{" "}
            <strong>
              {vm.activationRatePercent === null ? "Unavailable" : `${vm.activationRatePercent}%`}
            </strong>
          </span>
          <span>
            Needs core activation: <strong>{vm.needsCoreActivation}</strong>
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{vm.guidance}</p>
      </CardContent>
    </Card>
  );
}
