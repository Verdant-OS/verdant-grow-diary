/**
 * serverBillingEnvironment — SELF-CONTAINED strict billing-environment
 * resolver for edge functions that must deploy through bundlers that only
 * see supabase/functions/** (no ../../src/lib reach).
 *
 * TWIN of resolveRequiredServerBillingEnvironment in
 * _shared/unionEntitlementLookup.ts — same contract, zero imports. Keep the
 * two implementations behaviorally identical (guarded by
 * src/test/referral-glue-sql.test.ts). Trust order:
 *   1. Explicit PAYMENTS_ENVIRONMENT ('live' | 'sandbox').
 *   2. Presence of exactly one of PADDLE_LIVE_API_KEY / PADDLE_SANDBOX_API_KEY.
 *   3. Otherwise ambiguous/missing → fail closed (no grant).
 * Never derived from request body/query.
 */

export type ServerBillingEnvironment = "live" | "sandbox";

export type ServerBillingEnvironmentResolution =
  | { ok: true; environment: ServerBillingEnvironment }
  | { ok: false; reason: "payments_environment_invalid" | "payments_environment_missing" };

export function resolveRequiredServerBillingEnvironment(
  getEnv: (name: string) => string | undefined = (n) =>
    (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(n),
): ServerBillingEnvironmentResolution {
  const explicit = getEnv("PAYMENTS_ENVIRONMENT");
  if (explicit === "live" || explicit === "sandbox") {
    return { ok: true, environment: explicit };
  }
  if (explicit !== undefined && explicit !== "") {
    return { ok: false, reason: "payments_environment_invalid" };
  }
  const hasLive = !!getEnv("PADDLE_LIVE_API_KEY");
  const hasSandbox = !!getEnv("PADDLE_SANDBOX_API_KEY");
  if (hasLive && !hasSandbox) return { ok: true, environment: "live" };
  if (hasSandbox && !hasLive) return { ok: true, environment: "sandbox" };
  return { ok: false, reason: "payments_environment_missing" };
}
