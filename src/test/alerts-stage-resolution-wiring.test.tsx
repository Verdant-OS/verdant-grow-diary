/**
 * Wiring tests for live-audit bug #14: alert/threshold surfaces must
 * resolve their stage via `resolveAlertContextStage` (grow row + the
 * grow's tents; most advanced known stage wins) instead of trusting
 * `grows.stage` alone.
 *
 * Covers:
 *  - AlertsContextHeaderForGrow renders the resolved stage in the
 *    "Alert context: Using <stage> targets." line (both lag directions).
 *  - AlertsAutoPersistForGrow feeds the resolved stage into
 *    usePersistEnvironmentAlerts.
 *  - Static wiring: the scoped Dashboard evaluation sites use the shared
 *    resolver rather than raw `scopedGrow?.stage`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";

import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";
import { useGrowTents } from "@/hooks/useGrowData";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: vi.fn(),
}));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "idle", snapshot: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: vi.fn(),
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

const ROOT = resolve(__dirname, "../..");
const DASHBOARD_PAGE = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

function mockTents(stages: (string | null)[], opts: { settled?: boolean } = {}) {
  vi.mocked(useGrowTents).mockReturnValue({
    data: stages.map((stage, i) => ({ id: `tent-${i}`, name: `Tent ${i}`, stage })),
    isFetched: opts.settled ?? true,
  } as never);
}

function mockTentsPending() {
  // React Query placeholder shape while the tent read is in flight.
  vi.mocked(useGrowTents).mockReturnValue({
    data: undefined,
    isFetched: false,
  } as never);
}

beforeEach(() => {
  vi.mocked(useGrowTents).mockReset();
  vi.mocked(usePersistEnvironmentAlerts).mockReset();
});

describe("AlertsContextHeaderForGrow — resolved stage in header copy", () => {
  it("audit repro: stale seedling grow row + veg tent renders Veg targets", () => {
    mockTents(["veg"]);
    render(
      <AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage="seedling" />,
    );
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toContain(
      "Veg",
    );
    expect(screen.getByTestId("alerts-context-header-stage").textContent).not.toContain(
      "Seedling",
    );
  });

  it("mirror case: veg grow row + lagging seedling tent still renders Veg targets", () => {
    mockTents(["seedling"]);
    render(
      <AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage="veg" />,
    );
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toContain(
      "Veg",
    );
  });

  it("keeps the honest no-stage state when neither field is a known stage", () => {
    mockTents([null]);
    render(
      <AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage={null} />,
    );
    expect(
      screen.getByTestId("alerts-context-header-stage-missing").textContent,
    ).toContain("No active stage target set");
  });
});

describe("AlertsAutoPersistForGrow — resolved stage feeds persistence", () => {
  it("persists against the tent's later stage when the grow row lags", () => {
    mockTents(["veg"]);
    render(<AlertsAutoPersistForGrow growId="g1" stage="seedling" />);
    expect(vi.mocked(usePersistEnvironmentAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "veg" }),
    );
  });

  it("persists against the grow's later stage when the tent lags", () => {
    mockTents(["seedling"]);
    render(<AlertsAutoPersistForGrow growId="g1" stage="veg" />);
    expect(vi.mocked(usePersistEnvironmentAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "veg" }),
    );
  });

  it("passes null (not a guess) when no stage is known anywhere", () => {
    mockTents([]);
    render(<AlertsAutoPersistForGrow growId="g1" stage={null} />);
    expect(vi.mocked(usePersistEnvironmentAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ stage: null }),
    );
  });

  it("holds persistence (enabled: false) while the tent read is still pending", () => {
    // Review follow-up: while useGrowTents is in flight the resolver only
    // sees the grow row — persisting a stale-stage alert in that window
    // would not be undone when the tent stages arrive.
    mockTentsPending();
    render(<AlertsAutoPersistForGrow growId="g1" stage="seedling" />);
    expect(vi.mocked(usePersistEnvironmentAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables persistence once the tent read has settled", () => {
    mockTents(["veg"], { settled: true });
    render(<AlertsAutoPersistForGrow growId="g1" stage="seedling" />);
    expect(vi.mocked(usePersistEnvironmentAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, stage: "veg" }),
    );
  });
});

describe("Dashboard — static wiring of the shared stage resolver", () => {
  it("scoped evaluation sites use resolveAlertContextStage, not raw grows.stage", () => {
    expect(DASHBOARD_PAGE).toContain("resolveAlertContextStage({");
    // Stage candidates follow the snapshot's tent-selection scope, so a
    // reading from one selected tent is never classified against a
    // sibling tent's stage.
    expect(DASHBOARD_PAGE).toContain(
      "const stageContextTents = tents.filter((t) => selectedTentIds.includes(t.id));",
    );
    expect(DASHBOARD_PAGE).toContain("tentStages: stageContextTents.map((t) => t.stage)");
    // Persist hook + stage-aware VPD box + Environment Alerts panel all
    // consume the shared resolved value.
    const uses = DASHBOARD_PAGE.match(/stage:\s*alertContextStage/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(DASHBOARD_PAGE).toContain("normalizeVpdStage(alertContextStage)");
    // No alert/threshold evaluation site reads scopedGrow?.stage directly.
    expect(DASHBOARD_PAGE).not.toMatch(/stage:\s*scopedGrow\?\.stage/);
  });

  it("persistence waits for the tent read to settle before trusting the stage", () => {
    expect(DASHBOARD_PAGE).toContain("enabled: !!scopedGrowId && tentsQuery.isFetched");
  });
});
