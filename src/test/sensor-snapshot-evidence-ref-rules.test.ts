/**
 * sensor-snapshot-evidence-ref-rules — pure helper coverage for Sensor
 * Snapshot → Alert Evidence Ref Population v1.
 */
import { describe, it, expect } from "vitest";
import {
  buildSensorSnapshotEvidenceRefs,
  buildSensorSnapshotLabel,
} from "@/lib/sensorSnapshotEvidenceRefRules";

const VALID = {
  id: "reading-abc",
  captured_at: "2025-06-29T12:00:00Z",
  source: "live",
  metric: "vpd",
} as const;

describe("buildSensorSnapshotEvidenceRefs — happy path", () => {
  it("returns exactly one sensor_snapshot ref for a valid live reading", () => {
    const refs = buildSensorSnapshotEvidenceRefs(VALID);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: "reading-abc",
      type: "sensor_snapshot",
      occurred_at: "2025-06-29T12:00:00Z",
      source: "live",
    });
  });

  for (const s of ["manual", "csv", "demo", "stale", "invalid", "imported"]) {
    it(`keeps honest source label "${s}" (never upgraded to live)`, () => {
      const refs = buildSensorSnapshotEvidenceRefs({ ...VALID, source: s });
      expect(refs[0]?.source).toBe(s);
    });
  }

  it("maps unknown/provider source strings to 'unknown'", () => {
    const refs = buildSensorSnapshotEvidenceRefs({
      ...VALID,
      source: "ecowitt",
    });
    expect(refs[0]?.source).toBe("unknown");
  });
});

describe("buildSensorSnapshotEvidenceRefs — rejection paths", () => {
  it("returns [] for null/undefined/non-object input", () => {
    expect(buildSensorSnapshotEvidenceRefs(null)).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs(undefined)).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs("nope" as unknown as never)).toEqual(
      [],
    );
    expect(buildSensorSnapshotEvidenceRefs(42 as unknown as never)).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs([] as unknown as never)).toEqual([]);
  });

  it("returns [] when id is missing/empty/non-string", () => {
    expect(
      buildSensorSnapshotEvidenceRefs({ ...VALID, id: undefined }),
    ).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs({ ...VALID, id: "" })).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs({ ...VALID, id: "   " })).toEqual(
      [],
    );
    expect(buildSensorSnapshotEvidenceRefs({ ...VALID, id: 12345 })).toEqual(
      [],
    );
  });

  it("returns [] when captured_at is missing/empty/non-string", () => {
    expect(
      buildSensorSnapshotEvidenceRefs({ ...VALID, captured_at: undefined }),
    ).toEqual([]);
    expect(
      buildSensorSnapshotEvidenceRefs({ ...VALID, captured_at: "" }),
    ).toEqual([]);
    expect(
      buildSensorSnapshotEvidenceRefs({ ...VALID, captured_at: 0 }),
    ).toEqual([]);
  });

  it("returns [] for non-truth sources (unavailable, empty)", () => {
    expect(
      buildSensorSnapshotEvidenceRefs({ ...VALID, source: "unavailable" }),
    ).toEqual([]);
    expect(buildSensorSnapshotEvidenceRefs({ ...VALID, source: "" })).toEqual(
      [],
    );
  });

  it("rejects entries that carry raw_payload or other forbidden fields", () => {
    const forbidden = [
      "raw_payload",
      "rawPayload",
      "payload",
      "raw",
      "service_role",
      "bridge_token",
      "api_token",
      "access_token",
      "refresh_token",
      "jwt",
      "secret",
      "prompt",
      "completion",
      "model_output",
      "user_id",
    ];
    for (const key of forbidden) {
      const refs = buildSensorSnapshotEvidenceRefs({
        ...VALID,
        [key]: "leak-me",
      } as never);
      expect(refs, `field ${key} must be rejected`).toEqual([]);
    }
  });

  it("never throws for malformed input", () => {
    const weird: unknown[] = [
      { id: { nested: true }, captured_at: "x", source: "live" },
      { id: "x", captured_at: { not: "string" }, source: "live" },
      Object.create(null),
      { id: "x", captured_at: "y", source: { not: "string" } },
    ];
    for (const w of weird) {
      expect(() =>
        buildSensorSnapshotEvidenceRefs(w as never),
      ).not.toThrow();
    }
  });
});

describe("buildSensorSnapshotLabel", () => {
  it("returns deterministic, diagnosis-free labels", () => {
    expect(buildSensorSnapshotLabel("vpd")).toBe("VPD sensor snapshot");
    expect(buildSensorSnapshotLabel("temp")).toBe("Temperature sensor snapshot");
    expect(buildSensorSnapshotLabel("temperature")).toBe(
      "Temperature sensor snapshot",
    );
    expect(buildSensorSnapshotLabel("rh")).toBe("Humidity sensor snapshot");
    expect(buildSensorSnapshotLabel("co2")).toBe("CO2 sensor snapshot");
    expect(buildSensorSnapshotLabel(undefined)).toBe("Sensor snapshot");
    expect(buildSensorSnapshotLabel(123 as unknown)).toBe("Sensor snapshot");
    expect(buildSensorSnapshotLabel("totally-unknown-metric")).toBe(
      "Sensor snapshot",
    );
  });

  it("labels never contain certainty or diagnosis tokens", () => {
    const banned = [
      "guaranteed",
      "definitely",
      "certain",
      "healthy",
      "diagnos",
    ];
    const samples = ["vpd", "temp", "rh", "co2", "ppfd", "soil", "ec", "x"];
    for (const s of samples) {
      const label = buildSensorSnapshotLabel(s).toLowerCase();
      for (const b of banned) {
        expect(label.includes(b)).toBe(false);
      }
    }
  });
});
