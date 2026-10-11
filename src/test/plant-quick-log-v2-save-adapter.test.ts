import { describe, it, expect } from "vitest";
import { buildPlantQuickLogV2SavePayload } from "@/lib/plantQuickLogV2SaveAdapter";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";

const base = {
  plantId: "p1",
  plantName: "Sour Diesel #1",
  growId: "g1",
  tentId: "t1",
  note: "Watered.",
  sensors: { temp: "", humidity: "", ph: "", ec: "" },
  idempotencyKey: "quicklog-v2-plant-test-key",
};

describe("buildPlantQuickLogV2SavePayload", () => {
  it("routes a plant note through the existing RPC payload shape", () => {
    const r = buildPlantQuickLogV2SavePayload(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_target_type).toBe("plant");
    expect(r.payload.p_target_id).toBe("p1");
    expect(r.payload.p_action).toBe("note");
    expect(r.payload.p_volume_ml).toBeNull();
    expect(r.payload.p_note).toBe("Watered.");
    expect(r.payload.p_idempotency_key).toBe("quicklog-v2-plant-test-key");
    expect(r.payload.p_details).toMatchObject({
      event_type: "quick_log",
      plant_id: "p1",
      grow_id: "g1",
      tent_id: "t1",
    });
    expect(r.payload.p_details).not.toHaveProperty("manual_provenance");
    expect(r.payload.p_details).not.toHaveProperty("manual_sensor_snapshot");
  });

  it("converts typed °F to p_temperature_c and keeps manual snapshot °F", () => {
    const r = buildPlantQuickLogV2SavePayload({
      ...base,
      sensors: { temp: "78", humidity: "55", ph: "6.2", ec: "" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_temperature_c).toBe(fahrenheitToCelsius(78));
    expect(r.payload.p_humidity_pct).toBe(55);
    expect(r.payload.p_vpd_kpa).toBeNull();
    expect(r.payload.p_details).toMatchObject({
      manual_sensor_snapshot: {
        temp_f: 78,
        humidity_percent: 55,
        ph: 6.2,
        ec: null,
        source: "manual",
        manual_provenance: {
          source: "manual",
          source_identity: "manual_entry",
          transport: "manual",
          confidence: null,
        },
      },
      manual_provenance: {
        source: "manual",
        source_identity: "manual_entry",
        transport: "manual",
        confidence: null,
      },
    });
  });

  it("annotates pH-only diary evidence without inventing environment measurements", () => {
    const sensors = Object.freeze({ temp: "", humidity: "", ph: "6.2", ec: "" });
    const input = Object.freeze({ ...base, sensors });
    const r = buildPlantQuickLogV2SavePayload(input);
    if (!r.ok) throw new Error("expected valid pH-only snapshot");
    expect(r.payload.p_temperature_c).toBeNull();
    expect(r.payload.p_humidity_pct).toBeNull();
    expect(r.payload.p_vpd_kpa).toBeNull();
    expect(r.payload.p_details).not.toHaveProperty("manual_provenance");
    expect(r.payload.p_details).toMatchObject({
      manual_sensor_snapshot: {
        temp_f: null,
        humidity_percent: null,
        ph: 6.2,
        ec: null,
        source: "manual",
        manual_provenance: {
          source: "manual",
          source_identity: "manual_entry",
          transport: "manual",
          confidence: null,
        },
      },
    });
    expect(buildPlantQuickLogV2SavePayload(input)).toEqual(r);
    expect(sensors).toEqual({ temp: "", humidity: "", ph: "6.2", ec: "" });
  });

  it("puts photo_url in details without expanding the RPC allow-list", () => {
    const r = buildPlantQuickLogV2SavePayload({
      ...base,
      photoUrl: "user-1/grow-1/shot.jpg",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_action).toBe("note");
    expect(r.payload.p_details).toMatchObject({
      photo_url: "user-1/grow-1/shot.jpg",
    });
    expect(r.payload).not.toHaveProperty("p_photo_url");
  });

  it("rejects missing plant, grow, note, or a short idempotency key", () => {
    expect(buildPlantQuickLogV2SavePayload({ ...base, plantId: "  " }).ok).toBe(false);
    expect(buildPlantQuickLogV2SavePayload({ ...base, growId: "" }).ok).toBe(false);
    expect(buildPlantQuickLogV2SavePayload({ ...base, note: "   " }).ok).toBe(false);
    expect(buildPlantQuickLogV2SavePayload({ ...base, idempotencyKey: "short" }).ok).toBe(false);
  });

  it("never writes user_id onto the payload", () => {
    const r = buildPlantQuickLogV2SavePayload(base);
    expect(JSON.stringify(r)).not.toContain("user_id");
  });
});
