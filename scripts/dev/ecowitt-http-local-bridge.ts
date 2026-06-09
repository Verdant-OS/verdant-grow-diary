#!/usr/bin/env -S bun run
/**
 * Local EcoWitt HTTP → MQTT bridge (Windows-safe workaround).
 *
 * Purpose:
 *   Replace Python `ecowitt2mqtt` on machines where the asyncio
 *   `add_reader` Windows Proactor incompatibility prevents the Python
 *   bridge from publishing. Receives EcoWitt "Customized upload" POSTs
 *   on a local HTTP endpoint and republishes them as JSON onto a local
 *   MQTT broker so the existing Verdant dry-run runner can consume
 *   them downstream.
 *
 * Hard safety rules (enforced by tests):
 *   - No Supabase SDK import. No service_role. No direct DB writes.
 *   - No Action Queue writes. No alert creation. No automation.
 *   - No call to the Verdant ingest webhook. No bridge token use.
 *   - Logs never include raw env secrets or MQTT password.
 *   - This bridge only moves local HTTP -> local MQTT.
 *
 * CLI flags:
 *   --port <n>          (default 8080 or ECOWITT_HTTP_PORT)
 *   --endpoint <path>   (default /data/report or ECOWITT_HTTP_ENDPOINT)
 *   --mqtt-url <url>    (default mqtt://127.0.0.1:1883 or ECOWITT_MQTT_URL)
 *   --topic <topic>     (default ecowitt/grow or ECOWITT_MQTT_TOPIC)
 *   --dry-run           Parse + log only. Do not publish to MQTT.
 *   --once              Exit after first successfully handled POST.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export const DEFAULT_HTTP_PORT = 8080;
export const DEFAULT_HTTP_ENDPOINT = "/data/report";
export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";
export const TRANSPORT = "ecowitt_http_local_bridge";

export interface BridgeFlags {
  port: number;
  endpoint: string;
  mqttUrl: string;
  topic: string;
  dryRun: boolean;
  once: boolean;
  showRaw: boolean;
  mqttUsername: string | null;
  mqttPassword: string | null;
}

export function parseFlags(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): BridgeFlags {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
    return undefined;
  };
  const portRaw = get("--port") ?? env.ECOWITT_HTTP_PORT;
  const port = portRaw ? Number(portRaw) : DEFAULT_HTTP_PORT;
  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_HTTP_PORT,
    endpoint: get("--endpoint") ?? env.ECOWITT_HTTP_ENDPOINT ?? DEFAULT_HTTP_ENDPOINT,
    mqttUrl: get("--mqtt-url") ?? env.ECOWITT_MQTT_URL ?? DEFAULT_MQTT_URL,
    topic: get("--topic") ?? env.ECOWITT_MQTT_TOPIC ?? DEFAULT_MQTT_TOPIC,
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    showRaw: argv.includes("--show-raw"),
    mqttUsername: env.ECOWITT_MQTT_USERNAME ?? null,
    mqttPassword: env.ECOWITT_MQTT_PASSWORD ?? null,
  };
}

/** Strip userinfo from an mqtt:// URL so logs never leak credentials. */
export function redactBrokerUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/** Normalize trailing slash: /data/report and /data/report/ both match. */
export function pathMatches(requestPath: string, endpoint: string): boolean {
  const strip = (s: string) => s.replace(/\/+$/g, "") || "/";
  // Drop querystring.
  const onlyPath = requestPath.split("?")[0] ?? requestPath;
  return strip(onlyPath) === strip(endpoint);
}

/**
 * Parse an EcoWitt POST body into a plain key/value object.
 * Supports application/x-www-form-urlencoded (default EcoWitt customized
 * upload format) and JSON for manual testing.
 */
export function parseEcowittBody(
  body: string,
  contentType: string | undefined,
): Record<string, string | number> | null {
  const ct = (contentType ?? "").toLowerCase();
  if (!body || body.length === 0) return null;

  try {
    if (ct.includes("application/json")) {
      const obj = JSON.parse(body) as Record<string, unknown>;
      if (!obj || typeof obj !== "object") return null;
      const out: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "number" || typeof v === "string") out[k] = v;
        else if (v != null) out[k] = String(v);
      }
      return Object.keys(out).length > 0 ? out : null;
    }
  } catch {
    return null;
  }

  // Form-urlencoded or raw key=value&key=value (EcoWitt default).
  const out: Record<string, string | number> = {};
  for (const pair of body.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, " ")).trim();
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
    if (k.length === 0) continue;
    const num = Number(v);
    out[k] = Number.isFinite(num) && v.trim() !== "" ? num : v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface MqttMessage {
  topic: string;
  payload: string;
  metricKeys: string[];
  receivedAt: string;
}

/** Build the JSON message published to MQTT for the dry-run runner. */
export function buildMqttMessage(
  parsed: Record<string, string | number>,
  topic: string,
  now: Date = new Date(),
): MqttMessage {
  const receivedAt = now.toISOString();
  const message = {
    ...parsed,
    received_at: receivedAt,
    transport: TRANSPORT,
    topic,
  };
  const metricKeys = Object.keys(parsed).filter(
    (k) => typeof parsed[k] === "number",
  );
  return {
    topic,
    payload: JSON.stringify(message),
    metricKeys,
    receivedAt,
  };
}

