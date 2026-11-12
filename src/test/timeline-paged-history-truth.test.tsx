/**
 * Timeline paged-history truth (audit 2026-11-11).
 *
 * 1. A save while older pages are loaded refetched page one and threw the
 *    older pages away, so a grower reviewing week 3 was sent back to the top.
 * 2. Deleting from the edit dialog removed the row but not its count, leaving
 *    "Load older entries (N more)" one too high.
 * 3. Activity history reads the newest 100 grow_events; nothing said so when
 *    more existed.
 *
 * Component tests render <Timeline /> against a mocked Supabase client.
 */
import { act, createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  mergeTimelineRefreshedFirstPage,
  timelineActivityTruncationNotice,
  timelineHiddenFetchedRows,
} from "@/lib/timelinePagedHistoryRules";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  refreshGrows: vi.fn(),
  setActiveGrowId: vi.fn(),
  reloadActionResponseMemory: vi.fn(),
  createSignedUrls: vi.fn(),
  entryEditOnDeleted: null as ((id: string) => void) | null,
  activityPanelOnEntryChanged: null as (() => void) | null,
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
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt" | "or";
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
      or(filter: string) {
        spec.filters.push({ op: "or", column: "or", value: filter });
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
  default: ({ testId }: { testId: string }) =>
    createElement("div", { "data-testid": testId }, "Continue to Sensors"),
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({
  default: ({ onDeleted }: { onDeleted: (id: string) => void }) => {
    harness.entryEditOnDeleted = onDeleted;
    return null;
  },
}));
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
  RecentQuickLogActivityPanel: (props: { onEntryChanged?: () => void }) => {
    harness.activityPanelOnEntryChanged = props.onEntryChanged ?? null;
    return null;
  },
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

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

type DiaryRow = {
  id: string;
  note: string;
  photo_url: string | null;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  stage: string | null;
  details: Record<string, unknown>;
};

function note(id: string, entryAt: string): DiaryRow {
  return {
    id,
    note: `Note ${id}.`,
    photo_url: null,
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: entryAt,
    stage: "vegetative",
    details: { event_type: "observation", source: "manual" },
  };
}

const N0 = note("n0", "2026-10-15T09:00:00.000Z");
const N1 = note("n1", "2026-10-14T09:00:00.000Z");
const N1B = note("n1b", "2026-10-14T08:00:00.000Z");
const N2 = note("n2", "2026-10-13T09:00:00.000Z");
const N3 = note("n3", "2026-10-12T09:00:00.000Z");

interface Server {
  firstPage: DiaryRow[];
  total: number;
  olderPages: Record<string, DiaryRow[]>;
  growEvents: { rows: unknown[]; total: number };
  cursors: string[];
}

function serve(initial: Omit<Server, "cursors" | "growEvents"> & Partial<Server>): Server {
  const server: Server = { growEvents: { rows: [], total: 0 }, cursors: [], ...initial };
  harness.executeQuery.mockImplementation((spec: QuerySpec) => {
    if (spec.table === "grow_events") {
      // Only the counted core read; sensor and by-id lookups stay empty.
      return spec.count === "exact"
        ? { data: server.growEvents.rows, error: null, count: server.growEvents.total }
        : { data: [], error: null };
    }
    if (spec.table !== "diary_entries") return { data: [], error: null };
    const keyset = spec.filters.find((filter) => filter.op === "or");
    const match = keyset ? /^entry_at\.lt\."([^"]+)"/.exec(String(keyset.value)) : null;
    if (!match) return { data: server.firstPage, error: null, count: server.total };
    server.cursors.push(match[1]);
    return { data: server.olderPages[match[1]] ?? [], error: null };
  });
  return server;
}

function renderTimeline() {
  render(createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)));
}

