import { render, screen, within } from "@testing-library/react";
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

const TEXT_NOTE_ENTRY = {
  id: "entry-text-note",
  note: "Text-only canopy check: leaves praying nicely.",
  photo_url: null,
  stage: "vegetative",
  entry_at: "2026-07-25T14:00:00.000Z",
  plant_id: "plant-a",
  tent_id: null,
  details: {
    event_type: "note",
    source: "manual",
  },
};

const PHOTO_NOTE_ENTRY = {
  id: "entry-photo-note",
  note: "Photo canopy check: top cola close-up.",
  photo_url: "https://example.com/canopy-photo.jpg",
  stage: "vegetative",
  entry_at: "2026-07-25T13:00:00.000Z",
  plant_id: "plant-a",
  tent_id: null,
  details: {
    event_type: "photo",
    source: "manual",
  },
};

function renderTimeline() {
  return render(
    createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)),
  );
}

beforeEach(() => {
  harness.executeQuery.mockReset();
  harness.refreshGrows.mockReset();
  harness.setActiveGrowId.mockReset();
  harness.reloadActionResponseMemory.mockReset();
  harness.createSignedUrls.mockReset();
  harness.createSignedUrls.mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
      error: null,
    }),
  );
  harness.executeQuery.mockImplementation((table: string) => {
    if (table === "diary_entries") {
      return { data: [TEXT_NOTE_ENTRY, PHOTO_NOTE_ENTRY], error: null, count: 2 };
    }
    return { data: [], error: null, count: 0 };
  });
});

describe("text-note timeline cards", () => {
  it("omits the empty photo well on a text-only note card while still rendering the photo on a photo entry", async () => {
    renderTimeline();

    const textBody = await screen.findByText(TEXT_NOTE_ENTRY.note);
    const photoBody = await screen.findByText(PHOTO_NOTE_ENTRY.note);

    const textCard = textBody.closest('[data-testid="timeline-entry"]');
    const photoCard = photoBody.closest('[data-testid="timeline-entry"]');

    expect(textCard).not.toBeNull();
    expect(photoCard).not.toBeNull();

    expect(within(textCard as HTMLElement).queryByTestId("timeline-photo-open")).toBeNull();
    expect((textCard as HTMLElement).querySelector("img")).toBeNull();
    expect((textCard as HTMLElement).children).toHaveLength(1);
    expect((textCard as HTMLElement).firstElementChild?.contains(textBody)).toBe(true);
    expect((textCard as HTMLElement).querySelector(".aspect-\\[4\\/3\\]")).toBeNull();

    const photoButton = within(photoCard as HTMLElement).getByTestId("timeline-photo-open");
    const photoImg = within(photoButton).getByRole("img");
    expect(photoImg).toHaveAttribute("src", PHOTO_NOTE_ENTRY.photo_url);
  });

  it("renders the note body in foreground text on both text-only and photo entries", async () => {
    renderTimeline();

    const textBody = await screen.findByText(TEXT_NOTE_ENTRY.note);
    const photoBody = await screen.findByText(PHOTO_NOTE_ENTRY.note);

    expect(textBody).toHaveAttribute("data-testid", "timeline-entry-body");
    expect(textBody).toHaveClass("text-foreground");
    expect(photoBody).toHaveAttribute("data-testid", "timeline-entry-body");
    expect(photoBody).toHaveClass("text-foreground");
  });
});
