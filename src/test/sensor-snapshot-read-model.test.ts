import { describe, it, expect } from "vitest";
import {
  buildSensorSnapshotReadModel,
  SENSOR_SNAPSHOT_MISSING_EMPTY_STATE,
  SENSOR_SNAPSHOT_STALE_NOTICE,
  SENSOR_SNAPSHOT_INVALID_NOTICE,
  SENSOR_SNAPSHOT_PREVIEW_ONLY_NOTE,
  SENSOR_SNAPSHOT_RAW_PAYLOAD_NOTE,
} from "@/lib/sensors/sensorSnapshotReadModel";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorTruthAssessment } from "@/lib/sensorTruthRules";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NOW = new Date("2025-06-15T12:00:00Z").getTime();
const FRESH = new Date(NOW - 60_000).toISOString();
const STALE = new Date(NOW - 60 * 60_000).toISOString();

function liveSnap(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FRESH,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 30,
    soil_ec: 1.2,
    soil_temp: 22,
    ppfd: null,
    device_id: "ecowitt-WH45",
    csvVendor: null,
    ...overrides,
  };
}

function truth(overrides: Partial<SensorTruthAssessment> = {}): SensorTruthAssessment {
  return {
    snapshot: liveSnap(),
    invalidFields: [],
    suspiciousFields: [],
    stale: false,
    hasInvalid: false,
    reasonChips: [],
    reasonCodes: [],
    ...overrides,
  };
}

describe("buildSensorSnapshotReadModel", () => {
  it("returns missing model when snapshot is null", () => {
    const m = buildSensorSnapshotReadModel({ snapshot: null, now: NOW });
    expect(m.isMissing).toBe(true);
    expect(m.hasSnapshot).toBe(false);
    expect(m.source).toBe("missing");
    expect(m.emptyState).toBe(SENSOR_SNAPSHOT_MISSING_EMPTY_STATE);
    expect(m.badges.map((b) => b.label)).toEqual([
      "Source: missing",
      "Identity: unknown",
      "Transport: unknown",
      "Confidence: unknown",
    ]);
  });

  it("returns missing model when snapshot is unavailable", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap({ source: "unavailable", device_id: null }),
      now: NOW,
    });
    expect(m.isMissing).toBe(true);
    expect(m.source).toBe("missing");
    expect(m.previewOnlyNote).toBe(SENSOR_SNAPSHOT_PREVIEW_ONLY_NOTE);
    expect(m.rawPayloadNote).toBe(SENSOR_SNAPSHOT_RAW_PAYLOAD_NOTE);
  });

  it("renders source / identity / transport / confidence vocabulary for a live snapshot", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap(),
      truth: truth(),
      now: NOW,
    });
    expect(m.hasSnapshot).toBe(true);
    expect(m.sourceLabel).toBe("Source: Live sensor");
    expect(m.sourceIdentityLabel).toBe("Identity: ecowitt-WH45");
    expect(m.transportLabel).toBe("Transport: unknown");
    expect(m.confidenceLabel).toBe("Confidence: unknown");
    expect(m.capturedAtLabel).toContain(FRESH);
    expect(m.emptyState).toBeNull();
    expect(m.isStale).toBe(false);
    expect(m.isInvalid).toBe(false);
  });

  it("flags a stale snapshot without classifying it as healthy", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap({ ts: STALE }),
      truth: truth({ stale: true }),
      now: NOW,
    });
    expect(m.isStale).toBe(true);
    expect(m.emptyState).toBe(SENSOR_SNAPSHOT_STALE_NOTICE);
    expect(m.badges.map((b) => b.label)).toContain("Stale");
  });

  it("flags an invalid snapshot and surfaces warnings", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap(),
      truth: truth({
        hasInvalid: true,
        invalidFields: ["temp"],
        reasonChips: ["Temperature invalid"],
        reasonCodes: ["invalid_temp"],
      }),
      now: NOW,
    });
    expect(m.isInvalid).toBe(true);
    expect(m.emptyState).toBe(SENSOR_SNAPSHOT_INVALID_NOTICE);
    expect(m.warnings).toEqual(["Temperature invalid"]);
    expect(m.badges.map((b) => b.label)).toContain("Invalid");
  });

  it("falls back to csv vendor label for identity when device_id is missing", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap({
        source: "csv",
        device_id: null,
        csvVendor: { label: "AC Infinity", vendors: ["ac-infinity"] } as unknown as SensorSnapshot["csvVendor"],
      }),
      now: NOW,
    });
    expect(m.sourceIdentityLabel).toBe("Identity: AC Infinity");
  });

  it("never marks manual / csv / demo as Live", () => {
    for (const src of ["manual", "csv", "sim", "diary"] as const) {
      const m = buildSensorSnapshotReadModel({
        snapshot: liveSnap({ source: src }),
        now: NOW,
      });
      expect(m.sourceLabel).not.toContain("Live");
    }
  });

  it("rawPayloadFieldCount is always 0 — raw payload is never exposed", () => {
    const m = buildSensorSnapshotReadModel({
      snapshot: liveSnap(),
      now: NOW,
    });
    expect(m.rawPayloadFieldCount).toBe(0);
  });
});

describe("sensorSnapshotReadModel static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/sensors/sensorSnapshotReadModel.ts"),
    "utf8",
  );
  const componentSrc = readFileSync(
    resolve(__dirname, "../components/SensorSnapshotTruthStrip.tsx"),
    "utf8",
  );
  const forbidden = [
    "insertSensorReading",
    "useInsertSensorReading(",
    ".insert(",
    ".upsert(",
    ".update(",
    ".delete(",
    ".upload(",
    "functions.invoke",
    "action_queue",
    "alerts",
    "device control",
    "automation",
    "service_role",
    "bridge token",
    "raw_payload",
  ];
  for (const needle of forbidden) {
    it(`read-model source does not contain forbidden token: ${needle}`, () => {
      expect(src).not.toContain(needle);
    });
    it(`presenter source does not contain forbidden token: ${needle}`, () => {
      expect(componentSrc).not.toContain(needle);
    });
  }
});
