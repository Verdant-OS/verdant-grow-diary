/**
 * manualSensorSnapshotEditRules — pure diff builder tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildManualSensorSnapshotEditDiff,
  sanitizeChangeReason,
  MANUAL_EDIT_ALLOWED_FIELDS,
} from "@/lib/manualSensorSnapshotEditRules";

describe("buildManualSensorSnapshotEditDiff", () => {
  it("detects changed numeric metric fields with deterministic order", () => {
    const r = buildManualSensorSnapshotEditDiff({
      original: { source: "manual", temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
      replacement: {
        source: "manual",
        temperature_c: 25,
        humidity_pct: 55,
        vpd_kpa: 1.3,
        co2_ppm: 800,
      },
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.changed_fields).toEqual(["co2_ppm", "temperature_c", "vpd_kpa"]);
    expect(r.old_values).toEqual({ temperature_c: 24, vpd_kpa: 1.2 });
    expect(r.new_values).toEqual({ co2_ppm: 800, temperature_c: 25, vpd_kpa: 1.3 });
    expect(r.source_before).toBe("manual");
    expect(r.source_after).toBe("manual");
  });

  it("rejects empty diff (no fields changed)", () => {
    const r = buildManualSensorSnapshotEditDiff({
      original: { source: "manual", temperature_c: 24, humidity_pct: 55 },
      replacement: { source: "manual", temperature_c: 24, humidity_pct: 55 },
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("empty_diff");
  });

  it("rejects non-manual sources on either side", () => {
    for (const [orig, repl] of [
      ["live", "manual"],
      ["manual", "csv"],
      ["demo", "demo"],
    ] as const) {
      const r = buildManualSensorSnapshotEditDiff({
        original: { source: orig, temperature_c: 24 },
        replacement: { source: repl, temperature_c: 25 },
      });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.reason).toBe("non_manual_source");
    }
  });

  it("excludes raw_payload, vendor lineage, notes, and unknown keys", () => {
    const r = buildManualSensorSnapshotEditDiff({
      original: {
        source: "manual",
        temperature_c: 24,
        raw_payload: { secret: "x" },
        source_app: "ecowitt",
        notes: "before",
      },
      replacement: {
        source: "manual",
        temperature_c: 25,
        raw_payload: { secret: "y" },
        source_app: "ecowitt",
        notes: "after",
      },
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.changed_fields).toEqual(["temperature_c"]);
    expect(Object.keys(r.old_values)).toEqual(["temperature_c"]);
    expect(Object.keys(r.new_values)).toEqual(["temperature_c"]);
  });

  it("preserves numeric values only (drops NaN/strings)", () => {
    const r = buildManualSensorSnapshotEditDiff({
      original: {
        source: "manual",
        temperature_c: 24,
        humidity_pct: Number.NaN as unknown as number,
      },
      replacement: {
        source: "manual",
        temperature_c: 25,
        humidity_pct: "55" as unknown as number,
      },
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.changed_fields).toEqual(["temperature_c"]);
  });

  it("allowed fields list stays stable (guard against silent widening)", () => {
    expect([...MANUAL_EDIT_ALLOWED_FIELDS].sort()).toEqual([
      "co2_ppm",
      "humidity_pct",
      "ppfd",
      "reservoir_ec_mscm",
      "reservoir_ph",
      "soil_ec_mscm",
      "soil_moisture_pct",
      "soil_temp_c",
      "temperature_c",
      "vpd_kpa",
    ]);
  });
});

describe("sanitizeChangeReason", () => {
  it("trims, caps length, returns null for empty", () => {
    expect(sanitizeChangeReason("  ")).toBeNull();
    expect(sanitizeChangeReason(null)).toBeNull();
    expect(sanitizeChangeReason(undefined)).toBeNull();
    expect(sanitizeChangeReason(123 as unknown)).toBeNull();
    expect(sanitizeChangeReason("  hi  ")).toBe("hi");
    const big = "x".repeat(1000);
    expect(sanitizeChangeReason(big)?.length).toBe(500);
  });
});
