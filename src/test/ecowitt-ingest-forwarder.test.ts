/**
 * Behaviour of scripts/dev/ecowitt-ingest-forwarder.ts: the PC-side step that
 * forwards bridge-published gateway uploads to the `ecowitt-ingest` edge
 * function. Dry-run connects to the configured MQTT broker and subscribes but
 * must never POST to ingest; live must fail closed on bad config, send exactly
 * one bearer-authenticated JSON POST per attempt, and never leak
 * PASSKEY / MAC / token into logs or reports.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import { parseEcoWittDateUtc } from "../../supabase/functions/_shared/ecowittRoutedRowBuilder.ts";
import {
  GUARD_MALFORMED_PACKET,
  GUARD_PACKET_TOO_LARGE,
  MAX_INBOUND_PACKET_BYTES,
  PRODUCTION_DEPS,
  connectMqtt,
  createInboundPacketScanner,
  guardInboundStream,
  APPROVED_INGEST_URLS,
  MAX_MESSAGE_BYTES,
  attachClientLifecycle,
  brokerUrlIsHierarchical,
  buildForwardRequest,
  configuredSecretValues,
  createBoundedRunner,
  MAX_BACKLOG,
  MAX_INFLIGHT,
  createMessageHandler,
  dateutcAccepted,
  fullJitterDelayMs,
  handleMessage,
  isRetryableStatus,
  liveConfigProblems,
  onceExitCode,
  parseFlags,
  prepareForwardPayload,
  REDACTED_DATEUTC,
  readEnv,
  redactForLog,
  redactString,
  readBoundedText,
  main,
  MAX_RESPONSE_BYTES,
  setConfiguredSecrets,
  summarizeResponse,
  type ForwarderEnv,
  type ForwarderFlags,
  type OnceClaim,
} from "../../scripts/dev/ecowitt-ingest-forwarder";

// Fake credentials, assembled at runtime so nothing in this file reads as a real one.
const FAKE_PASSKEY = ["FAKE", "TEST", "PASSKEY", "NOT", "REAL"].join("_");
const FAKE_BRIDGE_TOKEN = ["vbt", "FAKE_TEST_TOKEN_0123456789"].join("_");
const NOT_A_BRIDGE_TOKEN = ["sk", "live", "not_a_bridge_token"].join("_");
// The approved destination; any other host is refused (Codex P1 at 79ce2801).
const INGEST_URL = APPROVED_INGEST_URLS[0];
const NO_SLEEP = { sleep: async () => {} };
// A 32-hex PASSKEY shape, built at runtime, for the embedded-credential cases.
const FAKE_HEX32 = "0123456789abcdef".repeat(2);

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
  topic: "ecowitt/grow",
  mqttUrl: "mqtt://127.0.0.1:1883",
  ...over,
});

describe("flags and env", () => {
  it.each([
    [["--mqtt-url", "--once"], "--mqtt-url"],
    [["--topic", "--write-report"], "--topic"],
    [["--once", "--topic"], "--topic"],
  ])(
    "rejects a value-taking flag with no value instead of reading the next option as its value (Codex P2 at acab6b12): %j",
    (argv, flag) => {
      expect(() => parseFlags(argv, {})).toThrow(`missing_option_value:${flag}`);
    },
  );

  it.each([
    [["--once", "--once"], "duplicate_option:--once"],
    [["--mqtt-url", "mqtt://ok", "--mqtt-url", "--once"], "duplicate_option:--mqtt-url"],
    [["--topic", ""], "empty_option_value:--topic"],
    [["--mqtt-url", "   "], "empty_option_value:--mqtt-url"],
    [["--write-report"], "unknown_option:argument_1"],
    [["--once", "stray"], "unknown_option:argument_2"],
  ])(
    "refuses a repeated, empty or unknown argument before any connection (Codex P2 at bae4ae77): %j",
    (argv, message) => {
      expect(() => parseFlags(argv, {})).toThrow(message);
    },
  );

  it("reads every flag once, in any order, and skips a bare -- separator", () => {
    expect(
      parseFlags(["--", "--topic", "t/x", "--live", "--mqtt-url", "mqtt://h:1", "--once"], {}),
    ).toEqual({ live: true, once: true, topic: "t/x", mqttUrl: "mqtt://h:1" });
    expect(parseFlags([], { ECOWITT_MQTT_TOPIC: "  ", ECOWITT_MQTT_URL: "" })).toMatchObject({
      topic: "ecowitt/grow",
      mqttUrl: "mqtt://127.0.0.1:1883",
    });
  });

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

describe("brokerUrlIsHierarchical", () => {
  it.each([
    ["mqtt://127.0.0.1:1883", true],
    ["mqtt://user:pass@broker.example:1883", true],
    ["mqtt:user:pass@broker.invalid", false],
    ["not-a-url", false],
  ])("%s → %s", (url, expected) => {
    expect(brokerUrlIsHierarchical(url)).toBe(expected);
  });
});

describe("unknown arguments are reported without their text (Codex P1 at ed548103)", () => {
  it.each([
    "--password=hunter2-not-real",
    "--mqtt-password=hunter2-not-real",
    `--token=${FAKE_BRIDGE_TOKEN}`,
    "hunter2-not-real",
  ])("parseFlags and main never echo %s", async (arg) => {
    let message = "";
    try {
      parseFlags(["--once", arg], {});
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toBe("unknown_option:argument_2");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.fn();
    const connect = vi.fn();
    try {
      await main(["--once", arg], {}, { connect, exit });
      const printed = err.mock.calls.flat().join(" ");
      expect(printed).toContain("unknown_option:argument_2");
      expect(printed).not.toContain("hunter2");
      expect(printed).not.toContain(FAKE_BRIDGE_TOKEN);
    } finally {
      err.mockRestore();
    }
    expect(exit).toHaveBeenCalledWith(2);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("live config fails closed", () => {
  it("accepts the ecowitt-ingest https URL with a vbt_ token", () => {
    expect(liveConfigProblems(LIVE_ENV)).toEqual([]);
  });

  it.each(APPROVED_INGEST_URLS.map((u) => [u]))("accepts the approved URL %s", (url) => {
    expect(liveConfigProblems({ ...LIVE_ENV, ingestUrl: url })).toEqual([]);
    expect(liveConfigProblems({ ...LIVE_ENV, ingestUrl: `${url}/` })).toEqual([]);
  });

  it.each<[Partial<ForwarderEnv>, string]>([
    [{ ingestUrl: null }, "missing_ingest_url"],
    [{ ingestUrl: INGEST_URL.replace("https://", "http://") }, "ingest_url_not_https"],
    [
      { ingestUrl: INGEST_URL.replace("ecowitt-ingest", "sensor-ingest-webhook") },
      "ingest_url_not_ecowitt_ingest",
    ],
    [{ ingestUrl: "https://evil.example/collect" }, "ingest_url_not_ecowitt_ingest"],
    // Right path, wrong host: PASSKEY and token would go to the attacker (Codex P1).
    [{ ingestUrl: "https://attacker.example/ecowitt-ingest" }, "ingest_url_not_approved_origin"],
    [
      { ingestUrl: "https://attacker.example/functions/v1/ecowitt-ingest" },
      "ingest_url_not_approved_origin",
    ],
    [{ ingestUrl: `${INGEST_URL}?redirect=1` }, "ingest_url_not_approved_origin"],
    [
      { ingestUrl: INGEST_URL.replace("https://", "https://u:p@") },
      "ingest_url_not_approved_origin",
    ],
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

  // Copilot on #2335: `String(x)` on these throws; they must be local rejections.
  const HOSTILE = { toString: null };
  it("rejects a non-string PASSKEY without throwing", () => {
    const text = JSON.stringify({ PASSKEY: HOSTILE, dateutc: "2026-10-22 05:27:14" });
    expect(prepareForwardPayload(text)).toEqual({ ok: false, reason: "invalid_passkey" });
  });

  it("rejects a non-string dateutc without throwing", () => {
    const text = JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc: HOSTILE });
    expect(prepareForwardPayload(text)).toEqual({ ok: false, reason: "invalid_dateutc" });
  });

  it("rejects a message over the byte bound before parsing it (Codex P2 at 79ce2801)", () => {
    const text = JSON.stringify({
      PASSKEY: FAKE_PASSKEY,
      dateutc: "2026-10-22 05:27:14",
      pad: "x".repeat(MAX_MESSAGE_BYTES),
    });
    expect(prepareForwardPayload(text)).toEqual({ ok: false, reason: "payload_too_large" });
  });

  it.each(["-", "05:27", "2026", ":"])(
    "accepts a valid upload whose short PASSKEY occurs in its date, withholding only the summary copy (Codex P2 at d236df20): %s",
    (key) => {
      const out = prepareForwardPayload(
        JSON.stringify({ PASSKEY: key, dateutc: "2026-10-22 05:27:14", temp1f: 77 }),
        new Date("2026-10-22T12:00:00.000Z"),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.summary.dateutc).toBe(REDACTED_DATEUTC);
        // The upload itself is forwarded unchanged.
        expect(out.payload.dateutc).toBe("2026-10-22 05:27:14");
      }
    },
  );

  it("keeps the summary date when the PASSKEY does not occur in it", () => {
    const out = prepareForwardPayload(
      JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc: "2026-10-22 05:27:14" }),
      new Date("2026-10-22T12:00:00.000Z"),
    );
    expect(out.ok && out.summary.dateutc).toBe("2026-10-22 05:27:14");
  });

  it("caps a padded dateutc to its checked form", () => {
    const long = prepareForwardPayload(
      JSON.stringify({
        PASSKEY: FAKE_PASSKEY,
        dateutc: `2026-10-22 05:27:14${" ".repeat(100)}`,
        stationtype: "S".repeat(200),
      }),
    );
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.summary.dateutc).toBe("2026-10-22 05:27:14");
  });

  it.each(["2026-10-22", "now", "2026-10-22 05:27:14 UTC", "MjAyNi0xMC0yMg=="])(
    "rejects a dateutc that is not the EcoWitt form ecowitt-ingest accepts (Codex P1 at bae4ae77): %s",
    (dateutc) => {
      expect(prepareForwardPayload(JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc }))).toEqual({
        ok: false,
        reason: "invalid_dateutc",
      });
    },
  );

  it.each([
    ["abc", "GYWJj_V1.2.3"], // Base64 of the PASSKEY inside a firmware-shaped id
    [FAKE_PASSKEY, "GW3000B_V1.2.4"],
    [FAKE_PASSKEY, FAKE_PASSKEY],
    [FAKE_PASSKEY, `GW3000B_${FAKE_BRIDGE_TOKEN}`],
  ])(
    "never echoes stationtype in the summary or its log line (Codex P1 at ed548103): %s / %s",
    (passkey, stationtype) => {
      const r = prepareForwardPayload(
        JSON.stringify({ PASSKEY: passkey, dateutc: "2026-10-22 05:27:14", stationtype }),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(Object.keys(r.summary).sort()).toEqual([
        "air_channels",
        "dateutc",
        "key_count",
        "soil_channels",
      ]);
      expect(JSON.stringify(redactForLog({ summary: r.summary }))).not.toContain(stationtype);
    },
  );

  it("rejects a payload with two PASSKEY keys differing only in case (Codex P1 at 5a7accaf)", () => {
    const text = JSON.stringify({
      PASSKEY: FAKE_PASSKEY,
      passkey: "SECOND-NOT-A-SHAPE",
      dateutc: "2026-10-22 05:27:14",
      stationtype: "SECOND-NOT-A-SHAPE",
    });
    expect(prepareForwardPayload(text)).toEqual({ ok: false, reason: "duplicate_passkey" });
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
    // A redirect would resend PASSKEY and the token to an unvalidated target.
    expect(init.redirect).toBe("manual");
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

  it.each([
    JSON.stringify({ PASSKEY: { toString: null }, dateutc: "2026-10-22 05:27:14" }),
    JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc: { toString: null } }),
  ])("live with a hostile field never calls fetch and never throws", async (text) => {
    const fetchImpl = vi.fn();
    const out = await handleMessage({
      text,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.kind).toBe("rejected_locally");
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

  it("reports a network failure without throwing, after the bounded retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: NO_SLEEP,
    });
    expect(out).toMatchObject({ kind: "network_error", error: "ECONNREFUSED", attempts: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  // Codex P2 at 79ce2801: docs/bridge-client-retry-guidance.md §4.
  it("retries a transient 503 with Full Jitter and then forwards", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true, inserted: 1 }), { status: 200 }),
      );
    const sleep = vi.fn(async () => {});
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { sleep, random: () => 0.5 },
    });
    expect(out).toMatchObject({ kind: "forwarded", attempts: 2, response: { status: 200 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it("never retries an auth or payload error", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: NO_SLEEP,
    });
    expect(out).toMatchObject({ kind: "forwarded", attempts: 1, response: { status: 401 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung POST at the timeout instead of waiting forever", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { ...NO_SLEEP, timeoutMs: 5, maxRetries: 0 },
    });
    expect(out).toMatchObject({ kind: "network_error", error: "aborted", attempts: 1 });
  });

  it("pins the retry policy helpers", () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(fullJitterDelayMs(0, () => 1)).toBe(3000);
    expect(fullJitterDelayMs(10, () => 1)).toBe(45000);
    expect(fullJitterDelayMs(3, () => 0)).toBe(0);
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
      dropped: null,
    });
    expect(summarizeResponse(401, "not json")).toEqual({
      status: 401,
      accepted: null,
      inserted: null,
      skipped_duplicate: null,
      reason: null,
      dropped: null,
    });
  });

  it("keeps a bounded count of dropped reason codes and router channel keys, never tenant ids (Codex P2 at acab6b12, bae4ae77)", () => {
    const s = summarizeResponse(
      200,
      JSON.stringify({
        ok: true,
        accepted: false,
        inserted: 0,
        per_tent: [{ tent_id: "tent-secret-id", rows: 0 }],
        dropped: [
          {
            channel_key: "temp2f",
            channel: 2,
            metric: "air_temp",
            reason: "no_eligible_tent_for_channel",
          },
          {
            channel_key: "humidity2",
            channel: 2,
            metric: "rh",
            reason: "no_eligible_tent_for_channel",
          },
          {
            channel_key: "soilmoisture4",
            channel: 4,
            metric: "soil",
            reason: "channel_value_out_of_plausible_range",
          },
          { channel_key: "passkey", channel: null, metric: null, reason: "fingerprint_mismatch" },
          { channel_key: "x", reason: "tent-secret-id leaked as a reason" },
          "not an object",
        ],
      }),
    );
    expect(s.reason).toBeNull();
    expect(s.dropped).toEqual({
      reasons: {
        no_eligible_tent_for_channel: 2,
        channel_value_out_of_plausible_range: 1,
        fingerprint_mismatch: 1,
        other: 1,
      },
      channels: ["humidity2", "soilmoisture4", "temp2f"],
    });
    expect(JSON.stringify(s)).not.toContain("tent-secret-id");
    // Free text never rides in as a reason.
    expect(
      summarizeResponse(200, JSON.stringify({ reason: "Bearer vbt_x leaked" })).reason,
    ).toBeNull();
  });

  it("reads at most MAX_RESPONSE_BYTES of a body and cancels the rest (Codex P2 at acab6b12, bae4ae77)", async () => {
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(4096).fill(0x61));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await readBoundedText(new Response(endless))).toBeNull();
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThanOrEqual(MAX_RESPONSE_BYTES / 4096 + 2);
    expect(await readBoundedText(new Response('{"accepted":true}'))).toBe('{"accepted":true}');
    expect(summarizeResponse(502, null)).toMatchObject({
      status: 502,
      reason: "response_too_large",
    });
  });

  it("the live path summarises an oversized body as response_too_large without buffering it", async () => {
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(4096).fill(0x20));
      },
    });
    const fetchImpl = vi.fn(async () => new Response(big, { status: 200 }));
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: NO_SLEEP,
    });
    expect(out.kind).toBe("forwarded");
    if (out.kind === "forwarded") expect(out.response.reason).toBe("response_too_large");
  });

  it("--once exits 1 when accepted: true rides a non-2xx status (Codex P2 at 79ce2801)", () => {
    const summary = {
      air_channels: [2],
      soil_channels: [],
      key_count: 5,
      dateutc: "x",
    };
    for (const status of [401, 429, 500]) {
      expect(
        onceExitCode({
          kind: "forwarded",
          summary,
          attempts: 1,
          response: summarizeResponse(status, '{"accepted":true}'),
        }),
      ).toBe(1);
    }
  });

  it("--once exits 0 only for a dry run or an accepted forward", () => {
    const summary = {
      air_channels: [2],
      soil_channels: [],
      key_count: 5,
      dateutc: "x",
    };
    expect(onceExitCode({ kind: "dry_run", summary })).toBe(0);
    expect(
      onceExitCode({
        kind: "forwarded",
        summary,
        attempts: 1,
        response: summarizeResponse(200, '{"accepted":true}'),
      }),
    ).toBe(0);
    expect(
      onceExitCode({
        kind: "forwarded",
        summary,
        attempts: 1,
        response: summarizeResponse(200, '{"accepted":false}'),
      }),
    ).toBe(1);
    expect(onceExitCode({ kind: "rejected_locally", reason: "missing_passkey" })).toBe(1);
    expect(onceExitCode({ kind: "network_error", summary, error: "x", attempts: 1 })).toBe(1);
  });
});

describe("configured MQTT credentials are redacted (Codex P1 at acab6b12, bae4ae77)", () => {
  afterEach(() => setConfiguredSecrets([]));

  it("collects the MQTT username and password from the environment and the broker URL, at any length", () => {
    const values = configuredSecretValues(
      flags({ mqttUrl: "mqtt://grower:hunter%402@broker.local:1883" }),
      { ingestUrl: null, token: null, mqttUsername: "envuser", mqttPassword: "abc" },
    );
    // Each URL credential as written and decoded (Codex P1 at d344f8e4), once each.
    expect(values).toEqual(["envuser", "abc", "grower", "hunter%402", "hunter@2"]);
  });

  it("scrubs each configured value literally, in any case and URI-encoded", () => {
    setConfiguredSecrets(["grower", "hunter@2", "ab"]);
    expect(redactString("topic/GROWER/hunter@2/hunter%402")).toBe(
      "topic/(redacted)/(redacted)/(redacted)",
    );
    // Short values are scrubbed too; over-redacting a log line is harmless.
    expect(redactString("tab")).toBe("t(redacted)");
  });

  it("does not keep an upload PASSKEY between messages", () => {
    const secret = ["Arbitrary", "Secret", "Value"].join("");
    prepareForwardPayload(JSON.stringify({ PASSKEY: secret, dateutc: "2026-10-22 05:27:14" }));
    expect(redactString(`x ${secret}`)).toBe(`x ${secret}`);
  });

  it.each([
    ["username first", ["mqtt-user", "mqtt-user-password"]],
    ["password first", ["mqtt-user-password", "mqtt-user"]],
  ])(
    "redacts a password that a configured username prefixes, whole (%s; Codex P1 at ac8be57b)",
    (_l, values) => {
      setConfiguredSecrets(values);
      expect(redactString("t/mqtt-user-password/x")).toBe("t/(redacted)/x");
      expect(redactString("t/MQTT-USER-PASSWORD")).toBe("t/(redacted)");
      expect(redactString("t/mqtt-user/x")).toBe("t/(redacted)/x");
    },
  );

  it.each([
    ["username first", ["grow er", "grow er@pw"]],
    ["password first", ["grow er@pw", "grow er"]],
  ])("redacts the URI-encoded form of an overlapping pair whole (%s)", (_l, values) => {
    setConfiguredSecrets(values);
    expect(redactString("t/grow%20er%40pw/x")).toBe("t/(redacted)/x");
    expect(redactString("t/grow er@pw/x")).toBe("t/(redacted)/x");
  });

  it("redacts two partly overlapping values without leaving either's edge", () => {
    setConfiguredSecrets(["alpha-beta", "beta-gamma"]);
    expect(redactString("t/alpha-beta-gamma/x")).toBe("t/(redacted)/x");
  });

  it("main registers an overlapping URL username and password so a topic echo stays whole", async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    });
    try {
      const client = { on: () => client, subscribe: () => {}, end: () => {} };
      await main(
        [
          "--mqtt-url",
          "mqtt://mqtt-user:mqtt-user-password@h:1",
          "--topic",
          "t/mqtt-user-password",
        ],
        {},
        { connect: async () => client, exit: vi.fn() },
      );
      const startup = lines.find((l) => l.includes("startup")) ?? "";
      expect(startup).toContain("t/(redacted)");
      expect(startup).not.toMatch(/password/i);
    } finally {
      log.mockRestore();
    }
  });
});

describe("a malformed escape in one URL credential keeps both redacted (Codex P1 on #2335 at d344f8e4)", () => {
  afterEach(() => setConfiguredSecrets([]));
  const URL_WITH_BAD_ESCAPE = "mqtt://mqtt-user:bad%ZZ@host:1883";

  it("keeps the valid username and the malformed password", () => {
    const values = configuredSecretValues(flags({ mqttUrl: URL_WITH_BAD_ESCAPE }), readEnv({}));
    expect(values).toContain("mqtt-user");
    expect(values).toContain("bad%ZZ");
  });

  it("main redacts both in a topic echoed at startup", async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    });
    try {
      const client = { on: () => client, subscribe: () => {}, end: () => {} };
      await main(
        ["--mqtt-url", URL_WITH_BAD_ESCAPE, "--topic", "topic/mqtt-user/bad%ZZ"],
        {},
        { connect: async () => client, exit: vi.fn() },
      );
      const out = lines.join("\n");
      expect(out).toContain("topic/(redacted)/(redacted)");
      expect(out).not.toContain("mqtt-user");
      expect(out).not.toContain("bad%ZZ");
    } finally {
      log.mockRestore();
    }
  });
});

describe("a failed broker connect is value-free (Codex P1 on #2335 at ac8be57b)", () => {
  afterEach(() => setConfiguredSecrets([]));
  const USER = "leaky-mqtt-user";
  const PASS = "leaky-mqtt-pass";
  // A bracketed host that is not an IPv6 address: WHATWG URL (and so MQTT.js)
  // rejects it with ERR_INVALID_URL and the whole input on the error.
  const BAD_URL = `mqtt://${USER}:${PASS}@[not-a-host]:1883`;
  function capture() {
    const lines: string[] = [];
    const rec = (...a: unknown[]) => {
      lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    };
    const log = vi.spyOn(console, "log").mockImplementation(rec);
    const err = vi.spyOn(console, "error").mockImplementation(rec);
    return {
      lines,
      restore: () => {
        log.mockRestore();
        err.mockRestore();
      },
    };
  }

  it("the fixture URL really is malformed", () => {
    expect(() => new URL(BAD_URL)).toThrow();
  });

  it("a malformed credential-bearing --mqtt-url is refused before connect, logging no configuration (Codex P1 at 95f5dfe7)", async () => {
    const mod = { connect: vi.fn() };
    const exit = vi.fn();
    const { lines, restore } = capture();
    try {
      await expect(
        main(
          ["--mqtt-url", BAD_URL, "--topic", `topic/${USER}/${PASS}`],
          {},
          {
            connect: (f, e) => connectMqtt(f, e, async () => mod),
            exit,
          },
        ),
      ).resolves.toBeUndefined();
    } finally {
      restore();
    }
    expect(mod.connect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(2);
    expect(lines).toEqual(["[ecowitt-forwarder] refused: --mqtt-url is not a valid URL."]);
    for (const l of lines) {
      expect(l).not.toContain(USER);
      expect(l).not.toContain(PASS);
    }
  });

  it("an opaque credential-bearing --mqtt-url is refused before connect, logging no configuration (Codex P1 at d722d381)", async () => {
    const OPAQUE = `mqtt:${USER}:${PASS}@broker.invalid`;
    expect(URL.canParse(OPAQUE)).toBe(true);
    expect(new URL(OPAQUE).host).toBe("");
    const mod = { connect: vi.fn() };
    const exit = vi.fn();
    const { lines, restore } = capture();
    try {
      await main(
        ["--mqtt-url", OPAQUE, "--topic", `topic/${USER}/${PASS}`],
        {},
        { connect: (f, e) => connectMqtt(f, e, async () => mod), exit },
      );
    } finally {
      restore();
    }
    expect(mod.connect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(2);
    expect(lines).toEqual(["[ecowitt-forwarder] refused: --mqtt-url is not a valid URL."]);
  });

  it("a rejecting connect dependency exits 2 with a fixed line and never rejects", async () => {
    const exit = vi.fn();
    const connect = vi.fn(async () => {
      throw Object.assign(new Error(`connect ${BAD_URL} failed`), { input: BAD_URL });
    });
    const { lines, restore } = capture();
    try {
      await expect(main(["--once"], {}, { connect, exit })).resolves.toBeUndefined();
    } finally {
      restore();
    }
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(2);
    for (const l of lines) {
      expect(l).not.toContain(USER);
      expect(l).not.toContain(PASS);
      expect(l).not.toContain("failed`");
    }
    expect(lines.filter((l) => l.includes("mqtt_connect_failed"))).toHaveLength(1);
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
    expect(req.init.redirect).toBe("manual");
  });

  it("refuses a redirect from the approved URL and never retries it (Codex P2 at efeae597)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 307, headers: { location: "https://evil.example/collect" } }),
    );
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: NO_SLEEP,
    });
    expect(out).toMatchObject({
      kind: "network_error",
      error: "redirect_refused_307",
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(out)).not.toContain("evil.example");
  });

  it("cancels a refused redirect's unread body (Codex P2 at d236df20)", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("redirect body"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, { status: 302, headers: { location: "https://evil.example/collect" } }),
    );
    const out = await handleMessage({
      text: GATEWAY_MESSAGE,
      flags: flags({ live: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: NO_SLEEP,
    });
    expect(out).toMatchObject({ kind: "network_error", error: "redirect_refused_302" });
    expect(cancelled).toBe(true);
  });

  // Copilot on #2335: outcomes nest the summary; the broker URL may carry credentials.
  it("redacts a token embedded in a nested outcome summary", () => {
    const out = redactForLog({
      kind: "dry_run",
      summary: { station: FAKE_BRIDGE_TOKEN, air_channels: [2], note: [FAKE_BRIDGE_TOKEN] },
      response: { reason: `rejected ${FAKE_BRIDGE_TOKEN}` },
    });
    expect(JSON.stringify(out)).not.toMatch(/vbt_/);
    expect((out.summary as { air_channels: number[] }).air_channels).toEqual([2]);
  });

  it("redacts a 32-hex PASSKEY shape wherever it sits in a string (Codex P1 at 79ce2801)", () => {
    const hex = "0123456789abcdef0123456789ABCDEF";
    expect(redactString(`station ${hex} ok`)).toBe("station (redacted) ok");
    expect(JSON.stringify(redactForLog({ summary: { station: hex } }))).not.toContain(hex);
  });

  it("redacts a 32-hex run inside a longer string, not only a standalone one (Codex P1 at 3df0e691)", () => {
    const out = redactString(`prefix${FAKE_HEX32}suffix`);
    expect(out).not.toContain(FAKE_HEX32);
    expect(out).toContain("(redacted)");
    const nested = redactForLog({ summary: { dateutc: `a${FAKE_HEX32}b` } });
    expect(JSON.stringify(nested)).not.toContain(FAKE_HEX32);
  });

  it("redacts a token glued to other text, with no word boundary before it (Codex P1 at 0676e200)", () => {
    expect(redactString(`2026-10-22${FAKE_BRIDGE_TOKEN}`)).not.toMatch(/vbt_/);
    expect(redactString(`x${NOT_A_BRIDGE_TOKEN}`)).not.toMatch(/sk_/);
    const nested = redactForLog({ summary: { dateutc: `05:27:14${FAKE_BRIDGE_TOKEN}` } });
    expect(JSON.stringify(nested)).not.toMatch(/vbt_/);
  });

  it("drops a stationtype that carries any credential shape, not only the PASSKEY (Codex P1 at 0676e200)", () => {
    for (const stationtype of [`GW3000B_${FAKE_BRIDGE_TOKEN}`, `GW${FAKE_HEX32}`]) {
      const out = prepareForwardPayload(
        JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc: "2026-10-22 05:27:14", stationtype }),
      );
      expect(out.ok && "station" in out.summary).toBe(false);
    }
  });

  it("redacts MAC addresses embedded in strings and drops a stationtype carrying one (Codex P1 at 3c16b6a4)", () => {
    const macs = ["AA:BB:CC:DD:EE:FF", "aa-bb-cc-dd-ee-ff", "aabb.ccdd.eeff"];
    for (const mac of macs) {
      expect(redactString(`GW-${mac} ok`)).toBe("GW-(redacted) ok");
      const out = prepareForwardPayload(
        JSON.stringify({
          PASSKEY: FAKE_PASSKEY,
          dateutc: "2026-10-22 05:27:14",
          stationtype: `GW-${mac}`,
        }),
      );
      expect(out.ok && "station" in out.summary).toBe(false);
    }
    expect(JSON.stringify(redactForLog({ summary: { station: `GW-${macs[0]}` } }))).not.toContain(
      macs[0],
    );
    // Glued to identifier text, with no boundary before it (Codex P1 at efeae597).
    expect(redactString("GWAA:BB:CC:DD:EE:FF")).toBe("GW(redacted)");
    const glued = prepareForwardPayload(
      JSON.stringify({
        PASSKEY: FAKE_PASSKEY,
        dateutc: "2026-10-22 05:27:14",
        stationtype: "GWAA:BB:CC:DD:EE:FF",
      }),
    );
    expect(glued.ok && "station" in glued.summary).toBe(false);
    // Twelve contiguous hex digits, glued or not (Codex P1 at 5a7accaf).
    expect(redactString("GWAABBCCDDEEFF")).toBe("GW(redacted)");
    const contiguous = prepareForwardPayload(
      JSON.stringify({
        PASSKEY: FAKE_PASSKEY,
        dateutc: "2026-10-22 05:27:14",
        stationtype: "GWAABBCCDDEEFF",
      }),
    );
    expect(contiguous.ok && "station" in contiguous.summary).toBe(false);
    // A plain firmware string is not a MAC.
    expect(redactString("GW3000B_V1.2.4")).toBe("GW3000B_V1.2.4");
  });

  it("redacts broker URL credentials in the startup fields", () => {
    expect(redactString(`wss://broker/mqtt?token=${FAKE_BRIDGE_TOKEN}`)).toBe(
      "wss://broker/mqtt?token=(redacted)",
    );
    expect(redactString("mqtt://grower:hunter2@192.168.68.67:1883")).toBe(
      "mqtt://(redacted)@192.168.68.67:1883",
    );
    // A password that itself contains `@` is consumed whole (Codex P1 at 5a7accaf).
    expect(redactString("mqtt://user:pa@ss@broker.example/x")).toBe(
      "mqtt://(redacted)@broker.example/x",
    );
    expect(redactString("mqtt://user:pa@ss@broker.example")).toBe(
      "mqtt://(redacted)@broker.example",
    );
    const out = redactForLog({ broker: `mqtts://u:p@host/?password=${FAKE_BRIDGE_TOKEN}` });
    expect(JSON.stringify(out)).not.toMatch(/vbt_|u:p/);
  });
});

describe("createMessageHandler (--once)", () => {
  it("forwards at most one message while the first POST is still pending", async () => {
    let release: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const onDone = vi.fn();
    const handle = createMessageHandler({
      flags: flags({ live: true, once: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onDone,
    });
    handle("ecowitt/grow", Buffer.from(GATEWAY_MESSAGE));
    handle("ecowitt/grow", Buffer.from(GATEWAY_MESSAGE));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("bounded concurrency in continuous mode (Codex P2 at 0676e200)", () => {
  it("runs at most maxInflight jobs, queues up to maxBacklog, drops the rest, in arrival order", async () => {
    const runner = createBoundedRunner(2, 1);
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const job = (n: number) => () =>
      new Promise<void>((resolve) => {
        started.push(n);
        releases.push(resolve);
      });
    expect(runner.submit(job(1))).toBe("started");
    expect(runner.submit(job(2))).toBe("started");
    expect(runner.submit(job(3))).toBe("queued");
    expect(runner.submit(job(4))).toBe("dropped");
    expect(started).toEqual([1, 2]);
    expect(runner.inflight).toBe(2);
    expect(runner.backlog).toBe(1);
    releases[0]();
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3]));
    expect(runner.backlog).toBe(0);
    expect(runner.inflight).toBe(2);
  });

  it("a rejected job still frees its slot", async () => {
    const runner = createBoundedRunner(1, 4);
    runner.submit(() => Promise.reject(new Error("boom")));
    const ran = vi.fn(async () => {});
    runner.submit(ran);
    await vi.waitFor(() => expect(ran).toHaveBeenCalledTimes(1));
  });

  it("never decodes an oversized frame and runs its rejection through the runner (Codex P2 at 3c16b6a4, efeae597)", async () => {
    const runner = createBoundedRunner(1, 4);
    let release: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const handle = createMessageHandler({
        flags: flags({ live: true }),
        env: LIVE_ENV,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onDone: () => {},
        runner,
      });
      handle("ecowitt/grow", GATEWAY_MESSAGE);
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      // The slot is held: the oversized frame's rejection waits its turn like
      // any other job, and nothing is logged for it yet.
      handle("ecowitt/grow", Buffer.alloc(MAX_MESSAGE_BYTES + 1, 0x7b));
      expect(runner.backlog).toBe(1);
      expect(
        logSpy.mock.calls.some((c) => JSON.stringify(c[1] ?? "").includes("payload_too_large")),
      ).toBe(false);
      release(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
      await vi.waitFor(() =>
        expect(
          logSpy.mock.calls.some(
            (c) =>
              String(c[0]).includes("rejected_locally") &&
              JSON.stringify(c[1]).includes("payload_too_large"),
          ),
        ).toBe(true),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("an oversized --once frame still exits 1 without a POST", async () => {
    const fetchImpl = vi.fn();
    const onDone = vi.fn();
    const handle = createMessageHandler({
      flags: flags({ live: true, once: true }),
      env: LIVE_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onDone,
    });
    handle("ecowitt/grow", Buffer.alloc(MAX_MESSAGE_BYTES + 1, 0x7b));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the live handler never has more than MAX_INFLIGHT POSTs in flight and drops beyond the backlog", async () => {
    const releases: Array<(r: Response) => void> = [];
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => releases.push(resolve)));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const handle = createMessageHandler({
        flags: flags({ live: true }),
        env: LIVE_ENV,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onDone: () => {},
      });
      const total = MAX_INFLIGHT + MAX_BACKLOG + 3;
      for (let i = 0; i < total; i += 1) handle("ecowitt/grow", GATEWAY_MESSAGE);
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(MAX_INFLIGHT));
      const drops = logSpy.mock.calls.filter((c) => String(c[0]).includes("dropped_backlog_full"));
      expect(drops).toHaveLength(3);
      // Releasing one POST admits exactly one queued message.
      releases[0](new Response(JSON.stringify({ accepted: true }), { status: 200 }));
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(MAX_INFLIGHT + 1));
      // Each released POST admits one queued message, whose own resolver only
      // appears after it starts; drain in rounds until the backlog is spent.
      while (fetchImpl.mock.calls.length < MAX_INFLIGHT + MAX_BACKLOG) {
        const seen = fetchImpl.mock.calls.length;
        for (const release of releases.splice(0))
          release(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
        await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThan(seen));
      }
      expect(fetchImpl).toHaveBeenCalledTimes(MAX_INFLIGHT + MAX_BACKLOG);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("attachClientLifecycle (--once broker failures)", () => {
  function fakeClient() {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    let subscribeErr: Error | null = null;
    return {
      on: (event: string, listener: (...args: unknown[]) => void) => handlers.set(event, listener),
      subscribe: (
        topic: string,
        cb?: (err?: Error | null, granted?: ReadonlyArray<{ topic: string; qos: number }>) => void,
      ) => cb?.(subscribeErr, subscribeErr ? undefined : [{ topic, qos: 0 }]),
      emit: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
      failSubscribe: (e: Error) => (subscribeErr = e),
    };
  }

  it("exits 2 once on a broker error in --once mode", () => {
    const client = fakeClient();
    const onFatal = vi.fn();
    attachClientLifecycle(client, {
      flags: flags({ once: true }),
      onFatal,
      connectTimeoutMs: 60_000,
    });
    client.emit("error", new Error("Not authorized"));
    client.emit("error", new Error("Not authorized"));
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith(2);
  });

  it("logs instead of exiting when a broker error follows the claimed --once message (Codex P2 at 3df0e691)", () => {
    const claim: OnceClaim = { claimed: false };
    const client = fakeClient();
    const onFatal = vi.fn();
    attachClientLifecycle(client, {
      flags: flags({ once: true }),
      onFatal,
      connectTimeoutMs: 60_000,
      claim,
    });
    // The handler shares the claim: delivering a message sets it before any await.
    const handler = createMessageHandler({
      flags: flags({ once: true }),
      env: LIVE_ENV,
      onDone: () => {},
      claim,
    });
    handler("ecowitt/grow", SANITY_MESSAGE);
    expect(claim.claimed).toBe(true);
    client.emit("error", new Error("Connection lost"));
    expect(onFatal).not.toHaveBeenCalled();
  });

  it.each(["close", "offline"] as const)(
    "exits 2 once when the broker connection drops (%s) before a message is claimed (Codex P2 at 0676e200)",
    (event) => {
      const client = fakeClient();
      const onFatal = vi.fn();
      attachClientLifecycle(client, {
        flags: flags({ once: true }),
        onFatal,
        connectTimeoutMs: 60_000,
      });
      client.emit("connect");
      client.emit(event);
      client.emit(event);
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(2);
    },
  );

  it("logs instead of exiting when the connection drops after the --once message is claimed", () => {
    const claim: OnceClaim = { claimed: true };
    const client = fakeClient();
    const onFatal = vi.fn();
    attachClientLifecycle(client, {
      flags: flags({ once: true }),
      onFatal,
      connectTimeoutMs: 60_000,
      claim,
    });
    client.emit("close");
    client.emit("offline");
    expect(onFatal).not.toHaveBeenCalled();
  });

  it("never exits on close/offline in continuous mode; the client reconnects", () => {
    const client = fakeClient();
    const onFatal = vi.fn();
    attachClientLifecycle(client, { flags: flags(), onFatal, connectTimeoutMs: 60_000 });
    client.emit("close");
    client.emit("offline");
    expect(onFatal).not.toHaveBeenCalled();
  });

  it("exits 2 when the subscription is rejected", () => {
    const client = fakeClient();
    client.failSubscribe(new Error("denied"));
    const onFatal = vi.fn();
    attachClientLifecycle(client, {
      flags: flags({ once: true }),
      onFatal,
      connectTimeoutMs: 60_000,
    });
    client.emit("connect");
    expect(onFatal).toHaveBeenCalledWith(2);
  });

  it("exits 2 when the broker never connects within the timeout", () => {
    vi.useFakeTimers();
    try {
      const client = fakeClient();
      const onFatal = vi.fn();
      attachClientLifecycle(client, {
        flags: flags({ once: true }),
        onFatal,
        connectTimeoutMs: 1000,
      });
      vi.advanceTimersByTime(1001);
      expect(onFatal).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["QoS 128 grant", [{ topic: "ecowitt/grow", qos: 128 }]],
    ["no grant", undefined],
    ["empty grant list", []],
  ] as const)(
    "exits 2 when the broker refuses the topic via the SUBACK grant: %s (Codex P2 at 5a7accaf)",
    (_label, granted) => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const client = {
        on: (event: string, listener: (...args: unknown[]) => void) =>
          handlers.set(event, listener),
        subscribe: (
          _topic: string,
          cb?: (err?: Error | null, g?: ReadonlyArray<{ topic: string; qos: number }>) => void,
        ) => cb?.(null, granted as ReadonlyArray<{ topic: string; qos: number }> | undefined),
      };
      const onFatal = vi.fn();
      attachClientLifecycle(client, {
        flags: flags({ once: true }),
        onFatal,
        connectTimeoutMs: 60_000,
      });
      handlers.get("connect")?.();
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(2);
    },
  );

  it.each([
    ["QoS 128 grant", null, [{ topic: "ecowitt/grow", qos: 128 }]],
    ["subscribe error", new Error("not authorised"), undefined],
  ] as const)(
    "exits 2 in continuous mode too when the subscription is refused, instead of idling with no messages (Codex P2 at acab6b12): %s",
    (_label, err, granted) => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const client = {
        on: (event: string, listener: (...args: unknown[]) => void) =>
          handlers.set(event, listener),
        subscribe: (
          _topic: string,
          cb?: (err?: Error | null, g?: ReadonlyArray<{ topic: string; qos: number }>) => void,
        ) => cb?.(err, granted as ReadonlyArray<{ topic: string; qos: number }> | undefined),
      };
      const onFatal = vi.fn();
      attachClientLifecycle(client, { flags: flags({ once: false }), onFatal });
      handlers.get("connect")?.();
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(2);
      // A later close in continuous mode is still left to the client's reconnect.
      handlers.get("close")?.();
      expect(onFatal).toHaveBeenCalledTimes(1);
    },
  );

  it("exits 2 when the broker connects but never answers the subscription (Codex P2 at 3c16b6a4)", () => {
    vi.useFakeTimers();
    try {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const silent = {
        on: (event: string, listener: (...args: unknown[]) => void) =>
          handlers.set(event, listener),
        // CONNACK arrives; SUBACK never does.
        subscribe: () => undefined,
      };
      const onFatal = vi.fn();
      attachClientLifecycle(silent, {
        flags: flags({ once: true }),
        onFatal,
        connectTimeoutMs: 1000,
      });
      handlers.get("connect")?.();
      vi.advanceTimersByTime(999);
      expect(onFatal).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits 2 in continuous mode when a connection never gets its SUBACK (Codex P2 at bae4ae77)", () => {
    vi.useFakeTimers();
    try {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      const silent = {
        on: (event: string, listener: (...args: unknown[]) => void) =>
          handlers.set(event, listener),
        subscribe: () => undefined,
      };
      const onFatal = vi.fn();
      attachClientLifecycle(silent, { flags: flags(), onFatal, connectTimeoutMs: 1000 });
      // No deadline before CONNACK in continuous mode: the client keeps reconnecting.
      vi.advanceTimersByTime(5000);
      expect(onFatal).not.toHaveBeenCalled();
      handlers.get("connect")?.();
      vi.advanceTimersByTime(999);
      expect(onFatal).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits 2 in continuous mode on a refused CONNACK, but leaves network errors to reconnect (Codex P2 at bae4ae77)", () => {
    const client = fakeClient();
    const onFatal = vi.fn();
    attachClientLifecycle(client, { flags: flags(), onFatal, connectTimeoutMs: 60_000 });
    client.emit(
      "error",
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );
    expect(onFatal).not.toHaveBeenCalled();
    client.emit(
      "error",
      Object.assign(new Error("Connection refused: Not authorized"), { code: 5 }),
    );
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith(2);
  });

  it("stays quiet after a clean connect and subscribe, and never exits in continuous mode", () => {
    vi.useFakeTimers();
    try {
      const once = fakeClient();
      const onFatalOnce = vi.fn();
      attachClientLifecycle(once, {
        flags: flags({ once: true }),
        onFatal: onFatalOnce,
        connectTimeoutMs: 1000,
      });
      once.emit("connect");
      vi.advanceTimersByTime(5000);
      expect(onFatalOnce).not.toHaveBeenCalled();

      const cont = fakeClient();
      const onFatalCont = vi.fn();
      attachClientLifecycle(cont, {
        flags: flags({ once: false }),
        onFatal: onFatalCont,
        connectTimeoutMs: 1000,
      });
      cont.emit("error", new Error("Not authorized"));
      vi.advanceTimersByTime(5000);
      expect(onFatalCont).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("main wiring (Codex P2 at acab6b12, bae4ae77)", () => {
  type Grant = ReadonlyArray<{ topic: string; qos: number }> | undefined;
  function fakeBroker(...args: [Grant?]) {
    // An explicit `undefined` means the broker granted nothing.
    const grant: Grant = args.length > 0 ? args[0] : [{ topic: "ecowitt/grow", qos: 0 }];
    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    const client = {
      ended: 0,
      on(event: string, listener: (...args: unknown[]) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), listener]);
        return client;
      },
      subscribe(_topic: string, cb?: (err?: Error | null, g?: Grant) => void) {
        cb?.(null, grant);
      },
      end() {
        client.ended += 1;
      },
      emit(event: string, ...args: unknown[]) {
        for (const l of handlers.get(event) ?? []) l(...args);
      },
    };
    return client;
  }
  function run(
    argv: string[],
    broker = fakeBroker(),
    extra: Partial<Parameters<typeof main>[2]> = {},
    processEnv: NodeJS.ProcessEnv = {},
  ) {
    const exit = vi.fn();
    const connect = vi.fn(async () => broker);
    const done = main(argv, processEnv, { connect, exit, ...extra });
    return { exit, connect, broker, done };
  }
  const quiet = () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    return () => {
      log.mockRestore();
      err.mockRestore();
    };
  };

  it("refuses malformed arguments before connecting", async () => {
    const restore = quiet();
    try {
      const { exit, connect, done } = run(["--mqtt-url", "--once"]);
      await done;
      expect(exit).toHaveBeenCalledWith(2);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it.each([
    ["QoS 128", [{ topic: "ecowitt/grow", qos: 128 }]],
    ["no grant", undefined],
  ] as const)(
    "ends the client and exits 2 on a refused subscription (%s), in both modes",
    async (_l, grant) => {
      const restore = quiet();
      try {
        for (const argv of [["--once"], []]) {
          const { exit, broker, done } = run(argv, fakeBroker(grant as Grant));
          await done;
          broker.emit("connect");
          expect(exit).toHaveBeenCalledTimes(1);
          expect(exit).toHaveBeenCalledWith(2);
          expect(broker.ended).toBe(1);
        }
      } finally {
        restore();
      }
    },
  );

  it("refuses --live without approved config before connecting", async () => {
    const restore = quiet();
    try {
      const { exit, connect, done } = run(["--once", "--live"]);
      await done;
      expect(exit).toHaveBeenCalledWith(2);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it.each([
    [200, '{"accepted":true,"inserted":2}', 0],
    [200, '{"accepted":false,"reason":"no_eligible_tent"}', 1],
  ] as const)(
    "--live --once: one approved bearer POST through main, then shutdown and exit (Codex P2 at ed548103): %s %s",
    async (status, body, expectedExit) => {
      const restore = quiet();
      const fetchImpl = vi.fn(async () => new Response(body, { status }));
      try {
        const { exit, broker, done } = run(
          ["--live", "--once"],
          fakeBroker(),
          { fetchImpl: fetchImpl as unknown as typeof fetch },
          { ECOWITT_INGEST_URL: INGEST_URL, VERDANT_BRIDGE_TOKEN: FAKE_BRIDGE_TOKEN },
        );
        await done;
        broker.emit("connect");
        broker.emit("message", "ecowitt/grow", Buffer.from(GATEWAY_MESSAGE));
        await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
        expect(exit).toHaveBeenCalledWith(expectedExit);
        expect(broker.ended).toBe(1);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(INGEST_URL);
        expect(init.method).toBe("POST");
        expect(init.redirect).toBe("manual");
        expect((init.headers as Record<string, string>).Authorization).toBe(
          `Bearer ${FAKE_BRIDGE_TOKEN}`,
        );
        const sent = JSON.parse(String(init.body));
        expect(sent.PASSKEY).toBe(FAKE_PASSKEY);
        expect(sent.temp2f).toBe(81.68);
        // The bridge wrapper is stripped before forwarding.
        expect(sent).not.toHaveProperty("transport");
      } finally {
        restore();
      }
    },
  );

  it("--once: the claimed message decides the exit; a close or error after the claim does not abort it", async () => {
    const restore = quiet();
    try {
      const { exit, broker, done } = run(["--once"]);
      await done;
      broker.emit("connect");
      broker.emit("message", "ecowitt/grow", Buffer.from(GATEWAY_MESSAGE));
      // The job is still running: these must not end the run.
      broker.emit("close");
      broker.emit("error", new Error("socket hang up"));
      await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
      expect(exit).toHaveBeenCalledWith(0);
      expect(broker.ended).toBe(1);
    } finally {
      restore();
    }
  });

  it("--once: a close before any message exits 2", async () => {
    const restore = quiet();
    try {
      const { exit, broker, done } = run(["--once"]);
      await done;
      broker.emit("connect");
      broker.emit("close");
      expect(exit).toHaveBeenCalledWith(2);
      expect(broker.ended).toBe(1);
    } finally {
      restore();
    }
  });

  it("continuous mode keeps running through network errors and closes", async () => {
    const restore = quiet();
    try {
      const { exit, broker, done } = run([]);
      await done;
      broker.emit("connect");
      broker.emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
      broker.emit("close");
      broker.emit("offline");
      expect(exit).not.toHaveBeenCalled();
      expect(broker.ended).toBe(0);
    } finally {
      restore();
    }
  });

  it("registers the configured MQTT credentials so a topic echoing them is redacted", async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      lines.push(JSON.stringify(a));
    });
    try {
      const { done } = run([
        "--mqtt-url",
        "mqtt://broker-user-name:pw@h:1",
        "--topic",
        "t/broker-user-name",
      ]);
      await done;
      const startup = lines.find((l) => l.includes("startup")) ?? "";
      expect(startup).not.toContain("broker-user-name");
      expect(startup).toContain("t/(redacted)");
    } finally {
      log.mockRestore();
      setConfiguredSecrets([]);
    }
  });
});

// --- Inbound packet guard (Codex P2 on #2335; Matthew's scope at 11:37 UTC) ---

function memorySocket() {
  const written: Buffer[] = [];
  const socket = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      written.push(Buffer.from(chunk));
      callback();
    },
  });
  return { socket, written };
}

function remainingLength(n: number): number[] {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

/** One MQTT packet: type byte, remaining length, `bodyBytes` of body. */
function mqttPacket(type: number, bodyBytes: number): Buffer {
  return Buffer.concat([
    Buffer.from([type, ...remainingLength(bodyBytes)]),
    Buffer.alloc(bodyBytes, 0x61),
  ]);
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Feeds `chunks` through a guarded in-memory socket, as the broker would. */
async function throughGuard(chunks: Buffer[], maxPacketBytes?: number, endAfter = true) {
  const { socket, written } = memorySocket();
  const guarded = guardInboundStream(socket, maxPacketBytes);
  const received: Buffer[] = [];
  let error = null as (Error & { code?: unknown }) | null;
  let ended = false;
  guarded.on("data", (c: Buffer) => received.push(c));
  guarded.on("error", (e) => (error = e));
  guarded.on("end", () => (ended = true));
  for (const chunk of chunks) {
    socket.push(chunk);
    await tick();
  }
  if (endAfter) socket.push(null);
  for (let i = 0; i < 5; i++) await tick();
  return { socket, guarded, written, received: Buffer.concat(received), error, ended };
}

describe("inbound packet guard — real stream path, in-memory duplex", () => {
  it("passes legitimate traffic byte-exact, even one byte per chunk", async () => {
    const traffic = Buffer.concat([
      Buffer.from([0x20, 0x02, 0x00, 0x00]), // CONNACK
      Buffer.from([0x90, 0x03, 0x00, 0x01, 0x00]), // SUBACK
      mqttPacket(0x30, 300), // PUBLISH, two-byte remaining length
      Buffer.from([0xd0, 0x00]), // PINGRESP, zero-length body
    ]);
    const chunks = [...traffic].map((b) => Buffer.from([b]));
    const r = await throughGuard(chunks);
    expect(r.error).toBeNull();
    expect(r.ended).toBe(true);
    expect(r.received.equals(traffic)).toBe(true);
  });

  it("passes several whole frames in one chunk", async () => {
    const chunk = Buffer.concat([mqttPacket(0x30, 10), mqttPacket(0x30, 0), mqttPacket(0x30, 200)]);
    const r = await throughGuard([chunk]);
    expect(r.error).toBeNull();
    expect(r.received.equals(chunk)).toBe(true);
  });

  it("passes a packet of exactly the limit with its body fragmented", async () => {
    const packet = mqttPacket(0x30, 100 - 2); // 1 type + 1 length + 98 body = 100
    const r = await throughGuard(
      [packet.subarray(0, 2), packet.subarray(2, 40), packet.subarray(40)],
      100,
    );
    expect(r.error).toBeNull();
    expect(r.received.equals(packet)).toBe(true);
  });

  it("refuses a packet one byte over the limit before any of its body is read", async () => {
    const packet = mqttPacket(0x30, 100 - 1); // declares 101
    const r = await throughGuard([packet.subarray(0, 2), packet.subarray(2)], 100, false);
    expect(r.error?.code).toBe(GUARD_PACKET_TOO_LARGE);
    expect(r.received.length).toBe(0);
    expect(r.socket.destroyed).toBe(true);
  });

  it("refuses an oversized declaration split across chunks, at the last length byte", async () => {
    // 0x80 0x80 0x80 0x08 = 8 * 128^3 = 16 MiB declared.
    const r = await throughGuard(
      [Buffer.from([0x30, 0x80]), Buffer.from([0x80]), Buffer.from([0x80, 0x08])],
      undefined,
      false,
    );
    expect(r.error?.code).toBe(GUARD_PACKET_TOO_LARGE);
    // Only the two header fragments before the deciding byte reached the parser.
    expect(r.received.equals(Buffer.from([0x30, 0x80, 0x80]))).toBe(true);
  });

  it("uses MAX_INBOUND_PACKET_BYTES by default and refuses the first byte past it", async () => {
    const atLimit = Buffer.from([0x30, ...remainingLength(MAX_INBOUND_PACKET_BYTES - 4)]);
    expect(atLimit.length).toBe(4); // 1 type + 3 length bytes
    const ok = await throughGuard([atLimit], undefined, false);
    expect(ok.error).toBeNull();
    const over = Buffer.from([0x30, ...remainingLength(MAX_INBOUND_PACKET_BYTES - 3)]);
    const bad = await throughGuard([over], undefined, false);
    expect(bad.error?.code).toBe(GUARD_PACKET_TOO_LARGE);
  });

  it("refuses a whole chunk when a valid frame is followed by an oversized one", async () => {
    const first = mqttPacket(0x30, 10);
    const chunk = Buffer.concat([mqttPacket(0x30, 5), Buffer.from([0x30, 0xff, 0xff, 0x7f])]);
    const r = await throughGuard([first, chunk], undefined, false);
    expect(r.error?.code).toBe(GUARD_PACKET_TOO_LARGE);
    expect(r.received.equals(first)).toBe(true);
  });

  it("refuses a remaining length that runs past four bytes as malformed", async () => {
    const r = await throughGuard(
      [Buffer.from([0x30, 0x80, 0x80, 0x80, 0x80, 0x01])],
      undefined,
      false,
    );
    expect(r.error?.code).toBe(GUARD_MALFORMED_PACKET);
    expect(r.received.length).toBe(0);
  });

  it("delivers nothing more once a packet is refused", async () => {
    const r = await throughGuard(
      [Buffer.from([0x30, 0xff, 0xff, 0x7f]), mqttPacket(0x30, 4), mqttPacket(0x30, 4)],
      undefined,
      false,
    );
    expect(r.error?.code).toBe(GUARD_PACKET_TOO_LARGE);
    expect(r.received.length).toBe(0);
  });

  it("forwards writes to the socket and propagates socket errors", async () => {
    const { socket, written } = memorySocket();
    const guarded = guardInboundStream(socket);
    const errors: unknown[] = [];
    guarded.on("error", (e) => errors.push(e));
    await new Promise<void>((resolve) => guarded.write(Buffer.from([0xc0, 0x00]), () => resolve()));
    expect(Buffer.concat(written).equals(Buffer.from([0xc0, 0x00]))).toBe(true);
    socket.destroy(Object.assign(new Error("reset"), { code: "ECONNRESET" }));
    await tick();
    await tick();
    expect((errors[0] as { code?: unknown })?.code).toBe("ECONNRESET");
  });

  it("scanner tracks a body that ends mid-chunk and the next header after it", () => {
    const scan = createInboundPacketScanner(100);
    expect(scan(Buffer.from([0x30, 0x05, 0x61, 0x61]))).toBeNull();
    // Three body bytes finish the first packet; the next header declares 200.
    expect(scan(Buffer.from([0x61, 0x61, 0x61, 0x30, 0xc8, 0x01]))?.declaredBytes).toBe(203);
  });
});

describe("inbound packet guard — production wiring", () => {
  function fakeMqtt(options: { noStreamBuilder?: boolean } = {}) {
    const sockets: Duplex[] = [];
    const clients: any[] = [];
    const mod = {
      connect(url: string, opts: Record<string, unknown>) {
        const client: any = new EventEmitter();
        client.url = url;
        client.opts = opts;
        client.connectCalls = 0;
        // Mirrors MQTT.js 5.16.1 client.js: with `resubscribe` on (its default)
        // a topic is remembered, and a repeat subscribe to it answers `[]`
        // without a SUBACK. With `resubscribe: false` every call is a real one.
        const remembered = new Set<string>();
        client.subscribe = vi.fn((topic: string, cb?: (err: null, g: unknown[]) => void) => {
          if (opts.resubscribe !== false && remembered.has(topic)) return cb?.(null, []);
          if (opts.resubscribe !== false) remembered.add(topic);
          cb?.(null, [{ topic, qos: 0 }]);
        });
        client.end = vi.fn();
        if (!options.noStreamBuilder) {
          client.streamBuilder = () => {
            const { socket } = memorySocket();
            sockets.push(socket);
            return socket;
          };
        }
        // Mirrors MQTT.js 5.16.1 client.js: build the stream on every
        // (re)connect, read from it, and re-emit stream errors that carry a code.
        client.connect = () => {
          client.connectCalls += 1;
          client.stream = client.streamBuilder(client);
          client.stream.on("data", () => {});
          client.stream.on("error", (e: Error & { code?: unknown }) => {
            if (e.code) client.emit("error", e);
          });
          return client;
        };
        clients.push(client);
        return client;
      },
    };
    return { mod, sockets, clients };
  }

  const baseFlags = () => parseFlags([], {});
  const baseEnv = () => readEnv({});

  it("production deps connect through connectMqtt", () => {
    expect(PRODUCTION_DEPS.connect).toBe(connectMqtt);
  });

  it("creates the client with manualConnect and connects through the guard", async () => {
    const { mod, sockets, clients } = fakeMqtt();
    const client: any = await connectMqtt(baseFlags(), baseEnv(), async () => mod);
    expect(clients[0].opts.manualConnect).toBe(true);
    expect(clients[0].opts.resubscribe).toBe(false);
    // A no-op MQTT.js logger: DEBUG=mqttjs:client cannot print the CONNECT
    // password or a raw payload (Codex P1 on #2335 at d722d381).
    const log = clients[0].opts.log as ((...a: unknown[]) => unknown) | undefined;
    expect(typeof log).toBe("function");
    expect(log?.("CONNECT", { password: "synthetic" })).toBeUndefined();
    expect(client.connectCalls).toBe(1);
    expect(sockets).toHaveLength(1);
    expect(client.stream).not.toBe(sockets[0]);
    const errors: Array<Error & { code?: unknown }> = [];
    client.on("error", (e: Error & { code?: unknown }) => errors.push(e));
    sockets[0].push(Buffer.from([0x30, 0xff, 0xff, 0x7f]));
    await tick();
    await tick();
    expect(errors[0]?.code).toBe(GUARD_PACKET_TOO_LARGE);
    expect(sockets[0].destroyed).toBe(true);
  });

  it("guards the stream of every reconnect, not only the first", async () => {
    const { mod, sockets } = fakeMqtt();
    const client: any = await connectMqtt(baseFlags(), baseEnv(), async () => mod);
    client.connect();
    expect(sockets).toHaveLength(2);
    expect(client.stream).not.toBe(sockets[1]);
    client.on("error", () => {});
    sockets[1].push(Buffer.from([0x30, 0x80, 0x80, 0x80, 0x80, 0x01]));
    await tick();
    await tick();
    expect(sockets[1].destroyed).toBe(true);
  });

  it("main wiring: continuous mode resubscribes for real after an ordinary reconnect (Codex P2 at ac8be57b)", async () => {
    const { mod, clients } = fakeMqtt();
    const exit = vi.fn();
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await main([], {}, { connect: (f, e) => connectMqtt(f, e, async () => mod), exit });
      const client = clients[0];
      client.emit("connect");
      client.emit("close");
      client.emit("offline");
      client.emit("connect");
      expect(client.subscribe).toHaveBeenCalledTimes(2);
      expect(exit).not.toHaveBeenCalled();
      expect(lines.filter((l) => l.includes("] subscribed"))).toHaveLength(2);
      client.emit("message", "ecowitt/grow", Buffer.from(GATEWAY_MESSAGE));
      await vi.waitFor(() => expect(lines.some((l) => l.includes("] dry_run"))).toBe(true));
      expect(exit).not.toHaveBeenCalled();
      expect(client.end).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });

  it("refuses to connect when the client has no stream builder to guard", async () => {
    const { mod, clients } = fakeMqtt({ noStreamBuilder: true });
    await expect(connectMqtt(baseFlags(), baseEnv(), async () => mod)).rejects.toThrow(
      /no stream builder/,
    );
    expect(clients[0].end).toHaveBeenCalled();
  });

  it("main ends a continuous run with exit 2 when the guard refuses a packet", async () => {
    const { mod, sockets, clients } = fakeMqtt();
    const exit = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await main([], {}, { connect: (f, e) => connectMqtt(f, e, async () => mod), exit });
      sockets[0].push(Buffer.from([0x30, 0xff, 0xff, 0x7f]));
      await tick();
      await tick();
    } finally {
      logSpy.mockRestore();
    }
    expect(exit).toHaveBeenCalledWith(2);
    expect(clients[0].end).toHaveBeenCalled();
  });
});

