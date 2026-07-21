/**
 * PlantBlueprintOverlaySection — container for the Pro Blueprint overlay.
 *
 * Assembles the BlueprintOverlayViewModel inputs from live data and gates the
 * overlay behind the Pro `liveSensors` capability (client presentation gate,
 * matching the `advancedExports` pattern). Non-Pro growers see a PaywallCta.
 *
 * Read-only: no writes, no Action Queue, no device control. The overlay is
 * premium ANALYSIS over readings the grower already has — the SOP target bands
 * and green/amber/red scoring are the paid value.
 *
 * Wires the live snapshot (temp/rh/vpd/ppfd), plant stage, day/night (tent
 * light state), and the latest logged input EC/pH (feeding history). DLI still
 * renders as a "log a PPFD reading" nudge — it needs PPFD samples + a stored
 * timezone the schema does not carry yet.
 *
 * See docs/spec-pro-blueprint-overlay.md.
 */

import { ProBlueprintOverlay } from "@/components/ProBlueprintOverlay";
import { BlueprintTeaser } from "@/components/BlueprintTeaser";
import PaywallCta from "@/components/PaywallCta";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import { buildBlueprintOverlayViewModel } from "@/lib/blueprintOverlayViewModel";
import { buildBlueprintTeaserViewModel } from "@/lib/blueprintTeaserViewModel";
import { selectLatestInputEcPh } from "@/lib/blueprintFeedingInput";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useRootZoneObservations } from "@/hooks/useRootZoneObservations";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseCapability } from "@/lib/entitlements/capabilityAccess";
import { cn } from "@/lib/utils";

export interface PlantBlueprintOverlaySectionProps {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  stage: string | null;
  /** Tent light state (`tents.light_on`) for day/night temp bands. */
  isDay?: boolean | null;
  className?: string;
}

const PAYWALL_VM = buildPaywallCtaViewModel({
  featureTitle: "Pro Blueprint",
  requiredPlanLabel: "Craft",
  unlockBullets: [
    "Score each reading green, amber or red against pro stage targets",
    "Per-stage VPD, temperature, humidity, EC, pH and light bands",
    "Day/night-aware temperature targets from your grow's light cycle",
  ],
});

export function PlantBlueprintOverlaySection({
  growId,
  tentId,
  plantId,
  stage,
  isDay = null,
  className,
}: PlantBlueprintOverlaySectionProps) {
  // Hooks are called unconditionally (React rules), before any early return.
  const { entitlement, loading: entLoading, lookupFailed } = useMyEntitlements();
  const unlocked = !lookupFailed && canUseCapability(entitlement, "blueprint");
  const snapState = useLatestSensorSnapshot(growId, tentId ? [tentId] : []);
  // Only fetch feeding history once unlocked — free growers see the paywall.
  const { observations } = useRootZoneObservations(
    unlocked && plantId ? { kind: "plant", plantId } : null,
  );

  // Presentation-only gate; the client hint is never authoritative for data
  // access (RLS enforces that). Blueprint is premium analysis, so hiding it
  // behind Pro is a UX gate, not a data gate.
  if (entLoading) return null;

  if (!unlocked) {
    // Conversion demo: preview the real per-stage SOP target bands (what Craft
    // scores against) above the paywall CTA, so the paid value is concrete on
    // the grower's own plant. Static bands only — no live values, no scoring,
    // no data fetch on the locked path.
    const teaserVm = buildBlueprintTeaserViewModel({ stage, isDay });
    return (
      <div data-testid="pro-blueprint-locked" className={cn("flex flex-col gap-3", className)}>
        <BlueprintTeaser vm={teaserVm} />
        <PaywallCta vm={PAYWALL_VM} data-testid="pro-blueprint-paywall" />
      </div>
    );
  }

  const vm = buildBlueprintOverlayViewModel({
    stage,
    snapshot: snapState.snapshot,
    latestFeeding: selectLatestInputEcPh(observations),
    dli: null,
    isDay,
  });

  return <ProBlueprintOverlay vm={vm} className={className} />;
}

export default PlantBlueprintOverlaySection;
