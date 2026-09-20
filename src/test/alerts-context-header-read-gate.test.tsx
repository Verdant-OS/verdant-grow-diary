import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";

const HEADER_FOR_GROW = readFileSync(
  resolve(__dirname, "../components/AlertsContextHeaderForGrow.tsx"),
  "utf8",
);

const h = vi.hoisted(() => ({ state: null as SnapshotState | null }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [{ id: "tent-a", stage: "veg" }], isFetched: true }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({ useLatestSensorSnapshot: () => h.state }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

beforeEach(() => {
  h.state = {
    status: "ok",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      temp: 24,
      rh: 55,
      vpd: 1.1,
      tent_id: "tent-a",
      ts: new Date().toISOString(),
    },
  };
});

describe("Alerts context header waits for a completed current read", () => {
  it.each([
    ["manual", "isPaused"],
    ["live", "isPaused"],
    ["manual", "isFetching"],
    ["live", "isFetching"],
  ] as const)("does not claim persistence for cached %s evidence during %s", (source, flag) => {
    h.state = { ...h.state!, snapshot: { ...h.state!.snapshot, source }, [flag]: true };
    const view = render(
      <AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />,
    );
    expect(screen.getByTestId("alerts-context-header-freshness-window")).toHaveTextContent(
      /will not persist/i,
    );
    expect(screen.queryByTestId("alerts-context-header-latest-detail")).toBeNull();

    h.state = { ...h.state, [flag]: false };
    view.rerender(<AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />);
    expect(screen.getByTestId("alerts-context-header-latest-detail")).toHaveAttribute(
      "data-can-persist",
      "true",
    );
  });

  it("does not reuse retained evidence after a failed read", () => {
    h.state = { ...h.state!, status: "unavailable" };
    render(<AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />);
    expect(screen.getByTestId("alerts-context-header-freshness-window")).toHaveTextContent(
      /will not persist/i,
    );
    expect(screen.getByTestId("alerts-context-header-latest-message")).toHaveTextContent(
      /unavailable/i,
    );
  });
});

describe("AlertsContextHeaderForGrow — confirmed read wiring (#1555)", () => {
  it("derives header context from buildSensorSnapshotReadState confirmed evidence only", () => {
    expect(HEADER_FOR_GROW).toMatch(/buildSensorSnapshotReadState\s*\(\s*sensorState\s*\)/);
    expect(HEADER_FOR_GROW).toMatch(/confirmedSnapshot/);
    expect(HEADER_FOR_GROW).not.toMatch(
      /snapshot:\s*sensorState\.status\s*===\s*["']ok["']\s*\?\s*sensorState\.snapshot/,
    );
  });
});
