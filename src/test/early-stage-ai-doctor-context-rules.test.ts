/**
 * earlyStageAiDoctorContextRules — pure helper tests.
 *
 * Validates:
 *  - happy path (known milestone + vigor + note)
 *  - latest-entry selection (descending capturedAt, stable ties)
 *  - milestoneHistoryCount counts only known milestones
 *  - unknown milestone/vigor values never leak raw enum keys
 *  - non-early diary entries don't appear in early-stage context
 *  - missing photo/sensor surfaces as missing info — not guessed
 *  - source label normalization (quick_log -> "Quick Log", else "Manual diary")
 *  - safety: no raw_payload / service_role / token / private_id / internal_id
 *    leakage through any field
 */
import { describe, it, expect } from "vitest";
import {
  buildEarlyStageAiDoctorContext,
  EARLY_STAGE_AI_DOCTOR_CAUTION_GENTLE,
  EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS,
  EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES,
  EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO,
  EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR,
} from "../lib/earlyStageAiDoctorContextRules";

const iso = (offsetMinutes: number) =>
  new Date(Date.UTC(2026, 5, 14, 12, 0, 0) - offsetMinutes * 60_000).toISOString();

describe("buildEarlyStageAiDoctorContext — happy path", () => {
  it("returns empty context when no diary rows are passed", () => {
    const ctx = buildEarlyStageAiDoctorContext({});
    expect(ctx.hasEarlyStageMemory).toBe(false);
    expect(ctx.latest).toBeNull();
    expect(ctx.entries).toEqual([]);
    expect(ctx.milestoneHistoryCount).toBe(0);
    expect(ctx.stageContextLabel).toBeNull();
    expect(ctx.missingInformation).toEqual([]);
    expect(ctx.cautionNotes).toEqual([]);
  });

  it("includes known milestone + vigor + note from a Quick Log row", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          event_type: "note",
          source: "quick_log",
          details: {
            early_stage: {
              early_stage_milestone: "cotyledons_open",
              vigor: "medium",
              notes: "Cots opened overnight, leaves perky.",
              stage_context: "seedling",
            },
          },
        },
      ],
      hasRecentPhoto: true,
      hasRecentSensorSnapshot: true,
    });
    expect(ctx.hasEarlyStageMemory).toBe(true);
    expect(ctx.latest?.milestoneLabel).toBe("Cotyledons open");
    expect(ctx.latest?.vigorLabel).toBe("Medium");
    expect(ctx.latest?.note).toBe("Cots opened overnight, leaves perky.");
    expect(ctx.latest?.stageContextLabel).toBe("Seedling");
    expect(ctx.latest?.source).toBe("Quick Log");
    expect(ctx.milestoneHistoryCount).toBe(1);
    expect(ctx.stageContextLabel).toBe("Seedling");
    expect(ctx.missingInformation).toEqual([]);
    expect(ctx.cautionNotes).toContain(EARLY_STAGE_AI_DOCTOR_CAUTION_REPEATED_OBS);
    expect(ctx.cautionNotes).toContain(EARLY_STAGE_AI_DOCTOR_CAUTION_GENTLE);
  });
});

describe("buildEarlyStageAiDoctorContext — ordering and counts", () => {
  it("picks the latest entry by capturedAt (desc) and counts known milestones only", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(60 * 24 * 3), // older
          source: "quick_log",
          details: {
            early_stage: { early_stage_milestone: "seed_started", vigor: "strong" },
          },
        },
        {
          occurred_at: iso(60), // most recent
          source: "quick_log",
          details: {
            early_stage: { early_stage_milestone: "first_true_leaves", vigor: "medium" },
          },
        },
        {
          occurred_at: iso(60 * 24), // middle, vigor-only
          source: "quick_log",
          details: { early_stage: { vigor: "strong" } },
        },
      ],
    });
    expect(ctx.entries).toHaveLength(3);
    expect(ctx.latest?.milestoneLabel).toBe("First true leaves");
    expect(ctx.milestoneHistoryCount).toBe(2);
  });

  it("caps entries at EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES", () => {
    const rows = Array.from({ length: EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES + 5 }, (_, i) => ({
      occurred_at: iso(i * 60),
      source: "quick_log",
      details: { early_stage: { early_stage_milestone: "seed_started" } },
    }));
    const ctx = buildEarlyStageAiDoctorContext({ diaryRows: rows });
    expect(ctx.entries).toHaveLength(EARLY_STAGE_AI_DOCTOR_MAX_ENTRIES);
  });
});

