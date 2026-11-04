/**
 * Grower bug report 2026-11-03, item 17: each Recent Quick Logs row names the
 * plant and tent it belongs to when the Timeline passes its name directory.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";

afterEach(() => cleanup());

const entries = [
  {
    id: "note-1",
    entry_type: "note",
    created_at: "2026-11-02T20:36:00Z",
    note: "Correction note",
    plant_id: "p1",
    tent_id: "t1",
  },
  {
    id: "note-2",
    entry_type: "note",
    created_at: "2026-11-02T20:30:00Z",
    note: "Whole tent check",
    plant_id: null,
    tent_id: "t1",
  },
];

const targetNames = {
  plantNamesById: new Map([["p1", "Dolce di Pledge #1"]]),
  tentNamesById: new Map([["t1", "Vegetation Bravo"]]),
  plantTentIdsById: new Map([["p1", "t1"]]),
};

describe("Recent Quick Logs row target (item 17)", () => {
  it("names the plant and tent on each row", () => {
    render(<RecentQuickLogActivityPanel rawEntries={entries} targetNames={targetNames} />);
    const rows = within(screen.getByTestId("quicklog-history-section-recent")).getAllByTestId(
      "quicklog-history-row-target",
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      "Plant: Dolce di Pledge #1 · Tent: Vegetation Bravo",
      "Tent: Vegetation Bravo",
    ]);
  });

  it("shows no target label without a name directory", () => {
    render(<RecentQuickLogActivityPanel rawEntries={entries} />);
    expect(screen.queryByTestId("quicklog-history-row-target")).toBeNull();
  });
});
