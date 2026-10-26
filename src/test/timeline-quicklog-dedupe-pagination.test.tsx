/**
 * #2094 follow-up (Codex exact-head P2 at d8aad955c): Timeline drops the blank
 * Quick Log mirror from each fetched diary page, but pagination compared the
 * server's raw `count` with the filtered rows and paged from the oldest kept
 * row. One photo plus its mirror left "Load older entries (1 more)" on screen
 * forever. These tests render <Timeline /> and pin that the control clears
 * once every fetched row is accounted for, and stays while more pages exist.
 */
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { projectTimelineDiaryPage } from "@/lib/timelineQuickLogPlaceholderDedupeRules";

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

/** One photo Quick Log save: the photo row plus the blank RPC mirror, mirror older. */
function photoSave(key: string, photoAt: string, mirrorAt: string): [DiaryRow, DiaryRow] {
  return [
    {
      id: `photo-${key}`,
      note: `Photo ${key} from Quick Log.`,
      photo_url: `https://example.test/${key}.jpg`,
      plant_id: "plant-1",
      tent_id: "tent-1",
      entry_at: photoAt,
      stage: "vegetative",
      details: {
        event_type: "quicklog_photo_attachment",
        source: "manual",
        linked_grow_event_id: `event-${key}`,
      },
    },
    {
      id: `mirror-${key}`,
      note: "(quick log)",
      photo_url: null,
      plant_id: "plant-1",
      tent_id: "tent-1",
      entry_at: mirrorAt,
      stage: "vegetative",
      details: {
        event_type: "observation",
        source: "manual",
        linked_grow_event_id: `event-${key}`,
      },
    },
  ];
}

const PAGE_A = photoSave("a", "2026-10-14T14:47:05.000Z", "2026-10-14T14:47:00.000Z");
const PAGE_B = photoSave("b", "2026-10-13T10:00:05.000Z", "2026-10-13T10:00:00.000Z");
const PAGE_C: DiaryRow[] = [
  {
    id: "plain-c",
    note: "Plain older note.",
    photo_url: null,
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-10-12T09:00:00.000Z",
    stage: "vegetative",
    details: { event_type: "observation", source: "manual" },
  },
];

/**
 * Serves the newest page for the counted read and an older page per `lt`
 * cursor. Every cursor the Timeline sends is recorded.
 */
function serveDiaryPages(total: number, olderPages: Record<string, DiaryRow[]>): string[] {
  const cursors: string[] = [];
  harness.executeQuery.mockImplementation((spec: QuerySpec) => {
    if (spec.table !== "diary_entries") return { data: [], error: null };
    const lt = spec.filters.find((filter) => filter.op === "lt" && filter.column === "entry_at");
    if (!lt) return { data: PAGE_A, error: null, count: total };
    const cursor = String(lt.value);
    cursors.push(cursor);
    return { data: olderPages[cursor] ?? [], error: null };
  });
  return cursors;
}

function renderTimeline() {
  render(createElement(MemoryRouter, { initialEntries: ["/timeline"] }, createElement(Timeline)));
}

describe("projectTimelineDiaryPage", () => {
  it("hides the linked mirror, counts it, and keeps the raw oldest timestamp as the cursor", () => {
    const fetched = [...PAGE_A];
    const before = JSON.stringify(fetched);
    const first = projectTimelineDiaryPage(fetched);
    const second = projectTimelineDiaryPage(fetched);

    expect(first.rows.map((row) => row.id)).toEqual(["photo-a"]);
    expect(first.hiddenCount).toBe(1);
    expect(first.oldestFetchedEntryAt).toBe("2026-10-14T14:47:00.000Z");
    expect(second).toEqual(first);
    expect(JSON.stringify(fetched)).toBe(before);
  });

  it("returns an empty page with no cursor", () => {
    expect(projectTimelineDiaryPage([])).toEqual({
      rows: [],
      hiddenCount: 0,
      oldestFetchedEntryAt: null,
    });
  });

  it("hides nothing on a page with no linked mirror", () => {
    const page = projectTimelineDiaryPage(PAGE_C);
    expect(page.rows).toEqual(PAGE_C);
    expect(page.hiddenCount).toBe(0);
    expect(page.oldestFetchedEntryAt).toBe("2026-10-12T09:00:00.000Z");
  });
});

describe("Timeline pagination after the blank Quick Log mirror is hidden", () => {
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

  it("shows no load-older control when the only page held a photo and its mirror", async () => {
    const cursors = serveDiaryPages(2, {});

    renderTimeline();

    expect(await screen.findByText("Photo a from Quick Log.")).toBeInTheDocument();
    expect(screen.queryByText("(quick log)")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Detailed diary: showing 1 of 1 entry",
    );
    expect(screen.getByTestId("timeline-results-count")).not.toHaveTextContent("loaded");
    expect(cursors).toEqual([]);
  });

  it("clears the control once the last older page has loaded", async () => {
    const cursors = serveDiaryPages(4, { [PAGE_A[1].entry_at]: PAGE_B });

    renderTimeline();

    const older = await screen.findByTestId("timeline-load-older");
    expect(older).toHaveTextContent("Load older entries (2 more)");
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "showing 1 of 3 entries (1 loaded)",
    );

    fireEvent.click(older);

    expect(await screen.findByText("Photo b from Quick Log.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("(quick log)")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Detailed diary: showing 2 of 2 entries",
    );
    expect(screen.getByTestId("timeline-results-count")).not.toHaveTextContent("loaded");
    // The keyset cursor is the oldest fetched row (the hidden mirror), not the
    // oldest displayed row, so the mirror is never fetched a second time.
    expect(cursors).toEqual([PAGE_A[1].entry_at]);
  });

  it("keeps the control with the right remaining count while more pages exist", async () => {
    const cursors = serveDiaryPages(5, {
      [PAGE_A[1].entry_at]: PAGE_B,
      [PAGE_B[1].entry_at]: PAGE_C,
    });

    renderTimeline();

    const older = await screen.findByTestId("timeline-load-older");
    expect(older).toHaveTextContent("Load older entries (3 more)");

    fireEvent.click(older);

    expect(await screen.findByText("Photo b from Quick Log.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("timeline-load-older")).toHaveTextContent(
        "Load older entries (1 more)",
      ),
    );

    fireEvent.click(screen.getByTestId("timeline-load-older"));

    expect(await screen.findByText("Plain older note.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-load-older")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("(quick log)")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-entry")).toHaveLength(3);
    expect(cursors).toEqual([PAGE_A[1].entry_at, PAGE_B[1].entry_at]);
  });
});
