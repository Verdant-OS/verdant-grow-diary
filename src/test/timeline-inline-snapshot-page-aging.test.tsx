/**
 * Timeline inline snapshot — page-level idle aging (#1670, review finding F1670-1).
 *
 * `timeline-snapshot-clock.test.tsx` proves `TimelineSnapshotClock` in isolation
 * through a hand-written parent. This file mounts the real Timeline page and
 * proves the page wiring: a manual snapshot rendered while fresh must acquire
 * the stale stage-guidance qualifier once its age crosses the manual freshness
 * window, with no click, no parent re-render trigger, and no refetch.
 *
 * Dropping the clock wrapper, or a clock that never fires at the freshness
 * boundary, leaves the unqualified "In Veg VPD range" on screen and fails here.
 */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";

interface QuerySpec {
  table: string;
}

interface QueryResult {
  data: unknown[] | null;
  error: unknown | null;
  count?: number | null;
}

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn<(spec: QuerySpec) => QueryResult>(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  upsert: vi.fn(),
  capturedQueries: [] as QuerySpec[],
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      gte: () => query,
      lte: () => query,
      lt: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      insert: (...args: unknown[]) => harness.insert(...args),
      update: (...args: unknown[]) => harness.update(...args),
      delete: (...args: unknown[]) => harness.delete(...args),
      upsert: (...args: unknown[]) => harness.upsert(...args),
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        const spec: QuerySpec = { table };
        harness.capturedQueries.push(spec);
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: {
        from: () => ({
          createSignedUrls: () => Promise.resolve({ data: [], error: null }),
        }),
      },
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
  started_at: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: GROW_A,
    activeGrowId: GROW_A.id,
    grows: [GROW_A],
    loading: false,
    error: null,
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

vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));

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
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));
vi.mock("@/components/SymptomEvidenceChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/TimelineLightingGuideCard", () => ({ default: () => null }));

import Timeline from "@/pages/Timeline";

const MIN = 60_000;
const NOW = new Date("2026-09-23T12:00:00.000Z");
// One minute inside the manual freshness window at mount, so incidental
// real-time drift while the page loads cannot cross the boundary early.
const CAPTURED_AT = new Date(NOW.getTime() - MANUAL_CURRENT_STATE_STALE_MS + MIN).toISOString();

const MANUAL_SNAPSHOT_ROW = {
  id: "inline-snapshot-row",
  note: "Inline snapshot",
  photo_url: null,
  stage: "veg",
  entry_at: CAPTURED_AT,
  plant_id: null,
  tent_id: null,
  details: {
    source: "manual",
    sensor_snapshot: { source: "manual", ts: CAPTURED_AT, temp: 24, rh: 55, vpd: 1.1 },
  },
};

function diaryQueryCount() {
  return harness.capturedQueries.filter((q) => q.table === "diary_entries").length;
}

