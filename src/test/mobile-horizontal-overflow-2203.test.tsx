/**
 * Behavioral and rendered regression tests for issue #2203:
 * Mobile (375px): Timeline, Plant and Dashboard pages overflow horizontally.
 *
 * jsdom performs no CSS layout, so these tests pin the rendered class contract
 * per component. The real-layout proof is
 * `e2e/mobile-horizontal-overflow-2203.spec.ts`: it renders all three routes at
 * 375x812 in Chromium and asserts document and page-root
 * `scrollWidth <= clientWidth`.
 *
 * Covers the specific overflow surfaces reproduced at 375x812:
 * 1. Timeline:
 *    - CultivationCalendarMonthGrid positions its horizontal scroller and day cells
 *      (`relative`) so `.sr-only` (`position: absolute`) inside day 7 cells cannot
 *      escape the `overflow-x: auto` container to x=624px on the document.
 *    - Stage progression (`timeline-stage-progression-scroll` + `<ol>`) renders a
 *      3-column mobile grid (`grid-cols-3 sm:min-w-[34rem] sm:grid-cols-6`) so all
 *      6 stages (Seedling through Drying / Curing) fit at 375px without cutting off
 *      at 'Flush…' or requiring sideways page scroll.
 *    - WateringHistoryPanel and FeedingHistoryPanel row headers wrap (`flex-wrap`)
 *      when timestamps, provenance badges, integrity controls, and warning badges coexist.
 * 2. Plant page:
 *    - PlantAssignedTentAlertsPanel wraps its badge group and action button group
 *      (`Ask AI Doctor`, `Stage Targets`, `View Alert`) instead of overflowing to ~455px.
 *    - PlantDetailHarvestWatchCard wraps its `Next inspection` CTA button text inside
 *      narrow cards (`whitespace-normal min-w-0 max-w-full`).
 *    - PlantDailyGrowCheckConsistencyCard 7-day breakdown cells use `min-w-0` and
 *      wrap day method labels so 7 columns stay within 375px and the full
 *      method stays readable on touch screens.
 * 3. Dashboard:
 *    - SensorChart wraps its header/legend/CSV export and range selector (`flex-wrap`)
 *      instead of forcing the chart card to ~409px.
 *    - TonightTentHomeCard metric tiles use `min-w-0`; labels truncate but sensor
 *      values wrap, so 3-column metrics fit 375px without hiding a reading or unit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  growsState: {
    activeGrow: {
      id: "grow-2203-1",
      name: "QA Pass 29 Grow",
      stage: "veg",
      started_at: "2026-10-01T00:00:00.000Z",
    } as Record<string, unknown> | null,
    activeGrowId: "grow-2203-1" as string | null,
    grows: [
      {
        id: "grow-2203-1",
        name: "QA Pass 29 Grow",
        stage: "veg",
        started_at: "2026-10-01T00:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec = { table, filters: [] as Array<{ column: string; value: unknown }> };
    const query = {
      select() {
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
      maybeSingle() {
        return Promise.resolve(harness.executeQuery({ ...spec, single: true }));
      },
      single() {
        return Promise.resolve(harness.executeQuery({ ...spec, single: true }));
      },
      then(onfulfilled?: (value: unknown) => unknown) {
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled);
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
  useAuth: () => ({ user: { id: "owner-2203" }, session: null, loading: false }),
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
    backHref: "/grows",
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    entitlement: {
      isActive: true,
      effectivePlanId: "free",
      capabilities: { aiCreditsPerGrow: 3 },
    },
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

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "ok",
    openCount: 1,
    rows: [
      {
        id: "alert-2203-1",
        tentId: "tent-2203-1",
        growId: "grow-2203-1",
        severity: "warning",
        severityLabel: "Warning",
        status: "open",
        title: "Temperature above stage range",
        reason: "Temperature 35.6°C is above the veg target range (20–28°C).",
        metric: "temp",
        lastSeenAt: "2026-10-16T12:00:00.000Z",
      },
    ],
  }),
}));

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Revision history unavailable",
  useQuickLogRevisionBadges: () => ({
    badges: new Map(),
    status: "ok",
  }),
}));

vi.mock("@/hooks/useDailyGrowCheckReads", () => ({
  useDailyGrowCheckReads: () => ({
    state: "ready",
    rawReadings: [],
    rawDiary: [],
    plants: [{ id: "plant-2203-1", tent_id: "tent-2203-1" }],
  }),
}));

const relativeTimelineHarness = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("@/hooks/usePlantRelativeTimelineHistory", () => ({
  usePlantRelativeTimelineHistory: () => {
    const read = relativeTimelineHarness.read();
    return { ...read, totalCount: read?.data?.length ?? null };
  },
}));

import Timeline from "@/pages/Timeline";
import CultivationCalendarMonthGrid from "@/components/CultivationCalendarMonthGrid";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import FeedingHistoryPanel from "@/components/FeedingHistoryPanel";
import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";
import PlantDetailHarvestWatchCard from "@/components/PlantDetailHarvestWatchCard";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";
import SensorChart from "@/components/SensorChart";
import TonightTentHomeCard from "@/components/TonightTentHomeCard";
import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/timeline"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Issue #2203 — mobile (375px) horizontal overflow regression suite", () => {
  beforeEach(() => {
    cleanup();
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation(() => ({ data: [], error: null, count: 0 }));
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Timeline Stage progression in a 3-column mobile grid so all 6 stages are readable at 375px without cutting off at 'Flush…'", async () => {
    harness.executeQuery.mockImplementation((spec: { table: string }) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-2203-1",
              note: "A".repeat(250),
              photo_url: null,
              stage: "veg",
              details: { event_type: "watering", source: "manual", water_ml: 500 },
              entry_at: "2026-10-16T12:00:00.000Z",
              plant_id: "plant-1",
              tent_id: "tent-1",
            },
          ],
          error: null,
          count: 1,
        };
      }
      return { data: [], error: null, count: 0 };
    });

    renderWithProviders(<Timeline />);

    const scroller = await screen.findByTestId("timeline-stage-progression-scroll");

    let timelineRoot: Element | null = scroller;
    while (timelineRoot && !timelineRoot.className.includes("overflow-x-clip")) {
      timelineRoot = timelineRoot.parentElement;
    }
    expect(timelineRoot?.className).toContain("min-w-0");
    expect(timelineRoot?.className).toContain("max-w-full");
    expect(timelineRoot?.className).toContain("overflow-x-clip");

    expect(scroller.className).toContain("min-w-0");
    expect(scroller.className).toContain("max-w-full");

    const stageList = scroller.querySelector("ol");
    expect(stageList).toBeTruthy();
    expect(stageList?.className).toContain("grid-cols-3");
    expect(stageList?.className).toContain("sm:min-w-[34rem]");
    expect(stageList?.className).toContain("sm:grid-cols-6");
    expect(stageList?.className).not.toMatch(/(?:^|\s)min-w-\[34rem\](?:\s|$)/);

    for (const label of [
      "Seedling",
      "Vegetative",
      "Flowering",
      "Flushing",
      "Harvest",
      "Drying / Curing",
    ]) {
      expect(within(scroller).getByText(label)).toBeInTheDocument();
    }

    const entryBody = await screen.findByTestId("timeline-entry-body");
    expect(entryBody.className).toContain("[overflow-wrap:anywhere]");
    expect(entryBody.className).toContain("min-w-0");
    expect(entryBody.className).toContain("max-w-full");
  });

  it("anchors CultivationCalendarMonthGrid scroller and day cells as positioned containing blocks so .sr-only spans cannot widen the document to 624px", () => {
    render(
      <CultivationCalendarMonthGrid
        monthKey="2026-10"
        groups={[]}
        now={new Date("2026-10-16T12:00:00Z")}
      />,
    );

    const scroller = screen.getByTestId("cultivation-calendar-horizontal-scroll");
    expect(scroller.className).toContain("relative");
    expect(scroller.className).toContain("min-w-0");
    expect(scroller.className).toContain("max-w-full");

    const dayCells = screen.getAllByTestId("cultivation-calendar-day");
    expect(dayCells.length).toBe(42);
    for (const cell of dayCells) {
      expect(cell.className).toContain("relative");
      expect(cell.className).toContain("min-w-0");
    }
  });

  it("wraps WateringHistoryPanel and FeedingHistoryPanel row headers when warnings and controls are present", () => {
    const wateringRaw = [
      {
        id: "w-2203-1",
        entry_at: "2026-10-16T12:00:00.000Z",
        plant_id: "plant-1",
        tent_id: "tent-1",
        note: "Watered 500ml",
        details: {
          event_type: "watering",
          source: "manual",
          water_ml: 500,
          ph: 9.5,
          grow_event_id: "ge-w-2203-1",
        },
      },
    ];
    const feedingRaw = [
      {
        id: "f-2203-1",
        entry_at: "2026-10-16T12:00:00.000Z",
        plant_id: "plant-1",
        tent_id: "tent-1",
        note: "Fed Cronk",
        details: {
          event_type: "feeding",
          source: "manual",
          water_ml: 500,
          ph: 9.5,
          grow_event_id: "ge-f-2203-1",
        },
      },
    ];

    renderWithProviders(
      <>
        <WateringHistoryPanel rawEntries={wateringRaw} />
        <FeedingHistoryPanel rawEntries={feedingRaw} />
      </>,
    );

    const wateringPanel = screen.getByTestId("watering-history-panel");
    const wateringItem = wateringPanel.querySelector("li");
    const wateringHeader = wateringItem?.firstElementChild as HTMLElement | null;
    expect(wateringHeader).toBeTruthy();
    expect(wateringHeader?.className).toContain("flex-wrap");

    const feedingPanel = screen.getByTestId("feeding-history-panel");
    const feedingItem = feedingPanel.querySelector("li");
    const feedingHeader = feedingItem?.firstElementChild as HTMLElement | null;
    expect(feedingHeader).toBeTruthy();
    expect(feedingHeader?.className).toContain("flex-wrap");
  });

  it("wraps PlantAssignedTentAlertsPanel action buttons at 375px instead of overflowing to 455px", () => {
    renderWithProviders(
      <PlantAssignedTentAlertsPanel
        tentId="tent-2203-1"
        tentName="Main 4x4 Tent"
        growId="grow-2203-1"
        plantId="plant-2203-1"
      />,
    );

    const row = screen.getByTestId("plant-assigned-tent-alert-row");
    const askDoctor = within(row).getByTestId("plant-assigned-tent-alert-ask-doctor");
    const stageTargets = within(row).getByTestId("plant-assigned-tent-alert-target-band");
    const viewAlert = within(row).getByTestId("plant-assigned-tent-alert-view");

    expect(askDoctor).toBeInTheDocument();
    expect(stageTargets).toBeInTheDocument();
    expect(viewAlert).toBeInTheDocument();

    const actionsGroup = viewAlert.parentElement;
    expect(actionsGroup).toBeTruthy();
    expect(actionsGroup?.className).toContain("flex-wrap");
    expect(actionsGroup?.className).toContain("min-w-0");

    const badgesGroup = within(row).getByTestId("plant-assigned-tent-alert-severity").parentElement;
    expect(badgesGroup).toBeTruthy();
    expect(badgesGroup?.className).toContain("flex-wrap");
  });

  it("wraps PlantDetailHarvestWatchCard Next inspection CTA and wraps PlantDailyGrowCheckConsistencyCard 7-day method labels", async () => {
    const plantUuid = "33333333-3333-4333-8333-333333333333";
    const tentUuid = "22222222-2222-4222-8222-222222222222";
    const growUuid = "11111111-1111-4111-8111-111111111111";
    harness.executeQuery.mockImplementation((spec: { table: string; single?: boolean }) => {
      if (spec.table === "plants" && spec.single) {
        return {
          data: {
            id: plantUuid,
            user_id: "owner-2203",
            grow_id: growUuid,
            tent_id: tentUuid,
            name: "Blue Dream #1",
            strain: "Blue Dream",
            stage: "flower",
            started_at: "2026-09-01T00:00:00.000Z",
            health: "healthy",
            plant_type: "photoperiod",
            photo_url: null,
            last_note: null,
            is_archived: false,
            medium: "coco",
            pot_size: "5 gal",
            created_at: "2026-09-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      return { data: [], error: null };
    });

    renderWithProviders(
      <>
        <PlantDetailHarvestWatchCard plantId={plantUuid} />
        <PlantDailyGrowCheckConsistencyCard
          plantId={plantUuid}
          currentTentId={tentUuid}
          trackingStartedAt="2026-09-01T00:00:00.000Z"
        />
      </>,
    );

    const nextInspectionCta = await screen.findByTestId(
      "plant-detail-harvest-watch-next-inspection-cta",
    );
    expect(nextInspectionCta.className).toContain("whitespace-normal");
    expect(nextInspectionCta.className).toContain("min-w-0");
    expect(nextInspectionCta.className).toContain("max-w-full");

    const dayCells = screen.getAllByTestId("plant-daily-grow-check-method-breakdown-day");
    expect(dayCells.length).toBe(7);
    for (const cell of dayCells) {
      expect(cell.className).toContain("min-w-0");
      const methodLabel = within(cell).getByTestId(
        "plant-daily-grow-check-method-breakdown-day-label",
      );
      // The full method stays visible on touch screens: it wraps, never truncates.
      expect(methodLabel.className).not.toContain("truncate");
      expect(methodLabel.className).toContain("[overflow-wrap:anywhere]");
      expect(methodLabel.className).toContain("max-w-full");
    }
  });

  it("wraps SensorChart header controls so the chart card does not force Dashboard to 408px", () => {
    renderWithProviders(
      <SensorChart
        data={[
          {
            tentId: "tent-1",
            ts: "2026-10-16T12:00:00.000Z",
            capturedAt: "2026-10-16T12:00:00.000Z",
            temp: 24.5,
            rh: 60,
            vpd: 1.2,
            co2: 800,
            soil: 45,
            source: "manual",
            status: "usable",
          },
        ]}
        metric="temp"
        height={200}
      />,
    );

    const rangeSelector = screen.getByTestId("sensor-chart-range-selector");
    expect(rangeSelector.className).toContain("flex-wrap");

    const headerRow = rangeSelector.parentElement;
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("flex-wrap");

    const chartRoot = headerRow?.parentElement;
    expect(chartRoot?.className).toContain("min-w-0");
    expect(chartRoot?.className).toContain("overflow-hidden");

    const legendGroup = screen.getByTestId("sensor-chart-legend").parentElement;
    expect(legendGroup?.className).toContain("flex-wrap");
  });

  it("wraps PlantRelativeTimelineSection plant-day metadata row with flex-wrap at 375px", () => {
    relativeTimelineHarness.read.mockReturnValue({
      data: [
        {
          id: "relative-2203-1",
          plant_id: "plant-2203-1",
          entry_at: "2026-10-10T08:00:00.000Z",
          entry_type: "note",
          note: "Routine check",
          photo_url: null,
          details: null,
          stage: "veg",
        },
      ],
      isLoading: false,
    });

    renderWithProviders(
      <PlantRelativeTimelineSection
        plantId="plant-2203-1"
        plantStartedAt="2026-09-01T00:00:00.000Z"
        currentStage="vegetation"
      />,
    );

    const plantDay = screen.getByTestId("relative-timeline-plant-day");
    const metaRow = plantDay.parentElement;
    expect(metaRow?.className).toContain("flex-wrap");
  });

  it("constrains TonightTentHomeCard 3-column metric tiles with min-w-0 and wraps values at 375px", () => {
    renderWithProviders(
      <TonightTentHomeCard
        selection={{
          kind: "tent",
          basis: "only",
          tent: {
            id: "tent-1",
            name: "Main 4x4 Tent",
            growId: "grow-1",
          },
        }}
        metrics={[
          {
            key: "temp",
            label: "Temperature",
            state: "loading",
            value: null,
            source: null,
            sourceLabel: null,
            capturedAt: null,
            ageText: null,
          },
          {
            key: "rh",
            label: "RH",
            state: "loading",
            value: null,
            source: null,
            sourceLabel: null,
            capturedAt: null,
            ageText: null,
          },
          {
            key: "vpd",
            label: "VPD",
            state: "loading",
            value: null,
            source: null,
            sourceLabel: null,
            capturedAt: null,
            ageText: null,
          },
        ]}
        lastLog={{ kind: "none_today", text: "No log today" }}
        logHref="/daily-check"
      />,
    );

    const card = screen.getByTestId("tonight-tent-home");
    const headerRow = card.querySelector("#tonight-tent-home-heading")?.parentElement;
    expect(headerRow?.className).toContain("flex-wrap");

    const heading = screen.getByRole("heading", { name: /Main 4x4 Tent/i });
    expect(heading.className).toContain("min-w-0");
    const tentLink = within(heading).getByRole("link", { name: "Main 4x4 Tent" });
    expect(tentLink.className).toContain("break-words");
    expect(tentLink.className).toContain("min-w-0");

    for (const key of ["temp", "rh", "vpd"] as const) {
      const tile = screen.getByTestId(`tonight-tent-home-metric-${key}`);
      expect(tile.className).toContain("min-w-0");
      const dt = tile.querySelector("dt");
      const dd = tile.querySelector("dd");
      expect(dt?.className).toContain("truncate");
      // A sensor reading and its unit are never cut off; the value wraps.
      expect(dd?.className).not.toContain("truncate");
      expect(dd?.className).toContain("[overflow-wrap:anywhere]");
    }
  });
});
