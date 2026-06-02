/**
 * Paddle sandbox configuration reader.
 *
 * Verdant is in SANDBOX-ONLY mode for Paddle payments. This module:
 *
 *  - reads Paddle config from VITE_PADDLE_* environment variables
 *  - REFUSES to initialize if the environment is "live" or "production"
 *  - returns a safe "unavailable" state when any required value is missing,
 *    so the billing UI can render an explicit unavailable message instead
 *    of pretending checkout works
 *
 * No real money. No live charges. No entitlement changes.
 *
 * Entitlements (e.g. Pro access) are NEVER granted from the client. They
 * are only granted server-side after a verified Paddle webhook event is
 * received and recorded in the `paddle_events` table.
 */

export const PADDLE_SANDBOX_ENV = "sandbox" as const;

export type PaddlePlanSlug = "pro-monthly" | "pro-annual" | "founder-lifetime";

export type PaddleConfigUnavailableReason =
  | "missing_environment"
  | "live_not_allowed"
  | "missing_client_token"
  | "missing_price_id";

export interface PaddleConfig {
  available: boolean;
  environment: string | null;
  reason?: PaddleConfigUnavailableReason;
  clientToken?: string;
  priceIds?: Record<PaddlePlanSlug, string>;
}


interface PaddleEnvSource {
  VITE_PADDLE_ENVIRONMENT?: string;
  VITE_PADDLE_CLIENT_TOKEN?: string;
  VITE_PADDLE_PRICE_PRO_MONTHLY?: string;
  VITE_PADDLE_PRICE_PRO_ANNUAL?: string;
  VITE_PADDLE_PRICE_FOUNDER_LIFETIME?: string;
}

function readImportMetaEnv(): PaddleEnvSource {
  try {
    // import.meta.env is provided by Vite at build time.
    return (import.meta as unknown as { env?: PaddleEnvSource }).env ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve the Paddle config. Pure function: no network, no side effects.
 */
export function resolvePaddleConfig(
  source: PaddleEnvSource = readImportMetaEnv(),
): PaddleConfig {
  const env = (source.VITE_PADDLE_ENVIRONMENT ?? "").trim().toLowerCase();

  if (!env) {
    return { available: false, reason: "missing_environment", environment: null };
  }

  if (env === "live" || env === "production") {
    // Hard refusal. Verdant is sandbox-only until live verification is complete.
    return { available: false, reason: "live_not_allowed", environment: env };
  }

  if (env !== PADDLE_SANDBOX_ENV) {
    return { available: false, reason: "missing_environment", environment: env };
  }

  const clientToken = (source.VITE_PADDLE_CLIENT_TOKEN ?? "").trim();
  if (!clientToken) {
    return { available: false, reason: "missing_client_token", environment: env };
  }

  const proMonthly = (source.VITE_PADDLE_PRICE_PRO_MONTHLY ?? "").trim();
  const proAnnual = (source.VITE_PADDLE_PRICE_PRO_ANNUAL ?? "").trim();
  const founderLifetime = (source.VITE_PADDLE_PRICE_FOUNDER_LIFETIME ?? "").trim();

  if (!proMonthly || !proAnnual || !founderLifetime) {
    return { available: false, reason: "missing_price_id", environment: env };
  }

  return {
    available: true,
    environment: PADDLE_SANDBOX_ENV,
    clientToken,
    priceIds: {
      "pro-monthly": proMonthly,
      "pro-annual": proAnnual,
      "founder-lifetime": founderLifetime,
    },
  };
}

export function unavailableMessage(reason: PaddleConfigUnavailableReason): string {
  switch (reason) {
    case "live_not_allowed":
      return "Checkout is disabled: Verdant is in sandbox/test mode and cannot accept live payments yet.";
    case "missing_client_token":
      return "Checkout is being finalized. Sandbox client token is not configured yet.";
    case "missing_price_id":
      return "Checkout is being finalized. Sandbox price IDs are not configured yet.";
    case "missing_environment":
    default:
      return "Checkout is being finalized. No payment is being collected on this screen.";
  }
}
