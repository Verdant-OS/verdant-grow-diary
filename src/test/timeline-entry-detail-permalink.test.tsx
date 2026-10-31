/**
 * Timeline entry detail permalink (FA-F08).
 * Auth, storage, and network are mocked. No real credentials.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useSearchParams } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
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

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";
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

  it("opens the entry from the timeline into a stable URL and reopens it", async () => {
    renderTimeline("/timeline");
    expect(await screen.findByText("Watered the tent")).toBeInTheDocument();

    const openButton = screen.getByTestId("timeline-entry-open");
    expect(openButton.getAttribute("aria-label") ?? "").toMatch(/^Open /);
    expect(openButton.tagName).toBe("BUTTON");
    const entryBody = screen.getByTestId("timeline-entry-body");
    expect(entryBody).toHaveAttribute("tabindex", "0");
    expect(entryBody.getAttribute("aria-label") ?? "").toMatch(/\S/);

    fireEvent.click(openButton);
    const drawer = await screen.findByTestId("timeline-evidence-drawer");
    expect(screen.getByTestId("search-probe").textContent).toContain(`entry=${ENTRY_ID}`);
    expect(within(drawer).getByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    expect(drawer).toHaveTextContent("Watering");
    expect(within(drawer).getByTestId("timeline-evidence-drawer-photo")).toHaveAttribute(
      "src",
      "https://example.test/leaf.jpg",
    );
    expect(within(drawer).getByTestId("timeline-evidence-drawer-readings")).toHaveTextContent(
      "500",
    );
    expect(
      within(drawer).getByRole("button", { name: "Correct this Quick Log entry" }),
    ).toBeEnabled();
    expect(
      within(drawer).getByRole("button", { name: "Retract this Quick Log entry" }),
    ).toBeEnabled();
    const panel = within(drawer).getByTestId("timeline-evidence-drawer-panel");
    expect(panel.className).toContain("w-full");
    expect(panel.className).toContain("sm:max-w-lg");
    expect(panel.className).toContain("max-h-[90vh]");

    fireEvent.click(screen.getByTestId("timeline-evidence-drawer-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("timeline-evidence-drawer")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("timeline-entry-open"));
    expect(await screen.findByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    expect(screen.getByTestId("search-probe").textContent).toContain(`entry=${ENTRY_ID}`);
  });

  it("reloads the same entry from its permalink", async () => {
    renderTimeline(`/timeline?entry=${ENTRY_ID}`);
    expect(await screen.findByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    expect(screen.getByTestId("timeline-evidence-drawer-photo")).toBeInTheDocument();
  });

  it("shows entry not found when the permalink does not resolve", async () => {
    harness.entries = [];
    renderTimeline(`/timeline?entry=${MISSING_ID}`);
    expect(await screen.findByText("Entry not found")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-entry-detail-unavailable")).toHaveTextContent(
      "This entry is missing or you do not have access to it.",
    );
    expect(screen.queryByText("Watered the tent")).toBeNull();
    expect(screen.queryByTestId("timeline-evidence-drawer")).toBeNull();
  });

  it("loads a permalink entry that is outside the timeline page", async () => {
    harness.entries = [];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table !== "diary_entries") return { data: [], error: null };
      const idFilter = spec.filters.find((filter) => filter.op === "eq" && filter.column === "id");
      if (idFilter?.value === ENTRY_ID) return { data: [ENTRY], error: null };
      return { data: [], error: null, count: 0 };
    });
    renderTimeline(`/timeline?entry=${ENTRY_ID}`);
    expect(await screen.findByTestId("timeline-evidence-drawer-note")).toHaveTextContent(
      "Watered the tent",
    );
    expect(screen.queryByTestId("timeline-entry")).toBeNull();
  });
});
