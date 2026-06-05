/**
 * PLAN_CATALOG — code-defined mapping from plan_id → Capabilities.
 *
 * Pure data. No React, no Supabase, no fetch, no time reads.
 *
 * Invariants enforced by tests:
 *  - pro_monthly and pro_annual resolve to IDENTICAL capabilities
 *    (cadence/price differ in billing, capabilities do not).
 *  - founder_lifetime is Pro-equivalent BUT aiMonthlyCredits is HARD-PINNED
 *    at 100 — never null, never Infinity, never "unlimited". This is the
 *    deliberate defusing of the lifetime AI-cost risk and must not change
 *    without an explicit product decision.
 */

import type { Capabilities, PlanId } from "./types";
import { FREE_CAPABILITIES } from "./capabilities";

const PRO_CAPABILITIES: Readonly<Capabilities> = Object.freeze({
  maxActiveGrows: null,
  aiCreditsPerGrow: null,
  aiMonthlyCredits: 100,
  liveSensors: true,
  advancedExports: true,
  multiTent: true,
  sensorHistoryDays: null,
  prioritySupport: true,
});

/**
 * Founder Lifetime: Pro capabilities forever. AI credits are intentionally
 * the same 100/month cap as Pro — never unlimited.
 */
const FOUNDER_LIFETIME_CAPABILITIES: Readonly<Capabilities> = Object.freeze({
  ...PRO_CAPABILITIES,
  aiMonthlyCredits: 100,
});

export const PLAN_CATALOG: Readonly<Record<PlanId, Readonly<Capabilities>>> =
  Object.freeze({
    free: FREE_CAPABILITIES,
    pro_monthly: PRO_CAPABILITIES,
    pro_annual: PRO_CAPABILITIES,
    founder_lifetime: FOUNDER_LIFETIME_CAPABILITIES,
  });

export const KNOWN_PLAN_IDS: ReadonlyArray<PlanId> = [
  "free",
  "pro_monthly",
  "pro_annual",
  "founder_lifetime",
];

export function isKnownPlanId(value: unknown): value is PlanId {
  return typeof value === "string" &&
    (KNOWN_PLAN_IDS as ReadonlyArray<string>).includes(value);
}
