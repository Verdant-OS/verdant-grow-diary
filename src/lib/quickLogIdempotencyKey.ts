/**
 * Server-side idempotency key for quicklog_save_manual submissions.
 *
 * One key identifies one LOGICAL submission: callers must reuse the same
 * key when retrying the same submission (the RPC then returns the original
 * grow_event_id with reused=true instead of double-writing the diary) and
 * mint a fresh key only when a genuinely new submission starts.
 * Server contract: 8..200 chars.
 */
export function newQuickLogSaveKey(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `quicklog-v2-${uuid}`;
}
