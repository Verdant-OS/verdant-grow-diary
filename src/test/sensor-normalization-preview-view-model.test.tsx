import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSensorNormalizationPreviewViewModel,
  SENSOR_NORMALIZATION_PREVIEW_DISCLAIMER,
  SENSOR_NORMALIZATION_PREVIEW_INVALID_NOTICE,
  SENSOR_NORMALIZATION_PREVIEW_NO_METRICS_EMPTY_STATE,
  SENSOR_NORMALIZATION_PREVIEW_TENT_MISSING_EMPTY_STATE,
} from "@/lib/sensors/sensorNormalizationPreviewViewModel";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-15T12:00:00Z");
const FRESH = "2026-06-15T11:50:00Z";
const OLD = "2026-06-15T08:00:00Z";

describe("sensorNormalizationPreviewViewModel", () => {
  it("CSV row preview produces csv / csv_import / csv", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "csv",
        sourceIdentity: "csv_import",
        transport: "csv",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    });
    expect(vm.source).toBe("csv");
    expect(vm.sourceIdentity).toBe("csv_import");
    expect(vm.transport).toBe("csv");
    expect(vm.writesEnabled).toBe(false);
    expect(vm.disclaimer).toBe(SENSOR_NORMALIZATION_PREVIEW_DISCLAIMER);
    expect(vm.longFormRowCount).toBeGreaterThan(0);
  });

  it("manual preview produces manual / manual_entry / manual and computes VPD", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "manual",
        sourceIdentity: "manual_entry",
        transport: "manual",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    });
    expect(vm.source).toBe("manual");
    expect(vm.sourceIdentity).toBe("manual_entry");
    expect(vm.transport).toBe("manual");
    expect(vm.metricRows.some((r) => r.metric === "vpd_kpa")).toBe(true);
  });

  it("stale CSV row shows stale badge + stale warning", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "csv",
        sourceIdentity: "csv_import",
        transport: "csv",
        tentId: TENT,
        capturedAt: OLD,
        now: NOW,
      },
    });
    expect(vm.isStale).toBe(true);
    expect(vm.source).toBe("stale");
    expect(vm.badges.some((b) => b.label === "Stale")).toBe(true);
    expect(vm.warnings.some((w) => w.code === "stale_reading")).toBe(true);
  });

  it("invalid row shows invalid badge, invalid notice, and zero write-ready rows", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: {},
      options: {
        source: "live",
        sourceIdentity: "ecowitt",
        transport: "webhook",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    });
    expect(vm.source).toBe("invalid");
    expect(vm.badges.some((b) => b.label === "Invalid")).toBe(true);
    expect(vm.longFormRowCount).toBe(0);
    expect(vm.emptyState).toBe(SENSOR_NORMALIZATION_PREVIEW_INVALID_NOTICE);
  });

  it("missing tent_id warns and yields zero long-form rows", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: { source: "csv", capturedAt: FRESH, now: NOW },
    });
    expect(vm.tentIdStatus).toBe("missing");
    expect(vm.warnings.some((w) => w.code === "missing_tent_id")).toBe(true);
    expect(vm.longFormRowCount).toBe(0);
    expect(vm.emptyState).toBe(SENSOR_NORMALIZATION_PREVIEW_TENT_MISSING_EMPTY_STATE);
  });

  it("µS/cm EC alias converts to mS/cm; mS/cm field with huge value warns", () => {
    const ok = buildSensorNormalizationPreviewViewModel({
      payload: { soil_ec_us_cm: 1450 },
      options: { source: "csv", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    expect(
      ok.metricRows.find((r) => r.metric === "soil_ec_ms_cm")?.value,
    ).toBeCloseTo(1.45, 2);

    const warn = buildSensorNormalizationPreviewViewModel({
      payload: { soil_ec_ms_cm: 1450 },
      options: { source: "csv", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    expect(warn.warnings.some((w) => w.code === "soil_ec_likely_us_cm")).toBe(true);
  });

  it("raw payload preserved on normalized; field count exposed but raw values not in display fields", () => {
    const payload = { temperature_c: 24, humidity: 50, secret_token: "shh" };
    const vm = buildSensorNormalizationPreviewViewModel({
      payload,
      options: { source: "csv", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    expect(vm.normalized.raw_payload).toBe(payload);
    expect(vm.rawPayloadFieldCount).toBe(3);
    const serialized = JSON.stringify({
      badges: vm.badges,
      warnings: vm.warnings,
      metricRows: vm.metricRows,
      longFormRows: vm.longFormRows,
      rawPayloadNote: vm.rawPayloadNote,
    });
    expect(serialized).not.toContain("secret_token");
    expect(serialized).not.toContain("shh");
  });

  it("is deterministic with injected now", () => {
    const a = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: { source: "csv", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    const b = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: { source: "csv", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    expect({ ...a, normalized: null }).toEqual({ ...b, normalized: null });
  });

  it("classifies non-UUID tent as invalid and yields tent-missing empty state", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: { source: "manual", tentId: "tent-1", capturedAt: FRESH, now: NOW },
    });
    expect(vm.tentStatus).toBe("invalid");
    expect(vm.tentStatusLabel).toBe("Invalid tent ID");
    expect(vm.longFormRowCount).toBe(0);
    expect(vm.emptyState).toBe(SENSOR_NORMALIZATION_PREVIEW_TENT_MISSING_EMPTY_STATE);
  });

  it("classifies UUID tent as linked_verified", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: { source: "manual", tentId: TENT, capturedAt: FRESH, now: NOW },
    });
    expect(vm.tentStatus).toBe("linked_verified");
    expect(vm.tentStatusLabel).toBe("Linked tent verified");
  });

  it("classifies missing plant as informational (not invalid)", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "manual",
        tentId: TENT,
        plantId: null,
        capturedAt: FRESH,
        now: NOW,
      },
    });
    expect(vm.plantStatus).toBe("missing");
    expect(vm.plantStatusLabel).toBe("No plant linked");
    expect(vm.longFormRowCount).toBeGreaterThan(0);
  });

  it("classifies non-UUID plant as invalid", () => {
    const vm = buildSensorNormalizationPreviewViewModel({
      payload: { temperature_c: 24, humidity: 50 },
      options: {
        source: "manual",
        tentId: TENT,
        plantId: "plant-1",
        capturedAt: FRESH,
        now: NOW,
      },
    });
    expect(vm.plantStatus).toBe("invalid");
    expect(vm.plantStatusLabel).toBe("Invalid plant ID");
  });

  it("static safety: helper does not import write paths or call edges", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/sensors/sensorNormalizationPreviewViewModel.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/insertSensorReading/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upload\(/);
    expect(src).not.toMatch(/supabase\.from\(["']sensor_readings["']\)/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/alerts/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge[_\s-]?token/i);
    expect(src).not.toMatch(/device[_-]?control/i);
    expect(src).not.toMatch(/automation/i);
  });
});
