/**
 * Lovable built-in Paddle client helper.
 *
 * SAFETY:
 *  - The client token is public by design (see paddle-security knowledge).
 *  - The `.env.development` build carries the TEST token; the production
 *    build carries the LIVE token. Environment is derived from the token
 *    prefix so this stays correct after the build-time swap.
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
  isLoopbackHostname,
  type PaddleCheckoutEnvironment,
} from "@/lib/paddleEnvironment";
import { handlePaddleCheckoutEvent } from "@/lib/checkoutOverlaySession";

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
 * Legacy helper: kept because `useMyEntitlements` compares this value against
 * the `environment` column on billing rows, which is only ever `'sandbox'`
 * or `'live'`.
 *
 * H5 (audit fix): the previous "unknown → live" fallback could strand a
 * re-entitled buyer on preview builds with a missing or malformed token
 * (the query would filter for `environment='live'` while the webhook wrote
 * `environment='sandbox'`). We now fall back to `'sandbox'` — safe in
 * preview (matches sandbox webhook writes), and irrelevant in production
 * because `.env.production` ships a well-formed `live_` token by
 * construction. Live remains only for explicitly `live_`-prefixed tokens.
 *
 * DO NOT use this to gate checkout — use `resolvePaddleCheckout()` instead,
 * which fails closed on loopback + live and on malformed tokens.
 */
export function getPaddleEnvironment(): "sandbox" | "live" {
  return classifyPaddleToken(clientToken) === "live" ? "live" : "sandbox";
}

/**
 * Slice A — deterministic checkout gate. Returns `'sandbox' | 'live' |
 * 'unavailable'`. Callers MUST refuse to open checkout when the result is
 * `'unavailable'` and MUST surface the matching blocking copy.
 */
export function resolvePaddleCheckout(): PaddleCheckoutEnvironment {
  return resolvePaddleCheckoutEnvironment({
    token: clientToken,
    hostname: currentHostname(),
  });
}

/**
 * Grower-facing blocking copy for the current unavailable case. Returns
 * `null` when checkout is available (sandbox or live). Never reveals which
 * token was present.
 */
export function getCheckoutUnavailableMessage(): string | null {
  const env = resolvePaddleCheckout();
  if (env !== "unavailable") return null;
  // Distinguish only the loopback+live case, which has a specific
  // remediation. Every other unavailable case gets generic copy.
  if (classifyPaddleToken(clientToken) === "live" && isLoopbackHostname(currentHostname())) {
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
 * Raised when the server-side price resolver refuses to hand back a
 * Paddle price id for a known-good reason: the plan isn't in the
 * allowlist, the catalog entry doesn't exist yet, the corresponding
 * `PADDLE_PRICE_*` env var is unset, or the gateway itself failed. Handled
 * by the checkout hook as a calm inline blocked state — no destructive
 * toast, no lost intent, no crash.
 *
 * `reason` mirrors the sanitized error code from get-paddle-price
 * (`unknown_plan` | `price_not_configured` | `price_resolution_unavailable`
 * | `plan_sold_out` | `pack_requires_monthly_plan`). Callers should treat
 * unknown reasons as a generic "unavailable" state.
 */
export type PaddleCheckoutCatalogReason =
  | "unknown_plan"
  | "price_not_configured"
  | "price_resolution_unavailable"
  | "plan_sold_out"
  | "pack_requires_monthly_plan";

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

const CATALOG_REASONS: ReadonlySet<PaddleCheckoutCatalogReason> = new Set([
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "pack_requires_monthly_plan",
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
    case "price_resolution_unavailable":
    default:
      return "Checkout is temporarily unavailable for this plan. Please try again in a moment or pick another plan.";
  }
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
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      const code = body && typeof body.error === "string" ? body.error : null;
      if (code && CATALOG_REASONS.has(code as PaddleCheckoutCatalogReason)) {
        return code as PaddleCheckoutCatalogReason;
      }
    } catch {
      // fall through — not a JSON body
    }
  }
  return null;
}

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (paddleInitPromise) return paddleInitPromise;

  // Fail closed BEFORE loading Paddle.js. Covers: missing/malformed token,
  // and live token on a loopback host (Slice A).
  const env = resolvePaddleCheckout();
  if (env === "unavailable") {
    throw new PaddleCheckoutUnavailableError(
      getCheckoutUnavailableMessage() ?? CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
    );
  }

  paddleInitPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle-loader="true"]');
    const onLoad = () => {
      try {
        const paddleJsEnv = env === "sandbox" ? "sandbox" : "production";
        (window as any).Paddle.Environment.set(paddleJsEnv);
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
  // Slice A — never resolve prices when checkout is unavailable.
  const env = resolvePaddleCheckout();
  if (env === "unavailable") {
    throw new PaddleCheckoutUnavailableError(
      getCheckoutUnavailableMessage() ?? CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE,
    );
  }
  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment: env },
  });
  if (error || !data?.paddleId) {
    const reason = await extractCatalogReason(data, error);
    if (reason) {
      throw new PaddleCheckoutCatalogUnavailableError(
        reason,
        priceId,
        getPaddleCheckoutCatalogMessage(reason),
      );
    }
    throw new Error(`Failed to resolve price: ${priceId}`);
  }
  return data.paddleId as string;
}
