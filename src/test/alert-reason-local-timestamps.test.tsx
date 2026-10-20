/**
 * Raw UTC timestamps (from #2206, QA pass 11): alert reasons copied into
 * action_queue.reason and Action Queue trace notes rendered
 * "Reading at 2026-10-15T15:54:26.221+00:00." on the Timeline and plant page.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  formatAlertReasonForDisplay,
  localizeReadingAtTimestamps,
} from "@/lib/alertReasonDisplayRules";
import PlantAssignedTentActionsPanel from "@/components/PlantAssignedTentActionsPanel";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";

const ISO = "2026-10-15T15:54:26.221+00:00";
const RAW = `Humidity is above the flower target range. Observed 70% (flower range 40%–50%). Reading at ${ISO}.`;
const fixed = () => "Oct 15, 2026, 10:54 AM";

vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({
    rows: [
      {
        id: "a1",
        growId: "g1",
        tentId: "t1",
        plantId: null,
        status: "pending_approval",
        source: "alert",
        actionType: "adjust_environment",
        targetMetric: "rh",
        suggestedChange: "Lower humidity",
        reason: `${RAW} [alert:alert-1]`,
        riskLevel: "low",
        createdAt: "2026-10-15T16:00:00.000Z",
        alertBackPointerId: "alert-1",
        aiDoctorSessionBackPointerId: null,
        hasTargetDevice: false,
      },
    ],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({
    data: [
      {
        id: "d1",
        plant_id: "p1",
        entry_type: "note",
        entry_at: "2026-10-15T16:05:00.000Z",
        // Short enough to stay inside the 140-character note preview.
        note: `Approved: Lower humidity. Observed 70%. Reading at ${ISO}.`,
        details: { kind: "action_queue_trace", trace_kind: "approved" },
      },
    ],
    isLoading: false,
    isError: false,
    isFetching: false,
    isPending: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
}));

describe("localizeReadingAtTimestamps", () => {
  it("rewrites only the Reading at timestamp", () => {
    expect(localizeReadingAtTimestamps(RAW, fixed)).toBe(
      "Humidity is above the flower target range. Observed 70% (flower range 40%–50%). Reading at Oct 15, 2026, 10:54 AM.",
    );
  });

  it("leaves grower-typed units and other text untouched", () => {
    const note = `Approved: Raise heat. Set heater to 25°C. Reading at ${ISO}.`;
    expect(localizeReadingAtTimestamps(note, fixed)).toBe(
      "Approved: Raise heat. Set heater to 25°C. Reading at Oct 15, 2026, 10:54 AM.",
    );
  });

  it("returns empty text for null or empty input and keeps unparseable text", () => {
    expect(localizeReadingAtTimestamps(null)).toBe("");
    expect(localizeReadingAtTimestamps("")).toBe("");
    expect(localizeReadingAtTimestamps("Reading at 2026-13-45T99:99Z.", fixed)).toBe(
      "Reading at 2026-13-45T99:99Z.",
    );
  });

  it("matches the alert reason formatter's timestamp output", () => {
    expect(localizeReadingAtTimestamps(RAW, fixed)).toBe(
      formatAlertReasonForDisplay(RAW, { temperatureUnit: "celsius", formatTimestamp: fixed }),
    );
  });
});

describe("plant page pending actions", () => {
  it("shows the copied alert reason with a local timestamp, not raw ISO", () => {
    render(
      <MemoryRouter>
        <PlantAssignedTentActionsPanel tentId="t1" tentName="Tent A" growId="g1" />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId("plant-assigned-tent-actions-panel");
    expect(panel.textContent).toContain("Reading at");
    expect(panel.textContent).not.toContain(ISO);
    expect(panel.textContent).not.toContain("[alert:");
  });
});

describe("plant page recent activity", () => {
  it("shows an Action Queue trace note with a local timestamp, not raw ISO", () => {
    render(
      <MemoryRouter>
        <PlantRecentActivityPanel plantId="p1" plantName="Plant A" />
      </MemoryRouter>,
    );
    expect(document.body.textContent).toContain("Approved: Lower humidity.");
    expect(document.body.textContent).toContain("Reading at");
    expect(document.body.textContent).not.toContain(ISO);
  });
});
