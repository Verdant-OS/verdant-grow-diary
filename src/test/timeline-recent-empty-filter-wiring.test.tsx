/**
 * #2293: real Timeline URL/input state must agree with its actual recent-panel
 * empty state and the diary/grow-event query bounds. A missing/false prop, or
 * accepting an impossible calendar date, must fail these mounted assertions.
 * Only external reads and unrelated UI are replaced; neither Timeline nor its
 * recent-panel/date helpers are mocked. No production network or write occurs.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryFilter {
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

const harness = vi.hoisted(() => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/Chicago";
  return {
    originalTz,
    executeQuery: vi.fn<(spec: QuerySpec) => QueryResult>(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    createSignedUrls: vi.fn(),
    capturedQueries: [] as QuerySpec[],
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
  };
});

afterAll(() => {
  if (harness.originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = harness.originalTz;
});

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, filters: [] };
    const query = {
      select() {
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
      in(column: string, value: unknown) {
        spec.filters.push({ op: "eq", column, value });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      insert: (...args: unknown[]) => harness.insert(...args),
      update: (...args: unknown[]) => harness.update(...args),
      delete: (...args: unknown[]) => harness.delete(...args),
      upsert: (...args: unknown[]) => harness.upsert(...args),
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const snapshot: QuerySpec = { table, filters: spec.filters.map((f) => ({ ...f })) };
        harness.capturedQueries.push(snapshot);
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
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => harness.scopedGrowState,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    entitlement: null,
    loading: false,
    lookupFailed: false,
    refetch: vi.fn(),
  }),
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
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/FeedingHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/PhotoHistoryPanel", () => ({ default: () => null }));
// Keep the actual recent panel: the assertion observes the page's rendered
// empty state rather than a replica of its dateFiltered expression.
vi.mock("@/components/QuickLogHistoryPanels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/QuickLogHistoryPanels")>();
  return {
    ...actual,
    PestDiseaseHistoryPanel: () => null,
    TrainingHistoryPanel: () => null,
    MeasurementHistoryPanel: () => null,
  };
});
vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));
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
vi.mock("@/components/SymptomEvidenceChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/TimelineLightingGuideCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

const GROW = {
  id: "grow-a",
  name: "Range fixture",
  stage: "vegetative",
  started_at: "2026-01-01T00:00:00.000Z",
};
const FILTERED = "No Quick Logs in this date range";
const UNFILTERED = "No Quick Log entries yet";
const START = "2026-07-15T05:00:00.000Z";
const END = "2026-07-16T04:59:59.999Z";

function LocationProbe() {
  return <output data-testid="range-location">{useLocation().search}</output>;
}

function mountTimeline(search: string) {
  render(
    <MemoryRouter initialEntries={[`/timeline${search}`]}>
      <Timeline />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function expectReadBounds(start: string | null, end: string | null) {
  const specs = harness.capturedQueries.filter((q) =>
    ["diary_entries", "grow_events"].includes(q.table),
  );
  expect(specs.some((q) => q.table === "diary_entries")).toBe(true);
  expect(specs.some((q) => q.table === "grow_events")).toBe(true);
  for (const spec of specs) {
    const column = spec.table === "diary_entries" ? "entry_at" : "occurred_at";
    expect(spec.filters.find((f) => f.op === "gte" && f.column === column)?.value).toBe(
      start ?? undefined,
    );
    expect(spec.filters.find((f) => f.op === "lte" && f.column === column)?.value).toBe(
      end ?? undefined,
    );
  }
}

beforeEach(() => {
  harness.executeQuery.mockReset();
  harness.insert.mockReset();
  harness.update.mockReset();
  harness.delete.mockReset();
  harness.upsert.mockReset();
  harness.createSignedUrls.mockReset();
  harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
  harness.capturedQueries.length = 0;
  Object.assign(harness.growsState, {
    activeGrow: GROW,
    activeGrowId: GROW.id,
    grows: [GROW],
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
  harness.executeQuery.mockImplementation((spec) =>
    spec.table === "diary_entries"
      ? { data: [], error: null, count: 0 }
      : { data: [], error: null },
  );
});

afterEach(() => {
  cleanup();
  expect(harness.insert).not.toHaveBeenCalled();
  expect(harness.update).not.toHaveBeenCalled();
  expect(harness.delete).not.toHaveBeenCalled();
  expect(harness.upsert).not.toHaveBeenCalled();
});

describe("Timeline recent empty-state wiring and actual query bounds", () => {
  it.each([
    { name: "unfiltered URL", search: "", filtered: false, start: null, end: null },
    {
      name: "valid start only",
      search: "?start=2026-07-15",
      filtered: true,
      start: START,
      end: null,
    },
    { name: "valid end only", search: "?end=2026-07-15", filtered: true, start: null, end: END },
    {
      name: "valid bounded range",
      search: "?start=2026-07-15&end=2026-07-15",
      filtered: true,
      start: START,
      end: END,
    },
    {
      name: "impossible start only",
      search: "?start=2026-02-30",
      filtered: false,
      start: null,
      end: null,
    },
    {
      name: "impossible end only",
      search: "?end=2026-02-30",
      filtered: false,
      start: null,
      end: null,
    },
    {
      name: "both impossible",
      search: "?start=2026-02-30&end=2026-02-30",
      filtered: false,
      start: null,
      end: null,
    },
    {
      name: "invalid start and valid end",
      search: "?start=2026-02-30&end=2026-07-15",
      filtered: true,
      start: null,
      end: END,
    },
    {
      name: "valid start and invalid end",
      search: "?start=2026-07-15&end=2026-13-40",
      filtered: true,
      start: START,
      end: null,
    },
    {
      name: "valid leap day",
      search: "?start=2028-02-29",
      filtered: true,
      start: "2028-02-29T06:00:00.000Z",
      end: null,
    },
    {
      name: "invalid non-leap day",
      search: "?start=2026-02-29",
      filtered: false,
      start: null,
      end: null,
    },
    {
      name: "inverted valid range",
      search: "?start=2026-07-20&end=2026-07-15",
      filtered: false,
      start: null,
      end: null,
    },
  ])(
    "$name agrees between the query and real recent panel",
    async ({ search, filtered, start, end }) => {
      mountTimeline(search);
      await waitFor(() => expect(harness.capturedQueries.length).toBeGreaterThan(0));
      const lane = await screen.findByTestId("quicklog-history-section-recent");
      await waitFor(() => expect(lane).toHaveTextContent(filtered ? FILTERED : UNFILTERED));
      expect(lane).not.toHaveTextContent(filtered ? UNFILTERED : FILTERED);
      expectReadBounds(start, end);
    },
  );

  it("clearing an applied range updates the same page's panel, URL and reads", async () => {
    mountTimeline("?start=2026-07-15&end=2026-07-15");
    const lane = await screen.findByTestId("quicklog-history-section-recent");
    await waitFor(() => expect(lane).toHaveTextContent(FILTERED));
    expectReadBounds(START, END);
    harness.capturedQueries.length = 0;

    fireEvent.click(screen.getByTestId("timeline-clear-filters"));

    await waitFor(() =>
      expect(screen.getByTestId("quicklog-history-section-recent")).toHaveTextContent(UNFILTERED),
    );
    await waitFor(() =>
      expect(harness.capturedQueries.some((q) => q.table === "diary_entries")).toBe(true),
    );
    expectReadBounds(null, null);
    expect(screen.getByTestId("range-location")).not.toHaveTextContent("start=");
    expect(screen.getByTestId("range-location")).not.toHaveTextContent("end=");
  });
});
