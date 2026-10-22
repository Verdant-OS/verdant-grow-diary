import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { SensorReading } from "@/mock";
import type { SensorReadingLike } from "@/lib/sensorSnapshot";

const OWNED_TENT = {
  id: "tent-1",
  name: "Proof tent",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  growId: "grow-1",
};

const state = vi.hoisted(() => ({
  rows: [] as SensorReadingLike[],
  manuals: [] as SensorReading[],
  tent: null as unknown,
  manualArgs: [] as unknown[],
  manualPending: false,
  manualError: false,
  manualRefetch: vi.fn(() => Promise.resolve([])),
  stability: null as unknown,
  snapshot: { status: "idle", snapshot: null } as { status: string; snapshot: unknown },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/useGrowData", async (original) => ({
  ...(await original<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: state.tent,
    isLoading: false,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
  }),
  useGrowPlants: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: state.rows, isPending: false, isError: false }),
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: (tentId: unknown) => {
    state.manualArgs.push(tentId);
    return {
      data: state.manuals,
      isPending: state.manualPending,
      isLoading: state.manualPending,
      isError: state.manualError,
      isSuccess: !state.manualPending && !state.manualError,
      fetchStatus: state.manualPending ? "fetching" : "idle",
      refetch: state.manualRefetch,
    };
  },
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentStabilityCard", () => ({
  default: ({ result }: { result: unknown }) => {
    state.stability = result;
    return null;
  },
}));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({
  default: ({ label, value }: { label: string; value: unknown }) => (
    <span data-testid={`metric-chip-${label}`}>{String(value)}</span>
  ),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => state.snapshot,
}));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotChangeContext", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ImportedSensorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/TentPlantRosterPanel", () => ({ default: () => null }));
vi.mock("@/components/TentPlantTabs", () => ({ default: () => null }));
vi.mock("@/components/TentPlantActivityPanels", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";
import { formatSensorValue } from "@/lib/sensorFormat";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const clients: QueryClient[] = [];

function manualVpd(iso: string): SensorReading {
  return {
    ts: iso,
    capturedAt: iso,
    tentId: "tent-1",
    temp: 0,
    rh: 0,
    vpd: 1,
    co2: 0,
    soil: 0,
    observedMetrics: ["vpd"],
    source: "manual",
    status: "usable",
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/tent-1"]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.rows = [];
  state.manuals = [];
  state.tent = OWNED_TENT;
  state.manualArgs = [];
  state.manualPending = false;
  state.manualError = false;
  state.manualRefetch.mockClear();
  state.stability = null;
  state.snapshot = { status: "idle", snapshot: null };
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("Tent detail fallback VPD freshness", () => {
  it("marks a two-day-old Quick Log VPD historical when no stored rows exist", () => {
    const ts = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.manuals = [manualVpd(ts)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    // The fallback's provenance sits on the VPD-specific element.
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-vpd-captured")).toBeVisible();
    // No stored snapshot: the shared Environment header claims nothing.
    expect(screen.queryByTestId("tent-detail-sensor-source")).toBeNull();
    expect(screen.queryByTestId("tent-detail-sensor-captured")).toBeNull();
  });

  it("withholds a stored VPD whose own row is quality-flagged, even with no climate pair (Codex P1 at 307b10f4)", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    // The Dashboard selector drops this row; Tonight is therefore missing, and
    // the header is the only thing still holding the value.
    state.rows = [
      {
        metric: "vpd_kpa",
        value: 1.2,
        ts,
        captured_at: ts,
        source: "live",
        quality: "invalid",
      } as never,
    ];
    mount();
    expect(screen.queryByTestId("metric-chip-VPD")).toBeNull();
    expect(screen.queryByTestId("tent-detail-vpd-stage-hint")).toBeNull();
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
  });

  it("does not let a fresh temperature-only row make an old Quick Log VPD current", () => {
    const tempTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
  });

  it("keeps a fresh Quick Log VPD current when the stored snapshot is already stale", () => {
    const tempTs = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "In Veg VPD range. VPD targets depend on plant stage.",
    );
    expect(screen.queryByTestId("tent-detail-vpd-stale")).toBeNull();
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
  });

  it("never shows a recent CSV fallback VPD as a healthy current reading (Codex P1 at 5211eb07)", () => {
    const tempTs = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [{ ...manualVpd(vpdTs), source: "csv" }];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).not.toHaveTextContent(
      "In Veg VPD range. VPD targets",
    );
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
  });
});

// Repair of #2148 review findings.
describe("Tent detail mixed-metric provenance (Codex P1 4288338459)", () => {
  it("keeps the shared Environment header on the stored snapshot's source, time and staleness", () => {
    const tempTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
      { metric: "humidity_pct", value: 55, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-source")).not.toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-sensor-captured")).toHaveTextContent("5 minutes ago");
    // The live temp/RH are fresh; the old manual VPD must not mark them stale.
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    // #2268 / VER-189: the fresh same-capture live pair's calculated VPD wins over the
    // two-day-old manual VPD, as on the Dashboard Tonight card, with its own provenance.
    expect(screen.getByTestId("tent-detail-vpd-provenance")).toHaveTextContent(
      "Calculated from temperature and RH",
    );
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Live sensor");
    expect(screen.getByTestId("tent-detail-vpd-captured")).toHaveTextContent("5 minutes ago");
    expect(screen.queryByTestId("tent-detail-vpd-stale")).toBeNull();
  });

  it("shows no separate VPD provenance when the stored snapshot observed VPD", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts, captured_at: ts, source: "live" },
      { metric: "humidity_pct", value: 55, ts, captured_at: ts, source: "live" },
      { metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" },
    ];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-source")).toBeVisible();
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
  });
});

