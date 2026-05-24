/**
 * Pure helpers for the Daily Check post-submit confirmation.
 *
 * Read-only. No I/O. No writes. No persistence. No RPC.
 *
 * The Daily Check route listens for the existing `verdant:entry-created`
 * window event (dispatched by QuickLog only after a successful insert) to
 * decide when to show a confirmation block. Success state is never
 * derived from open/close lifecycle — only from that success event.
 *
 * Disallowed copy ("perfect", "completed", "guaranteed healthy") is
 * enforced by tests — see
 * src/test/daily-check-post-submit.test.tsx.
 */

export const DAILY_CHECK_SUCCESS_TITLE = "Today's check was logged";
export const DAILY_CHECK_SUCCESS_BODY =
  "Your Daily Grow Check entry is saved. You can keep going or jump back to your plant.";

/** Recognized entry-point query values for `?from=`. */
export type DailyCheckEntrySource = "dashboard" | "plant-detail";

const ALLOWED_SOURCES: ReadonlyArray<DailyCheckEntrySource> = [
  "dashboard",
  "plant-detail",
];

/**
 * Parse the raw `?from=` query value into a known entry source. Unknown,
 * malformed, or missing values resolve to `null` so callers fall back to
 * the safe default (Dashboard).
 */
export function parseDailyCheckEntrySource(
  raw: string | null | undefined,
): DailyCheckEntrySource | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (ALLOWED_SOURCES as ReadonlyArray<string>).includes(v)
    ? (v as DailyCheckEntrySource)
    : null;
}

/**
 * Build a `/daily-check` href for a given plant + entry source. Keeps the
 * existing `?plantId=` contract backward compatible — `from` is appended
 * only when known.
 */
export function buildDailyCheckEntryHref(input: {
  plantId: string;
  source?: DailyCheckEntrySource | null;
}): string {
  const base = `/daily-check?plantId=${input.plantId}`;
  return input.source ? `${base}&from=${input.source}` : base;
}

export interface DailyCheckPostSubmitAction {
  key: "dashboard" | "plant";
  label: string;
  href: string;
  primary: boolean;
}

export interface DailyCheckPostSubmitInput {
  /** Plant currently selected on the Daily Check page, if any. */
  plantId: string | null | undefined;
  /** Where the grower opened Daily Check from, if recognized. */
  source?: DailyCheckEntrySource | null;
}

/**
 * Build the two grower-friendly next actions for the post-submit block.
 *
 * Primary CTA is source-aware:
 *  - from=plant-detail → "Back to Plant" (requires a valid plantId)
 *  - from=dashboard or unknown → "Back to Dashboard"
 *
 * Secondary CTA points at the other useful destination when a plant is
 * selected so the grower always has both jumps available.
 */
export function buildDailyCheckPostSubmitActions(
  input: DailyCheckPostSubmitInput,
): DailyCheckPostSubmitAction[] {
  const plantId = input.plantId || null;
  const source = input.source ?? null;
  const plantPrimary = source === "plant-detail" && !!plantId;

  const dashboard: DailyCheckPostSubmitAction = {
    key: "dashboard",
    label: "Back to Dashboard",
    href: "/",
    // Dashboard is primary unless the grower came from a plant page AND we
    // have a valid plant target to send them back to.
    primary: !plantPrimary,
  };

  if (!plantId) {
    return [dashboard];
  }

  const plant: DailyCheckPostSubmitAction = {
    key: "plant",
    label: plantPrimary ? "Back to Plant" : "View Plant",
    href: `/plants/${plantId}`,
    primary: plantPrimary,
  };

  // Stable order: primary first so it renders left/top.
  return plantPrimary ? [plant, dashboard] : [dashboard, plant];
}

/**
 * Deterministic short time formatter for the "Logged at <time>" line on
 * the success card. Uses Intl.DateTimeFormat with a stable locale so
 * tests can assert exact strings.
 *
 * Returns `null` when the timestamp is missing, invalid, or in the
 * future — we never invent a saved time.
 */
export function formatDailyCheckLoggedAt(
  ts: number | string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (ts == null) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  // Guard against clock-skew/future fakery — never claim a check was
  // logged in the future.
  if (t - now.getTime() > 60_000) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `Logged at ${formatted}`;
}
