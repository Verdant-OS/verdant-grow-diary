/**
 * actionQueueAlertContextFilter — pure helper for the Action Queue
 * "Filtered by alert" client-side narrowing.
 *
 * Matches rows whose `reason` carries the exact `[alert:<id>]` back-pointer
 * token. No partial-id matching, no fuzzy compare. Token parsing is delegated
 * to the existing safe `extractSourceAlertId` regex, which enforces the
 * shared `[A-Za-z0-9_-]{1,64}` ID charset.
 *
 * No I/O, no mutations, no side effects.
 */
import { extractSourceAlertId } from "./actionQueueProvenanceRules";

/** Safe charset for an alert id arriving from the URL `?alert=<id>` param. */
const SAFE_ALERT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Normalize a raw `?alert=` query param value into a safe alert id, or
 * `null` when missing / empty / outside the safe charset.
 *
 * `URLSearchParams.get` already URL-decodes, so percent-encoded UUIDs
 * resolve correctly before the charset check runs.
 */
export function parseAlertContextParam(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return SAFE_ALERT_ID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Narrow a list of action rows to those linked to `alertId` via an exact
 * `[alert:<id>]` token in the row's `reason`. Returns the input list
 * unchanged when `alertId` is null/empty (no filter applied).
 */
export function filterActionsByAlertContext<
  R extends { reason?: string | null },
>(rows: readonly R[], alertId: string | null | undefined): R[] {
  if (!alertId) return [...rows];
  return rows.filter((r) => extractSourceAlertId(r.reason ?? null) === alertId);
}
