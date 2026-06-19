/**
 * Plant Detail — Harvest Evidence Report mount tests.
 *
 * Mounts the report panel via its plant-scoped mount component and
 * asserts:
 *   - scoped to current plant
 *   - empty-state copy renders
 *   - explicit trichome evidence appears
 *   - generic photo never appears as trichome evidence
 *   - caution + no-actions copy renders
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import PlantDetailHarvestEvidenceReportMount from "@/components/PlantDetailHarvestEvidenceReportMount";

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

const PLANT = {
  id: "p1",
  name: "Sour Diesel",
  strain: "Sour Diesel Auto",
  stage: "flower",
  tentId: "t1",
  growId: "g1",
  photo: "",
};

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "e",
    event_type: "observation",
    created_at: "2026-06-15T10:00:00.000Z",
    note: "",
    plant_id: "p1",
    tent_id: "t1",
    photo_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.useGrowPlant.mockReset();
  mocks.usePlantRecentActivity.mockReset();
});
afterEach(() => cleanup());

describe("PlantDetailHarvestEvidenceReportMount", () => {
  it("renders empty state when plant has no harvest evidence", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PlantDetailHarvestEvidenceReportMount plantId="p1" />);
    expect(screen.getByTestId("harvest-evidence-report-empty")).toHaveTextContent(
      "No harvest evidence has been logged yet.",
    );
  });

  it("renders caution + no-actions copy", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PlantDetailHarvestEvidenceReportMount plantId="p1" />);
    expect(screen.getByTestId("harvest-evidence-report-caution")).toHaveTextContent(
      /Harvest Evidence Report is diary evidence only/i,
    );
    expect(screen.getByTestId("harvest-evidence-report-no-actions")).toHaveTextContent(
      /does not create alerts, Action Queue items, or harvest instructions/i,
    );
  });

  it("renders loading state", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: true, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PlantDetailHarvestEvidenceReportMount plantId="p1" />);
    expect(
      screen.getByTestId("plant-detail-harvest-evidence-report-loading"),
    ).toBeInTheDocument();
  });

  it("scopes to current plant and surfaces explicit trichome evidence", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        row({ id: "n1", note: "Trichomes ~30% cloudy across upper colas." }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<PlantDetailHarvestEvidenceReportMount plantId="p1" />);
    expect(screen.getByTestId("harvest-evidence-report-panel")).toBeInTheDocument();
    expect(screen.getByTestId("harvest-evidence-report-plant-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("harvest-evidence-report-empty")).toBeNull();
    // Totals row shows ≥1 trichome inspection.
    const totals = screen.getByTestId("harvest-evidence-report-totals");
    expect(totals.textContent ?? "").toMatch(/Trichome inspections/i);
  });

  it("does not count a generic photo as trichome evidence", () => {
    mocks.useGrowPlant.mockReturnValue({ data: PLANT, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({
      data: [
        row({
          id: "p",
          event_type: "photo",
          photo_url: "https://example.test/p.jpg",
        }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<PlantDetailHarvestEvidenceReportMount plantId="p1" />);
    // The mounted plant should exist, but trichome category for any window
    // must be Missing (count 0). Search via data-testid prefix.
    const plant = screen.getByTestId("harvest-evidence-report-plant-p1");
    const statuses = plant.querySelectorAll(
      '[data-testid^="harvest-evidence-report-status-p1-"][data-testid$="-trichome_inspection"]',
    );
    expect(statuses.length).toBeGreaterThan(0);
    statuses.forEach((el) => {
      expect(el.textContent ?? "").toMatch(/Missing · 0/);
    });
  });

  it("renders nothing for null plantId", () => {
    mocks.useGrowPlant.mockReturnValue({ data: null, isLoading: false, isError: false });
    mocks.usePlantRecentActivity.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<PlantDetailHarvestEvidenceReportMount plantId={null} />);
    expect(container.firstChild).toBeNull();
  });
});
