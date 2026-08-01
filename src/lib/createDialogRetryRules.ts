/**
 * createDialogRetryRules — pure debounce/cooldown for create-binding Retry.
 *
 * Prevents double-fire on grow refresh / tent refetch while fail-closed
 * states (read_error, tent unavailable) are shown. Does not change
 * state-machine kinds — only gates the re-fetch action.
 *
 * Pure: no React, no timers, no I/O.
 */

/** Minimum gap between successful Retry clicks (ms). */
export const CREATE_BINDING_RETRY_COOLDOWN_MS = 1500;

export interface CreateBindingRetryGate {
  /** True when a new attempt may start now. */
  allowed: boolean;
  /** ms until next allowed attempt (0 when allowed). */
  remainingMs: number;
  /** True when button should be disabled (cooldown or in-flight). */
  disabled: boolean;
  /** Human-facing reason for disabled state (empty when clickable). */
  reason: "ok" | "cooldown" | "in_flight";
}

/**
 * Gate a Retry attempt.
 * - inFlight → blocked (request already running)
 * - lastAttempt within cooldown → blocked with remainingMs
 * - otherwise allowed
 */
export function evaluateCreateBindingRetryGate(input: {
  lastAttemptAtMs?: number | null;
  nowMs: number;
  inFlight?: boolean;
  cooldownMs?: number;
}): CreateBindingRetryGate {
  const cooldown =
    typeof input.cooldownMs === "number" && Number.isFinite(input.cooldownMs)
      ? Math.max(0, Math.floor(input.cooldownMs))
      : CREATE_BINDING_RETRY_COOLDOWN_MS;
  const now =
    typeof input.nowMs === "number" && Number.isFinite(input.nowMs)
      ? Math.floor(input.nowMs)
      : 0;

  if (input.inFlight) {
    return {
      allowed: false,
      remainingMs: 0,
      disabled: true,
      reason: "in_flight",
    };
  }

  const last =
    typeof input.lastAttemptAtMs === "number" && Number.isFinite(input.lastAttemptAtMs)
      ? Math.floor(input.lastAttemptAtMs)
      : null;

  if (last != null) {
    const elapsed = now - last;
    if (elapsed < cooldown) {
      const remainingMs = Math.max(0, cooldown - elapsed);
      return {
        allowed: false,
        remainingMs,
        disabled: true,
        reason: "cooldown",
      };
    }
  }

  return {
    allowed: true,
    remainingMs: 0,
    disabled: false,
    reason: "ok",
  };
}

/** Timestamp to store after a Retry click is accepted. */
export function recordCreateBindingRetryAttempt(nowMs: number): number {
  return typeof nowMs === "number" && Number.isFinite(nowMs) ? Math.floor(nowMs) : 0;
}

/**
 * Whether to accept this click and start work.
 * Call with wall-clock now; if true, caller should record attempt + run fetch.
 */
export function shouldStartCreateBindingRetry(input: {
  lastAttemptAtMs?: number | null;
  nowMs: number;
  inFlight?: boolean;
  cooldownMs?: number;
}): boolean {
  return evaluateCreateBindingRetryGate(input).allowed;
}
