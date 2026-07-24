import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";

export interface CheckoutActivationViewModel {
  primaryHref: string;
  primaryLabel: string;
  heading: string;
  description: string;
  steps: readonly string[];
}

export const CHECKOUT_ACTIVATION_STEPS = Object.freeze([
  "Create or open one grow",
  "Connect one tent and plant",
  "Add the first Quick Log or sensor reading",
]);

/** Pure post-purchase handoff. Entitlement confirmation remains the caller's responsibility. */
export function buildCheckoutActivationViewModel(
  returnTo: string | null | undefined,
): CheckoutActivationViewModel {
  const safeReturnTo = sanitizeCheckoutReturnTo(returnTo);
  return {
    primaryHref: safeReturnTo ?? "/grows",
    primaryLabel: safeReturnTo ? "Continue where I left off" : "Start my grow memory",
    heading: "Put Pro to work in one real grow",
    description:
      "The fastest path to value is the same core loop Verdant protects: Grow → Tent → Plant → Quick Log.",
    steps: CHECKOUT_ACTIVATION_STEPS,
  };
}
