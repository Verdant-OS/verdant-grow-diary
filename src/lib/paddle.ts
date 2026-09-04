/**
 * Lovable built-in Paddle client helper.
 *
 * SAFETY:
 *  - The client token is public by design (see paddle-security knowledge).
 *  - Development and production builds intentionally carry sandbox-class
 *    client tokens. Live tokens fail closed on every host.
 *  - This module is client-side only. It does not touch the existing
 *    BYO Paddle stack (`src/lib/paddleConfig.ts`, `billing_subscriptions`,
 *    `paddle-webhook`) — those remain in place for the operator audit
 *    surfaces until Phase 2 explicitly bridges the two systems.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  resolvePaddleCheckoutEnvironment,
  classifyPaddleToken,
  CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE,
  CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
  type PaddleCheckoutEnvironment,
} from "@/lib/paddleEnvironment";
import { handlePaddleCheckoutEvent } from "@/lib/checkoutOverlaySession";
import { readEdgeFunctionErrorCode } from "@/lib/edgeFunctionError";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

// Global `(window as any).Paddle` typing is already declared by src/pages/Upgrade.tsx
// (loose PaddleGlobal shape). We access it via `(window as any).Paddle` here
// to avoid conflicting declarations while calling methods not modeled there
// (e.g. `Checkout.open({ customer, customData, settings })`).

function currentHostname(): string | null {
  if (typeof window === "undefined") return null;
  return window.location?.hostname ?? null;
}

/**
 * Entitlement reads stay pinned to sandbox while the product is test-only.
 * Checkout uses the stricter `resolvePaddleCheckout()` gate below.
 */
export function getPaddleEnvironment(): "sandbox" {
  return "sandbox";
}

/**
 * Deterministic checkout gate. Only `'sandbox'` authorizes checkout. The
 * broader return type is retained for compatibility with existing callers,
 * but the resolver currently returns only `'sandbox'` or `'unavailable'`.
 */
export function resolvePaddleCheckout(): PaddleCheckoutEnvironment {
  return resolvePaddleCheckoutEnvironment({
    token: clientToken,
    hostname: currentHostname(),
  });
}

/**
 * Grower-facing blocking copy for the current unavailable case. Returns
 * `null` only when sandbox checkout is available. Never reveals a token.
 */
export function getCheckoutUnavailableMessage(): string | null {
  const env = resolvePaddleCheckout();
  if (env === "sandbox") return null;
  if (classifyPaddleToken(clientToken) === "live") {
    return CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE;
  }
  return CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE;
}

let paddleInitialized = false;
let paddleInitPromise: Promise<void> | null = null;

export class PaddleCheckoutUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaddleCheckoutUnavailableError";
  }
}

/**
 * Raised whenever the price resolver does not hand back a Paddle price id.
 * Handled by the checkout hook as a calm inline blocked state — no
 * destructive toast, no lost intent, no crash — and, because that same
 * branch emits `checkout_catalog_unavailable`, raising this error is also
 * what makes a failure VISIBLE in the funnel.
 *
 * Two families of reason:
 *
 *  1. SERVER-DECLARED — the sanitized code get-paddle-price put in its own
 *     response body (`unknown_plan` | `price_not_configured` |
 *     `price_resolution_unavailable` | `plan_sold_out` |
 *     `pack_requires_monthly_plan` | `auth_required`). Trusted as-is.
 *  2. CLIENT-CLASSIFIED — assigned here when no server code is readable,
 *     from the HTTP status alone (`price_gateway_unavailable` |
 *     `price_request_failed` | `price_response_unusable`). These are never
 *     accepted FROM a response body; the server does not emit them.
 *
 * WHY (2) EXISTS — measured on live `ef7cec68`: a Pro Monthly click met a
 * 502 whose body was not our JSON envelope, so no code could be read and
 * the resolver threw a bare `Error`. The hook's fallback branch then showed
 * the same "checkout couldn't open, leave your email" copy it shows for a
 * stale session and for an unconfigured price — and emitted no telemetry at
 * all. Three different operator problems, one indistinguishable dead end.
 * Classifying by status keeps every failure fail-closed while telling the
 * grower which of them to act on, and the operator which one happened.
 */
