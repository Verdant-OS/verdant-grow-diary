/**
 * QA 2026-10-21 (production 05f5138d): the Timeline's Environment check
 * correction dialog showed no temperature/humidity fields and no reason. The
 * Timeline diary card now passes the Environment-check readings note to the
 * correction controls; it stays absent for entries whose readings can be
 * corrected. Harness copied from timeline-correction-sensor-wiring.test.tsx.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  growsState: {
    activeGrow: {
      id: "grow-a",
      name: "Current Run A",
      stage: "vegetative",
      started_at: "2026-07-01T00:00:00.000Z",
    } as Record<string, unknown> | null,
    activeGrowId: "grow-a" as string | null,
    grows: [
      {
        id: "grow-a",
        name: "Current Run A",
        stage: "vegetative",
        started_at: "2026-07-01T00:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
  sensorMode: "success" as "success" | "error",
  diaryDetails: {} as Record<string, unknown>,
}));

interface QueryFilter {
  op: string;
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  columns: string | null;
  filters: QueryFilter[];
}

const OBSERVED_AT = "2026-07-20T13:00:00.000Z";

function environmentRow(growId: string, humidity: number) {
  return {
    id: `env-${growId}`,
    grow_id: growId,
    plant_id: "plant-1",
    event_type: "environment",
    source: "manual",
    occurred_at: OBSERVED_AT,
    is_deleted: false,
    environment_events: { temperature_c: 24, humidity_pct: humidity, vpd_kpa: 1.1 },
  };
}

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, columns: null, filters: [] };
    const query = {
      select(columns: string) {
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
      not() {
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return query;
      },
      lt() {
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
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
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
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
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
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
  }),
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
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/useTimelineHighlightAutoScroll", () => ({
  useTimelineHighlightAutoScroll: () => undefined,
}));

vi.mock("@/hooks/useTimelineHashAnchorHandoff", () => ({
  useTimelineHashAnchorHandoff: () => undefined,
}));

vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: () => null,
}));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({
  default: ({
    correctionValues,
    readingsNote,
  }: {
    correctionValues: unknown;
    readingsNote?: string | null;
  }) => (
    <>
      <output data-testid="timeline-correction-values">{JSON.stringify(correctionValues)}</output>
      <output data-testid="timeline-correction-readings-note">{readingsNote ?? "none"}</output>
    </>
  ),
}));
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

function growIdFrom(spec: QuerySpec): string | null {
  const filter = spec.filters.find((item) => item.op === "eq" && item.column === "grow_id");
  return typeof filter?.value === "string" ? filter.value : null;
}

function isSensorQuery(spec: QuerySpec): boolean {
  return spec.table === "grow_events" && (spec.columns ?? "").includes("environment_events");
}

function queryResult(spec: QuerySpec) {
  if (spec.table === "diary_entries") {
    return {
      data: [
        {
          id: "obs-1",
          note: "fast check note",
          photo_url: null,
          stage: "vegetative",
          entry_at: OBSERVED_AT,
          plant_id: "plant-1",
          tent_id: null,
          details: harness.diaryDetails,
        },
      ],
      error: null,
      count: 1,
    };
  }
  if (isSensorQuery(spec)) {
    if (harness.sensorMode === "error") {
      return { data: null, error: { message: "sensor read failed" } };
    }
    const growId = growIdFrom(spec);
    if (growId === "grow-a") return { data: [environmentRow("grow-a", 44)], error: null };
    return { data: [environmentRow("grow-b", 99)], error: null };
  }
  if (spec.table === "grow_events") return { data: [], error: null, count: 0 };
  return { data: [], error: null };
}

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={["/timeline"]}>
      <Timeline />
    </MemoryRouter>,
  );
}

describe("Timeline Environment check correction note", () => {
  beforeEach(() => {
    harness.sensorMode = "success";
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation(queryResult);
  });

  it("passes the readings note for an Environment check whose readings live only in details", async () => {
    harness.diaryDetails = {
      event_type: "environment_check",
      linked_grow_event_id: "parent-1",
      environment_check: { checkType: "airflow", temp_c: 24.5, humidity_pct: 58 },
    };
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-correction-readings-note")).toHaveTextContent(
        "Temperature and humidity on this Environment check can't be corrected yet.",
      );
    });
  });

  it("withholds the note when the manual sensor read failed", async () => {
    harness.sensorMode = "error";
    harness.diaryDetails = {
      event_type: "environment_check",
      linked_grow_event_id: "parent-1",
      environment_check: { checkType: "airflow", temp_c: 24.5, humidity_pct: 58 },
    };
    renderTimeline();
    // The failed read is disclosed; only then is the note's input settled.
    await screen.findByTestId("timeline-partial-read-warning");
    expect(screen.getByTestId("timeline-correction-readings-note")).toHaveTextContent("none");
  });

  it("passes no note for a Fast Check observation whose readings are correctable", async () => {
    harness.diaryDetails = {
      event_type: "observation",
      quick_log_version: 2,
      grow_event_id: "parent-1",
    };
    renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-correction-values")).toHaveTextContent(
        '"humidity_pct":44',
      );
    });
    expect(screen.getByTestId("timeline-correction-readings-note")).toHaveTextContent("none");
  });
});