describe("mergeTimelineRefreshedFirstPage", () => {
  const base = {
    sameScope: true,
    previousRows: [N1, N2],
    previousCursor: { entryAt: N2.entry_at, id: N2.id },
    previousHiddenRows: [],
    firstPageRows: [N0, N1],
    firstPageCursor: { entryAt: N1.entry_at, id: N1.id },
    firstPageHiddenRows: [],
  };

  it("keeps rows older than the refreshed page and the older cursor", () => {
    const merged = mergeTimelineRefreshedFirstPage(base);
    expect(merged.rows.map((row) => row.id)).toEqual(["n0", "n1", "n2"]);
    expect(merged.cursor).toEqual({ entryAt: N2.entry_at, id: N2.id });
    expect(merged.keptOlderPages).toBe(true);
    expect(mergeTimelineRefreshedFirstPage(base)).toEqual(merged);
  });

  it("replaces everything for a different scope", () => {
    const merged = mergeTimelineRefreshedFirstPage({ ...base, sameScope: false });
    expect(merged.rows.map((row) => row.id)).toEqual(["n0", "n1"]);
    expect(merged.cursor).toEqual(base.firstPageCursor);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces when the previous read reached no further than the refreshed page", () => {
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousRows: [N0, N1],
      previousCursor: { entryAt: N1.entry_at, id: N1.id },
      firstPageRows: [N1],
      firstPageCursor: { entryAt: N1.entry_at, id: N1.id },
    });
    // N0 is gone from the refreshed page (removed elsewhere), so it is dropped.
    expect(merged.rows.map((row) => row.id)).toEqual(["n1"]);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces when the refreshed page does not reach the rows already loaded", () => {
    // More than a page of new rows arrived: the refreshed page ends above
    // everything on screen, so rows between it and the old page were never
    // fetched. Keeping the old cursor would skip them for good.
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousRows: [N2, N3],
      previousCursor: { entryAt: N3.entry_at, id: N3.id },
      firstPageRows: [N0],
      firstPageCursor: { entryAt: N0.entry_at, id: N0.id },
    });
    expect(merged.rows.map((row) => row.id)).toEqual(["n0"]);
    expect(merged.cursor).toEqual({ entryAt: N0.entry_at, id: N0.id });
    expect(merged.hiddenRows).toEqual([]);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("treats a hidden row inside the refreshed page as proof of overlap", () => {
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousRows: [N2],
      previousHiddenRows: [{ id: "h", entry_at: N0.entry_at }],
      previousCursor: { entryAt: N2.entry_at, id: N2.id },
    });
    expect(merged.rows.map((row) => row.id)).toEqual(["n0", "n1", "n2"]);
    expect(merged.keptOlderPages).toBe(true);
  });

  it("replaces when either cursor is missing", () => {
    expect(mergeTimelineRefreshedFirstPage({ ...base, previousCursor: null }).keptOlderPages).toBe(
      false,
    );
    const empty = mergeTimelineRefreshedFirstPage({
      ...base,
      firstPageRows: [],
      firstPageCursor: null,
    });
    expect(empty.rows).toEqual([]);
    expect(empty.cursor).toBeNull();
  });

  it("orders tied timestamps by id and never duplicates a row", () => {
    const tiedA = note("a", N2.entry_at);
    const tiedB = note("b", N2.entry_at);
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousRows: [N1, tiedB, tiedA],
      previousCursor: { entryAt: tiedA.entry_at, id: tiedA.id },
      firstPageRows: [N1, tiedB],
      firstPageCursor: { entryAt: tiedB.entry_at, id: tiedB.id },
    });
    expect(merged.rows.map((row) => row.id)).toEqual(["n1", "b", "a"]);
  });

  it("carries only the hidden rows that are still off the refreshed page", () => {
    const hiddenOld = { id: "h-old", entry_at: N3.entry_at };
    const hiddenOnPage = { id: "h-page", entry_at: N0.entry_at };
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousHiddenRows: [hiddenOnPage, hiddenOld],
      firstPageHiddenRows: [hiddenOnPage],
    });
    expect(merged.hiddenRows.map((row) => row.id)).toEqual(["h-page", "h-old"]);
  });
});

describe("timelineHiddenFetchedRows", () => {
  it("returns fetched rows the projection did not show", () => {
    expect(timelineHiddenFetchedRows([N1, N2, N3], [N1, N3])).toEqual([
      { id: "n2", entry_at: N2.entry_at },
    ]);
    expect(timelineHiddenFetchedRows(null, [])).toEqual([]);
  });
});

describe("timelineActivityTruncationNotice", () => {
  it("is silent when the count is unknown or everything is loaded", () => {
    expect(timelineActivityTruncationNotice(100, null)).toBeNull();
    expect(timelineActivityTruncationNotice(100, 100)).toBeNull();
    expect(timelineActivityTruncationNotice(0, 0)).toBeNull();
  });

  it("names both numbers when older activity is not loaded", () => {
    expect(timelineActivityTruncationNotice(100, 250)).toBe(
      "Activity history below shows the newest 100 of 250 Quick Log events. Set a date range to see older activity.",
    );
  });
});