describe("Timeline page — inline manual snapshot ages while idle", () => {
  beforeEach(() => {
    // shouldAdvanceTime keeps async data loading and findBy* polling working;
    // the explicit advance below is what crosses the freshness boundary.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    harness.executeQuery.mockReset();
    harness.insert.mockReset();
    harness.update.mockReset();
    harness.delete.mockReset();
    harness.upsert.mockReset();
    harness.capturedQueries.length = 0;
    harness.executeQuery.mockImplementation((spec) => {
      if (spec.table === "diary_entries") {
        return { data: [MANUAL_SNAPSHOT_ROW], error: null, count: 1 };
      }
      return { data: [], error: null };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("qualifies stage guidance as stale after the window passes, without interaction or refetch", async () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );

    const hint = await screen.findByTestId("timeline-vpd-stage-hint");
    expect(hint).toHaveTextContent(/^In Veg VPD range$/);
    const snapshot = screen.getByTestId("timeline-manual-snapshot");
    expect(snapshot).toHaveTextContent("VPD 1.1");
    const readsBeforeIdle = diaryQueryCount();
    expect(
      buildTimelineEvidenceDetailViewModel(MANUAL_SNAPSHOT_ROW, { nowMs: Date.now() })?.sensor
        ?.isStale,
    ).toBe(false);
    // findBy* resolves on the DOM commit, before React runs the passive effect
    // that arms the minute clock. Flush it so the idle advance below is real.
    await act(async () => {});

    act(() => {
      vi.advanceTimersByTime(
        new Date(CAPTURED_AT).getTime() + MANUAL_CURRENT_STATE_STALE_MS - Date.now(),
      );
    });
    expect(screen.getByTestId("timeline-vpd-stage-hint")).toHaveTextContent(/^In Veg VPD range$/);
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId("timeline-vpd-stage-hint")).toHaveTextContent(
      /^In Veg VPD range \(historical, stale reading\)$/,
    );
    // The historical reading itself is preserved, not withdrawn.
    expect(screen.getByTestId("timeline-manual-snapshot")).toHaveTextContent("VPD 1.1");
    // Aging came from the clock, not from a re-read of the diary.
    expect(diaryQueryCount()).toBe(readsBeforeIdle);
    expect(
      buildTimelineEvidenceDetailViewModel(MANUAL_SNAPSHOT_ROW, { nowMs: Date.now() })?.sensor
        ?.isStale,
    ).toBe(true);
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.delete).not.toHaveBeenCalled();
    expect(harness.upsert).not.toHaveBeenCalled();
  });

  it.each(["manual", "user", "entry", "log", "", undefined])(
    "keeps %s snapshots current past the live window",
    async (source) => {
      const ts = new Date(NOW.getTime() - 16 * MIN).toISOString();
      const row = {
        ...MANUAL_SNAPSHOT_ROW,
        details: {
          ...MANUAL_SNAPSHOT_ROW.details,
          sensor_snapshot: { ...MANUAL_SNAPSHOT_ROW.details.sensor_snapshot, source, ts },
        },
      };
      harness.executeQuery.mockImplementation((spec) => ({
        data: spec.table === "diary_entries" ? [row] : [],
        error: null,
      }));
      render(
        <MemoryRouter initialEntries={["/timeline"]}>
          <Timeline />
        </MemoryRouter>,
      );
      expect(await screen.findByTestId("timeline-vpd-stage-hint")).toHaveTextContent(
        /^In Veg VPD range$/,
      );
    },
  );

  it.each(["live", "unknown", "invalid", "csv", "demo"])(
    "never promotes persisted %s provenance to current stage guidance",
    async (source) => {
      const row = {
        ...MANUAL_SNAPSHOT_ROW,
        details: {
          ...MANUAL_SNAPSHOT_ROW.details,
          sensor_snapshot: { ...MANUAL_SNAPSHOT_ROW.details.sensor_snapshot, source },
        },
      };
      harness.executeQuery.mockImplementation((spec) => ({
        data: spec.table === "diary_entries" ? [row] : [],
        error: null,
      }));
      render(
        <MemoryRouter initialEntries={["/timeline"]}>
          <Timeline />
        </MemoryRouter>,
      );
      await screen.findByTestId("timeline-manual-snapshot");
      const hint = screen.queryByTestId("timeline-vpd-stage-hint");
      if (hint) expect(hint).toHaveTextContent(/historical|stale/);
      expect(
        buildTimelineEvidenceDetailViewModel(row, { nowMs: Date.now() })?.sensor
          ?.canSupportCurrentContext,
      ).toBe(false);
    },
  );

  it.each(["", "not-a-date"])("keeps an unusable capture timestamp %j stale", async (ts) => {
    const row = {
      ...MANUAL_SNAPSHOT_ROW,
      details: {
        ...MANUAL_SNAPSHOT_ROW.details,
        sensor_snapshot: { ...MANUAL_SNAPSHOT_ROW.details.sensor_snapshot, ts },
      },
    };
    harness.executeQuery.mockImplementation((spec) => ({
      data: spec.table === "diary_entries" ? [row] : [],
      error: null,
    }));
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("timeline-vpd-stage-hint")).toHaveTextContent(
      /historical, stale reading/,
    );
  });
});
