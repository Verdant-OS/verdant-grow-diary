/**
 * Quiet honesty for Quick Log revision-badge reads: pending / empty-success /
 * unread must not share chrome. Consumers use status (not isLoading) as the
 * confidence signal.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import FeedingHistoryPanel from "@/components/FeedingHistoryPanel";
import PhotoHistoryPanel from "@/components/PhotoHistoryPanel";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import { QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE } from "@/hooks/useQuickLogRevisionBadges";

const badgeHookMock = vi.hoisted(() => ({
  badges: new Map<string, { correctionCount: number }>(),
  status: "ok" as "pending" | "ok" | "unavailable",
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

const HISTORY_ENTRY = {
  id: "diary-1",
  entry_type: "watering",
  entry_at: "2026-08-15T12:00:00.000Z",
  note: "Watered.",
  details: { event_type: "watering" },
} as const;

describe("Quick Log revision badge unread honesty", () => {
  beforeEach(() => {
    badgeHookMock.badges = new Map();
    badgeHookMock.status = "ok";
    badgeHookMock.isLoading = false;
  });

  it("history panel: empty-success shows no unavailable note", () => {
    badgeHookMock.status = "ok";
    render(<RecentQuickLogActivityPanel rawEntries={[HISTORY_ENTRY]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-history-section-recent")).toHaveAttribute(
      "data-revision-badges-status",
      "ok",
    );
  });

  it("history panel: pending hides edited chrome and does not flash the unavailable note", () => {
    badgeHookMock.status = "pending";
    badgeHookMock.isLoading = true;
    badgeHookMock.badges = new Map([["diary-1", { correctionCount: 2 }]]);

    render(<RecentQuickLogActivityPanel rawEntries={[HISTORY_ENTRY]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-history-section-recent")).toHaveAttribute(
      "data-revision-badges-status",
      "pending",
    );
  });

  it("history panel: unread ledger shows a quiet unavailable note, not edited chrome", () => {
    badgeHookMock.status = "unavailable";
    badgeHookMock.badges = new Map([["diary-1", { correctionCount: 2 }]]);

    render(<RecentQuickLogActivityPanel rawEntries={[HISTORY_ENTRY]} />, {
      wrapper: makeWrapper(),
    });

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

  it("grouped timeline: pending hides chrome and does not show the unavailable note", async () => {
    badgeHookMock.status = "pending";
    badgeHookMock.isLoading = true;
    badgeHookMock.badges = new Map([["ge-water-1", { correctionCount: 3 }]]);

    render(<QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));

    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-grouped-timeline-section")).toHaveAttribute(
      "data-revision-badges-status",
      "pending",
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


const FEEDING_ENTRY = {
  id: "diary-feed-1",
  entry_type: "feeding",
  entry_at: "2026-08-15T12:00:00.000Z",
  note: "Fed.",
  details: { event_type: "feeding" },
} as const;

const PHOTO_ENTRY = {
  id: "diary-photo-1",
  entry_type: "photo",
  entry_at: "2026-08-15T12:00:00.000Z",
  note: "Canopy shot.",
  photo_url: "https://example.com/canopy.jpg",
  details: { event_type: "photo", photo_url: "https://example.com/canopy.jpg" },
} as const;

function laneCases(
  name: string,
  Panel: (props: { rawEntries: readonly unknown[] }) => JSX.Element | null,
  entry: Record<string, unknown>,
  testId: string,
  rootId: string,
) {
  it(`${name}: empty-success shows no unavailable note`, () => {
    badgeHookMock.status = "ok";
    render(<Panel rawEntries={[entry] as never} />, { wrapper: makeWrapper() });
    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId(testId)).toHaveAttribute("data-revision-badges-status", "ok");
  });

  it(`${name}: pending hides edited chrome and does not flash the unavailable note`, () => {
    badgeHookMock.status = "pending";
    badgeHookMock.isLoading = true;
    badgeHookMock.badges = new Map([[rootId, { correctionCount: 2 }]]);
    render(<Panel rawEntries={[entry] as never} />, { wrapper: makeWrapper() });
    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId(testId)).toHaveAttribute("data-revision-badges-status", "pending");
  });

  it(`${name}: unread ledger shows a quiet unavailable note, not edited chrome`, () => {
    badgeHookMock.status = "unavailable";
    badgeHookMock.badges = new Map([[rootId, { correctionCount: 2 }]]);
    render(<Panel rawEntries={[entry] as never} />, { wrapper: makeWrapper() });
    const note = screen.getByTestId("quicklog-revision-badges-unavailable");
    expect(note).toHaveTextContent(QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE);
    expect(screen.queryByTestId("quicklog-entry-edited-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId(testId)).toHaveAttribute("data-revision-badges-status", "unavailable");
  });

  it(`${name}: ok with a matching badge shows the edited chrome`, () => {
    badgeHookMock.status = "ok";
    badgeHookMock.badges = new Map([[rootId, { correctionCount: 2 }]]);
    render(<Panel rawEntries={[entry] as never} />, { wrapper: makeWrapper() });
    const badge = screen.getByTestId("quicklog-entry-edited-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent?.toLowerCase()).toMatch(/correct|edit/);
    expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId(testId)).toHaveAttribute("data-revision-badges-status", "ok");
  });
}

laneCases("feeding panel", FeedingHistoryPanel, FEEDING_ENTRY, "feeding-history-panel", "diary-feed-1");
laneCases("photo panel", PhotoHistoryPanel, PHOTO_ENTRY, "photo-history-panel", "diary-photo-1");
laneCases("watering panel", WateringHistoryPanel, HISTORY_ENTRY, "watering-history-panel", "diary-1");

it("history panel: ok with a matching badge shows the edited chrome", () => {
  badgeHookMock.status = "ok";
  badgeHookMock.badges = new Map([["diary-1", { correctionCount: 2 }]]);
  render(<RecentQuickLogActivityPanel rawEntries={[HISTORY_ENTRY]} />, { wrapper: makeWrapper() });
  expect(screen.getByTestId("quicklog-entry-edited-badge")).toBeInTheDocument();
  expect(screen.queryByTestId("quicklog-revision-badges-unavailable")).not.toBeInTheDocument();
});

});
