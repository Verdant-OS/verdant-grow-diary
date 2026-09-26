/**
 * QA 2026-09-24, BUG-006: one RH reading in a tent whose only plant is in
 * Flower was judged against three different stages. Alerts used the grow's
 * Veg stage (55–70%), so RH 60% raised no alert although the plant's own
 * Flower targets are 40–55%. Plant stages now join the alert stage
 * resolution under the same consensus / harvest-cap / most-advanced rules.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import { useGrowTents } from "@/hooks/useGrowData";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";

vi.mock("@/hooks/useGrowData", () => ({ useGrowTents: vi.fn() }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "idle", snapshot: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({ usePersistEnvironmentAlerts: vi.fn() }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

function mockTents(stages: (string | null)[]) {
  vi.mocked(useGrowTents).mockReturnValue({
    data: stages.map((stage, i) => ({ id: `tent-${i}`, name: `Tent ${i}`, stage })),
    isFetched: true,
  } as never);
}

beforeEach(() => {
  vi.mocked(useGrowTents).mockReset();
  vi.mocked(usePersistEnvironmentAlerts).mockReset();
});

describe("resolveAlertContextStage with plant stages", () => {
  it("QA repro: Veg grow, default Seedling tent, Flower plant resolves to Flower", () => {
    expect(
      resolveAlertContextStage({
        growStage: "veg",
        tentStages: ["seedling"],
        plantStages: ["flower"],
      }),
    ).toEqual({ stage: "flower", normalizedStage: "flower", source: "plant" });
  });

  it("mixed plant stages abstain and the grow/tent resolution stands", () => {
    expect(
      resolveAlertContextStage({
        growStage: "veg",
        tentStages: ["seedling"],
        plantStages: ["flower", "veg"],
      }).source,
    ).toBe("grow");
  });

  it("a trailing plant stage never regresses a more advanced grow", () => {
    expect(resolveAlertContextStage({ growStage: "flower", plantStages: ["seedling"] }).stage).toBe(
      "flower",
    );
  });

  it("a harvested plant cannot switch an actively-staged grow's alerting off", () => {
    expect(resolveAlertContextStage({ growStage: "veg", plantStages: ["harvest"] }).stage).toBe(
      "veg",
    );
    expect(resolveAlertContextStage({ growStage: null, plantStages: ["harvest"] }).stage).toBe(
      "harvest",
    );
  });

  it("ties go grow > tent > plant and omitting plantStages changes nothing", () => {
    expect(
      resolveAlertContextStage({
        growStage: "flower",
        tentStages: ["flower"],
        plantStages: ["flower"],
      }).source,
    ).toBe("grow");
    expect(resolveAlertContextStage({ tentStages: ["veg"], plantStages: ["veg"] }).source).toBe(
      "tent",
    );
    expect(resolveAlertContextStage({ growStage: "veg", tentStages: ["seedling"] })).toEqual(
      resolveAlertContextStage({ growStage: "veg", tentStages: ["seedling"], plantStages: [] }),
    );
  });
});

describe("alert surfaces use the plant stage", () => {
  it("persists alerts against the Flower plant stage", () => {
    mockTents(["seedling"]);
    render(
      <AlertsAutoPersistForGrow
        growId="g1"
        stage="veg"
        plants={[{ grow_id: "g1", tent_id: null, stage: "flower" }]}
      />,
    );
    const args = vi.mocked(usePersistEnvironmentAlerts).mock.calls.at(-1)?.[0];
    expect(args?.stage).toBe("flower");
    expect(args?.enabled).toBe(true);
  });

  it("holds persistence while the plant read has not settled", () => {
    mockTents(["seedling"]);
    render(<AlertsAutoPersistForGrow growId="g1" stage="veg" plants={null} />);
    const args = vi.mocked(usePersistEnvironmentAlerts).mock.calls.at(-1)?.[0];
    expect(args?.enabled).toBe(false);
  });

  it("keeps the previous behaviour when plant stages are not provided", () => {
    mockTents(["seedling"]);
    render(<AlertsAutoPersistForGrow growId="g1" stage="veg" />);
    const args = vi.mocked(usePersistEnvironmentAlerts).mock.calls.at(-1)?.[0];
    expect(args?.stage).toBe("veg");
    expect(args?.enabled).toBe(true);
  });

  it.each([
    ["failed", { isError: true, isFetched: true }],
    ["refetching", { isError: false, isFetched: true, isFetching: true }],
  ])("holds persistence while the tent read is %s (Codex review on #1683)", (_s, state) => {
    // A failed first read leaves `tents` empty with isFetched true, so a
    // grow-less plant whose grow is known only through its tent would drop
    // out of the stage; a refetch may be replacing stale tent rows.
    vi.mocked(useGrowTents).mockReturnValue({
      data: state.isError ? undefined : [{ id: "tent-0", name: "Tent 0", stage: "seedling" }],
      ...state,
    } as never);
    render(
      <AlertsAutoPersistForGrow
        growId="g1"
        stage="veg"
        plants={[{ grow_id: null, tent_id: "tent-0", stage: "flower" }]}
      />,
    );
    const args = vi.mocked(usePersistEnvironmentAlerts).mock.calls.at(-1)?.[0];
    expect(args?.enabled).toBe(false);
  });

  it("the header names the plant's Flower targets", () => {
    mockTents(["seedling"]);
    render(
      <AlertsContextHeaderForGrow
        growId="g1"
        growName="Grow A"
        stage="veg"
        plants={[{ grow_id: "g1", tent_id: null, stage: "flower" }]}
      />,
    );
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toMatch(/Flower/);
  });

  // The scoped Dashboard's plant-stage and persistence wiring is rendered in
  // dashboard-alert-persistence-plant-read; the Alerts page wiring in
  // alerts-page-plant-stage-attribution.
});
