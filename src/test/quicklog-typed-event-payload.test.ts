import { describe, it, expect } from "vitest";
import {
  quickLogToTypedEventPayload,
  TYPED_EVENT_SCHEMA_VERSION,
} from "@/lib/quickLogTypedEventPayloadRules";

const baseDraft = {
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  occurred_at: "2026-05-21T12:00:00.000Z",
  note: "ok",
};

describe("quickLogToTypedEventPayload", () => {
  it("maps watering draft correctly", () => {
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
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parent).toMatchObject({
      grow_id: "grow-1",
      event_type: "watering",
      source: "manual",
      occurred_at: "2026-05-21T12:00:00.000Z",
      schema_version: TYPED_EVENT_SCHEMA_VERSION,
    });
    expect(r.subtype.kind).toBe("watering");
    expect(r.subtype.payload).toEqual({
      volume_ml: 500,
      ph: 6.2,
      ec_ms_cm: 1.4,
      runoff_ml: 100,
      runoff_ph: 6.5,
      runoff_ec_ms_cm: 1.8,
    });
  });

  it("maps watering volume from liters", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_l: 1.5 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.payload.volume_ml).toBe(1500);
  });

  it("maps feeding draft correctly", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "feeding",
      details: {
        ph: 6.0,
        ec: 2.0,
        watering_amount_ml: 1000,
        nutrient_brand: "BrandX",
        recipe: { partA: 5, partB: 5 },
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.kind).toBe("feeding");
    expect(r.subtype.payload).toEqual({
      ph: 6.0,
      ec_ms_cm: 2.0,
      volume_ml: 1000,
      nutrient_brand: "BrandX",
      recipe: { partA: 5, partB: 5 },
    });
  });

  it("maps photo draft correctly", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "photo",
      photo_url: "https://example.com/p.jpg",
      note: "leaf",
      details: { taken_at: "2026-05-20T10:00:00Z" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.kind).toBe("photo");
    expect(r.subtype.payload).toEqual({
      photo_url: "https://example.com/p.jpg",
      caption: "leaf",
      taken_at: "2026-05-20T10:00:00.000Z",
    });
  });

  it("maps observation draft correctly", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "observation",
      details: {
        symptom_type: ["yellowing", "spots"],
        severity: "moderate",
        affected_area: "lower fan leaves",
        details: "spreading slowly",
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.kind).toBe("observation");
    expect(r.subtype.payload).toEqual({
      symptom_type: ["yellowing", "spots"],
      severity: "warn",
      affected_area: "lower fan leaves",
      details: "spreading slowly",
    });
  });

  it("maps training draft correctly", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "training",
      details: {
        technique: "lst",
        intensity: "light",
        affected_nodes: 3,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.kind).toBe("training");
    expect(r.subtype.payload).toEqual({
      technique: "lst",
      intensity: "light",
      affected_nodes: 3,
    });
  });

  it("maps environment draft correctly", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "environment",
      details: {
        temperature_c: 24,
        humidity_pct: 55,
        vpd_kpa: 1.1,
        co2_ppm: 800,
        light_on: true,
        light_hours: 18,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.kind).toBe("environment");
    expect(r.subtype.payload).toEqual({
      temperature_c: 24,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      co2_ppm: 800,
      light_on: true,
      light_hours: 18,
    });
  });

  it("fails when grow_id missing", () => {
    const r = quickLogToTypedEventPayload({
      event_type: "watering",
      details: {},
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("grow_id:missing");
  });

  it("fails on unknown event type", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "teleport",
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("event_type:unknown");
  });

  it("fails on invalid pH", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { ph: "banana" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("ph:invalid");
  });

  it("fails on out-of-range pH (never silently coerces)", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { ph: 99 },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("ph:out-of-range");
  });

  it("fails on invalid EC", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "feeding",
      details: { ec: "x" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("ec:invalid");
  });

  it("fails on invalid volume", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_ml: "not-a-number" },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("volume:invalid");
  });

  it("fails on invalid humidity", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "environment",
      details: { humidity_pct: 250 },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("humidity_pct:out-of-range");
  });

  it("fails on invalid light_hours", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "environment",
      details: { light_hours: 99 },
    });
    expect(r.ok).toBe(false);
    expect((r as { reason?: string }).reason).toBe("light_hours:out-of-range");
  });

  it("preserves unknown extras under extras key", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_ml: 100, someUnknown: "keep-me", n: 7 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtype.payload.extras).toEqual({ someUnknown: "keep-me", n: 7 });
  });

  it("is deterministic for the same input", () => {
    const input = {
      ...baseDraft,
      event_type: "watering",
      details: { watering_amount_ml: 250, ph: 6.1, ec: 1.2 },
    };
    const a = quickLogToTypedEventPayload(input);
    const b = quickLogToTypedEventPayload(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not leak raw payload values in error/warning strings", () => {
    const secret = "SECRET_VALUE_123_DO_NOT_LEAK";
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: { ph: secret, watering_amount_ml: secret },
    });
    expect(r.ok).toBe(false);
    const fail = r as { reason: string; warnings: string[] };
    expect(fail.reason).not.toContain(secret);
    for (const w of fail.warnings) {
      expect(w).not.toContain(secret);
    }
  });

  it("does not import Supabase or RPC modules", async () => {
    const src = await import("fs").then((m) =>
      m.readFileSync("src/lib/quickLogTypedEventPayloadRules.ts", "utf8"),
    );
    expect(src).not.toMatch(/from\s+["'].*supabase/i);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/from\s+["']react["']/);
  });

  it("is additive only — does not reference diary_entries shape", async () => {
    const src = await import("fs").then((m) =>
      m.readFileSync("src/lib/quickLogTypedEventPayloadRules.ts", "utf8"),
    );
    expect(src).not.toMatch(/diary_entries/);
  });

  it("omits user_id when not provided", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      event_type: "watering",
      details: {},
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parent.user_id).toBeUndefined();
  });

  it("includes user_id when provided", () => {
    const r = quickLogToTypedEventPayload({
      ...baseDraft,
      user_id: "user-1",
      event_type: "watering",
      details: {},
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parent.user_id).toBe("user-1");
  });
});
