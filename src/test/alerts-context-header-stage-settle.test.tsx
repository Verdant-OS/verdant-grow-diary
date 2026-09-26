/**
 * The Alerts header states a stage only once the grow's tent read and the
 * plant read have data (Codex review on #1683).
 *
 * Plant stages join the alert stage (QA 2026-09-24, BUG-006), and a plant
 * with no grow_id reaches its grow through the grow's tents. While either
 * read is pending, or failed before returning anything, the header cannot
 * know those stages. It used to fall back to the grow and tent stages and
 * print "Using Veg targets." for a grow whose only plant is in Flower, for
 * as long as a failed read stayed failed. It now says the stage is not
 * confirmed. Cached rows from a failed refresh still count, as elsewhere on
 * the page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import { useGrowTents } from "@/hooks/useGrowData";
import { buildAlertsHeaderContext } from "@/lib/alertFreshnessContext";
import { alertHeaderStageReadsSettled } from "@/lib/alertPlantStageScopeRules";

vi.mock("@/hooks/useGrowData", () => ({ useGrowTents: vi.fn() }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({
    status: "ok",
    targets: { temp: null, rh: { min: 40, max: 55 }, vpd: null },
  }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "idle", snapshot: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

const VEG_TENT = { id: "tent-1", name: "Tent", stage: "veg" };
const FLOWER_PLANT = { grow_id: "g1", tent_id: "tent-1", stage: "flower" };
/** A legacy plant with no grow_id: it reaches g1 only through g1's tent. */
const LEGACY_FLOWER_PLANT = { grow_id: null, tent_id: "tent-1", stage: "flower" };

function mockTents(state: { data?: unknown; isError?: boolean; isFetched?: boolean }) {
  vi.mocked(useGrowTents).mockReturnValue({
    isFetched: true,
    isError: false,
    ...state,
  } as never);
}

function renderHeader(plants: ReadonlyArray<Record<string, unknown>> | null | undefined) {
  return render(
    <AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage="veg" plants={plants} />,
  );
}

function expectStagePending() {
  expect(screen.queryByTestId("alerts-context-header-stage")).toBeNull();
  expect(screen.queryByTestId("alerts-context-header-stage-missing")).toBeNull();
  expect(screen.getByTestId("alerts-context-header-stage-pending").textContent).toBe(
    "Stage not confirmed until tent and plant stages load. ",
  );
  expect(screen.getByTestId("alerts-context-header-summary").textContent).not.toMatch(/Using/);
}

beforeEach(() => {
  vi.mocked(useGrowTents).mockReset();
});

describe("AlertsContextHeaderForGrow withholds the stage until its reads settle", () => {
  it("control: settled tent and plant reads state the plant-consensus stage", () => {
    mockTents({ data: [VEG_TENT] });
    renderHeader([FLOWER_PLANT]);
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toBe(
      "Using Flower targets. ",
    );
  });

  it("plant read pending (null): no 'Using Veg targets' from the grow and tent alone", () => {
    mockTents({ data: [VEG_TENT] });
    renderHeader(null);
    expectStagePending();
  });

  it("tent read pending: the stage is not confirmed", () => {
    mockTents({ data: undefined, isFetched: false });
    renderHeader([FLOWER_PLANT]);
    expectStagePending();
  });

  it("tent read failed with no data, legacy grow-less Flower plant: not 'Using Veg targets'", () => {
    mockTents({ data: undefined, isError: true });
    renderHeader([LEGACY_FLOWER_PLANT]);
    expectStagePending();
  });

  it("the grow's own targets still show while the stage is withheld", () => {
    mockTents({ data: [VEG_TENT] });
    renderHeader(null);
    expect(screen.getByTestId("alerts-context-header-range-rh").textContent).toBe("RH 40–55%. ");
  });

  it("a failed tent refresh keeps its cached rows, so the stage is stated", () => {
    mockTents({ data: [VEG_TENT], isError: true });
    renderHeader([LEGACY_FLOWER_PLANT]);
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toBe(
      "Using Flower targets. ",
    );
  });

  it("settled reads with no known stage keep the honest no-stage line", () => {
    mockTents({ data: [{ id: "tent-1", name: "Tent", stage: null }] });
    render(<AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage={null} plants={[]} />);
    expect(screen.getByTestId("alerts-context-header-stage-missing")).toBeTruthy();
    expect(screen.queryByTestId("alerts-context-header-stage-pending")).toBeNull();
  });

  it("a caller that supplies no plants (undefined) is not held", () => {
    mockTents({ data: [VEG_TENT] });
    renderHeader(undefined);
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toBe(
      "Using Veg targets. ",
    );
  });
});

describe("buildAlertsHeaderContext — stagePending", () => {
  const base = { growName: "Grow A", targets: null, snapshot: null, status: "idle" } as const;

  it("drops the stage label while pending", () => {
    const vm = buildAlertsHeaderContext({ ...base, stage: "veg", stagePending: true });
    expect(vm.stagePending).toBe(true);
    expect(vm.stageLabel).toBeNull();
  });

  it("defaults to not pending", () => {
    const vm = buildAlertsHeaderContext({ ...base, stage: "veg" });
    expect(vm.stagePending).toBe(false);
    expect(vm.stageLabel).toBe("Veg");
  });
});

describe("alertHeaderStageReadsSettled", () => {
  it("needs tent rows and a plant read that is not pending", () => {
    expect(alertHeaderStageReadsSettled({ tents: [], plants: [] })).toBe(true);
    expect(alertHeaderStageReadsSettled({ tents: [VEG_TENT], plants: undefined })).toBe(true);
    expect(alertHeaderStageReadsSettled({ tents: undefined, plants: [] })).toBe(false);
    expect(alertHeaderStageReadsSettled({ tents: null, plants: [] })).toBe(false);
    expect(alertHeaderStageReadsSettled({ tents: [VEG_TENT], plants: null })).toBe(false);
  });
});
