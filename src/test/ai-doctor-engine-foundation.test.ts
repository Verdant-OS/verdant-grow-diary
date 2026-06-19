/**
 * AI Doctor Engine — Phase 1 Foundation tests.
 *
 * Pure, deterministic. No real model calls. No Supabase. No alerts.
 * No Action Queue writes. No automation. No device control.
 *
 * Verifies the cautious diagnosis foundation:
 *   - context compiler produces deterministic, source-separated output
 *   - missing photo / sensor lowers confidence
 *   - stale / invalid readings are never treated as healthy
 *   - sources are never merged across live / manual / csv / demo / stale / invalid
 *   - stubbed diagnosis never pretends certainty
 *   - action_queue_suggestion is approval-required and never an executable command
 *   - autoflower weak-context case avoids aggressive recovery advice
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_SENSOR_SOURCES,
  compileAiDoctorContextPayloadFromRows,
  executeAiDoctorEngine,
  type AiDoctorContextPayload,
  type CompileAiDoctorContextPayloadFromRowsInput,
} from "@/lib/aiDoctorEnginePhase1Foundation";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() - offsetMs).toISOString();

function baseInput(
  overrides: Partial<CompileAiDoctorContextPayloadFromRowsInput> = {},
): CompileAiDoctorContextPayloadFromRowsInput {
  return {
    plant: {
      id: "p1",
      name: "Plant A",
      strain: "Blue Dream",
      stage: "veg",
      medium: "soil",
      pot_size: "7gal",
      tent_id: "t1",
      grow_id: "g1",
    },
    grow: { id: "g1" },
    tent: { id: "t1" },
    logs: [],
    photos: [],
    sensorReadings: [],
    now: NOW,
    ...overrides,
  };
}

describe("compileAiDoctorContextPayloadFromRows", () => {
  it("produces a high-trust payload when plant + logs + photo + live reading present", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
        ],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 23,
            captured_at: iso(60_000),
            source: "live",
          },
        ],
      }),
    );
    expect(ctx.context_trust_level).toBe("high");
    expect(ctx.recent_logs).toHaveLength(1);
    expect(ctx.recent_watering_events).toBe(1);
    expect(ctx.recent_photos_count).toBe(1);
    const temp = ctx.sensor_summary.find((m) => m.metric === "temperature_c")!;
    expect(temp.latest_value).toBe(23);
    expect(temp.latest_source).toBe("live");
    expect(temp.is_degraded).toBe(false);
  });

  it("returns medium trust when plant context exists but photo is missing", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "feeding", source: "manual" },
        ],
        photos: [],
        sensorReadings: [
          {
            metric: "humidity_pct",
            value: 55,
            captured_at: iso(60_000),
            source: "live",
          },
        ],
      }),
    );
    expect(ctx.context_trust_level).toBe("medium");
    expect(ctx.missing_context).toContain("recent photo (14d)");
  });

  it("returns low trust when no logs/photos/sensors are present", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(baseInput());
    expect(ctx.context_trust_level).toBe("low");
    expect(ctx.missing_context).toContain("recent diary entries (14d)");
    expect(ctx.missing_context).toContain("recent photo (14d)");
    expect(ctx.missing_context).toContain("recent trustworthy sensor reading (7d)");
  });

  it("never merges csv / manual / demo into the live bucket", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "live" },
          { metric: "vpd_kpa", value: 0.8, captured_at: iso(60_000), source: "csv" },
          { metric: "vpd_kpa", value: 0.9, captured_at: iso(60_000), source: "manual" },
          { metric: "vpd_kpa", value: 1.1, captured_at: iso(60_000), source: "demo" },
        ],
      }),
    );
    const sources = ctx.source_breakdown.map((b) => b.source);
    expect(sources).toEqual(["live", "manual", "csv", "demo"]);
    for (const b of ctx.source_breakdown) {
      expect(b.reading_count_7d).toBe(1);
    }
  });

  it("never treats stale or invalid readings as healthy", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
          { metric: "humidity_pct", value: 0, captured_at: iso(60_000), source: "stale" },
        ],
      }),
    );
    const vpd = ctx.sensor_summary.find((m) => m.metric === "vpd_kpa")!;
    expect(vpd.is_invalid).toBe(true);
    expect(vpd.is_degraded).toBe(true);
    expect(vpd.latest_value).toBeNull();
    const rh = ctx.sensor_summary.find((m) => m.metric === "humidity_pct")!;
    expect(rh.is_stale).toBe(true);
    expect(rh.is_degraded).toBe(true);
    // Trust must not be high when no trustworthy reading exists.
    expect(ctx.context_trust_level).not.toBe("high");
    expect(ctx.missing_context).toContain(
      "recent trustworthy sensor reading (7d)",
    );
  });

  it("limits logs to the last 14 days", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
          { occurred_at: iso(20 * 24 * 60 * 60 * 1000), event_type: "feeding", source: "manual" },
        ],
      }),
    );
    expect(ctx.recent_logs).toHaveLength(1);
    expect(ctx.recent_logs[0]!.event_type).toBe("watering");
  });

  it("emits deterministic output regardless of input ordering", () => {
    const r1 = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "temperature_c", value: 22, captured_at: iso(1000), source: "live" },
          { metric: "temperature_c", value: 24, captured_at: iso(2000), source: "live" },
          { metric: "humidity_pct", value: 60, captured_at: iso(1000), source: "manual" },
        ],
      }),
    );
    const r2 = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "humidity_pct", value: 60, captured_at: iso(1000), source: "manual" },
          { metric: "temperature_c", value: 24, captured_at: iso(2000), source: "live" },
          { metric: "temperature_c", value: 22, captured_at: iso(1000), source: "live" },
        ],
      }),
    );
    expect(r1).toEqual(r2);
  });

  it("source_breakdown enum order matches AI_DOCTOR_SENSOR_SOURCES", () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "demo" },
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "live" },
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "csv" },
          { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "invalid" },
        ],
      }),
    );
    const sources = ctx.source_breakdown.map((b) => b.source);
    const filteredEnum = AI_DOCTOR_SENSOR_SOURCES.filter((s) =>
      sources.includes(s),
    );
    expect(sources).toEqual(filteredEnum);
  });
});

describe("executeAiDoctorEngine", () => {
  function lowCtx(): AiDoctorContextPayload {
    return compileAiDoctorContextPayloadFromRows(baseInput());
  }
  function highCtx(): AiDoctorContextPayload {
    return compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
        ],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
        ],
      }),
    );
  }

  it("returns low confidence for empty context and lists missing information", async () => {
    const r = await executeAiDoctorEngine({ context: lowCtx() });
    expect(r.confidence).toBe("low");
    expect(r.likely_issue).toBe("");
    expect(r.summary).toMatch(/insufficient trustworthy context/i);
    expect(r.missing_information).toContain("recent photo (14d)");
    expect(r.missing_information).toContain(
      "recent trustworthy sensor reading (7d)",
    );
    expect(r.action_queue_suggestion).toBeNull();
  });

  it("returns high confidence and no suggestion when context is high and risk low", async () => {
    const r = await executeAiDoctorEngine({ context: highCtx() });
    expect(r.confidence).toBe("high");
    expect(r.risk_level).toBe("low");
    expect(r.action_queue_suggestion).toBeNull();
    // Even at high confidence, the engine never pretends certainty.
    expect(r.summary).toMatch(/cautious, observation-only/i);
    expect(r.immediate_action).toMatch(/do not change inputs/i);
  });

  it("escalates risk to medium when stale/invalid telemetry is present and emits an approval-required suggestion", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
        ],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          // trustworthy reading so confidence is not low:
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
          // invalid reading on another metric:
          { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
        ],
      }),
    );
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(r.risk_level).toBe("medium");
    expect(r.action_queue_suggestion).not.toBeNull();
    const sugg = r.action_queue_suggestion!;
    expect(sugg.approval_required).toBe(true);
    expect(sugg.risk_level).toBe("medium");
    // Must not be an executable device command.
    const text = `${sugg.title} ${sugg.rationale}`.toLowerCase();
    expect(text).not.toMatch(/\b(turn on|turn off|set humidifier|set fan|execute|run command|api call)\b/);
  });

  it("never emits an action_queue_suggestion when confidence is low even if telemetry is invalid", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        sensorReadings: [
          { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
        ],
      }),
    );
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(r.confidence).toBe("low");
    expect(r.action_queue_suggestion).toBeNull();
  });

  it("autoflower with weak context avoids aggressive recovery advice", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        plant: {
          id: "p1",
          name: "Auto A",
          strain: "Northern Lights Auto",
          stage: "veg",
          medium: "soil",
          pot_size: "5gal",
          tent_id: "t1",
          grow_id: "g1",
        },
      }),
    );
    const r = await executeAiDoctorEngine({ context: ctx });
    expect(r.confidence).toBe("low");
    const dontList = r.what_not_to_do.join(" | ").toLowerCase();
    expect(dontList).toMatch(/autoflower/);
    expect(dontList).toMatch(/defoliation|transplant|high-stress/);
  });

  it("evidence reflects degraded sensor metrics with explicit non-healthy language", async () => {
    const ctx = compileAiDoctorContextPayloadFromRows(
      baseInput({
        logs: [
          { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
        ],
        photos: [{ captured_at: iso(120_000) }],
        sensorReadings: [
          { metric: "temperature_c", value: 23, captured_at: iso(60_000), source: "live" },
          { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "invalid" },
        ],
      }),
    );
    const r = await executeAiDoctorEngine({ context: ctx });
    const joined = r.evidence.join(" | ");
    expect(joined).toMatch(/INVALID/);
    expect(joined).not.toMatch(/plant\s+is\s+healthy|all\s+systems\s+healthy/i);
  });
});

describe("static safety — aiDoctorEnginePhase1Foundation.ts", () => {
  const RAW = readFileSync(
    resolve(__dirname, "../lib/aiDoctorEnginePhase1Foundation.ts"),
    "utf8",
  );
  // Strip block + line comments so that the safety regexes match real code,
  // not the file's own self-describing safety notes.
  const SOURCE = RAW
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("does not import Supabase, alerts, action queue writers, or device control", () => {
    expect(SOURCE).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SOURCE).not.toMatch(/createClient\s*\(/);
    expect(SOURCE).not.toMatch(/service_role/i);
    expect(SOURCE).not.toMatch(/bridge[_-]?token/i);
    expect(SOURCE).not.toMatch(/alertsClient|action_queue\s*\.insert|insertActionQueue/i);
    expect(SOURCE).not.toMatch(/deviceCommand|deviceControl|executeDeviceCommand/i);
  });

  it("does not call external model/AI endpoints", () => {
    expect(SOURCE).not.toMatch(/openai|anthropic|gemini|lovable\.dev\/ai|ai-gateway/i);
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
  });
});
