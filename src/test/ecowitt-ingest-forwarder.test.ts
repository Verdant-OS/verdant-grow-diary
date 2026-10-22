/**
 * Behaviour of scripts/dev/ecowitt-ingest-forwarder.ts: the PC-side step that
 * forwards bridge-published gateway uploads to the `ecowitt-ingest` edge
 * function. Dry-run must never touch the network; live must fail closed on
 * bad config, send exactly one bearer-authenticated JSON POST per message,
 * and never leak PASSKEY / MAC / token into logs or reports.
 */
import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_INGEST_URLS,
  MAX_MESSAGE_BYTES,
  attachClientLifecycle,
  buildForwardRequest,
  createMessageHandler,
  fullJitterDelayMs,
  handleMessage,
  isRetryableStatus,
  liveConfigProblems,
  onceExitCode,
  parseFlags,
  prepareForwardPayload,
  readEnv,
  redactForLog,
  redactString,
  summarizeResponse,
  type ForwarderEnv,
  type ForwarderFlags,
} from "../../scripts/dev/ecowitt-ingest-forwarder";

// Fake credentials, assembled at runtime so nothing in this file reads as a real one.
const FAKE_PASSKEY = ["FAKE", "TEST", "PASSKEY", "NOT", "REAL"].join("_");
const FAKE_BRIDGE_TOKEN = ["vbt", "FAKE_TEST_TOKEN_0123456789"].join("_");
const NOT_A_BRIDGE_TOKEN = ["sk", "live", "not_a_bridge_token"].join("_");
// The approved destination; any other host is refused (Codex P1 at 79ce2801).
const INGEST_URL = APPROVED_INGEST_URLS[0];
const NO_SLEEP = { sleep: async () => {} };

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

  it("drops a stationtype that carries the PASSKEY and caps summary strings (Codex P1)", () => {
    const copied = prepareForwardPayload(
      JSON.stringify({
        PASSKEY: FAKE_PASSKEY,
        dateutc: "2026-10-22 05:27:14",
        stationtype: FAKE_PASSKEY,
      }),
    );
    expect(copied.ok && copied.summary.station).toBeNull();
    const long = prepareForwardPayload(
      JSON.stringify({
        PASSKEY: FAKE_PASSKEY,
        dateutc: `2026-10-22 05:27:14${" ".repeat(100)}`,
        stationtype: "S".repeat(200),
      }),
    );
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(long.summary.station).toHaveLength(64);
      expect(long.summary.dateutc.length).toBeLessThanOrEqual(64);
    }
  });

  it("omits a non-string stationtype instead of coercing it", () => {
    const text = JSON.stringify({
      PASSKEY: FAKE_PASSKEY,
      dateutc: "2026-10-22 05:27:14",
      stationtype: HOSTILE,
    });
    const out = prepareForwardPayload(text);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.summary.station).toBeNull();
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
    expect(init.redirect).toBe("error");
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
    });
    expect(summarizeResponse(401, "not json")).toEqual({
      status: 401,
      accepted: null,
      inserted: null,
      skipped_duplicate: null,
      reason: null,
    });
  });

  it("--once exits 1 when accepted: true rides a non-2xx status (Codex P2 at 79ce2801)", () => {
    const summary = {
      air_channels: [2],
      soil_channels: [],
      key_count: 5,
      dateutc: "x",
      station: null,
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
      station: null,
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
    expect(req.init.redirect).toBe("error");
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

  it("redacts broker URL credentials in the startup fields", () => {
    expect(redactString(`wss://broker/mqtt?token=${FAKE_BRIDGE_TOKEN}`)).toBe(
      "wss://broker/mqtt?token=(redacted)",
    );
    expect(redactString("mqtt://grower:hunter2@192.168.68.67:1883")).toBe(
      "mqtt://(redacted)@192.168.68.67:1883",
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

  it("logs a handler failure and exits 1 instead of leaving an unhandled rejection", async () => {
    const onDone = vi.fn();
    const handle = createMessageHandler({
      flags: flags({ once: true, writeReport: true }),
      env: LIVE_ENV,
      writeReportImpl: async () => {
        throw new Error("disk full");
      },
      onDone,
    });
    handle("ecowitt/grow", GATEWAY_MESSAGE);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
  });
});

describe("attachClientLifecycle (--once broker failures)", () => {
  function fakeClient() {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    let subscribeErr: Error | null = null;
    return {
      on: (event: string, listener: (...args: unknown[]) => void) => handlers.set(event, listener),
      subscribe: (_topic: string, cb?: (err?: Error | null) => void) => cb?.(subscribeErr),
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