describe("Tent detail VPD sensor truth (Copilot 4286153360)", () => {
  it("does not restore or grade a VPD whose stored RH failed realism", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts, captured_at: ts, source: "live" },
      { metric: "humidity_pct", value: 150, ts, captured_at: ts, source: "live" },
      { metric: "vpd_kpa", value: 1.2, ts, captured_at: ts, source: "live" },
    ];
    mount();
    // Header: the snapshot rejected this VPD and no fallback brings it back.
    expect(screen.queryByTestId("tent-detail-vpd-stage-hint")).toBeNull();
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
    // Card: the rejected VPD is not graded.
    const stability = state.stability as { last24h: { totalConsidered: number } } | null;
    expect(stability?.last24h.totalConsidered).toBe(0);
  });
});

describe("Tent detail manual-history read (Codex security 4288384000, Copilot 4286153585)", () => {
  it("does not start the manual-history read for a tent the owner-scoped read did not return", () => {
    state.tent = null;
    mount();
    expect(screen.getByText("Tent not found")).toBeVisible();
    expect(state.manualArgs.length).toBeGreaterThan(0);
    expect(state.manualArgs.every((arg) => arg === null || arg === undefined)).toBe(true);
  });

  it("starts the manual-history read only with the owned tent's id", () => {
    mount();
    expect(state.manualArgs).toContain("tent-1");
    expect(state.manualArgs.every((arg) => arg === "tent-1" || arg == null)).toBe(true);
  });

  it("discloses a pending manual-history read and keeps stored readings", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" }];
    state.manualPending = true;
    mount();
    expect(screen.getByTestId("tent-detail-manual-history-pending")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toBeVisible();
    const stability = state.stability as { last24h: { totalConsidered: number } } | null;
    expect(stability?.last24h.totalConsidered).toBe(1);
  });

  it("discloses a failed manual-history read with a retry", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" }];
    state.manualError = true;
    mount();
    const notice = screen.getByTestId("tent-detail-manual-history-error");
    expect(notice).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toBeVisible();
    fireEvent.click(within(notice).getByRole("button", { name: /retry/i }));
    expect(state.manualRefetch).toHaveBeenCalledTimes(1);
  });
});

