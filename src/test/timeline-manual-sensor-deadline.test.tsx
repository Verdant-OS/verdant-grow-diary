/**
 * A hung manual-sensor read must not look like a complete Timeline.
 * The directory loader is detached from the core supplemental tasks, so the
 * deadline has to mark the source partial on its own, whether the tent lookup
 * or the sensor-reading queries hang.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { CRITICAL_READ_DEADLINE_MS } from "@/lib/boundedReadRules";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
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

const GROW_A = {
  id: "grow-a",
  name: "Current Run A",
  stage: "vegetative",
  started_at: "2026-07-01T00:00:00.000Z",
};

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: GROW_A,
    activeGrowId: "grow-a",
    grows: [GROW_A],
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: "grow-a",
    scopedGrow: GROW_A,
    scopedGrowName: "Current Run A",
    isValidScopedGrow: true,
    backHref: "/grows/grow-a",
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

beforeEach(() => {
  vi.useRealTimers();
  harness.executeQuery.mockReset();
  harness.executeQuery.mockImplementation((spec: { table: string; columns: string | null }) => {
    if (spec.table === "sensor_readings_effective") return new Promise(() => {});
    if (spec.table === "tents" && spec.columns === "id") {
      return { data: [{ id: "tent-1" }], error: null };
    }
    return { data: [], error: null, count: 0 };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("timeline manual sensor deadline", () => {
  it("marks manual sensors partial when the read never settles", async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("timeline-partial-read-warning")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(screen.getByTestId("timeline-partial-read-warning")).toBeInTheDocument();
  });

  it("marks manual sensors partial when the directory tent lookup never settles", async () => {
    harness.executeQuery.mockImplementation((spec: { table: string; columns: string | null }) => {
      if (spec.table === "tents" && spec.columns === "id") return new Promise(() => {});
      return { data: [], error: null, count: 0 };
    });
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("timeline-partial-read-warning")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(screen.getByTestId("timeline-partial-read-warning")).toBeInTheDocument();
  });
  it("keeps linked context loading until a hung manual-sensor read settles", async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Core supplemental reads have settled; the detached sensor read has not.
    expect(screen.getByTestId("timeline-linked-context-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-partial-read-warning")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(screen.queryByTestId("timeline-linked-context-loading")).toBeNull();
    expect(screen.getByTestId("timeline-partial-read-warning")).toBeInTheDocument();
  });

  it("keeps linked context loading while the directory tent lookup is pending", async () => {
    harness.executeQuery.mockImplementation((spec: { table: string; columns: string | null }) => {
      if (spec.table === "tents" && spec.columns === "id") return new Promise(() => {});
      return { data: [], error: null, count: 0 };
    });
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("timeline-linked-context-loading")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    });
    expect(screen.queryByTestId("timeline-linked-context-loading")).toBeNull();
    expect(screen.getByTestId("timeline-partial-read-warning")).toBeInTheDocument();
  });

  it("clears linked context loading once the manual-sensor read settles", async () => {
    harness.executeQuery.mockImplementation((spec: { table: string; columns: string | null }) => {
      if (spec.table === "tents" && spec.columns === "id") {
        return { data: [{ id: "tent-1" }], error: null };
      }
      return { data: [], error: null, count: 0 };
    });
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/timeline?growId=grow-a"]}>
        <Timeline />
      </MemoryRouter>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("timeline-linked-context-loading")).toBeNull();
    expect(screen.queryByTestId("timeline-partial-read-warning")).toBeNull();
  });
});
