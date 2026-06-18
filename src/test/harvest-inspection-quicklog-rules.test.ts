/**
 * harvestInspectionQuickLogRules — pure helper tests.
 *
 * Verifies missing-evidence → Quick Log preset mapping, preset copy safety,
 * Harvest Watch round-trip recognition (saved note flows back into the
 * checklist as Present), and the photo preset NOT marking trichome present.
 *
 * Read-only. No Supabase. No AI. No alerts. No Action Queue.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  HARVEST_INSPECTION_PRESET_LABEL,
  buildHarvestInspectionQuickLogPrefill,
  pickHarvestInspectionPreset,
  type HarvestInspectionPreset,
} from "@/lib/harvestInspectionQuickLogRules";
import {
  buildEvidenceChecklist,
  type HarvestEvidenceChecklistItem,
  type HarvestEvidenceKey,
} from "@/lib/harvestWatchCardEvidenceRules";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

const ROOT = resolve(__dirname, "../..");
const RULES_SRC = readFileSync(
  resolve(ROOT, "src/lib/harvestInspectionQuickLogRules.ts"),
  "utf8",
);

function checklist(
  missing: HarvestEvidenceKey[],
): HarvestEvidenceChecklistItem[] {
  const all: HarvestEvidenceKey[] = [
    "trichome_inspection",
    "pistil_observation",
    "bud_maturity_note",
    "window_evidence",
    "recent_photos",
  ];
  return all.map((k) => ({
    key: k,
    label: k,
    present: !missing.includes(k),
    status: missing.includes(k) ? ("missing" as const) : ("present" as const),
    reason: "",
  }));
}

const CTX = {
  plantId: "p1",
  plantName: "Sour Diesel",
  growId: "g1",
  tentId: "t1",
  tentName: "Tent A",
};

describe("pickHarvestInspectionPreset", () => {
  it("missing trichome → trichome_inspection", () => {
    expect(pickHarvestInspectionPreset(checklist(["trichome_inspection"]))).toBe(
      "trichome_inspection",
    );
  });
  it("missing pistil → pistil_recession", () => {
    expect(pickHarvestInspectionPreset(checklist(["pistil_observation"]))).toBe(
      "pistil_recession",
    );
  });
  it("missing bud maturity → bud_maturity", () => {
    expect(pickHarvestInspectionPreset(checklist(["bud_maturity_note"]))).toBe(
      "bud_maturity",
    );
  });
  it("missing recent photo → close_flower_photo", () => {
    expect(pickHarvestInspectionPreset(checklist(["recent_photos"]))).toBe(
      "close_flower_photo",
    );
  });
  it("priority is trichome → pistil → bud → photo", () => {
    expect(
      pickHarvestInspectionPreset(
        checklist([
          "trichome_inspection",
          "pistil_observation",
          "bud_maturity_note",
          "recent_photos",
        ]),
      ),
    ).toBe("trichome_inspection");
  });
});

describe("buildHarvestInspectionQuickLogPrefill", () => {
  it("photo preset uses eventType=photo, others use observation", () => {
    const presets: HarvestInspectionPreset[] = [
      "trichome_inspection",
      "pistil_recession",
      "bud_maturity",
      "close_flower_photo",
    ];
    for (const preset of presets) {
      const p = buildHarvestInspectionQuickLogPrefill({ preset, context: CTX });
      if (preset === "close_flower_photo") {
        expect(p.eventType).toBe("photo");
      } else {
        expect(p.eventType).toBe("observation");
      }
      expect(p.source).toBe("harvest-watch-inspection");
      expect(p.preset).toBe(preset);
      expect(p.plantId).toBe("p1");
      expect(p.tentId).toBe("t1");
      expect(p.suggestSnapshot).toBe(true);
      expect(typeof p.note).toBe("string");
      expect(p.note.length).toBeGreaterThan(20);
    }
  });

  it("falls back to null ids when context is missing", () => {
    const p = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: null,
    });
    expect(p.plantId).toBeNull();
    expect(p.tentId).toBeNull();
    expect(p.suggestSnapshot).toBe(false);
  });

  it("all preset note text contains cautious copy and avoids forbidden phrases", () => {
    const forbidden = [
      /harvest now/i,
      /ready to harvest/i,
      /\bguaranteed\b/i,
      /\boptimal\b/i,
      /\bchop\b/i,
      /\bflush\b/i,
      /dark period/i,
      /fix immediately/i,
      /plant is unhealthy/i,
    ];
    const presets: HarvestInspectionPreset[] = [
      "trichome_inspection",
      "pistil_recession",
      "bud_maturity",
      "close_flower_photo",
    ];
    for (const preset of presets) {
      const { note } = buildHarvestInspectionQuickLogPrefill({
        preset,
        context: CTX,
      });
      for (const f of forbidden) expect(note).not.toMatch(f);
      expect(note).toMatch(/grower decides/i);
      expect(note).toMatch(/Record what you directly observed/i);
    }
    // Photo preset and inspection notes warn against single-photo reliance.
    for (const preset of [
      "trichome_inspection",
      "pistil_recession",
      "close_flower_photo",
    ] as const) {
      const { note } = buildHarvestInspectionQuickLogPrefill({
        preset,
        context: CTX,
      });
      expect(note).toMatch(/Do not rely on one photo alone/i);
    }
  });

  it("preset labels never contain forbidden harvest instruction phrasing", () => {
    const forbidden = [/harvest now/i, /ready to harvest/i, /\bchop\b/i];
    for (const label of Object.values(HARVEST_INSPECTION_PRESET_LABEL)) {
      for (const f of forbidden) expect(label).not.toMatch(f);
    }
  });
});

describe("Harvest Watch round-trip recognition", () => {
  function makeRow(over: Partial<PlantRecentActivityRow> = {}): PlantRecentActivityRow {
    return {
      id: over.id ?? "e1",
      eventType: "observation",
      occurredAt: over.occurredAt ?? "2026-06-15T10:00:00.000Z",
      occurredAtLabel: "Jun 15",
      notePreview: over.notePreview ?? "",
      plantId: "p1",
      tentId: "t1",
      hasPhoto: over.hasPhoto ?? false,
      hasSnapshot: false,
      snapshotAt: null,
      snapshotStale: false,
      snapshotSourceLabel: null,
      isManualEntry: false,
      warnings: [],
      hasHardwareReadings: false,
      hardwareReadingLines: [],
      ...over,
    };
  }

  it("trichome preset note (saved verbatim) marks trichome checklist Present", () => {
    const { note } = buildHarvestInspectionQuickLogPrefill({
      preset: "trichome_inspection",
      context: CTX,
    });
    const items = buildEvidenceChecklist({
      recentRows: [makeRow({ notePreview: note })],
      photoEvidenceCount: 0,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.find((i) => i.key === "trichome_inspection")!.status).toBe(
      "present",
    );
  });

  it("pistil preset note marks pistil checklist Present", () => {
    const { note } = buildHarvestInspectionQuickLogPrefill({
      preset: "pistil_recession",
      context: CTX,
    });
    const items = buildEvidenceChecklist({
      recentRows: [makeRow({ notePreview: note })],
      photoEvidenceCount: 0,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.find((i) => i.key === "pistil_observation")!.status).toBe(
      "present",
    );
  });

  it("bud maturity preset note marks bud maturity checklist Present", () => {
    const { note } = buildHarvestInspectionQuickLogPrefill({
      preset: "bud_maturity",
      context: CTX,
    });
    const items = buildEvidenceChecklist({
      recentRows: [makeRow({ notePreview: note })],
      photoEvidenceCount: 0,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.find((i) => i.key === "bud_maturity_note")!.status).toBe(
      "present",
    );
  });

  it("close flower photo preset note + photo counts as recent_photos but NOT trichome", () => {
    const { note } = buildHarvestInspectionQuickLogPrefill({
      preset: "close_flower_photo",
      context: CTX,
    });
    const items = buildEvidenceChecklist({
      recentRows: [makeRow({ notePreview: note, hasPhoto: true })],
      photoEvidenceCount: 1,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.find((i) => i.key === "recent_photos")!.status).toBe(
      "limited",
    );
    // The phrase "Close flower photo" must not be misread as trichome evidence.
    expect(items.find((i) => i.key === "trichome_inspection")!.status).toBe(
      "missing",
    );
  });

  it("a bare photo with non-inspection note does not mark trichome Present", () => {
    const items = buildEvidenceChecklist({
      recentRows: [makeRow({ notePreview: "Watered today", hasPhoto: true })],
      photoEvidenceCount: 1,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.find((i) => i.key === "trichome_inspection")!.status).toBe(
      "missing",
    );
  });
});

describe("harvestInspectionQuickLogRules — static safety", () => {
  it("source contains no forbidden imports / writes / AI / alerts / Action Queue / device", () => {
    const forbidden = [
      /from\s+["'][^"']*ai-?doctor[^"']*["']/i,
      /from\s+["'][^"']*\/alerts?[^"']*["']/i,
      /from\s+["'][^"']*action[-_]?queue[^"']*["']/i,
      /from\s+["'][^"']*device[-_]?control[^"']*["']/i,
      /from\s+["'][^"']*\/supabase\/client[^"']*["']/i,
      /supabase[^"']*\.(insert|update|delete|upsert|rpc)\s*\(/i,
      /functions\.invoke\b/i,
    ];
    for (const f of forbidden) expect(RULES_SRC).not.toMatch(f);
  });
});
