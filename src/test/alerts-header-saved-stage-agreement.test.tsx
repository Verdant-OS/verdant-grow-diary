/**
 * Sour Diesel on #3021 (P1): the Alerts header resolved its stage from the
 * whole grow while the alerts it saves were judged by the reading's tent. A
 * Flower plant in a seedling tent, next to a Veg plant in another seedling
 * tent, saved alerts against Flower while the header said "Using Seedling
 * targets". Both now resolve through resolveSnapshotAlertStage, so the header
 * names the stage the saved alerts were judged by.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";

const h = vi.hoisted(() => ({ state: null as SnapshotState | null }));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      { id: "tent-a", name: "Tent A", stage: "seedling" },
      { id: "tent-b", name: "Tent B", stage: "seedling" },
    ],
    isFetched: true,
  }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({ useLatestSensorSnapshot: () => h.state }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({ usePersistEnvironmentAlerts: vi.fn() }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

const PLANTS = [
  { grow_id: "g1", tent_id: "tent-a", stage: "flower" },
  { grow_id: "g1", tent_id: "tent-b", stage: "veg" },
];

function readingFrom(tentId: string | null): SnapshotState {
  return {
    status: "ok",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      temp: 24,
      rh: 60,
      vpd: 1.2,
      tent_id: tentId,
      ts: new Date().toISOString(),
    },
  };
}

function renderBoth() {
  render(<AlertsAutoPersistForGrow growId="g1" stage="seedling" plants={PLANTS} />);
  render(
    <AlertsContextHeaderForGrow growId="g1" growName="Grow A" stage="seedling" plants={PLANTS} />,
  );
  return {
    header: screen.getByTestId("alerts-context-header-stage").textContent ?? "",
    saved: vi.mocked(usePersistEnvironmentAlerts).mock.calls.at(-1)?.[0]?.stage,
  };
}

beforeEach(() => {
  vi.mocked(usePersistEnvironmentAlerts).mockReset();
});

describe("Alerts header and saved alerts agree on the stage", () => {
  it("a tent-A reading: header says Flower and alerts save as flower", () => {
    h.state = readingFrom("tent-a");
    const { header, saved } = renderBoth();
    expect(saved).toBe("flower");
    expect(header).toContain("Flower");
    expect(header).not.toContain("Seedling");
  });

  it("a tent-B reading: header says Veg and alerts save as veg", () => {
    h.state = readingFrom("tent-b");
    const { header, saved } = renderBoth();
    expect(saved).toBe("veg");
    expect(header).toContain("Veg");
  });

  it("a reading that names no tent keeps the grow-wide stage on both", () => {
    h.state = readingFrom(null);
    const { header, saved } = renderBoth();
    expect(saved).toBe("seedling");
    expect(header).toContain("Seedling");
  });
});
