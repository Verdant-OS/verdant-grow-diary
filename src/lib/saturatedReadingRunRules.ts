/**
 * Consecutive saturated soil-moisture and humidity runs in a sensor export.
 *
 * A file whose every value is 0 or 100 is already flagged by the preview's
 * whole-column check. Real Spider Farmer GGS exports mix long saturated
 * stretches with normal readings, and those stretches were invisible.
 *
 * This is a review warning. It does not drop or rewrite rows.
 */

export type SaturatedReadingMetric = "humidity_pct" | "soil_moisture_pct";

export interface SaturatedReadingSample {
  value: number;
  /** Raw timestamp cell. Null when the row has no captured time. */
  at: string | null;
  /** File order. Breaks ties and orders rows that have no parseable time. */
  index: number;
}

export interface SaturatedReadingRun {
  metric: SaturatedReadingMetric;
  value: 0 | 100;
  length: number;
  startedAt: string | null;
  endedAt: string | null;
}

export class SaturatedReadingRunRules {
  /**
   * Consecutive identical 0 or 100 readings required before a run is suspect.
   *
   * Twelve readings is one hour on the 5-minute Spider Farmer GGS cadence
   * and twelve minutes on a 1-minute cadence. One rail reading, or a short
   * stretch a probe can sit on while the medium is actually saturated, stays
   * unflagged. A file whose every sampled value is 0 or 100 is still flagged
   * by the existing whole-column check, including files shorter than this.
   */
  static readonly minimumRunLength = 12;

  static findRuns(
    metric: SaturatedReadingMetric,
    samples: readonly SaturatedReadingSample[],
  ): SaturatedReadingRun[] {
    const ordered = SaturatedReadingRunRules.orderByTime(samples);
    const runs: SaturatedReadingRun[] = [];
    let start = 0;
    while (start < ordered.length) {
      const value = SaturatedReadingRunRules.rail(ordered[start].value);
      if (value === null) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < ordered.length && ordered[end].value === value) end += 1;
      const length = end - start;
      if (length >= SaturatedReadingRunRules.minimumRunLength) {
        runs.push({
          metric,
          value,
          length,
          startedAt: ordered[start].at,
          endedAt: ordered[end - 1].at,
        });
      }
      start = end;
    }
    return runs;
  }

  static describe(run: SaturatedReadingRun): string {
    const range =
      run.startedAt && run.endedAt ? `${run.startedAt} – ${run.endedAt}` : "time not recorded";
    return `${run.metric} · ${run.length} consecutive readings at ${run.value}% · ${range}`;
  }

  private static rail(value: number): 0 | 100 | null {
    if (value === 0 || value === 100) return value;
    return null;
  }

  private static orderByTime(samples: readonly SaturatedReadingSample[]): SaturatedReadingSample[] {
    return samples
      .filter((sample) => Number.isFinite(sample.value))
      .slice()
      .sort((a, b) => {
        const aTime = SaturatedReadingRunRules.parseTime(a.at);
        const bTime = SaturatedReadingRunRules.parseTime(b.at);
        if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
        if (aTime !== null && bTime === null) return -1;
        if (aTime === null && bTime !== null) return 1;
        return a.index - b.index;
      });
  }

  private static parseTime(at: string | null): number | null {
    if (!at) return null;
    const parsed = Date.parse(at);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