describe("attachClientLifecycle (continuous reconnect before SUBACK)", () => {
  afterEach(() => vi.useRealTimers());

  it("gives a reconnect its own SUBACK deadline after a close before SUBACK (Codex P1 at 95f5dfe7)", () => {
    vi.useFakeTimers();
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const pending: Array<
      (err?: Error | null, granted?: ReadonlyArray<{ topic: string; qos: number }>) => void
    > = [];
    const client = {
      on: (event: string, listener: (...args: unknown[]) => void) => handlers.set(event, listener),
      subscribe: (_topic: string, cb?: (typeof pending)[number]) => void (cb && pending.push(cb)),
    };
    const onFatal = vi.fn();
    attachClientLifecycle(client, { flags: flags({ once: false }), onFatal, connectTimeoutMs: 40 });
    handlers.get("connect")?.();
    vi.advanceTimersByTime(25);
    handlers.get("close")?.();
    vi.advanceTimersByTime(5);
    handlers.get("connect")?.();
    vi.advanceTimersByTime(20);
    // The dropped connection's callback is stale: it must neither fail nor clear the new deadline.
    pending[0](new Error("Connection closed"));
    expect(onFatal).not.toHaveBeenCalled();
    pending[1](null, [{ topic: "ecowitt/grow", qos: 0 }]);
    vi.advanceTimersByTime(1_000);
    expect(onFatal).not.toHaveBeenCalled();
  });
});

