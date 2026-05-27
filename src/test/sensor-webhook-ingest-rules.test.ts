import { describe, expect, it } from "vitest";
import {
  normalizeWebhookIngestPayload,
  sanitizeRawPayload,
  WEBHOOK_ALLOWED_SOURCES,
  isWebhookSource,
} from "@/lib/sensorWebhookIngestRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-05-26T20:05:00Z");
const VALID_TS = "2026-05-26T20:00:00Z";

function base(over: Record<string, unknown> = {}) {
  return {
    tent_id: TENT,
    source: "esp32_arduino_sht31",
    captured_at: VALID_TS,
    metrics: { temp_f: 76.4, humidity_percent: 58 },
    metadata: { device_id: "esp32-canopy-1", sensor_model: "SHT31" },
    ...over,
  } as Record<string, unknown>;
}

describe("sensorWebhookIngestRules", () => {
  it("normalizes a full valid payload into per-metric rows", () => {
    const r = normalizeWebhookIngestPayload(
      base({
        metrics: {
          temp_f: 76.4,
          humidity_percent: 58,
          vpd_kpa: 1.18,
          ph: 6.2,
          ec: 1.4,
          co2_ppm: 722,
          ppfd: 510,
        },
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(7);
    const metrics = r.rows.map((row) => row.metric).sort();
    expect(metrics).toEqual(
      ["co2_ppm", "ec", "humidity_pct", "ph", "ppfd", "temperature_c", "vpd_kpa"].sort(),
    );
    // Source preserved verbatim.
    expect(new Set(r.rows.map((row) => row.source))).toEqual(new Set(["esp32_arduino_sht31"]));
    // temp_f → C conversion.
    const tempRow = r.rows.find((row) => row.metric === "temperature_c")!;
    expect(Number(tempRow.value)).toBeCloseTo(24.667, 2);
    // device_id from metadata.
    expect(tempRow.device_id).toBe("esp32-canopy-1");
    // captured_at preserved.
    expect(tempRow.captured_at).toBe(new Date(VALID_TS).toISOString());
  });

  it("rejects missing captured_at", () => {
    const r = normalizeWebhookIngestPayload(base({ captured_at: undefined }) as never, {
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/captured_at/);
  });

  it("rejects missing source", () => {
    const r = normalizeWebhookIngestPayload(base({ source: undefined }) as never, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/source/);
  });

  it("rejects unknown source (never defaults to live)", () => {
    const r = normalizeWebhookIngestPayload(base({ source: "live" }) as never, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/invalid source/);
  });

  it("rejects future timestamp beyond 5min skew", () => {
    const r = normalizeWebhookIngestPayload(
      base({ captured_at: "2026-05-26T21:00:00Z" }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/future/);
  });

  it("rejects payload with no metrics object", () => {
    const r = normalizeWebhookIngestPayload(base({ metrics: {} }) as never, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/metrics required/);
  });

  it("omits empty / null / blank metric values (never persists as 0)", () => {
    const r = normalizeWebhookIngestPayload(
      base({
        metrics: { temp_f: 76.4, humidity_percent: null, vpd_kpa: "", ph: undefined },
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows.map((row) => row.metric)).toEqual(["temperature_c"]);
    expect(r.skipped).toEqual(expect.arrayContaining(["humidity_percent", "ph", "vpd_kpa"]));
    // None of the omitted metrics produced a row, ESPECIALLY not value=0.
    expect(r.rows.find((row) => Number(row.value) === 0)).toBeUndefined();
  });

  it("rejects out-of-range humidity", () => {
    const r = normalizeWebhookIngestPayload(base({ metrics: { humidity_percent: 250 } }) as never, {
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/humidity_percent.*range/);
  });

  it("rejects out-of-range pH", () => {
    const r = normalizeWebhookIngestPayload(base({ metrics: { ph: 14.5 } }) as never, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/ph.*range/);
  });

  it("accepts valid decimal pH and EC", () => {
    const r = normalizeWebhookIngestPayload(base({ metrics: { ph: 6.25, ec: 1.42 } }) as never, {
      now: NOW,
    });
    expect(r.ok).toBe(true);
    expect(r.rows.find((row) => row.metric === "ph")?.value).toBe(6.25);
    expect(r.rows.find((row) => row.metric === "ec")?.value).toBe(1.42);
  });

  it("strips caller-supplied user_id from raw_payload", () => {
    const sanitized = sanitizeRawPayload(base({ user_id: "attacker-uuid" }) as never);
    expect(sanitized.user_id).toBeUndefined();
    expect(sanitized.tent_id).toBe(TENT);
  });

  it("produces a stable fingerprint for identical payloads", () => {
    const a = normalizeWebhookIngestPayload(base() as never, { now: NOW });
    const b = normalizeWebhookIngestPayload(base() as never, { now: NOW });
    expect(a.fingerprint).not.toBeNull();
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("isWebhookSource recognises all and only the allowed sources", () => {
    for (const s of WEBHOOK_ALLOWED_SOURCES) {
      expect(isWebhookSource(s)).toBe(true);
    }
    expect(isWebhookSource("live")).toBe(false);
    expect(isWebhookSource("manual")).toBe(false);
    expect(isWebhookSource("sim")).toBe(false);
    expect(isWebhookSource("")).toBe(false);
  });

  it("rejects invalid tent_id (non-uuid)", () => {
    const r = normalizeWebhookIngestPayload(base({ tent_id: "not-a-uuid" }) as never, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/tent_id/);
  });
});

function stripComments(src: string): string {
  return (
    src
      // Strip /* ... */ block comments (including JSDoc).
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Strip // line comments.
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  );
}

describe("sensor-ingest-webhook safety surface", () => {
  it("edge function source has no banned automation strings (excluding comments)", async () => {
    const fs = await import("fs/promises");
    const raw = await fs.readFile("supabase/functions/sensor-ingest-webhook/index.ts", "utf-8");
    const src = stripComments(raw);
    // No AI, alerts/action_queue writes, device control, MQTT subscriber in
    // actual code (comments are allowed to mention them for the documented
    // safety statement). Service-role key IS allowed because bridge-token
    // auth requires a privileged lookup; but it must not appear alongside
    // forbidden automation surfaces.
    const banned =
      /action_queue|\.from\(["']alerts["']\)|openai|anthropic|ai-coach|ai_doctor|mqtt\.connect|mqttSubscribe|relay|actuator|setpoint/i;
    expect(src).not.toMatch(banned);
  });

  it("webhook ingest rules helper has no banned strings (excluding comments)", async () => {
    const fs = await import("fs/promises");
    const raw = await fs.readFile("src/lib/sensorWebhookIngestRules.ts", "utf-8");
    const src = stripComments(raw);
    const banned =
      /service_role|action_queue|\.from\(["']alerts["']\)|openai|anthropic|mqtt\.connect|mqttSubscribe|relay|actuator|setpoint|autopilot/i;
    expect(src).not.toMatch(banned);
  });

  it("normalizes alias keys to canonical metric names", () => {
    const r = normalizeWebhookIngestPayload(
      base({
        metrics: { temp_f: 68, humidity_percent: 42, soil_moisture: 35 },
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    const metrics = r.rows.map((row) => row.metric).sort();
    expect(metrics).toEqual(["humidity_pct", "soil_moisture_pct", "temperature_c"]);
    const soil = r.rows.find((row) => row.metric === "soil_moisture_pct");
    expect(soil?.value).toBe(35);
  });
});
