/**
 * earlyStageTimelineViewModel — pure rule tests.
 *
 * Verifies the read-only helper that extracts germination/seedling
 * milestone, vigor, note, and stage context from a raw `details`
 * object. Must never echo raw_payload, service_role/token fields, or
 * arbitrary unknown keys, and must safely degrade for unknown enum
 * values.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEarlyStageTimelineViewModel,
  EARLY_STAGE_MILESTONE_UNKNOWN_LABEL,
  EARLY_STAGE_VIGOR_UNKNOWN_LABEL,
} from "@/lib/earlyStageTimelineViewModel";

describe("buildEarlyStageTimelineViewModel — happy path", () => {
  it("resolves milestone, vigor, note, and stage context labels", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "taproot_visible",
        vigor: "strong",
        notes: "Tap root through the paper towel.",
        stage_context: "germination",
      },
    });
    expect(vm).not.toBeNull();
    expect(vm!.milestoneLabel).toBe("Taproot visible");
    expect(vm!.milestoneUnknown).toBe(false);
    expect(vm!.vigorLabel).toBe("Strong");
    expect(vm!.vigorUnknown).toBe(false);
    expect(vm!.note).toBe("Tap root through the paper towel.");
    expect(vm!.stageContextLabel).toBe("Germination");
  });

  it("accepts a pre-extracted envelope shape directly", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage_milestone: "cotyledons_open",
      vigor: "medium",
      notes: null,
      stage_context: "seedling",
    });
    expect(vm).not.toBeNull();
    expect(vm!.milestoneLabel).toBe("Cotyledons open");
    expect(vm!.vigorLabel).toBe("Medium");
    expect(vm!.stageContextLabel).toBe("Seedling");
  });
});

describe("buildEarlyStageTimelineViewModel — safe fallbacks", () => {
  it("returns null when no early_stage envelope is present", () => {
    expect(buildEarlyStageTimelineViewModel({ event_type: "note" })).toBeNull();
    expect(buildEarlyStageTimelineViewModel(null)).toBeNull();
    expect(buildEarlyStageTimelineViewModel(undefined)).toBeNull();
    expect(buildEarlyStageTimelineViewModel("not an object")).toBeNull();
    expect(buildEarlyStageTimelineViewModel([])).toBeNull();
  });

  it("returns null when the envelope is fully empty", () => {
    expect(
      buildEarlyStageTimelineViewModel({
        early_stage: {
          early_stage_milestone: null,
          vigor: null,
          notes: null,
          stage_context: null,
        },
      }),
    ).toBeNull();
  });

  it("flags unknown milestone values without leaking the raw enum", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "totally_made_up_milestone",
        vigor: "strong",
      },
    });
    expect(vm).not.toBeNull();
    expect(vm!.milestoneLabel).toBeNull();
    expect(vm!.milestoneUnknown).toBe(true);
    expect(EARLY_STAGE_MILESTONE_UNKNOWN_LABEL.toLowerCase()).toContain("milestone");
    // The raw enum must never appear in any resolved label.
    expect(vm!.milestoneLabel ?? "").not.toContain("totally_made_up_milestone");
  });

  it("flags unknown vigor values without leaking the raw enum", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        vigor: "super_extra_vigor",
      },
    });
    expect(vm).not.toBeNull();
    expect(vm!.vigorLabel).toBeNull();
    expect(vm!.vigorUnknown).toBe(true);
    expect(EARLY_STAGE_VIGOR_UNKNOWN_LABEL.toLowerCase()).toContain("vigor");
  });

  it("drops unknown stage_context values rather than echoing raw enums", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "seed_started",
        stage_context: "weird_unknown_stage",
      },
    });
    expect(vm).not.toBeNull();
    expect(vm!.stageContextLabel).toBeNull();
  });

  it("trims, collapses, and length-caps the note", () => {
    const long = "x ".repeat(300).trim();
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "seed_started",
        notes: `  hello\n\n   world  `,
      },
    });
    expect(vm!.note).toBe("hello world");

    const vm2 = buildEarlyStageTimelineViewModel({
      early_stage: { early_stage_milestone: "seed_started", notes: long },
    });
    expect(vm2!.note!.length).toBeLessThanOrEqual(200);
    expect(vm2!.note!.endsWith("…")).toBe(true);
  });

  it("ignores non-string notes/stage_context safely", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "seed_started",
        notes: 42,
        stage_context: { evil: true },
      },
    });
    expect(vm!.note).toBeNull();
    expect(vm!.stageContextLabel).toBeNull();
  });
});

describe("earlyStageTimelineViewModel — safety boundaries", () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const SRC = readFileSync(
    resolve(__dirname, "../lib/earlyStageTimelineViewModel.ts"),
    "utf8",
  );

  it("contains no Supabase / RPC / Action Queue / device-control code", () => {
    expect(SRC).not.toMatch(/from\s*\(\s*['"]/);
    expect(SRC).not.toMatch(/\.rpc\s*\(/);
    expect(SRC).not.toMatch(/from\s*['"]@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/createClient\s*\(/);
    expect(SRC).not.toMatch(/action_queue/i);
    expect(SRC).not.toMatch(/device|relay|control/i);
    expect(SRC).not.toMatch(/service_role|service-role/i);
    expect(SRC).not.toMatch(/raw_payload/);
  });

  it("never echoes raw arbitrary keys from details", () => {
    const vm = buildEarlyStageTimelineViewModel({
      early_stage: {
        early_stage_milestone: "seed_started",
        // Sneaky extras that must not leak into the view model.
        service_role_key: "should-not-render",
        raw_payload: { token: "nope" },
        __secret: "do-not-show",
      },
    });
    expect(vm).not.toBeNull();
    const serialized = JSON.stringify(vm);
    expect(serialized).not.toContain("service_role_key");
    expect(serialized).not.toContain("raw_payload");
    expect(serialized).not.toContain("__secret");
    expect(serialized).not.toContain("should-not-render");
    expect(serialized).not.toContain("do-not-show");
  });
});
