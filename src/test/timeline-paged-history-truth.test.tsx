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
 * 4. Follow-up: older activity can be loaded a page at a time, and a refresh
 *    keeps the activity pages already loaded.
 *
 * Component tests render <Timeline /> against a mocked Supabase client.
 */
import { act, createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  appendTimelineOlderActivity,
  mergeTimelineRefreshedActivity,
  mergeTimelineRefreshedFirstPage,
  timelineActivityCursor,
  timelineActivityTotalAfterOlderPage,
  timelineActivityTruncationNotice,
  timelineHiddenFetchedRows,
  timelineLoadOlderActivityLabel,
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

function activity(id: string, occurredAt: string) {
  return {
    id,
    grow_id: GROW_A.id,
    plant_id: "plant-1",
    tent_id: "tent-1",
    event_type: "note",
    occurred_at: occurredAt,
    source: "manual",
    notes: null,
    payload: {},
    is_deleted: false,
  };
}

const E0 = activity("e0", "2026-10-15T09:00:00.000Z");
const E1 = activity("e1", "2026-10-14T09:00:00.000Z");
const E2 = activity("e2", "2026-10-13T09:00:00.000Z");
const E3 = activity("e3", "2026-10-12T09:00:00.000Z");

const N0 = note("n0", "2026-10-15T09:00:00.000Z");
const N1 = note("n1", "2026-10-14T09:00:00.000Z");
const N1B = note("n1b", "2026-10-14T08:00:00.000Z");
const N2 = note("n2", "2026-10-13T09:00:00.000Z");
const N3 = note("n3", "2026-10-12T09:00:00.000Z");

interface Server {
  firstPage: DiaryRow[];
  total: number;
  olderPages: Record<string, DiaryRow[]>;
  growEvents: {
    rows: unknown[];
    total: number;
    olderPages?: Record<string, unknown[]>;
    failOlder?: boolean;
    /** The older-activity request never settles. */
    pendingOlder?: boolean;
  };
  cursors: string[];
  activityCursors: string[];
}

function serve(
  initial: Omit<Server, "cursors" | "activityCursors" | "growEvents"> & Partial<Server>,
): Server {
  const server: Server = {
    growEvents: { rows: [], total: 0 },
    cursors: [],
    activityCursors: [],
    ...initial,
  };
  harness.executeQuery.mockImplementation((spec: QuerySpec) => {
    if (spec.table === "grow_events") {
      const activityKeyset = spec.filters.find((filter) => filter.op === "or");
      const activityMatch = activityKeyset
        ? /^occurred_at\.lt\."([^"]+)"/.exec(String(activityKeyset.value))
        : null;
      if (activityMatch) {
        server.activityCursors.push(activityMatch[1]);
        if (server.growEvents.pendingOlder) return new Promise(() => {});
        if (server.growEvents.failOlder) return { data: null, error: { message: "read failed" } };
        return { data: server.growEvents.olderPages?.[activityMatch[1]] ?? [], error: null };
      }
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
    // The server counted two rows before and three now: N0 is the one new row.
    previousServerCount: 2,
    firstPageServerCount: 3,
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
      firstPageHiddenRows: [{ id: "h", entry_at: N0.entry_at }],
      // N0 and N1 are both new to this page.
      firstPageServerCount: 4,
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
      previousServerCount: 3,
      firstPageServerCount: 3,
    });
    expect(merged.keptOlderPages).toBe(true);
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

  it("replaces when the server counts a new row the refreshed page does not hold", () => {
    // A save backdated between two loaded pages: the count grew by one, the
    // refreshed page holds no new row, so the new row sits behind the kept
    // cursor and would never be fetched.
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      firstPageRows: [N1],
      firstPageCursor: { entryAt: N1.entry_at, id: N1.id },
      previousServerCount: 3,
      firstPageServerCount: 4,
    });
    expect(merged.rows.map((row) => row.id)).toEqual(["n1"]);
    expect(merged.cursor).toEqual({ entryAt: N1.entry_at, id: N1.id });
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces when a new row is on the refreshed page and another is not", () => {
    const merged = mergeTimelineRefreshedFirstPage({ ...base, firstPageServerCount: 4 });
    expect(merged.rows.map((row) => row.id)).toEqual(["n0", "n1"]);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces when the server count fell, so a kept row may be gone", () => {
    const merged = mergeTimelineRefreshedFirstPage({ ...base, firstPageServerCount: 2 });
    expect(merged.keptOlderPages).toBe(false);
  });

  it("counts a new hidden row on the refreshed page as accounted for", () => {
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      firstPageHiddenRows: [{ id: "h-new", entry_at: N0.entry_at }],
      firstPageServerCount: 4,
    });
    expect(merged.keptOlderPages).toBe(true);
  });

  it("replaces when a row on the refreshed page is loaded at a different time", () => {
    // Another device corrected b from 05:00 to 11:00, then a local save added
    // n. The count grew by one and n is the one new row, so the count alone
    // reconciles; keeping the older page would show b twice.
    const at = (hour: string) => `2026-10-14T${hour}:00:00.000Z`;
    const [a, b, c, d] = [
      note("a", at("04")),
      note("b", at("05")),
      note("c", at("09")),
      note("d", at("10")),
    ];
    const merged = mergeTimelineRefreshedFirstPage({
      sameScope: true,
      previousRows: [d, c, b, a],
      previousCursor: { entryAt: a.entry_at, id: a.id },
      previousHiddenRows: [],
      firstPageRows: [note("n", at("12")), note("b", at("11")), d],
      firstPageCursor: { entryAt: d.entry_at, id: d.id },
      firstPageHiddenRows: [],
      previousServerCount: 4,
      firstPageServerCount: 5,
    });
    expect(merged.keptOlderPages).toBe(false);
    expect(merged.rows.map((row) => row.id)).toEqual(["n", "b", "d"]);
    expect(merged.cursor).toEqual({ entryAt: d.entry_at, id: d.id });
  });

  it("replaces when a loaded row inside the refreshed page's range is missing from it", () => {
    // Another device corrected d from 10:00 down to 03:00, then a local save
    // added n. d belongs on the refreshed page by its loaded time but is not
    // there, so what is on screen for it is stale.
    const at = (hour: string) => `2026-10-14T${hour}:00:00.000Z`;
    const [a, b, c, d] = [
      note("a", at("04")),
      note("b", at("05")),
      note("c", at("09")),
      note("d", at("10")),
    ];
    const merged = mergeTimelineRefreshedFirstPage({
      sameScope: true,
      previousRows: [d, c, b, a],
      previousCursor: { entryAt: a.entry_at, id: a.id },
      previousHiddenRows: [],
      firstPageRows: [note("n", at("12")), c, b],
      firstPageCursor: { entryAt: b.entry_at, id: b.id },
      firstPageHiddenRows: [],
      previousServerCount: 4,
      firstPageServerCount: 5,
    });
    expect(merged.keptOlderPages).toBe(false);
    expect(merged.rows.map((row) => row.id)).toEqual(["n", "c", "b"]);
  });

  it("replaces when a hidden loaded row inside the refreshed range is missing from it", () => {
    const merged = mergeTimelineRefreshedFirstPage({
      ...base,
      previousHiddenRows: [{ id: "h", entry_at: N0.entry_at }],
      previousServerCount: 3,
      firstPageServerCount: 4,
    });
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces when either server count is unknown", () => {
    expect(
      mergeTimelineRefreshedFirstPage({ ...base, previousServerCount: null }).keptOlderPages,
    ).toBe(false);
    expect(
      mergeTimelineRefreshedFirstPage({ ...base, firstPageServerCount: null }).keptOlderPages,
    ).toBe(false);
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
      "Activity history below shows the newest 100 of 250 Quick Log events. Load older activity, or set a date range.",
    );
  });
});

