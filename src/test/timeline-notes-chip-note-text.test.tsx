/**
 * QA pass 11 (Pollen #1): the Timeline "Notes" chip counted and listed every
 * diary entry, so Notes always equalled All and tapping it changed nothing.
 * Notes now means entries with note text; the chip exposes aria-pressed.
 */
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
vi.mock("@/components/DiaryEntryBadges", () => ({
  default: ({ item }: { item: { eventType: string; tags: string[] } }) => (
    <span data-testid="diary-badge-model">{`${item.eventType}|${item.tags.join(",")}`}</span>
  ),
}));
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
import { timelineEntryHasNoteText } from "@/lib/timelineChipCountRules";

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SENSOR_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function diaryEntry(
  id: string,
  note: string,
  entryAt: string,
  photoUrl: string | null = null,
  details: Record<string, unknown> = { event_type: "note", source: "manual" },
) {
  return {
    id,
    note,
    photo_url: photoUrl,
    stage: "vegetative",
    details,
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
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

function listedEntries(): HTMLElement[] {
  return screen.queryAllByTestId("timeline-entry");
}

function listedDiaryEntries(): HTMLElement[] {
  return screen
    .queryAllByTestId("timeline-entry")
    .filter((node) => !node.id.startsWith("timeline-entry-sensor-reading:"));
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

describe("Timeline Notes chip means note text (Pollen #1)", () => {
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

  it("counts and lists only entries with note text, and hides a watering-only entry", async () => {
    const diaryRows = [
      diaryEntry("note-1", "QA seed note", "2026-07-20T12:00:00.000Z"),
      diaryEntry("water-1", "", "2026-07-20T11:00:00.000Z", null, {
        event_type: "watering",
        source: "quick_log",
        watering: { volume_ml: 750 },
      }),
      diaryEntry("water-2", "   ", "2026-07-20T10:00:00.000Z", null, {
        event_type: "watering",
        source: "quick_log",
        watering: { volume_ml: 500 },
      }),
    ];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 3 };
      return defaultResult(spec);
    });

    renderTimeline();
    expect(await screen.findByText("QA seed note")).toBeInTheDocument();

    expect(chipCount("All")).toBe(3);
    expect(chipCount("Notes")).toBe(1);
    expect(chipButton("Notes")).toHaveAttribute("aria-pressed", "false");
    expect(chipButton("All")).toHaveAttribute("aria-pressed", "true");
    expect(listedDiaryEntries()).toHaveLength(3);

    fireEvent.click(chipButton("Notes"));

    await waitFor(() => expect(listedDiaryEntries()).toHaveLength(1));
    expect(chipButton("Notes")).toHaveAttribute("aria-pressed", "true");
    expect(listedDiaryEntries()[0].id).toBe("timeline-entry-note-1");
  });

  it("does not count manual sensor measurement receipts toward Notes even when the receipt note is non-empty", async () => {
    const diaryRows = [diaryEntry("note-1", "Grower diary note", "2026-07-20T12:00:00.000Z")];
    const readings = receiptReadings(2);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 1 };
      if (spec.table === "tents") return { data: [{ id: TENT_ID }], error: null };
      if (spec.table === "sensor_readings_effective") return { data: readings, error: null };
      return defaultResult(spec);
    });

    renderTimeline();
    expect(await screen.findByText("Grower diary note")).toBeInTheDocument();

    await waitFor(() => expect(chipCount("Measurements")).toBeGreaterThan(1));
    expect(chipCount("All")).toBe(1);
    expect(chipCount("Notes")).toBe(1);

    fireEvent.click(chipButton("Notes"));
    await waitFor(() => expect(listedDiaryEntries()).toHaveLength(1));
    expect(listedDiaryEntries()[0].id).toBe("timeline-entry-note-1");
  });

  it("counts one diary row toward Photos and Notes when it has both a photo and note text", async () => {
    const diaryRows = [
      diaryEntry(
        "photo-note-1",
        "Canopy check caption",
        "2026-07-20T12:00:00.000Z",
        "https://cdn.example/canopy.jpg",
      ),
    ];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 1 };
      return defaultResult(spec);
    });

    renderTimeline();
    expect(await screen.findByText("Canopy check caption")).toBeInTheDocument();

    expect(chipCount("Photos")).toBe(1);
    expect(chipCount("Notes")).toBe(1);

    fireEvent.click(chipButton("Photos"));
    await waitFor(() => expect(listedDiaryEntries()).toHaveLength(1));

    fireEvent.click(chipButton("Notes"));
    await waitFor(() => expect(listedDiaryEntries()).toHaveLength(1));
    expect(listedDiaryEntries()[0].id).toBe("timeline-entry-photo-note-1");
  });
});

describe("timelineEntryHasNoteText", () => {
  it("is true only for non-blank note text", () => {
    expect(timelineEntryHasNoteText("Watered, looks fine")).toBe(true);
    expect(timelineEntryHasNoteText("")).toBe(false);
    expect(timelineEntryHasNoteText("   ")).toBe(false);
    expect(timelineEntryHasNoteText(null)).toBe(false);
    expect(timelineEntryHasNoteText(undefined)).toBe(false);
    expect(timelineEntryHasNoteText(42)).toBe(false);
    expect(timelineEntryHasNoteText({ text: "nope" })).toBe(false);
  });
});