describe("Timeline paged history", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
    harness.entryEditOnDeleted = null;
    harness.activityPanelOnEntryChanged = null;
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

  it("keeps loaded older pages when a save refreshes the newest page", async () => {
    const server = serve({
      firstPage: [N1],
      total: 3,
      olderPages: { [N1.entry_at]: [N2], [N2.entry_at]: [N3] },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older"));
    expect(await screen.findByText("Note n2.")).toBeInTheDocument();

    // A Quick Log save lands: the newest page now leads with it.
    server.firstPage = [N0, N1];
    server.total = 4;
    act(() => {
      window.dispatchEvent(new Event("verdant:entry-created"));
    });

    expect(await screen.findByText("Note n0.")).toBeInTheDocument();
    expect(screen.getByText("Note n2.")).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(3);
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "showing 3 of 4 entries (3 loaded)",
    );
    expect(screen.getByTestId("timeline-load-older")).toHaveTextContent(
      "Load older entries (1 more)",
    );

    // Paging resumes from the oldest row still on screen, not from page one.
    fireEvent.click(screen.getByTestId("timeline-load-older"));
    expect(await screen.findByText("Note n3.")).toBeInTheDocument();
    expect(server.cursors).toEqual([N1.entry_at, N2.entry_at]);
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument(),
    );
  });

  it("lowers the remaining count when an entry is deleted from the edit dialog", async () => {
    serve({ firstPage: [N1, N1B], total: 3, olderPages: {} });

    renderTimeline();
    expect(await screen.findByTestId("timeline-load-older")).toHaveTextContent(
      "Load older entries (1 more)",
    );

    act(() => {
      harness.entryEditOnDeleted?.("n1b");
      // A repeated completion for the same entry must not count twice.
      harness.entryEditOnDeleted?.("n1b");
    });

    await waitFor(() => expect(screen.queryByText("Note n1b.")).not.toBeInTheDocument());
    expect(screen.getByTestId("timeline-load-older")).toHaveTextContent(
      "Load older entries (1 more)",
    );
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "showing 1 of 2 entries (1 loaded)",
    );
  });

  it("says so when older Quick Log activity is not loaded", async () => {
    serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: {
        rows: [
          {
            id: "event-1",
            grow_id: GROW_A.id,
            plant_id: "plant-1",
            tent_id: "tent-1",
            event_type: "note",
            occurred_at: "2026-10-14T09:00:00.000Z",
            source: "manual",
            notes: null,
            payload: {},
            is_deleted: false,
          },
        ],
        total: 250,
      },
    });

    renderTimeline();

    expect(await screen.findByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
      "Activity history below shows the newest 1 of 250 Quick Log events. Set a date range to see older activity.",
    );
  });

  it("shows no activity notice when every event is loaded", async () => {
    serve({ firstPage: [N1], total: 1, olderPages: {} });

    renderTimeline();

    expect(await screen.findByText("Note n1.")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-activity-truncation-notice")).not.toBeInTheDocument();
  });
  it("drops loaded older pages after a correction or retraction, so no stale row stays", async () => {
    const server = serve({
      firstPage: [N1],
      total: 3,
      olderPages: { [N1.entry_at]: [N2] },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older"));
    expect(await screen.findByText("Note n2.")).toBeInTheDocument();

    // The grower retracts n2 from a history panel. The server no longer
    // returns it; a reload of the newest page alone cannot know that.
    server.total = 2;
    server.olderPages = { [N1.entry_at]: [N3] };
    expect(harness.activityPanelOnEntryChanged).not.toBeNull();
    act(() => {
      harness.activityPanelOnEntryChanged?.();
    });

    await waitFor(() => expect(screen.queryByText("Note n2.")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(1);
    expect(screen.getByTestId("timeline-load-older")).toHaveTextContent(
      "Load older entries (1 more)",
    );

    // Paging starts again from the newest page and reads current rows.
    fireEvent.click(screen.getByTestId("timeline-load-older"));
    expect(await screen.findByText("Note n3.")).toBeInTheDocument();
    expect(screen.queryByText("Note n2.")).not.toBeInTheDocument();
  });
});
