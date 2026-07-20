/**
 * Pure client-side validation for the public Founder availability response.
 * The Edge Function remains authoritative; this parser prevents malformed
 * responses from becoming trusted scarcity copy in the pricing UI.
 */

import { FOUNDER_LIFETIME_LIMIT } from "@/constants/pricing";

export interface FounderSlotsReadyResult {
  readonly remaining: number;
  readonly total: typeof FOUNDER_LIFETIME_LIMIT;
  readonly claimed: number;
  readonly soldOut: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFounderSlotsResponse(value: unknown): FounderSlotsReadyResult | null {
  if (!isRecord(value)) return null;

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "remaining" || keys[1] !== "total") {
    return null;
  }

  const remaining = value.remaining;
  if (
    typeof remaining !== "number" ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    remaining > FOUNDER_LIFETIME_LIMIT
  ) {
    return null;
  }
  if (value.total !== FOUNDER_LIFETIME_LIMIT) return null;

  return {
    remaining: remaining === 0 ? 0 : remaining,
    total: FOUNDER_LIFETIME_LIMIT,
    claimed: FOUNDER_LIFETIME_LIMIT - remaining,
    soldOut: remaining === 0,
  };
}