describe("activity paging rules", () => {
  it("takes the oldest row as the cursor, breaking ties by id", () => {
    expect(timelineActivityCursor([])).toBeNull();
    expect(timelineActivityCursor([E1, E3, E2])).toEqual({ entryAt: E3.occurred_at, id: "e3" });
    const tiedA = activity("a", E2.occurred_at);
    const tiedB = activity("b", E2.occurred_at);
    expect(timelineActivityCursor([tiedB, tiedA])).toEqual({ entryAt: E2.occurred_at, id: "a" });
  });

  it("appends an older page without duplicating a row", () => {
    expect(appendTimelineOlderActivity([E1, E2], [E2, E3]).map((row) => row.id)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
  });

  it("keeps older activity when the refreshed page overlaps it", () => {
    const merged = mergeTimelineRefreshedActivity({
      sameScope: true,
      previousRows: [E1, E2, E3],
      firstPageRows: [E0, E1],
      previousServerCount: 3,
      firstPageServerCount: 4,
    });
    expect(merged.keptOlderPages).toBe(true);
    expect(merged.rows.map((row) => row.id)).toEqual(["e0", "e1", "e2", "e3"]);
  });

  it("replaces the activity for another scope or when the pages do not meet", () => {
    expect(
      mergeTimelineRefreshedActivity({
        sameScope: false,
        previousRows: [E1, E2, E3],
        firstPageRows: [E0, E1],
        previousServerCount: 3,
        firstPageServerCount: 4,
      }).rows.map((row) => row.id),
    ).toEqual(["e0", "e1"]);
    // Everything loaded is older than the refreshed page: rows in between
    // were never fetched, so the older rows must not be kept.
    expect(
      mergeTimelineRefreshedActivity({
        sameScope: true,
        previousRows: [E2, E3],
        firstPageRows: [E0],
        previousServerCount: 2,
        firstPageServerCount: 3,
      }).rows.map((row) => row.id),
    ).toEqual(["e0"]);
  });

  it("drops a row the refreshed page no longer returns", () => {
    const merged = mergeTimelineRefreshedActivity({
      sameScope: true,
      previousRows: [E0, E1, E2, E3],
      firstPageRows: [E0, E2],
      previousServerCount: 4,
      firstPageServerCount: 3,
    });
    // The count fell, so no older row is kept: any of them may be the one gone.
    expect(merged.rows.map((row) => row.id)).toEqual(["e0", "e2"]);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("replaces the activity when the server counts an event the refreshed page does not hold", () => {
    // An event backdated between two loaded activity pages.
    const merged = mergeTimelineRefreshedActivity({
      sameScope: true,
      previousRows: [E1, E2, E3],
      firstPageRows: [E1],
      previousServerCount: 3,
      firstPageServerCount: 4,
    });
    expect(merged.rows.map((row) => row.id)).toEqual(["e1"]);
    expect(merged.keptOlderPages).toBe(false);
  });

  it("stops offering more when an older page comes back empty", () => {
    expect(timelineActivityTotalAfterOlderPage(250, 100, 0)).toBe(100);
    expect(timelineActivityTotalAfterOlderPage(250, 200, 100)).toBe(250);
    expect(timelineActivityTotalAfterOlderPage(150, 200, 100)).toBe(200);
    expect(timelineActivityTotalAfterOlderPage(null, 200, 100)).toBeNull();
  });

  it("labels the button with what is left", () => {
    expect(timelineLoadOlderActivityLabel(100, 250, false)).toBe("Load older activity (150 more)");
    expect(timelineLoadOlderActivityLabel(100, 250, true)).toBe("Loading older activity…");
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
      "Activity history below shows the newest 1 of 250 Quick Log events. Load older activity, or set a date range.",
    );
  });

  it("shows no activity notice when every event is loaded", async () => {
    serve({ firstPage: [N1], total: 1, olderPages: {} });

    renderTimeline();

    expect(await screen.findByText("Note n1.")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-activity-truncation-notice")).not.toBeInTheDocument();
  });
  it("loads older activity a page at a time", async () => {
    const server = serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: {
        rows: [E0, E1],
        total: 4,
        olderPages: { [E1.occurred_at]: [E2], [E2.occurred_at]: [E3] },
      },
    });

    renderTimeline();

    expect(await screen.findByTestId("timeline-load-older-activity")).toHaveTextContent(
      "Load older activity (2 more)",
    );
    fireEvent.click(screen.getByTestId("timeline-load-older-activity"));
    expect(await screen.findByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
      "newest 3 of 4 Quick Log events",
    );

    fireEvent.click(screen.getByTestId("timeline-load-older-activity"));
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older-activity")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("timeline-activity-truncation-notice")).not.toBeInTheDocument();
    expect(server.activityCursors).toEqual([E1.occurred_at, E2.occurred_at]);
  });

  it("keeps loaded older activity when a save refreshes the newest page", async () => {
    const server = serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: {
        rows: [E1],
        total: 3,
        olderPages: { [E1.occurred_at]: [E2], [E2.occurred_at]: [E3] },
      },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older-activity"));
    expect(await screen.findByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
      "newest 2 of 3 Quick Log events",
    );

    // A Quick Log save lands: the newest activity page now leads with it.
    server.growEvents.rows = [E0, E1];
    server.growEvents.total = 4;
    act(() => {
      window.dispatchEvent(new Event("verdant:entry-created"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
        "newest 3 of 4 Quick Log events",
      ),
    );

    // Paging resumes from the oldest activity still loaded, not from page one.
    fireEvent.click(screen.getByTestId("timeline-load-older-activity"));
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older-activity")).not.toBeInTheDocument(),
    );
    expect(server.activityCursors).toEqual([E1.occurred_at, E2.occurred_at]);
  });

  it("says so and keeps what is shown when older activity fails to load", async () => {
    const server = serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: { rows: [E1], total: 3, failOlder: true },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older-activity"));

    expect(await screen.findByTestId("timeline-load-older-activity-error")).toHaveTextContent(
      "Older activity could not be loaded. The activity already shown is unchanged.",
    );
    expect(screen.getByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
      "newest 1 of 3 Quick Log events",
    );

    server.growEvents.failOlder = false;
    server.growEvents.olderPages = { [E1.occurred_at]: [E2, E3] };
    fireEvent.click(screen.getByTestId("timeline-load-older-activity-retry"));
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older-activity-error")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older-activity")).not.toBeInTheDocument(),
    );
  });

  it("stops offering more when the server has no older activity left", async () => {
    serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: { rows: [E1], total: 3, olderPages: {} },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older-activity"));

    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older-activity")).not.toBeInTheDocument(),
    );
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
  it("drops loaded older activity after a correction or retraction", async () => {
    const server = serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: { rows: [E1], total: 3, olderPages: { [E1.occurred_at]: [E2] } },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older-activity"));
    expect(await screen.findByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
      "newest 2 of 3 Quick Log events",
    );

    // e2 is retracted from a history panel: the server now counts two.
    server.growEvents.total = 2;
    act(() => {
      harness.activityPanelOnEntryChanged?.();
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline-activity-truncation-notice")).toHaveTextContent(
        "newest 1 of 2 Quick Log events",
      ),
    );
  });

  it("does not leave the activity pager stuck when a refresh overtakes its request", async () => {
    const server = serve({
      firstPage: [N1],
      total: 1,
      olderPages: {},
      growEvents: { rows: [E1], total: 3, pendingOlder: true },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older-activity"));
    await waitFor(() =>
      expect(screen.getByTestId("timeline-load-older-activity")).toHaveTextContent(
        "Loading older activity…",
      ),
    );

    // A save lands while the older-activity request is still in flight.
    server.growEvents.rows = [E0, E1];
    server.growEvents.total = 4;
    act(() => {
      window.dispatchEvent(new Event("verdant:entry-created"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline-load-older-activity")).toHaveTextContent(
        "Load older activity (2 more)",
      ),
    );
    expect(screen.getByTestId("timeline-load-older-activity")).not.toBeDisabled();
  });

  it("shows a save backdated between loaded pages and never strands the pager", async () => {
    const server = serve({
      firstPage: [N1],
      total: 3,
      olderPages: { [N1.entry_at]: [N2], [N2.entry_at]: [N3] },
    });

    renderTimeline();
    fireEvent.click(await screen.findByTestId("timeline-load-older"));
    expect(await screen.findByText("Note n2.")).toBeInTheDocument();

    // A Quick Log save with an earlier "Reading time" lands between n1 and
    // n2. The newest page is unchanged; only the count grows.
    server.total = 4;
    server.olderPages = {
      [N1.entry_at]: [N1B],
      [N1B.entry_at]: [N2],
      [N2.entry_at]: [N3],
    };
    act(() => {
      window.dispatchEvent(new Event("verdant:entry-created"));
    });

    // The loaded older page cannot be trusted, so paging starts again.
    await waitFor(() =>
      expect(screen.getByTestId("timeline-load-older")).toHaveTextContent(
        "Load older entries (3 more)",
      ),
    );
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(1);

    for (const text of ["Note n1b.", "Note n2.", "Note n3."]) {
      fireEvent.click(screen.getByTestId("timeline-load-older"));
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(4);
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument(),
    );
    expect(server.cursors).toEqual([N1.entry_at, N1.entry_at, N1B.entry_at, N2.entry_at]);
  });
});
