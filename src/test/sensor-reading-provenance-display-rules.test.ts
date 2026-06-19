import { describe, expect, it } from "vitest";
import {
  SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS,
  buildSensorReadingProvenanceDisplayModel,
} from "@/lib/sensorReadingProvenanceDisplayRules";

describe("sensor reading provenance display rules", () => {
  it("builds a safe display model for live bridge provenance", () => {
    const model = buildSensorReadingProvenanceDisplayModel({
      source: "live",
      capturedAt: "2026-06-18T00:00:00Z",
      rawPayload: {
        source_app: "raspberry_pi_bridge",
        transport: "mqtt",
        vendor: "local",
        bridge: "tent_bridge_01",
      },
    });

    expect(model).toEqual({
      source: "live",
      sourceLabel: "Live",
      sourceAppLabel: "raspberry_pi_bridge",
      transportLabel: "mqtt",
      vendorLabel: "local",
      bridgeLabel: "tent_bridge_01",
      capturedAt: "2026-06-18T00:00:00Z",
      isDisplaySafe: true,
    });
  });

  it("rejects non-canonical source labels instead of displaying them", () => {
    expect(buildSensorReadingProvenanceDisplayModel({ source: "mqtt" })).toBeNull();
    expect(buildSensorReadingProvenanceDisplayModel({ source: "api" })).toBeNull();
    expect(buildSensorReadingProvenanceDisplayModel({ source: "unknown" })).toBeNull();
  });

  it("does not expose raw payload bodies or unsupported keys", () => {
    const model = buildSensorReadingProvenanceDisplayModel({
      source: "csv",
      capturedAt: "2026-06-18T00:00:00Z",
      rawPayload: {
        source_app: "spider_farmer_ggs",
        transport: "csv_export",
        payload: { deep: "do-not-render" },
        headers: { Authorization: "Bearer abc" },
        passkey: "passkey_should_not_render",
        arbitrary: "also hidden",
      },
    });

    expect(model?.sourceLabel).toBe("CSV");
    expect(model?.sourceAppLabel).toBe("spider_farmer_ggs");
    expect(model?.transportLabel).toBe("csv_export");
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("do-not-render");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("passkey");
    expect(serialized).not.toContain("arbitrary");
  });

  it("drops suspicious display values even when they are under allowed keys", () => {
    const model = buildSensorReadingProvenanceDisplayModel({
      source: "live",
      rawPayload: {
        source_app: "service_role should not render",
        transport: "Bearer secret should not render",
        vendor: "safe_vendor",
        bridge: "api_key should not render",
      },
    });

    expect(model?.sourceAppLabel).toBeNull();
    expect(model?.transportLabel).toBeNull();
    expect(model?.vendorLabel).toBe("safe_vendor");
    expect(model?.bridgeLabel).toBeNull();
    expect(JSON.stringify(model)).not.toContain("service_role");
    expect(JSON.stringify(model)).not.toContain("Bearer");
    expect(JSON.stringify(model)).not.toContain("api_key");
  });

  it("normalizes invalid timestamps to null", () => {
    expect(buildSensorReadingProvenanceDisplayModel({
      source: "manual",
      capturedAt: "not-a-date",
    })?.capturedAt).toBeNull();
  });

  it("keeps the display raw-key allow-list narrow", () => {
    expect([...SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS].sort()).toEqual([
      "bridge",
      "source_app",
      "transport",
      "vendor",
    ]);
    expect(SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS.has("payload")).toBe(false);
    expect(SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS.has("headers")).toBe(false);
    expect(SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS.has("Authorization")).toBe(false);
    expect(SENSOR_READING_PROVENANCE_DISPLAY_SAFE_RAW_KEYS.has("token")).toBe(false);
  });
});
