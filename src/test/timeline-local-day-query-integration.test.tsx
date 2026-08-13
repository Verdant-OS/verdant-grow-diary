/**
 * Timeline local-day query integration (issue #587).
 *
 * Proves the mounted presenter — not just the pure `timelineDateRangeRules`
 * helper — issues identical local-day ISO bounds to the initial diary
 * query, the initial grow-event query, and `loadOlder()`'s keyset page,
 * and that a row sitting exactly on a local-day boundary is included or
 * excluded exactly as the grower would expect from the rendered date.
 *
 * The whole file runs with the process timezone pinned to America/Chicago
 * (hoisted before `Timeline.tsx` is first imported, so its module-level
 * `TIMELINE_LOCAL_TIME_ZONE` capture agrees with it too) and restored
 * afterward so it cannot leak into another test file.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryFilter {
  op: "eq" | "is" | "gte" | "lte" | "lt";
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
vi.mock("@/components/TimelineSensorSourceBadge", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));
vi.mock("@/components/SymptomEvidenceChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/TimelineLightingGuideCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-01-01T00:00:00.000Z",
};

// The exact America/Chicago (CDT, UTC-5) local-day bounds for 2026-07-15,
// independently confirmed by the pure-rules test suite.
const LOCAL_DAY_START_ISO = "2026-07-15T05:00:00.000Z";
const LOCAL_DAY_END_ISO = "2026-07-16T04:59:59.999Z";

function diaryRow(id: string, entryAt: string, note = "note") {
  return {
    id,
    note,
    photo_url: null,
    stage: "vegetative",
    details: { event_type: "note" },
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
}

function findFilter(spec: QuerySpec | undefined, op: QueryFilter["op"], column: string) {
  return spec?.filters.find((f) => f.op === op && f.column === column)?.value;
}

/** Mimics Supabase's `.gte()/.lte()` over an ISO-8601 UTC timestamp column via lexicographic string comparison (valid for consistently-formatted ISO instants). */
function withinBounds(timestamp: string, spec: QuerySpec, column: string): boolean {
  for (const f of spec.filters) {
    if (f.column !== column) continue;
    const bound = f.value as string;
    if (f.op === "gte" && !(timestamp >= bound)) return false;
    if (f.op === "lte" && !(timestamp <= bound)) return false;
    if (f.op === "lt" && !(timestamp < bound)) return false;
  }
  return true;
}

function renderTimeline(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Timeline />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe-location-search">{location.search}</output>;
}

