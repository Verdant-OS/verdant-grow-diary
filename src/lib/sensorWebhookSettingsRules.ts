/**
 * Pure helpers for the Tent Sensor Webhook Settings panel.
 *
 * Presenter-only support: builds the public webhook URL, an allow-listed
 * source-label table, and a copy-to-clipboard cURL example. Tokens are
 * never persisted by this module — callers pass the live session JWT in
 * at render time and we render a string. No I/O, no React, no Supabase.
 *
 * Webhook sensor ingest is read-only. It never triggers alerts, the
 * Action Queue, AI Doctor, or any device control.
 */

import { WEBHOOK_ALLOWED_SOURCES, type WebhookSource } from "./sensorWebhookIngestRules";

export interface WebhookSourceLabel {
  /** Value sent in the payload's `source` field. */
  source: WebhookSource;
  /** Grower-visible label. */
  label: string;
  /** Short description of the typical bridge pattern. */
  hint: string;
}

const SOURCE_LABELS: Record<WebhookSource, { label: string; hint: string }> = {
  webhook_generic: { label: "Webhook (generic)", hint: "Custom scripts, untyped bridges" },
  pi_bridge: { label: "Pi bridge", hint: "Raspberry Pi forwarding readings" },
  node_red_bridge: { label: "Node-RED bridge", hint: "Node-RED flow → webhook" },
  esp32_arduino: { label: "ESP32 (Arduino)", hint: "ESP32 firmware posting directly" },
  esp32_arduino_sht31: { label: "ESP32 + SHT31", hint: "ESP32 with SHT31 temp/RH sensor" },
  esp32_esphome: { label: "ESPHome", hint: "ESPHome device → webhook" },
  esp32_mqtt_bridge: { label: "MQTT bridge (ESP32)", hint: "MQTT broker → local bridge → webhook" },
  home_assistant_bridge: { label: "Home Assistant", hint: "HA rest_command → webhook" },
  ha_forwarded: { label: "HA forwarded", hint: "Readings relayed from Home Assistant" },
};

export function getSupportedWebhookSourceLabels(): WebhookSourceLabel[] {
  return WEBHOOK_ALLOWED_SOURCES.map((source) => ({
    source,
    label: SOURCE_LABELS[source].label,
    hint: SOURCE_LABELS[source].hint,
  }));
}

/**
 * Build the public webhook URL from a Supabase project URL.
 * Returns null when the project URL is missing/invalid — callers should
 * render a fallback empty state.
 */
export function buildSensorWebhookUrl(supabaseUrl: string | null | undefined): string | null {
  if (!supabaseUrl || typeof supabaseUrl !== "string") return null;
  const trimmed = supabaseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return `${trimmed}/functions/v1/sensor-ingest-webhook`;
}

export const SESSION_TOKEN_PLACEHOLDER = "<YOUR_SESSION_TOKEN>";

export interface BuildCurlExampleOptions {
  webhookUrl: string;
  tentId: string;
  /**
   * Live session JWT — held only in-memory by the caller. By default the
   * helper IGNORES this value and always renders the safe placeholder so
   * the snippet is screenshot/doc/share-safe (AUD-004). The live token is
   * only interpolated when `revealToken: true` is explicitly passed, which
   * the UI gates behind an explicit user click.
   */
  sessionToken: string | null;
  /**
   * Explicit opt-in to substitute the live session JWT into the snippet.
   * Defaults to false. Never default this to true — the on-screen example
   * must remain safe to screenshot.
   */
  revealToken?: boolean;
}

/**
 * Build a copy-paste cURL example. The on-screen / default snippet ALWAYS
 * uses a `<YOUR_SESSION_TOKEN>` placeholder regardless of whether a live
 * session token is available, so the panel is safe to screenshot or paste
 * into docs. The live token is only interpolated when the caller passes
 * `revealToken: true` (used behind an explicit user action — see
 * TentSensorWebhookSettingsCard).
 *
 * Session JWTs are short-lived and tied to the current browser. For
 * long-running clients (Raspberry Pi / ESP32 / Node-RED / Home Assistant),
 * prefer a bridge token instead — see TentSensorBridgeTokenCard.
 */
export function buildSensorWebhookCurlExample(opts: BuildCurlExampleOptions): string {
  const { webhookUrl, tentId, sessionToken, revealToken = false } = opts;
  const tokenForSnippet = revealToken && sessionToken && sessionToken.length > 0
    ? sessionToken
    : SESSION_TOKEN_PLACEHOLDER;
  const body = {
    tent_id: tentId || "<TENT_ID>",
    source: "webhook_generic",
    captured_at: "2026-05-27T20:00:00Z",
    metrics: {
      temp_f: 76.4,
      humidity_percent: 58,
      vpd_kpa: 1.18,
    },
    metadata: {
      device_label: "Custom script",
      source_app: "example",
    },
  };
  return [
    `curl -X POST '${webhookUrl}' \\`,
    `  -H 'Authorization: Bearer ${tokenForSnippet}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(body)}'`,
  ].join("\n");
}
