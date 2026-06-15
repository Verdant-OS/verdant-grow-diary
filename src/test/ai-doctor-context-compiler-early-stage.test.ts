/**
 * Verifies the AI Doctor Phase 1 row compiler exposes the additive,
 * optional `early_stage_memory` field safely.
 *
 * Pure, deterministic. No I/O. No Supabase.
 */
import { describe, it, expect } from "vitest";
import { compilePlantContextFromRows } from "../lib/aiDoctorContextCompiler";
import {
  EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS,
  EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR,
  EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO,
} from "../lib/earlyStageAiDoctorContextRules";

const NOW = new Date("2026-06-10T12:00:00Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() - offsetMs).toISOString();

const basePlant = {
  id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  name: "Plant 1",
  strain: "NL Auto",
  stage: "seedling",
};

describe("compilePlantContextFromRows — early_stage_memory", () => {
  it("is null when no diary rows carry early-stage details", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "watering",
          source: "quick_log",
          note: "Light watering",
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    expect(ctx.early_stage_memory).toBeNull();
  });

  it("is null for older fixtures without `details`", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(120_000),
          event_type: "note",
          source: "manual",
          note: "Looks fine",
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    expect(ctx.early_stage_memory).toBeNull();
  });

  it("compiles known milestone + vigor into a safe payload", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(2 * 24 * 60 * 60 * 1000),
          event_type: "note",
          source: "quick_log",
          note: "Old entry",
          details: {
            early_stage: {
              early_stage_milestone: "cotyledons_open",
              vigor: "medium",
              notes: "Cotyledons open, looking even.",
              stage_context: "seedling",
            },
          },
        },
        {
          occurred_at: iso(60 * 60 * 1000),
          event_type: "note",
          source: "quick_log",
          note: "Latest",
          details: {
            early_stage: {
              early_stage_milestone: "first_true_leaves",
              vigor: "strong",
              stage_context: "seedling",
            },
          },
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    const mem = ctx.early_stage_memory;
    expect(mem).not.toBeNull();
    expect(mem!.hasEarlyStageMemory).toBe(true);
    expect(mem!.latest?.milestoneLabel).toBe("First true leaves");
    expect(mem!.latest?.vigorLabel).toBe("Strong");
    expect(mem!.entries.length).toBe(2);
    expect(mem!.cautionNotes).toContain(EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS);
  });

  it("includes missing-sensor caveat only when no live readings exist", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "note",
          source: "quick_log",
          details: {
            early_stage: { early_stage_milestone: "taproot_visible" },
          },
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    expect(ctx.early_stage_memory!.missingInformation).toContain(
      EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR,
    );
    // No photo signal is wired in — must not be invented from unknown state.
    expect(ctx.early_stage_memory!.missingInformation).not.toContain(
      EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO,
    );
  });

  it("omits missing-sensor caveat when at least one live reading exists", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "note",
          source: "quick_log",
          details: {
            early_stage: { early_stage_milestone: "taproot_visible" },
          },
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 23,
          captured_at: iso(60_000),
          source: "ecowitt",
        },
      ],
      now: NOW,
    });
    expect(ctx.early_stage_memory!.missingInformation).not.toContain(
      EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR,
    );
  });

  it("does not echo raw unknown enum values for milestone/vigor", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "note",
          source: "quick_log",
          details: {
            early_stage: {
              early_stage_milestone: "MYSTERY_ROOT_BURST",
              vigor: "exuberant",
              notes: "x".repeat(5000),
            },
          },
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    const mem = ctx.early_stage_memory!;
    const serialized = JSON.stringify(mem);
    expect(serialized).not.toContain("MYSTERY_ROOT_BURST");
    expect(serialized).not.toContain("exuberant");
    expect(mem.latest?.milestoneUnknown).toBe(true);
    expect(mem.latest?.vigorUnknown).toBe(true);
    // Note must be length-capped, never echoed at 5000 chars.
    expect((mem.latest?.note ?? "").length).toBeLessThan(5000);
  });

  it("never leaks raw_payload / service_role / tokens / internal IDs", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "note",
          source: "quick_log",
          details: {
            early_stage: {
              early_stage_milestone: "seed_started",
              vigor: "strong",
              notes: "Started soaking.",
            },
            // Hostile junk that must never reach the payload.
            raw_payload: { secret: "leak-me" },
            service_role: "service_role_key_value",
            access_token: "bearer.token.value",
            internal_id: "internal-uuid-1234",
          },
        },
      ],
      sensorReadings: [],
      now: NOW,
    });
    const serialized = JSON.stringify(ctx.early_stage_memory);
    expect(serialized).not.toContain("leak-me");
    expect(serialized).not.toContain("service_role_key_value");
    expect(serialized).not.toContain("bearer.token.value");
    expect(serialized).not.toContain("internal-uuid-1234");
    expect(serialized).not.toContain("raw_payload");
  });
});
