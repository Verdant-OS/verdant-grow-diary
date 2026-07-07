/**
 * Evidence tile trust + traceability — rendered card assertions.
 * Ensures the polished Evidence tile:
 *   - exposes stable test IDs
 *   - carries an aria description via aria-describedby
 *   - renders an honest source label
 *   - renders a "View related activity" CTA linking to Recent Activity
 *   - never claims live gallery photos exist in demo mode
 *
 * No network. No AI. No Action Queue writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";
import { buildPhotoEvidenceDisplay } from "@/lib/plantPhotoEvidenceReconciliation";

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
vi.mock("@/lib/plantDetailHarvestWatchCardViewModel", () => ({
  buildPlantDetailHarvestWatchCardViewModel: mocks.buildVm,
}));

const plant = { id: "p1", name: "P", strain: null, stage: "flower", startedAt: null, photo: null };

function makeVm(overrides: {
  evidenceCount: number;
  galleryPhotoCount: number | null;
  dataSource: "live" | "demo" | "unknown";
}) {
  const display = buildPhotoEvidenceDisplay({
    evidenceCount: overrides.evidenceCount,
    galleryPhotoCount: overrides.galleryPhotoCount,
    dataSource: overrides.dataSource,
  });
  return {
    row: {
      plantId: "p1",
      trend: "unknown",
      readiness: { score: null },
      readinessDisplay: "—",
      harvestWindow: { caption: "" },
      harvestWindowLabel: "—",
    },
    advisoryLabel: "Advisory only — grower decides",
    evidenceLabel: `Evidence building · ${display.label}`,
    evidenceExplanation: display.explanation,
    evidenceGalleryMismatch: display.hasGalleryMismatch,
    evidenceMismatchNote: display.mismatchNote,
    photoEvidenceDisplay: display,
    missingContext: [],
    nextObservation: "—",
    stageLabel: "flower",
    v0ReadinessState: "not_enough_evidence",
    v0ReadinessStateLabel: "Not enough evidence",
    v0ReadinessCaution: "—",
    evidenceChecklist: [],
    groupedRecent: [],
    nextInspection: { kind: "photo", label: "Photo", plantId: "p1", plantName: "P" },
    evidenceHistory: { caution: "", groups: [] },
  };
}

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
  mocks.buildVm.mockReset();
  mocks.useGrowPlant.mockReturnValue({ data: plant, isLoading: false });
  mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
});

describe("Evidence tile trust + traceability (render)", () => {
  it("exposes stable test IDs for tile, count, explanation and source label", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 0, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="live" />);
    expect(screen.getByTestId("evidence-tile")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-count")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-explanation")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-source-label")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-mismatch-note")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-supporting-records-link")).toBeInTheDocument();
  });

  it("ties the explanation to the tile via aria-describedby", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 0, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="live" />);
    const tile = screen.getByTestId("evidence-tile");
    const expl = screen.getByTestId("evidence-tile-explanation");
    expect(tile).toHaveAttribute("aria-describedby", "evidence-tile-explanation-text");
    expect(expl).toHaveAttribute("id", "evidence-tile-explanation-text");
  });

  it("supporting-records link has an accessible name and points at Recent Activity", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 0, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="live" />);
    const cta = screen.getByTestId("evidence-tile-supporting-records-link");
    expect(cta).toHaveAttribute("href", "#plant-recent-activity");
    expect(cta).toHaveAccessibleName(/Recent Activity/i);
  });

  it("labels demo evidence explicitly and never uses the bare word 'live'", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 0, dataSource: "demo" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="demo" />);
    const source = screen.getByTestId("evidence-tile-source-label");
    const expl = screen.getByTestId("evidence-tile-explanation");
    const mismatch = screen.getByTestId("evidence-tile-mismatch-note");
    expect(source).toHaveAttribute("data-source", "demo");
    expect(source.textContent).toMatch(/Demo/i);
    for (const el of [source, expl, mismatch]) {
      expect(el.textContent ?? "").not.toMatch(/\blive\b/i);
    }
  });

  it("mismatch note is announced politely via role=note + aria-live", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 0, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="live" />);
    const mismatch = screen.getByTestId("evidence-tile-mismatch-note");
    expect(mismatch).toHaveAttribute("role", "note");
    expect(mismatch).toHaveAttribute("aria-live", "polite");
  });

  it("hides the CTA when there is no evidence to inspect", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 0, galleryPhotoCount: 0, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={0} dataSource="live" />);
    expect(screen.queryByTestId("evidence-tile-supporting-records-link")).not.toBeInTheDocument();
  });

  it("does not render the mismatch note when counts align", () => {
    mocks.buildVm.mockReturnValue(makeVm({ evidenceCount: 3, galleryPhotoCount: 3, dataSource: "live" }));
    render(<PlantDetailHarvestWatchCard plantId="p1" galleryPhotoCount={3} dataSource="live" />);
    expect(screen.queryByTestId("evidence-tile-mismatch-note")).not.toBeInTheDocument();
  });
});
