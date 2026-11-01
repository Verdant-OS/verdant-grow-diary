/** #2293: direction-neutral range help and strict calendar-date consumers. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import {
  filterTimelineEvidenceRows,
  isTimelineDateFilterValue,
  isTimelineEvidenceFilterActive,
  timelineDateParamsAfterSync,
} from "@/lib/timelineEvidenceFilterRules";

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));
afterEach(cleanup);

describe("Recent Quick Logs range-help direction", () => {
  it("does not promise earlier entries when an end-only range precedes all logs", () => {
    render(<RecentQuickLogActivityPanel rawEntries={[]} dateFiltered />);
    const lane = screen.getByTestId("quicklog-history-section-recent");
    expect(lane).toHaveTextContent("No Quick Logs in this date range");
    expect(lane).toHaveTextContent("Clear or widen the date filter");
    expect(lane).toHaveTextContent("outside this range");
    expect(lane.textContent).not.toMatch(/\b(earlier|later)\b/i);
  });

  it("keeps the original guidance when no date range is applied", () => {
    render(<RecentQuickLogActivityPanel rawEntries={[]} />);
    const lane = screen.getByTestId("quicklog-history-section-recent");
    expect(lane).toHaveTextContent("No Quick Log entries yet");
    expect(lane).toHaveTextContent(
      "Open Quick Log to capture a note, watering, photo, or manual reading.",
    );
    expect(lane).not.toHaveTextContent("date range");
  });

  it("renders actual in-range logs rather than empty guidance", () => {
    render(
      <MemoryRouter>
        <RecentQuickLogActivityPanel
          dateFiltered
          rawEntries={[
            {
              id: "in-range-log",
              entry_at: "2026-07-15T12:00:00.000Z",
              note: "Observed new leaf growth",
              details: { event_type: "note" },
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Observed new leaf growth")).toBeInTheDocument();
    expect(screen.queryByText("No Quick Logs in this date range")).not.toBeInTheDocument();
  });
});

describe("calendar-valid Timeline filter values", () => {
  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00"])(
    "treats impossible %s as no constraint in every date-filter consumer",
    (bad) => {
      expect(isTimelineDateFilterValue(bad)).toBe(false);
      expect(isTimelineEvidenceFilterActive({ startDate: bad })).toBe(false);
      const row = {
        id: "earlier",
        entry_at: "2026-01-01T12:00:00.000Z",
        note: "Kept",
        stage: null,
        plant_id: null,
        tent_id: null,
      };
      expect(filterTimelineEvidenceRows([row], { startDate: bad })).toEqual([row]);
      const params = timelineDateParamsAfterSync(new URLSearchParams("growId=keep"), bad, bad);
      expect(params.get("start")).toBeNull();
      expect(params.get("end")).toBeNull();
      expect(params.get("growId")).toBe("keep");
    },
  );

  it.each(["2026-07-15", "2028-02-29", "2000-02-29", "2026-12-31"])(
    "keeps real calendar date %s usable",
    (value) => {
      expect(isTimelineDateFilterValue(value)).toBe(true);
      expect(isTimelineEvidenceFilterActive({ endDate: value })).toBe(true);
      expect(timelineDateParamsAfterSync(new URLSearchParams(), "", value).get("end")).toBe(value);
    },
  );
});
