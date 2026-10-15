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

describe("Timeline loadOlder sensor siblings", () => {
  beforeEach(() => {
    harness.capturedQueries.length = 0;
    harness.executeQuery.mockReset();
  });

  it("loads the linked root, then the environment companion that shares its created_at", async () => {
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        if (spec.filters.some((f) => f.op === "lt" && f.column === "entry_at")) {
          return {
            data: [
              {
                id: "older-1",
                note: "older observation",
                photo_url: null,
                stage: "vegetative",
                details: { event_type: "observation", linked_grow_event_id: ROOT_ID },
                entry_at: "2026-07-15T12:00:00.000Z",
                plant_id: null,
                tent_id: null,
              },
            ],
            error: null,
          };
        }
        return {
          data: [
            {
              id: "e1",
              note: "newest",
              photo_url: null,
              stage: "vegetative",
              details: { event_type: "note" },
              entry_at: "2026-07-15T20:00:00.000Z",
              plant_id: null,
              tent_id: null,
            },
          ],
          error: null,
          count: 2,
        };
      }
      if (spec.table === "grow_events") {
        const idFilter = spec.filters.find((f) => f.column === "id" && Array.isArray(f.value));
        const environment = spec.filters.some(
          (f) => f.column === "event_type" && f.value === "environment",
        );
        if (idFilter && !environment && (idFilter.value as unknown[]).includes(ROOT_ID)) {
          return {
            data: [
              {
                id: ROOT_ID,
                event_type: "observation",
                source: "manual",
                created_at: ROOT_CREATED_AT,
              },
            ],
            error: null,
          };
        }
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
    const olderButton = await screen.findByTestId("timeline-load-older");
    harness.capturedQueries.length = 0;
    fireEvent.click(olderButton);

    await waitFor(() => {
      const sibling = harness.capturedQueries.find(
        (q) =>
          q.table === "grow_events" &&
          q.filters.some(
            (f) => f.op === "eq" && f.column === "event_type" && f.value === "environment",
          ) &&
          q.filters.some((f) => f.column === "source" && f.value === "manual") &&
          q.filters.some(
            (f) =>
              f.column === "created_at" &&
              Array.isArray(f.value) &&
              f.value.includes(ROOT_CREATED_AT),
          ),
      );
      expect(sibling).toBeDefined();
      expect(
        sibling?.filters.some(
          (f) => f.column === "id" && Array.isArray(f.value) && f.value.includes(ROOT_ID),
        ),
      ).toBe(false);
    });
  });
});
