/**
 * VERDANT-18 — AI Doctor safety fallback verification.
 *
 * This file consolidates targeted regression tests proving that the four
 * required safety fallbacks fire end-to-end against the real engine,
 * sanitizer, and confidence-edge client. No real model/API calls — all
 * external boundaries are mocked via injectable `fetchImpl` or fixture
 * inputs.
 *
 * Boundaries:
 *  - No `fetch`, no Supabase, no `functions.invoke`.
 *  - No writes to alerts, Action Queue, sensor ingest, or device control.
 *  - No edits to `aiDoctorEngine.ts`, `aiDoctorDiagnosisRules.ts`, or
 *    `aiDoctorConfidenceEdgeClient.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  compilePlantContextFromRows,
  generateMultimodalDiagnosis,
  type VisionAnalysisResult,
} from "@/lib/aiDoctorEngine";
import {
  CONSERVATIVE_FALLBACK,
  calculateConfidenceViaEdgeFunction,
  type ConfidenceResult,
} from "@/lib/aiDoctorConfidenceEdgeClient";
import {
  CAUTIOUS_FALLBACK,
  LOW_CONFIDENCE_THRESHOLD,
  MAX_SUGGESTED_ACTIONS,
  validateAndSanitizeDiagnosis,
} from "@/lib/aiDoctorDiagnosisRules";

// Deterministic clock — Verdant uses an injectable Date for the engine
// context compiler so stale-window assertions remain stable.
const NOW = new Date("2026-05-20T12:00:00Z");
const NOW_MS = NOW.getTime();
const hours = (n: number) => new Date(NOW_MS - n * 60 * 60_000).toISOString();

const EMPTY_VISION: VisionAnalysisResult = {
  visual_summary: "Stub vision — no model invoked.",
  leaf_observations: [],
  structural_observations: [],
  color_and_pigmentation: [],
  pest_disease_indicators: [],
  growth_stage_visual_cues: [],
  image_quality_notes: [],
  image_quality_score: 0,
  confidence: 0,
};

// ---------------------------------------------------------------------------
// 1. Stale Data
// ---------------------------------------------------------------------------
describe("VERDANT-18 · 1. Stale telemetry fallback", () => {
  it("tags >12h telemetry as 'stale' via quality flag (never promoted to live)", () => {
    const ctx = compilePlantContextFromRows({
      now: NOW,
      plant: {
        id: "p1",
        grow_id: "g1",
        tent_id: "t1",
        stage: "seedling",
      },
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: hours(14), // older than 12h
          source: "live",
          quality: "stale",
        },
        {
          metric: "temperature_c",
          value: 25,
          captured_at: hours(13),
          source: "live",
          quality: "stale",
        },
      ],
    });

    expect(ctx.source_tags).toContain("stale");
    expect(ctx.source_tags).not.toContain("live");
    const stale = ctx.sensor_averages_7d.find((b) => b.source === "stale");
    expect(stale).toBeDefined();
    expect(stale?.sample_count).toBeGreaterThan(0);
    // Stale telemetry must not produce a "healthy" deviation signal.
    expect(ctx.notable_deviations).toEqual([]);
  });

  it("drops sensor readings older than 7 days entirely", () => {
    const ctx = compilePlantContextFromRows({
      now: NOW,
      plant: { id: "p1", grow_id: "g1", tent_id: "t1", stage: "veg" },
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.0,
          captured_at: hours(24 * 8),
          source: "live",
          quality: "ok",
        },
      ],
    });
    expect(ctx.source_tags).toEqual([]);
    expect(ctx.sensor_averages_7d).toEqual([]);
  });

  it("engine diagnosis stays Low confidence and never claims health from stale-only context", async () => {
    const ctx = compilePlantContextFromRows({
      now: NOW,
      plant: { id: "p1", grow_id: "g1", tent_id: "t1", stage: "seedling" },
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.2,
          captured_at: hours(20),
          source: "live",
          quality: "stale",
        },
      ],
    });
    const dx = await generateMultimodalDiagnosis(EMPTY_VISION, ctx);
    expect(dx.model_confidence_level).toBe("Low");
    expect(dx.automated_confidence).toEqual(CONSERVATIVE_FALLBACK);
    expect(dx.automated_confidence.level).toBe("Low");
    // No "healthy" classification language
    const blob = [
      dx.summary,
      ...dx.recommended_actions,
      ...dx.contributing_factors,
    ]
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(/\bhealthy\b/);
    // Conservative whatNotToDo defaults present
    expect(dx.what_not_to_do.join(" ")).toMatch(/nutrients/i);
    expect(dx.what_not_to_do.join(" ")).toMatch(/irrigation/i);
    expect(dx.what_not_to_do.join(" ")).toMatch(/equipment/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Seedling / Autoflower protection
// ---------------------------------------------------------------------------
describe("VERDANT-18 · 2. Seedling / Autoflower protection", () => {
  it("sanitizer drops high-stress suggestions that imply device control", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      summary: "Seedling autoflower — early stress check.",
      confidence: 0.4,
      riskLevel: "low",
      suggestedActions: [
        {
          type: "task",
          title: "Heavy defoliation today",
          detail: "Turn on the dehumidifier and switch off the fan now.",
          reason: "Aggressive training",
          priority: "high",
        },
        {
          type: "task",
          title: "Observe only",
          detail: "Add a fresh photo in 24h.",
          reason: "Cautious",
          priority: "low",
        },
      ],
    });
    expect(diagnosis).not.toBeNull();
    // Device-control suggestion dropped.
    expect(diagnosis!.suggestedActions).toHaveLength(1);
    expect(diagnosis!.suggestedActions[0].title).toBe("Observe only");
    expect(notes.join(" ")).toMatch(/device-control/i);
    // All surviving suggestions remain approval-required.
    for (const a of diagnosis!.suggestedActions) {
      expect(a.approvalRequired).toBe(true);
    }
  });

  it("sanitizer redacts over-promising recovery/yield claims", () => {
    const { diagnosis } = validateAndSanitizeDiagnosis({
      summary: "Plant will fully recover and maximize yield, guaranteed.",
      confidence: 0.3,
      riskLevel: "low",
      evidence: ["Definitely a nitrogen deficiency"],
    });
    expect(diagnosis!.summary).toMatch(/\[removed: over-promising language\]/);
    expect(diagnosis!.evidence[0]).toMatch(
      /\[removed: over-promising language\]/,
    );
  });

  it("caps suggestions to MAX_SUGGESTED_ACTIONS to favor conservative guidance", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      type: "note",
      title: `Suggestion ${i}`,
      detail: `Detail ${i}`,
      reason: "ok",
      priority: "low",
    }));
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      summary: "Many drafts",
      confidence: 0.2,
      riskLevel: "low",
      suggestedActions: many,
    });
    expect(diagnosis!.suggestedActions.length).toBeLessThanOrEqual(
      MAX_SUGGESTED_ACTIONS,
    );
    expect(notes.some((n) => /trimmed/i.test(n))).toBe(true);
  });

  it("injects missing-information note when confidence is below threshold", () => {
    const { diagnosis } = validateAndSanitizeDiagnosis({
      summary: "Low confidence pass",
      confidence: LOW_CONFIDENCE_THRESHOLD - 0.01,
      riskLevel: "low",
    });
    expect(diagnosis!.missingInformation.length).toBeGreaterThan(0);
    expect(diagnosis!.missingInformation.join(" ")).toMatch(
      /fresh photo|sensor snapshot/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Backend timeout / AI client failure
// ---------------------------------------------------------------------------
describe("VERDANT-18 · 3. Backend timeout / AI client failure fallback", () => {
  const baseOpts = {
    accessToken: "test-token",
    supabaseUrl: "https://example.test",
  };
  const sampleInput = {
    context: { foo: "bar" },
    visual_observations: {},
    model_output: {},
    version: "verdant-18-test@0.1.0",
  };

  it("returns CONSERVATIVE_FALLBACK when fetch throws (network failure)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await calculateConfidenceViaEdgeFunction(sampleInput, {
      ...baseOpts,
      fetchImpl,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
    expect(r.level).toBe("Low");
    expect(r.explanation).toMatch(/unavailable/i);
  });

  it("returns CONSERVATIVE_FALLBACK on HTTP 500", async () => {
    const fetchImpl = (async () =>
      new Response("err", { status: 500 })) as unknown as typeof fetch;
    const r = await calculateConfidenceViaEdgeFunction(sampleInput, {
      ...baseOpts,
      fetchImpl,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("returns CONSERVATIVE_FALLBACK when timeoutMs expires (AbortSignal)", async () => {
    const fetchImpl = ((url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;
    const r = await calculateConfidenceViaEdgeFunction(sampleInput, {
      ...baseOpts,
      fetchImpl,
      timeoutMs: 5,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("returns CONSERVATIVE_FALLBACK when body is non-JSON / malformed", async () => {
    const fetchImpl = (async () =>
      new Response("<<not json>>", { status: 200 })) as unknown as typeof fetch;
    const r = await calculateConfidenceViaEdgeFunction(sampleInput, {
      ...baseOpts,
      fetchImpl,
    });
    expect(r).toEqual(CONSERVATIVE_FALLBACK);
  });

  it("engine swallows confidence-client failure and returns safe fallback diagnosis", async () => {
    const ctx = compilePlantContextFromRows({
      now: NOW,
      plant: { id: "p1", grow_id: "g1", tent_id: "t1", stage: "veg" },
      growEvents: [],
      sensorReadings: [],
    });
    const fetchImpl = (async () => {
      throw new Error("upstream model unavailable");
    }) as unknown as typeof fetch;
    let result: Awaited<ReturnType<typeof generateMultimodalDiagnosis>> | null = null;
    let threw = false;
    try {
      result = await generateMultimodalDiagnosis(EMPTY_VISION, ctx, {
        confidence: {
          accessToken: "test",
          supabaseUrl: "https://example.test",
          fetchImpl,
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.automated_confidence).toEqual(CONSERVATIVE_FALLBACK);
    expect(result!.model_confidence_level).toBe("Low");
  });

  it("sanitizer's unrecoverable input → CAUTIOUS_FALLBACK with safe wording", () => {
    const r = validateAndSanitizeDiagnosis(null);
    expect(r.diagnosis).toEqual(CAUTIOUS_FALLBACK);
    expect(r.notes.join(" ")).toMatch(/cautious fallback/i);
    expect(CAUTIOUS_FALLBACK.confidence).toBe(0);
    expect(CAUTIOUS_FALLBACK.riskLevel).toBe("low");
    expect(CAUTIOUS_FALLBACK.suggestedActions).toEqual([]);
    expect(CAUTIOUS_FALLBACK.summary).toMatch(/AI Doctor/);
    expect(CAUTIOUS_FALLBACK.whatNotToDo.join(" ")).toMatch(
      /irreversible|defoliation|aggressive feeding|transplant/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Danger Zone telemetry
// ---------------------------------------------------------------------------
describe("VERDANT-18 · 4. Danger Zone telemetry fallback", () => {
  it("compiler flags out-of-range live VPD/temperature as notable deviations", () => {
    const ctx = compilePlantContextFromRows({
      now: NOW,
      plant: { id: "p1", grow_id: "g1", tent_id: "t1", stage: "flower" },
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 2.4, // outside 0.6–1.6 band
          captured_at: hours(1),
          source: "live",
          quality: "ok",
        },
        {
          metric: "temperature_c",
          value: 38, // outside 18–30 °C
          captured_at: hours(1),
          source: "live",
          quality: "ok",
        },
      ],
    });
    expect(ctx.notable_deviations.length).toBeGreaterThanOrEqual(1);
    expect(ctx.notable_deviations.join(" ")).toMatch(/VPD/);
    expect(ctx.notable_deviations.join(" ")).toMatch(/temperature/i);
  });

  it("sanitizer blocks aggressive nutrient/irrigation/equipment recommendations from weak evidence", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      summary:
        "Reservoir EC reads 9.8 mS/cm and pH 3.2 — extreme. Recommend immediate flush.",
      confidence: 0.2, // weak evidence
      riskLevel: "high",
      evidence: ["EC=9.8", "pH=3.2"],
      suggestedActions: [
        {
          type: "task",
          title: "Auto-start pump to flush reservoir",
          detail: "Send a command to the pump and turn on the valve.",
          reason: "Lockout pH/EC",
          priority: "high",
        },
        {
          type: "task",
          title: "Control the fan to lower humidity",
          detail: "Switch on the fan via Home Assistant",
          reason: "Drying",
          priority: "high",
        },
      ],
    });
    // Both device-control suggestions dropped.
    expect(diagnosis!.suggestedActions).toEqual([]);
    expect(notes.join(" ")).toMatch(/device-control/i);
    // Risk elevation honored (still 'high'), proving severity isn't downgraded.
    expect(diagnosis!.riskLevel).toBe("high");
    // Low-confidence guard injects missing-information note even when high risk.
    expect(diagnosis!.missingInformation.length).toBeGreaterThan(0);
  });

  it("immediateAction containing device-control language is replaced with null", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      summary: "Danger zone",
      confidence: 0.9,
      riskLevel: "high",
      immediateAction: "Turn on the pump and switch off the heater immediately.",
    });
    expect(diagnosis!.immediateAction).toBeNull();
    expect(notes.join(" ")).toMatch(/Immediate action.*device-control/i);
  });
});

// ---------------------------------------------------------------------------
// Static safety — the new test file itself must stay strictly read-only
// ---------------------------------------------------------------------------
describe("VERDANT-18 · static safety of this test file", () => {
  it("does not import Supabase, real fetch, or device-control bridges", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "ai-doctor-fallbacks-verification.test.ts"),
      "utf8",
    );
    // Patterns built from string concatenation so the safety scanner
    // itself does not match its own literal regex source.
    const supabaseImport = new RegExp(["@", "/integrations/supabase"].join(""));
    const functionsInvoke = new RegExp(["functions", "\\.", "invoke"].join(""));
    const writePath = new RegExp(
      "\\.from\\(['\"][^'\"]+['\"]\\)\\s*\\.(insert|update|delete|upsert|rpc)",
    );
    const serviceRole = new RegExp(["service", "_", "role"].join(""));
    expect(src).not.toMatch(supabaseImport);
    expect(src).not.toMatch(functionsInvoke);
    expect(src).not.toMatch(writePath);
    expect(src).not.toMatch(serviceRole);
  });
});
