/**
 * Follow-up to #2347: with the Timeline filtered to one plant, "Next missing
 * action" must read that plant's rhythm only. Before this fix it read the
 * unscoped grow page, so another plant's overdue feeding could be surfaced
 * while the grower was looking at a plant with nothing missing.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({ calendarMounts: 0, navTarget: "/timeline" }));

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  growsState: {
    activeGrow: null as Record<string, unknown> | null,
    activeGrowId: null as string | null,
    grows: [] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
  scopedGrowState: {
    urlGrowId: null as string | null,
    scopedGrow: null as Record<string, unknown> | null,
    scopedGrowName: null as string | null,
    isValidScopedGrow: false,
    backHref: undefined as string | undefined,
  },
}));

interface QueryFilter {
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  columns: string | null;
  count: string | null;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, columns: null, count: null, filters: [] };
    const query = {
      select(columns: string, options?: { count?: string }) {
        spec.columns = columns;
        spec.count = options?.count ?? null;
        return query;
      },
      eq(column: string, value: unknown) {
        spec.filters.push({ op: "eq", column, value });
        return query;
      },
      is(column: string, value: unknown) {
        spec.filters.push({ op: "is", column, value });
        return query;
      },
      not(column: string, operator: string, value: unknown) {
        spec.filters.push({ op: "not", column, value: { operator, value } });
        return query;
      },
      gte(column: string, value: unknown) {
        spec.filters.push({ op: "gte", column, value });
        return query;
      },
      lte(column: string, value: unknown) {
        spec.filters.push({ op: "lte", column, value });
        return query;
      },
      lt(column: string, value: unknown) {
        spec.filters.push({ op: "lt", column, value });
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
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const snapshot: QuerySpec = {
          ...spec,
          filters: spec.filters.map((filter) => ({ ...filter })),
        };
        return Promise.resolve(harness.executeQuery(snapshot)).then(onfulfilled, onrejected);
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

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    ...harness.growsState,
    refresh: harness.refreshGrows,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => harness.scopedGrowState,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null }),
}));

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => true,
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

vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: ({ testId }: { testId: string }) => <div data-testid={testId}>Continue to Sensors</div>,
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({
  default: ({ handle }: { handle: { diaryEntryId?: string } }) => (
    <output data-testid="linked-quicklog-revision-controls" data-diary-id={handle.diaryEntryId} />
  ),
}));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({
  default: ({ entry }: { entry: { capturedAt: string } }) => (
    <output
      data-testid="environment-check-snapshot-link-probe"
      data-captured-at={entry.capturedAt}
    />
  ),
}));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({
  default: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-watering-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/FeedingHistoryPanel", () => ({
  default: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-feeding-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/PhotoHistoryPanel", () => ({
  default: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-photo-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/QuickLogHistoryPanels", () => ({
  RecentQuickLogActivityPanel: ({
    rawEntries = [],
  }: {
    rawEntries?: Array<{ id?: string; details?: Record<string, unknown> }>;
  }) => (
    <output
      data-testid="timeline-recent-raw-entries-probe"
      data-entry-count={rawEntries.length}
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
      data-manual-snapshot-count={
        rawEntries.filter((entry) => entry.details?.manual_sensor_snapshot != null).length
      }
    />
  ),
  PestDiseaseHistoryPanel: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-pest-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
  TrainingHistoryPanel: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-training-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
  MeasurementHistoryPanel: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-measurement-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/DiaryCalendarSection", async () => {
  const { useState } = await import("react");
  return {
    default: function CalendarProbe({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) {
      const [mount] = useState(() => ++probes.calendarMounts);
      return (
        <output
          data-testid="timeline-calendar-lane-probe"
          data-mount={mount}
          data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
        />
      );
    },
  };
});
vi.mock("@/components/TimelineCsvContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PhenoHuntTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelinePhotoLightbox", () => ({ default: () => null }));
vi.mock("@/components/TimelineEvidenceDetailDrawer", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";
import { MISSING_ACTION_NOTHING_MISSING_COPY } from "@/lib/timelineMissingActionRules";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-01-01T00:00:00.000Z",
};

const PLANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const PLANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const TENT_1 = "cccccccc-0000-4000-8000-000000000001";
const DAY_MS = 24 * 60 * 60 * 1000;

function careEntry(id: string, plantId: string, eventType: string, daysAgo: number) {
  return {
    id,
    note: `${eventType} ${id}`,
    photo_url: null,
    stage: "vegetative",
    details: { event_type: eventType, source: "manual" },
    entry_at: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    plant_id: plantId,
    tent_id: TENT_1,
  };
}

// Plant A waters every 2 days and is on rhythm. Plant B fed daily, then
// stopped 10 days ago, so only plant B has a missing action.
function mockTwoPlantRhythms() {
  const rows = [
    careEntry("a-water-1", PLANT_A, "watering", 5),
    careEntry("a-water-2", PLANT_A, "watering", 3),
    careEntry("a-water-3", PLANT_A, "watering", 1),
    careEntry("b-feed-1", PLANT_B, "feeding", 12),
    careEntry("b-feed-2", PLANT_B, "feeding", 11),
    careEntry("b-feed-3", PLANT_B, "feeding", 10),
  ];
  harness.executeQuery.mockImplementation((spec: QuerySpec) => {
    if (spec.table === "diary_entries") return { data: rows, error: null, count: rows.length };
    return { data: [], error: null };
  });
}

function renderTimeline(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Timeline />
    </MemoryRouter>,
  );
}

async function clickNextMissingAction(): Promise<string> {
  const probe = await screen.findByTestId("timeline-recent-raw-entries-probe");
  await waitFor(() => expect(Number(probe.getAttribute("data-entry-count"))).toBeGreaterThan(0));
  const button = screen.getByTestId("timeline-next-missing-action");
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  return (await screen.findByTestId("timeline-missing-action-banner")).textContent ?? "";
}

describe("Timeline next missing action follows the plant filter", () => {
  let scrollIntoView: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    // jsdom does not implement scrollIntoView; the jump calls it on a found gap.
    scrollIntoView = vi.fn<() => void>();
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView =
      scrollIntoView;
    harness.executeQuery.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
        error: null,
      }),
    );
    Object.assign(harness.growsState, {
      activeGrow: GROW_A,
      activeGrowId: GROW_A.id,
      grows: [GROW_A],
      loading: false,
      error: null,
    });
    Object.assign(harness.scopedGrowState, {
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    });
  });

  it("does not jump to another plant's gap when filtered to plant A", async () => {
    mockTwoPlantRhythms();
    renderTimeline(`/timeline?plantId=${PLANT_A}`);
    const banner = await clickNextMissingAction();
    expect(banner).not.toMatch(/feeding/i);
    expect(banner).toContain(MISSING_ACTION_NOTHING_MISSING_COPY);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("still finds plant B's gap when filtered to plant B", async () => {
    mockTwoPlantRhythms();
    renderTimeline(`/timeline?plantId=${PLANT_B}`);
    expect(await clickNextMissingAction()).toMatch(/feeding/i);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("reads every plant when no plant is filtered", async () => {
    mockTwoPlantRhythms();
    renderTimeline("/timeline");
    expect(await clickNextMissingAction()).toMatch(/feeding/i);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
