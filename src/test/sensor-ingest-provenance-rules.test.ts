import { describe, expect, it } from "vitest";
import {
  buildSensorIngestProvenancePayload,
  isRejectedSourceAlias,
} from "@/lib/sensorIngestProvenanceRules";

describe("sensor ingest provenance rules", () => {
  it("builds a live MQTT provenance payload without expanding source labels", () => {
    const result = buildSensorIngestProvenancePayload({
      source: "live",
      sourceApp: "raspberry_pi_bridge",
      transport: "mqtt",
      vendor: "local_bridge",
      bridge: "tent_bridge_01",
      externalDeviceId: "probe-01",
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        source: "live",
        raw_payload: {
          source_app: "raspberry_pi_bridge",
          transport: "mqtt",
          vendor: "local_bridge",
          bridge: "tent_bridge_01",
          external_device_id: "probe-01",
        },
      },
    });
  });

  it("builds CSV provenance using source csv and transport csv_export", () => {
    const result = buildSensorIngestProvenancePayload({
      source: "csv",
      sourceApp: "spider_farmer_ggs",
      transport: "csv_export",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.source).toBe("csv");
      expect(result.payload.raw_payload.source_app).toBe("spider_farmer_ggs");
      expect(result.payload.raw_payload.transport).toBe("csv_export");
    }
  });

  it("rejects transport and integration names as source labels", () => {
    expect(buildSensorIngestProvenancePayload({
      source: "mqtt",
      sourceApp: "raspberry_pi_bridge",
      transport: "mqtt",
    })).toEqual({ ok: false, reason: "source_not_canonical" });

    expect(buildSensorIngestProvenancePayload({
      source: "api",
      sourceApp: "spider_farmer_ggs",
      transport: "api",
    })).toEqual({ ok: false, reason: "source_not_canonical" });

    expect(buildSensorIngestProvenancePayload({
      source: "unknown",
      sourceApp: "unknown_app",
      transport: "api",
    })).toEqual({ ok: false, reason: "source_not_canonical" });
  });

  it("rejects unsupported provenance app and transport values", () => {
    expect(buildSensorIngestProvenancePayload({
      source: "live",
      sourceApp: "not_registered",
      transport: "mqtt",
    })).toEqual({ ok: false, reason: "source_app_not_allowed" });

    expect(buildSensorIngestProvenancePayload({
      source: "live",
      sourceApp: "raspberry_pi_bridge",
      transport: "not_registered",
    })).toEqual({ ok: false, reason: "transport_not_allowed" });
  });

  it("strips suspicious optional provenance strings", () => {
    const result = buildSensorIngestProvenancePayload({
      source: "live",
      sourceApp: "raspberry_pi_bridge",
      transport: "mqtt",
      vendor: "service_role should not appear",
      bridge: "Bearer secret should not appear",
      externalDeviceId: "safe-device-id",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.raw_payload.vendor).toBeUndefined();
      expect(result.payload.raw_payload.bridge).toBeUndefined();
      expect(result.payload.raw_payload.external_device_id).toBe("safe-device-id");
      expect(JSON.stringify(result.payload)).not.toContain("service_role");
      expect(JSON.stringify(result.payload)).not.toContain("Bearer");
    }
  });

  it("identifies known non-canonical aliases", () => {
    expect(isRejectedSourceAlias("mqtt")).toBe(true);
    expect(isRejectedSourceAlias("api")).toBe(true);
    expect(isRejectedSourceAlias("home_assistant")).toBe(true);
    expect(isRejectedSourceAlias("live")).toBe(false);
    expect(isRejectedSourceAlias("manual")).toBe(false);
  });
});
