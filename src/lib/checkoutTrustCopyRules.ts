import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export type CheckoutTrustState = "live" | "sandbox" | "unavailable";

export interface CheckoutTrustCopy {
  state: CheckoutTrustState;
  label: string;
  summary: string;
  faqQuestion: string;
  faqAnswer: string;
  canCreateLiveCharge: boolean;
}

export interface CheckoutTrustCopyInput {
  environment: PaddleCheckoutEnvironment | null | undefined;
  /** Runtime checkout failures temporarily override an otherwise valid environment. */
  blocked: boolean;
}

const LIVE_COPY: CheckoutTrustCopy = Object.freeze({
  state: "live",
  label: "Secure live checkout",
  summary:
    "Payments are processed by Paddle. You will review the plan, price, and total before confirming your purchase.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "Yes. This site uses Paddle's live checkout. A completed purchase can charge your selected payment method, and you will review the plan, price, and total before confirming.",
  canCreateLiveCharge: true,
});

const SANDBOX_COPY: CheckoutTrustCopy = Object.freeze({
  state: "sandbox",
  label: "Sandbox checkout",
  summary:
    "This environment uses Paddle's sandbox for checkout testing. It cannot create a live charge.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "No. This environment uses Paddle's sandbox for checkout testing. It cannot create a live charge.",
  canCreateLiveCharge: false,
});

const UNAVAILABLE_COPY: CheckoutTrustCopy = Object.freeze({
  state: "unavailable",
  label: "Checkout unavailable here",
  summary:
    "Checkout cannot open in this environment right now. You can request one availability notice instead; no charge is created.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "Checkout cannot open in this environment right now. You can request one availability notice instead; no charge is created.",
  canCreateLiveCharge: false,
});

/**
 * Build truthful buyer-facing checkout copy from the same environment decision
 * that gates the Paddle overlay. Unknown values and runtime failures fail closed.
 */
export function buildCheckoutTrustCopy(input: CheckoutTrustCopyInput): CheckoutTrustCopy {
  if (input.blocked) return UNAVAILABLE_COPY;
  if (input.environment === "live") return LIVE_COPY;
  if (input.environment === "sandbox") return SANDBOX_COPY;
  return UNAVAILABLE_COPY;
}
