/**
 * Pure coverage rules for Timeline's symptom-evidence lookback window.
 *
 * Each Timeline source is queried independently. A source lane is complete
 * when the query is known to be exhausted, or when its loaded, contiguous
 * newest-first page reaches the beginning of the relevant lookback window.
 * Invalid source timestamps fail closed because their position in the window
 * cannot be established safely.
 */

export interface TimelineSymptomEvidenceSourceLane {
  readonly timestamps: ReadonlyArray<unknown>;
  /** `null` means the query did not provide pagination/count certainty. */
  readonly hasMore: boolean | null;
  /**
   * Timestamp coverage is safe only for a contiguous newest-first page.
   * Timestamp-only pagination can skip ties, so that lane must use
   * `exhaustion_only` and may complete only from an exact total.
   */
  readonly coverageMode: "exhaustion_only" | "contiguous_newest_page";
}

export interface TimelineSymptomEvidenceWindowCoverageInput {
  readonly observationAt: unknown;
  readonly lookbackDays: number;
  readonly sourceLanes: ReadonlyArray<TimelineSymptomEvidenceSourceLane>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseSourceTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceLaneCoversWindow(
  lane: TimelineSymptomEvidenceSourceLane,
  windowStartMs: number,
): boolean {
  let oldestLoadedMs: number | null = null;
  for (const timestamp of lane.timestamps) {
    const parsed = parseSourceTimestamp(timestamp);
    if (parsed === null) return false;
    if (oldestLoadedMs === null || parsed < oldestLoadedMs) oldestLoadedMs = parsed;
  }

  if (lane.hasMore === false) return true;
  if (lane.coverageMode !== "contiguous_newest_page") return false;
  // The evidence window includes its start instant. If an unknown or
  // unexhausted page stops exactly there, another row sharing that timestamp
  // could still be omitted. Require proof that the loaded page extends
  // strictly before the boundary.
  return oldestLoadedMs !== null && oldestLoadedMs < windowStartMs;
}

export function isTimelineSymptomEvidenceWindowComplete(
  input: TimelineSymptomEvidenceWindowCoverageInput,
): boolean {
  const observationMs = parseSourceTimestamp(input.observationAt);
  if (
    observationMs === null ||
    !Number.isFinite(input.lookbackDays) ||
    input.lookbackDays <= 0 ||
    input.sourceLanes.length === 0
  ) {
    return false;
  }

  const windowStartMs = observationMs - input.lookbackDays * DAY_MS;
  if (!Number.isFinite(windowStartMs)) return false;

  return input.sourceLanes.every((lane) => sourceLaneCoversWindow(lane, windowStartMs));
}
