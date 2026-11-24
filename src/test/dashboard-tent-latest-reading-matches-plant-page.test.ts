/**
 * The Dashboard tent card and the plant page "Current Environment" card must
 * name the same latest reading for one tent.
 *
 * Regression (core-loop walkthrough, 2026-11-20, Fixture Tent A): the plant
 * page showed a 75 °F Quick Log manual reading from 14 days earlier, while the
 * Dashboard tent card showed an older 77 °F sensor reading from Oct 31 as the
 * tent's latest. The plant page merged Quick Log manual readings; the
 * Dashboard tent card read sensor rows alone. Both now use one merge rule.
 * The rendered Dashboard wiring is pinned in
 * dashboard-tent-latest-reading-rendered.test.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { selectDashboardTentSnapshotRows } from "@/lib/dashboardTentSnapshotRowsRules";
import {
  manualEnvironmentEventsToTentReadingRows,
  mergePlantTentReadingsWithManualEvents,
  type PlantManualEnvEventRow,
} from "@/lib/plantManualEnvironmentEventRules";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";
import { sensorReadingFromQuickLogEnvironmentRow } from "@/lib/sensorsQuickLogManualSeriesRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENT = "22222222-2222-4222-8222-222222222222";
const NOW_ISO = "2026-11-20T03:36:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const SENSOR_AT = "2026-10-31T12:00:00.000Z";
const MANUAL_AT = "2026-11-06T12:00:00.000Z";
const SENSOR_TEMP_C = 25; // 77 °F
const MANUAL_TEMP_C = 23.9; // ~75 °F

interface SensorRow extends BuildTentSnapshotInput {
  id: string;
  tent_id: string;
  ts: string;
  metric: string;
}

function sensorRow(over: Partial<SensorRow> & { metric: string; value: unknown }): SensorRow {
  const at = over.captured_at ?? over.ts ?? SENSOR_AT;
  return {
    id: `s-${over.metric}-${at}`,
    tent_id: TENT,
    ts: at,
    captured_at: at,
    source: "live",
    quality: "ok",
    raw_payload: null,
    ...over,
  } as SensorRow;
}

function sensorPair(at: string, tempC: number, rh: number, over: Partial<SensorRow> = {}) {
  return [
    sensorRow({ metric: "temperature_c", value: tempC, ts: at, captured_at: at, ...over }),
    sensorRow({ metric: "humidity_pct", value: rh, ts: at, captured_at: at, ...over }),
  ];
}

function quickLog(
  at: string,
  env: { temperature_c?: number | null; humidity_pct?: number | null },
  tentId = TENT,
) {
  const reading = sensorReadingFromQuickLogEnvironmentRow(
    {
      id: `env-${at}-${tentId}`,
      plant_id: null,
      tent_id: tentId,
      occurred_at: at,
      event_type: "environment",
      source: "manual",
      environment: {
        temperature_c: env.temperature_c ?? null,
        humidity_pct: env.humidity_pct ?? null,
        vpd_kpa: null,
      },
    },
    new Date(NOW_MS),
  );
  if (!reading) throw new Error("fixture did not project");
  return reading;
}

/** The same Quick Log entry as the plant page reads it from grow_events. */
function plantEvent(
  at: string,
  env: { temperature_c?: number | null; humidity_pct?: number | null },
  tentId = TENT,
): PlantManualEnvEventRow {
  return {
    id: `env-${at}-${tentId}`,
    plant_id: null,
    tent_id: tentId,
    occurred_at: at,
    event_type: "environment",
    source: "manual",
    is_deleted: false,
    environment_events: {
      temperature_c: env.temperature_c ?? null,
      humidity_pct: env.humidity_pct ?? null,
      vpd_kpa: null,
    },
  };
}

