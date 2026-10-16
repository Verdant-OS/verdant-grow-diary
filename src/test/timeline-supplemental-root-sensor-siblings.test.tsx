import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryFilter {
  op: "eq" | "is" | "not" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
}

interface QuerySpec {
  table: string;
  filters: QueryFilter[];
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn<(spec: QuerySpec) => QueryResult>(),
  capturedQueries: [] as QuerySpec[],
  growsState: {
    activeGrow: {
      id: "grow-a",
      name: "Current Run A",
      stage: "vegetative",
      started_at: "2026-01-01T00:00:00.000Z",
    } as Record<string, unknown>,
    activeGrowId: "grow-a" as string | null,
    grows: [
      {
        id: "grow-a",
        name: "Current Run A",
        stage: "vegetative",
        started_at: "2026-01-01T00:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec: QuerySpec = { table, filters: [] };
    const query = {
      select() {
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
        const snapshot: QuerySpec = { table, filters: spec.filters.map((f) => ({ ...f })) };
        harness.capturedQueries.push(snapshot);
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
vi.mock("@/lib/featureEntitlements", () => ({ canUseFeature: () => false }));
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

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const ROOT_CREATED_AT = "2026-07-15T12:00:00.512Z";

describe("Timeline supplemental root sensor siblings", () => {
  beforeEach(() => {
    harness.capturedQueries.length = 0;
    harness.executeQuery.mockReset();
  });

  it("matches the created_at sibling of a root that is outside the first grow-event page", async () => {
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "e1",
              note: "fast check",
              photo_url: null,
              stage: "vegetative",
              details: {
                event_type: "observation",
                source: "manual",
                quick_log_version: 2,
                linked_grow_event_id: ROOT_ID,
              },
              entry_at: "2026-07-15T12:00:00.000Z",
              plant_id: "plant-a",
              tent_id: null,
            },
          ],
          error: null,
          count: 1,
        };
      }
      if (spec.table === "grow_events") {
        const environment = spec.filters.some(
          (f) => f.column === "event_type" && f.value === "environment",
        );
        const byCreatedAt = spec.filters.some(
          (f) => f.column === "created_at" && Array.isArray(f.value),
        );
        const byId = spec.filters.some((f) => f.column === "id" && Array.isArray(f.value));
        if (environment && byCreatedAt) {
          return {
            data: [
              {
                id: "companion",
                event_type: "environment",
                source: "manual",
                plant_id: "plant-b",
                occurred_at: "2026-07-01T00:00:00.000Z",
                created_at: ROOT_CREATED_AT,
                environment_events: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
              },
            ],
            error: null,
          };
        }
        if (environment) {
          return {
            data: [
              {
                id: "decoy",
                event_type: "environment",
                source: "manual",
                plant_id: "plant-a",
                occurred_at: "2026-07-15T12:00:00.000Z",
                created_at: "2026-07-15T12:00:01.000Z",
                environment_events: { temperature_c: 10, humidity_pct: 40, vpd_kpa: 0.4 },
              },
            ],
            error: null,
          };
        }
        if (byId) {
          return {
            data: [
              {
                id: ROOT_ID,
                event_type: "observation",
                source: "manual",
                plant_id: "plant-a",
                occurred_at: "2026-07-15T12:00:00.000Z",
                created_at: ROOT_CREATED_AT,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      }
      return { data: [], error: null };
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/timeline"]}>
          <Timeline />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(
        harness.capturedQueries.some((query) =>
          query.filters.some((filter) => filter.column === "id" && Array.isArray(filter.value)),
        ),
      ).toBe(true);
    });
    fireEvent.click(await screen.findByTestId("quicklog-entry-correct-button"));
    expect(
      ((await screen.findByTestId("quicklog-correct-temperature-input")) as HTMLInputElement).value,
    ).toBe("24");
  });
});
