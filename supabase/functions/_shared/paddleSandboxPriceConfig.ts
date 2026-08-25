/**
 * Sandbox price-ID resolution for the legacy BYO webhook (`paddle-webhook`).
 *
 * WHY THIS EXISTS. `paddle-webhook` is the legacy BYO audit sink and is pinned
 * to sandbox forever — it refuses any event unless `PADDLE_ENVIRONMENT` is
 * exactly "sandbox", because no registered live endpoint routes into it. But it
 * classified plans using the same `PADDLE_PRICE_*` names that
 * `get-paddle-price` reads, and that function selects its catalog from the
 * SERVER's `PAYMENTS_ENVIRONMENT`. At a live transition those names hold LIVE
 * price ids, so every sandbox event silently classified as `null` — no error,
 * no alert, just an operator audit lane quietly full of unclassified rows.
 *
 * Resolution order, all-or-nothing by design:
 *   1. If ANY `PADDLE_SANDBOX_PRICE_*` name is set, use that set EXCLUSIVELY.
 *      Unset keys resolve to "" rather than borrowing the legacy value.
 *   2. Otherwise fall back to the legacy `PADDLE_PRICE_*` names, so nothing
 *      changes before the new secrets are configured.
 *
 * All-or-nothing matters: a per-key fallback would let a partly configured
 * sandbox set silently mix live ids into the unset keys, which is the failure
 * this module exists to prevent. An unmatched price id already yields `null`
 * downstream — the existing safe behaviour for an unknown price.
 *
 * Pure: no Deno, no I/O, no clock. The caller passes `getEnv`.
 */
export interface PaddleSandboxPriceConfig {
  pro_monthly: string;
  pro_annual: string;
  founder_lifetime: string;
}

export const PADDLE_LEGACY_PRICE_ENV_NAMES = {
  pro_monthly: "PADDLE_PRICE_PRO_MONTHLY",
  pro_annual: "PADDLE_PRICE_PRO_ANNUAL",
  founder_lifetime: "PADDLE_PRICE_FOUNDER_LIFETIME",
} as const;

export const PADDLE_SANDBOX_PRICE_ENV_NAMES = {
  pro_monthly: "PADDLE_SANDBOX_PRICE_PRO_MONTHLY",
  pro_annual: "PADDLE_SANDBOX_PRICE_PRO_ANNUAL",
  founder_lifetime: "PADDLE_SANDBOX_PRICE_FOUNDER_LIFETIME",
} as const;

type PlanKey = keyof PaddleSandboxPriceConfig;
const PLAN_KEYS: readonly PlanKey[] = ["pro_monthly", "pro_annual", "founder_lifetime"];

export function resolvePaddleSandboxPriceConfig(
  getEnv: (name: string) => string | undefined,
): PaddleSandboxPriceConfig {
  const read = (name: string) => (getEnv(name) ?? "").trim();

  const sandboxScoped = PLAN_KEYS.some(
    (key) => read(PADDLE_SANDBOX_PRICE_ENV_NAMES[key]).length > 0,
  );
  const names = sandboxScoped ? PADDLE_SANDBOX_PRICE_ENV_NAMES : PADDLE_LEGACY_PRICE_ENV_NAMES;

  return {
    pro_monthly: read(names.pro_monthly),
    pro_annual: read(names.pro_annual),
    founder_lifetime: read(names.founder_lifetime),
  };
}
