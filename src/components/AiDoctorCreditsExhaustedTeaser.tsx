/**
 * AiDoctorCreditsExhaustedTeaser — calm Plant Detail marker shown once a
 * free-plan grow has spent its entire (fixed, non-renewing) AI Doctor
 * credit allotment.
 *
 * Presentation-only: reads this grow's spend total (useAiDoctorGrowCreditsUsed)
 * and the client entitlement hint (useMyEntitlements), renders the pure
 * aiDoctorCreditsExhaustedTeaserRules view. Renders null for paid plans, for
 * grows still under their limit, and while any input is unresolved — it is
 * a garnish row, never a blocking surface, and it never gates the doctor
 * feature itself (that stays server-side).
 *
 * No writes, no AI calls, no device control, no checkout logic.
 */
import { Link } from "react-router-dom";
import { useAiDoctorGrowCreditsUsed } from "@/hooks/useAiDoctorGrowCreditsUsed";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { buildAiDoctorCreditsExhaustedTeaserView } from "@/lib/aiDoctorCreditsExhaustedTeaserRules";

interface Props {
  growId: string | null | undefined;
}

export default function AiDoctorCreditsExhaustedTeaser({ growId }: Props) {
  const { data: used, isLoading } = useAiDoctorGrowCreditsUsed(growId ?? null);
  const { entitlement, loading: entitlementLoading } = useMyEntitlements();

  // Quietly absent without a grow, while loading, or once resolved paid —
  // this never blocks or delays anything else on the page.
  if (!growId || isLoading || used === undefined || entitlementLoading) {
    return null;
  }

  const view = buildAiDoctorCreditsExhaustedTeaserView({
    isFreePlan: entitlement.effectivePlanId === "free",
    limit: entitlement.capabilities.aiCreditsPerGrow,
    used,
  });

  if (!view.teaser.show) return null;

  return (
    <div
      data-testid="ai-doctor-credits-exhausted-teaser"
      className="mb-3 rounded-lg border border-border/40 bg-card/30 px-3 py-1.5 text-xs text-muted-foreground"
    >
      {view.teaser.copy}{" "}
      <Link
        to={view.teaser.href}
        className="text-primary underline-offset-4 hover:underline"
      >
        {view.teaser.ctaLabel}
      </Link>
    </div>
  );
}
