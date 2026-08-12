/**
 * TentAlertsBlueprintHint — one line connecting a tent alert to the per-stage
 * Blueprint targets, for growers who don't have Blueprint yet.
 *
 * WHY THIS IS NOT IN THE ALERTS PANEL ITSELF: Plant Detail already renders
 * the full `BlueprintTeaser` + `PaywallCta` a few sections above its alerts
 * panel, so a hint inside the shared panel would be a second upsell for the
 * same feature on the same screen. Daily Check renders the alerts panel with
 * no Blueprint section anywhere on the page — that is the only surface where
 * a grower sees "Temperature high" with no way to learn what the band even
 * is. Keeping this at the Daily Check call site rather than inside the panel
 * makes the Plant Detail suppression structural instead of a flag someone can
 * flip by accident.
 *
 * Deliberately a hint, not a paywall: one sentence and a link to where the
 * real (free) teaser lives. It names a true, specific fact — the stage and how
 * many targets exist — so it carries information rather than just pitching.
 *
 * Fails closed in every uncertain state: an unverified entitlement never
 * produces an upsell, and an unknown stage renders nothing rather than a
 * contentless nudge.
 */
import { Link } from "@/lib/react-router-compat";
import { Sparkles } from "lucide-react";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseCapability } from "@/lib/entitlements/capabilityAccess";
import { buildBlueprintTeaserViewModel } from "@/lib/blueprintTeaserViewModel";
import { plantDetailPath } from "@/lib/routes";

export interface TentAlertsBlueprintHintProps {
  /**
   * Only set when the caller can prove these alerts belong to the plant in
   * view — same requirement as the panel's own plant-scoped shortcut.
   */
  plantId?: string | null;
  /** The plant's stage. An unknown stage has no targets to point at. */
  stage?: string | null;
  className?: string;
  "data-testid"?: string;
}

export default function TentAlertsBlueprintHint({
  plantId,
  stage,
  className,
  ...rest
}: TentAlertsBlueprintHintProps) {
  const testId = rest["data-testid"] ?? "tent-alerts-blueprint-hint";
  // Hooks run unconditionally, before any early return.
  const { entitlement, loading, lookupFailed } = useMyEntitlements();

  if (!plantId) return null;
  // Same fail-closed shape as PlantBlueprintOverlaySection: never upsell while
  // the plan is still loading or could not be confirmed, and never upsell a
  // grower who already has the capability.
  if (loading || lookupFailed) return null;
  if (canUseCapability(entitlement, "blueprint")) return null;

  // Daily Check has no tent light state, so day/night is unknown here. The
  // view model handles that (temperature reads "Day + night"); we only use the
  // stage label and the count, both of which are light-independent.
  const vm = buildBlueprintTeaserViewModel({ stage, isDay: null });
  if (!vm.stageKnown || vm.targetCount === 0) return null;

  return (
    <p
      data-testid={testId}
      className={`mt-2 text-xs text-muted-foreground ${className ?? ""}`.trim()}
    >
      <Sparkles className="mr-1 inline h-3 w-3 align-[-1px] text-primary/70" />
      Blueprint scores this plant&rsquo;s readings against {vm.targetCount} {vm.stageLabel} targets.{" "}
      <Link
        to={plantDetailPath(plantId)}
        data-testid={`${testId}-link`}
        className="font-medium text-primary underline underline-offset-4"
      >
        See the targets
      </Link>
    </p>
  );
}
