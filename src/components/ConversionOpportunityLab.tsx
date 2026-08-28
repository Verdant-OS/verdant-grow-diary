import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConversionOpportunities,
  type FunnelOpportunitySnapshot,
} from "@/lib/conversionOpportunityRules";

export default function ConversionOpportunityLab({
  snapshot,
}: {
  snapshot: FunnelOpportunitySnapshot;
}) {
  const opportunities = buildConversionOpportunities(snapshot.counts);

  return (
    <Card data-testid="conversion-opportunity-lab">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Conversion Opportunity Lab</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Ranked 30-day event gaps from Verdant&apos;s authenticated, first-party funnel sink.
              These are directional signals, not joined user-cohort conversion rates.
            </CardDescription>
          </div>
          <Badge variant="outline">Read-only · production analytics</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunities.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-lg border border-border/60 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
            data-testid={`conversion-opportunity-${item.id}`}
            data-status={item.status}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.label}</span>
                <Badge variant={item.status === "integrity_warning" ? "destructive" : "secondary"}>
                  {item.rank
                    ? `Priority ${item.rank}`
                    : item.status === "no_data"
                      ? "NO_DATA"
                      : "Check integrity"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.fromLabel}: {item.fromCount} · {item.toLabel}: {item.toCount}
              </p>
            </div>
            <div className="text-left md:text-right">
              <div className="text-xl font-semibold tabular-nums">
                {item.directionalRatePercent === null ? "—" : `${item.directionalRatePercent}%`}
              </div>
              <div className="text-xs text-muted-foreground">
                {item.status === "signal" ? `${item.gap} event gap` : "Rate not reported"}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
      <CardContent className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
        Source: funnel_events_operator_summary · Generated:{" "}
        {snapshot.generatedAt ?? "time unavailable"}. Repeated events and different acquisition
        branches can affect ratios; investigate before changing product behavior.
      </CardContent>
    </Card>
  );
}
