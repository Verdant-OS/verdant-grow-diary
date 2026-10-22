/**
 * Filming bug #3 (2026-10-22): with the Timeline filtered to one plant, the
 * Quick Log history lanes (Recent Quick Logs, calendar, watering, feeding)
 * still listed every plant's logs, because they were fed the unfiltered grow
 * page. The lanes now follow the same plant/tent scope as the main list.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  default: ({ testId }: { testId: string }) => <div data-testid={testId}>Continue to Sensors</div>,
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({
  default: ({ handle }: { handle: { diaryEntryId?: string } }) => (
    <output data-testid="linked-quicklog-revision-controls" data-diary-id={handle.diaryEntryId} />
  ),
}));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({
  default: ({ entry }: { entry: { capturedAt: string } }) => (
    <output
      data-testid="environment-check-snapshot-link-probe"
      data-captured-at={entry.capturedAt}
    />
  ),
}));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({
  default: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-watering-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/FeedingHistoryPanel", () => ({
  default: ({ rawEntries = [] }: { rawEntries?: Array<{ id?: string }> }) => (
    <output
      data-testid="timeline-feeding-lane-probe"
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
    />
  ),
}));
vi.mock("@/components/PhotoHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/QuickLogHistoryPanels", () => ({
  RecentQuickLogActivityPanel: ({
    rawEntries = [],
  }: {
    rawEntries?: Array<{ id?: string; details?: Record<string, unknown> }>;
  }) => (
    <output
      data-testid="timeline-recent-raw-entries-probe"
      data-entry-count={rawEntries.length}
      data-entry-ids={rawEntries.map((entry) => entry.id ?? "").join(",")}
      data-manual-snapshot-count={
        rawEntries.filter((entry) => entry.details?.manual_sensor_snapshot != null).length
      }
    />
  ),
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

const GROW_B = {
  id: "grow-b",
  name: "Current Run B",
  stage: "flowering",
  started_at: "2026-07-10T00:00:00.000Z",
};

function diaryEntry(id: string, note: string, entryAt = "2026-07-20T12:00:00.000Z") {
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

function growEvent(id = "grow-event-1") {
  return {
    id,
    grow_id: "grow-a",
    plant_id: null,
    tent_id: null,
    event_type: "watering",
    occurred_at: "2026-07-20T13:00:00.000Z",
    note: "Watered 1 litre",
    source: "manual",
    is_deleted: false,
  };
}

function growIdFrom(spec: QuerySpec): string | null {
  const filter = spec.filters.find((item) => item.op === "eq" && item.column === "grow_id");
  return typeof filter?.value === "string" ? filter.value : null;
}

function isOlderPage(spec: QuerySpec): boolean {
  return spec.filters.some((item) => item.op === "lt" && item.column === "entry_at");
}

function defaultResult(spec: QuerySpec): QueryResult {
  if (spec.table === "diary_entries") return { data: [], error: null, count: 0 };
  return { data: [], error: null };
}

function renderTimeline(route = "/timeline") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Timeline />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="timeline-location-search">{location.search}</output>
      <button
        type="button"
        data-testid="timeline-external-plant-navigation"
        onClick={() =>
          navigate("/timeline?sensorSources=csv&plantId=plant-a&from=2026-07-01&to=2026-07-31")
        }
      >
        Navigate to Plant A
      </button>
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function expectNoTimelineContinuation() {
  expect(screen.queryByTestId("timeline-one-tent-loop-next-step-card")).not.toBeInTheDocument();
}

function expectNoTimelineDirectoryReads() {
  const directoryReads = harness.executeQuery.mock.calls
    .map(([spec]) => spec as QuerySpec)
    .filter(
      (spec) =>
        spec.table === "plants" ||
        spec.table === "tents" ||
        spec.table === "sensor_readings" ||
        spec.table === "sensor_readings_effective",
    );
  expect(directoryReads).toHaveLength(0);
}

function expectNoFalseEmptyOrResults() {
  expect(screen.queryByText("No entries yet")).not.toBeInTheDocument();
  expect(screen.queryByText("No matching entries")).not.toBeInTheDocument();
  expect(screen.queryByTestId("timeline-results-count")).not.toBeInTheDocument();
}

describe("Timeline Quick Log lanes follow the plant/tent filter", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation(defaultResult);
    harness.refreshGrows.mockReset();
    harness.setActiveGrowId.mockReset();
    harness.reloadActionResponseMemory.mockReset();
    harness.createSignedUrls.mockReset();
    harness.createSignedUrls.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
        error: null,
      }),
    );
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

  const PLANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
  const PLANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
  const TENT_1 = "cccccccc-0000-4000-8000-000000000001";
  const TENT_2 = "cccccccc-0000-4000-8000-000000000002";

  function mockTwoPlantRows() {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            { ...diaryEntry("diary-a", "Plant A note"), plant_id: PLANT_A, tent_id: TENT_1 },
            {
              ...diaryEntry("diary-b", "Plant B note", "2026-07-20T11:00:00.000Z"),
              plant_id: PLANT_B,
              tent_id: TENT_2,
            },
          ],
          error: null,
          count: 2,
        };
      }
      if (spec.table === "grow_events" && spec.filters.every((f) => f.column !== "event_type")) {
        return {
          data: [
            { ...growEvent("event-a"), plant_id: PLANT_A, tent_id: TENT_1 },
            {
              ...growEvent("event-b"),
              plant_id: PLANT_B,
              tent_id: TENT_2,
              occurred_at: "2026-07-20T10:00:00.000Z",
            },
          ],
          error: null,
        };
      }
      return defaultResult(spec);
    });
  }

  async function laneIds(): Promise<string[]> {
    const probe = await screen.findByTestId("timeline-recent-raw-entries-probe");
    await waitFor(() => expect(Number(probe.getAttribute("data-entry-count"))).toBeGreaterThan(0));
    return (probe.getAttribute("data-entry-ids") ?? "").split(",").filter(Boolean).sort();
  }

  it("shows only the filtered plant's quick logs", async () => {
    mockTwoPlantRows();
    renderTimeline(`/timeline?plantId=${PLANT_A}`);
    expect(await laneIds()).toEqual(["diary-a", "event-a"]);
  });

  it("scopes the watering and feeding history lanes to the filtered plant", async () => {
    mockTwoPlantRows();
    renderTimeline(`/timeline?plantId=${PLANT_A}`);
    await laneIds();
    for (const id of ["timeline-watering-lane-probe", "timeline-feeding-lane-probe"]) {
      const ids = (screen.getByTestId(id).getAttribute("data-entry-ids") ?? "")
        .split(",")
        .filter(Boolean)
        .sort();
      expect(ids).toEqual(["diary-a", "event-a"]);
    }
  });

  it("shows only the filtered tent's quick logs", async () => {
    mockTwoPlantRows();
    renderTimeline(`/timeline?tentId=${TENT_2}`);
    expect(await laneIds()).toEqual(["diary-b", "event-b"]);
  });

  it("keeps every plant's quick logs when no plant or tent is filtered", async () => {
    mockTwoPlantRows();
    renderTimeline();
    expect(await laneIds()).toEqual(["diary-a", "diary-b", "event-a", "event-b"]);
  });
});