export type PaddleCheckoutCatalogReason =
  | "unknown_plan"
  | "price_not_configured"
  | "price_resolution_unavailable"
  | "plan_sold_out"
  | "pack_requires_monthly_plan"
  | "auth_required"
  | "price_gateway_unavailable"
  | "price_request_failed"
  | "price_response_unusable";

export class PaddleCheckoutCatalogUnavailableError extends Error {
  readonly reason: PaddleCheckoutCatalogReason;
  readonly planId: string;
  constructor(reason: PaddleCheckoutCatalogReason, planId: string, message: string) {
    super(message);
    this.name = "PaddleCheckoutCatalogUnavailableError";
    this.reason = reason;
    this.planId = planId;
  }
}

/**
 * The SERVER-DECLARED codes only — the ones get-paddle-price actually writes
 * into its own response body. Only these are honoured when read off the
 * wire: a body claiming one of the client-classified reasons did not come
 * from our resolver, so an upstream that echoes arbitrary JSON cannot pick
 * the grower's message. Kept under this name because
 * `src/test/credit-pack-eligibility.test.ts` pins it by source text.
 */
const CATALOG_REASONS: ReadonlySet<PaddleCheckoutCatalogReason> = new Set([
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "pack_requires_monthly_plan",
  "auth_required",
]);

export function getPaddleCheckoutCatalogMessage(reason: PaddleCheckoutCatalogReason): string {
  switch (reason) {
    case "unknown_plan":
      return "This plan isn't available for checkout yet. Please pick another plan or check back soon.";
    case "price_not_configured":
      return "This plan isn't set up for checkout yet. Please pick another plan or check back soon.";
    case "plan_sold_out":
      return "This plan is sold out.";
    case "pack_requires_monthly_plan":
      return "Credit packs top up the monthly AI allowance that comes with a paid plan. Your current plan includes AI Doctor checks per grow instead, so a pack would have nothing to add to yet.";
    case "auth_required":
      // The resolver requires a verified signed-in caller. Say what to do,
      // not what broke: "sign in again" is the only action that helps, and
      // it is the one action the generic copy never offered.
      return "Verdant couldn't confirm you're still signed in, so checkout didn't open. Please sign in again, then choose your plan.";
    case "price_gateway_unavailable":
      // The resolver answered, but not with anything we can act on — it is
      // down or restarting. Not the plan's fault, so don't send the grower
      // off to pick a different one.
      return "Checkout couldn't be reached just now, and nothing was charged. Please try again in a moment.";
    case "price_request_failed":
      // No response reached us at all: offline, blocked, or DNS. The fix is
      // on the grower's side, so name it.
      return "Verdant couldn't reach checkout from this device, and nothing was charged. Check your connection, then try again.";
    case "price_response_unusable":
      // A reply arrived that isn't in the contract. Fail closed and keep the
      // grower calm rather than guessing which of the above it was.
      return "Checkout didn't return what Verdant needs to continue, and nothing was charged. Please try again in a moment.";
    case "price_resolution_unavailable":
    default:
      return "Checkout is temporarily unavailable for this plan. Please try again in a moment or pick another plan.";
  }
}

/**
 * HTTP status of a failed `functions.invoke`, or null when no response ever
 * arrived. supabase-js sets `error.context` to the raw `Response` for a
 * `FunctionsHttpError`; for a `FunctionsFetchError` it is the transport
 * error, which carries no numeric `status` — that absence is the signal.
 * Never reads the body, so it cannot consume the stream
 * `readEdgeFunctionErrorCode` still needs.
 *
 * Body first, status second, matching the sibling billing module
 * (`src/lib/customerPortal.ts:55-59`): a code the resolver declared about
 * itself is always better evidence than the status it happened to answer
 * with, and only an unreadable body falls through to the status.
 */
