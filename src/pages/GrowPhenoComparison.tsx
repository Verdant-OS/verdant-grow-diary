/**
 * GrowPhenoComparison — authenticated, Pro-gated real-data Pheno Comparison.
 *
 * Renders the shared Pheno Comparison presenter with a REAL grow's hunt
 * candidates (not the public sample fixture). Free users see a calm upsell;
 * Pro/founder users see the live comparison.
 *
 * Gate posture: presentation-only. The underlying data is the user's own,
 * RLS-scoped, read-only — no money is spent and nothing sensitive crosses a
 * trust boundary — so a client `useMyEntitlements` capability check is
 * sufficient here (unlike AI-credit or export surfaces, which also re-check
 * server-side). No writes, no AI, no device control.
 */
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Sprout, ArrowLeft } from "lucide-react";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import PaywallCta from "@/components/PaywallCta";
import PhenoComparison from "@/pages/PhenoComparison";
import { Button } from "@/components/ui/button";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { useGrowPhenoComparison } from "@/hooks/useGrowPhenoComparison";
import { useGrows } from "@/store/grows";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import { growDetailPath, phenoHuntNewPath } from "@/lib/routes";

const PHENO_COMPARISON_UPSELL = buildPaywallCtaViewModel({
  featureTitle: "Real Pheno Comparison",
  requiredPlanLabel: "Pro",
  primaryCtaLabel: "See plans",
  pricingHref: "/pricing",
  unlockBullets: [
    "Compare your real hunt candidates side by side on selection evidence",
    "Honest comparability grading — different tents, timepoints, or thin records are flagged",
    "Recent Quick Log and timeline context per candidate",
    "The grower decides; Verdant never picks a keeper for you",
  ],
  secondaryCopy:
    "The sample preview stays open to everyone. Pro unlocks the same view over your own grow's candidates.",
});

export default function GrowPhenoComparison() {
  const { growId } = useParams<{ growId: string }>();
  const { grows } = useGrows();
  const growName = grows.find((g) => g.id === growId)?.name ?? null;

  const { entitlement, loading: entitlementLoading } = useMyEntitlements();
  const canCompare = entitlement.capabilities.phenoComparison === true;

  const { data, isLoading, isError } = useGrowPhenoComparison(
    canCompare ? growId : undefined,
  );

  // Stable real clock for snapshot freshness on THIS render of real data —
  // without it the presenter would grade live readings against the fixed
  // sample-fixture epoch. Memoized so re-renders don't flap stale badges.
  const comparisonNow = useMemo(() => Date.now(), []);

  return (
    <div className="container max-w-6xl py-4 space-y-4">
      <GrowBreadcrumbs
        growId={growId}
        growName={growName}
        current="Pheno Comparison"
      />

      {growId ? (
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
          <Link to={growDetailPath(growId)}>
            <ArrowLeft className="h-4 w-4" /> Back to grow
          </Link>
        </Button>
      ) : null}

      {entitlementLoading ? (
        <div
          data-testid="grow-pheno-comparison-entitlement-loading"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your plan…
        </div>
      ) : !canCompare ? (
        <div data-testid="grow-pheno-comparison-locked" className="space-y-3">
          <PaywallCta
            vm={PHENO_COMPARISON_UPSELL}
            data-testid="grow-pheno-comparison-paywall"
          />
          <p className="text-xs text-muted-foreground">
            Want to see the format first?{" "}
            <Link to="/pheno-comparison" className="text-primary hover:underline">
              Open the read-only sample comparison
            </Link>
            .
          </p>
        </div>
      ) : isLoading ? (
        <div
          data-testid="grow-pheno-comparison-loading"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Loading candidates…
        </div>
      ) : isError ? (
        <div
          data-testid="grow-pheno-comparison-error"
          className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
        >
          We couldn't load this grow's candidates right now. Please try again in
          a moment.
        </div>
      ) : !data || data.huntId === null ? (
        <EmptyState
          testId="grow-pheno-comparison-no-hunt"
          title="No pheno hunt yet"
          body="Start a pheno hunt and tag candidate plants to compare their selection evidence side by side."
          cta={
            growId ? (
              <Button asChild size="sm" className="gap-1">
                <Link to={phenoHuntNewPath(growId)}>
                  <Sprout className="h-4 w-4" /> Start Pheno Hunt
                </Link>
              </Button>
            ) : null
          }
        />
      ) : data.candidateCount < 2 ? (
        <EmptyState
          testId="grow-pheno-comparison-too-few"
          title="Add another candidate"
          body={`"${data.huntName ?? "This hunt"}" has ${data.candidateCount} candidate${
            data.candidateCount === 1 ? "" : "s"
          }. Tag at least two plants to compare them.`}
          cta={
            growId ? (
              <Button asChild size="sm" variant="outline" className="gap-1">
                <Link to={phenoHuntNewPath(growId)}>
                  <Sprout className="h-4 w-4" /> Manage candidates
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div data-testid="grow-pheno-comparison-live">
          <PhenoComparison input={data.input} now={comparisonNow} />
        </div>
      )}
    </div>
  );
}

function EmptyState({
  testId,
  title,
  body,
  cta,
}: {
  testId: string;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border bg-card p-8 text-center space-y-3"
    >
      <Sprout className="h-6 w-6 text-primary mx-auto" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
      {cta ? <div className="pt-1">{cta}</div> : null}
    </div>
  );
}
