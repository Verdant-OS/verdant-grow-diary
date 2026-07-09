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

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as
  | string
  | undefined;

// Global `(window as any).Paddle` typing is already declared by src/pages/Upgrade.tsx
// (loose PaddleGlobal shape). We access it via `(window as any).Paddle` here
// to avoid conflicting declarations while calling methods not modeled there
// (e.g. `Checkout.open({ customer, customData, settings })`).


export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;
let paddleInitPromise: Promise<void> | null = null;

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (paddleInitPromise) return paddleInitPromise;

  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
  }

  paddleInitPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-paddle-loader="true"]',
    );
    const onLoad = () => {
      try {
        const paddleJsEnv =
          getPaddleEnvironment() === "sandbox" ? "sandbox" : "production";
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
  const environment = getPaddleEnvironment();
  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment },
  });
  if (error || !data?.paddleId) {
    throw new Error(`Failed to resolve price: ${priceId}`);
  }
  return data.paddleId as string;
}
