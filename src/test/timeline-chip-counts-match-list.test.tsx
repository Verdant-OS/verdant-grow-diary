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

describe("Timeline chip counts match listed entries (#2163)", () => {
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

  it("matches every chip count to the exact number of entries listed under that chip", async () => {
    const diaryRows = [
      diaryEntry("note-1", "Plain diary note", "2026-07-20T12:00:00.000Z"),
      diaryEntry("note-2", "Second plain note", "2026-07-20T11:00:00.000Z"),
      diaryEntry(
        "photo-1",
        "Leaf photo",
        "2026-07-20T10:00:00.000Z",
        "https://cdn.example/leaf.jpg",
      ),
      diaryEntry("measure-1", "Runoff 6.2", "2026-07-20T09:00:00.000Z", null, {
        event_type: "measurement",
        source: "manual",
        ph: 6.2,
      }),
      diaryEntry("follow-1", "Checked the canopy", "2026-07-20T08:00:00.000Z", null, {
        event_type: "action_followup",
        source: "manual",
      }),
      diaryEntry("response-1", "Leaves recovered", "2026-07-20T07:00:00.000Z", null, {
        event_type: "action_followup",
        source: "manual",
        action_queue_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        outcome: "improved",
      }),
      diaryEntry("water-empty-1", "", "2026-07-20T06:00:00.000Z", null, {
        event_type: "watering",
        source: "quick_log",
        watering: { volume_ml: 500 },
      }),
    ];
    const readings = receiptReadings(4);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 7 };
      if (spec.table === "tents") return { data: [{ id: TENT_ID }], error: null };
      if (spec.table === "sensor_readings_effective") return { data: readings, error: null };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Plain diary note")).toBeInTheDocument();

    expect(chipCount("All")).toBe(7);
    expect(chipCount("All stages")).toBe(7);
    expect(chipCount("Notes")).toBe(6);
    expect(chipCount("Photos")).toBe(1);
    expect(chipCount("Measurements")).toBe(6);
    expect(chipCount("Follow-ups")).toBe(2);
    expect(chipCount("Action responses")).toBe(1);

    const chips = [
      "All",
      "All stages",
      "Photos",
      "Notes",
      "Measurements",
      "Follow-ups",
      "Action responses",
    ] as const;

    for (const label of chips) {
      fireEvent.click(chipButton(label));
      const count = chipCount(label);
      if (label === "Measurements") {
        expect(listedEntries(), "Measurements chip count includes sensor receipts").toHaveLength(
          count,
        );
        expect(listedDiaryEntries()).toHaveLength(2);
        // Codex P2 at 558d7ec3: the active All stages chip counts the same
        // receipt-inclusive list that Measurements renders.
        expect(chipCount("All stages"), "All stages under Measurements includes receipts").toBe(
          listedEntries().length,
        );
        expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
          "Detailed diary: showing 2 of 7 entries",
        );
      } else {
        expect(listedDiaryEntries(), `chip ${label} listed diary count must match`).toHaveLength(
          count,
        );
        expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
          `Detailed diary: showing ${count} of 7 entries`,
        );
      }
    }
  }, 20_000);

  it("updates chip counts to match listed entries when evidence filters (e.g. search) narrow the list", async () => {
    const diaryRows = [
      diaryEntry("note-1", "QA Test watering note", "2026-07-20T12:00:00.000Z"),
      diaryEntry("note-2", "Unrelated canopy observation", "2026-07-20T11:00:00.000Z"),
      diaryEntry("measure-1", "QA Test runoff check", "2026-07-20T10:00:00.000Z", null, {
        event_type: "measurement",
        source: "manual",
        ph: 6.2,
      }),
    ];
    const readings = receiptReadings(2);
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 3 };
      if (spec.table === "tents") return { data: [{ id: TENT_ID }], error: null };
      if (spec.table === "sensor_readings_effective") return { data: readings, error: null };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("QA Test watering note")).toBeInTheDocument();
    expect(chipCount("All")).toBe(3);

    fireEvent.change(screen.getByTestId("timeline-search-input"), {
      target: { value: "QA Test" },
    });

    expect(listedEntries()).toHaveLength(2);
    expect(chipCount("All")).toBe(2);
    expect(chipCount("All stages")).toBe(2);
    expect(chipCount("Notes")).toBe(2);
    expect(chipCount("Measurements")).toBe(1);
    expect(chipCount("Vegetative")).toBe(2);
  });

  it("counts storage photos before signed URLs resolve and keeps Photos list equal to Photos count", async () => {
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
      diaryEntry("note-1", "Plain diary note", "2026-07-20T09:00:00.000Z"),
    ];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: rows, error: null, count: 3 };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Plain diary note")).toBeInTheDocument();
    await waitFor(() => {
      expect(chipCount("Photos")).toBe(2);
    });
    expect(chipCount("All")).toBe(3);

    fireEvent.click(chipButton("Photos"));
    expect(listedEntries()).toHaveLength(2);
    expect(screen.getByText("Storage photo 1")).toBeInTheDocument();
    expect(screen.queryByText("Plain diary note")).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve();
    });
    await waitFor(() => {
      expect(document.querySelector('img[src*="signed.test"]')).not.toBeNull();
    });

    expect(chipCount("Photos")).toBe(2);
    expect(listedEntries()).toHaveLength(2);
  });

  it("preserves feeding identity and Feed Volume when a diary companion carries only linked_grow_event_id to a feeding grow_event", async () => {
    const linkedGrowEventId = "11111111-1111-4111-8111-111111111111";
    const diaryRows = [
      diaryEntry("feed-companion-1", "Bloom feed note", "2026-07-20T12:00:00.000Z", null, {
        linked_grow_event_id: linkedGrowEventId,
      }),
    ];
    const growEventRows = [
      {
        id: linkedGrowEventId,
        grow_id: GROW_A.id,
        plant_id: null,
        tent_id: TENT_ID,
        event_type: "feeding",
        occurred_at: "2026-07-20T12:00:00.000Z",
        note: "Bloom feed note",
        source: "manual",
        is_deleted: false,
        feeding_events: [{ volume_ml: 750 }],
      },
    ];
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: diaryRows, error: null, count: 1 };
      if (spec.table === "grow_events") return { data: growEventRows, error: null, count: 1 };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Bloom feed note")).toBeInTheDocument();
    const card = screen.getByTestId("timeline-entry");
    expect(card).toHaveTextContent("Feeding");
    expect(card).toHaveTextContent("Feed Volume: 750 ml");
    expect(card).not.toHaveTextContent("Water Volume: 750 ml");
    // Codex P2 at 9aa6ecb1: the badge/FAQ model is built from the enriched
    // row too, so it carries the recovered feeding identity, not a Note.
    expect(screen.getByTestId("diary-badge-model").textContent?.split("|")[0]).toBe("feeding");
  });
});