describe("Timeline local-day query integration (America/Chicago)", () => {
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
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") return { data: [], error: null, count: 0 };
      return { data: [], error: null };
    });
  });

  it("the initial diary query and the initial grow-event query receive the exact same local-day ISO bounds", async () => {
    renderTimeline("/timeline?start=2026-07-15&end=2026-07-15");

    await waitFor(() => {
      expect(harness.capturedQueries.some((q) => q.table === "diary_entries")).toBe(true);
      expect(harness.capturedQueries.some((q) => q.table === "grow_events")).toBe(true);
    });

    const diarySpec = harness.capturedQueries.find((q) => q.table === "diary_entries");
    const growEventSpec = harness.capturedQueries.find((q) => q.table === "grow_events");

    expect(findFilter(diarySpec, "gte", "entry_at")).toBe(LOCAL_DAY_START_ISO);
    expect(findFilter(diarySpec, "lte", "entry_at")).toBe(LOCAL_DAY_END_ISO);
    expect(findFilter(growEventSpec, "gte", "occurred_at")).toBe(LOCAL_DAY_START_ISO);
    expect(findFilter(growEventSpec, "lte", "occurred_at")).toBe(LOCAL_DAY_END_ISO);
  });

  it("loadOlder() issues the identical local-day bounds as the initial page", async () => {
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        if (spec.filters.some((f) => f.op === "lt" && f.column === "entry_at")) {
          return { data: [], error: null };
        }
        return {
          data: [diaryRow("e1", "2026-07-15T20:00:00.000Z")],
          error: null,
          count: 2,
        };
      }
      return { data: [], error: null };
    });

    renderTimeline("/timeline?start=2026-07-15&end=2026-07-15");

    const olderButton = await screen.findByTestId("timeline-load-older");
    harness.capturedQueries.length = 0;
    fireEvent.click(olderButton);

    await waitFor(() => {
      const pageSpec = harness.capturedQueries.find(
        (q) => q.table === "diary_entries" && q.filters.some((f) => f.op === "lt"),
      );
      expect(pageSpec).toBeDefined();
      expect(findFilter(pageSpec, "gte", "entry_at")).toBe(LOCAL_DAY_START_ISO);
      expect(findFilter(pageSpec, "lte", "entry_at")).toBe(LOCAL_DAY_END_ISO);
    });
  });

  describe("boundary inclusion/exclusion for the selected local day", () => {
    const cases: Array<{ name: string; entryAt: string; included: boolean }> = [
      {
        name: "exactly at local midnight (day start)",
        entryAt: LOCAL_DAY_START_ISO,
        included: true,
      },
      {
        name: "exactly at the final local millisecond (day end)",
        entryAt: LOCAL_DAY_END_ISO,
        included: true,
      },
      {
        name: "one millisecond before local midnight",
        entryAt: "2026-07-15T04:59:59.999Z",
        included: false,
      },
      { name: "the next local midnight", entryAt: "2026-07-16T05:00:00.000Z", included: false },
    ];

    for (const { name, entryAt, included } of cases) {
      it(`a row ${name} is ${included ? "included" : "excluded"}`, async () => {
        harness.executeQuery.mockImplementation((spec) => {
          if (spec.table !== "diary_entries") return { data: [], error: null };
          const row = diaryRow("boundary-row", entryAt, "boundary marker entry");
          const rows = withinBounds(entryAt, spec, "entry_at") ? [row] : [];
          return { data: rows, error: null, count: rows.length };
        });

        renderTimeline("/timeline?start=2026-07-15&end=2026-07-15");

        if (included) {
          await screen.findByText("boundary marker entry");
        } else {
          await waitFor(() => expect(screen.queryByTestId("timeline-results-count")).toBeNull());
          expect(screen.queryByText("boundary marker entry")).toBeNull();
        }
      });
    }
  });

  it("keeps the URL date values as plain YYYY-MM-DD, never an ISO instant", async () => {
    renderTimeline("/timeline?start=2026-07-15&end=2026-07-15");
    await waitFor(() => expect(harness.capturedQueries.length).toBeGreaterThan(0));

    const search = (await screen.findByTestId("probe-location-search")).textContent ?? "";
    expect(search).toContain("start=2026-07-15");
    expect(search).toContain("end=2026-07-15");
    expect(search).not.toMatch(/T\d{2}%3A|T\d{2}:/);
  });

  it("an invalid date issues no date bound at all", async () => {
    renderTimeline("/timeline?start=2026-02-30&end=2026-07-20");

    await waitFor(() => {
      expect(harness.capturedQueries.some((q) => q.table === "diary_entries")).toBe(true);
    });

    const diarySpec = harness.capturedQueries.find((q) => q.table === "diary_entries");
    expect(findFilter(diarySpec, "gte", "entry_at")).toBeUndefined();
    // endDate alone, without a valid startDate, still applies as an upper bound —
    // only the malformed side collapses to "no constraint".
    expect(findFilter(diarySpec, "lte", "entry_at")).toBeDefined();
  });

  it("an inverted range issues no date bound at all", async () => {
    renderTimeline("/timeline?start=2026-07-20&end=2026-07-10");

    await waitFor(() => {
      expect(harness.capturedQueries.some((q) => q.table === "diary_entries")).toBe(true);
    });

    const diarySpec = harness.capturedQueries.find((q) => q.table === "diary_entries");
    expect(findFilter(diarySpec, "gte", "entry_at")).toBeUndefined();
    expect(findFilter(diarySpec, "lte", "entry_at")).toBeUndefined();
    expect(await screen.findByTestId("timeline-date-range-error")).toBeInTheDocument();
  });

  it("never calls a Supabase mutation method", async () => {
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        return { data: [diaryRow("e1", "2026-07-15T12:00:00.000Z")], error: null, count: 1 };
      }
      return { data: [], error: null };
    });

    renderTimeline("/timeline?start=2026-07-15&end=2026-07-15");
    await screen.findByText("note");

    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.delete).not.toHaveBeenCalled();
    expect(harness.upsert).not.toHaveBeenCalled();
  });
});
