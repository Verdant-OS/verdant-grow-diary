/**
 * Capability shape re-export. The type lives in ./types so the planCatalog
 * and resolver can import a single canonical definition.
 *
 * Pure. No React, no Supabase, no fetch.
 */
export type { Capabilities } from "./types";

/**
 * The free-tier capability set is also the safe fallback the resolver returns
 * for null rows, expired/canceled/paused/past_due subscriptions, and unknown
 * plan ids. Exported as a frozen object so callers cannot mutate it.
 */
import type { Capabilities } from "./types";

export const FREE_CAPABILITIES: Readonly<Capabilities> = Object.freeze({
  maxActiveGrows: 1,
  aiCreditsPerGrow: 3,
  aiMonthlyCredits: 0,
  liveSensors: false,
  advancedExports: false,
  multiTent: false,
  sensorHistoryDays: 90,
  prioritySupport: false,
});
