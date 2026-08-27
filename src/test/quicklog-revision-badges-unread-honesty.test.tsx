/**
 * Quiet honesty for Quick Log revision-badge reads: empty-success must not look
 * like an unread ledger. Consumers show a quiet unavailable note and hide
 * edited chrome when status is "unavailable".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE } from "@/hooks/useQuickLogRevisionBadges";

const badgeHookMock = vi.hoisted(() => ({
  badges: new Map<string, { correctionCount: number }>(),
  status: "ok" as "ok" | "unavailable",
  isLoading: false,
}));

vi.mock("@/hooks/useQuickLogRevisionBadges", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useQuickLogRevisionBadges")>(
    "@/hooks/useQuickLogRevisionBadges",
  );
  return {
    ...actual,
    useQuickLogRevisionBadges: () => ({
      badges: badgeHookMock.badges,
      status: badgeHookMock.status,
      isLoading: badgeHookMock.isLoading,
    }),
  };
});

vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: [
      {
        kind: "action",
        occurredAt: "2026-08-15T12:00:00.000Z",
        actionSourceLabel: "Manual",
        action: {
          id: "ge-water-1",
          kind: "water",
          source: "manual",
          occurredAt: "2026-08-15T12:00:00.000Z",
          plantId: "plant-1",
          tentId: "tent-1",
          noteText: "Watered.",
          volumeMl: 500,
        },
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Quick Log revision badge unread honesty", () => {
  beforeEach(() => {
    badgeHookMock.badges = new Map();
    badgeHookMock.status = "ok";
    badgeHookMock.isLoading = false;
  });

  it("history panel: empty-success shows no unavailable note", () => {
    badgeHookMock.status = "ok";
    render(
      <RecentQuickLogActivityPanel
        rawEntries={[
          {
            id: "diary-1",
            entry_type: "watering",
            entry_at: "2026-08-15T12:00:00.000Z",
            note: "Watered.",
            details: { event_type: "watering" },
          },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-history-section-recent")).toHaveAttribute(
      "data-revision-badges-status",
      "ok",
    );
  });

  it("history panel: unread ledger shows a quiet unavailable note, not edited chrome", () => {
    badgeHookMock.status = "unavailable";
    badgeHookMock.badges = new Map([["diary-1", { correctionCount: 2 }]]);

    render(
      <RecentQuickLogActivityPanel
        rawEntries={[
          {
            id: "diary-1",
            entry_type: "watering",
            entry_at: "2026-08-15T12:00:00.000Z",
            note: "Watered.",
            details: { event_type: "watering" },
          },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    const note = screen.getByTestId("quicklog-revision-badges-unavailable");
    expect(note).toHaveTextContent(QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE);
    expect(note.textContent?.toLowerCase()).not.toMatch(/appl(y|ied)|migration|deploy/);
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-history-section-recent")).toHaveAttribute(
      "data-revision-badges-status",
      "unavailable",
    );
  });

  it("grouped timeline: unread ledger shows a quiet unavailable note and hides edited chrome", async () => {
    badgeHookMock.status = "unavailable";
    badgeHookMock.badges = new Map([["ge-water-1", { correctionCount: 3 }]]);

    render(<QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    expect(screen.getByTestId("quicklog-revision-badges-unavailable")).toHaveTextContent(
      QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE,
    );
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-grouped-timeline-section")).toHaveAttribute(
      "data-revision-badges-status",
      "unavailable",
    );
  });

  it("grouped timeline: empty-success does not show the unavailable note", async () => {
    badgeHookMock.status = "ok";
    badgeHookMock.badges = new Map();

    render(<QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-grouped-timeline-section")).toHaveAttribute(
      "data-revision-badges-status",
      "ok",
    );
  });
});
