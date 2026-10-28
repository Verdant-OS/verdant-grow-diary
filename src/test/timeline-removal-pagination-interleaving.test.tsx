/**
 * Mounted regression for #2283: pagination and confirmed removal must compose
 * when their network completions land in the same React batch.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn<(spec: QuerySpec) => QueryResult | Promise<QueryResult>>(),
  removalSuccess: vi.fn(),
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
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt" | "in";
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
      in(column: string, value: unknown[]) {
        spec.filters.push({ op: "in", column, value });
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
  toast: { success: harness.removalSuccess, error: vi.fn() },
}));

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
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
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/timeline"]}>
          <Timeline />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
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

const INITIAL_ROWS = [
  diaryEntry("entry-a", "Alpha note", "2026-07-20T12:00:00.000Z"),
  diaryEntry("entry-b", "Bravo note", "2026-07-19T12:00:00.000Z"),
];
const OLDER_ROWS = [
  {
    ...diaryEntry("entry-c", "Charlie older note", "2026-07-18T12:00:00.000Z"),
    details: {
      event_type: "note",
      source: "manual",
      linked_grow_event_id: "outside-page-parent",
    },
  },
  diaryEntry("entry-d", "Delta older note", "2026-07-17T12:00:00.000Z"),
];

describe("Timeline removal and pagination completions compose in one batch", () => {
  let olderPage: ReturnType<typeof deferred<QueryResult>>;
  let olderAppendQueued: ReturnType<typeof deferred<void>>;
  let deletionResults: Map<string, ReturnType<typeof deferred<QueryResult>>>;
  let successfulRemovals: Array<ReturnType<typeof deferred<void>>>;
  let cursors: unknown[];

  beforeEach(() => {
    olderPage = deferred();
    olderAppendQueued = deferred();
    deletionResults = new Map();
    successfulRemovals = [];
    cursors = [];
    harness.executeQuery.mockReset();
    harness.removalSuccess.mockReset();
    harness.removalSuccess.mockImplementation(() => successfulRemovals.shift()?.resolve());
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && spec.single && spec.columns === "details") {
        return { data: { details: { event_type: "note", source: "manual" } }, error: null };
      }
      if (spec.table === "diary_entries" && spec.operation === "delete") {
        const id = spec.filters.find((filter) => filter.column === "id")?.value;
        if (typeof id !== "string") throw new Error("Removal needs an entry id");
        const response = deletionResults.get(id);
        if (!response) throw new Error(`No deferred delete response for ${id}`);
        return response.promise;
      }
      if (spec.table === "diary_entries") {
        expect(growIdOf(spec)).toBe(GROW_A.id);
        const cursor = spec.filters.find((filter) => filter.op === "lt");
        if (cursor) {
          cursors.push(cursor.value);
          return olderPage.promise;
        }
        return { data: INITIAL_ROWS, error: null, count: 4 };
      }
      if (
        spec.table === "grow_events" &&
        spec.filters.some(
          (filter) =>
            filter.op === "in" &&
            filter.column === "id" &&
            Array.isArray(filter.value) &&
            filter.value.includes("outside-page-parent"),
        )
      ) {
        // The real loadOlder queues its append before resolving a fetched
        // diary row's missing parent. This network boundary lets the test
        // complete deletion after the append was queued, before React commits.
        olderAppendQueued.resolve();
      }
      return { data: [], error: null, count: 0 };
    });
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
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

  async function startPagination() {
    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count")).toHaveTextContent("showing 2 of 4");
    });
    fireEvent.click(screen.getByTestId("timeline-load-older"));
    await waitFor(() => expect(cursors).toEqual([INITIAL_ROWS[1].entry_at]));
    expect(screen.getByTestId("timeline-load-older")).toBeDisabled();
  }

  async function startRemoval(id: string, note: string) {
    const response = deferred<QueryResult>();
    const completed = deferred<void>();
    deletionResults.set(id, response);
    successfulRemovals.push(completed);
    await confirmRemovalOf(note);
    await waitFor(() =>
      expect(
        harness.executeQuery.mock.calls.some(
          ([spec]) =>
            spec.operation === "delete" &&
            spec.filters.some((filter) => filter.column === "id" && filter.value === id),
        ),
      ).toBe(true),
    );
    return {
      complete() {
        response.resolve({ data: { id }, error: null });
      },
      completed: completed.promise,
    };
  }

  function expectOlderRowsAndCount(remainingNotes: string[], total: number) {
    expect(screen.queryByText("Alpha note")).not.toBeInTheDocument();
    for (const note of remainingNotes) expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(total);
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      `Detailed diary: showing ${total} of ${total} entries`,
    );
    expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument();
    expect(cursors).toEqual([INITIAL_ROWS[1].entry_at]);
  }

  it("preserves an older-page append queued before the confirmed removal completes", async () => {
    renderTimeline();
    await startPagination();
    const removal = await startRemoval("entry-a", "Alpha note");

    await act(async () => {
      olderPage.resolve({ data: OLDER_ROWS, error: null });
      await olderAppendQueued.promise;
      // Neither network completion has been committed to the mounted page yet.
      expect(screen.getByText("Alpha note")).toBeInTheDocument();
      expect(screen.queryByText("Charlie older note")).not.toBeInTheDocument();
      removal.complete();
      await removal.completed;
    });

    expectOlderRowsAndCount(["Bravo note", "Charlie older note", "Delta older note"], 3);
    expect(harness.removalSuccess).toHaveBeenCalledTimes(1);
  });

  it("preserves the same rows when removal completes before the older-page append", async () => {
    renderTimeline();
    await startPagination();
    const removal = await startRemoval("entry-a", "Alpha note");

    await act(async () => {
      removal.complete();
      await removal.completed;
      // Toast success and onRemoved run in the same synchronous hook continuation.
      // Awaiting the toast signal therefore resumes after removal queued its state.
      expect(screen.getByText("Alpha note")).toBeInTheDocument();
      olderPage.resolve({ data: OLDER_ROWS, error: null });
      await olderAppendQueued.promise;
    });

    expectOlderRowsAndCount(["Bravo note", "Charlie older note", "Delta older note"], 3);
    expect(harness.removalSuccess).toHaveBeenCalledTimes(1);
  });

  it("preserves the older page and decrements once per row when two removals complete together", async () => {
    renderTimeline();
    await startPagination();
    const alphaRemoval = await startRemoval("entry-a", "Alpha note");
    fireEvent.keyDown(screen.getByTestId("diary-entry-remove-dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("diary-entry-remove-dialog")).not.toBeInTheDocument(),
    );
    const bravoRemoval = await startRemoval("entry-b", "Bravo note");

    await act(async () => {
      olderPage.resolve({ data: OLDER_ROWS, error: null });
      await olderAppendQueued.promise;
      alphaRemoval.complete();
      bravoRemoval.complete();
      await alphaRemoval.completed;
      await bravoRemoval.completed;
    });

    expect(screen.queryByText("Bravo note")).not.toBeInTheDocument();
    expectOlderRowsAndCount(["Charlie older note", "Delta older note"], 2);
    expect(harness.removalSuccess).toHaveBeenCalledTimes(2);
  });
});
