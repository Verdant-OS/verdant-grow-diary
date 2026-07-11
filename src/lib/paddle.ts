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

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as
  | string
  | undefined;

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
 * or `'live'`. Falls back to `'live'` when the token is unclassifiable so
 * live billing rows still resolve after publish.
 *
 * DO NOT use this to gate checkout — use `resolvePaddleCheckout()` instead,
 * which fails closed on loopback + live and on malformed tokens.
 */
export function getPaddleEnvironment(): "sandbox" | "live" {
  const cls = classifyPaddleToken(clientToken);
  return cls === "sandbox" ? "sandbox" : "live";
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
  if (
    classifyPaddleToken(clientToken) === "live" &&
    isLoopbackHostname(currentHostname())
  ) {
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
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-paddle-loader="true"]',
    );
    const onLoad = () => {
      try {
        const paddleJsEnv = env === "sandbox" ? "sandbox" : "production";
        (window as any).Paddle.Environment.set(paddleJsEnv);
        (window as any).Paddle.Initialize({ token: clientToken });
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
    throw new Error(`Failed to resolve price: ${priceId}`);
  }
  return data.paddleId as string;
}

