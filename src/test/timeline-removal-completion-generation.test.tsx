/**
 * Mounted Timeline removal completion. A confirmed delete that finishes
 * after a grow change, or after a same-scope refresh that already dropped
 * the row, must not change the page now on screen.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  operation: "select" | "delete";
  columns: string | null;
  count: string | null;
  single: boolean;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown;
  error: unknown | null;
  count?: number | null;
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = {
      table,
      operation: "select",
      columns: null,
      count: null,
      single: false,
      filters: [],
    };
    const query = {
      select(columns: string, options?: { count?: string }) {
        spec.columns = columns;
        spec.count = options?.count ?? null;
        return query;
      },
      delete() {
        spec.operation = "delete";
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
      maybeSingle() {
        const snapshot: QuerySpec = {
          ...spec,
          single: true,
          filters: spec.filters.map((filter) => ({ ...filter })),
        };
        return Promise.resolve(harness.executeQuery(snapshot));
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
          remove: () => Promise.resolve({ data: [], error: null }),
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

vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: () => null,
}));
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
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

const GROW_B = {
  id: "grow-b",
  name: "Current Run B",
  stage: "flower",
  started_at: "2026-08-01T00:00:00.000Z",
};

function diaryEntry(id: string, note: string, entryAt: string) {
  return {
    id,
    note,
    photo_url: null,
    stage: "vegetative",
    details: { event_type: "note", source: "manual" },
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function growIdOf(spec: QuerySpec): string | null {
  const match = spec.filters.find((filter) => filter.op === "eq" && filter.column === "grow_id");
  return typeof match?.value === "string" ? match.value : null;
}

function timelineTree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderTimeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(timelineTree(client)) };
}

async function confirmRemovalOf(note: string) {
  const entry = screen.getByText(note).closest('[data-testid="timeline-entry"]');
  if (!(entry instanceof HTMLElement)) throw new Error(`No timeline entry for ${note}`);
  fireEvent.click(within(entry).getByTestId("diary-entry-remove-button"));
  fireEvent.click(screen.getByTestId("diary-entry-remove-confirm"));
}

describe("Timeline removal completion stays on the current page", () => {
  let pages: Record<string, { rows: ReturnType<typeof diaryEntry>[]; count: number | null }>;
  let preflight: ReturnType<typeof deferred<QueryResult>> | null;
  let deletion: ReturnType<typeof deferred<QueryResult>> | null;

  beforeEach(() => {
    pages = {};
    preflight = null;
    deletion = null;
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && spec.single && spec.columns === "details") {
        if (preflight) return preflight.promise;
        return { data: { details: { event_type: "note", source: "manual" } }, error: null };
      }
      if (spec.table === "diary_entries" && spec.operation === "delete") {
        const id = spec.filters.find((filter) => filter.column === "id")?.value;
        const result = { data: { id }, error: null };
        if (deletion) return deletion.promise.then(() => result);
        return result;
      }
      if (spec.table === "diary_entries") {
        const page = pages[growIdOf(spec) ?? ""] ?? { rows: [], count: 0 };
        return { data: page.rows, error: null, count: page.count };
      }
      return { data: [], error: null, count: 0 };
    });
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    Object.assign(harness.growsState, {
      activeGrow: GROW_A,
      activeGrowId: GROW_A.id,
      grows: [GROW_A, GROW_B],
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

  it("drops the row and the Detailed diary total when removal finishes on the same page", async () => {
    pages[GROW_A.id] = {
      rows: [diaryEntry("entry-a", "Alpha note", "2026-07-20T12:00:00.000Z")],
      count: 4,
    };
    const view = renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 4");
    });
    await confirmRemovalOf("Alpha note");
    await waitFor(() => {
      expect(screen.queryByText("Alpha note")).toBeNull();
    });
    expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 0 of 3");
    expect(view.container).toBeTruthy();
  });

  it("does not decrement grow B when grow A's removal completes after the switch", async () => {
    pages[GROW_A.id] = {
      rows: [diaryEntry("entry-a", "Alpha note", "2026-07-20T12:00:00.000Z")],
      count: 1,
    };
    pages[GROW_B.id] = {
      rows: [diaryEntry("entry-b", "Bravo note", "2026-08-20T12:00:00.000Z")],
      count: 5,
    };
    preflight = deferred();
    deletion = deferred();

    const view = renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 1");
    });
    expect(screen.getByText("Alpha note")).toBeTruthy();

    await confirmRemovalOf("Alpha note");
    harness.growsState.activeGrow = GROW_B;
    harness.growsState.activeGrowId = GROW_B.id;
    view.rerender(timelineTree(view.client));

    await waitFor(() => {
      expect(screen.getByText("Bravo note")).toBeTruthy();
    });
    expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 5");

    await act(async () => {
      preflight!.resolve({
        data: { details: { event_type: "note", source: "manual" } },
        error: null,
      });
      deletion!.resolve({ data: { id: "entry-a" }, error: null });
      await preflight!.promise;
      await deletion!.promise;
    });

    expect(screen.getByText("Bravo note")).toBeTruthy();
    expect(screen.queryByText("Alpha note")).toBeNull();
    expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 5");
  });

  it("does not decrement again when a same-scope refresh already reflects the removal", async () => {
    pages[GROW_A.id] = {
      rows: [
        diaryEntry("entry-a", "Alpha note", "2026-07-20T12:00:00.000Z"),
        diaryEntry("entry-c", "Charlie note", "2026-07-19T12:00:00.000Z"),
      ],
      count: 2,
    };
    preflight = deferred();
    deletion = deferred();

    renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 2 of 2");
    });

    await confirmRemovalOf("Alpha note");
    pages[GROW_A.id] = {
      rows: [diaryEntry("entry-c", "Charlie note", "2026-07-19T12:00:00.000Z")],
      count: 1,
    };
    fireEvent(window, new Event("verdant:entry-created"));

    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 1");
    });
    expect(screen.queryByText("Alpha note")).toBeNull();

    await act(async () => {
      preflight!.resolve({
        data: { details: { event_type: "note", source: "manual" } },
        error: null,
      });
      deletion!.resolve({ data: { id: "entry-a" }, error: null });
      await preflight!.promise;
      await deletion!.promise;
    });

    expect(screen.getByText("Charlie note")).toBeTruthy();
    expect(screen.queryByText("Alpha note")).toBeNull();
    expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 1");
  });
});
