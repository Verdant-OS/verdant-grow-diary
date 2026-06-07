import { describe, expect, it } from "vitest";
import {
  buildEcowittLocalTestPayload,
  redactBridgeToken,
  FORBIDDEN_TEST_PAYLOAD_KEYS,
  ECOWITT_LOCAL_TEST_SOURCE,
  ECOWITT_LOCAL_TEST_VENDOR,
} from "@/lib/ecowittLocalTestPayloadRules";

const NOW = new Date("2026-06-07T12:00:00Z");
const TENT = "11111111-1111-4111-8111-111111111111";
const PLANT = "22222222-2222-4222-8222-222222222222";

describe("buildEcowittLocalTestPayload", () => {
  it("builds a valid EcoWitt payload with provider/source ecowitt", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT, now: NOW });
    expect(p.source).toBe(ECOWITT_LOCAL_TEST_SOURCE);
    expect(p.vendor).toBe(ECOWITT_LOCAL_TEST_VENDOR);
    expect(p.tent_id).toBe(TENT);
    expect(p.captured_at).toBe(NOW.toISOString());
    expect(p.metrics.temp_f).toBe(78.6);
    expect(p.metrics.humidity_pct).toBe(56.2);
    expect(p.metrics.vpd_kpa).toBe(1.46);
    expect(p.metrics.co2_ppm).toBe(966);
  });

  it("omits plant_id when not supplied and includes it when supplied", () => {
    const a = buildEcowittLocalTestPayload({ tentId: TENT, now: NOW });
    expect(a.metadata.plant_id).toBeUndefined();
    const b = buildEcowittLocalTestPayload({ tentId: TENT, plantId: PLANT, now: NOW });
    expect(b.metadata.plant_id).toBe(PLANT);
  });

  it("preserves raw_payload with transport=mqtt_local_test", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT, now: NOW });
    expect(p.raw_payload.transport).toBe("mqtt_local_test");
    expect(p.raw_payload.stationtype).toBe("GW1200");
    expect(p.raw_payload.source).toBe("local_test_sender");
  });

  it("invalid mode emits impossible temp/VPD and marks invalid_test", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT, now: NOW, invalid: true });
    expect(p.metrics.temp_f).toBe(7431);
    expect(p.metrics.vpd_kpa).toBe(999999);
    expect(p.metadata.invalid_test).toBe(true);
    expect(p.raw_payload.invalid_test).toBe(true);
  });

  it("always flags test_sender so this never looks like production live data", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT, now: NOW });
    expect(p.metadata.test_sender).toBe(true);
    expect(p.raw_payload.test_sender).toBe(true);
  });

  it("never includes device-control, user_id, or action_queue fields", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT, plantId: PLANT, now: NOW });
    const flat = JSON.stringify(p);
    for (const k of FORBIDDEN_TEST_PAYLOAD_KEYS) {
      expect(flat.toLowerCase()).not.toContain(k);
    }
  });

  it("captured_at is a valid ISO string", () => {
    const p = buildEcowittLocalTestPayload({ tentId: TENT });
    expect(Number.isFinite(Date.parse(p.captured_at))).toBe(true);
  });
});

describe("redactBridgeToken", () => {
  it("never returns the raw token", () => {
    const t = "vbt_abcdefghijklmnop_secret_tail";
    const out = redactBridgeToken(t);
    expect(out).not.toContain("secret_tail");
    expect(out).not.toContain("abcdefghij");
    expect(out.startsWith("vbt_")).toBe(true);
    expect(out).toContain("redacted");
  });

  it("handles empty/null", () => {
    expect(redactBridgeToken("")).toBe("(none)");
    expect(redactBridgeToken(null)).toBe("(none)");
    expect(redactBridgeToken(undefined)).toBe("(none)");
  });
});

describe("module purity", () => {
  it("does not import supabase and does not emit action_queue payload fields", async () => {
    const mod = await import("@/lib/ecowittLocalTestPayloadRules");
    expect(Object.keys(mod)).not.toContain("supabase");
    const payload = mod.buildEcowittLocalTestPayload({ tentId: TENT, now: NOW });
    expect(JSON.stringify(payload)).not.toMatch(/action_queue/i);
  });
});
