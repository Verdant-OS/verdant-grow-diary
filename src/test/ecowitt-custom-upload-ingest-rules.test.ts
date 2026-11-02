import { describe, expect, it } from "vitest";
import {
  ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES,
  customUploadFahrenheitToCelsius,
  ecowittClaimTokenFromPath,
  isCustomUploadPacketStale,
  parseEcowittCustomUploadDateutc,
  planEcowittCustomUploadIngest,
  type EcowittCustomUploadClaim,
  type EcowittCustomUploadPlanInput,
} from "@/lib/ecowittCustomUploadIngestRules";

const NOW = new Date("2026-11-02T18:00:30.000Z");
const PASSKEY = "ab".repeat(16);
const OTHER_PASSKEY = "cd".repeat(16);
const PASSKEY_HASH = "aa".repeat(32);
const OTHER_HASH = "bb".repeat(32);
const TOKEN = "ef".repeat(24);
const OWNER = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";

function claim(overrides: Partial<EcowittCustomUploadClaim> = {}): EcowittCustomUploadClaim {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: OWNER,
    tentId: TENT,
    passkeySha256: null,
    stationtype: null,
    intervalSeconds: 16,
    revokedAt: null,
    lastReceivedAt: null,
    lastCapturedAt: null,
    ...overrides,
  };
}

function fields(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PASSKEY,
    stationtype: "GW1200-fixture",
    dateutc: "2026-11-02 18:00:00",
    tempinf: "72.0",
    humidityin: "55",
    soilmoisture1: "40",
    co2: "800",
    baromin: "29.92",
    ...extra,
  };
}

function input(
  overrides: Partial<EcowittCustomUploadPlanInput> = {},
): EcowittCustomUploadPlanInput {
  return {
    method: "POST",
    pathname: `/ew/${TOKEN}`,
    bodyByteLength: 180,
    fields: fields(),
    claim: claim(),
    entitlement: "allowed",
    now: NOW,
    passkeySha256: PASSKEY_HASH,
    airChannels: [],
    soilChannels: [],
    ...overrides,
  };
}

