/**
 * AccountPlanBadge — pure presenter for the resolved plan.
 *
 * Renders ONE of: Free / Pro Monthly / Pro Annual / Founder Lifetime.
 * NEVER renders raw Paddle customer/subscription/transaction/event IDs.
 */
import type { ResolvedEntitlement } from "@/lib/entitlements";

const LABELS = {
  free: "Free",
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  founder_lifetime: "Founder Lifetime",
} as const;

export interface AccountPlanBadgeProps {
  entitlement: ResolvedEntitlement | null | undefined;
  loading?: boolean;
  className?: string;
}

export default function AccountPlanBadge({
  entitlement,
  loading,
  className,
}: AccountPlanBadgeProps) {
  const planId = entitlement?.displayPlanId ?? "free";
  const label = LABELS[planId] ?? "Free";
  const text = loading ? "Loading…" : label;

  return (
    <span
      data-testid="account-plan-badge"
      data-plan={planId}
      className={
        className ??
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
      }
    >
      {text}
    </span>
  );
}
