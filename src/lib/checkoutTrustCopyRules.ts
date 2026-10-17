import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export type CheckoutTrustState = "sandbox" | "live" | "unavailable";

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
  /**
   * Scope of a runtime failure (see checkoutBlockedScopeRules). "plan": one
   * plan's price could not resolve. "pack": every credit pack is blocked.
   * In both, other plans can still check out. "checkout": checkout itself
   * failed, so no plan can check out. Missing means "checkout" (fail closed).
   */
  blockedScope?: "plan" | "pack" | "checkout" | null;
  /** The build-time kill switch is on: checkout is paused on every host. */
  paused?: boolean;
  /**
   * A well-formed live token on a host other than the production hostnames.
   * Checkout is closed here, but this is not a sandbox build, so the copy must
   * not talk about sandbox checkout.
   */
  liveOffHost?: boolean;
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

/** Answer shown when live checkout is open on a production hostname. */
export const LIVE_CHECKOUT_FAQ_ANSWER =
  "Yes. Checkout runs on Paddle, which processes the payment and shows the full price, tax and renewal terms before you confirm. Paid access starts only after Paddle confirms the payment to Verdant's server.";

const LIVE_COPY: CheckoutTrustCopy = Object.freeze({
  state: "live",
  label: "Secure checkout by Paddle",
  summary: "Paddle processes your payment. You see the exact price and tax before you pay.",
  faqQuestion: "Is checkout live?",
  faqAnswer: LIVE_CHECKOUT_FAQ_ANSWER,
  canCreateLiveCharge: true,
});

/** Live checkout failed as a whole (for example Paddle.js did not load). */
const LIVE_FAILED_COPY: CheckoutTrustCopy = Object.freeze({
  state: "unavailable",
  label: "Checkout unavailable right now",
  summary: "Checkout could not load, so no charge was made. Reload the page to try again.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "Not right now. Checkout could not load, so no charge was made. Reload the page to try again. Existing plans and billing are not affected.",
  canCreateLiveCharge: false,
});

/** Rollback artifact: checkout paused by the build-time kill switch. */
const PAUSED_COPY: CheckoutTrustCopy = Object.freeze({
  state: "unavailable",
  label: "Checkout paused",
  summary:
    "New checkout is paused. Existing plans, renewals and billing management are not affected.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "Not right now. New checkout is paused. Existing plans, renewals and billing management are not affected.",
  canCreateLiveCharge: false,
});

/** Live token on a non-production hostname: closed here, never sandbox wording. */
const LIVE_OFF_HOST_COPY: CheckoutTrustCopy = Object.freeze({
  state: "unavailable",
  label: "Checkout unavailable on this site",
  summary: "Checkout opens only on verdantgrowdiary.com. No charge can be made here.",
  faqQuestion: "Is checkout live?",
  faqAnswer:
    "Checkout runs only on verdantgrowdiary.com. On any other address it stays closed, so no charge can be made there.",
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
 * that gates the Paddle overlay. Unknown values fail closed; a runtime failure
 * replaces sandbox copy with unavailable copy but never hides that live
 * checkout can still charge.
 */
export function buildCheckoutTrustCopy(input: CheckoutTrustCopyInput): CheckoutTrustCopy {
  if (input.paused === true) return PAUSED_COPY;
  if (input.liveOffHost === true && input.environment !== "live") return LIVE_OFF_HOST_COPY;
  // Live keeps live copy after a single-plan failure: other plans can still
  // create a real charge. A checkout-wide failure (or an unknown scope)
  // means no plan can charge right now, so it says so without sandbox wording.
  if (input.environment === "live") {
    const otherPlansCanCharge = input.blockedScope === "plan" || input.blockedScope === "pack";
    if (input.blocked && !otherPlansCanCharge) return LIVE_FAILED_COPY;
    return LIVE_COPY;
  }
  if (input.blocked) return UNAVAILABLE_COPY;
  if (input.environment === "sandbox") return SANDBOX_COPY;
  return UNAVAILABLE_COPY;
}
