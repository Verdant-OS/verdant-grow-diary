import { describe, it, expect } from "vitest";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import type { EcoWittRouterEligibleTent } from "@/lib/ecowittChannelTentRouter";

const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const NOW = "2026-06-04T12:30:00.000Z";
const FP_A = "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa";
const FP_B = "ewfp_bbbbbbbbbbbbbbbbbbbbbbbb";

const tentAir: EcoWittRouterEligibleTent = {
  tent_id: "11111111-1111-1111-1111-111111111111",
  passkey_fingerprint: FP_A,
  air_channels: [1, 2],
  soil_channels: [],
};
const tentSoil: EcoWittRouterEligibleTent = {
  tent_id: "22222222-2222-2222-2222-222222222222",
  passkey_fingerprint: FP_A,
  air_channels: [],
  soil_channels: [3, 4],
};

const FORBIDDEN_RAW_VALUES = [
  "AAAA-SECRET",
  "AA:BB:CC:DD:EE:FF",
  "client-supplied-uid",
];

function assertRowSafety(rows: ReturnType<typeof buildEcoWittRoutedRows>["rows"]) {
  for (const r of rows) {
    const s = JSON.stringify(r);
    for (const v of FORBIDDEN_RAW_VALUES) {
      expect(s).not.toContain(v);
    }
    // raw_payload must not contain any credential-bearing key. The ONLY
    // passkey-related field permitted is the safe one-way fingerprint.
    const rpKeys = Object.keys(r.raw_payload);
    for (const k of rpKeys) {
      expect(k).not.toMatch(/^(passkey|mac|api_key|application_key|token|auth|service_role)$/i);
    }
    expect(r.raw_payload).toMatchObject({
      provider: "ecowitt",
      passkey_fingerprint: expect.stringMatching(/^ewfp_[0-9a-f]{24}$/),
    });
    expect(rpKeys.sort()).toEqual(
      expect.arrayContaining(["channel", "mapping_type", "passkey_fingerprint", "provider", "raw_key", "raw_value"]),
    );
  }
}

describe("buildEcoWittRoutedRows — edge wiring contract", () => {
  it("(1) air channel inserts temp + humidity rows for the air tent", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { PASSKEY: "ignored-here", temp1f: "77", humidity1: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    const airRows = rows.filter((r) => r.tent_id === tentAir.tent_id);
    // temperature_c + humidity_pct + derived vpd_kpa
    expect(airRows.map((r) => r.metric).sort()).toEqual([
      "humidity_pct",
      "temperature_c",
      "vpd_kpa",
    ]);
    expect(rows.find((r) => r.metric === "temperature_c")?.value).toBe(25);
    expect(summary.per_tent).toEqual([{ tent_id: tentAir.tent_id, rows: 3 }]);
    assertRowSafety(rows);
  });

  it("(2) soil channel inserts soil_moisture row for the soil tent", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { soilmoisture3: "40" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tent_id: tentSoil.tent_id,
      metric: "soil_moisture_pct",
      value: 40,
      raw_payload: { mapping_type: "soil", channel: 3, raw_key: "soilmoisture3" },
    });
    assertRowSafety(rows);
  });

  it("(3) air and soil channels can map to different tents", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp2f: "68", humidity2: "60", soilmoisture4: "33" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    const byTent = new Map(summary.per_tent.map((x) => [x.tent_id, x.rows]));
    expect(byTent.get(tentAir.tent_id)).toBe(3); // temp + RH + VPD
    expect(byTent.get(tentSoil.tent_id)).toBe(1); // soil
    assertRowSafety(rows);
  });

  it("(4) VPD is inserted ONLY when same air channel has valid temp + RH", () => {
    const tempOnly = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    expect(tempOnly.rows.some((r) => r.metric === "vpd_kpa")).toBe(false);

    const rhOnly = buildEcoWittRoutedRows({
      userId: USER,
      payload: { humidity1: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    expect(rhOnly.rows.some((r) => r.metric === "vpd_kpa")).toBe(false);

    // Different channels (temp on 1, RH on 2) must NOT combine.
    const crossChannel = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity2: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    expect(crossChannel.rows.some((r) => r.metric === "vpd_kpa")).toBe(false);

    // Same channel produces VPD.
    const same = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    const vpd = same.rows.find((r) => r.metric === "vpd_kpa");
    expect(vpd?.value).toBeGreaterThan(0);
    expect(vpd?.raw_payload.calculated).toBe(true);
  });

  it("(5)+(6) malformed and out-of-range values are skipped, never inserted", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        temp1f: "not-a-number",
        humidity1: "150",
        soilmoisture3: "-5",
        temp2f: "NaN",
      },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    expect(rows).toEqual([]);
  });

  it("(7) missing PASSKEY → 0 rows, accepted false, dropped no_passkey_in_payload", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77" },
      payloadPasskeyFingerprint: null,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    expect(rows).toEqual([]);
    expect(summary.accepted).toBe(false);
    expect(summary.dropped[0].reason).toBe("no_passkey_in_payload");
  });

  it("(8) unmapped PASSKEY → 0 rows, accepted false, fingerprint_mismatch", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77" },
      payloadPasskeyFingerprint: FP_B,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    expect(rows).toEqual([]);
    expect(summary.accepted).toBe(false);
    expect(summary.dropped[0].reason).toBe("fingerprint_mismatch");
    // matched_fingerprint surfaces the *payload's* fingerprint for audit only.
    expect(summary.matched_fingerprint).toBe(FP_B);
  });

  it("(9) unmapped air channel inserts 0 air rows", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp7f: "70", humidity7: "50" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    expect(rows).toEqual([]);
    expect(summary.dropped.every((d) => d.reason === "no_eligible_tent_for_channel")).toBe(true);
  });

  it("(10) unmapped soil channel inserts 0 soil rows", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { soilmoisture8: "20" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    expect(rows).toEqual([]);
  });

  it("(11) inserted rows never contain raw PASSKEY / MAC / token / client user_id", () => {
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY: "AAAA-SECRET",
        MAC: "AA:BB:CC:DD:EE:FF",
        api_key: "shhh",
        token: "shhh",
        auth: "shhh",
        user_id: "client-supplied-uid",
        temp1f: "77",
        humidity1: "50",
      },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir],
      capturedAt: NOW,
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("AAAA-SECRET");
    expect(serialized).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(serialized).not.toContain("client-supplied-uid");
    // user_id on the row MUST be the server-authoritative one, never the
    // client-supplied value.
    for (const r of rows) expect(r.user_id).toBe(USER);
    assertRowSafety(rows);
  });

  it("(13) builder never emits alert / action_queue / AI / automation / device language", () => {
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50", soilmoisture3: "40" },
      payloadPasskeyFingerprint: FP_A,
      eligibleTents: [tentAir, tentSoil],
      capturedAt: NOW,
    });
    const blob = JSON.stringify({ rows, summary }).toLowerCase();
    for (const word of [
      "alert",
      "action_queue",
      "ai_doctor",
      "automation",
      "device_control",
      "relay",
      "setpoint",
      "service_role",
    ]) {
      expect(blob).not.toContain(word);
    }
  });
});
