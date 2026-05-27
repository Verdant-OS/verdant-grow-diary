import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentStabilityCard from "@/components/EnvironmentStabilityCard";
import type { StabilityResult } from "@/lib/environmentStabilityRules";

function baseResult(overrides: Partial<StabilityResult> = {}): StabilityResult {
  return {
    status: "stable",
    last24h: {
      hoursOutside: 0,
      hoursConsidered: 18,
      totalConsidered: 18,
      outsideCount: 0,
    },
    last7d: {
      hoursOutside: 0,
      hoursConsidered: 120,
      totalConsidered: 120,
      outsideCount: 0,
    },
    sparse: false,
    message: null,
    stage: "veg",
    ...overrides,
  };
}

describe("EnvironmentStabilityCard presenter", () => {
  it("renders the required labels and status", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({ status: "stable" })}
      />,
    );
    expect(screen.getByText("Outside VPD target")).toBeTruthy();
    expect(screen.getByText("Last 24h")).toBeTruthy();
    expect(screen.getByText("Last 7d")).toBeTruthy();
    expect(screen.getByText("Stage-aware")).toBeTruthy();
    expect(screen.getByText("Read-only summary")).toBeTruthy();
    expect(screen.getByTestId("card-status").textContent).toBe("Stable");
    expect(screen.getByTestId("card-window-24h")).toBeTruthy();
    expect(screen.getByTestId("card-window-7d")).toBeTruthy();
  });

  it("shows the sparse warning when result.sparse is true", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({
          sparse: true,
          message: "Limited data — stability estimate may be incomplete.",
        })}
      />,
    );
    expect(screen.getByTestId("card-sparse-warning").textContent).toContain(
      "Limited data",
    );
  });

  it("shows inactive note for stage_unknown and hides windows", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({
          status: "stage_unknown",
          message: "Set plant stage to evaluate VPD stability.",
          sparse: true,
        })}
      />,
    );
    expect(screen.getByTestId("card-status").textContent).toBe(
      "Stage unknown",
    );
    expect(screen.getByTestId("card-inactive-note").textContent).toContain(
      "Set plant stage",
    );
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
  });

  it("shows inactive note for context_only (harvest)", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({
          status: "context_only",
          stage: "harvest",
          message: "Stage has no active VPD target; shown as context only.",
        })}
      />,
    );
    expect(screen.getByTestId("card-status").textContent).toBe(
      "Context only",
    );
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
  });
});
