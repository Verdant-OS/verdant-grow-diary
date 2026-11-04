/**
 * Per-metric, newest-capture-wins merge of the latest-snapshot read with Quick
 * Log manuals (#2821).
 *
 * A Quick Log whole-tent snapshot is stored on `grow_events` +
 * `environment_events`, never in `sensor_readings` or a diary envelope, so the
 * `useLatestSensorSnapshot` read (sensor rows, then diary evidence) cannot see
 * it. Tent Detail and Sensors merge those manual readings themselves; the tents
 * list and the Dashboard Environment strip did not, and kept an older reading.
 *
 * The merge is per metric. For each metric a Quick Log save observed, the
 * newest such manual value wins only when it was captured strictly after that
 * metric's base capture (its `metric_refs` row, else the snapshot `ts`), or
 * when the base has no value for that metric. A tie keeps the base. A metric the Quick Log did not observe keeps the base value,
 * its `metric_refs` link and the base `device_id`, so a temp-only save never
 * blanks RH/VPD or drops CO2, soil or PPFD.
 *
 * Provenance: every manual metric is listed in `manual_metric_refs` and loses
 * its sensor `metric_refs` link (the sensor row no longer backs the value).
 * Once any manual metric wins, the aggregate `source` is `manual` (never live)
 * and `alert_persistence_eligible` is false, so a manual value can never feed
 * an automatically persisted alert.
 *
 * A manual capture dated more than `FUTURE_SKEW_TOLERANCE_MS` after `nowMs`
 * (a wrong device clock or a bad import) is ignored, so it can never win
 * indefinitely over a real sensor or diary reading.
 *
 * Pure: no I/O, no React; the clock is a parameter (defaults to `Date.now()`).
 */
import type { SensorReading, SensorReadingMetricKey } from "@/mock";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

/**
 * Provenance of one metric whose value is a Quick Log manual reading. Not a
 * `sensor_readings` row, so never in `metric_refs` and never alert evidence.
 */
export interface QuickLogManualMetricRef {
  captured_at: string;
}

/** A snapshot after the merge; `manual_metric_refs` lists the manual metrics. */
export type QuickLogMergedSnapshot = SensorSnapshot & {
  manual_metric_refs?: Partial<Record<SensorReadingMetricKey, QuickLogManualMetricRef>>;
};

type Winner = { value: number; ms: number; at: string };

export class LatestSnapshotQuickLogMerge {
  /** Allowed clock skew for a manual capture that is slightly ahead of now. */
  static readonly FUTURE_SKEW_TOLERANCE_MS = 5 * 60_000;

  /** Snapshot metrics a Quick Log manual reading can carry. */
  static readonly METRICS: readonly SensorReadingMetricKey[] = [
    "temp",
    "rh",
    "vpd",
    "co2",
    "soil",
    "ppfd",
  ];

  /**
   * `base` unless an in-scope Quick Log manual wins at least one metric; then a
   * copy of `base` with only the winning metrics replaced (see file header).
   * An empty scope (no tent ids) never merges: manuals attribute to one tent.
   */
  static merge(
    base: QuickLogMergedSnapshot,
    manuals: readonly SensorReading[] | null | undefined,
    tentIds: readonly string[],
    nowMs: number = Date.now(),
  ): QuickLogMergedSnapshot {
    const scope = LatestSnapshotQuickLogMerge.scope(tentIds);
    if (scope.size === 0 || !manuals || manuals.length === 0) return base;
    const hasBase = base.source !== "unavailable";
    const merged: QuickLogMergedSnapshot = { ...base };
    const refs = { ...(base.metric_refs ?? {}) } as Record<string, unknown>;
    const manualRefs: Partial<Record<SensorReadingMetricKey, QuickLogManualMetricRef>> = {
      ...(base.manual_metric_refs ?? {}),
    };
    let newestMs = LatestSnapshotQuickLogMerge.parse(hasBase ? base.ts : null);
    let newestAt = hasBase ? base.ts : null;
    let tentId: string | null = null;
    let won = false;

    for (const key of LatestSnapshotQuickLogMerge.METRICS) {
      const winner = LatestSnapshotQuickLogMerge.newestFor(key, manuals, scope, nowMs);
      if (!winner) continue;
      const baseMs = hasBase ? LatestSnapshotQuickLogMerge.baseMetricMs(base, key) : null;
      if (baseMs !== null && winner.ms <= baseMs) continue;
      merged[key] = winner.value;
      delete refs[key];
      manualRefs[key] = { captured_at: winner.at };
      won = true;
      if (newestMs === null || winner.ms > newestMs) {
        newestMs = winner.ms;
        newestAt = winner.at;
      }
      tentId = LatestSnapshotQuickLogMerge.tentFor(winner.at, key, manuals, scope) ?? tentId;
    }
    if (!won) return base;

    merged.source = "manual";
    merged.ts = newestAt;
    merged.alert_persistence_eligible = false;
    merged.manual_metric_refs = manualRefs;
    if (Object.keys(refs).length > 0) {
      merged.metric_refs = refs as SensorSnapshot["metric_refs"];
    } else {
      delete merged.metric_refs;
    }
    if (!hasBase) {
      // No base evidence: nothing else to keep. Unobserved metrics stay null.
      for (const key of ["soil_ec", "soil_temp"] as const) merged[key] = EMPTY_SNAPSHOT[key];
      merged.device_id = null;
      merged.tent_id = tentId;
    }
    return merged;
  }