describe("admission before decoding (Codex P2 on #2335 at 95f5dfe7)", () => {
  function spiedFrame() {
    const frame = Buffer.from(SANITY_MESSAGE, "utf8");
    const toString = vi.spyOn(frame, "toString");
    return { frame, toString };
  }

  it("never decodes a frame the full backlog drops", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const handler = createMessageHandler({
        flags: flags(),
        env: readEnv({}),
        onDone: () => {},
        runner: { submit: () => "dropped", inflight: MAX_INFLIGHT, backlog: MAX_BACKLOG },
      });
      const { frame, toString } = spiedFrame();
      handler("ecowitt/grow", frame);
      expect(toString).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("decodes an accepted frame when the runner starts it", async () => {
    let started: (() => Promise<void>) | null = null;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const handler = createMessageHandler({
        flags: flags(),
        env: readEnv({}),
        onDone: () => {},
        runner: {
          submit: (job) => {
            started = job;
            return "queued";
          },
          inflight: MAX_INFLIGHT,
          backlog: 0,
        },
      });
      const { frame, toString } = spiedFrame();
      handler("ecowitt/grow", frame);
      expect(toString).not.toHaveBeenCalled();
      await started!();
      expect(toString).toHaveBeenCalledWith("utf8");
    } finally {
      log.mockRestore();
    }
  });
});

