/**
 * Both Timeline stage surfaces must render the same presentation label.
 * The group header and the card chip are separate call sites.
 */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  growsState: {
    activeGrow: null as Record<string, unknown> | null,
    activeGrowId: null as string | null,
    grows: [] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec = { table, filters: [] as Array<{ column: string; value: unknown }> };
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        spec.filters.push({ column, value });
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
      in() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(onfulfilled?: (value: unknown) => unknown) {
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, session: null, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    ...harness.growsState,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));

vi.mock("@/hooks/useActionResponseMemory", () => ({
  useActionResponseMemory: () => ({ state: { status: "ok", memories: [] }, reload: vi.fn() }),
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
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

const GROW = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

describe("timeline stage labels on the page", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.growsState.activeGrow = GROW;
    harness.growsState.activeGrowId = GROW.id;
    harness.growsState.grows = [GROW];
    harness.growsState.loading = false;
    harness.growsState.error = null;
  });

  it("renders Stage not recorded on the group header and on the card", async () => {
    harness.executeQuery.mockImplementation((spec: { table: string }) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-unstaged",
              note: "Leaf check with no stage",
              photo_url: null,
              stage: null,
              details: { event_type: "note", source: "manual" },
              entry_at: "2026-07-20T12:00:00.000Z",
              plant_id: null,
              tent_id: null,
            },
          ],
          error: null,
          count: 1,
        };
      }
      return { data: [], error: null };
    });

    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    const card = (await screen.findByText("Leaf check with no stage")).closest(
      '[data-testid="timeline-entry"]',
    );
    expect(card).not.toBeNull();
    const section = card?.closest("section");
    expect(section).not.toBeNull();
    const labels = within(section as HTMLElement).getAllByText("Stage not recorded");
    expect(labels).toHaveLength(2);
    expect(within(card as HTMLElement).getByText("Stage not recorded")).toBe(labels[1]);
    expect(within(section as HTMLElement).queryByText("unknown")).toBeNull();
    expect(within(card as HTMLElement).queryByText("—")).toBeNull();
  });
});
