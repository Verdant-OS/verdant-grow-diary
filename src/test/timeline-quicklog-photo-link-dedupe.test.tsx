import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { dropBlankQuickLogPlaceholderRows } from "@/lib/timelineQuickLogPlaceholderDedupeRules";
import { collapseQuickLogSaveFanOut } from "@/lib/timelineMergeRules";
import { buildQuickLogPhotoDiaryEntryRow } from "@/lib/quickLogPhotoDiaryEntry";

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

describe("photo-row link derivation", () => {
  it("drops the mirror when the photo row's object path matches details.photo_url", () => {
    const built = buildQuickLogPhotoDiaryEntryRow({
      ownerId: "owner-1",
      growId: "grow-a",
      tentId: "tent-1",
      plantId: "plant-1",
      photoPath: "https://example.test/leaf.jpg",
      noteRaw: "",
      action: "water",
      now: () => new Date("2026-10-14T14:47:00.000Z"),
    });
    const photoRow = {
      id: "photo-real",
      note: built.note,
      photo_url: built.photo_url,
      plant_id: built.plant_id,
      tent_id: built.tent_id,
      entry_at: built.entry_at,
      details: built.details,
    };
    const mirror = {
      ...blank,
      details: { linked_grow_event_id: "event-1", photo_url: built.photo_url },
    };
    expect(photoRow.details).not.toHaveProperty("linked_grow_event_id");
    const kept = dropBlankQuickLogPlaceholderRows([photoRow, mirror]);
    expect(kept.map((row) => row.id)).toEqual(["photo-real"]);
  });

  it("keeps a blank quick log when neither row has a linked id", () => {
    const unlinkedPhoto = { ...photo, details: {} };
    const unlinkedBlank = { ...blank, id: "blank-unlinked", details: {} };
    const kept = dropBlankQuickLogPlaceholderRows([unlinkedPhoto, unlinkedBlank]);
    expect(kept.map((row) => row.id).sort()).toEqual(["blank-unlinked", "photo-1"]);
  });

  it("keeps an unlinked photo when the timeline collapse has its grow event", () => {
    const built = buildQuickLogPhotoDiaryEntryRow({
      ownerId: "owner-1",
      growId: "grow-a",
      tentId: "tent-1",
      plantId: "plant-1",
      photoPath: "user-1/grow-a/leaf.jpg",
      noteRaw: "",
      action: "water",
      extraDetails: { linked_grow_event_id: "event-1", grow_event_id: "event-1" },
      now: () => new Date("2026-10-14T14:47:00.000Z"),
    });
    const collapsed = collapseQuickLogSaveFanOut({
      diaryEntries: [
        {
          id: "photo-real",
          entry_at: built.entry_at,
          plant_id: built.plant_id,
          photo_url: built.photo_url,
          note: built.note,
          details: built.details,
        },
        {
          id: "linked-companion",
          entry_at: built.entry_at,
          plant_id: "plant-1",
          note: "(quick log)",
          details: { linked_grow_event_id: "event-1" },
        },
      ],
      growEvents: [
        {
          id: "event-1",
          source: "manual",
          is_deleted: false,
          plant_id: "plant-1",
          occurred_at: "2026-10-14T14:46:00.000Z",
        },
      ],
    });
    expect(collapsed.diaryEntries.map((row) => row.id)).toEqual(["photo-real"]);
    expect(collapsed.droppedCompanionsBySpineId.get("event-1")?.map((row) => row.id)).toEqual([
      "linked-companion",
    ]);
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

  it("hides the mirror beside the photo row written for that save", async () => {
    const built = buildQuickLogPhotoDiaryEntryRow({
      ownerId: "owner-1",
      growId: "grow-a",
      tentId: "tent-1",
      plantId: "plant-1",
      photoPath: "https://example.test/leaf.jpg",
      noteRaw: "",
      action: "water",
      now: () => new Date("2026-10-14T14:47:00.000Z"),
    });
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "photo-real",
              note: built.note,
              photo_url: built.photo_url,
              plant_id: built.plant_id,
              tent_id: built.tent_id,
              entry_at: built.entry_at,
              stage: "vegetative",
              details: built.details,
            },
            {
              id: "blank-1",
              note: "(quick log)",
              photo_url: null,
              plant_id: "plant-1",
              tent_id: "tent-1",
              entry_at: "2026-10-14T14:47:05.000Z",
              stage: "vegetative",
              details: {
                event_type: "observation",
                source: "manual",
                linked_grow_event_id: "event-1",
                photo_url: built.photo_url,
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
  });

  it("keeps a blank quick log rendered next to a photo when neither row has an id", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              ...photo,
              stage: "vegetative",
              details: { event_type: "quicklog_photo_attachment", source: "manual" },
            },
            {
              ...blank,
              stage: "vegetative",
              details: { event_type: "observation", source: "manual" },
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
    expect(screen.getByText("(quick log)")).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(2);
  });
});
