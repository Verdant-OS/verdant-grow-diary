/**
 * Cost-domain thresholds.
 *
 * Every entry is intentionally a TBD marker. No throttling, no back-pressure,
 * and no fabricated numeric limit may be added here until real measurements
 * exist from production telemetry or a load test.
 *
 * Replace a marker only when:
 *   - TBD_MEASURED  → backed by recorded production measurements
 *   - TBD_LOAD_TEST → backed by a reproducible load-test report
 */

export type ThresholdMarker = "TBD_MEASURED" | "TBD_LOAD_TEST";

export interface ThresholdConfig {
  readonly dbRefresh: {
    readonly maxDurationMs: ThresholdMarker;
    readonly maxQueueWaitMs: ThresholdMarker;
    readonly maxDeltaRowCount: ThresholdMarker;
  };
  readonly llmPrompt: {
    readonly maxSummaryByteSize: ThresholdMarker;
    readonly maxEstimatedPromptTokens: ThresholdMarker;
    readonly rawHistoryFallbackBudgetPerHour: ThresholdMarker;
  };
  readonly ingestRate: {
    readonly maxReadingsPer1m: ThresholdMarker;
    readonly maxReadingsPer5m: ThresholdMarker;
    readonly maxReadingsPer1h: ThresholdMarker;
  };
}

export const COST_THRESHOLDS: ThresholdConfig = {
  dbRefresh: {
    maxDurationMs: "TBD_LOAD_TEST",
    maxQueueWaitMs: "TBD_LOAD_TEST",
    maxDeltaRowCount: "TBD_MEASURED",
  },
  llmPrompt: {
    maxSummaryByteSize: "TBD_MEASURED",
    maxEstimatedPromptTokens: "TBD_MEASURED",
    rawHistoryFallbackBudgetPerHour: "TBD_MEASURED",
  },
  ingestRate: {
    maxReadingsPer1m: "TBD_LOAD_TEST",
    maxReadingsPer5m: "TBD_LOAD_TEST",
    maxReadingsPer1h: "TBD_MEASURED",
  },
};

const ALLOWED_MARKERS: ReadonlySet<string> = new Set([
  "TBD_MEASURED",
  "TBD_LOAD_TEST",
]);

/** True if every leaf of the config is a recognized TBD marker. */
export function thresholdsAreAllTbd(cfg: ThresholdConfig): boolean {
  for (const group of Object.values(cfg) as ReadonlyArray<Record<string, unknown>>) {
    for (const value of Object.values(group)) {
      if (typeof value !== "string" || !ALLOWED_MARKERS.has(value)) {
        return false;
      }
    }
  }
  return true;
}
