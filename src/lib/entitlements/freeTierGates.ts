/**
 * Free-tier creation gates — the client-side enforcement for the pricing
 * page's plan differentiators:
 *
 *   Free: maxActiveGrows = 1, multiTent = false (single tent)
 *   Pro / Founder: unlimited grows, multi-tent
 *
 * Until this module, those capabilities were defined but never read —
 * the limits existed only as copy. These gates make the claims real at
 * the creation seams (Grows page, CreateTentDialog).
 *
 * Design rules:
 *  - UX honesty, not security: the gate blocks the button and the submit
 *    handler. A server-side backstop (RLS/trigger) is a separate,
 *    explicitly-approved migration.
 *  - FAIL OPEN on uncertainty: while entitlements are loading (or the
 *    resolver is unavailable) creation stays allowed — a paying grower
 *    must never be locked out by a resolver hiccup. The count check only
 *    bites when we have a settled capabilities object.
 *  - Existing data is never touched: a grower already over the limit
 *    keeps full access to existing grows/tents; only NEW creation gates.
 *  - Pure. No React, no Supabase, no fetch, no time reads.
 */

import type { Capabilities } from "./types";

export interface CreationGateResult {
  /** False only when a settled capability limit is already reached. */
  allowed: boolean;
  /** The numeric limit that applied, or null when unlimited. */
  limit: number | null;
  /** Pinned, honest copy for the blocked state (null when allowed). */
  blockedCopy: string | null;
}

export const FREE_GROW_LIMIT_BLOCKED_COPY =
  "Free includes 1 active grow. Archive a grow to start a new one, or upgrade to Pro for unlimited grows." as const;

export const FREE_TENT_LIMIT_BLOCKED_COPY =
  "Free includes a single tent. Upgrade to Pro for multi-tent support." as const;

export const FREE_TIER_UPGRADE_PATH = "/pricing" as const;

const ALLOWED: CreationGateResult = Object.freeze({
  allowed: true,
  limit: null,
  blockedCopy: null,
});

/**
 * Gate for creating a NEW grow.
 *
 * @param capabilities settled capabilities, or null/undefined while the
 *   entitlement resolver is still loading (→ fail open)
 * @param activeGrowCount count of the grower's non-archived grows
 */
export function evaluateGrowCreationGate(
  capabilities: Capabilities | null | undefined,
  activeGrowCount: number,
): CreationGateResult {
  if (!capabilities) return ALLOWED;
  const limit = capabilities.maxActiveGrows;
  if (limit === null || limit === undefined) return ALLOWED;
  if (!Number.isFinite(limit) || limit < 0) return ALLOWED;
  if (activeGrowCount < limit) return { allowed: true, limit, blockedCopy: null };
  return {
    allowed: false,
    limit,
    blockedCopy: FREE_GROW_LIMIT_BLOCKED_COPY,
  };
}

/**
 * Gate for creating a NEW tent. Free (multiTent=false) means one active
 * tent; any plan with multiTent=true is unlimited.
 */
export function evaluateTentCreationGate(
  capabilities: Capabilities | null | undefined,
  activeTentCount: number,
): CreationGateResult {
  if (!capabilities) return ALLOWED;
  if (capabilities.multiTent) return ALLOWED;
  const limit = 1;
  if (activeTentCount < limit) return { allowed: true, limit, blockedCopy: null };
  return {
    allowed: false,
    limit,
    blockedCopy: FREE_TENT_LIMIT_BLOCKED_COPY,
  };
}

/**
 * Canonical helper for the sensorHistoryDays capability: the earliest ISO
 * timestamp a history query may reach back to, or null when unbounded.
 * `now` is injected — no clock reads in this module.
 *
 * Today's history surfaces are row-limited (latest-N) rather than
 * time-ranged, so nothing currently exceeds the free window by design;
 * any future long-range history view must bound its query with this.
 */
export function sensorHistoryWindowStartIso(
  capabilities: Capabilities | null | undefined,
  now: Date,
): string | null {
  if (!capabilities) return null;
  const days = capabilities.sensorHistoryDays;
  if (days === null || days === undefined) return null;
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
