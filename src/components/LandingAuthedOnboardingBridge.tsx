import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import OnboardingProgressPill from "@/components/OnboardingProgressPill";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { useGrows } from "@/store/grows";

/**
 * Compact onboarding bridge shown on `/welcome` for authenticated users
 * only. Reuses the shared `OnboardingProgressPill` so progress copy
 * cannot drift from the Dashboard checklist.
 *
 * Data policy:
 *  - Reads only `useGrows()` (already provided by the app-wide
 *    GrowsProvider — no new Supabase query is introduced).
 *  - Tent / plant / diary / sensor counts are intentionally omitted
 *    here. The full progress picture lives on the Dashboard checklist;
 *    this bridge is a neutral nudge, not a duplicate.
 *  - Never exposes private grow data details (no names, no IDs).
 */
export default function LandingAuthedOnboardingBridge() {
  const { grows } = useGrows();
  const vm = buildOnboardingChecklistViewModel({
    growCount: grows.length,
    tentCount: 0,
    plantCount: 0,
    diaryEntryCount: 0,
    sensorReadingCount: 0,
  });

  return (
    <div
      data-testid="landing-authed-onboarding-bridge"
      className="mt-8 mx-auto max-w-xl rounded-2xl border border-primary/30 bg-primary/5 p-4 md:p-5"
    >
      <div className="flex items-center justify-center mb-2">
        <OnboardingProgressPill vm={vm} />
      </div>
      <p className="text-center text-sm md:text-base font-medium">
        Ready to build your real grow memory?
      </p>
      <div className="mt-3 flex justify-center">
        <Link to="/">
          <Button
            size="sm"
            data-testid="landing-authed-onboarding-bridge-cta"
            className="gradient-leaf text-primary-foreground"
          >
            Continue setup in Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
