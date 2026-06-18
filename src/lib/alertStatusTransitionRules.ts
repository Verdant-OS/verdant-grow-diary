/**
 * alertStatusTransitionRules — pure helpers that build the column patches
 * sent to `public.alerts` for status transitions.
 *
 * Why this exists:
 *   The `alerts` table enforces two CHECK constraints:
 *     - alerts_acknowledged_at_status_check:
 *         (acknowledged_at IS NULL) OR (status = 'acknowledged')
 *     - alerts_resolved_at_status_check:
 *         (resolved_at     IS NULL) OR (status = 'resolved')
 *
 *   That means any transition AWAY FROM `acknowledged` must clear
 *   `acknowledged_at`, and any transition AWAY FROM `resolved` must clear
 *   `resolved_at`. Building these patches in one deterministic place avoids
 *   the "Resolve violates constraint" regression observed when resolving an
 *   acknowledged alert (the row already had a non-null acknowledged_at).
 *
 * Safety:
 *   - Pure, deterministic, no React, no I/O, no Supabase imports.
 *   - No alerts automation, no AI calls, no Action Queue writes.
 *   - Operator-safe error copy never leaks raw DB constraint names.
 */

export type AlertTransitionStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export interface AlertResolvePatch {
  status: "resolved";
  resolved_at: string;
  acknowledged_at: null;
}

export interface AlertAcknowledgePatch {
  status: "acknowledged";
  acknowledged_at: string;
  resolved_at: null;
}

export interface AlertDismissPatch {
  status: "dismissed";
  acknowledged_at: null;
  resolved_at: null;
}

export interface AlertReopenPatch {
  status: "open";
  acknowledged_at: null;
  resolved_at: null;
}

function nowIso(now?: Date | string | null): string {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === "string" && now.length > 0) return now;
  return new Date().toISOString();
}

/** Resolving must clear `acknowledged_at` to satisfy the CHECK constraint. */
export function buildResolveAlertPatch(
  now?: Date | string | null,
): AlertResolvePatch {
  return {
    status: "resolved",
    resolved_at: nowIso(now),
    acknowledged_at: null,
  };
}

/** Acknowledging clears any stale `resolved_at` to satisfy the CHECK constraint. */
export function buildAcknowledgeAlertPatch(
  now?: Date | string | null,
): AlertAcknowledgePatch {
  return {
    status: "acknowledged",
    acknowledged_at: nowIso(now),
    resolved_at: null,
  };
}

/** Dismissing must clear both timestamps — neither matches `dismissed`. */
export function buildDismissAlertPatch(): AlertDismissPatch {
  return {
    status: "dismissed",
    acknowledged_at: null,
    resolved_at: null,
  };
}

/** Reopening clears both timestamps so the row returns to a pristine state. */
export function buildReopenAlertPatch(): AlertReopenPatch {
  return {
    status: "open",
    acknowledged_at: null,
    resolved_at: null,
  };
}

const SAFE_TRANSITION_COPY: Record<string, string> = {
  acknowledge: "Couldn't acknowledge this alert. Please try again.",
  resolve: "Couldn't resolve this alert. Please try again.",
  dismiss: "Couldn't dismiss this alert. Please try again.",
  reopen: "Couldn't reopen this alert. Please try again.",
};

const RAW_DB_NEEDLES = [
  /alerts_[a-z_]+_check/i,
  /violates check constraint/i,
  /new row for relation/i,
  /pgrst\d+/i,
  /sqlstate/i,
];

export type AlertTransitionKind =
  | "acknowledge"
  | "resolve"
  | "dismiss"
  | "reopen";

/**
 * Map any thrown error to a calm operator-facing message that never leaks
 * raw DB constraint names, SQLSTATE codes, or PostgREST internals.
 */
export function safeAlertTransitionErrorCopy(
  kind: AlertTransitionKind,
  error: unknown,
): string {
  const fallback =
    SAFE_TRANSITION_COPY[kind] ?? "Couldn't update this alert. Please try again.";
  if (!error) return fallback;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!raw) return fallback;
  for (const needle of RAW_DB_NEEDLES) {
    if (needle.test(raw)) return fallback;
  }
  // The raw message is safe (already user-facing). Prefer the safe fallback
  // so copy stays consistent regardless of the backend's wording.
  return fallback;
}
