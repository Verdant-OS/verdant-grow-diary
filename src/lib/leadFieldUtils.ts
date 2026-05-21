/**
 * Shared field normalization helpers for the Leads Command Center.
 *
 * Centralizes logic that was previously duplicated across many leadXxxRules
 * modules. Behavior is intentionally identical to the prior copies so that
 * sanitization, ordering, and deterministic output remain unchanged.
 */
import type { LeadStatus } from "@/hooks/useLeadsList";

/**
 * Canonical set of known lead statuses. Anything outside this set should be
 * treated as unknown/malformed by derived rules (never silently ignored).
 */
export const KNOWN_LEAD_STATUSES: ReadonlySet<string> = new Set<LeadStatus>([
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
]);

/** True when value is a non-empty string after trimming. */
export function isMeaningfulString(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parse an ISO timestamp. Returns null when the value is missing or invalid.
 * Used wherever helpers must treat malformed timestamps as "unknown" rather
 * than silently coercing to 0 or now().
 */
export function parseLeadTime(
  iso: string | null | undefined,
): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}
