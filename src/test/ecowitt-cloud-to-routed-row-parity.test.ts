import { describe, it, expect } from "vitest";
import {
  normalizeEcowittCloudReadings,
  type EcowittCloudMappingConfig,
} from "@/lib/ecowittPayloadRules";
import {
  adaptEcowittCloudRowsToRoutedShape,
  type EcowittCloudAdapterRow,
} from "@/lib/ecowittCloudRowAdapter";

// ---------- Fixtures (synthetic, no real secrets) ----------
const FAKE_MAC = "AA:BB:CC:00:11:22";
const FAKE_TENT_AIR_1 = "11111111-1111-1111-1111-111111111111";
const FAKE_TENT_SOIL_2 = "22222222-2222-2222-2222-222222222222";
const FAKE_USER = "user-test-0001";
const FAKE_FP = "fp_redacted_test_value_0001";

const MAPPING: EcowittCloudMappingConfig = {
  byMac: {
    [FAKE_MAC.toUpperCase()]: {
      air: { 1: FAKE_TENT_AIR_1 },
      soil: { 2: FAKE_TENT_SOIL_2 },
    },
  },
};

const NOW = new Date("2026-06-05T12:00:00Z");

function liveAirPayload() {
  return {
    PASSKEY: "REDACTED_NOT_USED_HERE",
    MAC: FAKE_MAC,
    dateutc: "2026-06-05 11:59:30",
    temp1f: 75.2,
    humidity1: 55,
  };
}

function stalePayload() {
  return {
    MAC: FAKE_MAC,
    dateutc: "2026-06-04 00:00:00", // > stale window
    temp1f: 70,
    humidity1: 50,
  };
}

function invalidSoilStuckPayload() {
  return {
    MAC: FAKE_MAC,
    dateutc: "2026-06-05 11:59:30",
    soilmoisture2: 100, // stuck-at-extreme triggers invalid per slice-1 contract
  };
}

function unmappedChannelPayload() {
  return {
    MAC: FAKE_MAC,
    dateutc: "2026-06-05 11:59:30",
    temp7f: 72, // channel 7 has no mapping
  };
}

function ecLookingPayload() {
  return {
    MAC: FAKE_MAC,
    dateutc: "2026-06-05 11:59:30",
    temp1f: 72,
    humidity1: 50,
    soilec1: 1.23,
  };
}

function adapt(payload: Record<string, unknown>) {
  const norm = normalizeEcowittCloudReadings(payload, MAPPING, { now: NOW });
  const adapted = adaptEcowittCloudRowsToRoutedShape({
    userId: FAKE_USER,
    passkeyFingerprint: FAKE_FP,
    rows: norm.rows,
  });
  return { norm, adapted };
}

describe("ecowitt cloud → routed row parity", () => {
  it("mapped live air reading becomes a row with the routed shape", () => {
    const { adapted } = adapt(liveAirPayload());
    expect(adapted.skipped).toEqual([]);
    expect(adapted.rows.length).toBe(2);

    const temp = adapted.rows.find((r) => r.metric === "temperature_c") as EcowittCloudAdapterRow;
    expect(temp).toBeDefined();
    expect(temp.user_id).toBe(FAKE_USER);
    expect(temp.tent_id).toBe(FAKE_TENT_AIR_1);
    expect(temp.source).toBe("ecowitt");
    expect(temp.quality).toBe("ok");
    expect(temp.captured_at).toBe("2026-06-05T11:59:30.000Z");
    expect(temp.raw_payload.provider).toBe("ecowitt");
    expect(temp.raw_payload.mapping_type).toBe("air");
    expect(temp.raw_payload.channel).toBe(1);
    expect(temp.raw_payload.raw_key).toBe("temp1f");
    expect(temp.raw_payload.status).toBe("live");
    expect(temp.raw_payload.passkey_fingerprint).toBe(FAKE_FP);
    expect(typeof temp.raw_payload.confidence).toBe("number");
  });

  it("unmapped channel is not persisted as assigned (zero adapted rows, unmapped reported)", () => {
    const { norm, adapted } = adapt(unmappedChannelPayload());
    expect(adapted.rows).toEqual([]);
    expect(norm.unmapped.some((u) => u.channel === 7)).toBe(true);
  });

  it("stale status is preserved through the adapter", () => {
    const { adapted } = adapt(stalePayload());
    expect(adapted.rows.length).toBeGreaterThan(0);
    for (const r of adapted.rows) {
      expect(r.raw_payload.status).toBe("stale");
      // Stale is not invalid — quality stays ok unless suspicion fired.
      expect(["ok", "suspect"]).toContain(r.quality);
    }
  });

  it("invalid status is preserved and surfaces as quality=invalid", () => {
    const { adapted } = adapt(invalidSoilStuckPayload());
    expect(adapted.rows.length).toBe(1);
    const row = adapted.rows[0];
    expect(row.metric).toBe("soil_moisture_pct");
    expect(row.tent_id).toBe(FAKE_TENT_SOIL_2);
    expect(row.raw_payload.status).toBe("invalid");
    expect(row.quality).toBe("invalid");
  });

  it("never invents EC metric for EcoWitt", () => {
    const { adapted } = adapt(ecLookingPayload());
    for (const r of adapted.rows) {
      expect(r.metric).not.toMatch(/ec/i);
      expect(r.raw_payload.raw_key).not.toMatch(/^soilec/);
    }
    const json = JSON.stringify(adapted);
    expect(json).not.toMatch(/"soil_ec"/);
    expect(json).not.toMatch(/"ec_mscm"/);
    expect(json).not.toMatch(/"electrical_conductivity"/);
  });

  it("does not leak raw MAC or PASSKEY in any row or its raw_payload", () => {
    const { adapted } = adapt(liveAirPayload());
    const json = JSON.stringify(adapted);
    // Raw colon-formatted MAC must not appear.
    expect(json).not.toContain(FAKE_MAC);
    // Compact MAC must not appear in full either.
    expect(json).not.toContain(FAKE_MAC.replace(/:/g, ""));
    // PASSKEY token from payload must not appear.
    expect(json).not.toContain("REDACTED_NOT_USED_HERE");
    // Only the last-4 suffix is surfaced.
    for (const r of adapted.rows) {
      expect(r.raw_payload.device_mac_suffix).toBe("1122");
    }
  });

  it("preserves captured_at, tent_id mapping, and confidence per row", () => {
    const { norm, adapted } = adapt(liveAirPayload());
    expect(adapted.rows.length).toBe(norm.rows.length);
    for (let i = 0; i < adapted.rows.length; i++) {
      expect(adapted.rows[i].tent_id).toBe(norm.rows[i].tent_id);
      expect(adapted.rows[i].captured_at).toBe(norm.rows[i].reading.captured_at);
      expect(adapted.rows[i].raw_payload.confidence).toBe(norm.rows[i].confidence);
      expect(adapted.rows[i].raw_payload.suspicion_codes).toEqual(
        norm.rows[i].suspicion_codes,
      );
    }
  });

  it("adapter output is pure — no Date.now, identical input gives identical output", () => {
    const a = adapt(liveAirPayload()).adapted;
    const b = adapt(liveAirPayload()).adapted;
    expect(b).toEqual(a);
  });
});
