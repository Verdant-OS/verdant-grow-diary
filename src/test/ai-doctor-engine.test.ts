/**
 * Tests — AI Doctor 2.0 engine (Phase 1).
 *
 * Pure, deterministic. No real model calls. No Supabase writes.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compilePlantContextFromRows,
  executeVisionAnalysis,
  generateMultimodalDiagnosis,
  type VisionAnalysisResult,
} from "../lib/aiDoctorEngine";

function fakeFile(): File {
  // node test env supports File via undici.
  return new File([new Uint8Array([1, 2, 3])], "plant.jpg", {
    type: "image/jpeg",
  });
}

describe("executeVisionAnalysis", () => {
  it("returns a typed low-confidence stub for a valid image file", async () => {
    const r = await executeVisionAnalysis(fakeFile());
    expect(r.confidence).toBe(0);
    expect(r.image_quality_score).toBe(0);
    expect(Array.isArray(r.leaf_observations)).toBe(true);
    expect(typeof r.visual_summary).toBe("string");
  });

  it("throws on missing image", async () => {
    await expect(executeVisionAnalysis(undefined as unknown as File)).rejects.toThrow(
      /image file is required/i,
    );
  });
});

describe("compilePlantContextFromRows", () => {
  const NOW = new Date("2026-06-04T12:00:00Z");
  const iso = (offsetMs: number) =>
    new Date(NOW.getTime() - offsetMs).toISOString();

  const baseInput = {
    plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
    now: NOW,
  };

  it("separates live / csv / manual / stale / invalid buckets and never merges CSV into Live", () => {
    const ctx = compilePlantContextFromRows({
      ...baseInput,
      growEvents: [],
      sensorReadings: [
        { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "ecowitt", quality: "ok" },
        { metric: "vpd_kpa", value: 1.4, captured_at: iso(120_000), source: "ecowitt", quality: "ok" },
        { metric: "vpd_kpa", value: 0.8, captured_at: iso(60_000), source: "csv", quality: "ok" },
        { metric: "vpd_kpa", value: 0.9, captured_at: iso(60_000), source: "manual", quality: "ok" },
        { metric: "vpd_kpa", value: 5.0, captured_at: iso(60_000), source: "ecowitt", quality: "stale" },
        { metric: "vpd_kpa", value: 99, captured_at: iso(60_000), source: "ecowitt", quality: "invalid" },
      ],
    });
    const tags = ctx.sensor_averages_7d.map((b) => b.source);
    expect(tags).toEqual(["live", "csv", "manual", "stale", "invalid"]);
    const live = ctx.sensor_averages_7d.find((b) => b.source === "live")!;
    const csv = ctx.sensor_averages_7d.find((b) => b.source === "csv")!;
    expect(live.averages.vpd_kpa).toBe(1.2); // (1.0+1.4)/2
    expect(csv.averages.vpd_kpa).toBe(0.8);
    // CSV stays tagged CSV, never folded into Live.
    expect(live.sample_count).toBe(2);
    expect(csv.sample_count).toBe(1);
  });

  it("computes 7-day rolling averages deterministically", () => {
    const a = compilePlantContextFromRows({
      ...baseInput,
      growEvents: [],
      sensorReadings: [
        { metric: "temperature_c", value: 22, captured_at: iso(1000), source: "ecowitt", quality: "ok" },
        { metric: "temperature_c", value: 24, captured_at: iso(2000), source: "ecowitt", quality: "ok" },
      ],
    });
    const b = compilePlantContextFromRows({
      ...baseInput,
      growEvents: [],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: iso(2000), source: "ecowitt", quality: "ok" },
        { metric: "temperature_c", value: 22, captured_at: iso(1000), source: "ecowitt", quality: "ok" },
      ],
    });
    expect(a.sensor_averages_7d).toEqual(b.sensor_averages_7d);
    expect(a.sensor_averages_7d[0]!.averages.temperature_c).toBe(23);
  });

  it("limits recent actions to the last 14 days", () => {
    const ctx = compilePlantContextFromRows({
      ...baseInput,
      sensorReadings: [],
      growEvents: [
        { occurred_at: iso(60_000), event_type: "watering", source: "manual" },
        { occurred_at: iso(20 * 24 * 60 * 60 * 1000), event_type: "feeding", source: "manual" },
      ],
    });
    expect(ctx.recent_actions.map((a) => a.event_type)).toEqual(["watering"]);
  });

  it("preserves source_tags listing", () => {
    const ctx = compilePlantContextFromRows({
      ...baseInput,
      growEvents: [],
      sensorReadings: [
        { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "csv", quality: "ok" },
        { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "ecowitt", quality: "ok" },
      ],
    });
    expect(ctx.source_tags).toEqual(["live", "csv"]);
  });

  it("ignores readings older than 7 days", () => {
    const ctx = compilePlantContextFromRows({
      ...baseInput,
      growEvents: [],
      sensorReadings: [
        { metric: "vpd_kpa", value: 1.0, captured_at: iso(10 * 24 * 60 * 60 * 1000), source: "ecowitt", quality: "ok" },
      ],
    });
    expect(ctx.sensor_averages_7d).toEqual([]);
  });
});

describe("generateMultimodalDiagnosis", () => {
  const vision: VisionAnalysisResult = {
    visual_summary: "stub",
    leaf_observations: [],
    structural_observations: [],
    color_and_pigmentation: [],
    pest_disease_indicators: [],
    growth_stage_visual_cues: [],
    image_quality_notes: [],
    image_quality_score: 0,
    confidence: 0.9, // high raw model self-report
  };
  const context = compilePlantContextFromRows({
    plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
    growEvents: [],
    sensorReadings: [],
    now: new Date("2026-06-04T12:00:00Z"),
  });

  it("injects automated confidence from edge fn and preserves raw model_confidence_level separately", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ score: 65, level: "Medium", explanation: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await generateMultimodalDiagnosis(vision, context, {
      confidence: {
        accessToken: "jwt",
        supabaseUrl: "https://example.supabase.co",
        fetchImpl: fetchImpl as any,
      },
    });
    expect(result.automated_confidence.level).toBe("Medium");
    expect(result.automated_confidence.score).toBe(65);
    // Raw model confidence is preserved separately, not overwritten by automated.
    expect(result.model_confidence_level).toBe("Low");
    expect(result.model_confidence_level).not.toBe(result.automated_confidence.level);
  });

  it("returns conservative fallback when edge function fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("net");
    });
    const result = await generateMultimodalDiagnosis(vision, context, {
      confidence: {
        accessToken: "jwt",
        supabaseUrl: "https://example.supabase.co",
        fetchImpl: fetchImpl as any,
      },
    });
    expect(result.automated_confidence.level).toBe("Low");
    expect(result.automated_confidence.score).toBe(40);
  });

  it("produces deterministic output for the same inputs (no confidence call)", async () => {
    const a = await generateMultimodalDiagnosis(vision, context);
    const b = await generateMultimodalDiagnosis(vision, context);
    expect(a).toEqual(b);
  });

  it("never recommends nutrient, irrigation, or equipment/device changes", async () => {
    const result = await generateMultimodalDiagnosis(vision, context);
    const joined = [
      ...result.recommended_actions,
      ...result.monitoring_priorities,
    ]
      .join(" ")
      .toLowerCase();
    expect(joined).not.toMatch(/increase|decrease|add nutrient|raise ec|lower ec/);
    expect(joined).not.toMatch(/irrigat|water more|water less/);
    expect(joined).not.toMatch(/fan|heater|humidifier|dehumidifier|pump|relay/);
  });
});

describe("AI Doctor 2.0 engine — static safety", () => {
  const ENGINE = readFileSync(resolve(__dirname, "../lib/aiDoctorEngine.ts"), "utf8");
  const CLIENT = readFileSync(
    resolve(__dirname, "../lib/aiDoctorConfidenceEdgeClient.ts"),
    "utf8",
  );

  it("contains no service_role", () => {
    expect(ENGINE).not.toMatch(/service_role/i);
    expect(CLIENT).not.toMatch(/service_role/i);
  });

  it("contains no bridge token references", () => {
    expect(ENGINE).not.toMatch(/bridge[_-]?token/i);
    expect(CLIENT).not.toMatch(/bridge[_-]?token/i);
  });

  it("performs no supabase writes (insert/update/delete/upsert)", () => {
    for (const term of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(ENGINE).not.toContain(term);
      expect(CLIENT).not.toContain(term);
    }
  });

  it("does not write to alerts or action_queue", () => {
    expect(ENGINE).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(ENGINE).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
  });

  it("contains no device-control strings", () => {
    for (const term of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
    ]) {
      expect(ENGINE).not.toContain(term);
      expect(CLIENT).not.toContain(term);
    }
  });
});