function dashboardSnapshot(
  sensorRows: SensorRow[],
  manuals: ReturnType<typeof quickLog>[],
  tentId = TENT,
) {
  return snapshotFromReadings(
    selectDashboardTentSnapshotRows({
      sensorRows,
      quickLogManuals: manuals,
      tentId,
      nowMs: NOW_MS,
    }) as BuildTentSnapshotInput[],
  );
}

function plantPageSnapshot(sensorRows: SensorRow[], events: PlantManualEnvEventRow[]) {
  return snapshotFromReadings(
    mergePlantTentReadingsWithManualEvents(
      sensorRows,
      manualEnvironmentEventsToTentReadingRows(events),
    ),
  );
}

describe("Dashboard tent card latest reading", () => {
  it("shows the newer Quick Log reading, as the plant page does (walkthrough regression)", () => {
    const sensors = sensorPair(SENSOR_AT, SENSOR_TEMP_C, 55);
    const env = { temperature_c: MANUAL_TEMP_C, humidity_pct: 52 };

    const dashboard = dashboardSnapshot(sensors, [quickLog(MANUAL_AT, env)]);
    const plantPage = plantPageSnapshot(sensors, [plantEvent(MANUAL_AT, env)]);

    expect(dashboard?.temp).toBe(MANUAL_TEMP_C);
    expect(dashboard?.rh).toBe(52);
    expect(Date.parse(dashboard?.ts ?? "")).toBe(Date.parse(MANUAL_AT));
    expect(dashboard?.source).toBe("manual");
    // One rule, one answer: both pages name the same reading and time.
    expect(plantPage?.temp).toBe(dashboard?.temp);
    expect(plantPage?.rh).toBe(dashboard?.rh);
    expect(Date.parse(plantPage?.ts ?? "")).toBe(Date.parse(dashboard?.ts ?? ""));
    expect(plantPage?.source).toBe(dashboard?.source);
  });

  it("keeps the sensor reading when it is the newest observation", () => {
    const sensorAt = "2026-11-10T12:00:00.000Z";
    const sensors = sensorPair(sensorAt, SENSOR_TEMP_C, 55);
    const env = { temperature_c: MANUAL_TEMP_C, humidity_pct: 52 };

    const dashboard = dashboardSnapshot(sensors, [quickLog(MANUAL_AT, env)]);
    const plantPage = plantPageSnapshot(sensors, [plantEvent(MANUAL_AT, env)]);

    expect(dashboard?.temp).toBe(SENSOR_TEMP_C);
    expect(dashboard?.source).not.toBe("manual");
    expect(plantPage?.source).toBe(dashboard?.source);
    expect(plantPage?.temp).toBe(dashboard?.temp);
    expect(Date.parse(plantPage?.ts ?? "")).toBe(Date.parse(sensorAt));
  });

  it("orders by observation time, not by the order rows arrived", () => {
    // Ingested out of order: the older capture arrives last.
    const newer = sensorPair("2026-11-12T08:00:00.000Z", 26, 50);
    const older = sensorPair("2026-11-02T08:00:00.000Z", 22, 60);
    const snap = dashboardSnapshot([...older, ...newer].reverse(), []);
    expect(snap?.temp).toBe(26);
    expect(Date.parse(snap?.ts ?? "")).toBe(Date.parse("2026-11-12T08:00:00.000Z"));

    const manuals = [
      quickLog("2026-11-03T08:00:00.000Z", { temperature_c: 21, humidity_pct: 61 }),
      quickLog("2026-11-14T08:00:00.000Z", { temperature_c: 24, humidity_pct: 49 }),
    ];
    const withManuals = dashboardSnapshot([...older, ...newer], manuals);
    expect(withManuals?.temp).toBe(24);
    expect(withManuals?.source).toBe("manual");
  });

  it("lets the Quick Log reading win a tie at the same observation time", () => {
    const at = "2026-11-08T09:00:00.000Z";
    // A manual sensor_readings row for the same capture, with a different value.
    const sensors = [
      sensorRow({ metric: "temperature_c", value: 22, ts: at, captured_at: at, source: "manual" }),
      sensorRow({ metric: "humidity_pct", value: 58, ts: at, captured_at: at, source: "live" }),
    ];
    const rows = selectDashboardTentSnapshotRows({
      sensorRows: sensors,
      quickLogManuals: [quickLog(at, { temperature_c: 23, humidity_pct: 57 })],
      tentId: TENT,
      nowMs: NOW_MS,
    });
    const temps = rows.filter((r) => r.metric === "temperature_c");
    // The older-value manual sensor row is dropped, never shown beside the Quick Log one.
    expect(temps).toHaveLength(1);
    expect(temps[0]?.value).toBe(23);
    // The live humidity the Quick Log humidity shadows is dropped too.
    const rhRows = rows.filter((r) => r.metric === "humidity_pct");
    expect(rhRows.map((r) => r.value)).toEqual([57]);
    expect(snapshotFromReadings(rows as BuildTentSnapshotInput[])?.rh).toBe(57);
  });

  it("labels a tied, fully Quick Log pair by its real contributors (live/CSV shadowed)", () => {
    const at = new Date(NOW_MS - 30 * 60 * 1000).toISOString();
    // Same instant, spelled without milliseconds on the sensor side.
    const sensorAt = at.replace(".000Z", "Z");
    for (const source of ["live", "csv"]) {
      const rows = selectDashboardTentSnapshotRows({
        sensorRows: sensorPair(sensorAt, 26, 60, { source }),
        quickLogManuals: [quickLog(at, { temperature_c: 24, humidity_pct: 55 })],
        tentId: TENT,
        nowMs: NOW_MS,
      });
      expect(rows.map((r) => r.source)).toEqual(["manual", "manual"]);
      const view = buildTentSnapshotView(rows as BuildTentSnapshotInput[], "flower", NOW_MS);
      const manualOnly = buildTentSnapshotView(
        selectDashboardTentSnapshotRows({
          sensorRows: [],
          quickLogManuals: [quickLog(at, { temperature_c: 24, humidity_pct: 55 })],
          tentId: TENT,
          nowMs: NOW_MS,
        }) as BuildTentSnapshotInput[],
        "flower",
        NOW_MS,
      );
      // 30 minutes old is inside the 24h manual window: not stale.
      expect(view.stale).toBe(false);
      expect(view.sourceLabel).toBe(manualOnly.sourceLabel);
      expect(view.provenanceEligible).toBe(manualOnly.provenanceEligible);
      expect(view.metrics.find((m) => m.key === "temp")?.display).toBe(
        manualOnly.metrics.find((m) => m.key === "temp")?.display,
      );
    }
  });

  it("keeps a different metric at the same instant as a genuine mixed reading", () => {
    const at = "2026-11-08T09:00:00.000Z";
    const rows = selectDashboardTentSnapshotRows({
      sensorRows: [
        sensorRow({ metric: "co2_ppm", value: 900, ts: "2026-11-08T09:00:00Z", captured_at: null }),
      ],
      quickLogManuals: [quickLog(at, { temperature_c: 23, humidity_pct: 57 })],
      tentId: TENT,
      nowMs: NOW_MS,
    });
    expect(rows.map((r) => r.metric)).toEqual(["temperature_c", "humidity_pct", "co2_ppm"]);
    // Equivalent spellings align by epoch, so all three form one cohort.
    expect(new Set(rows.map((r) => r.captured_at)).size).toBe(1);
  });

  it("never lets a row without a usable time win", () => {
    const sensors = [
      ...sensorPair(SENSOR_AT, SENSOR_TEMP_C, 55),
      sensorRow({ metric: "temperature_c", value: 40, ts: "not a time", captured_at: null }),
    ];
    const snap = dashboardSnapshot(sensors, []);
    expect(snap?.temp).toBe(SENSOR_TEMP_C);

    const untimed = { ...quickLog(MANUAL_AT, { temperature_c: 30 }), capturedAt: "", ts: "" };
    expect(dashboardSnapshot(sensors, [untimed])?.temp).toBe(SENSOR_TEMP_C);
  });

  it("labels an old manual reading Stale, never healthy", () => {
    const view = buildTentSnapshotView(
      selectDashboardTentSnapshotRows({
        sensorRows: sensorPair(SENSOR_AT, SENSOR_TEMP_C, 55),
        quickLogManuals: [quickLog(MANUAL_AT, { temperature_c: MANUAL_TEMP_C, humidity_pct: 52 })],
        tentId: TENT,
        nowMs: NOW_MS,
      }) as BuildTentSnapshotInput[],
      "flower",
      NOW_MS,
    );
    expect(view.hasReading).toBe(true);
    expect(view.stale).toBe(true);
    expect(Date.parse(view.lastUpdatedIso ?? "")).toBe(Date.parse(MANUAL_AT));
    expect(view.sourceLabel).toBe("Stale");
    expect(view.provenanceEligible).toBe(true);
  });

  it("drops flagged, unknown-source and other-tent rows", () => {
    const newerAt = "2026-11-15T10:00:00.000Z";
    const sensors = [
      ...sensorPair(SENSOR_AT, SENSOR_TEMP_C, 55),
      ...sensorPair(newerAt, 35, 90, { quality: "invalid" }),
      ...sensorPair("2026-11-16T10:00:00.000Z", 18, 30, { source: "demo" }),
    ];
    const manuals = [
      quickLog("2026-11-18T10:00:00.000Z", { temperature_c: 29, humidity_pct: 70 }, OTHER_TENT),
    ];
    const snap = dashboardSnapshot(sensors, manuals);
    expect(snap?.temp).toBe(SENSOR_TEMP_C);
    expect(Date.parse(snap?.ts ?? "")).toBe(Date.parse(SENSOR_AT));
  });

  it("never lets an invalid future-dated Quick Log reading replace a valid sensor reading", () => {
    const future = new Date(NOW_MS + 2 * 24 * 60 * 60 * 1000).toISOString();
    const reading = quickLog(future, { temperature_c: 30, humidity_pct: 80 });
    expect(reading.status).toBe("invalid");
    const sensors = sensorPair(SENSOR_AT, SENSOR_TEMP_C, 55);
    const snap = dashboardSnapshot(sensors, [reading]);
    expect(snap?.temp).toBe(SENSOR_TEMP_C);
    expect(Date.parse(snap?.ts ?? "")).toBe(Date.parse(SENSOR_AT));
    // A stale (old but valid) Quick Log reading still counts.
    const stale = quickLog(MANUAL_AT, { temperature_c: MANUAL_TEMP_C, humidity_pct: 52 });
    expect(stale.status).toBe("stale");
    expect(dashboardSnapshot(sensors, [reading, stale])?.temp).toBe(MANUAL_TEMP_C);
  });

  it("keeps a zero reading and returns nothing for empty input", () => {
    const rows = selectDashboardTentSnapshotRows({
      sensorRows: [sensorRow({ metric: "ppfd", value: 0 })],
      quickLogManuals: null,
      tentId: TENT,
      nowMs: NOW_MS,
    });
    expect(rows.map((r) => r.value)).toEqual([0]);
    expect(
      selectDashboardTentSnapshotRows({
        sensorRows: null,
        quickLogManuals: undefined,
        tentId: null,
        nowMs: NOW_MS,
      }),
    ).toEqual([]);
  });

  it("is deterministic for the same input", () => {
    const input = {
      sensorRows: [...sensorPair(SENSOR_AT, 25, 55), ...sensorPair(SENSOR_AT, 25, 55)],
      quickLogManuals: [quickLog(MANUAL_AT, { temperature_c: 24, humidity_pct: 50 })],
      tentId: TENT,
      nowMs: NOW_MS,
    };
    expect(selectDashboardTentSnapshotRows(input)).toEqual(selectDashboardTentSnapshotRows(input));
  });
});
