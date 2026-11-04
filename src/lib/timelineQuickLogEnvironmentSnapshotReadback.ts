/**
 * Read-side join for Quick Log tent manual snapshots.
 *
 * The save RPC stores temperature, humidity, and VPD on the manual
 * environment row created in the same request as the linked observation or
 * watering. Timeline and the diary PDF render the diary mirror, which does
 * not carry those metrics. Readings attach only through that exact sibling
 * (`sensorFromExactEnvironmentSibling`). A same tent and the same
 * `occurred_at` are not enough: two backdated saves can share that instant.
 * If the linked root or its sibling is not loaded, this class shows nothing.
 * It never writes and never invents a metric the sibling did not store.
 */
import {
  sensorFromExactEnvironmentSibling,
  type TimelineEnvironmentSibling,
} from "@/lib/quick-log/quickLogRevisionRules";
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { tempFFromC } from "@/lib/temperatureUnits";
import { STRUCTURED_READING_KEYS } from "@/lib/quickLogStructuredReadingRules";

/**
 * Air-reading keys a `manual_sensor_snapshot` carries when it was written by the
 * manual reading path (or by `withSnapshot` below). Their absence means the air
 * readings are still only on the exact environment sibling.
 */
const MANUAL_AIR_READING_KEYS = [
  "temp_f",
  "temp_c",
  "temperature_f",
  "temperature_c",
  "humidity_percent",
  "humidity_pct",
  "humidity",
  "rh",
] as const;

export type TimelineQuickLogDiaryReadbackRow = {
  id: string;
  plant_id?: string | null;
  tent_id?: string | null;
  entry_at?: string | null;
  details?: Record<string, unknown> | null;
};

type SnapshotMetrics = {
  tempC: number | null;
  rh: number | null;
  vpdKpa: number | null;
};

export class TimelineQuickLogEnvironmentSnapshotReadback {
  static attach<T extends TimelineQuickLogDiaryReadbackRow>(
    rows: readonly T[],
    events: readonly TimelineEnvironmentSibling[],
  ): T[] {
    return rows.map((row) => {
      if (TimelineQuickLogEnvironmentSnapshotReadback.hasSnapshot(row.details)) return row;
      const linkedId = TimelineQuickLogEnvironmentSnapshotReadback.linkedRootId(row.details);
      if (!linkedId) return row;
      const root = events.find(
        (event) => event.id === linkedId && typeof event.created_at === "string",
      );
      if (!root) return row;
      const sensor = sensorFromExactEnvironmentSibling(
        root,
        TimelineQuickLogEnvironmentSnapshotReadback.coerceMetricNumbers(events),
      );
      if (!sensor) return row;
      const metrics: SnapshotMetrics = {
        tempC: sensor.temperature_c ?? null,
        rh: sensor.humidity_pct ?? null,
        vpdKpa: sensor.vpd_kpa ?? null,
      };
      const details = TimelineQuickLogEnvironmentSnapshotReadback.withSnapshot(
        row.details,
        row.entry_at ?? null,
        metrics,
      );
      return { ...row, details };
    });
  }

  static pdfReadingLine(
    details: unknown,
    temperatureUnit: TemperatureUnitPreference = "fahrenheit",
  ): string | null {
    if (!details || typeof details !== "object" || Array.isArray(details)) return null;
    const vm = buildTimelineCardSensorSnapshotViewModel(
      resolveTimelineCardSensorResolution(details as Record<string, unknown>),
      { validateManualCompatibility: true, temperatureUnit },
    );
    if (vm.sensorViewModel.kind !== "chips" || vm.sensorViewModel.chips.length === 0) return null;
    return vm.sensorViewModel.chips.map((chip) => `${chip.label} ${chip.display}`).join(", ");
  }

  private static linkedRootId(details: Record<string, unknown> | null | undefined): string | null {
    const linked = details?.linked_grow_event_id;
    return typeof linked === "string" && linked.length > 0 ? linked : null;
  }

  /**
   * Whether `details` already carries the air readings, so the exact sibling
   * need not be attached. A `manual_sensor_snapshot` that holds only structured
   * readings (soil temp, VWC, soil EC, CO₂, PPFD — grower bug item 14) is not a
   * complete snapshot: the air readings still live on the sibling and are
   * attached alongside it. Otherwise a soil reading made the air readings
   * disappear from the card while the air rows stayed in the database.
   */
  private static hasSnapshot(details: Record<string, unknown> | null | undefined): boolean {
    if (!details) return false;
    if (TimelineQuickLogEnvironmentSnapshotReadback.isRecord(details.sensor_snapshot)) return true;
    const manual = details.manual_sensor_snapshot;
    if (!TimelineQuickLogEnvironmentSnapshotReadback.isRecord(manual)) return false;
    return MANUAL_AIR_READING_KEYS.some((key) => key in manual);
  }

  /** The exact-sibling helper accepts numbers only. Stored readings may be numeric strings. */
  private static coerceMetricNumbers(
    events: readonly TimelineEnvironmentSibling[],
  ): TimelineEnvironmentSibling[] {
    return events.map((event) => {
      const raw = event.environment_events;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const children = list.map((child) => ({
        temperature_c: TimelineQuickLogEnvironmentSnapshotReadback.finite(child.temperature_c),
        humidity_pct: TimelineQuickLogEnvironmentSnapshotReadback.finite(child.humidity_pct),
        vpd_kpa: TimelineQuickLogEnvironmentSnapshotReadback.finite(child.vpd_kpa),
      }));
      if (Array.isArray(raw)) return { ...event, environment_events: children };
      return { ...event, environment_events: children[0] ?? null };
    });
  }

  private static finite(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
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
    // Structured readings the save wrote to manual_sensor_snapshot (soil temp,
    // VWC, soil EC, CO₂, PPFD) ride along on the canonical snapshot the card
    // reads first, so air and soil show together.
    const existingManual = TimelineQuickLogEnvironmentSnapshotReadback.isRecord(
      details?.manual_sensor_snapshot,
    )
      ? details.manual_sensor_snapshot
      : null;
    if (existingManual) {
      for (const key of STRUCTURED_READING_KEYS) {
        const value = existingManual[key];
        if (typeof value === "number" && Number.isFinite(value)) sensor[key] = value;
      }
    }
    if (metrics.tempC !== null) sensor.temp_c = metrics.tempC;
    if (metrics.rh !== null) sensor.rh = metrics.rh;
    // `vpd`, not `vpd_kpa`: the correction dialog treats `vpd_kpa` on
    // sensor_snapshot as the saved reading and then skips the exact sibling.
    if (metrics.vpdKpa !== null) sensor.vpd = metrics.vpdKpa;

    const manual: Record<string, unknown> = { source: "manual" };
    if (ts) manual.ts = ts;
    if (metrics.tempC !== null) {
      const tempF = tempFFromC(metrics.tempC);
      if (tempF !== null) manual.temp_f = tempF;
    }
    if (metrics.rh !== null) manual.humidity_percent = metrics.rh;

    const next: Record<string, unknown> = { ...(details ?? {}) };
    next.sensor_snapshot = sensor;
    if ("temp_f" in manual || "humidity_percent" in manual) {
      // Keep any structured readings the save already wrote there; the sibling
      // supplies only the air readings.
      next.manual_sensor_snapshot = { ...(existingManual ?? {}), ...manual };
    }
    return next;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
}
