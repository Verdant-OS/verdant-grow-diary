#!/usr/bin/env -S bun run
/**
 * One-command smoke checker for the local EcoWitt HTTP → MQTT bridge.
 *
 * - Does NOT call the Verdant ingest webhook.
 * - Does NOT require any bridge token or Supabase env values.
 * - Does NOT write to a database.
 * - Requires the HTTP bridge to already be running.
 *
 * Flow:
 *   1. POST a clearly-labeled FAKE LOCAL TEST payload to the bridge.
 *   2. Subscribe to ecowitt/grow on the local broker.
 *   3. PASS only if the fake payload appears on MQTT.
 *
 * Exit code 0 on PASS, 1 on FAIL.
 */

export const FAKE_TEST_LABEL = "FAKE LOCAL TEST";
export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8080/data/report";
export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";
export const FAKE_BODY = "temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721";

export const START_BRIDGE_HINT = "bun run dev:ecowitt-http-bridge";

export interface SmokeOptions {
  bridgeUrl?: string;
  mqttUrl?: string;
  topic?: string;
  timeoutMs?: number;
}

export interface SmokeResult {
  ok: boolean;
  reason: string;
  matched?: boolean;
}

/** Pure assembly of the POST request init (used by tests). */
export function buildFakePostInit(): { url: string; init: RequestInit; label: string } {
  return {
    url: DEFAULT_BRIDGE_URL,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: FAKE_BODY,
    },
    label: FAKE_TEST_LABEL,
  };
}

/**
 * Run the smoke flow with injectable dependencies for tests.
 */
export async function runSmoke(
  opts: SmokeOptions,
  deps: {
    fetchImpl: typeof fetch;
    subscribe: (
      mqttUrl: string,
      topic: string,
      onMessage: (payload: string) => void,
    ) => Promise<{ close: () => Promise<void> }>;
  },
): Promise<SmokeResult> {
  const bridgeUrl = opts.bridgeUrl ?? DEFAULT_BRIDGE_URL;
  const mqttUrl = opts.mqttUrl ?? DEFAULT_MQTT_URL;
  const topic = opts.topic ?? DEFAULT_MQTT_TOPIC;
  const timeoutMs = opts.timeoutMs ?? 3000;

  // Subscribe first so we don't miss the message.
  let sub: { close: () => Promise<void> } | null = null;
  let received: string | null = null;
  try {
    sub = await deps.subscribe(mqttUrl, topic, (payload) => {
      if (!received) received = payload;
    });
  } catch (e) {
    return {
      ok: false,
      reason: `mqtt_unreachable: ${e instanceof Error ? e.message : "unknown"} — start Mosquitto on ${mqttUrl}`,
    };
  }

  // POST the FAKE LOCAL TEST payload to the bridge.
  let httpStatus = 0;
  try {
    const res = await deps.fetchImpl(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: FAKE_BODY,
    });
    httpStatus = res.status;
  } catch (e) {
    await sub.close();
    return {
      ok: false,
      reason: `bridge_down: ${e instanceof Error ? e.message : "unknown"} — start it with: ${START_BRIDGE_HINT}`,
    };
  }
  if (httpStatus !== 200) {
    await sub.close();
    return { ok: false, reason: `bridge_http_${httpStatus} — start it with: ${START_BRIDGE_HINT}` };
  }

  // Wait briefly for MQTT message.
  const deadline = Date.now() + timeoutMs;
  while (!received && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await sub.close();

  if (!received) {
    return { ok: false, reason: "no_mqtt_message — check Mosquitto and bridge publish logs", matched: false };
  }
  // Confirm payload looks like our FAKE LOCAL TEST.
  try {
    const obj = JSON.parse(received) as Record<string, unknown>;
    const matchesFake = obj.temp1f === 77.4 && obj.humidity1 === 58;
    return matchesFake
      ? { ok: true, reason: `pass — ${FAKE_TEST_LABEL} received on topic`, matched: true }
      : { ok: false, reason: "message_did_not_match_fake_payload", matched: false };
  } catch {
    return { ok: false, reason: "mqtt_message_not_json", matched: false };
  }
}

async function defaultSubscribe(
  mqttUrl: string,
  topic: string,
  onMessage: (payload: string) => void,
): Promise<{ close: () => Promise<void> }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqtt = await (Function("m", "return import(m)") as any)("mqtt");
  } catch {
    throw new Error("mqtt package not installed; run `bun add mqtt`");
  }
  const client = mqtt.connect(mqttUrl, { reconnectPeriod: 0, connectTimeout: 2000 });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", (e: Error) => reject(e));
  });
  await new Promise<void>((resolve, reject) =>
    client.subscribe(topic, (e: Error | undefined) => (e ? reject(e) : resolve())),
  );
  client.on("message", (_t: string, buf: Buffer) => onMessage(buf.toString("utf8")));
  return {
    close: () => new Promise<void>((resolve) => client.end(false, {}, () => resolve())),
  };
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[ecowitt-bridge-smoke] starting — ${FAKE_TEST_LABEL}`);
  const result = await runSmoke(
    {},
    { fetchImpl: fetch, subscribe: defaultSubscribe },
  );
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-bridge-smoke] PASS:", result.reason);
    // eslint-disable-next-line no-console
    console.log("[ecowitt-bridge-smoke] next: bun run dev:ecowitt-mqtt:dry-run -- --once --write-report");
    process.exit(0);
  } else {
    // eslint-disable-next-line no-console
    console.error("[ecowitt-bridge-smoke] FAIL:", result.reason);
    process.exit(1);
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-local-bridge-smoke");

if (invokedDirectly) {
  void main();
}
