/**
 * Timeline entry detail permalink (FA-F08): an off-page entry opened from
 * ?entry= is re-read after Correct or Retract (Reviewer B P2 on #2649 @ e7796fe4).
 * Auth, storage, and network are mocked. No real credentials.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useSearchParams } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  entries: [] as Array<Record<string, unknown>>,
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
  useMyEntitlements: () => ({ entitlement: null, loading: false, lookupFailed: false }),
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
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));
// Stand-in for the revision controls: same accessible names, and each action
// changes the stored row the way the real RPCs do, then calls onChanged.
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({
  default: (props: { handle: { diaryEntryId: string }; onChanged?: () => void }) => (
    <div>
      <button
        type="button"
        aria-label="Correct this Quick Log entry"
        onClick={() => {
          harness.rows = harness.rows.map((row) =>
            row.id === props.handle.diaryEntryId ? { ...row, note: "Watered 750 ml" } : row,
          );
          props.onChanged?.();
        }}
      >
        Correct
      </button>
      <button
        type="button"
        aria-label="Retract this Quick Log entry"
        onClick={() => {
          harness.rows = harness.rows.filter((row) => row.id !== props.handle.diaryEntryId);
          props.onChanged?.();
        }}
      >
        Retract
      </button>
    </div>
  ),
}));

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const ENTRY_AT = "2026-10-15T16:05:00.000Z";

const ENTRY = {
  id: ENTRY_ID,
  note: "Watered the tent",
  photo_url: "https://example.test/leaf.jpg",
  stage: "veg",
  details: {
    event_type: "watering",
    plant_name: "Blue Dream",
    linked_grow_event_id: "22222222-2222-4222-8222-222222222222",
    watering_amount_ml: 500,
  },
  entry_at: ENTRY_AT,
  plant_id: "33333333-3333-4333-8333-333333333333",
  tent_id: "44444444-4444-4444-8444-444444444444",
  grow_id: GROW_A.id,
};

function SearchProbe() {
  const [params] = useSearchParams();
  return <div data-testid="search-probe">{params.toString()}</div>;
}

function renderTimeline(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SearchProbe />
        <Timeline />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function diaryResult(spec: QuerySpec): QueryResult {
  const idFilter = spec.filters.find((filter) => filter.op === "eq" && filter.column === "id");
  if (idFilter) {
    const match = harness.entries.filter((row) => row.id === idFilter.value);
    return { data: match, error: null, count: match.length };
  }
  return { data: harness.entries, error: null, count: harness.entries.length };
}

describe("timeline entry detail permalink", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return diaryResult(spec);
      return { data: [], error: null };
    });
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    harness.entries = [ENTRY];
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

  function byIdQueries(): QuerySpec[] {
    return harness.executeQuery.mock.calls
      .map((call) => call[0] as QuerySpec)
      .filter(
        (spec) =>
          spec.table === "diary_entries" &&
          spec.filters.some((f) => f.op === "eq" && f.column === "id"),
      );
  }

  function byIdFromRows() {
    harness.entries = [];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table !== "diary_entries") return { data: [], error: null };
      const idFilter = spec.filters.find((f) => f.op === "eq" && f.column === "id");
      if (!idFilter) return { data: [], error: null, count: 0 };
      const userFilter = spec.filters.find((f) => f.op === "eq" && f.column === "user_id");
      const match = harness.rows.filter(
        (row) => row.id === idFilter.value && (!userFilter || row.user_id === userFilter.value),
      );
      return { data: match, error: null, count: match.length };
    });
  }

  it("after Retract on a permalink-opened entry, the drawer shows Entry not found and no Correct/Retract", async () => {
    harness.rows = [{ ...ENTRY, user_id: "owner-1" }];
    byIdFromRows();
    renderTimeline(`/timeline?entry=${ENTRY_ID}`);
    expect(await screen.findByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    const before = byIdQueries().length;
    fireEvent.click(screen.getByRole("button", { name: "Retract this Quick Log entry" }));
    await waitFor(() => expect(byIdQueries().length).toBeGreaterThan(before));
    expect(await screen.findByText("Entry not found")).toBeInTheDocument();
    expect(screen.queryByText("Watered the tent")).toBeNull();
    expect(screen.queryByRole("button", { name: "Correct this Quick Log entry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retract this Quick Log entry" })).toBeNull();
  });

  it("after Correct on a permalink-opened entry, the drawer shows the corrected note", async () => {
    harness.rows = [{ ...ENTRY, user_id: "owner-1" }];
    byIdFromRows();
    renderTimeline(`/timeline?entry=${ENTRY_ID}`);
    expect(await screen.findByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    fireEvent.click(screen.getByRole("button", { name: "Correct this Quick Log entry" }));
    await waitFor(() =>
      expect(screen.getByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
        "Watered 750 ml",
      ),
    );
    expect(screen.queryByText("Watered the tent")).toBeNull();
  });
});
