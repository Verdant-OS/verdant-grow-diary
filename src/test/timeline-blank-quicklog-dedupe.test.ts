import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { dropBlankQuickLogPlaceholderRows } from "@/lib/timelineQuickLogPlaceholderDedupeRules";

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

const photo = {
  id: "photo-1",
  note: "Photo attached from Quick Log.",
  photo_url: "https://example.test/leaf.jpg",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-10-14T14:47:00.000Z",
  details: { linked_grow_event_id: "event-1" },
};

const blank = {
  id: "blank-1",
  note: "(quick log)",
  photo_url: null,
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-10-14T14:47:05.000Z",
  details: { linked_grow_event_id: "event-1" },
};

describe("dropBlankQuickLogPlaceholderRows", () => {
  it("drops the blank quick-log mirror when details.linked_grow_event_id matches", () => {
    const kept = dropBlankQuickLogPlaceholderRows([photo, blank]);
    expect(kept.map((row) => row.id)).toEqual(["photo-1"]);
  });

  it("keeps a placeholder when details.linked_grow_event_id is missing on one row", () => {
    const unlinkedPhoto = { ...photo, details: {} };
    const kept = dropBlankQuickLogPlaceholderRows([unlinkedPhoto, blank]);
    expect(kept.map((row) => row.id)).toEqual(["photo-1", "blank-1"]);
  });

  it("keeps a placeholder when details.linked_grow_event_id differs", () => {
    const otherSaveBlank = {
      ...blank,
      id: "blank-other-save",
      details: { linked_grow_event_id: "event-2" },
    };
    const kept = dropBlankQuickLogPlaceholderRows([photo, otherSaveBlank]);
    expect(kept.map((row) => row.id)).toEqual(["photo-1", "blank-other-save"]);
  });

  it("keeps a lone placeholder when no photo companion exists", () => {
    const kept = dropBlankQuickLogPlaceholderRows([blank]);
    expect(kept.map((row) => row.id)).toEqual(["blank-1"]);
  });

  it("keeps a placeholder written for a different tent", () => {
    const otherTent = { ...blank, id: "blank-other", tent_id: "tent-9", plant_id: "plant-9" };
    const kept = dropBlankQuickLogPlaceholderRows([photo, otherTent]);
    expect(kept.map((row) => row.id).sort()).toEqual(["blank-other", "photo-1"]);
  });
});

describe("Timeline rendered blank quick-log deduplication", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockResolvedValue({ data: [], error: null });
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

  it("hides the blank quick-log mirror next to its photo and excludes its stage from stage counts", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              ...photo,
              stage: "vegetative",
              details: {
                event_type: "quicklog_photo_attachment",
                source: "manual",
                linked_grow_event_id: "event-1",
              },
            },
            {
              ...blank,
              stage: "flowering",
              details: {
                event_type: "observation",
                source: "manual",
                linked_grow_event_id: "event-1",
              },
            },
          ],
          error: null,
          count: 2,
        };
      }
      return { data: [], error: null };
    });

    render(createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)));

    expect(await screen.findByText("Photo attached from Quick Log.")).toBeInTheDocument();
    expect(screen.queryByText("(quick log)")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(1);
    expect(screen.getByText("1 stage-tagged log")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Flowering\b/i })).toBeDisabled();
  });
});