  /** The newest in-scope manual value per metric as a manual-only snapshot, or null. */
  static newestSnapshot(
    manuals: readonly SensorReading[] | null | undefined,
    tentIds: readonly string[],
    nowMs: number = Date.now(),
  ): QuickLogMergedSnapshot | null {
    const merged = LatestSnapshotQuickLogMerge.merge(EMPTY_SNAPSHOT, manuals, tentIds, nowMs);
    return merged === EMPTY_SNAPSHOT ? null : merged;
  }

  private static scope(tentIds: readonly string[]): Set<string> {
    return new Set(tentIds.map((id) => id.trim()).filter(Boolean));
  }

  private static newestFor(
    key: SensorReadingMetricKey,
    manuals: readonly SensorReading[],
    scope: ReadonlySet<string>,
    nowMs: number,
  ): Winner | null {
    let newest: Winner | null = null;
    for (const reading of manuals) {
      const at = LatestSnapshotQuickLogMerge.captureAt(reading, scope, nowMs);
      if (!at) continue;
      const value = LatestSnapshotQuickLogMerge.observed(reading, key);
      if (value === null) continue;
      // Strictly newer replaces; equal instants keep the first (deterministic).
      if (!newest || at.ms > newest.ms) newest = { value, ...at };
    }
    return newest;
  }

  private static tentFor(
    at: string,
    key: SensorReadingMetricKey,
    manuals: readonly SensorReading[],
    scope: ReadonlySet<string>,
  ): string | null {
    for (const reading of manuals) {
      if ((reading.capturedAt || reading.ts) !== at) continue;
      if (LatestSnapshotQuickLogMerge.observed(reading, key) === null) continue;
      const tentId = typeof reading.tentId === "string" ? reading.tentId.trim() : "";
      if (scope.has(tentId)) return tentId;
    }
    return null;
  }

  /** In-scope, manual, finitely-timed and not future-dated beyond the skew. */
  private static captureAt(
    reading: SensorReading | null | undefined,
    scope: ReadonlySet<string>,
    nowMs: number,
  ): { ms: number; at: string } | null {
    if (!reading || reading.source !== "manual") return null;
    if (typeof reading.tentId !== "string" || !scope.has(reading.tentId.trim())) return null;
    const at = reading.capturedAt || reading.ts;
    const ms = LatestSnapshotQuickLogMerge.parse(typeof at === "string" ? at : null);
    if (ms === null) return null;
    if (ms > nowMs + LatestSnapshotQuickLogMerge.FUTURE_SKEW_TOLERANCE_MS) return null;
    return { ms, at: at as string };
  }

  private static observed(reading: SensorReading, key: SensorReadingMetricKey): number | null {
    if (!Array.isArray(reading.observedMetrics) || !reading.observedMetrics.includes(key)) {
      return null;
    }
    const value = reading[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  /**
   * The base capture time of one metric: its exact sensor row, else the
   * snapshot `ts`; null when the base has no finite value for it.
   */
  private static baseMetricMs(base: SensorSnapshot, key: SensorReadingMetricKey): number | null {
    // A metric the base does not carry never blocks an observed manual value.
    const value = base[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const ref = (base.metric_refs as Record<string, { captured_at?: string }> | undefined)?.[key];
    return (
      LatestSnapshotQuickLogMerge.parse(ref?.captured_at ?? null) ??
      LatestSnapshotQuickLogMerge.parse(base.ts)
    );
  }

  private static parse(value: string | null | undefined): number | null {
    if (typeof value !== "string" || !value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
}