describe("buildEarlyStageAiDoctorContext — safety on unknown / malformed input", () => {
  it("does not leak raw enum keys when milestone/vigor are unknown", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "quick_log",
          details: {
            early_stage: {
              early_stage_milestone: "rocket_phase",
              vigor: "ultra",
              notes: "weird",
            },
          },
        },
      ],
    });
    const entry = ctx.latest!;
    expect(entry.milestoneLabel).toBeNull();
    expect(entry.milestoneUnknown).toBe(true);
    expect(entry.vigorLabel).toBeNull();
    expect(entry.vigorUnknown).toBe(true);
    // Raw enum string must not appear anywhere on the entry.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("rocket_phase");
    expect(serialized).not.toContain("ultra");
    expect(ctx.milestoneHistoryCount).toBe(0);
  });

  it("ignores diary rows with no early_stage envelope", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "quick_log",
          details: { feeding: { ec: 1.2 } },
        },
        { occurred_at: iso(60), source: "manual", details: null },
        { occurred_at: iso(120), source: "quick_log" },
      ],
    });
    expect(ctx.hasEarlyStageMemory).toBe(false);
    expect(ctx.entries).toEqual([]);
  });

  it("normalizes source label and never echoes raw source enums", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "service_role_writer",
          details: { early_stage: { early_stage_milestone: "seed_started" } },
        },
        {
          occurred_at: iso(60),
          source: "quick_log",
          details: { early_stage: { early_stage_milestone: "taproot_visible" } },
        },
      ],
    });
    const labels = ctx.entries.map((e) => e.source);
    expect(labels).toContain("Quick Log");
    expect(labels).toContain("Manual diary");
    expect(JSON.stringify(ctx)).not.toContain("service_role");
  });

  it("does not surface raw_payload, tokens, or private/internal IDs", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "quick_log",
          details: {
            raw_payload: { secret: "shh" },
            service_role_key: "eyJhbGciOiJIUzI1NiJ9.fake.token",
            bearer_token: "Bearer abc",
            private_id: "priv-001",
            internal_id: "int-001",
            early_stage: {
              early_stage_milestone: "planted_in_medium",
              vigor: "strong",
              notes: "Looks good",
            },
          },
        },
      ],
    });
    const serialized = JSON.stringify(ctx);
    for (const forbidden of [
      "raw_payload",
      "service_role",
      "Bearer ",
      "priv-001",
      "int-001",
      "eyJhbGciOi",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(ctx.latest?.milestoneLabel).toBe("Planted in medium");
  });

  it("ignores rows whose occurred_at is not parseable", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: "not-a-date",
          source: "quick_log",
          details: { early_stage: { early_stage_milestone: "seed_started" } },
        },
      ],
    });
    expect(ctx.entries[0]?.capturedAt).toBeNull();
    expect(ctx.entries).toHaveLength(1);
  });
});

describe("buildEarlyStageAiDoctorContext — missing information", () => {
  it("flags missing photo and sensor snapshot when explicitly false", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "quick_log",
          details: { early_stage: { early_stage_milestone: "cotyledons_open" } },
        },
      ],
      hasRecentPhoto: false,
      hasRecentSensorSnapshot: false,
    });
    expect(ctx.missingInformation).toEqual([
      EARLY_STAGE_AI_DOCTOR_MISSING_PHOTO,
      EARLY_STAGE_AI_DOCTOR_MISSING_SENSOR,
    ]);
  });

  it("does not invent missing-info entries when no early-stage memory exists", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [],
      hasRecentPhoto: false,
      hasRecentSensorSnapshot: false,
    });
    expect(ctx.missingInformation).toEqual([]);
    expect(ctx.cautionNotes).toEqual([]);
  });

  it("does not guess when missing flags are undefined", () => {
    const ctx = buildEarlyStageAiDoctorContext({
      diaryRows: [
        {
          occurred_at: iso(0),
          source: "quick_log",
          details: { early_stage: { early_stage_milestone: "cotyledons_open" } },
        },
      ],
    });
    expect(ctx.missingInformation).toEqual([]);
  });
});

describe("buildEarlyStageAiDoctorContext — determinism", () => {
  it("returns identical output for identical input", () => {
    const input = {
      diaryRows: [
        {
          occurred_at: iso(60),
          source: "quick_log",
          details: { early_stage: { early_stage_milestone: "taproot_visible" } },
        },
      ],
      hasRecentPhoto: true,
      hasRecentSensorSnapshot: false,
    };
    const a = buildEarlyStageAiDoctorContext(input);
    const b = buildEarlyStageAiDoctorContext(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
