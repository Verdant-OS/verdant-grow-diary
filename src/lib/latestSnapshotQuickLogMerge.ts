/**
 * Newest-capture-wins merge of the latest-snapshot read with Quick Log manuals.
 *
 * A Quick Log whole-tent snapshot is stored on `grow_events` +
 * `environment_events`, never in `sensor_readings` or a diary envelope, so the
 * `useLatestSensorSnapshot` read (sensor rows, then diary evidence) cannot see
 * it. Tent Detail and Sensors merge those manual readings themselves; the tents
 * list and the Dashboard Environment strip did not, and kept an older reading
 * (#2821). This class is the one shared rule: the manual reading replaces the
 * base snapshot only when it was captured strictly after it. A tie keeps the
 * base. The manual value is shown as `manual`, never promoted to live, and is
 * never alert-persistence evidence (it carries no sensor row or diary ref).
 *
 * Pure: no I/O, no React, no clock.
 */
import type { SensorReading } from "@/mock";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

type Candidate = { reading: SensorReading; ms: number };

export class LatestSnapshotQuickLogMerge {
  /**
   * `base` unless an in-scope Quick Log manual was captured strictly after it.
   * An empty scope (no tent ids) never merges: manuals attribute to one tent.
   */
  static merge(
    base: SensorSnapshot,
    manuals: readonly SensorReading[] | null | undefined,
    tentIds: readonly string[],
  ): SensorSnapshot {
    const manual = LatestSnapshotQuickLogMerge.newestSnapshot(manuals, tentIds);
    if (!manual) return base;
    const baseMs = LatestSnapshotQuickLogMerge.baseMs(base);
    const manualMs = Date.parse(manual.ts as string);
    return baseMs === null || manualMs > baseMs ? manual : base;
  }

  /** The newest in-scope manual reading as a snapshot, or null when none qualifies. */
  static newestSnapshot(
    manuals: readonly SensorReading[] | null | undefined,
    tentIds: readonly string[],
  ): SensorSnapshot | null {
    const scope = new Set(tentIds.map((id) => id.trim()).filter(Boolean));
    if (scope.size === 0 || !manuals) return null;
    let newest: Candidate | null = null;
    for (const reading of manuals) {
      const candidate = LatestSnapshotQuickLogMerge.candidate(reading, scope);
      if (!candidate) continue;
      // Strictly newer replaces; equal instants keep the first, so the choice
      // is deterministic for one input order.
      if (!newest || candidate.ms > newest.ms) newest = candidate;
    }
    return newest ? LatestSnapshotQuickLogMerge.toSnapshot(newest.reading) : null;
  }

  private static candidate(
    reading: SensorReading | null | undefined,
    scope: ReadonlySet<string>,
  ): Candidate | null {
    if (!reading || reading.source !== "manual") return null;
    if (typeof reading.tentId !== "string" || !scope.has(reading.tentId.trim())) return null;
    const at = reading.capturedAt || reading.ts;
    const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
    if (!Number.isFinite(ms)) return null;
    if (!LatestSnapshotQuickLogMerge.hasObservedMetric(reading)) return null;
    return { reading, ms };
  }

  private static observed(reading: SensorReading, key: "temp" | "rh" | "vpd"): number | null {
    if (!Array.isArray(reading.observedMetrics) || !reading.observedMetrics.includes(key)) {
      return null;
    }
    const value = reading[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private static hasObservedMetric(reading: SensorReading): boolean {
    return (["temp", "rh", "vpd"] as const).some(
      (key) => LatestSnapshotQuickLogMerge.observed(reading, key) !== null,
    );
  }

  private static toSnapshot(reading: SensorReading): SensorSnapshot {
    return {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      ts: (reading.capturedAt || reading.ts) as string,
      temp: LatestSnapshotQuickLogMerge.observed(reading, "temp"),
      rh: LatestSnapshotQuickLogMerge.observed(reading, "rh"),
      vpd: LatestSnapshotQuickLogMerge.observed(reading, "vpd"),
      tent_id: (reading.tentId as string).trim(),
      alert_persistence_eligible: false,
    };
  }

  private static baseMs(base: SensorSnapshot): number | null {
    if (base.source === "unavailable" || !base.ts) return null;
    const ms = Date.parse(base.ts);
    return Number.isFinite(ms) ? ms : null;
  }
}
