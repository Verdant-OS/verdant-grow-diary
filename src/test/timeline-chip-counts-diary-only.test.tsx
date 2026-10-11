import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
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
  default: () => <div data-testid="timeline-one-tent-loop-next-step-card">Continue</div>,
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

const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SENSOR_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function diaryEntry(id: string, note: string, entryAt: string, photoUrl: string | null = null) {
  return {
    id,
    note,
    photo_url: photoUrl,
    stage: "vegetative",
    details: { event_type: "note", source: "manual" },
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
}

function diaryPage(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    const entryAt = new Date(Date.UTC(2026, 6, 20, 12, 0, 0) - index * 3_600_000).toISOString();
    return diaryEntry(`diary-${index}`, `Diary row ${index}`, entryAt);
  });
}

function manualTempReading(id: string, capturedAt: string) {
  return {
    id,
    user_id: SENSOR_USER_ID,
    tent_id: TENT_ID,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    quality: "ok",
    ts: capturedAt,
    captured_at: capturedAt,
    created_at: capturedAt,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    corrected_at: null,
  };
}

function receiptReadings(count: number) {
  const base = Date.now() - 5 * 60_000;
  return Array.from({ length: count }, (_, index) =>
    manualTempReading(
      `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
      new Date(base - index * 5 * 60_000).toISOString(),
    ),
  );
}

function isOlderPage(spec: QuerySpec): boolean {
  return spec.filters.some((filter) => filter.op === "lt" && filter.column === "entry_at");
}

function defaultResult(spec: QuerySpec): QueryResult {
  if (spec.table === "diary_entries") return { data: [], error: null, count: 0 };
  return { data: [], error: null };
}

function chipButton(label: string): HTMLElement {
  const button = screen.getAllByRole("button").find((node) => {
    return node.querySelector("span")?.textContent === label;
  });
  if (!button) throw new Error(`Chip ${label} not found`);
  return button;
}

function chipCount(label: string): number {
  const spans = chipButton(label).querySelectorAll("span");
  const raw = spans[spans.length - 1]?.textContent ?? "";
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Chip ${label} count missing: ${raw}`);
  return value;
}

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={["/timeline"]}>
      <Timeline />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("Timeline chip counts stay on diary rows", () => {
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

  it("keeps All on the diary length when receipts are also on the list", async () => {
    const diaryRows = diaryPage(100);
    const readings = receiptReadings(3);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 140 };
      if (spec.table === "tents") return { data: [{ id: TENT_ID }], error: null };
      if (spec.table === "sensor_readings_effective") return { data: readings, error: null };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Diary row 0")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/^Manual sensor snapshot:/)).toHaveLength(3);
    });

    expect(chipCount("All")).toBe(100);
    expect(chipCount("Notes")).toBe(100);
    expect(chipCount("Photos")).toBe(0);
    expect(chipCount("Measurements")).toBe(3);
    expect(chipCount("Follow-ups")).toBe(0);
    expect(chipCount("Action responses")).toBe(0);
    expect(chipCount("All stages")).toBe(100);
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 100 of 140 entries/,
    );
  }, 20_000);

  it("counts three sensor receipts on Measurements while All stays at four diary rows", async () => {
    const diaryRows = diaryPage(4);
    const readings = receiptReadings(3);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 4 };
      if (spec.table === "tents") return { data: [{ id: TENT_ID }], error: null };
      if (spec.table === "sensor_readings_effective") return { data: readings, error: null };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Diary row 0")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/^Manual sensor snapshot:/)).toHaveLength(3);
    });

    expect(chipCount("All")).toBe(4);
    expect(chipCount("Notes")).toBe(4);
    expect(chipCount("Photos")).toBe(0);
    expect(chipCount("Measurements")).toBe(3);
    expect(chipCount("All stages")).toBe(4);
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 4 of 4 entries/,
    );
  }, 20_000);

  it("counts storage photos before the signed URL arrives and keeps All and Y still", async () => {
    const pending = deferred<void>();
    harness.createSignedUrls.mockImplementation((paths: string[]) =>
      pending.promise.then(() => ({
        data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
        error: null,
      })),
    );
    const rows = [
      diaryEntry("photo-1", "Storage photo 1", "2026-07-20T12:00:00.000Z", "owner-1/diary/p1.jpg"),
      diaryEntry("photo-2", "Storage photo 2", "2026-07-20T11:00:00.000Z", "owner-1/diary/p2.jpg"),
      diaryEntry("photo-3", "Storage photo 3", "2026-07-20T10:00:00.000Z", "owner-1/diary/p3.jpg"),
      diaryEntry("note-1", "Plain diary note", "2026-07-20T09:00:00.000Z"),
      diaryEntry("note-2", "Second plain note", "2026-07-20T08:00:00.000Z"),
    ];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: rows, error: null, count: 5 };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Plain diary note")).toBeInTheDocument();
    await waitFor(() => {
      expect(chipCount("Photos")).toBe(3);
    });
    expect(chipCount("All")).toBe(5);
    expect(chipCount("Notes")).toBe(5);
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 5 of 5 entries/,
    );
    expect(document.querySelector('img[src*="signed.test"]')).toBeNull();

    fireEvent.click(chipButton("Photos"));
    expect(screen.getByText("Storage photo 1")).toBeInTheDocument();
    expect(screen.queryByText("Plain diary note")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 3 of 5 entries/,
    );
    fireEvent.click(chipButton("All"));
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 5 of 5 entries/,
    );

    await act(async () => {
      pending.resolve();
    });
    await waitFor(() => {
      expect(document.querySelector('img[src*="signed.test"]')).not.toBeNull();
    });

    expect(chipCount("Photos")).toBe(3);
    expect(chipCount("All")).toBe(5);
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 5 of 5 entries/,
    );

    fireEvent.click(chipButton("Photos"));
    expect(screen.getByText("Storage photo 1")).toBeInTheDocument();
    expect(screen.getByText("Storage photo 2")).toBeInTheDocument();
    expect(screen.getByText("Storage photo 3")).toBeInTheDocument();
    expect(screen.queryByText("Plain diary note")).not.toBeInTheDocument();
  });

  it("does not change the results-line Y when older diary rows load", async () => {
    const firstPage = diaryPage(100);
    const olderPage = diaryPage(20, 100);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && isOlderPage(spec)) {
        return { data: olderPage, error: null };
      }
      if (spec.table === "diary_entries") return { data: firstPage, error: null, count: 140 };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Diary row 0")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
        /showing 100 of 140 entries/,
      );
    });
    expect(chipCount("All")).toBe(100);

    fireEvent.click(screen.getByTestId("timeline-load-older"));

    await waitFor(() => {
      expect(screen.getByText("Diary row 119")).toBeInTheDocument();
    });
    expect(screen.getByTestId("timeline-results-count").textContent).toMatch(
      /showing 120 of 140 entries/,
    );
    expect(chipCount("All")).toBe(120);
    expect(chipCount("Notes")).toBe(120);
  }, 20_000);
});
