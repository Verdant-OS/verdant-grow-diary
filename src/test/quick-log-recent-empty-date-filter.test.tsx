/**
 * QA 2026-10-20 bug 6: with a Timeline date filter that excludes every Quick
 * Log, the Recent Quick Logs lane said "No Quick Log entries yet". It now says
 * the date range is empty and points at the filter. Without a filter the copy
 * is unchanged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import {
  QUICK_LOG_RECENT_EMPTY_COPY,
  quickLogRecentEmptyCopy,
} from "@/lib/quickLogRecentEmptyStateRules";

afterEach(() => cleanup());

describe("quickLogRecentEmptyCopy", () => {
  it("names the date range when a filter is applied", () => {
    expect(quickLogRecentEmptyCopy(true)).toEqual(QUICK_LOG_RECENT_EMPTY_COPY.dateFiltered);
    expect(quickLogRecentEmptyCopy(true).title).toBe("No Quick Logs in this date range");
  });

  it("keeps today's copy without a filter", () => {
    expect(quickLogRecentEmptyCopy(false)).toEqual(QUICK_LOG_RECENT_EMPTY_COPY.unfiltered);
    expect(quickLogRecentEmptyCopy(false).title).toBe("No Quick Log entries yet");
  });
});

describe("Recent Quick Logs lane empty state (QA 2026-10-20 bug 6)", () => {
  it("says the date range is empty, not that the grow has no Quick Logs", () => {
    render(<RecentQuickLogActivityPanel rawEntries={[]} dateFiltered />);
    const lane = screen.getByTestId("quicklog-history-section-recent");
    expect(lane.textContent).toContain("No Quick Logs in this date range");
    expect(lane.textContent).toContain("Clear or widen the date filter");
    expect(lane.textContent).not.toContain("No Quick Log entries yet");
  });

  it("keeps the original empty copy when no date filter is applied", () => {
    render(<RecentQuickLogActivityPanel rawEntries={[]} />);
    const lane = screen.getByTestId("quicklog-history-section-recent");
    expect(lane.textContent).toContain("No Quick Log entries yet");
    expect(lane.textContent).not.toContain("date range");
  });
});
