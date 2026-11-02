/**
 * Read-side join for Quick Log tent manual snapshots.
 *
 * The save RPC stores temperature, humidity, and VPD on a sibling
 * environment event. Timeline and the diary PDF render the diary mirror,
 * which does not carry those metrics. This class attaches them for display.
 * It never writes and never invents a metric the sibling did not store.
 */
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";
import { tempFFromC } from "@/lib/temperatureUnits";

export type TimelineQuickLogDiaryReadbackRow = {
  id: string;
  plant_id?: string | null;
  tent_id?: string | null;
  entry_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type TimelineQuickLogEnvironmentSibling = {
  id: string;
  plant_id?: string | null;
  tent_id?: string | null;
  event_type?: string | null;
  source?: string | null;
  occurred_at?: string | null;
  environment_events?: unknown;
};

type SnapshotMetrics = {
  tempC: number | null;
  rh: number | null;
  vpdKpa: number | null;
};

export class TimelineQuickLogEnvironmentSnapshotReadback {
  static attach<T extends TimelineQuickLogDiaryReadbackRow>(
    rows: readonly T[],
    siblings: readonly TimelineQuickLogEnvironmentSibling[],
  ): T[] {
    const pairs: Array<{ rowIndex: number; sibling: TimelineQuickLogEnvironmentSibling }> = [];
    siblings.forEach((sibling) => {
      if (!TimelineQuickLogEnvironmentSnapshotReadback.isManualEnvironment(sibling)) return;
      if (!TimelineQuickLogEnvironmentSnapshotReadback.metrics(sibling)) return;
      rows.forEach((row, rowIndex) => {
        if (!TimelineQuickLogEnvironmentSnapshotReadback.matches(row, sibling)) return;
        if (TimelineQuickLogEnvironmentSnapshotReadback.hasSnapshot(row.details)) return;
        pairs.push({ rowIndex, sibling });
      });
    });

    const rowsBySibling = new Map<string, Set<number>>();
    const siblingsByRow = new Map<number, Set<string>>();
    for (const pair of pairs) {
      const rowSet = rowsBySibling.get(pair.sibling.id) ?? new Set<number>();
      rowSet.add(pair.rowIndex);
      rowsBySibling.set(pair.sibling.id, rowSet);
      const siblingSet = siblingsByRow.get(pair.rowIndex) ?? new Set<string>();
      siblingSet.add(pair.sibling.id);
      siblingsByRow.set(pair.rowIndex, siblingSet);
    }

    const chosen = new Map<number, TimelineQuickLogEnvironmentSibling>();
    for (const pair of pairs) {
      if ((rowsBySibling.get(pair.sibling.id)?.size ?? 0) !== 1) continue;
      if ((siblingsByRow.get(pair.rowIndex)?.size ?? 0) !== 1) continue;
      chosen.set(pair.rowIndex, pair.sibling);
    }

    return rows.map((row, index) => {
      const sibling = chosen.get(index);
      if (!sibling) return row;
      const metrics = TimelineQuickLogEnvironmentSnapshotReadback.metrics(sibling);
      if (!metrics) return row;
      const details = TimelineQuickLogEnvironmentSnapshotReadback.withSnapshot(
        row.details,
        sibling.occurred_at ?? row.entry_at ?? null,
        metrics,
      );
      return { ...row, details };
    });
  }

  static pdfReadingLine(details: unknown): string | null {
    if (!details || typeof details !== "object" || Array.isArray(details)) return null;
    const vm = buildTimelineCardSensorSnapshotViewModel(
      resolveTimelineCardSensorResolution(details as Record<string, unknown>),
      { validateManualCompatibility: true, temperatureUnit: "fahrenheit" },
    );
    if (vm.sensorViewModel.kind !== "chips" || vm.sensorViewModel.chips.length === 0) return null;
    return vm.sensorViewModel.chips.map((chip) => `${chip.label} ${chip.display}`).join(", ");
  }

  private static isManualEnvironment(sibling: TimelineQuickLogEnvironmentSibling): boolean {
    const source = (sibling.source ?? "").trim().toLowerCase();
    if (source !== "manual") return false;
    const eventType = (sibling.event_type ?? "environment").trim().toLowerCase();
    return eventType === "environment";
  }

  private static matches(
    row: TimelineQuickLogDiaryReadbackRow,
    sibling: TimelineQuickLogEnvironmentSibling,
  ): boolean {
    if (!row.tent_id || !sibling.tent_id || row.tent_id !== sibling.tent_id) return false;
    const rowPlant = row.plant_id ?? null;
    const siblingPlant = sibling.plant_id ?? null;
    if (rowPlant !== siblingPlant) return false;
    const rowMs = Date.parse(row.entry_at ?? "");
    const siblingMs = Date.parse(sibling.occurred_at ?? "");
    return Number.isFinite(rowMs) && rowMs === siblingMs;
  }

  private static hasSnapshot(details: Record<string, unknown> | null | undefined): boolean {
    if (!details) return false;
    return (
      TimelineQuickLogEnvironmentSnapshotReadback.isRecord(details.sensor_snapshot) ||
      TimelineQuickLogEnvironmentSnapshotReadback.isRecord(details.manual_sensor_snapshot)
    );
  }

  private static metrics(sibling: TimelineQuickLogEnvironmentSibling): SnapshotMetrics | null {
    const children = TimelineQuickLogEnvironmentSnapshotReadback.children(
      sibling.environment_events,
    );
    for (const child of children) {
      const tempC = TimelineQuickLogEnvironmentSnapshotReadback.finite(child.temperature_c);
      const rh = TimelineQuickLogEnvironmentSnapshotReadback.finite(child.humidity_pct);
      const vpdKpa = TimelineQuickLogEnvironmentSnapshotReadback.finite(child.vpd_kpa);
      if (tempC === null && rh === null && vpdKpa === null) continue;
      return { tempC, rh, vpdKpa };
    }
    return null;
  }

  private static withSnapshot(
    details: Record<string, unknown> | null | undefined,
    ts: string | null,
    metrics: SnapshotMetrics,
  ): Record<string, unknown> {
    const sensor: Record<string, unknown> = { source: "manual" };
    if (ts) sensor.ts = ts;
    if (metrics.tempC !== null) sensor.temp_c = metrics.tempC;
    if (metrics.rh !== null) sensor.rh = metrics.rh;
    if (metrics.vpdKpa !== null) sensor.vpd_kpa = metrics.vpdKpa;

    const manual: Record<string, unknown> = { source: "manual" };
    if (ts) manual.ts = ts;
    if (metrics.tempC !== null) {
      const tempF = tempFFromC(metrics.tempC);
      if (tempF !== null) manual.temp_f = tempF;
    }
    if (metrics.rh !== null) manual.humidity_percent = metrics.rh;

    const next: Record<string, unknown> = { ...(details ?? {}) };
    next.sensor_snapshot = sensor;
    if ("temp_f" in manual || "humidity_percent" in manual) next.manual_sensor_snapshot = manual;
    return next;
  }

  private static children(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) {
      return raw.filter((item): item is Record<string, unknown> =>
        TimelineQuickLogEnvironmentSnapshotReadback.isRecord(item),
      );
    }
    return TimelineQuickLogEnvironmentSnapshotReadback.isRecord(raw) ? [raw] : [];
  }

  private static finite(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
}
