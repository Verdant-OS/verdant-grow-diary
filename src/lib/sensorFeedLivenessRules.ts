/**
 * sensorFeedLivenessRules — pure classification of how long it has been since
 * a sensor bridge last delivered anything.
 *
 * Hard rules (mirroring `alertFreshnessContext.ts`):
 *   - Pure: no I/O, no React, no Supabase, no ambient time, no randomness.
 *     `now` is always injected.
 *   - Never claims a feed is healthy on missing or unparseable input.
 *   - Never alarms an account that has no bridge configured.
 *
 * ## Why this exists separately from `STALE_THRESHOLD_MS`
 *
 * `STALE_THRESHOLD_MS` (15 minutes, `src/lib/sensorSnapshot.ts`) is an
 * *alert-usability* window: it answers "is this reading recent enough to base
 * an alert on?" That is the right question for alerting and the wrong question
 * for liveness. Under that single threshold a feed running 31 minutes late and
 * a feed that died two weeks ago produce the identical `stale` badge and the
 * identical sentence, "Latest bridge reading is stale."
 *
 * That is not hypothetical. A live EcoWitt feed stopped on 2026-07-14 and was
 * not noticed until 2026-07-29 — fifteen days during which the Sensors page
 * correctly displayed `stale` the entire time. The signal was present and
 * carried no urgency, because it was the same signal a routine gap produces.
 *
 * So this module adds a *liveness* tier above staleness rather than widening
 * the existing window. Widening `STALE_THRESHOLD_MS` would silently loosen
 * alert persistence, and adding a `"dead"` member to `SensorSnapshotSource` /
 * `SensorSnapshotFreshnessState` would force exhaustive-switch changes through
 * trust-tone mapping, `alertsCanPersist`, the AI Doctor snapshot rules, and the
 * Quick Log sensor-truth gate — paths that deliberately never render green.
 * Nothing here is imported by those unions; this is additive.
 */

/**
 * How long a bridge may go silent before we call it an outage rather than a
 * late reading.
 *
 * Six hours is deliberately far above the 30-minute alert window. A bridge
 * pushing every few minutes has missed dozens of intervals by then, so this
 * does not fire on a router reboot, a brief ISP drop, or a host that slept —
 * the noise that would train a grower to ignore the banner. It is also short
 * enough that an overnight failure is waiting in the morning rather than
 * fifteen days later.
 */
export const FEED_OUTAGE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

export type SensorFeedLiveness =
  /** Delivered within the outage threshold. Says nothing about alert-grade freshness. */
  | "reporting"
  /** Silent past the outage threshold. The feed is presumed broken. */
  | "outage"
  /** A bridge exists but has never delivered anything. */
  | "never_reported"
  /**
   * No bridge is configured. Manual-only and CSV-only growers land here and
   * must never be alarmed — a banner that fires for everyone on day one is a
   * banner nobody reads, which is the exact failure this module addresses.
   */
  | "not_configured"
  /** Input was missing or unparseable. We refuse to guess in either direction. */
  | "unknown";

export interface ClassifySensorFeedLivenessArgs {
  /**
   * ISO timestamp of the most recent accepted bridge delivery, or null when
   * nothing has ever been accepted.
   */
  readonly latestAcceptedAtIso: string | null;
  /**
   * Whether this account has a bridge at all. When false the result is always
   * `not_configured`, regardless of timestamps.
   */
  readonly hasConfiguredBridge: boolean;
  /** Injected clock. Required — this module never reads ambient time. */
  readonly now: Date | number;
  /** Injectable for tests and for future per-source tuning. */
  readonly outageThresholdMs?: number;
}

export interface SensorFeedLivenessResult {
  readonly liveness: SensorFeedLiveness;
  /** Milliseconds since the last accepted delivery; null when unknowable. */
  readonly silentForMs: number | null;
  /** True only for `outage` and `never_reported` — the states worth interrupting for. */
  readonly isActionable: boolean;
}

function toMillis(value: Date | number): number | null {
  const ms = value instanceof Date ? value.getTime() : value;
  return Number.isFinite(ms) ? ms : null;
}

export function classifySensorFeedLiveness(
  args: ClassifySensorFeedLivenessArgs,
): SensorFeedLivenessResult {
  const threshold = args.outageThresholdMs ?? FEED_OUTAGE_THRESHOLD_MS;
  const nowMs = toMillis(args.now);

  if (!args.hasConfiguredBridge) {
    return { liveness: "not_configured", silentForMs: null, isActionable: false };
  }
  if (nowMs === null) {
    return { liveness: "unknown", silentForMs: null, isActionable: false };
  }
  if (args.latestAcceptedAtIso === null) {
    return { liveness: "never_reported", silentForMs: null, isActionable: true };
  }

  const acceptedMs = Date.parse(args.latestAcceptedAtIso);
  if (!Number.isFinite(acceptedMs)) {
    return { liveness: "unknown", silentForMs: null, isActionable: false };
  }

  // A timestamp in the future means clock skew somewhere in the chain. Clamping
  // to 0 keeps us from reporting a negative silence, and reads as "reporting"
  // rather than inventing an outage from a bad clock.
  const silentForMs = Math.max(0, nowMs - acceptedMs);
  if (silentForMs >= threshold) {
    return { liveness: "outage", silentForMs, isActionable: true };
  }
  return { liveness: "reporting", silentForMs, isActionable: false };
}

/**
 * Coarse human duration for operator copy: "3 hours", "15 days".
 *
 * Intentionally coarse — the point is conveying magnitude ("this is not a
 * blip"), not precision. Precise timestamps are already shown beside this.
 */
export function describeSilentDuration(silentForMs: number | null): string | null {
  if (silentForMs === null || !Number.isFinite(silentForMs) || silentForMs < 0) return null;
  const minutes = Math.floor(silentForMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Operator-facing sentence for an actionable liveness state, or null when there
 * is nothing worth interrupting for.
 *
 * Copy rules: state the observation and its consequence, never diagnose the
 * cause (we cannot see the grower's network or host), and never imply Verdant
 * can restart anything.
 */
export function describeSensorFeedLiveness(result: SensorFeedLivenessResult): string | null {
  if (result.liveness === "never_reported") {
    return "This bridge has never delivered a reading. Verdant has no live sensor data for this account yet.";
  }
  if (result.liveness !== "outage") return null;

  const duration = describeSilentDuration(result.silentForMs);
  const forHowLong = duration ? ` for ${duration}` : "";
  return (
    `Your sensor bridge has sent nothing${forHowLong}. ` +
    "New readings are not arriving, so environment alerts and any sensor-aware " +
    "coaching are running on data that stopped updating. Verdant cannot restart " +
    "a bridge for you — check the machine or service that sends readings."
  );
}
