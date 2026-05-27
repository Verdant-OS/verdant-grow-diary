/**
 * Pure helper deriving the Shelly H&T setup card's top-level view state
 * (AUD-007). Without this, the card could sit indefinitely on the
 * "Checking setup…" spinner when the status query is slow, retrying, or
 * silently returns no payload.
 *
 * View states are mutually exclusive and deterministic:
 *
 *   - "loading"      — a real fetch is in flight and has not exceeded the
 *                       slow-fetch threshold yet
 *   - "slow"         — still pending, but the fetch has been running long
 *                       enough that we should show a non-blocking retry
 *                       hint instead of a bare spinner
 *   - "error"        — the query errored (offline / function unavailable /
 *                       auth lapsed). Card surfaces a retry affordance.
 *   - "missing"      — the query resolved successfully but returned no
 *                       payload, which we treat as "Not configured" with a
 *                       retry option rather than an infinite loader.
 *   - "ready"        — payload received; downstream rendering takes over.
 *
 * Pure rules only. No I/O, no React, no Supabase, no schema, no RLS,
 * no automation, no device control.
 */

export type ShellyHtSetupCardViewState =
  | "loading"
  | "slow"
  | "error"
  | "missing"
  | "ready";

export interface DeriveShellyHtSetupCardViewStateOptions {
  isPending: boolean;
  isError: boolean;
  hasData: boolean;
  /** True once the elapsed pending time exceeds the slow-fetch threshold. */
  isSlow: boolean;
}

export interface ShellyHtSetupCardViewStateResult {
  state: ShellyHtSetupCardViewState;
  /** True when the user should see a refresh affordance. */
  showRetry: boolean;
  /** Short user-facing message describing the state. */
  message: string;
}

/**
 * Resolve the card's top-level view state from the underlying React Query
 * status. We intentionally collapse "still pending after the slow
 * threshold" into a distinct "slow" state instead of an indefinite
 * "loading" — that prevents the AUD-007 stuck-spinner.
 */
export function deriveShellyHtSetupCardViewState(
  opts: DeriveShellyHtSetupCardViewStateOptions,
): ShellyHtSetupCardViewStateResult {
  const { isPending, isError, hasData, isSlow } = opts;

  if (isError) {
    return {
      state: "error",
      showRetry: true,
      message: "Couldn't load Shelly setup status.",
    };
  }

  if (isPending) {
    if (isSlow) {
      return {
        state: "slow",
        showRetry: true,
        message: "Still checking setup… this is taking longer than usual.",
      };
    }
    return {
      state: "loading",
      showRetry: false,
      message: "Checking setup…",
    };
  }

  if (!hasData) {
    return {
      state: "missing",
      showRetry: true,
      message: "Shelly setup status is unavailable right now.",
    };
  }

  return {
    state: "ready",
    showRetry: false,
    message: "",
  };
}

/** Slow-fetch threshold in milliseconds. */
export const SHELLY_HT_SETUP_SLOW_THRESHOLD_MS = 6000;
