import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

const entriesRef: { current: QuickLogTimelineEntry[] } = { current: [] };

vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: entriesRef.current,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
  QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT: 200,
}));

vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuickLogGroupedTimelineSection
          scope="plant"
          plantId="plant-1"
          growId="grow-1"
          tentId="tent-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const phenoEntry: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-07-14T12:00:00.000Z",
  action: {
    id: "event-1",
    kind: "note",
    source: "manual",
    plantId: "plant-1",
    tentId: "tent-1",
    occurredAt: "2026-07-14T12:00:00.000Z",
    noteText: "Strong lateral branching.",
    phenoEvidenceReceipt: {
      diaryEntryId: "diary-1",
      entryAt: "2026-07-14T12:00:00.000Z",
      huntId: "hunt-1",
      plantId: "plant-1",
      evidenceGoal: "structure",
      stage: "flower",
      hasPhoto: false,
      sensorContext: null,
    },
  },
  actionSourceLabel: "Manual",
};

describe("QuickLog timeline Pheno evidence wiring", () => {
  afterEach(cleanup);

  it("renders one specialized receipt card for the enriched action", () => {
    entriesRef.current = [phenoEntry];
    renderSection();
    const list = screen.getByTestId("quick-log-grouped-timeline-list");
    expect(within(list).getAllByTestId("pheno-evidence-timeline-card")).toHaveLength(1);
    expect(within(list).getByText("Strong lateral branching.")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-grouped-card")).toHaveAttribute(
      "data-entry-kind",
      "pheno-evidence-receipt",
    );
  });

  it("keeps an ordinary note on the existing generic card", () => {
    entriesRef.current = [
      {
        ...phenoEntry,
        action: { ...phenoEntry.action, id: "event-2", phenoEvidenceReceipt: null },
      },
    ];
    renderSection();
    expect(screen.queryByTestId("pheno-evidence-timeline-card")).toBeNull();
    expect(screen.getByTestId("quick-log-grouped-action-note")).toHaveTextContent(
      "Strong lateral branching.",
    );
  });
});
