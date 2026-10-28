/**
 * Mounted #2283 regression: a refresh may finish while deletion remains pending.
 * Real removal-hook completions must reconcile the latest same-scope read.
 */
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
  toast: { success: harness.removalSuccess, error: vi.fn() },
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

describe("Timeline reconciles confirmed deletion across same-scope refreshes", () => {
  type Page = { rows: ReturnType<typeof diaryEntry>[]; count: number | null };
  let pages: Record<string, Page>;
  let deletion: ReturnType<typeof deferred<void>>;
  let pendingRefresh: ReturnType<typeof deferred<QueryResult>> | null;
  let capturedRefresh: QueryResult | null;

  const alpha = () => diaryEntry("entry-a", "Alpha note", "2026-07-20T12:00:00.000Z");
  const charlie = () => diaryEntry("entry-c", "Charlie note", "2026-07-19T12:00:00.000Z");
  const delta = () => diaryEntry("entry-d", "Delta note", "2026-07-21T12:00:00.000Z");

  beforeEach(() => {
    pages = { [GROW_A.id]: { rows: [alpha(), charlie()], count: 2 } };
    deletion = deferred<void>();
    pendingRefresh = null;
    capturedRefresh = null;
    harness.removalSuccess.mockReset();
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && spec.operation === "delete") {
        const id = spec.filters.find((filter) => filter.column === "id")?.value;
        return deletion.promise.then(() => {
          // The mock database changes only when the real delete completes.
          // Any reconciliation read now sees the confirmed persisted result.
          for (const page of Object.values(pages)) {
            if (!page.rows.some((row) => row.id === id)) continue;
            page.rows = page.rows.filter((row) => row.id !== id);
            if (page.count !== null) page.count = Math.max(0, page.count - 1);
          }
          return { data: { id }, error: null };
        });
      }
      if (spec.table === "diary_entries" && spec.single && spec.columns === "details") {
        return { data: { details: { event_type: "note", source: "manual" } }, error: null };
      }
      if (spec.table === "diary_entries") {
        const page = pages[growIdOf(spec) ?? ""] ?? { rows: [], count: 0 };
        const result = { data: [...page.rows], error: null, count: page.count };
        if (pendingRefresh && spec.count === "exact") {
          capturedRefresh = result;
          const pending = pendingRefresh;
          pendingRefresh = null;
          return pending.promise;
        }
        return result;
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

  async function beginPendingRemoval() {
    await waitFor(() => expect(screen.getByText("Alpha note")).toBeTruthy());
    await confirmRemovalOf("Alpha note");
    await waitFor(() =>
      expect(
        harness.executeQuery.mock.calls.some(
          ([spec]) => spec.table === "diary_entries" && spec.operation === "delete",
        ),
      ).toBe(true),
    );
    expect(harness.removalSuccess).not.toHaveBeenCalled();
  }

  async function finishRemoval() {
    await act(async () => {
      deletion.resolve();
      await deletion.promise;
    });
    await waitFor(() => expect(harness.removalSuccess).toHaveBeenCalledTimes(1));
  }

  it.each(["verdant:entry-created", "verdant:sensor-reading-created"])(
    "removes the stale row once after %s refresh finishes before deletion",
    async (eventName) => {
      pages[GROW_A.id].count = 6;
      renderTimeline();
      await beginPendingRemoval();

      // A separate write adds Delta. This refresh really commits its new row
      // and server count before deletion, while it still contains Alpha.
      pages[GROW_A.id] = { rows: [delta(), alpha(), charlie()], count: 7 };
      fireEvent(window, new Event(eventName));
      await waitFor(() => expect(screen.getByText("Delta note")).toBeTruthy());
      expect(screen.getByText("Alpha note")).toBeTruthy();
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 3 of 7");
      expect(harness.removalSuccess).not.toHaveBeenCalled();

      await finishRemoval();

      await waitFor(() => {
        expect(screen.queryByText("Alpha note")).toBeNull();
        expect(screen.getByText("Charlie note")).toBeTruthy();
        expect(screen.getByText("Delta note")).toBeTruthy();
        expect(screen.getByTestId("timeline-results-count").textContent).toContain(
          "showing 2 of 6",
        );
      });
    },
  );

  it("does not resurrect the row when an older same-scope refresh finishes after deletion", async () => {
    renderTimeline();
    await beginPendingRemoval();
    pages[GROW_A.id] = { rows: [delta(), alpha(), charlie()], count: 3 };
    const staleRefresh = deferred<QueryResult>();
    pendingRefresh = staleRefresh;
    fireEvent(window, new Event("verdant:entry-created"));
    await waitFor(() => expect(capturedRefresh).not.toBeNull());

    await finishRemoval();
    await act(async () => {
      staleRefresh.resolve(capturedRefresh!);
      await staleRefresh.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Alpha note")).toBeNull();
      expect(screen.getByText("Charlie note")).toBeTruthy();
      expect(screen.getByText("Delta note")).toBeTruthy();
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 2 of 2");
    });
  });

  it("does not double-decrement a refresh that already omits the deleted row", async () => {
    renderTimeline();
    await beginPendingRemoval();
    pages[GROW_A.id] = { rows: [charlie()], count: 1 };
    fireEvent(window, new Event("verdant:entry-created"));
    await waitFor(() =>
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 1"),
    );

    await finishRemoval();

    await waitFor(() => {
      expect(screen.queryByText("Alpha note")).toBeNull();
      expect(screen.getByText("Charlie note")).toBeTruthy();
      expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 1");
    });
  });

  it("does not alter another grow after the pending removal's scope changes", async () => {
    pages[GROW_B.id] = {
      rows: [diaryEntry("entry-b", "Bravo note", "2026-08-20T12:00:00.000Z")],
      count: 5,
    };
    const view = renderTimeline();
    await beginPendingRemoval();
    harness.growsState.activeGrow = GROW_B;
    harness.growsState.activeGrowId = GROW_B.id;
    view.rerender(timelineTree(view.client));
    await waitFor(() => expect(screen.getByText("Bravo note")).toBeTruthy());

    await finishRemoval();

    expect(screen.getByText("Bravo note")).toBeTruthy();
    expect(screen.queryByText("Alpha note")).toBeNull();
    expect(screen.getByTestId("timeline-results-count").textContent).toContain("showing 1 of 5");
  });
});
