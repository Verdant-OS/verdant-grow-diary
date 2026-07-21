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
 * v1 wires the live snapshot (temp/rh/vpd/ppfd), the plant stage, and day/night
 * (tent light state). EC/pH (feeding logs) and DLI (PPFD integration) render as
 * "log this" nudges until their inputs are wired — a follow-up.
 *
 * See docs/spec-pro-blueprint-overlay.md.
 */

import { ProBlueprintOverlay } from "@/components/ProBlueprintOverlay";
import PaywallCta from "@/components/PaywallCta";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import { buildBlueprintOverlayViewModel } from "@/lib/blueprintOverlayViewModel";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseCapability } from "@/lib/entitlements/capabilityAccess";

export interface PlantBlueprintOverlaySectionProps {
  growId: string | null;
  tentId: string | null;
  stage: string | null;
  /** Tent light state (`tents.light_on`) for day/night temp bands. */
  isDay?: boolean | null;
  className?: string;
}

const PAYWALL_VM = buildPaywallCtaViewModel({
  featureTitle: "Pro Blueprint",
  requiredPlanLabel: "Pro",
  unlockBullets: [
    "Score each reading green, amber or red against pro stage targets",
    "Per-stage VPD, temperature, humidity, EC, pH and light bands",
    "Day/night-aware temperature targets from your grow's light cycle",
  ],
});

export function PlantBlueprintOverlaySection({
  growId,
  tentId,
  stage,
  isDay = null,
  className,
}: PlantBlueprintOverlaySectionProps) {
  // Hooks are called unconditionally (React rules), before any early return.
  const { entitlement, loading: entLoading, lookupFailed } = useMyEntitlements();
  const snapState = useLatestSensorSnapshot(growId, tentId ? [tentId] : []);

  // Presentation-only gate; the client hint is never authoritative for data
  // access (RLS enforces that). Blueprint is premium analysis, so hiding it
  // behind Pro is a UX gate, not a data gate.
  if (entLoading) return null;

  if (lookupFailed || !canUseCapability(entitlement, "liveSensors")) {
    return <PaywallCta vm={PAYWALL_VM} data-testid="pro-blueprint-paywall" className={className} />;
  }

  const vm = buildBlueprintOverlayViewModel({
    stage,
    snapshot: snapState.snapshot,
    latestFeeding: null,
    dli: null,
    isDay,
  });

  return <ProBlueprintOverlay vm={vm} className={className} />;
}

export default PlantBlueprintOverlaySection;
