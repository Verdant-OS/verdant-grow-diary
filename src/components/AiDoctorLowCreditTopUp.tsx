/**
 * AiDoctorLowCreditTopUp — presenter for the low-balance top-up nudge.
 *
 * Rendered under the remaining-credit badge after a durably saved review.
 * Presenter only: all eligibility lives in the pure view model.
 *
 * This is NOT a paywall. The viewer already pays; the correct action is a
 * one-time pack, and offering an upgrade here would be both wrong and
 * insulting. The impression and click therefore report as credit_pack_cta_*,
 * never paywall_* — paid growers must not enter the upgrade funnel.
 */
import { useEffect } from "react";
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
  const visible = vm.visible;

  // Hook runs unconditionally; the effect body is what is conditional.
  useEffect(() => {
    if (!visible) return;
    trackFunnelEvent("credit_pack_cta_viewed", { surface: AI_DOCTOR_LOW_CREDIT_SURFACE });
  }, [visible]);

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