describe("EcoWitt customized-upload ingest rules", () => {
  it("parses the gateway path without a leading slash in the token", () => {
    expect(ecowittClaimTokenFromPath(`/ew/${TOKEN}`)).toBe(TOKEN);
    expect(ecowittClaimTokenFromPath(`/ew/${TOKEN.toUpperCase()}/`)).toBe(TOKEN);
    expect(ecowittClaimTokenFromPath("/ew/short")).toBeNull();
    expect(ecowittClaimTokenFromPath("/other/path")).toBeNull();
  });

  it("rejects a rolled calendar date and a clock more than five minutes ahead", () => {
    expect(parseEcowittCustomUploadDateutc("2026-02-31 00:00:00")).toBeNull();
    expect(parseEcowittCustomUploadDateutc("2026-11-02 18:00:00")).toBe("2026-11-02T18:00:00Z");
    const future = planEcowittCustomUploadIngest(
      input({ fields: fields({ dateutc: "2026-11-02 18:10:00" }) }),
    );
    expect(future.reason).toBe("dateutc_in_future");
    expect(future.rows).toEqual([]);
    const exactSkew = planEcowittCustomUploadIngest(
      input({
        now: new Date("2026-11-02T18:00:00.000Z"),
        fields: fields({ dateutc: "2026-11-02 18:05:00" }),
      }),
    );
    expect(exactSkew.accepted).toBe(true);
    const tooOld = planEcowittCustomUploadIngest(
      input({ fields: fields({ dateutc: "2026-11-02 17:50:00" }) }),
    );
    expect(tooOld.reason).toBe("dateutc_too_old");
    expect(tooOld.rows).toEqual([]);
    const exactAge = planEcowittCustomUploadIngest(
      input({
        now: new Date("2026-11-02T18:00:30.000Z"),
        fields: fields({ dateutc: "2026-11-02 17:55:30" }),
      }),
    );
    expect(exactAge.accepted).toBe(true);
  });

  it("parses dateutc with a plus between the date and time", () => {
    const plan = planEcowittCustomUploadIngest(
      input({ fields: fields({ dateutc: "2026-11-02+18:00:00" }) }),
    );
    expect(plan.accepted).toBe(true);
    if (plan.accepted) expect(plan.rows[0]?.capturedAt).toBe("2026-11-02T18:00:00Z");
  });

  it("treats -9999 as a missing channel, not a reading", () => {
    const plan = planEcowittCustomUploadIngest(
      input({
        airChannels: [2],
        soilChannels: [2],
        fields: fields({
          temp2f: "-9999",
          humidity2: "55",
          soilmoisture2: "-9999",
          co2: "-9999",
        }),
      }),
    );
    expect(plan.accepted).toBe(true);
    if (!plan.accepted) return;
    expect(plan.rows.map((row) => row.metric)).toEqual(["humidity_pct"]);
  });

  it("stores channel 2 as tent air on a GW1200B packet and drops secrets", () => {
    const plan = planEcowittCustomUploadIngest(
      input({
        airChannels: [2],
        soilChannels: [2, 3, 4],
        fields: fields({
          stationtype: "GW1200B",
          tempinf: "70.0",
          humidityin: "40",
          temp1f: "60.0",
          humidity1: "30",
          temp2f: "72.0",
          humidity2: "55",
          temp3f: "80.0",
          humidity3: "60",
          temp4f: "81.0",
          humidity4: "61",
          temp5f: "82.0",
          humidity5: "62",
          soilmoisture1: "10",
          soilmoisture2: "40",
          soilmoisture3: "41",
          soilmoisture4: "42",
        }),
      }),
    );
    expect(plan.httpStatus).toBe(200);
    expect(plan.accepted).toBe(true);
    const air = plan.rows.find((row) => row.metric === "temperature_c");
    const rh = plan.rows.find((row) => row.metric === "humidity_pct");
    const soil = plan.rows.find((row) => row.metric === "soil_moisture_pct");
    const keys = plan.rows.flatMap((row) =>
      row.rawPayload.channels.map((channel) => channel.rawKey),
    );
    expect(air?.rawPayload.channels[0]?.rawKey).toBe("temp2f");
    expect(air?.rawPayload.channels[0]?.channel).toBe(2);
    expect(air?.value).toBeCloseTo(customUploadFahrenheitToCelsius(72), 2);
    expect(rh?.rawPayload.channels[0]?.rawKey).toBe("humidity2");
    expect(rh?.value).toBe(55);
    expect(soil?.value).toBe(41);
    expect(soil?.rawPayload.channels.map((channel) => channel.channel).sort()).toEqual([2, 3, 4]);
    expect(keys).not.toContain("tempinf");
    expect(keys).not.toContain("humidityin");
    expect(keys).not.toContain("temp1f");
    expect(keys.sort()).toEqual([
      "co2",
      "humidity2",
      "soilmoisture2",
      "soilmoisture3",
      "soilmoisture4",
      "temp2f",
    ]);
    const dedupe = new Set(
      plan.rows.map(
        (row) => `${row.userId}|${row.tentId}|${row.source}|${row.metric}|${row.capturedAt}`,
      ),
    );
    expect(dedupe.size).toBe(plan.rows.length);
    expect(plan.rows.every((row) => row.source === "live" && row.quality === "ok")).toBe(true);
    expect(plan.rows[0]?.capturedAt).toBe("2026-11-02T18:00:00Z");
    expect(plan.rows[0]?.receivedAt).toBe(NOW.toISOString());
    expect(plan.rows.every((row) => row.userId === OWNER && row.tentId === TENT)).toBe(true);
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain(PASSKEY);
    expect(serialized).not.toContain(TOKEN);
    expect(plan.bind).toEqual({ passkeySha256: PASSKEY_HASH, stationtype: "GW1200B" });
  });

  it("ignores a body user id and does not bind a second PASSKEY", () => {
    const mismatched = planEcowittCustomUploadIngest(
      input({
        claim: claim({ passkeySha256: PASSKEY_HASH, stationtype: "GW1200-fixture" }),
        passkeySha256: OTHER_HASH,
        fields: fields({ PASSKEY: OTHER_PASSKEY, user_id: OTHER_USER, tent_id: TENT }),
      }),
    );
    expect(mismatched.reason).toBe("passkey_mismatch");
    expect(mismatched.rows).toEqual([]);
    expect(mismatched.bind).toBeNull();
    expect(JSON.stringify(mismatched)).not.toContain(OTHER_USER);
    // Rotate replaces the claim token. The bound passkey stays; a second PASSKEY does not rebind.
  });

  it("does not store a revoked claim or an unpaid tent", () => {
    const revoked = planEcowittCustomUploadIngest(
      input({ claim: claim({ revokedAt: "2026-11-02T17:00:00.000Z" }) }),
    );
    expect(revoked.reason).toBe("claim_revoked");
    expect(revoked.rows).toEqual([]);
    const unpaid = planEcowittCustomUploadIngest(input({ entitlement: "upgrade_required" }));
    expect(unpaid.reason).toBe("upgrade_required");
    expect(unpaid.bind).toBeNull();
    expect(unpaid.rows).toEqual([]);
  });

  it("stores 0 and 100 percent as suspect and does not invent indoor air", () => {
    const plan = planEcowittCustomUploadIngest(
      input({
        airChannels: [2],
        soilChannels: [2],
        fields: fields({
          temp2f: "72.0",
          humidity2: "100",
          soilmoisture2: "0",
          co2: "12",
        }),
      }),
    );
    expect(plan.accepted).toBe(true);
    expect(plan.rows.find((row) => row.metric === "temperature_c")?.quality).toBe("ok");
    expect(plan.rows.find((row) => row.metric === "humidity_pct")?.quality).toBe("suspect");
    expect(plan.rows.find((row) => row.metric === "humidity_pct")?.value).toBe(100);
    expect(plan.rows.find((row) => row.metric === "soil_moisture_pct")?.quality).toBe("suspect");
    expect(plan.rows.find((row) => row.metric === "soil_moisture_pct")?.value).toBe(0);
    const indoorOnly = planEcowittCustomUploadIngest(
      input({
        airChannels: [2],
        soilChannels: [2],
        fields: fields({
          tempinf: "72.0",
          humidityin: "55",
          temp2f: "",
          humidity2: "",
          soilmoisture2: "",
          co2: "",
        }),
      }),
    );
    expect(indoorOnly.reason).toBe("no_storable_metrics");
    expect(JSON.stringify(indoorOnly.rows)).not.toContain("tempinf");
    expect(indoorOnly.bind).toBeNull();
  });

  it("keeps air channels 1 and 8, drops 51 C, and routes soil without air", () => {
    const ends = planEcowittCustomUploadIngest(
      input({
        airChannels: [1, 8],
        soilChannels: [],
        fields: fields({
          temp1f: "68",
          humidity1: "40",
          temp8f: "70",
          humidity8: "41",
          temp2f: "75",
          co2: "",
        }),
      }),
    );
    const airChannels = ends.rows
      .find((row) => row.metric === "temperature_c")
      ?.rawPayload.channels.map((channel) => channel.channel)
      .sort();
    expect(airChannels).toEqual([1, 8]);
    const hot = planEcowittCustomUploadIngest(
      input({
        airChannels: [2],
        soilChannels: [],
        fields: fields({ temp2f: "140", humidity2: "", co2: "" }),
      }),
    );
    expect(hot.reason).toBe("no_storable_metrics");
    const soilOnly = planEcowittCustomUploadIngest(
      input({
        airChannels: [],
        soilChannels: [3],
        fields: fields({ temp2f: "72", soilmoisture3: "33", co2: "" }),
      }),
    );
    expect(soilOnly.rows.map((row) => row.metric)).toEqual(["soil_moisture_pct"]);
    expect(soilOnly.rows[0]?.rawPayload.channels[0]?.channel).toBe(3);
  });

  it("rate-limits a packet inside the minimum gap and caps the body", () => {
    const limited = planEcowittCustomUploadIngest(
      input({
        claim: claim({ lastReceivedAt: "2026-11-02T18:00:25.000Z" }),
      }),
    );
    expect(limited.reason).toBe("rate_limited");
    expect(limited.rows).toEqual([]);
    const repeatedInsideGap = planEcowittCustomUploadIngest(
      input({
        claim: claim({
          lastReceivedAt: "2026-11-02T18:00:25.000Z",
          lastCapturedAt: "2026-11-02T18:00:00.000Z",
        }),
      }),
    );
    expect(repeatedInsideGap.reason).toBe("rate_limited");
    const duplicate = planEcowittCustomUploadIngest(
      input({
        claim: claim({
          lastReceivedAt: "2026-11-02T17:00:00.000Z",
          lastCapturedAt: "2026-11-02T18:00:00.000Z",
        }),
      }),
    );
    expect(duplicate.reason).toBe("duplicate_captured_at");
    expect(duplicate.rows).toEqual([]);
    expect(duplicate.bind).toBeNull();
    const sameInstant = planEcowittCustomUploadIngest(
      input({
        claim: claim({
          lastReceivedAt: "2026-11-02T17:00:00.000Z",
          lastCapturedAt: "2026-11-02T18:00:00Z",
        }),
      }),
    );
    expect(sameInstant.reason).toBe("duplicate_captured_at");
    const huge = planEcowittCustomUploadIngest(
      input({ bodyByteLength: ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES + 1, fields: null }),
    );
    expect(huge.reason).toBe("payload_too_large");
  });

  it("marks a station stale after three intervals and leaves a fresh packet live", () => {
    expect(isCustomUploadPacketStale("2026-11-02T17:58:00.000Z", 16, NOW)).toBe(true);
    expect(isCustomUploadPacketStale("2026-11-02T18:00:00.000Z", 16, NOW)).toBe(false);
    expect(isCustomUploadPacketStale(null, 16, NOW)).toBe(false);
  });
});
