import { describe, expect, it } from "vitest";
import { buildManualReadingPayloads } from "@/lib/sensorReadingManualEntryRules";
import { buildManualSensorSnapshot } from "@/lib/quickLogRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import { snapshotFromReadings, type SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  buildManualSensorProvenance,
  buildManualSensorProvenanceLabels,
  isCanonicalManualSensorPayload,
  isCanonicalManualSensorProvenance,
  matchesManualSensorPayload,
} from "@/lib/manualSensorProvenanceRules";
import { diaryRowToManualSnapshotRecord } from "@/lib/manualSnapshotDiaryAdapter";
import { quickLogV2EnvironmentRowToManualSnapshotRecord } from "@/lib/quickLogV2ManualSnapshotAdapter";
import { buildManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const CANONICAL = {
  source: "manual",
  source_identity: "manual_entry",
  transport: "manual",
  confidence: null,
};
const CAPTURED = "2026-09-16T12:00:00.000Z";
const TENT_ID = "11111111-1111-4111-8111-111111111111";

function standalone() {
  return buildManualReadingPayloads({
    tentId: TENT_ID,
    ts: CAPTURED,
    metrics: [{ metric: "temperature_c", value: 25 }],
  })[0];
}

function quickLog() {
  const result = buildQuickLogV2SavePayload({
    resolved: { ok: true, targetType: "tent", targetId: TENT_ID, tentId: TENT_ID, plantId: null },
    action: "note",
    volumeMl: "",
    note: "Lights-on reading",
    temperatureC: "25",
    humidityPct: "",
    vpdKpa: "",
    occurredAt: CAPTURED,
    idempotencyKey: "manual-provenance-parity",
  });
  if (result.ok !== true) throw new Error(`Unexpected build failure: ${result.reason}`);
  return result.payload;
}

describe("canonical manual provenance across entry paths", () => {
  it("persists canonical provenance on standalone manual readings", () => {
    expect(standalone()).toMatchObject({
      source: "manual",
      raw_payload: { manual_provenance: CANONICAL },
    });
  });

  it("persists the same metadata on Quick Log Note without a second snapshot", () => {
    const payload = quickLog();
    expect(payload.p_details?.manual_provenance).toEqual(CANONICAL);
    expect(payload.p_details).not.toHaveProperty("manual_sensor_snapshot");
    expect(payload.p_temperature_c).toBe(25);
  });

  it("preserves the same contract on the existing Plant Quick Log path", () => {
    expect(buildManualSensorSnapshot({ temp: "77", humidity: "", ph: "", ec: "" })).toMatchObject({
      source: "manual",
      manual_provenance: CANONICAL,
    });
  });

  it("normalizes known manual acquisition without a physical device", () => {
    const snapshot: SensorSnapshot = {
      source: "manual",
      ts: CAPTURED,
      temp: 25,
      rh: null,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
    };
    const model = buildSensorSnapshotReadModel({ snapshot, now: Date.parse(CAPTURED) });
    expect(model.sourceLabel).toBe("Source: Manual");
    expect(model.sourceIdentityLabel).toBe("Identity: manual_entry");
    expect(model.transportLabel).toBe("Transport: manual");
    expect(model.confidenceLabel).toBe("Confidence: unknown");
    expect(model.badges.some(({ label }) => label.startsWith("Device hint:"))).toBe(false);
    expect(snapshot.device_id).toBeNull();
  });

  it("preserves explicit device notes separately from acquisition identity", () => {
    const [row] = buildManualReadingPayloads({
      tentId: TENT_ID,
      ts: CAPTURED,
      metrics: [{ metric: "humidity_pct", value: 60 }],
      deviceNote: "Handheld meter",
    });
    expect(row.device_id).toBe("manual:Handheld meter");
    expect(row).toMatchObject({ source: "manual", raw_payload: { manual_provenance: CANONICAL } });
  });

  it("keeps provenance equal after JSON storage and existing read adapters", () => {
    const sensorRow = JSON.parse(JSON.stringify(standalone()));
    const note = JSON.parse(JSON.stringify(quickLog()));
    const plantSnapshot = JSON.parse(
      JSON.stringify(buildManualSensorSnapshot({ temp: "77", humidity: "", ph: "", ec: "" })),
    );
    expect(sensorRow.raw_payload.manual_provenance).toEqual(note.p_details.manual_provenance);
    expect(plantSnapshot.manual_provenance).toEqual(note.p_details.manual_provenance);
    const snapshot = snapshotFromReadings([sensorRow]);
    const model = buildSensorSnapshotReadModel({ snapshot, now: Date.parse(CAPTURED) });
    const diaryRecord = diaryRowToManualSnapshotRecord({
      id: "diary-1",
      entry_at: CAPTURED,
      tent_id: TENT_ID,
      plant_id: null,
      note: "Lights-on reading",
      details: { manual_sensor_snapshot: plantSnapshot },
    });
    const environmentRecord = quickLogV2EnvironmentRowToManualSnapshotRecord({
      id: "environment-1",
      occurred_at: note.p_occurred_at,
      tent_id: TENT_ID,
      plant_id: null,
      event_type: "environment",
      source: "manual",
      environment: {
        temperature_c: note.p_temperature_c,
        humidity_pct: note.p_humidity_pct,
        vpd_kpa: note.p_vpd_kpa,
      },
    });
    expect(diaryRecord).not.toBeNull();
    expect(environmentRecord).not.toBeNull();
    for (const record of [diaryRecord, environmentRecord]) {
      if (!record) throw new Error("Expected manual snapshot record");
      const card = buildManualSnapshotTimelineCard(record);
      const labels = buildManualSensorProvenanceLabels(card.source);
      expect(labels.slice(1)).toEqual([
        model.sourceIdentityLabel,
        model.transportLabel,
        model.confidenceLabel,
      ]);
      expect(card.source).toBe("manual");
    }
    expect(snapshot?.source).toBe("manual");
    expect(snapshot).not.toHaveProperty("raw_payload");
    expect(model.rawPayloadFieldCount).toBe(0);
  });

  it("does not reclassify a CSV row from a manual-shaped metadata object", () => {
    const snapshot = snapshotFromReadings([{ ...standalone(), source: "csv" }]);
    const model = buildSensorSnapshotReadModel({ snapshot, now: Date.parse(CAPTURED) });
    expect(snapshot?.source).toBe("csv");
    expect(model.sourceIdentityLabel).toBe("Identity: unknown");
    expect(model.transportLabel).toBe("Transport: unknown");
    expect(model.sourceLabel).not.toMatch(/manual|live/i);
  });
});

describe("closed manual provenance contract", () => {
  it("returns deterministic independent metadata without measured confidence", () => {
    const first = buildManualSensorProvenance();
    const second = buildManualSensorProvenance();
    expect(first).toEqual(CANONICAL);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(first.confidence).toBeNull();
    expect(first).not.toHaveProperty("device_id");
  });

  it("does not share nested metadata between metrics or separate submissions", () => {
    const rows = buildManualReadingPayloads({
      tentId: TENT_ID,
      ts: CAPTURED,
      metrics: [
        { metric: "temperature_c", value: 25 },
        { metric: "humidity_pct", value: 60 },
      ],
    });
    Reflect.set(rows[0].raw_payload.manual_provenance, "transport", "mqtt");
    expect(rows[1].raw_payload.manual_provenance).toEqual(CANONICAL);
    expect(standalone().raw_payload.manual_provenance).toEqual(CANONICAL);
    expect(quickLog().p_details?.manual_provenance).toEqual(CANONICAL);
  });

  it("projects repeatable labels while keeping confidence unknown", () => {
    const first = buildManualSensorProvenanceLabels("manual");
    expect(buildManualSensorProvenanceLabels("manual")).toEqual(first);
    expect(first).toEqual([
      "Source: manual",
      "Identity: manual_entry",
      "Transport: manual",
      "Confidence: unknown",
    ]);
  });

  it.each([null, undefined, "live", "csv", "unverified", "Manual", {}, []])(
    "does not infer manual acquisition from nonmanual source %j",
    (source) => {
      expect(buildManualSensorProvenanceLabels(source)).toEqual([
        "Source: unknown",
        "Identity: unknown",
        "Transport: unknown",
        "Confidence: unknown",
      ]);
    },
  );

  it("rejects a provenance object with any extra top-level key", () => {
    expect(
      isCanonicalManualSensorProvenance({
        ...CANONICAL,
        observed_at: CAPTURED,
      }),
    ).toBe(false);
  });

  it("accepts only the exact canonical envelope regardless of JSON property order", () => {
    const submitted = { manual_provenance: buildManualSensorProvenance() };
    const stored = {
      manual_provenance: {
        confidence: null,
        transport: "manual",
        source_identity: "manual_entry",
        source: "manual",
      },
    };
    expect(isCanonicalManualSensorProvenance(stored.manual_provenance)).toBe(true);
    expect(isCanonicalManualSensorPayload(stored)).toBe(true);
    expect(matchesManualSensorPayload(submitted, stored)).toBe(true);
    expect(matchesManualSensorPayload(stored, submitted)).toBe(true);
  });

  it("preserves legacy absent metadata without matching it to new metadata", () => {
    expect(matchesManualSensorPayload(null, null)).toBe(true);
    expect(matchesManualSensorPayload(undefined, null)).toBe(true);
    expect(matchesManualSensorPayload(null, undefined)).toBe(true);
    const payload = { manual_provenance: buildManualSensorProvenance() };
    expect(matchesManualSensorPayload(null, payload)).toBe(false);
    expect(matchesManualSensorPayload(payload, undefined)).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["array", []],
    ["empty", {}],
    ["missing provenance", { manual_provenance: null }],
    ["wrong source", { manual_provenance: { ...CANONICAL, source: "live" } }],
    ["physical identity", { manual_provenance: { ...CANONICAL, source_identity: "meter-123" } }],
    ["wrong transport", { manual_provenance: { ...CANONICAL, transport: "mqtt" } }],
    ["claimed confidence", { manual_provenance: { ...CANONICAL, confidence: 1 } }],
    ["missing confidence", { manual_provenance: { ...CANONICAL, confidence: undefined } }],
    ["extra identity", { manual_provenance: { ...CANONICAL, device_id: "meter-123" } }],
    ["extra data", { manual_provenance: CANONICAL, raw_data: { arbitrary: true } }],
    [
      "operator claim",
      { manual_provenance: CANONICAL, provenance: "operator_attested_real_payload" },
    ],
    ["symbol extra", { manual_provenance: CANONICAL, [Symbol("extra")]: true }],
  ])("rejects %s as canonical retry evidence", (_name, payload) => {
    expect(isCanonicalManualSensorPayload(payload)).toBe(false);
    const canonical = { manual_provenance: buildManualSensorProvenance() };
    expect(matchesManualSensorPayload(canonical, payload)).toBe(false);
    expect(matchesManualSensorPayload(payload, canonical)).toBe(false);
  });

  it("does not accept inherited fields as persisted provenance", () => {
    const inherited = Object.create(CANONICAL);
    expect(isCanonicalManualSensorProvenance(inherited)).toBe(false);
    expect(isCanonicalManualSensorPayload(Object.create({ manual_provenance: CANONICAL }))).toBe(
      false,
    );
  });
});