// #2268 / VER-189: the tent page's VPD chip shows the Dashboard Tonight card's value.
describe("Tent detail VPD agrees with the Dashboard Tonight card", () => {
  const hoursAgo = (hours: number) =>
    new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
  const row = (metric: string, value: number, at: string) => ({
    metric,
    value,
    ts: at,
    captured_at: at,
    tent_id: "tent-1",
    source: "manual",
  });
  const tonightVpd = () =>
    buildTonightTentMetrics({
      rows: state.rows as never,
      rowsRead: { status: "success" },
      snapshot: state.snapshot as never,
      now: NOW,
    }).find((metric) => metric.key === "vpd");
  const shown = (value: number) => formatSensorValue("vpd_kpa", value).replace(/\s*kPa$/, "");

  it("QA #2268 (2/2 on ebaf1b6a): 80°F/50% then 85°F/45% read 1.75 then 2.26 kPa, never the stored 1.30", () => {
    // 80°F = 26.667°C, 85°F = 29.444°C; the Dashboard shows 1.75 then 2.26.
    state.rows = [
      row("vpd_kpa", 1.3, hoursAgo(24)),
      row("temperature_c", (80 - 32) / 1.8, hoursAgo(2)),
      row("humidity_pct", 50, hoursAgo(2)),
    ];
    mount();
    expect(tonightVpd()).toMatchObject({ state: "value", calculated: true });
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent("1.75");
    expect(screen.getByTestId("metric-chip-VPD")).not.toHaveTextContent("1.3");
    expect(screen.getByTestId("metric-chip-VPD").textContent).not.toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    );
    cleanup();

    state.rows = [
      ...state.rows,
      row("temperature_c", (85 - 32) / 1.8, hoursAgo(1)),
      row("humidity_pct", 45, hoursAgo(1)),
    ];
    mount();
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent("2.26");
    expect(screen.getByTestId("tent-detail-vpd-provenance").textContent).not.toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    );
  });

  it("replaces a day-old stored VPD with a newer same-capture temperature and RH pair", () => {
    const pairAt = hoursAgo(16);
    state.rows = [
      row("vpd_kpa", 1.3, hoursAgo(24)),
      row("temperature_c", 30, pairAt),
      row("humidity_pct", 46, pairAt),
    ];
    mount();
    const expected = calculateVpdKpa({ tempC: 30, rhPercent: 46 })!;
    expect(tonightVpd()).toMatchObject({ state: "value", value: expected, calculated: true });
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent(shown(expected));
    expect(screen.getByTestId("metric-chip-VPD")).not.toHaveTextContent("1.3");
    expect(screen.getByTestId("tent-detail-vpd-provenance")).toHaveTextContent(
      "Calculated from temperature and RH",
    );
  });

  it("counts a newer Quick Log pair from the diary-inclusive snapshot, as the Dashboard does", () => {
    state.rows = [row("vpd_kpa", 1.3, hoursAgo(24))];
    state.snapshot = {
      status: "ok",
      snapshot: { source: "diary", ts: hoursAgo(16), temp: 30, rh: 46, vpd: null },
    };
    mount();
    const expected = tonightVpd();
    expect(expected).toMatchObject({ state: "value", calculated: true });
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent(shown(expected!.value!));
  });

  it("shows no VPD when the newest same-capture pair is invalid, never the older stored value", () => {
    const pairAt = hoursAgo(16);
    state.rows = [
      row("vpd_kpa", 1.3, hoursAgo(24)),
      row("temperature_c", 30, pairAt),
      row("humidity_pct", 100, pairAt),
    ];
    mount();
    expect(tonightVpd()).toMatchObject({ state: "invalid" });
    expect(screen.queryByTestId("metric-chip-VPD")).toBeNull();
  });

  it("keeps a stored VPD that is newer than the temperature and RH pair", () => {
    const pairAt = hoursAgo(24);
    state.rows = [
      row("vpd_kpa", 1.3, hoursAgo(2)),
      row("temperature_c", 30, pairAt),
      row("humidity_pct", 46, pairAt),
    ];
    mount();
    expect(tonightVpd()).toMatchObject({ state: "value", value: 1.3, calculated: false });
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent(shown(1.3));
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
  });

  // Copilot P1 on #2303: Tonight runs no realism check, so the chosen VPD and
  // its same-capture temperature and RH are checked before the tent page adopts it.
  it("does not adopt a VPD whose capture has unrealistic RH when a newer CO2-only capture follows", () => {
    const badAt = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
    const co2At = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { ...row("temperature_c", 24, badAt), source: "live" },
      { ...row("humidity_pct", 150, badAt), source: "live" },
      { ...row("vpd_kpa", 1.2, badAt), source: "live" },
      { ...row("co2_ppm", 800, co2At), source: "live" },
    ];
    mount();
    expect(tonightVpd()).toMatchObject({ state: "value", value: 1.2 });
    expect(screen.queryByTestId("metric-chip-VPD")?.textContent ?? "").not.toContain("1.2");
  });

  it("does not adopt a diary snapshot VPD whose RH is unrealistic when there are no stored rows", () => {
    state.snapshot = {
      status: "ok",
      snapshot: { source: "diary", ts: hoursAgo(1), temp: 24, rh: 150, vpd: 1.2 },
    };
    mount();
    expect(tonightVpd()).toMatchObject({ state: "value", value: 1.2 });
    expect(screen.queryByTestId("metric-chip-VPD")?.textContent ?? "").not.toContain("1.2");
  });

  // Copilot P2 on #2303: an equal value from a different, fresher observation
  // still needs its own provenance line.
  it("shows the VPD's own provenance when an equal value comes from a fresher observation", () => {
    const oldAt = hoursAgo(48);
    state.rows = [
      { ...row("temperature_c", 25, oldAt), source: "live" },
      { ...row("humidity_pct", 60, oldAt), source: "live" },
      { ...row("vpd_kpa", 1.3, oldAt), source: "live" },
    ];
    state.snapshot = {
      status: "ok",
      snapshot: {
        source: "diary",
        ts: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
        temp: null,
        rh: null,
        vpd: 1.3,
      },
    };
    mount();
    expect(tonightVpd()).toMatchObject({ state: "value", value: 1.3, calculated: false });
    expect(screen.getByTestId("metric-chip-VPD")).toHaveTextContent(shown(1.3));
    const provenance = screen.getByTestId("tent-detail-vpd-provenance");
    expect(within(provenance).getByTestId("tent-detail-vpd-captured")).toHaveTextContent(
      "5 minutes ago",
    );
    expect(within(provenance).queryByTestId("tent-detail-vpd-stale")).toBeNull();
  });
});
