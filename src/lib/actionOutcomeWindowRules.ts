/**
 * actionOutcomeWindowRules — deterministic pre/post evidence windows.
 *
 * Anchor: action_queue.completed_at (there is NO DB CHECK tying
 * completed_at to status='completed', so callers must treat a null
 * completed_at as "cannot analyze" — see resolveOutcomeWindows).
 *
 * Post-window endpoint preference: grower follow-up details.observed_at,
 * else an explicitly supplied analysisAt. Pure logic NEVER reads the
 * current clock.
 *
 * All constants centralized here.
 */

export const PRE_WINDOW_HOURS = 24;
export const POST_WINDOW_MAX_HOURS = 72;
/** Post windows shorter than this are marked insufficient. */
export const MIN_USEFUL_POST_WINDOW_HOURS = 2;

const MS_PER_HOUR = 3_600_000;

export type OutcomeWindowBounds = {
  start: string;
  end: string;
  elapsedHours: number;
};

export type ResolvedOutcomeWindows =
  | {
      ok: true;
      actionCompletedAt: string;
      pre: OutcomeWindowBounds;
      post: OutcomeWindowBounds;
      /** True when the post window is too short to be meaningful. */
      postWindowInsufficient: boolean;
      /** True when the post endpoint was capped at POST_WINDOW_MAX_HOURS. */
      postWindowCapped: boolean;
    }
  | {
      ok: false;
      reason:
        | "missing_completed_at"
        | "invalid_completed_at"
        | "future_completed_at"
        | "missing_analysis_endpoint"
        | "invalid_analysis_endpoint"
        | "analysis_endpoint_before_completion";
    };

/** Parse an ISO timestamp; NaN-safe. Returns epoch ms or null. */
export function parseTimestampMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function roundHours(ms: number): number {
  // Two decimal places keeps elapsedHours deterministic and readable.
  return Math.round((ms / MS_PER_HOUR) * 100) / 100;
}

/**
 * Resolve deterministic pre/post windows.
 *
 * @param completedAt   action_queue.completed_at
 * @param followUpObservedAt preferred post endpoint (details.observed_at)
 * @param analysisAt    injected "now" — REQUIRED when no follow-up
 *                      endpoint exists; also used to reject future rows.
 */
export function resolveOutcomeWindows(input: {
  completedAt: string | null | undefined;
  followUpObservedAt?: string | null;
  analysisAt: string;
}): ResolvedOutcomeWindows {
  const analysisMs = parseTimestampMs(input.analysisAt);
  if (analysisMs === null) {
    return { ok: false, reason: "invalid_analysis_endpoint" };
  }

  if (input.completedAt === null || input.completedAt === undefined) {
    return { ok: false, reason: "missing_completed_at" };
  }
  const completedMs = parseTimestampMs(input.completedAt);
  if (completedMs === null) {
    return { ok: false, reason: "invalid_completed_at" };
  }
  // Future-dated action rows are rejected outright.
  if (completedMs > analysisMs) {
    return { ok: false, reason: "future_completed_at" };
  }

  const observedMs = parseTimestampMs(input.followUpObservedAt ?? null);
  // Preferred endpoint: follow-up observed_at when parseable and not in
  // the future relative to the injected analysis time; else analysisAt.
  let endpointMs: number;
  if (observedMs !== null && observedMs <= analysisMs) {
    endpointMs = observedMs;
  } else {
    endpointMs = analysisMs;
  }
  if (endpointMs < completedMs) {
    return { ok: false, reason: "analysis_endpoint_before_completion" };
  }

  const maxEndMs = completedMs + POST_WINDOW_MAX_HOURS * MS_PER_HOUR;
  const postWindowCapped = endpointMs > maxEndMs;
  const postEndMs = postWindowCapped ? maxEndMs : endpointMs;

  const preStartMs = completedMs - PRE_WINDOW_HOURS * MS_PER_HOUR;
  const postElapsedMs = postEndMs - completedMs;

  return {
    ok: true,
    actionCompletedAt: toIso(completedMs),
    pre: {
      start: toIso(preStartMs),
      end: toIso(completedMs),
      elapsedHours: PRE_WINDOW_HOURS,
    },
    post: {
      start: toIso(completedMs),
      end: toIso(postEndMs),
      elapsedHours: roundHours(postElapsedMs),
    },
    postWindowInsufficient: postElapsedMs < MIN_USEFUL_POST_WINDOW_HOURS * MS_PER_HOUR,
    postWindowCapped,
  };
}

/**
 * Window membership. Documented inclusion rule:
 *   pre window:  start <= t < end   (end = completion, which belongs
 *                to the POST window)
 *   post window: start <= t <= end  (endpoint evidence — the follow-up
 *                snapshot itself — counts)
 * Unparseable timestamps are never inside any window.
 */
export function isWithinWindow(
  timestamp: string | null | undefined,
  bounds: OutcomeWindowBounds,
  kind: "pre" | "post",
): boolean {
  const ms = parseTimestampMs(timestamp);
  if (ms === null) return false;
  const startMs = parseTimestampMs(bounds.start);
  const endMs = parseTimestampMs(bounds.end);
  if (startMs === null || endMs === null) return false;
  if (kind === "pre") return ms >= startMs && ms < endMs;
  return ms >= startMs && ms <= endMs;
}
