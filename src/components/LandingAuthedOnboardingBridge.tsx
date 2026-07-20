import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { countActivatingSensorReadings } from "@/lib/onboardingSensorActivationRules";
import { selectConnectedOneTentGraph } from "@/lib/connectedOneTentActivationRules";
import { useOneTentActivationEvidence } from "@/hooks/useOneTentActivationEvidence";
import { useGrows } from "@/store/grows";
import { useGrowTents, useGrowPlants } from "@/hooks/useGrowData";
import { useSensorReadings } from "@/hooks/use-sensor-readings";

/**
 * Compact onboarding bridge shown on `/welcome` for authenticated users
 * only. Reuses the shared `OnboardingProgressPill` so progress copy
 * cannot drift from the Dashboard checklist.
 *
 * Data policy:
 *  - Reads only via existing hooks already used by the app (Grows
 *    context, useGrowTents, useGrowPlants, useSensorReadings, and the
 *    canonical activation-evidence loader). Reads are bounded and RLS-scoped.
 *  - Never exposes private grow data details (no names, no IDs) — only
 *    provenance-qualified counts feed into the shared view model.
 *  - No writes, no automation, no device control, no fake-live data.
 */
export default function LandingAuthedOnboardingBridge() {
  const { grows, activeGrowId } = useGrows();
  const { data: tents = [] } = useGrowTents();
  const { data: plants = [] } = useGrowPlants();
  const activationGraph = selectConnectedOneTentGraph({
    grows,
    tents,
    plants,
    preferredGrowId: activeGrowId,
  });
  const { data: readings = [] } = useSensorReadings(activationGraph.tentId);
  const activationEvidence = useOneTentActivationEvidence(activationGraph);
  const connectedSensorRows = activationGraph.tentId
    ? readings.filter((row) => row.tent_id === activationGraph.tentId)
    : [];

  const vm = buildOnboardingChecklistViewModel({
    growCount: grows.length,
    tentCount: tents.length,
    plantCount: plants.length,
    diaryEntryCount: 0,
    sensorReadingCount: countActivatingSensorReadings(connectedSensorRows),
    connectedScope: activationGraph,
    firstLogEvidenceCount:
      activationEvidence.status === "ok" ? activationEvidence.summary.count : null,
    firstLogEvidenceStatus: activationEvidence.status,
  });

  const ctaLabel = vm.isFullyActivated ? "Open Dashboard" : "Continue setup in Dashboard";

  return (
    <div
      data-testid="landing-authed-onboarding-bridge"
      className="mt-8 mx-auto max-w-xl rounded-2xl border border-primary/30 bg-primary/5 p-4 md:p-5"
    >
      <div className="flex items-center justify-center mb-2">
        <OnboardingProgressPill vm={vm} />
      </div>
      <p className="text-center text-sm md:text-base font-medium">
        {vm.isFullyActivated
          ? "Your grow memory is active."
          : "Ready to build your real grow memory?"}
      </p>
      <div className="mt-3 flex justify-center">
        <Link to="/">
          <Button
            size="sm"
            data-testid="landing-authed-onboarding-bridge-cta"
            className="gradient-leaf text-primary-foreground"
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
