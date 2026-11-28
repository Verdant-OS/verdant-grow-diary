/**
 * statusTransitionLabelRules — plain words for alert and action status
 * changes.
 *
 * Why (field-notebook walk, 2026-11-19, friction item 10): history rows
 * showed raw tokens such as "pending_approval → cancelled". Display only:
 * stored statuses never change. (Back-pointer tags in reasons are already
 * stripped by actionQueueProvenanceRules.stripBackPointerTokens.)
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */

export const STATUS_WORDS: Readonly<Record<string, string>> = {
  // Action Queue statuses.
  pending_approval: "Waiting for approval",
  simulated: "Simulated",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
  // Alert statuses.
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const STATUS_WORD_MISSING = "—";

/** One status token as words. Unknown tokens become sentence case, never a guess. */
export function formatStatusWord(status: string | null | undefined): string {
  if (typeof status !== "string") return STATUS_WORD_MISSING;
  const raw = status.trim();
  if (raw === "") return STATUS_WORD_MISSING;
  const known = STATUS_WORDS[raw.toLowerCase()];
  if (known) return known;
  const spaced = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "Waiting for approval → Cancelled". */
export function formatStatusTransition(
  previous: string | null | undefined,
  next: string | null | undefined,
): string {
  return `${formatStatusWord(previous)} → ${formatStatusWord(next)}`;
}