describe("dateutc matches what ecowitt-ingest accepts (Codex P2 on #2335 at 95f5dfe7)", () => {
  const NOW = new Date("2026-10-22T12:00:00.000Z");
  const CASES = [
    "2026-10-22 05:27:14",
    "2026-10-22T05:27:14",
    "2026-02-30 05:27:14",
    "2026-02-29 00:00:00",
    "2024-02-29 00:00:00",
    "2026-13-01 00:00:00",
    "2026-10-22 24:00:00",
    "1970-01-01 00:00:00",
    "2019-12-31 23:59:59",
    "2020-01-01 00:00:00",
    "2026-10-23 12:00:00",
    "2026-10-23 12:00:01",
    "2026-10-22 5:27:14",
  ];

  it.each(CASES)("agrees with parseEcoWittDateUtc for %s", (value) => {
    expect(dateutcAccepted(value, NOW)).toBe(parseEcoWittDateUtc(value, NOW) !== null);
  });

  it("a dry run refuses a calendar-invalid date the ingest parser rejects", () => {
    const out = prepareForwardPayload(
      JSON.stringify({ PASSKEY: FAKE_PASSKEY, dateutc: "2026-02-30 05:27:14", temp2f: 81.68 }),
      NOW,
    );
    expect(out).toMatchObject({ ok: false, reason: "invalid_dateutc" });
  });
});

describe("the guard's readable buffer bound is what the docs state (Codex P2 on #2335 at 95f5dfe7)", () => {
  it("holds one whole oversized chunk of valid frames, then pauses the socket", () => {
    const socket = new Duplex({
      read() {},
      write(_c, _e, cb) {
        cb();
      },
    });
    const guarded = guardInboundStream(socket);
    // 50,000 PINGRESP frames (0xD0 0x00): every packet valid, 100,000 bytes.
    const chunk = Buffer.alloc(100_000);
    for (let i = 0; i < chunk.length; i += 2) chunk[i] = 0xd0;
    socket.emit("data", chunk);
    expect(guarded.readableHighWaterMark).toBe(64 * 1024);
    expect(guarded.readableLength).toBe(100_000);
    expect(socket.isPaused()).toBe(true);
    guarded.destroy();
  });
});