export interface MqttPublisher {
  publish(topic: string, payload: string): Promise<void>;
  end(): Promise<void>;
}

/** Test seam: callers may inject a fake publisher. */
export type PublisherFactory = (flags: BridgeFlags) => Promise<MqttPublisher>;

const defaultPublisherFactory: PublisherFactory = async (flags) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqtt = await (Function("m", "return import(m)") as any)("mqtt");
  } catch {
    throw new Error(
      "mqtt package not installed. Run `bun add mqtt` or use --dry-run.",
    );
  }
  const client = mqtt.connect(flags.mqttUrl, {
    username: flags.mqttUsername ?? undefined,
    password: flags.mqttPassword ?? undefined,
    reconnectPeriod: 5000,
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", (e: Error) => reject(e));
  });
  return {
    publish: (topic, payload) =>
      new Promise<void>((resolve, reject) =>
        client.publish(topic, payload, (e: Error | undefined) =>
          e ? reject(e) : resolve(),
        ),
      ),
    end: () => new Promise<void>((resolve) => client.end(false, {}, () => resolve())),
  };
};

export interface HandleResult {
  status: number;
  body: string;
  published: boolean;
  metricKeys: string[];
}

/**
 * Pure-ish request handler used by the HTTP server AND tests.
 * Returns an HTTP-shaped result and (optionally) publishes via the
 * provided publisher. Never touches Supabase, never calls fetch().
 */
export async function handleRequest(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: string },
  flags: BridgeFlags,
  publisher: MqttPublisher | null,
  now: Date = new Date(),
): Promise<HandleResult> {
  if ((req.method ?? "").toUpperCase() !== "POST") {
    return { status: 405, body: "method_not_allowed", published: false, metricKeys: [] };
  }
  const path = req.url ?? "/";
  if (!pathMatches(path, flags.endpoint)) {
    return { status: 404, body: "not_found", published: false, metricKeys: [] };
  }
  const ct = req.headers["content-type"];
  const contentType = Array.isArray(ct) ? ct[0] : ct;
  const parsed = parseEcowittBody(req.body, contentType);
  if (!parsed) {
    return { status: 400, body: "invalid_payload", published: false, metricKeys: [] };
  }
  const msg = buildMqttMessage(parsed, flags.topic, now);

  if (flags.dryRun || !publisher) {
    safeLog("dry-run parsed", {
      path,
      topic: flags.topic,
      metric_keys: msg.metricKeys,
      published: false,
    });
    return { status: 200, body: "dry_run_ok", published: false, metricKeys: msg.metricKeys };
  }

  try {
    await publisher.publish(msg.topic, msg.payload);
  } catch (e) {
    safeLog("publish_error", { topic: flags.topic, error: e instanceof Error ? e.message : "unknown" });
    return { status: 502, body: "mqtt_publish_failed", published: false, metricKeys: msg.metricKeys };
  }
  safeLog("published", {
    path,
    topic: flags.topic,
    metric_keys: msg.metricKeys,
    published: true,
  });
  return { status: 200, body: "ok", published: true, metricKeys: msg.metricKeys };
}

function safeLog(event: string, fields: Record<string, unknown>): void {
  // Defensive redaction — never echo MQTT password or token-like strings.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/password|token|secret/i.test(k)) safe[k] = "(redacted)";
    else if (typeof v === "string" && /^(vbt_|sk_|sbp_)/.test(v)) safe[k] = "(redacted)";
    else safe[k] = v;
  }
  // eslint-disable-next-line no-console
  console.log(`[ecowitt-http-bridge] ${event}`, safe);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startServer(
  flags: BridgeFlags,
  publisherFactory: PublisherFactory = defaultPublisherFactory,
): Promise<{ close: () => Promise<void> }> {
  const publisher: MqttPublisher | null = flags.dryRun ? null : await publisherFactory(flags);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    const result = await handleRequest(
      {
        method: req.method,
        url: req.url,
        headers: req.headers as Record<string, string | string[] | undefined>,
        body,
      },
      flags,
      publisher,
    );
    res.statusCode = result.status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(result.body);
    if (flags.once && result.status === 200) {
      setTimeout(() => {
        void (async () => {
          await publisher?.end();
          server.close();
          process.exit(0);
        })();
      }, 50);
    }
  });

  await new Promise<void>((resolve) => server.listen(flags.port, "0.0.0.0", () => resolve()));
  safeLog("listening", {
    port: flags.port,
    endpoint: flags.endpoint,
    topic: flags.topic,
    broker: flags.mqttUrl,
    dry_run: flags.dryRun,
    mqtt_password: flags.mqttPassword ? "(redacted)" : "(none)",
  });

  return {
    close: () =>
      new Promise<void>((resolve) => {
        void publisher?.end();
        server.close(() => resolve());
      }),
  };
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-http-local-bridge");

if (invokedDirectly) {
  void startServer(parseFlags(process.argv.slice(2)));
}
