/**
 * Behaviour of scripts/dev/ecowitt-ingest-forwarder.ts: the PC-side step that
 * forwards bridge-published gateway uploads to the `ecowitt-ingest` edge
 * function. Dry-run must never touch the network; live must fail closed on
 * bad config, send exactly one bearer-authenticated JSON POST per message,
 * and never leak PASSKEY / MAC / token into logs or reports.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildForwardRequest,
  handleMessage,
  liveConfigProblems,
  onceExitCode,
  parseFlags,
  prepareForwardPayload,
  readEnv,
  redactForLog,
  summarizeResponse,
  type ForwarderEnv,
  type ForwarderFlags,
} from "../../scripts/dev/ecowitt-ingest-forwarder";

// Fake credentials, assembled at runtime so nothing in this file reads as a real one.
const FAKE_PASSKEY = ["FAKE", "TEST", "PASSKEY", "NOT", "REAL"].join("_");
const FAKE_BRIDGE_TOKEN = ["vbt", "FAKE_TEST_TOKEN_0123456789"].join("_");
const NOT_A_BRIDGE_TOKEN = ["sk", "live", "not_a_bridge_token"].join("_");
const INGEST_URL = "https://example-ref.supabase.co/functions/v1/ecowitt-ingest";

// Shape of a GW3000B upload after the HTTP bridge wrapped it.
const GATEWAY_MESSAGE = JSON.stringify({
  PASSKEY: FAKE_PASSKEY,
  stationtype: "GW3000B_V1.2.4",
  dateutc: "2026-10-22 05:27:14",
  tempinf: 69.26,
  humidityin: 54,
  temp1f: 69.62,
  humidity1: 54,
  temp2f: 81.68,
  humidity2: 72,
  temp3f: 77.18,
  humidity3: 46,
  temp5f: 75.2,
  humidity5: 73,
  soilmoisture2: 40,
  soilmoisture5: 44,
  soilmoisture6: 0,
  soilmoisture8: 0,
  soil_ec_hum1: 22,
  model: "GW3000B",
  interval: 60,
  received_at: "2026-10-22T05:27:13.830Z",
  transport: "ecowitt_http_local_bridge",
  topic: "ecowitt/grow",
});

// The runbook's hand-made sanity POST: no PASSKEY, no dateutc.
const SANITY_MESSAGE = JSON.stringify({
  temp1f: 77.4,
  humidity1: 58,
  soilmoisture1: 33,
  co2: 721,
  received_at: "2026-10-22T05:26:37.439Z",
  transport: "ecowitt_http_local_bridge",
  topic: "ecowitt/grow",
});

const LIVE_ENV: ForwarderEnv = {
  ingestUrl: INGEST_URL,
  token: FAKE_BRIDGE_TOKEN,
  mqttUsername: null,
  mqttPassword: null,
};

const flags = (over: Partial<ForwarderFlags> = {}): ForwarderFlags => ({
  live: false,
  once: false,
  writeReport: false,
  topic: "ecowitt/grow",
  mqttUrl: "mqtt://127.0.0.1:1883",
  ...over,
});

describe("flags and env", () => {
  it("is dry-run by default and reads the documented defaults", () => {
    const f = parseFlags([], {});
    expect(f.live).toBe(false);
    expect(f.topic).toBe("ecowitt/grow");
    expect(f.mqttUrl).toBe("mqtt://127.0.0.1:1883");
  });

  it("treats blank env values as absent", () => {
    const env = readEnv({ ECOWITT_INGEST_URL: "  ", VERDANT_BRIDGE_TOKEN: "" });
    expect(env.ingestUrl).toBeNull();
    expect(env.token).toBeNull();
  });
});

describe("live config fails closed", () => {
  it("accepts the ecowitt-ingest https URL with a vbt_ token", () => {
    expect(liveConfigProblems(LIVE_ENV)).toEqual([]);
  });

  it.each<[Partial<ForwarderEnv>, string]>([
    [{ ingestUrl: null }, "missing_ingest_url"],
    [{ ingestUrl: INGEST_URL.replace("https://", "http://") }, "ingest_url_not_https"],
    [
      { ingestUrl: INGEST_URL.replace("ecowitt-ingest", "sensor-ingest-webhook") },
      "ingest_url_not_ecowitt_ingest",
    ],
    [{ ingestUrl: "https://evil.example/collect" }, "ingest_url_not_ecowitt_ingest"],
    [{ token: null }, "missing_bridge_token"],
    [{ token: NOT_A_BRIDGE_TOKEN }, "bridge_token_shape"],
  ])("reports %j as %s", (over, problem) => {
    expect(liveConfigProblems({ ...LIVE_ENV, ...over })).toContain(problem);
  });
});

describe("prepareForwardPayload", () => {
  it("strips the bridge wrapper and summarises channels of a real gateway upload", () => {
    const out = prepareForwardPayload(GATEWAY_MESSAGE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.payload)).not.toEqual(
      expect.arrayContaining(["received_at", "transport", "topic"]),
    );
    expect(out.payload.temp2f).toBe(81.68);
    expect(out.summary).toEqual({
      air_channels: [1, 2, 3, 5],
      soil_channels: [2, 5, 6, 8],
      key_count: 20,
      dateutc: "2026-10-22 05:27:14",
      station: "GW3000B_V1.2.4",
    });
  });

  it("refuses the hand-made sanity post: no PASSKEY", () => {
    expect(prepareForwardPayload(SANITY_MESSAGE)).toEqual({
      ok: false,
      reason: "missing_passkey",
    });
  });

  it("refuses a payload with PASSKEY but no dateutc", () => {
    const text = JSON.stringify({ PASSKEY: FAKE_PASSKEY, temp1f: 70, humidity1: 50 });
    expect(prepareForwardPayload(text)).toEqual({ ok: false, reason: "missing_dateutc" });
  });

  it.each(["not json", "[1,2]", "null", '"str"'])("refuses %s", (text) => {
    expect(prepareForwardPayload(text).ok).toBe(false);
  });
});

describe("handleMessage", () => {
  it("dry-run never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: false }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.kind).toBe("dry_run");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("live forwards exactly one bearer-authenticated JSON POST without the bridge wrapper", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, accepted: true, inserted: 6, skipped_duplicate: 0 }),
          { status: 200 },
        ),
    );
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INGEST_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_BRIDGE_TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.PASSKEY).toBe(FAKE_PASSKEY);
    expect(body.temp2f).toBe(81.68);
    expect(body.received_at).toBeUndefined();
    expect(body.transport).toBeUndefined();
    expect(out).toMatchObject({
      kind: "forwarded",
      response: { status: 200, accepted: true, inserted: 6, skipped_duplicate: 0, reason: null },
    });
  });

  it("live with a locally rejected message never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await handleMessage({
      text: SANITY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ kind: "rejected_locally", reason: "missing_passkey" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("live with bad config never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: { ...LIVE_ENV, token: null },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.kind).toBe("network_error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ kind: "network_error", error: "ECONNREFUSED" });
  });
});

describe("response summary and exit codes", () => {
  it("keeps only the documented response fields", () => {
    const s = summarizeResponse(
      200,
      JSON.stringify({
        ok: true,
        accepted: false,
        inserted: 0,
        reason: "tent_lookup_failed",
        x: 1,
      }),
    );
    expect(s).toEqual({
      status: 200,
      accepted: false,
      inserted: 0,
      skipped_duplicate: null,
      reason: "tent_lookup_failed",
    });
    expect(summarizeResponse(401, "not json")).toEqual({
      status: 401,
      accepted: null,
      inserted: null,
      skipped_duplicate: null,
      reason: null,
    });
  });

  it("--once exits 0 only for a dry run or an accepted forward", () => {
    const summary = {
      air_channels: [2],
      soil_channels: [],
      key_count: 5,
      dateutc: "x",
      station: null,
    };
    expect(onceExitCode({ kind: "dry_run", summary })).toBe(0);
    expect(
      onceExitCode({
        kind: "forwarded",
        summary,
        response: summarizeResponse(200, '{"accepted":true}'),
      }),
    ).toBe(0);
    expect(
      onceExitCode({
        kind: "forwarded",
        summary,
        response: summarizeResponse(200, '{"accepted":false}'),
      }),
    ).toBe(1);
    expect(onceExitCode({ kind: "rejected_locally", reason: "missing_passkey" })).toBe(1);
    expect(onceExitCode({ kind: "network_error", summary, error: "x" })).toBe(1);
  });
});

describe("redaction", () => {
  it("never echoes PASSKEY, MAC, tokens or MQTT credentials", () => {
    const out = redactForLog({
      PASSKEY: FAKE_PASSKEY,
      MAC: "AA:BB:CC",
      token: FAKE_BRIDGE_TOKEN,
      mqtt_password: "hunter2",
      note: FAKE_BRIDGE_TOKEN,
      temp2f: 81.68,
    });
    expect(JSON.stringify(out)).not.toMatch(/FAKE_TEST_PASSKEY|AA:BB:CC|hunter2|vbt_/);
    expect(out.temp2f).toBe(81.68);
  });

  it("the token goes only into the Authorization header, never the body", () => {
    const req = buildForwardRequest({ PASSKEY: FAKE_PASSKEY }, INGEST_URL, FAKE_BRIDGE_TOKEN);
    expect(req.init.body).not.toContain(FAKE_BRIDGE_TOKEN);
    expect(req.init.headers.Authorization).toContain(FAKE_BRIDGE_TOKEN);
  });
});
