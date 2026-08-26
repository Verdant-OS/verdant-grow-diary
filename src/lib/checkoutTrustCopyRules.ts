import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export type CheckoutTrustState = "sandbox" | "unavailable";

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

export const CHECKOUT_MECHANISM_FAQ_ANSWER =
  "Verdant currently opens Paddle's sandbox for checkout testing only. Sandbox checkout cannot create a real charge. This page can never charge you or grant access by itself; sandbox entitlements require server-side verification and remain test data, not proof of a paid production plan. Live checkout is intentionally disabled, so outside a successful sandbox test nothing is charged.";

const SANDBOX_COPY: CheckoutTrustCopy = Object.freeze({
  state: "sandbox",
  label: "Paddle sandbox — Test only",
  summary: "No real charges can be made. This app uses Paddle's sandbox for checkout testing.",
  faqQuestion: "Is checkout live?",
  faqAnswer: CHECKOUT_MECHANISM_FAQ_ANSWER,
  canCreateLiveCharge: false,
});

const UNAVAILABLE_COPY: CheckoutTrustCopy = Object.freeze({
  state: "unavailable",
  label: "Sandbox test checkout unavailable",
  summary:
    "Live checkout is disabled. Sandbox test checkout cannot open in this environment right now; no charge is created and no real charge is possible.",
  faqQuestion: "Is checkout live?",
  faqAnswer: CHECKOUT_MECHANISM_FAQ_ANSWER,
  canCreateLiveCharge: false,
});

/**
 * Build truthful buyer-facing checkout copy from the same environment decision
 * that gates the Paddle overlay. Unknown values and runtime failures fail closed.
 */
export function buildCheckoutTrustCopy(input: CheckoutTrustCopyInput): CheckoutTrustCopy {
  if (input.blocked) return UNAVAILABLE_COPY;
  if (input.environment === "sandbox") return SANDBOX_COPY;
  return UNAVAILABLE_COPY;
}
