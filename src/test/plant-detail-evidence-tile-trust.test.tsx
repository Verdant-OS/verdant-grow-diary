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

const mocks = vi.hoisted(() => ({
  useGrowPlant: vi.fn(),
  usePlantRecentActivity: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlant: mocks.useGrowPlant,
}));
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: mocks.usePlantRecentActivity,
}));

const plant = {
  id: "p1",
  name: "Sour Diesel Auto",
  strain: "Sour Diesel Auto",
  stage: "flower",
  startedAt: "2026-05-01T00:00:00.000Z",
  photo: null as string | null,
};

const photoRows = [
  { hasPhoto: true, hasSnapshot: false, occurredAt: "2026-06-01T00:00:00.000Z" },
  { hasPhoto: true, hasSnapshot: false, occurredAt: "2026-06-02T00:00:00.000Z" },
  { hasPhoto: true, hasSnapshot: false, occurredAt: "2026-06-03T00:00:00.000Z" },
];

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
  mocks.useGrowPlant.mockReturnValue({ data: plant, isLoading: false });
  mocks.usePlantRecentActivity.mockReturnValue({ data: photoRows, isLoading: false });
});

describe("Evidence tile trust + traceability (render)", () => {
  it("exposes stable test IDs for tile, count, explanation and source label", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="live"
      />,
    );
    expect(screen.getByTestId("evidence-tile")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-count")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-explanation")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-source-label")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-tile-mismatch-note")).toBeInTheDocument();
    expect(
      screen.getByTestId("evidence-tile-supporting-records-link"),
    ).toBeInTheDocument();
  });

  it("ties the explanation to the tile via aria-describedby", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="live"
      />,
    );
    const tile = screen.getByTestId("evidence-tile");
    const expl = screen.getByTestId("evidence-tile-explanation");
    expect(tile).toHaveAttribute("aria-describedby", "evidence-tile-explanation-text");
    expect(expl).toHaveAttribute("id", "evidence-tile-explanation-text");
  });

  it("supporting-records link has an accessible name and points at Recent Activity", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="live"
      />,
    );
    const cta = screen.getByTestId("evidence-tile-supporting-records-link");
    expect(cta).toHaveAttribute("href", "#plant-recent-activity");
    expect(cta).toHaveAccessibleName(/Recent Activity/i);
  });

  it("labels demo evidence explicitly and never says 'live'", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="demo"
      />,
    );
    const source = screen.getByTestId("evidence-tile-source-label");
    const expl = screen.getByTestId("evidence-tile-explanation");
    const mismatch = screen.getByTestId("evidence-tile-mismatch-note");
    expect(source).toHaveAttribute("data-source", "demo");
    expect(source.textContent).toMatch(/Demo/i);
    for (const el of [source, expl, mismatch]) {
      expect(el.textContent ?? "").not.toMatch(/\blive\b/i);
      expect(el.textContent ?? "").not.toMatch(/gallery photos exist/i);
    }
  });

  it("mismatch note is announced politely via role=note + aria-live", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="live"
      />,
    );
    const mismatch = screen.getByTestId("evidence-tile-mismatch-note");
    expect(mismatch).toHaveAttribute("role", "note");
    expect(mismatch).toHaveAttribute("aria-live", "polite");
  });

  it("hides the CTA when there is no evidence to inspect", () => {
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false });
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={0}
        dataSource="live"
      />,
    );
    expect(
      screen.queryByTestId("evidence-tile-supporting-records-link"),
    ).not.toBeInTheDocument();
  });

  it("does not render the mismatch note when counts align", () => {
    render(
      <PlantDetailHarvestWatchCard
        plantId="p1"
        galleryPhotoCount={3}
        dataSource="live"
      />,
    );
    expect(
      screen.queryByTestId("evidence-tile-mismatch-note"),
    ).not.toBeInTheDocument();
  });
});
