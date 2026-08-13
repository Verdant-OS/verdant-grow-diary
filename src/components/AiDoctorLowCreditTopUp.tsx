/**
 * AiDoctorLowCreditTopUp — presenter for the low-balance top-up nudge.
 *
 * Rendered under the remaining-credit badge after a durably saved review.
 * Presenter only: all eligibility lives in the pure view model.
 *
 * This is NOT a paywall. The viewer already pays; the correct action is a
 * one-time pack, and offering an upgrade here would be both wrong and
 * insulting. The click reports as credit_pack_cta_clicked, never paywall_* —
 * paid growers must not enter the upgrade funnel.
 *
 * The IMPRESSION is deliberately emitted by the parent, not here. React runs
 * child effects before parent ones, so an effect in this component would fire
 * before ai_doctor_result_received / ai_doctor_session_saved and record the
 * offer as preceding the value that earns it. The click is safe to own here
 * because it is user-initiated and therefore already after both.
 */
import { Link } from "@/lib/react-router-compat";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import {
  AI_DOCTOR_LOW_CREDIT_SURFACE,
  type AiDoctorLowCreditTopUpViewModel,
} from "@/lib/aiDoctorLowCreditTopUpViewModel";

export interface AiDoctorLowCreditTopUpProps {
  vm: AiDoctorLowCreditTopUpViewModel;
  "data-testid"?: string;
}

export default function AiDoctorLowCreditTopUp({ vm, ...rest }: AiDoctorLowCreditTopUpProps) {
  const testId = rest["data-testid"] ?? "ai-doctor-low-credit-topup";

  if (!vm.visible) return null;

  return (
    <p className="mt-2 text-xs text-muted-foreground" data-testid={testId}>
      {vm.label}{" "}
      <Link
        to={vm.href}
        data-testid={`${testId}-link`}
        className="font-medium text-primary underline underline-offset-4"
        onClick={() =>
          trackFunnelEvent("credit_pack_cta_clicked", { surface: AI_DOCTOR_LOW_CREDIT_SURFACE })
        }
      >
        Buy a credit pack
      </Link>
    </p>
  );
}
