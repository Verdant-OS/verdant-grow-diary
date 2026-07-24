/**
 * quickLogTimestampRules — the dual-timestamp model for Quick Log saves.
 *
 * Pure. No React, no I/O, no persistence.
 *
 * Two distinct timestamps (founder-locked semantics, 2026-07-24):
 *  - `logged_at`  — when the grower RECORDED the entry ("Captured" in UI copy).
 *    Seeded when a Fast Add / Quick Log surface OPENS, overridable, persisted
 *    as a details key on the diary companion. Reports and calendar views group
 *    by it when present. Named `logged_at` (NOT `captured_at`) because
 *    `captured_at` is reserved sensor-observation provenance in this codebase
 *    (sensor_snapshot.captured_at) — reusing it would poison provenance greps.
 *  - `occurred_at` — when the activity actually HAPPENED. Backdatable by the
 *    grower; rides the first-class p_occurred_at RPC param on both safe save
 *    routes. Empty means "now": we send null so the server's
 *    COALESCE(p_occurred_at, now()) stamps commit time (existing behavior).
 *
 * Retry discipline (#317): quicklog_save_event md5-hashes p_occurred_at AND
 * p_details into its idempotency request hash. Both timestamps MUST therefore
 * be frozen ONCE per logical submission — alongside the idempotency key — and
 * reused verbatim on any retry, or the server returns idempotency_key_conflict
 * on the exact double-submit flows #317 fixed. buildQuickLogSubmissionTimestamps
 * is that freeze point.
 *
 * Timezone truth: <input type="datetime-local"> values are timezone-NAIVE
 * local wall-clock strings ("2026-07-24T14:30"). The ONLY correct conversion
 * is `new Date(value)` (interpreted in the grower's local zone) followed by
 * .toISOString(); string-appending "Z" would shift the moment by the UTC
 * offset, and manual offset math breaks across DST transitions.
 */

/** Grower-facing error copy for the occurred-at gate. Centralized here. */
export const QUICK_LOG_OCCURRED_AT_INVALID_ERROR =
  "Enter a valid date and time.";
export const QUICK_LOG_OCCURRED_AT_FUTURE_ERROR =
  "Happened-at can't be in the future.";

/**
 * Small clock-skew allowance so a grower whose device clock runs slightly
 * ahead of ours is not blocked from logging "now".
 */
export const QUICK_LOG_FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface QuickLogTimestampValidation {
  ok: boolean;
  error: string | null;
}

/**
 * Blocking UI validation for a datetime-local occurred-at input.
 * Blank/missing = "now" and passes (the field is optional). A typed value
 * must parse and must not be in the future (beyond skew) — a typed value
 * that cannot persist faithfully blocks the save; it is never silently
 * reinterpreted (same no-silent-loss principle as the detail-number gate).
 */
export function validateOccurredAtInput(
  raw: string | null | undefined,
  now: number,
): QuickLogTimestampValidation {
  if (raw == null) return { ok: true, error: null };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { ok: true, error: null };
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: QUICK_LOG_OCCURRED_AT_INVALID_ERROR };
  }
  if (parsed > now + QUICK_LOG_FUTURE_SKEW_MS) {
    return { ok: false, error: QUICK_LOG_OCCURRED_AT_FUTURE_ERROR };
  }
  return { ok: true, error: null };
}

/** Same gate for an overridden logged-at ("Captured") value. */
export function validateLoggedAtInput(
  raw: string | null | undefined,
  now: number,
): QuickLogTimestampValidation {
  // Identical rules: optional, must parse, must not be future.
  return validateOccurredAtInput(raw, now);
}

export interface QuickLogSubmissionTimestampsInput {
  /**
   * The logged-at seed — the moment the capture surface OPENED (Fast Add
   * click / form mount), or the grower's explicit override. Local
   * datetime-local string or ISO string. Blank falls back to `now`.
   */
  loggedAtRaw?: string | null;
  /**
   * The grower's occurred-at override (datetime-local string). Blank/null
   * means "now" → occurredAtIso is null so the server stamps commit time.
   */
  occurredAtRaw?: string | null;
  /** Freeze-point clock, injected for determinism. Epoch ms. */
  now: number;
}

export interface QuickLogSubmissionTimestamps {
  /** ISO logged-at ("Captured") — ALWAYS present; defaults to freeze time. */
  loggedAtIso: string;
  /** ISO occurred-at, or null meaning "server stamps now()". */
  occurredAtIso: string | null;
}

/**
 * THE freeze point: resolve both timestamps exactly once per logical
 * submission, next to idempotency-key creation. Callers must reuse the
 * returned object on retries (never re-invoke per attempt) — see the #317
 * hash note in the module header. Invalid inputs must be blocked by the
 * validate* gates BEFORE this runs; as a defensive floor, an unparseable
 * value here degrades to the safe default rather than throwing mid-save.
 */
export function buildQuickLogSubmissionTimestamps(
  input: QuickLogSubmissionTimestampsInput,
): QuickLogSubmissionTimestamps {
  const loggedRaw = (input.loggedAtRaw ?? "").trim();
  const loggedParsed = loggedRaw === "" ? NaN : Date.parse(loggedRaw);
  const loggedAtIso = Number.isFinite(loggedParsed)
    ? new Date(loggedParsed).toISOString()
    : new Date(input.now).toISOString();

  const occurredRaw = (input.occurredAtRaw ?? "").trim();
  const occurredParsed = occurredRaw === "" ? NaN : Date.parse(occurredRaw);
  const occurredAtIso = Number.isFinite(occurredParsed)
    ? new Date(occurredParsed).toISOString()
    : null;

  return { loggedAtIso, occurredAtIso };
}

/**
 * Seed value for a capture surface's logged-at field at OPEN time, as an ISO
 * string. Kept trivial (and pure) so every Fast Add entry point seeds the
 * same shape.
 */
export function seedLoggedAtIso(now: number): string {
  return new Date(now).toISOString();
}

// ---------------------------------------------------------------------------
// Read side — observation-time resolution for reports & calendar grouping
// ---------------------------------------------------------------------------

export interface DiaryObservationTimeRow {
  entry_at?: unknown;
  occurred_at?: unknown;
  details?: unknown;
}

function parseableIso(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? v : null;
}

/**
 * The observation time a report/calendar surface should group and filter by:
 * details.logged_at WHEN PRESENT AND PARSEABLE (the grower's "Captured"
 * moment), else entry_at, else occurred_at. Unparseable or missing logged_at
 * silently degrades to today's behavior — never invents, never throws.
 * (Mirrors the shipped resolveSensorObservationTime fallback pattern.)
 */
export function resolveDiaryEntryObservationTime(
  row: DiaryObservationTimeRow | null | undefined,
): string | null {
  if (!row) return null;
  const details = row.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const logged = parseableIso((details as Record<string, unknown>).logged_at);
    if (logged !== null) return logged;
  }
  return parseableIso(row.entry_at) ?? parseableIso(row.occurred_at);
}
