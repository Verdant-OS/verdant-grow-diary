/**
 * harvestInspectionQuickLogPreviewRules — pure helper tests.
 *
 * No I/O, no Supabase, no AI, no alerts, no Action Queue, no automation,
 * no device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildHarvestInspectionPreviewViewModel,
  detectHarvestInspectionPreset,
  HARVEST_INSPECTION_PREVIEW_CAUTION,
  HARVEST_INSPECTION_PREVIEW_LABEL,
  HARVEST_INSPECTION_PREVIEW_REVIEW_COPY,
  HARVEST_PHOTO_COMPARISON_ANGLES,
  HARVEST_PHOTO_COMPARISON_LIGHTINGS,
  isHarvestInspectionPrefill,
  normalizeHarvestPhotoComparison,
} from "@/lib/harvestInspectionQuickLogPreviewRules";
import {
  buildHarvestInspectionQuickLogPrefill,
} from "@/lib/harvestInspectionQuickLogRules";

const ctx = { plantId: "p1", plantName: "Plant", growId: null, tentId: null };

describe("isHarvestInspectionPrefill", () => {
  it("returns true when source + preset are present", () => {
    const p = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: ctx,
    });
    expect(isHarvestInspectionPrefill(p)).toBe(true);
  });

  it("returns false for normal Quick Log prefills", () => {
    expect(isHarvestInspectionPrefill({ source: "hyperlog", note: "x" })).toBe(false);
    expect(isHarvestInspectionPrefill({ note: "Trichome check" })).toBe(false);
    expect(isHarvestInspectionPrefill(null)).toBe(false);
    expect(isHarvestInspectionPrefill(undefined)).toBe(false);
  });
});

describe("detectHarvestInspectionPreset", () => {
  it("returns the explicit preset when provided", () => {
    expect(
      detectHarvestInspectionPreset({
        source: "harvest-watch-inspection",
        preset: "close_flower_photo",
      }),
    ).toBe("close_flower_photo");
  });

  it("falls back to note-text detection", () => {
    expect(
      detectHarvestInspectionPreset({
        source: "harvest-watch-inspection",
        note: "Trichome inspection note\n- Areas inspected:",
      }),
    ).toBe("trichome_inspection");
    expect(
      detectHarvestInspectionPreset({
        source: "harvest-watch-inspection",
        note: "Bud maturity note\n- Swelling / calyx density:",
      }),
    ).toBe("bud_maturity");
  });

  it("returns null when source is not harvest-watch-inspection", () => {
    expect(
      detectHarvestInspectionPreset({ source: "hyperlog", note: "Trichome" }),
    ).toBe(null);
  });

  it("ignores invalid preset values", () => {
    expect(
      detectHarvestInspectionPreset({
        source: "harvest-watch-inspection",
        preset: "nope",
      }),
    ).toBe(null);
  });
});

describe("buildHarvestInspectionPreviewViewModel", () => {
  it("does not show for normal prefills", () => {
    expect(buildHarvestInspectionPreviewViewModel(null).show).toBe(false);
    expect(
      buildHarvestInspectionPreviewViewModel({ source: "hyperlog", note: "x" }).show,
    ).toBe(false);
  });

  it("returns mandated caution + review copy for harvest prefills", () => {
    const p = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: ctx,
    });
    const vm = buildHarvestInspectionPreviewViewModel(p);
    expect(vm.show).toBe(true);
    expect(vm.caution).toBe("Harvest Watch is evidence-only. The grower decides.");
    expect(vm.reviewCopy).toBe(
      "Review this diary evidence before saving. This does not create an alert, Action Queue item, or harvest instruction.",
    );
    expect(vm.caution).toBe(HARVEST_INSPECTION_PREVIEW_CAUTION);
    expect(vm.reviewCopy).toBe(HARVEST_INSPECTION_PREVIEW_REVIEW_COPY);
  });

  it("returns the correct preset label for each preset", () => {
    for (const preset of [
      "trichome_inspection",
      "pistil_recession",
      "bud_maturity",
      "close_flower_photo",
    ] as const) {
      const p = buildHarvestInspectionQuickLogPrefill({ preset, context: ctx });
      const vm = buildHarvestInspectionPreviewViewModel(p);
      expect(vm.preset).toBe(preset);
      expect(vm.presetLabel).toBe(HARVEST_INSPECTION_PREVIEW_LABEL[preset]);
    }
    expect(HARVEST_INSPECTION_PREVIEW_LABEL.trichome_inspection).toBe(
      "Trichome inspection",
    );
    expect(HARVEST_INSPECTION_PREVIEW_LABEL.pistil_recession).toBe(
      "Pistil / recession observation",
    );
    expect(HARVEST_INSPECTION_PREVIEW_LABEL.bud_maturity).toBe("Bud maturity note");
    expect(HARVEST_INSPECTION_PREVIEW_LABEL.close_flower_photo).toBe(
      "Close flower photo",
    );
  });

  it("surfaces the prefilled note verbatim", () => {
    const p = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: ctx,
    });
    const vm = buildHarvestInspectionPreviewViewModel(p);
    expect(vm.note).toBe(p.note);
    expect(vm.note).toMatch(/Trichome inspection note/);
  });

  it("only flags showPhotoComparison for close_flower_photo", () => {
    for (const preset of [
      "trichome_inspection",
      "pistil_recession",
      "bud_maturity",
    ] as const) {
      const p = buildHarvestInspectionQuickLogPrefill({ preset, context: ctx });
      expect(buildHarvestInspectionPreviewViewModel(p).showPhotoComparison).toBe(false);
    }
    const photo = buildHarvestInspectionQuickLogPrefill({
      preset: "close_flower_photo",
      context: ctx,
    });
    expect(buildHarvestInspectionPreviewViewModel(photo).showPhotoComparison).toBe(true);
  });
});

describe("photo comparison options + normalization", () => {
  it("exposes the documented option sets", () => {
    expect(HARVEST_PHOTO_COMPARISON_ANGLES.map((o) => o.value)).toEqual([
      "top",
      "side",
      "macro",
      "whole_cola",
      "other",
    ]);
    expect(HARVEST_PHOTO_COMPARISON_LIGHTINGS.map((o) => o.value)).toEqual([
      "natural",
      "grow_light",
      "flash",
      "loupe_microscope",
      "other",
    ]);
  });

  it("normalizes valid inputs and drops invalid ones", () => {
    expect(
      normalizeHarvestPhotoComparison({ angle: "top", lighting: "natural" }),
    ).toEqual({ angle: "top", lighting: "natural" });
    expect(normalizeHarvestPhotoComparison({ angle: "nope" })).toBe(null);
    expect(normalizeHarvestPhotoComparison(null)).toBe(null);
    expect(normalizeHarvestPhotoComparison({})).toBe(null);
    expect(
      normalizeHarvestPhotoComparison({ angle: "side", lighting: "x" }),
    ).toEqual({ angle: "side" });
  });
});

describe("static safety — harvestInspectionQuickLogPreviewRules", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "src/lib/harvestInspectionQuickLogPreviewRules.ts"),
    "utf8",
  );

  it("has no forbidden imports", () => {
    const importLines = SRC.split("\n").filter((l) => /^\s*import\s/.test(l));
    const joined = importLines.join("\n");
    const FORBIDDEN = [
      "@supabase/",
      "supabase/client",
      "supabase-js",
      "ai-doctor",
      "aiDoctor",
      "actionQueue",
      "action_queue",
      "deviceControl",
      "/alerts",
    ];
    for (const f of FORBIDDEN) expect(joined).not.toContain(f);
  });

  it("does not render forbidden harvest-instruction phrasing", () => {
    const FORBIDDEN_PHRASES = [
      "harvest now",
      "ready to harvest",
      "optimal",
      "guaranteed",
      /\bchop\b/i,
      /\bflush\b/i,
      "dark period",
      "fix immediately",
      "plant is unhealthy",
    ];
    for (const p of FORBIDDEN_PHRASES) {
      if (typeof p === "string") {
        expect(SRC.toLowerCase()).not.toContain(p.toLowerCase());
      } else {
        expect(p.test(SRC)).toBe(false);
      }
    }
  });
});