function readEdgeFunctionStatus(error: unknown): number | null {
  const ctx = (error as { context?: unknown } | null | undefined)?.context;
  const status = (ctx as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : null;
}

/**
 * True only for the genuine transport case. supabase-js raises
 * `FunctionsFetchError` when the request never received an HTTP response,
 * and puts the underlying network error — an `Error`, not a `Response` — in
 * `context`.
 *
 * WHY THIS IS SEPARATE FROM "no status": a missing `context.status` is NOT
 * evidence that the device is offline. An error with no `context` at all, a
 * malformed context, or any unexpected throw from the client also lands
 * there, and telling that grower to "check your connection" sends them to
 * fix something that is not broken. Only a real fetch failure earns that
 * message; everything else is a reply we cannot act on.
 */
function isTransportFailure(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  if (name === "FunctionsFetchError") return true;
  const ctx = (error as { context?: unknown } | null | undefined)?.context;
  return ctx instanceof Error;
}

/**
 * Fail-closed classification for a resolver failure that declared no reason
 * of its own. Total by construction: every input maps to exactly one
 * reason, so no failure can fall through to an unclassified state.
 */
function classifyUndeclaredPriceFailure(
  status: number | null,
  transport: boolean,
): PaddleCheckoutCatalogReason {
  if (status === 401) return "auth_required";
  if (status !== null && status >= 500) return "price_gateway_unavailable";
  if (status !== null) return "price_response_unusable";
  return transport ? "price_request_failed" : "price_response_unusable";
}

/** Best-effort extraction of the sanitized `{ error: "..." }` code returned
 *  by get-paddle-price, whether it surfaces via the invoke `data` (2xx-ish)
 *  or the `error.context` Response (non-2xx). Returns null if the body
 *  isn't a recognized catalog reason. */
async function extractCatalogReason(
  data: unknown,
  error: unknown,
): Promise<PaddleCheckoutCatalogReason | null> {
  const fromData =
    data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : null;
  if (fromData && CATALOG_REASONS.has(fromData as PaddleCheckoutCatalogReason)) {
    return fromData as PaddleCheckoutCatalogReason;
  }
  const code = await readEdgeFunctionErrorCode(error);
  if (code && CATALOG_REASONS.has(code as PaddleCheckoutCatalogReason)) {
    return code as PaddleCheckoutCatalogReason;
  }
  return null;
}

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (paddleInitPromise) return paddleInitPromise;

  // Fail closed before loading Paddle.js unless the environment is exactly
  // sandbox. This protects every host from a stray live client token.
  const env = resolvePaddleCheckout();
  if (env !== "sandbox") {
    throw new PaddleCheckoutUnavailableError(
      getCheckoutUnavailableMessage() ?? CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
    );
  }

  paddleInitPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle-loader="true"]');
    const onLoad = () => {
      try {
        (window as any).Paddle.Environment.set("sandbox");
        // Slice D: single module-level event router. Registered exactly
        // once at Initialize time — StrictMode-safe because
        // `paddleInitialized` guards re-entry.
        (window as any).Paddle.Initialize({
          token: clientToken,
          eventCallback: handlePaddleCheckoutEvent,
        });
        paddleInitialized = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    if (existing) {
      if ((window as any).Paddle) onLoad();
      else existing.addEventListener("load", onLoad);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.dataset.paddleLoader = "true";
    script.onload = onLoad;
    script.onerror = () => reject(new Error("Failed to load Paddle.js"));
    document.head.appendChild(script);
  });

  return paddleInitPromise;
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  // Never ask the catalog for a price unless checkout is exactly sandbox.
  const env = resolvePaddleCheckout();
  if (env !== "sandbox") {
    throw new PaddleCheckoutUnavailableError(
      getCheckoutUnavailableMessage() ?? CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
    );
  }
  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment: "sandbox" },
  });
  if (error || !data?.paddleId) {
    // Prefer what the resolver said about itself; fall back to what its
    // status implies. Either way this throws the TYPED error, because that
    // is the branch usePaddleCheckout treats as a calm inline block AND
    // reports as `checkout_catalog_unavailable`. The bare `Error` this used
    // to throw went to the destructive-toast branch instead, which reported
    // nothing — a silent failure on a revenue path.
    const reason =
      (await extractCatalogReason(data, error)) ??
      (error
        ? classifyUndeclaredPriceFailure(readEdgeFunctionStatus(error), isTransportFailure(error))
        : // 2xx with no price id: the resolver claimed success and gave us
          // nothing to open a checkout with.
          "price_response_unusable");
    throw new PaddleCheckoutCatalogUnavailableError(
      reason,
      priceId,
      getPaddleCheckoutCatalogMessage(reason),
    );
  }
  return data.paddleId as string;
}
