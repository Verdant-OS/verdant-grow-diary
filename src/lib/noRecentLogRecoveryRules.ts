/**
 * No Recent Log Recovery rules.
 *
 * Tired-grower recovery layer for Plant Detail:
 *   No recent check-in → one calm CTA → open existing Quick Log.
 *
 * Pure, deterministic, no React, no I/O, no writes, no alerts, no AI.
 */

export interface NoRecentLogRecoveryRow {
  occurredAt: string | null;
}

export interface NoRecentLogRecoveryInput {
  rows: readonly NoRecentLogRecoveryRow[] | null | undefined;
  now: number;
  staleAfterHours?: number;
}

export interface NoRecentLogRecoveryResult {
  showPrompt: boolean;
  reason: "no_activity" | "stale_activity" | "recent_activity" | "invalid_now";
  headline: string;
  body: string;
  ctaLabel: string;
  ariaLabel: string;
}

const DEFAULT_STALE_AFTER_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

const PROMPT_COPY = {
  headline: "No recent check-in.",
  body: "Add a 10-second status: Better, Same, or Worse.",
  ctaLabel: "Add quick check",
  ariaLabel: "Add a ten-second Quick Log check",
} as const;

function isFiniteTime(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function latestOccurredAtMs(rows: readonly NoRecentLogRecoveryRow[]): number | null {
  let latest: number | null = null;
  for (const row of rows) {
    if (!row?.occurredAt) continue;
    const t = Date.parse(row.occurredAt);
    if (!Number.isFinite(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

export function buildNoRecentLogRecovery(
  input: NoRecentLogRecoveryInput,
): NoRecentLogRecoveryResult {
  if (!isFiniteTime(input.now)) {
    return {
      showPrompt: false,
      reason: "invalid_now",
      headline: "",
      body: "",
      ctaLabel: "",
      ariaLabel: "",
    };
  }

  const rows = input.rows ?? [];
  if (rows.length === 0) {
    return { showPrompt: true, reason: "no_activity", ...PROMPT_COPY };
  }

  const latest = latestOccurredAtMs(rows);
  if (latest === null) {
    return { showPrompt: true, reason: "no_activity", ...PROMPT_COPY };
  }

  const staleAfterHours =
    typeof input.staleAfterHours === "number" && Number.isFinite(input.staleAfterHours)
      ? Math.max(1, input.staleAfterHours)
      : DEFAULT_STALE_AFTER_HOURS;
  const ageMs = input.now - latest;
  if (ageMs > staleAfterHours * HOUR_MS) {
    return { showPrompt: true, reason: "stale_activity", ...PROMPT_COPY };
  }

  return {
    showPrompt: false,
    reason: "recent_activity",
    headline: "",
    body: "",
    ctaLabel: "",
    ariaLabel: "",
  };
}
