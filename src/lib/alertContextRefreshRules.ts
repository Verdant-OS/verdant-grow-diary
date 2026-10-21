/**
 * alertContextRefreshRules — when a grower's configured target replaces the
 * stage/default range that an open alert was raised against.
 *
 * The same-direction guard in usePersistEnvironmentAlerts (#2179) keeps one
 * open alert per (tent, metric, direction). A configured-target candidate
 * that collides with an open stage/default-range alert is therefore not
 * inserted, but the open row would keep describing the obsolete range in
 * "Why this alert?". The open row's title and reason are refreshed to the
 * configured-target wording instead. The same applies when the grower edits an
 * already-configured target: an open configured-target row whose quoted range
 * differs from the candidate's is refreshed. A new reading against an
 * unchanged range never rewrites the row, and the reverse (a stage/default
 * candidate against an open configured-target row) never rewrites it either.
 *
 * Pure: no React, no I/O, no clock.
 */

const CONFIGURED_TARGET_TITLE = /\b(above|below)\s+target\b/i;
const FALLBACK_RANGE_TITLE = /\b(above|below)\s+(stage range|default range)\b/i;

const CONFIGURED_RANGE = /configured target\s+([^)]+)/i;

/** The range quoted after "configured target" in a reason, or null. */
function configuredRange(reason: string): string | null {
  const match = CONFIGURED_RANGE.exec(reason);
  if (!match) return null;
  const range = match[1].trim().replace(/\.+$/, "").trim();
  return range || null;
}

function direction(title: string, pattern: RegExp): string | null {
  const match = pattern.exec(title);
  return match ? match[1].toLowerCase() : null;
}

export interface AlertContextRefresh {
  title: string;
  reason: string;
}

/**
 * The context to write onto an open alert, or null when the open row must be
 * left as it is. Only a configured-target candidate in the same direction as
 * an open stage/default-range row qualifies when the wording differs, or a
 * configured-target candidate against an open configured-target row in the
 * same direction when the quoted configured range differs (a target edit).
 */
export function resolveAlertContextRefresh(
  open: { title: string | null | undefined; reason: string | null | undefined },
  candidate: { title: string | null | undefined; reason: string | null | undefined },
): AlertContextRefresh | null {
  const openTitle = typeof open.title === "string" ? open.title.trim() : "";
  const nextTitle = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const nextReason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
  if (!openTitle || !nextTitle || !nextReason) return null;
  const nextDirection = direction(nextTitle, CONFIGURED_TARGET_TITLE);
  if (!nextDirection) return null;
  const openReason = typeof open.reason === "string" ? open.reason.trim() : "";
  const fallbackDirection = direction(openTitle, FALLBACK_RANGE_TITLE);
  if (fallbackDirection) {
    if (fallbackDirection !== nextDirection) return null;
    if (openTitle === nextTitle && openReason === nextReason) return null;
    return { title: nextTitle, reason: nextReason };
  }
  const configuredDirection = direction(openTitle, CONFIGURED_TARGET_TITLE);
  if (!configuredDirection || configuredDirection !== nextDirection) return null;
  // A target edit: only the quoted configured range decides. The observed
  // value changes with every reading and alone never rewrites the row.
  const nextRange = configuredRange(nextReason);
  if (!nextRange || configuredRange(openReason) === nextRange) return null;
  return { title: nextTitle, reason: nextReason };
}
