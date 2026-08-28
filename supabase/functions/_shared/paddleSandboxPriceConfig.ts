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
 *   1. If ANY `PADDLE_SANDBOX_PRICE_*` key is present in the environment
 *      (including empty or whitespace-only), use that set EXCLUSIVELY.
 *      Absent or whitespace values resolve to "" — never to `PADDLE_PRICE_*`.
 *   2. Only when no `PADDLE_SANDBOX_PRICE_*` key is present at all, fall back
 *      to the legacy `PADDLE_PRICE_*` names, so nothing changes before the
 *      new secrets exist.
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
  // Presence is raw: the key exists in the environment. Do not trim before
  // this check — whitespace-only must still select the sandbox set, or a
  // mis-set secret would silently fall through to live/legacy price ids.
  const sandboxScoped = PLAN_KEYS.some(
    (key) => getEnv(PADDLE_SANDBOX_PRICE_ENV_NAMES[key]) !== undefined,
  );
  const names = sandboxScoped ? PADDLE_SANDBOX_PRICE_ENV_NAMES : PADDLE_LEGACY_PRICE_ENV_NAMES;
  const read = (name: string) => (getEnv(name) ?? "").trim();

  return {
    pro_monthly: read(names.pro_monthly),
    pro_annual: read(names.pro_annual),
    founder_lifetime: read(names.founder_lifetime),
  };
}
