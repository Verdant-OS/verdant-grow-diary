/**
 * Plant Detail Harvest Watch — accessibility + v0 readiness copy + photo-only
 * regression tests.
 *
 * Asserts:
 *  • v0 readiness badge exposes a meaningful aria-label
 *  • Non-interactive badge is not focusable
 *  • Evidence checklist renders as an accessible <ul> with status + reason
 *  • Missing strong-evidence items explain why
 *  • Recent photo evidence does NOT mark trichome inspection Present
 *  • Window evidence does NOT replace direct inspection evidence
 *  • Mounted card with photo-only diary entry never renders
 *    ready_for_manual_review
 *  • Every v0 state label + caution copy renders exactly
 *  • Universal + checklist cautions render exactly
 *  • Static safety scan (no AI/alerts/Action Queue/device/Supabase writes,
 *    no unsafe harvest instruction copy)
 *
 * Read-only. No Supabase. No AI. No alerts. No Action Queue. No device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup, within } from "@testing-library/react";

import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";
import {
  HARVEST_WATCH_V0_STATE_CAUTION,
  HARVEST_WATCH_V0_STATE_LABEL,
  HARVEST_WATCH_V0_UNIVERSAL_CAUTION,
  HARVEST_WATCH_V0_CHECKLIST_CAUTION,
  buildEvidenceChecklist,
  type HarvestWatchV0ReadinessState,
} from "@/lib/harvestWatchCardEvidenceRules";

const mocks = vi.hoisted(() => ({
  useGrowPlant: vi.fn(),
  usePlantRecentActivity: vi.fn(),
  buildVm: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlant: mocks.useGrowPlant,
}));
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: mocks.usePlantRecentActivity,
}));

// Spy/override the view-model adapter so we can drive each v0 state without
// fabricating data sources. The real adapter is exercised by its own tests
// and by the photo-only mount regression below (no override there).
vi.mock("@/lib/plantDetailHarvestWatchCardViewModel", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/plantDetailHarvestWatchCardViewModel")
  >("@/lib/plantDetailHarvestWatchCardViewModel");
  return {
    ...actual,
    buildPlantDetailHarvestWatchCardViewModel: (
      ...args: unknown[]
    ): ReturnType<typeof actual.buildPlantDetailHarvestWatchCardViewModel> => {
      if (mocks.buildVm.getMockImplementation()) {
        return mocks.buildVm(...args) as ReturnType<
          typeof actual.buildPlantDetailHarvestWatchCardViewModel
        >;
      }
      // Pass through to the real adapter for non-override tests.
      // @ts-expect-error — forwarded args
      return actual.buildPlantDetailHarvestWatchCardViewModel(...args);
    },
  };
});

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const CARD = read("src/components/PlantDetailHarvestWatchCard.tsx");
const RULES = read("src/lib/harvestWatchCardEvidenceRules.ts");
const ADAPTER = read("src/lib/plantDetailHarvestWatchCardViewModel.ts");

const ALL_SOURCES = [CARD, RULES, ADAPTER];

const FORBIDDEN_PHRASES = [
  /\bharvest now\b/i,
  /\bready to harvest\b/i,
  /\bguaranteed\b/i,
  /\boptimal\b/i,
  /\bdone\b/i,
  /\bchop\b/i,
  /\bflush\b/i,
  /\bdark period\b/i,
  /\bfix immediately\b/i,
  /\bplant is unhealthy\b/i,
];

const FORBIDDEN_IMPORTS = [
  /from\s+["'][^"']*ai-?doctor[^"']*["']/i,
  /from\s+["'][^"']*\/alerts?[^"']*["']/i,
  /from\s+["'][^"']*action[-_]?queue[^"']*["']/i,
  /from\s+["'][^"']*device[-_]?control[^"']*["']/i,
  /supabase[^"']*\.(insert|update|delete|upsert|rpc)\s*\(/i,
];

const PLANT = {
  id: "p1",
  name: "Sour Diesel Auto",
  strain: "Sour Diesel Auto",
  stage: "flower",
  startedAt: "2026-05-01T00:00:00.000Z",
  photo: "",
  tentId: "t1",
  growId: "g1",
  health: "healthy",
  lastNote: "",
};

function baseVm(state: HarvestWatchV0ReadinessState) {
  const checklist = buildEvidenceChecklist({
    recentRows: [],
    photoEvidenceCount: 0,
    daysInFlower: null,
    expectedHarvestDay: null,
  });
  return {
    row: {
      plantId: "p1",
      plantLabel: "Plant",
      phenotypeLabel: "Pheno",
      daysInFlower: null,
      readiness: { score: null, gatedReason: "Insufficient evidence" },
      readinessDisplay: "Insufficient evidence",
      daysVsHistory: { delta: null, label: "" },
      dryback: { confidence: "low", label: "", caption: "", visible: false, muted: true },
      harvestWindow: { startDay: 56, endDay: 70, confidence: "low", caption: "" },
      harvestWindowLabel: "Day 56–70",
      confidenceLabel: "Low",
      lastPhotoAgeDays: null,
      lastPhotoLabel: "No photos yet",
      photoPrompt: { state: "ok", confidencePenalty: 0, missedDays: 0, tone: "neutral", message: "" },
      trend: "unknown",
      trichome: { state: "not_available", caption: "", visible: false, insight: null, confidence: "low" },
    } as unknown as ReturnType<
      typeof import("@/lib/harvestWatchViewModel").buildHarvestWatchRowViewModel
    >,
    advisoryLabel: "Advisory only — grower decides",
    evidenceLabel: "Evidence building · 0 photo evidence points",
    missingContext: ["Flower start date or flip date"],
    nextObservation: "Add close-up bud photos and harvest notes.",
    stageLabel: "flower",
    v0ReadinessState: state,
    v0ReadinessStateLabel: HARVEST_WATCH_V0_STATE_LABEL[state],
    v0ReadinessCaution: HARVEST_WATCH_V0_STATE_CAUTION[state],
    evidenceChecklist: checklist,
    groupedRecent: [],
    nextInspection: {
      kind: "trichome_inspection" as const,
      label: "Add trichome inspection note",
      notePrefill: "Trichome check:",
      suggestedAction: "note" as const,
      eventType: "observation" as const,
    },
    evidenceHistory: {
      groups: [],
      caution:
        "Harvest evidence history is diary evidence only — confirm with direct inspection.",
      totalCount: 0,
    },
  };
}

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
  mocks.buildVm.mockReset();
  mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false });
  mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
});

describe("Harvest Watch — accessibility", () => {
  it("v0 readiness badge exposes an aria-label describing state + caution", () => {
    mocks.buildVm.mockReturnValue(baseVm("watch_window"));
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    const badge = screen.getByTestId("plant-detail-harvest-watch-v0-state");
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/Harvest Watch readiness/i);
    expect(label).toContain(HARVEST_WATCH_V0_STATE_LABEL.watch_window);
    expect(label).toContain(HARVEST_WATCH_V0_STATE_CAUTION.watch_window);
  });

  it("v0 readiness badge is not interactive and not unnecessarily tabbable", () => {
    mocks.buildVm.mockReturnValue(baseVm("not_enough_evidence"));
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    const badge = screen.getByTestId("plant-detail-harvest-watch-v0-state");
    expect(badge.tagName.toLowerCase()).not.toBe("button");
    expect(badge.tagName.toLowerCase()).not.toBe("a");
    const tabIndex = badge.getAttribute("tabindex");
    expect(tabIndex === null || Number(tabIndex) < 0).toBe(true);
  });

  it("checklist renders as a labelled <ul> with one <li> per item", () => {
    mocks.buildVm.mockReturnValue(baseVm("not_enough_evidence"));
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    const container = screen.getByTestId("plant-detail-harvest-watch-checklist");
    const list = within(container).getByRole("list", {
      name: /evidence checklist/i,
    });
    expect(list.tagName.toLowerCase()).toBe("ul");
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(5);
    for (const li of items) {
      expect(li.getAttribute("tabindex")).toBeNull();
    }
  });

  it("each checklist item exposes evidence name, status, and reason text", () => {
    mocks.buildVm.mockReturnValue(baseVm("not_enough_evidence"));
    render(<PlantDetailHarvestWatchCard plantId="p1" />);
    const tri = screen.getByTestId("harvest-watch-checklist-trichome_inspection");
    expect(tri.textContent).toMatch(/Trichome inspection note/);
    expect(tri.textContent).toMatch(/Missing/);
    const reason = screen.getByTestId(
      "harvest-watch-checklist-trichome_inspection-reason",
    );
    expect(reason.textContent).toMatch(/add a trichome inspection note/i);
  });
});

describe("Harvest Watch — missing strong evidence", () => {
  it("missing trichome / pistil / bud notes each explain what to add", () => {
    const checklist = buildEvidenceChecklist({
      recentRows: [],
      photoEvidenceCount: 0,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    const r = (k: string) => checklist.find((i) => i.key === k)!.reason;
    expect(r("trichome_inspection")).toMatch(/add a trichome inspection note/i);
    expect(r("pistil_observation")).toMatch(/pistil color or recession/i);
    expect(r("bud_maturity_note")).toMatch(/bud maturity observations/i);
  });

  it("recent photos limited/missing never implies trichome inspection present", () => {
    const checklist = buildEvidenceChecklist({
      recentRows: [
        // Photo with non-harvest note must NOT mark trichome present.
        {
          id: "n1",
          eventType: "observation",
          occurredAt: "2026-06-01T00:00:00.000Z",
          occurredAtLabel: "Jun 1",
          notePreview: "Watered today",
          plantId: "p1",
          tentId: "t1",
          hasPhoto: true,
          hasSnapshot: false,
          snapshotAt: null,
          snapshotStale: false,
          snapshotSourceLabel: null,
          isManualEntry: false,
          warnings: [],
          hasHardwareReadings: false,
          hardwareReadingLines: [],
        },
      ],
      photoEvidenceCount: 1,
      daysInFlower: null,
      expectedHarvestDay: null,
    });
    const tri = checklist.find((i) => i.key === "trichome_inspection")!;
    expect(tri.status).toBe("missing");
    expect(tri.present).toBe(false);
    const photos = checklist.find((i) => i.key === "recent_photos")!;
    expect(photos.status).toBe("limited");
    expect(photos.reason).toMatch(/do not replace direct inspection/i);
  });

  it("window evidence (limited/present) never replaces direct inspection", () => {
    const limited = buildEvidenceChecklist({
      recentRows: [],
      photoEvidenceCount: 0,
      daysInFlower: 40,
      expectedHarvestDay: null,
    }).find((i) => i.key === "window_evidence")!;
    expect(limited.status).toBe("limited");
    expect(limited.reason).toMatch(/direct inspection still required/i);

    const present = buildEvidenceChecklist({
      recentRows: [],
      photoEvidenceCount: 0,
      daysInFlower: 40,
      expectedHarvestDay: 60,
    }).find((i) => i.key === "window_evidence")!;
    expect(present.status).toBe("present");
  });
});

describe("Harvest Watch — photo-only mounted regression", () => {
  it("photo-only diary entry never produces ready_for_manual_review on the mounted card", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        {
          id: "e1",
          event_type: "photo",
          occurred_at: "2026-06-17T10:00:00.000Z",
          notes: "",
          plant_id: "p1",
          tent_id: "t1",
          photo_url: "https://example.test/p.jpg",
        },
      ],
      isLoading: false,
    });
    // No buildVm override — real adapter is exercised.
    render(<PlantDetailHarvestWatchCard plantId="p1" hasPlantPhoto />);

    const badge = screen.getByTestId("plant-detail-harvest-watch-v0-state");
    expect(badge.getAttribute("data-state")).not.toBe("ready_for_manual_review");
    expect(badge.textContent).not.toMatch(/Ready for manual review/);

    const caution = screen.getByTestId("plant-detail-harvest-watch-v0-caution");
    expect(caution.textContent).not.toMatch(
      /Evidence supports a manual harvest review/,
    );

    // Trichome inspection must remain Missing (photo doesn't count).
    const tri = screen.getByTestId("harvest-watch-checklist-trichome_inspection");
    expect(tri.getAttribute("data-status")).toBe("missing");
    expect(tri.textContent).toMatch(/Missing/);
  });
});

describe("Harvest Watch — v0 state labels & cautions render exactly", () => {
  const STATES: HarvestWatchV0ReadinessState[] = [
    "not_enough_evidence",
    "too_early_to_call",
    "watch_window",
    "ready_for_manual_review",
    "past_expected_window",
    "unknown",
  ];

  const EXPECTED_CAUTION: Record<HarvestWatchV0ReadinessState, string> = {
    not_enough_evidence:
      "Not enough harvest evidence yet. Add a trichome or flower inspection note.",
    too_early_to_call:
      "Too early to call. Keep logging plant response and flower development.",
    watch_window:
      "Approaching manual review window. Inspect trichomes, pistils, and recent plant response.",
    ready_for_manual_review:
      "Evidence supports a manual harvest review. The grower decides.",
    past_expected_window:
      "Past expected window based on available dates. Re-check trichomes, pistils, and plant condition before deciding.",
    unknown:
      "Harvest Watch cannot determine a review state from the available information.",
  };

  const EXPECTED_LABEL: Record<HarvestWatchV0ReadinessState, string> = {
    not_enough_evidence: "Not enough evidence",
    too_early_to_call: "Too early to call",
    watch_window: "Approaching watch window",
    ready_for_manual_review: "Ready for manual review",
    past_expected_window: "Past expected window",
    unknown: "Unknown",
  };

  for (const state of STATES) {
    it(`renders exact label + caution for ${state}`, () => {
      cleanup();
      mocks.buildVm.mockReturnValue(baseVm(state));
      render(<PlantDetailHarvestWatchCard plantId="p1" />);

      expect(
        screen.getByTestId("plant-detail-harvest-watch-v0-state").textContent,
      ).toBe(EXPECTED_LABEL[state]);
      expect(
        screen.getByTestId("plant-detail-harvest-watch-v0-caution").textContent,
      ).toBe(EXPECTED_CAUTION[state]);
      expect(
        screen.getByTestId("plant-detail-harvest-watch-evidence-only-caution")
          .textContent,
      ).toContain(HARVEST_WATCH_V0_UNIVERSAL_CAUTION);
      expect(
        screen.getByTestId("plant-detail-harvest-watch-checklist-caution")
          .textContent,
      ).toBe(HARVEST_WATCH_V0_CHECKLIST_CAUTION);
    });
  }
});

describe("Harvest Watch — static safety scan", () => {
  it("source files contain no unsafe harvest-instruction phrases", () => {
    for (const src of ALL_SOURCES) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(src).not.toMatch(phrase);
      }
    }
  });

  it("source files contain no forbidden imports or Supabase writes", () => {
    for (const src of ALL_SOURCES) {
      for (const pat of FORBIDDEN_IMPORTS) {
        expect(src).not.toMatch(pat);
      }
    }
  });
});
