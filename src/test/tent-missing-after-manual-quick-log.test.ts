/**
 * VER-278 / #2671 — tent page Quick Log stores climate on the environment
 * sibling, and the Tonight card never reads that sibling.
 *
 * `buildQuickLogV2SavePayload` puts temperature and humidity on the RPC
 * params and does not write `details.manual_sensor_snapshot`. The card's
 * snapshot reader only accepts diary envelopes, so empty `sensor_readings`
 * plus an idle snapshot render Missing. Projecting the environment sibling
 * (the shape `sensorReadingFromQuickLogEnvironmentRow` already returns)
 * into the card's row input is what makes the reading visible.
 */
import { describe, expect, it } from "vitest";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { convertTypedTemperatureToCelsius } from "@/lib/quickLogTypedTemperatureRules";
import { sensorReadingFromQuickLogEnvironmentRow } from "@/lib/sensorsQuickLogManualSeriesRules";
import { snapshotFromManualSensorSnapshot } from "@/lib/sensorSnapshot";
import { SENSOR_SNAPSHOT_MISSING_EMPTY_STATE } from "@/lib/sensors/sensorSnapshotReadModel";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";
import { formatTemperatureDisplay } from "@/lib/temperatureUnitPreference";
import { sensorSourceLabel } from "@/lib/sensor/sensorSourceRules";
import {
  buildTonightTentMetrics,
  TONIGHT_TENT_HOME_COPY,
  type TonightSensorRow,
} from "@/lib/tonightTentHomeViewModel";
import {
  resolveDisplayedTentClimateSnapshot,
  tonightRowsFromQuickLogManualReadings,
} from "@/lib/tentManualEnvironmentSnapshotRules";

const TENT = "tent-start-room";
const OTHER = "tent-other";
const NOW = new Date("2026-11-01T13:16:00.000Z");
const LOGGED_AT = "2026-11-01T13:15:00.000Z";
const OLDER = "2026-11-01T12:00:00.000Z";
const NEWER = "2026-11-01T13:15:30.000Z";

const typed = convertTypedTemperatureToCelsius("76", "fahrenheit");
if (typed.kind !== "celsius") throw new Error("76 °F did not convert");
const TEMP_C = typed.value;

function environmentReading(tentId: string, at: string) {
  return sensorReadingFromQuickLogEnvironmentRow(
    {
      id: "env-1",
      plant_id: null,
      tent_id: tentId,
      occurred_at: at,
      event_type: "environment",
      source: "manual",
      environment: { temperature_c: TEMP_C, humidity_pct: 60, vpd_kpa: null },
    },
    NOW,
  );
}

function liveTemp(at: string, value: number): TonightSensorRow {
  return {
    id: `live-temp-${at}`,
    tent_id: TENT,
    metric: "temperature_c",
    value,
    source: "live",
    quality: "ok",
    ts: at,
    captured_at: at,
    raw_payload: null,
  };
}

function metricsFrom(rows: TonightSensorRow[]) {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot: { status: "idle", snapshot: null },
    now: NOW,
  });
}

