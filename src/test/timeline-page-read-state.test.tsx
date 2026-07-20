import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  op: "eq" | "gte" | "lte" | "lt";
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
    </MemoryRouter>,
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

function expectNoFalseEmptyOrResults() {
  expect(screen.queryByText("No entries yet")).not.toBeInTheDocument();
  expect(screen.queryByText("No matching entries")).not.toBeInTheDocument();
  expect(screen.queryByTestId("timeline-results-count")).not.toBeInTheDocument();
}

describe("Timeline mounted read-state boundary", () => {
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

  it("rejects an unavailable URL grow before any Timeline read can become empty", async () => {
    Object.assign(harness.scopedGrowState, {
      urlGrowId: "foreign-or-archived-grow",
      isValidScopedGrow: false,
    });

    renderTimeline();

    const error = await screen.findByTestId("timeline-scope-error");
    expect(error).toHaveTextContent("Grow not available");
    expect(error).toHaveTextContent("does not match a grow available to your account");
    expect(harness.executeQuery).not.toHaveBeenCalled();
    expectNoFalseEmptyOrResults();
    expectNoTimelineContinuation();
  });

  it("treats a blank URL grow id as absent and reads the active grow", async () => {
    harness.scopedGrowState.urlGrowId = "";
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [diaryEntry("entry-blank-scope", "Active-grow evidence")],
          error: null,
          count: 1,
        };
      }
      return defaultResult(spec);
    });

    renderTimeline("/timeline?growId=");

    expect(await screen.findByText("Active-grow evidence")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-scope-error")).not.toBeInTheDocument();
    const diaryRead = harness.executeQuery.mock.calls
      .map(([spec]) => spec as QuerySpec)
      .find((spec) => spec.table === "diary_entries");
    expect(diaryRead && growIdFrom(diaryRead)).toBe(GROW_A.id);
  });

  it("renders an explicit grow-read error, never setup/continuation, and retries the grow read", async () => {
    harness.growsState.error = "provider-secret: row level security denied";

    renderTimeline();

    const error = await screen.findByTestId("timeline-grow-data-error");
    expect(error).toHaveTextContent("We couldn't verify your grows");
    expect(document.body).not.toHaveTextContent("provider-secret");
    expect(screen.queryByText("Start your first grow")).not.toBeInTheDocument();
    expect(screen.queryByText("Create grow")).not.toBeInTheDocument();
    expectNoTimelineContinuation();

    fireEvent.click(screen.getByTestId("timeline-grow-data-error-retry"));
    expect(harness.refreshGrows).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the required diary read fails and retries without leaking provider text", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) =>
      spec.table === "diary_entries"
        ? { data: null, error: { message: "private-provider-diary-error" }, count: null }
        : defaultResult(spec),
    );

    renderTimeline();

    const error = await screen.findByTestId("timeline-read-error");
    expect(error).toHaveTextContent("not a confirmed empty history");
    expect(document.body).not.toHaveTextContent("private-provider-diary-error");
    expectNoFalseEmptyOrResults();
    expectNoTimelineContinuation();

    const callsBeforeRetry = harness.executeQuery.mock.calls.length;
    fireEvent.click(screen.getByTestId("timeline-read-error-retry"));
    await waitFor(() =>
      expect(harness.executeQuery.mock.calls.length).toBeGreaterThan(callsBeforeRetry),
    );
  });

  it("fails closed when the required grow-events read fails", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: [], error: null, count: 0 };
      if (spec.table === "grow_events") {
        return { data: null, error: { message: "private-provider-grow-event-error" } };
      }
      return defaultResult(spec);
    });

    renderTimeline();

    const error = await screen.findByTestId("timeline-read-error");
    expect(error).toHaveTextContent("complete timeline");
    expect(document.body).not.toHaveTextContent("private-provider-grow-event-error");
    expectNoFalseEmptyOrResults();
    expectNoTimelineContinuation();
  });

  it("shows a genuine empty state only after both required reads succeed with zero rows", async () => {
    renderTimeline();

    expect(await screen.findByText("No entries yet")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Detailed diary: showing 0 of 0 entries",
    );
    expect(screen.queryByTestId("timeline-read-error")).not.toBeInTheDocument();
    expectNoTimelineContinuation();
  });

  it("unlocks the Sensors continuation after successful diary evidence", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [diaryEntry("entry-1", "Diary evidence is present")],
          error: null,
          count: 1,
        };
      }
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Diary evidence is present")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-stage-tagged-count")).toHaveTextContent(
      "1 stage-tagged log",
    );
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card")).toBeInTheDocument();
  });

  it("unlocks the Sensors continuation for V2 grow-event-only evidence", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") return { data: [], error: null, count: 0 };
      if (spec.table === "grow_events") return { data: [growEvent()], error: null };
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByTestId("timeline-one-tent-loop-next-step-card")).toBeInTheDocument();
    expect(screen.queryByText("No entries yet")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Detailed diary: showing 0 of 0 entries",
    );
    expect(screen.getByTestId("timeline-results-count")).toHaveTextContent(
      "Quick Log activity appears in the history panels below",
    );
    expect(screen.getByTestId("timeline-stage-tagged-count")).toHaveTextContent(
      "0 stage-tagged logs",
    );
    expect(screen.getByTestId("timeline-unstaged-quick-log-note")).toHaveTextContent(
      "without a stored stage",
    );
  });

  it("hides prior-scope rows and ignores a late response from the old scope", async () => {
    const oldReload = deferred<QueryResult>();
    const currentRead = deferred<QueryResult>();
    let growADiaryReads = 0;

    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      const growId = growIdFrom(spec);
      if (spec.table === "diary_entries" && growId === GROW_A.id) {
        growADiaryReads += 1;
        return growADiaryReads === 1
          ? { data: [diaryEntry("entry-a", "Evidence from grow A")], error: null, count: 1 }
          : oldReload.promise;
      }
      if (spec.table === "diary_entries" && growId === GROW_B.id) return currentRead.promise;
      return defaultResult(spec);
    });

    const view = renderTimeline();
    expect(await screen.findByText("Evidence from grow A")).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("verdant:entry-created")));
    await waitFor(() => expect(growADiaryReads).toBe(2));
    expect(screen.queryByText("Evidence from grow A")).not.toBeInTheDocument();
    expectNoTimelineContinuation();

    Object.assign(harness.growsState, {
      activeGrow: GROW_B,
      activeGrowId: GROW_B.id,
      grows: [GROW_A, GROW_B],
    });
    view.rerender(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        harness.executeQuery.mock.calls.some(
          ([spec]) => spec.table === "diary_entries" && growIdFrom(spec) === GROW_B.id,
        ),
      ).toBe(true),
    );
    expect(screen.queryByText("Evidence from grow A")).not.toBeInTheDocument();
    expectNoTimelineContinuation();

    await act(async () => {
      currentRead.resolve({
        data: [diaryEntry("entry-b", "Evidence from grow B")],
        error: null,
        count: 1,
      });
    });
    expect(await screen.findByText("Evidence from grow B")).toBeInTheDocument();

    await act(async () => {
      oldReload.resolve({
        data: [diaryEntry("entry-a-late", "Late stale evidence from grow A")],
        error: null,
        count: 1,
      });
    });
    await waitFor(() => expect(screen.getByText("Evidence from grow B")).toBeInTheDocument());
    expect(screen.queryByText("Late stale evidence from grow A")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card")).toBeInTheDocument();
  });

  it("keeps core evidence visible and discloses supplemental action/alert failures", async () => {
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [diaryEntry("entry-core", "Trusted core diary evidence")],
          error: null,
          count: 1,
        };
      }
      if (spec.table === "action_queue_events") {
        return { data: null, error: { message: "private-action-provider-error" } };
      }
      if (spec.table === "alert_events") {
        return { data: null, error: { message: "private-alert-provider-error" } };
      }
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Trusted core diary evidence")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-partial-read-warning")).toHaveTextContent(
      "Some linked timeline context is unavailable",
    );
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-action-provider-error");
    expect(document.body).not.toHaveTextContent("private-alert-provider-error");
  });

  it("renders confirmed core evidence while linked context is still pending", async () => {
    const actionRead = deferred<QueryResult>();
    const alertRead = deferred<QueryResult>();
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [diaryEntry("entry-core-pending", "Core history is already ready")],
          error: null,
          count: 1,
        };
      }
      if (spec.table === "action_queue_events") return actionRead.promise;
      if (spec.table === "alert_events") return alertRead.promise;
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Core history is already ready")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-linked-context-loading")).toHaveTextContent(
      "Your diary and Quick Log history are ready",
    );
    expect(screen.getByTestId("timeline-one-tent-loop-next-step-card")).toBeInTheDocument();

    await act(async () => {
      actionRead.resolve({ data: null, error: { message: "supplemental failure" } });
      alertRead.resolve({ data: [], error: null });
    });

    expect(await screen.findByTestId("timeline-partial-read-warning")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("timeline-linked-context-loading")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Core history is already ready")).toBeInTheDocument();
  });

  it("preserves loaded entries after pagination failure and recovers through its retry", async () => {
    let olderAttempts = 0;
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && isOlderPage(spec)) {
        olderAttempts += 1;
        return olderAttempts === 1
          ? { data: null, error: { message: "private-pagination-provider-error" } }
          : {
              data: [
                diaryEntry("entry-older", "Recovered older entry", "2026-07-19T12:00:00.000Z"),
              ],
              error: null,
            };
      }
      if (spec.table === "diary_entries") {
        return { data: [diaryEntry("entry-new", "Newest retained entry")], error: null, count: 2 };
      }
      return defaultResult(spec);
    });

    renderTimeline();

    expect(await screen.findByText("Newest retained entry")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("timeline-load-older"));

    const paginationError = await screen.findByTestId("timeline-load-older-error");
    expect(paginationError).toHaveTextContent("entries already shown are unchanged");
    expect(screen.getByText("Newest retained entry")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-pagination-provider-error");
    expect(screen.getByTestId("timeline-load-older-retry")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("timeline-load-older-retry"));
    expect(await screen.findByText("Recovered older entry")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-load-older-error")).not.toBeInTheDocument();
    expect(screen.getByText("Newest retained entry")).toBeInTheDocument();
    expect(olderAttempts).toBe(2);
  });

  it("keeps an older text entry when supplemental photo signing rejects", async () => {
    harness.createSignedUrls.mockRejectedValueOnce(new Error("storage unavailable"));
    harness.executeQuery.mockImplementation((spec: QuerySpec) => {
      if (spec.table === "diary_entries" && isOlderPage(spec)) {
        return {
          data: [
            {
              ...diaryEntry(
                "entry-older-photo",
                "Older text survives photo failure",
                "2026-07-19T12:00:00.000Z",
              ),
              photo_url: "owner/private-photo.jpg",
            },
          ],
          error: null,
        };
      }
      if (spec.table === "diary_entries") {
        return { data: [diaryEntry("entry-new-photo", "Newest entry")], error: null, count: 2 };
      }
      return defaultResult(spec);
    });

    renderTimeline();
    expect(await screen.findByText("Newest entry")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("timeline-load-older"));

    expect(await screen.findByText("Older text survives photo failure")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-partial-read-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-load-older-error")).not.toBeInTheDocument();
  });
});
