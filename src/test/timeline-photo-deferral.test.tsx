/**
 * Grower bug item 10 (#2785): Timeline loads only the newest photos on their
 * own. Older photo entries show a "Show photo" button that loads that one
 * photo when tapped. Measured cause: full-size originals, about 1.5 GB of
 * renderer memory for 100 photo entries.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
}));

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      is() {
        return query;
      },
      not() {
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return query;
      },
      lt() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return Promise.resolve(harness.executeQuery(table)).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: {
        from: () => ({
          createSignedUrls: (paths: string[]) => harness.createSignedUrls(paths),
        }),
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, session: null, loading: false }),
}));

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: GROW_A,
    activeGrowId: GROW_A.id,
    grows: [GROW_A],
    loading: false,
    error: null,
    refresh: harness.refreshGrows,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));

vi.mock("@/hooks/useActionResponseMemory", () => ({
  useActionResponseMemory: () => ({
    state: { status: "ok", memories: [] },
    reload: harness.reloadActionResponseMemory,
  }),
}));

vi.mock("@/lib/useTimelineHighlightAutoScroll", () => ({
  useTimelineHighlightAutoScroll: () => undefined,
}));

vi.mock("@/hooks/useTimelineHashAnchorHandoff", () => ({
  useTimelineHashAnchorHandoff: () => undefined,
}));

vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/FeedingHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/PhotoHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/QuickLogHistoryPanels", () => ({
  RecentQuickLogActivityPanel: () => null,
  PestDiseaseHistoryPanel: () => null,
  TrainingHistoryPanel: () => null,
  MeasurementHistoryPanel: () => null,
}));
vi.mock("@/components/DiaryCalendarSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineCsvContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PhenoHuntTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelinePhotoLightbox", () => ({ default: () => null }));
vi.mock("@/components/TimelineEvidenceDetailDrawer", () => ({ default: () => null }));
vi.mock("@/components/TimelineSensorSourceBadge", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";
import {
  TIMELINE_DEFERRED_PHOTO_COPY,
  TIMELINE_DEFERRED_PHOTO_TESTID,
  TIMELINE_EAGER_PHOTO_LIMIT,
} from "@/lib/timelinePhotoDeferralRules";

const PHOTO_COUNT = TIMELINE_EAGER_PHOTO_LIMIT + 5;

// Newest first, as the core read returns them.
const PHOTO_ENTRIES = Array.from({ length: PHOTO_COUNT }, (_, i) => ({
  id: `entry-photo-${i}`,
  note: `Photo entry ${i}`,
  photo_url: `https://example.com/photo-${i}.jpg`,
  stage: "vegetative",
  entry_at: new Date(Date.UTC(2026, 6, 25, 12) - i * 3_600_000).toISOString(),
  plant_id: "plant-a",
  tent_id: null,
  details: { event_type: "photo", source: "manual" },
}));

const TEXT_ENTRY = {
  id: "entry-text",
  note: "Text entry between photos",
  photo_url: null,
  stage: "vegetative",
  entry_at: "2026-07-25T12:30:00.000Z",
  plant_id: "plant-a",
  tent_id: null,
  details: { event_type: "note", source: "manual" },
};

function renderTimeline() {
  return render(
    createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)),
  );
}

function card(note: string): HTMLElement {
  const el = screen.getByText(note).closest('[data-testid="timeline-entry"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  harness.executeQuery.mockReset();
  harness.createSignedUrls.mockReset();
  harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
  harness.executeQuery.mockImplementation((table: string) => {
    if (table === "diary_entries") {
      const rows = [TEXT_ENTRY, ...PHOTO_ENTRIES];
      return { data: rows, error: null, count: rows.length };
    }
    return { data: [], error: null, count: 0 };
  });
});

describe("Timeline photo deferral (item 10)", () => {
  it("loads only the newest photos and offers Show photo on older photo entries", async () => {
    renderTimeline();
    await screen.findByText(PHOTO_ENTRIES[PHOTO_COUNT - 1].note);

    expect(screen.getAllByTestId("timeline-photo-open")).toHaveLength(TIMELINE_EAGER_PHOTO_LIMIT);
    expect(screen.getAllByTestId(TIMELINE_DEFERRED_PHOTO_TESTID)).toHaveLength(
      PHOTO_COUNT - TIMELINE_EAGER_PHOTO_LIMIT,
    );

    const newest = card(PHOTO_ENTRIES[0].note);
    expect(within(newest).getByRole("img")).toHaveAttribute("src", PHOTO_ENTRIES[0].photo_url);

    const oldest = card(PHOTO_ENTRIES[PHOTO_COUNT - 1].note);
    expect(oldest.querySelector("img")).toBeNull();
    expect(within(oldest).getByTestId(TIMELINE_DEFERRED_PHOTO_TESTID)).toHaveTextContent(
      TIMELINE_DEFERRED_PHOTO_COPY.button,
    );
  });

  it("gives each Show photo button its own accessible name from the entry time", async () => {
    renderTimeline();
    await screen.findByText(PHOTO_ENTRIES[PHOTO_COUNT - 1].note);

    const names = screen
      .getAllByTestId(TIMELINE_DEFERRED_PHOTO_TESTID)
      .map((b) => b.getAttribute("aria-label") ?? "");
    expect(names.every((n) => n.startsWith(`${TIMELINE_DEFERRED_PHOTO_COPY.button} from `))).toBe(
      true,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("a text entry neither takes a photo slot nor shows a Show photo button", async () => {
    renderTimeline();
    const text = card((await screen.findByText(TEXT_ENTRY.note)).textContent ?? "");
    expect(within(text).queryByTestId(TIMELINE_DEFERRED_PHOTO_TESTID)).toBeNull();
    // The 20th photo entry is still eager even though a text entry renders first.
    const lastEager = card(PHOTO_ENTRIES[TIMELINE_EAGER_PHOTO_LIMIT - 1].note);
    expect(within(lastEager).getByTestId("timeline-photo-open")).toBeTruthy();
  });

  it("tapping Show photo loads that one photo and leaves the others deferred", async () => {
    renderTimeline();
    await screen.findByText(PHOTO_ENTRIES[PHOTO_COUNT - 1].note);
    const target = PHOTO_ENTRIES[PHOTO_COUNT - 1];
    fireEvent.click(within(card(target.note)).getByTestId(TIMELINE_DEFERRED_PHOTO_TESTID));

    expect(within(card(target.note)).getByRole("img")).toHaveAttribute("src", target.photo_url);
    expect(screen.getAllByTestId("timeline-photo-open")).toHaveLength(
      TIMELINE_EAGER_PHOTO_LIMIT + 1,
    );
    expect(screen.getAllByTestId(TIMELINE_DEFERRED_PHOTO_TESTID)).toHaveLength(
      PHOTO_COUNT - TIMELINE_EAGER_PHOTO_LIMIT - 1,
    );
  });
});
