/**
 * Verifies that photo-only timeline-adjacent presenters surface the
 * "Visual record · no AI analysis" label, and suppress it when the entry
 * is linked to a saved AI Doctor result.
 *
 * Rendering tests assert structural copy — no AI calls, no Supabase
 * writes, and no model invocations are triggered by rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PHOTO_NON_DIAGNOSTIC_LABEL,
  PHOTO_NON_DIAGNOSTIC_TESTID,
} from "@/lib/photoEventNonDiagnosticLabelRules";

import PhotoHistoryPanel from "@/components/PhotoHistoryPanel";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";

// Stub plant-recent-activity hook so the presenter renders synchronously
// without touching Supabase.
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (plantId: string | null | undefined) => ({
    data: plantId
      ? [
          {
            id: "diary-photo-only",
            plant_id: plantId,
            tent_id: null,
            grow_id: null,
            entry_type: "photo",
            note: "",
            photo_url: "https://example.com/photo-1.jpg",
            created_at: "2026-06-01T10:00:00.000Z",
            details: {},
          },
          {
            id: "diary-photo-linked",
            plant_id: plantId,
            tent_id: null,
            grow_id: null,
            entry_type: "photo",
            note: "",
            photo_url: "https://example.com/photo-2.jpg",
            created_at: "2026-06-01T11:00:00.000Z",
            details: { ai_doctor_session_id: "session-xyz" },
          },
        ]
      : [],
    isLoading: false,
  }),
}));

describe("Photo non-diagnostic label — presenters", () => {
  it("PhotoHistoryPanel renders the label for photo-only entries", () => {
    const raw = [
      {
        id: "p-1",
        entry_type: "photo",
        photo_url: "https://example.com/a.jpg",
        created_at: "2026-06-01T10:00:00.000Z",
        details: {},
      },
    ];
    const { getAllByTestId, getByText } = render(
      <PhotoHistoryPanel rawEntries={raw} />,
    );
    expect(getAllByTestId(PHOTO_NON_DIAGNOSTIC_TESTID).length).toBe(1);
    expect(getByText(PHOTO_NON_DIAGNOSTIC_LABEL)).toBeTruthy();
  });

  it("PhotoHistoryPanel suppresses the label when entry links to an AI Doctor result", () => {
    const raw = [
      {
        id: "p-2",
        entry_type: "photo",
        photo_url: "https://example.com/b.jpg",
        created_at: "2026-06-01T10:00:00.000Z",
        details: { ai_doctor_session_id: "sess-1" },
      },
    ];
    const { queryByTestId } = render(<PhotoHistoryPanel rawEntries={raw} />);
    expect(queryByTestId(PHOTO_NON_DIAGNOSTIC_TESTID)).toBeNull();
  });

  it("PlantRecentActivityPanel renders the label only for unlinked photo entry", () => {
    const { getAllByTestId } = render(
      <MemoryRouter>
        <PlantRecentActivityPanel plantId="plant-1" plantName="Test" />
      </MemoryRouter>,
    );
    // Exactly one of the two stub photo rows is unlinked.
    const labels = getAllByTestId(PHOTO_NON_DIAGNOSTIC_TESTID);
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toContain(PHOTO_NON_DIAGNOSTIC_LABEL);
  });

  it("label copy contains no banned diagnostic wording", () => {
    const banned = ["confirmed", "diagnosed", "analyzed", "certain", "guaranteed"];
    const lower = PHOTO_NON_DIAGNOSTIC_LABEL.toLowerCase();
    for (const word of banned) expect(lower.includes(word)).toBe(false);
  });
});
