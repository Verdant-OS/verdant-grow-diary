import { describe, it, expect } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  quickLogToTypedEventPayload,
  mapWateringPayloadToCreateWateringEventArgs,
  getTypedEventWriteReadiness,
} from "@/lib/quickLogTypedEventPayloadRules";

type Functions = Database["public"]["Functions"];

// Compile-time + runtime contract: the watering RPC must be present in
// generated types with the expected argument shape and return type.
describe("typed event RPC contract", () => {
  it("create_watering_event exists in generated Supabase Functions map", () => {
    type HasWatering = "create_watering_event" extends keyof Functions
      ? true
      : false;
    const present: HasWatering = true;
    expect(present).toBe(true);
  });

  it("create_watering_event Args includes all expected fields", () => {
    type Args = Functions["create_watering_event"]["Args"];
    // Touch each expected field at the type level; if any are missing the
    // file will fail to compile.
    const sample: Args = {
      _grow_id: "g",
      _volume_ml: 1,
    };
    sample._tent_id = "t";
    sample._plant_id = "p";
    sample._occurred_at = "2026-05-21T00:00:00Z";
    sample._note = "n";
    sample._ph = 6;
    sample._ec_ms_cm = 1.2;
    sample._runoff_ml = 100;
    sample._runoff_ph = 6.5;
    sample._runoff_ec = 1.5;
    sample._water_temp_c = 21;
    expect(sample._grow_id).toBe("g");
  });

  it("create_watering_event returns a string (uuid-compatible)", () => {
    type Ret = Functions["create_watering_event"]["Returns"];
    const x: Ret = "00000000-0000-0000-0000-000000000000";
    expect(typeof x).toBe("string");
  });

  it("missing create_* RPCs are not present in generated types", () => {
    type HasFeeding = "create_feeding_event" extends keyof Functions ? true : false;
    type HasPhoto = "create_photo_event" extends keyof Functions ? true : false;
    type HasObs = "create_observation_event" extends keyof Functions ? true : false;
    type HasTraining = "create_training_event" extends keyof Functions ? true : false;
    type HasEnv = "create_environment_event" extends keyof Functions ? true : false;
    const feeding: HasFeeding = false;
    const photo: HasPhoto = false;
    const obs: HasObs = false;
    const training: HasTraining = false;
    const env: HasEnv = false;
    expect([feeding, photo, obs, training, env]).toEqual([
      false, false, false, false, false,
    ]);
  });
});

describe("getTypedEventWriteReadiness", () => {
  it("returns rpc_available only for watering", () => {
    expect(getTypedEventWriteReadiness("watering")).toBe("rpc_available");
    for (const t of [
      "feeding",
      "photo",
      "observation",
      "training",
      "environment",
    ]) {
      expect(getTypedEventWriteReadiness(t)).toBe("rpc_missing");
    }
  });

  it("returns rpc_missing for unknown event types", () => {
    expect(getTypedEventWriteReadiness("teleport")).toBe("rpc_missing");
  });
});

const baseDraft = {
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  occurred_at: "2026-05-21T12:00:00.000Z",
  note: "ok",
};

describe("mapWateringPayloadToCreateWateringEventArgs", () => {
  it("maps adapter watering output to RPC args", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: {
        watering_amount_ml: 500,
        ph: 6.2,
        ec: 1.4,
        runoff_ml: 100,
        runoff_ph: 6.5,
        runoff_ec: 1.8,
      },
    });
    const args = mapWateringPayloadToCreateWateringEventArgs(r);
    expect(args).toEqual({
      _grow_id: "grow-1",
      _volume_ml: 500,
      _tent_id: "tent-1",
      _plant_id: "plant-1",
      _occurred_at: "2026-05-21T12:00:00.000Z",
      _note: "ok",
      _ph: 6.2,
      _ec_ms_cm: 1.4,
      _runoff_ml: 100,
      _runoff_ph: 6.5,
      _runoff_ec: 1.8,
    });
  });

  it("maps runoff_ec_ms_cm payload field to _runoff_ec RPC arg", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_ml: 100, runoff_ec: 2.1 },
    });
    const args = mapWateringPayloadToCreateWateringEventArgs(r);
    expect(args?._runoff_ec).toBe(2.1);
    // adapter must not leak the long-form key into RPC args
    expect((args as unknown as Record<string, unknown>)?.runoff_ec_ms_cm).toBeUndefined();
  });

  it("returns null for non-watering results", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "environment",
      details: { temperature_c: 22 },
    });
    expect(mapWateringPayloadToCreateWateringEventArgs(r)).toBeNull();
  });

  it("returns null for failed adapter results", () => {
    const r = quickLogToTypedEventPayload({
      event_type: "watering",
      details: { watering_amount_ml: 100 },
    });
    expect(mapWateringPayloadToCreateWateringEventArgs(r)).toBeNull();
  });
});

describe("adapter tightening", () => {
  it("watering volume 0 is refused", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_ml: 0 },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("volume:required-positive");
  });

  it("watering with no volume is refused", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: {},
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("volume:required-positive");
  });

  it("observation invalid severity is refused", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "observation",
      details: { severity: "moderate" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("severity:invalid");
  });

  it("observation accepts canonical severities", () => {
    for (const sev of ["info", "watch", "warn", "critical"]) {
      const r = quickLogToTypedEventPayload({
        ...baseDraft,
        event_type: "observation",
        details: { severity: sev },
      });
      expect(r.ok).toBe(true);
    }
  });

  it("training invalid technique is refused", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: { technique: "LST" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("technique:invalid");
  });

  it("training invalid intensity is refused", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: { technique: "lst", intensity: "hard" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("intensity:invalid");
  });

  it("training affected_nodes must be integer/null, not string[]", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: { technique: "lst", affected_nodes: ["n1", "n2"] },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("affected_nodes:invalid");
  });

  it("training accepts integer affected_nodes", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: { technique: "topping", affected_nodes: 4 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.payload.affected_nodes).toBe(4);
  });

  it("missing occurred_at becomes null (no epoch-0 fabrication)", () => {
    const r = quickLogToTypedEventPayload({
      grow_id: "grow-1",
      event_type: "watering",
      details: { watering_amount_ml: 100 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parent.occurred_at).toBeNull();
    const args = mapWateringPayloadToCreateWateringEventArgs(r);
    expect(args?._occurred_at).toBeUndefined();
  });

  it("does not leak raw payload values in tightened error reasons", () => {
    const secret = "ULTRA_SECRET_LEAK_PROBE_XYZ";
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: { technique: secret },
    });
    expect(r.ok).toBe(false);
    const reason = (r as { reason?: string }).reason ?? "";
    expect(reason).not.toContain(secret);
  });
});
