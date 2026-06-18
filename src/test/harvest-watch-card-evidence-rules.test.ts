/**
 * harvestWatchCardEvidenceRules — pure helper tests.
 *
 * Read-only evidence tracking. No I/O, no Supabase, no AI, no alerts,
 * no Action Queue, no automation, no device control.
 */
import { describe, it, expect } from "vitest";

import {
  buildEvidenceChecklist,
  groupHarvestRecentItems,
  HARVEST_WATCH_V0_STATE_CAUTION,
  HARVEST_WATCH_V0_STATE_LABEL,
  mapToV0ReadinessState,
  pickNextInspection,
  type HarvestEvidenceChecklistItem,
} from "@/lib/harvestWatchCardEvidenceRules";
import type { HarvestWatchRowViewModel } from "@/lib/harvestWatchViewModel";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";

function makeRow(
  overrides: Partial<HarvestWatchRowViewModel> = {},
): HarvestWatchRowViewModel {
  return {
    plantId: "p1",
    plantLabel: "Plant",
    phenotypeLabel: "Pheno",
    daysInFlower: null,
    readiness: { score: null, gatedReason: "Insufficient evidence" } as HarvestWatchRowViewModel["readiness"],
    readinessDisplay: "Insufficient evidence",
    daysVsHistory: { delta: null, label: "" },
    dryback: { confidence: "low", label: "", caption: "" } as HarvestWatchRowViewModel["dryback"],
    harvestWindow: {
      startDay: 56,
      endDay: 70,
      confidence: "low",
      caption: "",
    } as HarvestWatchRowViewModel["harvestWindow"],
    harvestWindowLabel: "Day 56–70",
    confidenceLabel: "Low",
    lastPhotoAgeDays: null,
    lastPhotoLabel: "No photos yet",
    photoPrompt: { state: "ok", confidencePenalty: 0 } as HarvestWatchRowViewModel["photoPrompt"],
    trend: "unknown",
    trichome: { state: "not_available", caption: "" } as HarvestWatchRowViewModel["trichome"],
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<PlantRecentActivityRow> = {},
): PlantRecentActivityRow {
  return {
    id: overrides.id ?? "e1",
    eventType: "observation",
    occurredAt: overrides.occurredAt ?? "2025-06-01T10:00:00.000Z",
    occurredAtLabel: overrides.occurredAtLabel ?? "Jun 1",
    notePreview: overrides.notePreview ?? "",
    plantId: "p1",
    tentId: "t1",
    hasPhoto: overrides.hasPhoto ?? false,
    hasSnapshot: overrides.hasSnapshot ?? false,
    snapshotAt: null,
    snapshotStale: false,
    snapshotSourceLabel: null,
    isManualEntry: false,
    warnings: [],
    hasHardwareReadings: false,
    hardwareReadingLines: [],
    ...overrides,
  };
}

describe("mapToV0ReadinessState", () => {
  it("returns not_enough_evidence when readiness is gated and trend unknown", () => {
    const row = makeRow();
    expect(
      mapToV0ReadinessState({
        row,
        photoEvidenceCount: 0,
        daysInFlower: null,
        expectedHarvestDay: null,
      }),
    ).toBe("not_enough_evidence");
  });

  it("returns watch_window when trend is approaching with weak score", () => {
    const row = makeRow({ trend: "approaching", readiness: { score: 0.6 } as HarvestWatchRowViewModel["readiness"] });
    expect(
      mapToV0ReadinessState({ row, photoEvidenceCount: 1, daysInFlower: null, expectedHarvestDay: null }),
    ).toBe("watch_window");
  });

  it("returns ready_for_manual_review only with strong score AND multiple photos", () => {
    const row = makeRow({ trend: "approaching", readiness: { score: 0.85 } as HarvestWatchRowViewModel["readiness"] });
    expect(
      mapToV0ReadinessState({ row, photoEvidenceCount: 1, daysInFlower: null, expectedHarvestDay: null }),
    ).toBe("watch_window");
    expect(
      mapToV0ReadinessState({ row, photoEvidenceCount: 3, daysInFlower: null, expectedHarvestDay: null }),
    ).toBe("ready_for_manual_review");
  });

  it("returns too_early_to_call when daysInFlower is well before window start", () => {
    const row = makeRow({ trend: "early" });
    expect(
      mapToV0ReadinessState({ row, photoEvidenceCount: 0, daysInFlower: 20, expectedHarvestDay: 60 }),
    ).toBe("too_early_to_call");
  });

  it("returns past_expected_window when daysInFlower is past window end + 7", () => {
    const row = makeRow({ trend: "holding" });
    expect(
      mapToV0ReadinessState({ row, photoEvidenceCount: 1, daysInFlower: 85, expectedHarvestDay: 65 }),
    ).toBe("past_expected_window");
  });

  it("all v0 state labels and cautions never include harvest-instruction phrasing", () => {
    const forbidden = [/harvest now/i, /ready to harvest/i, /guaranteed/i, /optimal/i, /\bchop\b/i, /\bflush\b/i, /dark period/i];
    for (const [, label] of Object.entries(HARVEST_WATCH_V0_STATE_LABEL)) {
      for (const f of forbidden) expect(label).not.toMatch(f);
    }
    for (const [, caution] of Object.entries(HARVEST_WATCH_V0_STATE_CAUTION)) {
      for (const f of forbidden) expect(caution).not.toMatch(f);
    }
    // ready_for_manual_review must defer to grower
    expect(HARVEST_WATCH_V0_STATE_CAUTION.ready_for_manual_review).toMatch(/grower decides/i);
  });
});

describe("buildEvidenceChecklist", () => {
  it("returns all five items in stable order, all missing when no notes/photos", () => {
    const items = buildEvidenceChecklist({
      recentRows: [],
      photoEvidenceCount: 0,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    expect(items.map((i) => i.key)).toEqual([
      "trichome_inspection",
      "pistil_observation",
      "bud_maturity_note",
      "window_evidence",
      "recent_photos",
    ]);
    expect(items.every((i) => i.present === false)).toBe(true);
  });

  it("detects trichome / pistil / bud notes from text and not from generic photos alone", () => {
    const items = buildEvidenceChecklist({
      recentRows: [
        makeActivity({ id: "n1", notePreview: "Checked trichomes — mostly cloudy" }),
        makeActivity({ id: "n2", notePreview: "Pistils about 60% receded" }),
        makeActivity({ id: "n3", notePreview: "Buds swelling nicely" }),
        // Generic photo with non-harvest text must NOT mark trichome present.
        makeActivity({ id: "n4", notePreview: "Watered today", hasPhoto: true }),
      ],
      photoEvidenceCount: 1,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    const by = (k: string) => items.find((i) => i.key === k)!.present;
    expect(by("trichome_inspection")).toBe(true);
    expect(by("pistil_observation")).toBe(true);
    expect(by("bud_maturity_note")).toBe(true);
    expect(by("recent_photos")).toBe(true);
    expect(by("window_evidence")).toBe(false);
  });

  it("marks window_evidence true when daysInFlower or expectedHarvestDay is known", () => {
    const items = buildEvidenceChecklist({
      recentRows: [],
      photoEvidenceCount: 0,
      daysInFlower: 40,
      expectedHarvestDay: 60,
    });
    expect(items.find((i) => i.key === "window_evidence")!.present).toBe(true);
  });
});

describe("groupHarvestRecentItems", () => {
  it("returns three groups with safe empty copy when no rows", () => {
    const groups = groupHarvestRecentItems([]);
    expect(groups.map((g) => g.key)).toEqual(["photos", "notes", "snapshots"]);
    for (const g of groups) {
      expect(g.items.length).toBe(0);
      expect(g.emptyCopy.length).toBeGreaterThan(0);
    }
  });

  it("groups photos / notes / snapshots and sorts newest first", () => {
    const groups = groupHarvestRecentItems([
      makeActivity({
        id: "a",
        occurredAt: "2025-06-01T10:00:00.000Z",
        hasPhoto: true,
        notePreview: "trichome close-up",
      }),
      makeActivity({
        id: "b",
        occurredAt: "2025-06-03T10:00:00.000Z",
        hasPhoto: true,
        notePreview: "bud swelling",
      }),
      makeActivity({
        id: "c",
        occurredAt: "2025-06-02T10:00:00.000Z",
        hasSnapshot: true,
        notePreview: "pistil check + snapshot",
      }),
      makeActivity({ id: "d", notePreview: "water only" }),
    ]);
    const photos = groups.find((g) => g.key === "photos")!;
    expect(photos.items.map((i) => i.id)).toEqual(["b", "a"]);

    const notes = groups.find((g) => g.key === "notes")!;
    expect(notes.items.map((i) => i.id)).toEqual(["b", "c", "a"]);

    const snapshots = groups.find((g) => g.key === "snapshots")!;
    expect(snapshots.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("does not crash on null input", () => {
    expect(() => groupHarvestRecentItems(null)).not.toThrow();
    expect(() => groupHarvestRecentItems(undefined)).not.toThrow();
  });
});

describe("pickNextInspection", () => {
  function checklist(missing: string[]): HarvestEvidenceChecklistItem[] {
    const all = [
      "trichome_inspection",
      "pistil_observation",
      "bud_maturity_note",
      "window_evidence",
      "recent_photos",
    ] as const;
    return all.map((k) => ({
      key: k,
      label: k,
      present: !missing.includes(k),
    }));
  }

  it("prefers trichome inspection when missing", () => {
    const r = pickNextInspection(
      checklist(["trichome_inspection", "pistil_observation", "recent_photos"]),
    );
    expect(r.kind).toBe("trichome_inspection");
    expect(r.suggestedAction).toBe("note");
    expect(r.eventType).toBe("observation");
  });

  it("falls back to pistil → bud → photo → general", () => {
    expect(pickNextInspection(checklist(["pistil_observation"])).kind).toBe("pistil_observation");
    expect(pickNextInspection(checklist(["bud_maturity_note"])).kind).toBe("bud_maturity_note");
    expect(pickNextInspection(checklist(["recent_photos"])).kind).toBe("close_flower_photo");
    expect(pickNextInspection(checklist([])).kind).toBe("general_observation");
  });

  it("prefill text never contains aggressive harvest instructions", () => {
    const forbidden = [/harvest now/i, /\bchop\b/i, /\bflush\b/i, /dark period/i, /defoliate aggressively/i];
    const kinds = [
      checklist(["trichome_inspection"]),
      checklist(["pistil_observation"]),
      checklist(["bud_maturity_note"]),
      checklist(["recent_photos"]),
      checklist([]),
    ];
    for (const c of kinds) {
      const p = pickNextInspection(c);
      for (const f of forbidden) {
        expect(p.label).not.toMatch(f);
        expect(p.notePrefill).not.toMatch(f);
      }
    }
  });
});
