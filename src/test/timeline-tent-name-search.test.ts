/**
 * A tent name shown from the directory must also match Timeline keyword search
 * when the diary row has tent_id and no details.tent_name.
 */
import { createElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterTimelineEvidenceRows } from "@/lib/timelineEvidenceFilterRules";

interface QueryFilter {
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  columns: string;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-01-01T00:00:00.000Z",
};

const ROW = {
  id: "row-1",
  note: "QA text note: leaves look healthy",
  photo_url: null,
  stage: "vegetative",
  plant_id: null,
  tent_id: "tent-1",
  entry_at: "2026-07-15T12:00:00.000Z",
  details: { event_type: "note" },
};

const OTHER_ROW = {
  id: "row-2",
  note: "Other tent note: canopy check",
  photo_url: null,
  stage: "vegetative",
  plant_id: null,
  tent_id: "tent-2",
  entry_at: "2026-07-15T11:00:00.000Z",
  details: { event_type: "note" },
};

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn<(spec: QuerySpec) => Promise<QueryResult> | QueryResult>(),
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, columns: "*", filters: [] };
    const query = {
      select(columns = "*") {
        spec.columns = columns;
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
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const snapshot: QuerySpec = {
          table,
          columns: spec.columns,
          filters: spec.filters.map((f) => ({ ...f })),
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
          createSignedUrls: async () => ({ data: [], error: null }),
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
    activeGrow: GROW_A,
    activeGrowId: GROW_A.id,
    grows: [GROW_A],
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
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

describe("timeline search includes the resolved tent name", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
  });

  it("keeps rows whose tent name comes only from the directory", () => {
    const kept = filterTimelineEvidenceRows([ROW], {
      query: "QA Tent Alpha",
      tentNamesById: new Map([["tent-1", "QA Tent Alpha"]]),
    });
    expect(kept.map((row) => row.id)).toEqual(["row-1"]);
  });

  it("returns a tent's diary entries when searching its tent name, including after tent names load late", async () => {
    let resolveTentDirectory!: (result: QueryResult) => void;
    const tentDirectoryPromise = new Promise<QueryResult>((resolve) => {
      resolveTentDirectory = resolve;
    });

    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        return { data: [ROW, OTHER_ROW], error: null, count: 2 };
      }
      if (spec.table === "plants") {
        return { data: null, error: { message: "plants lookup unavailable" } };
      }
      if (spec.table === "tents" && spec.columns.includes("name")) {
        return tentDirectoryPromise;
      }
      return { data: [], error: null };
    });

    render(createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)));

    await screen.findByText(ROW.note);
    expect(screen.getByText(OTHER_ROW.note)).toBeInTheDocument();

    const searchInput = screen.getByTestId("timeline-search-input");
    fireEvent.change(searchInput, { target: { value: "QA Tent Alpha" } });

    await waitFor(() => {
      expect(screen.queryByText(ROW.note)).toBeNull();
    });
    expect(screen.queryByText(OTHER_ROW.note)).toBeNull();

    await act(async () => {
      resolveTentDirectory({
        data: [
          { id: "tent-1", name: "QA Tent Alpha", grow_id: GROW_A.id },
          { id: "tent-2", name: "Veg Tent Beta", grow_id: GROW_A.id },
        ],
        error: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-tent-filter")).toHaveTextContent("QA Tent Alpha (1)");
    });

    expect(await screen.findByText(ROW.note)).toBeInTheDocument();
    expect(screen.queryByText(OTHER_ROW.note)).toBeNull();

    fireEvent.change(searchInput, { target: { value: "Veg Tent Beta" } });

    expect(await screen.findByText(OTHER_ROW.note)).toBeInTheDocument();
    expect(screen.queryByText(ROW.note)).toBeNull();
  });
});
