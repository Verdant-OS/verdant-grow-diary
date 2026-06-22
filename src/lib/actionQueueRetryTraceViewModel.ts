/**
 * actionQueueRetryTraceViewModel — pure helper that derives the calm,
 * trace-specific retry guidance for /actions row and drawer surfaces.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Copy is specific to *diary trace* failure. Never generic
 *    "something went wrong", never implies equipment/device execution,
 *    never implies the action is "safe" or "healthy", and never says
 *    that retry approves/rejects again.
 *  - Button state derives ONLY from `traceFailed` + `retrying` flags
 *    already known to the caller.
 */

export type RetryTraceUiState = "idle" | "failed" | "retrying";

/** Primary explanation surfaced to the grower when trace insert failed. */
export const RETRY_TRACE_EXPLAIN_PRIMARY =
  "Status was saved, but the diary trace did not save.";

/** Secondary explanation: clarifies retry scope. */
export const RETRY_TRACE_EXPLAIN_SECONDARY =
  "Retry only repairs the diary trace. It will not approve/reject again.";

export const RETRY_TRACE_BUTTON_LABEL_IDLE = "Retry trace";
export const RETRY_TRACE_BUTTON_LABEL_RETRYING = "Retrying trace…";

export interface RetryTraceViewModelInput {
  /** True when the page knows this row's diary trace insert failed. */
  traceFailed: boolean;
  /** True when a trace-only retry is in flight for this row. */
  retrying: boolean;
}

export interface RetryTraceViewModel {
  state: RetryTraceUiState;
  /** Two short lines, in order. Empty when state is `idle`. */
  explanationLines: readonly string[];
  /** Button label or null when the button is hidden. */
  buttonLabel: string | null;
  /** True when the button should be rendered but disabled. */
  buttonDisabled: boolean;
  /** True when the button should not be rendered at all. */
  buttonHidden: boolean;
  /** True when the failure region/banner should render. */
  showFailureRegion: boolean;
}

export function buildRetryTraceViewModel(
  input: RetryTraceViewModelInput,
): RetryTraceViewModel {
  const failed = !!input?.traceFailed;
  const retrying = !!input?.retrying;
  if (!failed) {
    return {
      state: "idle",
      explanationLines: [],
      buttonLabel: null,
      buttonDisabled: false,
      buttonHidden: true,
      showFailureRegion: false,
    };
  }
  if (retrying) {
    return {
      state: "retrying",
      explanationLines: [
        RETRY_TRACE_EXPLAIN_PRIMARY,
        RETRY_TRACE_EXPLAIN_SECONDARY,
      ],
      buttonLabel: RETRY_TRACE_BUTTON_LABEL_RETRYING,
      buttonDisabled: true,
      buttonHidden: false,
      showFailureRegion: true,
    };
  }
  return {
    state: "failed",
    explanationLines: [
      RETRY_TRACE_EXPLAIN_PRIMARY,
      RETRY_TRACE_EXPLAIN_SECONDARY,
    ],
    buttonLabel: RETRY_TRACE_BUTTON_LABEL_IDLE,
    buttonDisabled: false,
    buttonHidden: false,
    showFailureRegion: true,
  };
}
