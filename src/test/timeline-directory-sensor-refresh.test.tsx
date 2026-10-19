/**
 * A core Timeline reload must ask for manual sensor receipts again, and the
 * grow list settling must not start that core read a second time.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  growsState: {
    activeGrow: null as Record<string, unknown> | null,
    activeGrowId: null as string | null,
    grows: [] as Array<Record<string, unknown>>,
    loading: true,
    error: null as string | null,
  },
  scopedGrowState: {
    urlGrowId: "grow-a" as string | null,
    scopedGrow: null as Record<string, unknown> | null,
    scopedGrowName: null as string | null,
    isValidScopedGrow: false,
    backHref: "/grows/grow-a" as string | undefined,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec = {
      table,
      columns: null as string | null,
      filters: [] as Array<{ column: string; value: unknown }>,
    };
    const query = {
      select(columns: string) {
        spec.columns = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        spec.filters.push({ column, value });
        return query;
      },
      is() {
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
      or() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(
        onFulfilled?: (value: { data: unknown[]; error: null; count: number }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const snapshot = {
          table: spec.table,
          columns: spec.columns,
          filters: spec.filters.map((filter) => ({ ...filter })),
        };
        return Promise.resolve(harness.executeQuery(snapshot)).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: { from: () => ({ createSignedUrls: vi.fn(async () => ({ data: [] })) }) },
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
    reload: vi.fn(),
  }),
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

function queries() {
  return harness.executeQuery.mock.calls.map(
    ([spec]) =>
      spec as {
        table: string;
        columns: string | null;
        filters: Array<{ column: string; value: unknown }>;
      },
  );
}

function diaryReads() {
  return queries().filter((spec) => spec.table === "diary_entries").length;
}

function directoryTentReads() {
  return queries().filter(
    (spec) =>
      spec.table === "tents" &&
      spec.columns === "id" &&
      spec.filters.some((filter) => filter.column === "grow_id" && filter.value === "grow-a"),
  ).length;
}

function TimelineHarness() {
  const [, setTick] = useState(0);
  return (
    <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
      <Timeline />
      <button
        type="button"
        data-testid="refresh-harness"
        onClick={() => setTick((tick) => tick + 1)}
      >
        Refresh harness
      </button>
    </MemoryRouter>
  );
}

function settleGrowList() {
  harness.growsState = {
    activeGrow: GROW_A,
    activeGrowId: "grow-a",
    grows: [GROW_A],
    loading: false,
    error: null,
  };
  harness.scopedGrowState = {
    urlGrowId: "grow-a",
    scopedGrow: GROW_A,
    scopedGrowName: "Current Run A",
    isValidScopedGrow: true,
    backHref: "/grows/grow-a",
  };
}

describe("timeline directory sensor refresh", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation(() => ({ data: [], error: null, count: 0 }));
    harness.growsState = {
      activeGrow: GROW_A,
      activeGrowId: "grow-a",
      grows: [GROW_A],
      loading: false,
      error: null,
    };
    harness.scopedGrowState = {
      urlGrowId: "grow-a",
      scopedGrow: GROW_A,
      scopedGrowName: "Current Run A",
      isValidScopedGrow: true,
      backHref: "/grows/grow-a",
    };
  });

  it("reloads manual sensor receipts after a core timeline refresh", async () => {
    render(<TimelineHarness />);
    await waitFor(() => {
      expect(directoryTentReads()).toBeGreaterThan(0);
    });
    const beforeRefresh = directoryTentReads();

    act(() => {
      window.dispatchEvent(new Event("verdant:sensor-reading-created"));
    });

    await waitFor(() => {
      expect(directoryTentReads()).toBeGreaterThan(beforeRefresh);
    });
  });

  it("does not start a second core diary read when the grow list settles", async () => {
    harness.growsState = {
      activeGrow: null,
      activeGrowId: null,
      grows: [],
      loading: true,
      error: null,
    };
    harness.scopedGrowState = {
      urlGrowId: "grow-a",
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: "/grows/grow-a",
    };
    render(<TimelineHarness />);
    await waitFor(() => {
      expect(diaryReads()).toBeGreaterThan(0);
    });
    const beforeSettle = diaryReads();

    settleGrowList();
    act(() => {
      screen.getByTestId("refresh-harness").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(diaryReads()).toBe(beforeSettle);
  });

  it("starts the directory sensor read on settle without repeating the core read", async () => {
    harness.growsState = {
      activeGrow: null,
      activeGrowId: null,
      grows: [],
      loading: true,
      error: null,
    };
    harness.scopedGrowState = {
      urlGrowId: "grow-a",
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: "/grows/grow-a",
    };
    render(<TimelineHarness />);
    await waitFor(() => {
      expect(diaryReads()).toBeGreaterThan(0);
    });
    // The directory scope is unknown while the grow list loads.
    expect(directoryTentReads()).toBe(0);
    const beforeSettle = diaryReads();

    settleGrowList();
    act(() => {
      screen.getByTestId("refresh-harness").click();
    });

    // Waiting for the directory read proves every effect for the settled
    // scope has run. The core diary read must still have been issued once.
    await waitFor(() => {
      expect(directoryTentReads()).toBeGreaterThan(0);
    });
    expect(diaryReads()).toBe(beforeSettle);
  });

  it("queries the diary with the trimmed store grow id the scope rule returns", async () => {
    harness.growsState = {
      activeGrow: GROW_A,
      activeGrowId: " grow-a ",
      grows: [GROW_A],
      loading: false,
      error: null,
    };
    harness.scopedGrowState = {
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    };
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(diaryReads()).toBeGreaterThan(0);
    });
    const growIds = queries()
      .filter((spec) => spec.table === "diary_entries")
      .flatMap((spec) => spec.filters.filter((f) => f.column === "grow_id").map((f) => f.value));
    expect(growIds.length).toBeGreaterThan(0);
    expect(growIds.every((value) => value === "grow-a")).toBe(true);
  });
});
