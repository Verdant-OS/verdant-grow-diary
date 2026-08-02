/**
 * Visual-regression guard (component-level; the repo has no Storybook):
 * PlantRecentActivityPanel and PlantDetailRecentActivityRecap must render a
 * Quick Log WATERING row as "Watering" with its structured payload — and must
 * NEVER revert to the generic "Note" badge that shipped as a live-production
 * defect. Also locks the neutral `invalid_event_type` rendering so an
 * unknown-kind row never masquerades as a note in either surface.
 *
 * Read-only and presentation-only. No writes, no RPC, no service_role,
 * no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { render, screen, within } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";
import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";
import {
  INVALID_EVENT_TYPE_NEUTRAL_LABEL,
} from "@/lib/quickLogEventIdentityRules";

const PLANT_ID = "11111111-1111-4111-8111-111111111111";

/** Raw diary row exactly as the Quick Log RPC mirror persists it. */
const WATERING_ROW = {
  id: "entry-watering-1",
  plant_id: PLANT_ID,
  tent_id: null,
  event_type: "quick_log",
  note: "",
  entry_at: "2026-07-27T10:00:00.000Z",
  details: { event_type: "watering", watering_amount_ml: 500 },
};

const INVALID_ROW = {
  id: "entry-invalid-1",
  plant_id: PLANT_ID,
  tent_id: null,
  event_type: "quick_log",
  note: "",
  entry_at: "2026-07-27T09:00:00.000Z",
  details: { event_type: "legacy_mystery_row" },
};

beforeEach(() => {
  useRecentMock.mockReset();
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <PlantRecentActivityPanel plantId={PLANT_ID} plantName="Guard Plant" />
    </MemoryRouter>,
  );
}

function renderRecap() {
  // No onAddQuickCheck: keeps the recovery prompt from replacing the list.
  return render(<PlantDetailRecentActivityRecap plantId={PLANT_ID} />);
}

describe("PlantRecentActivityPanel — watering never reverts to Note", () => {
  it("renders the Quick Log watering row as 'Watering · 500 ml'", () => {
    useRecentMock.mockReturnValue({ data: [WATERING_ROW], isLoading: false });
    renderPanel();
    const row = screen.getByTestId("plant-recent-activity-row");
    expect(row.getAttribute("data-effective-event-type")).toBe("watering");
    const badge = within(row).getByTestId("plant-recent-activity-event-type");
    expect(badge.textContent).toContain("Watering");
    expect(badge.textContent).toContain("500 ml");
    // The regression this file exists for: the badge must not be "Note".
    expect(badge.textContent).not.toMatch(/\bnote\b/i);
    // Payload honesty: nothing beyond the stored volume is rendered.
    expect(badge.textContent).not.toMatch(/pH|EC/i);
  });

  it("renders an invalid_event_type row with the neutral label — never 'Note'", () => {
    useRecentMock.mockReturnValue({ data: [INVALID_ROW], isLoading: false });
    renderPanel();
    const row = screen.getByTestId("plant-recent-activity-row");
    expect(row.getAttribute("data-effective-event-type")).toBe("invalid_event_type");
    const badge = within(row).getByTestId("plant-recent-activity-event-type");
    expect(badge.textContent).toContain(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    expect(badge.textContent).not.toMatch(/\bnote\b/i);
    // Never echo the raw invalid type string to the grower.
    expect(badge.textContent).not.toContain("legacy_mystery_row");
  });
});

describe("PlantDetailRecentActivityRecap — watering never reverts to Note", () => {
  it("renders the Quick Log watering row as a Watering recap item with its payload", () => {
    useRecentMock.mockReturnValue({ data: [WATERING_ROW], isLoading: false });
    renderRecap();
    const item = screen.getByTestId("plant-detail-recent-activity-recap-item");
    expect(item.getAttribute("data-category")).toBe("watering");
    expect(item.textContent).toContain("Watering");
    expect(item.textContent).toContain("500 ml");
    expect(item.textContent).not.toMatch(/\bnote\b/i);
  });

  it("renders an invalid_event_type row with the neutral label — never 'Note'", () => {
    useRecentMock.mockReturnValue({ data: [INVALID_ROW], isLoading: false });
    renderRecap();
    const item = screen.getByTestId("plant-detail-recent-activity-recap-item");
    expect(item.textContent).toContain(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    expect(item.textContent).not.toMatch(/\bnote\b/i);
    expect(item.textContent).not.toContain("legacy_mystery_row");
  });
});