describe("tent Quick Log manual reading is invisible to the Tonight card until projected", () => {
  it("proves the save leaves no diary envelope and the card's current inputs are Missing", () => {
    const saved = buildQuickLogV2SavePayload({
      resolved: { ok: true, targetType: "tent", targetId: TENT, tentId: TENT },
      action: "note",
      volumeMl: "",
      note: "canopy check",
      temperatureC: String(TEMP_C),
      humidityPct: "60",
      vpdKpa: "",
      occurredAt: LOGGED_AT,
      idempotencyKey: "idem-2671-manual",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.payload.p_temperature_c).toBe(TEMP_C);
    expect(saved.payload.p_humidity_pct).toBe(60);
    expect(saved.payload.p_vpd_kpa).toBeNull();
    const details = saved.payload.p_details ?? {};
    expect(details.manual_sensor_snapshot).toBeUndefined();
    expect(details.sensor_snapshot).toBeUndefined();
    expect(details.environment_check).toBeUndefined();
    expect(
      snapshotFromManualSensorSnapshot(
        LOGGED_AT,
        details.manual_sensor_snapshot as Record<string, unknown> | undefined,
      ),
    ).toBeNull();

    const reading = environmentReading(TENT, LOGGED_AT);
    expect(reading?.source).toBe("manual");
    expect(reading?.observedMetrics).toEqual(["temp", "rh"]);
    expect(reading?.temp).toBe(TEMP_C);

    const unmet = metricsFrom([]);
    expect(unmet.map((metric) => metric.state)).toEqual(["missing", "missing", "missing"]);
    expect(unmet.map((metric) => metric.value)).toEqual([null, null, null]);
  });

  it("shows 76.0 °F, 60%, and calculated VPD labeled manual once the sibling is a card row", () => {
    const reading = environmentReading(TENT, LOGGED_AT);
    const rows = tonightRowsFromQuickLogManualReadings(reading ? [reading] : [], TENT);
    const metrics = metricsFrom(rows);
    const temp = metrics.find((metric) => metric.key === "temp")!;
    const rh = metrics.find((metric) => metric.key === "rh")!;
    const vpd = metrics.find((metric) => metric.key === "vpd")!;
    const expectedVpd = calculateVpdKpa({ tempC: TEMP_C, rhPercent: 60 });

    expect(temp).toMatchObject({
      state: "value",
      value: TEMP_C,
      source: "manual",
      sourceLabel: sensorSourceLabel("manual"),
      calculated: false,
    });
    expect(formatTemperatureDisplay(temp.value, { digits: 1, unit: "fahrenheit" })).toBe("76.0°F");
    expect(rh).toMatchObject({
      state: "value",
      value: 60,
      source: "manual",
      sourceLabel: sensorSourceLabel("manual"),
    });
    expect(`${rh.value!.toFixed(0)}%`).toBe("60%");
    expect(vpd).toMatchObject({
      state: "value",
      value: expectedVpd,
      source: "manual",
      calculated: true,
      sourceLabel: sensorSourceLabel("manual"),
    });
    expect(vpd.value).toBeCloseTo(1.23, 2);
    expect(vpd.source).not.toBe("live");
    expect(TONIGHT_TENT_HOME_COPY.calculatedVpd).toBe("Calculated from temperature and RH");
  });

  it("lets a newer live row win and a newer manual beat an older live row", () => {
    const manual = environmentReading(TENT, LOGGED_AT);
    const manualRows = tonightRowsFromQuickLogManualReadings(manual ? [manual] : [], TENT);
    const newerLive = metricsFrom([...manualRows, liveTemp(NEWER, 20)]);
    expect(newerLive.find((metric) => metric.key === "temp")).toMatchObject({
      state: "value",
      value: 20,
      source: "live",
    });

    const olderLive = metricsFrom([liveTemp(OLDER, 18), ...manualRows]);
    expect(olderLive.find((metric) => metric.key === "temp")).toMatchObject({
      state: "value",
      value: TEMP_C,
      source: "manual",
    });
  });

  it("drops a null or foreign tent id", () => {
    const foreign = environmentReading(OTHER, LOGGED_AT);
    expect(tonightRowsFromQuickLogManualReadings(foreign ? [foreign] : [], TENT)).toEqual([]);
    const own = environmentReading(TENT, LOGGED_AT);
    expect(tonightRowsFromQuickLogManualReadings(own ? [own] : [], null)).toEqual([]);
    expect(tonightRowsFromQuickLogManualReadings(own ? [own] : [], "")).toEqual([]);
    expect(tonightRowsFromQuickLogManualReadings(null, TENT)).toEqual([]);
  });

  it("feeds the tent Environment block from the manual sibling when no newer sensor snapshot exists", () => {
    const reading = environmentReading(TENT, LOGGED_AT);
    const shown = resolveDisplayedTentClimateSnapshot({
      sensorSnapshot: null,
      manuals: reading ? [reading] : [],
      tentId: TENT,
      nowMs: NOW.getTime(),
    });
    expect(shown.fromManual).toBe(true);
    expect(shown.snapshot).toMatchObject({
      source: "manual",
      temp: TEMP_C,
      rh: 60,
      vpd: null,
      tent_id: TENT,
    });
    const model = buildSensorSnapshotReadModel({
      snapshot: shown.snapshot,
      now: NOW.getTime(),
    });
    expect(model.isMissing).toBe(false);
    expect(model.source).toBe("manual");
    expect(model.sourceLabel).toBe("Source: Manual");
    expect(model.emptyState).not.toBe(SENSOR_SNAPSHOT_MISSING_EMPTY_STATE);

    const newerLive = resolveDisplayedTentClimateSnapshot({
      sensorSnapshot: {
        source: "live",
        ts: NEWER,
        temp: 21,
        rh: 55,
        vpd: 1.1,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        tent_id: TENT,
      },
      manuals: reading ? [reading] : [],
      tentId: TENT,
      nowMs: NOW.getTime(),
    });
    expect(newerLive.fromManual).toBe(false);
    expect(newerLive.snapshot?.temp).toBe(21);
    expect(newerLive.snapshot?.source).toBe("live");

    const olderLive = resolveDisplayedTentClimateSnapshot({
      sensorSnapshot: {
        source: "live",
        ts: OLDER,
        temp: 19,
        rh: 50,
        vpd: 1,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        tent_id: TENT,
      },
      manuals: reading ? [reading] : [],
      tentId: TENT,
      nowMs: NOW.getTime(),
    });
    expect(olderLive.fromManual).toBe(true);
    expect(olderLive.snapshot?.source).toBe("manual");
    expect(olderLive.snapshot?.temp).toBe(TEMP_C);

    const foreign = environmentReading(OTHER, LOGGED_AT);
    const gated = resolveDisplayedTentClimateSnapshot({
      sensorSnapshot: null,
      manuals: foreign ? [foreign] : [],
      tentId: TENT,
      nowMs: NOW.getTime(),
    });
    expect(gated.fromManual).toBe(false);
    expect(gated.snapshot).toBeNull();
  });
});
