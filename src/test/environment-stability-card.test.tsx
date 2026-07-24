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
  it("uses a neutral heading for a stable result while preserving its windows", () => {
    render(<EnvironmentStabilityCard testId="card" result={baseResult({ status: "stable" })} />);
    expect(screen.getByText("VPD stability")).toBeTruthy();
    expect(screen.queryByText("Outside VPD target")).toBeNull();
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
    expect(screen.getByTestId("card-sparse-warning").textContent).toContain("Limited data");
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
    expect(screen.getByTestId("card-status").textContent).toBe("Stage unknown");
    expect(screen.getByTestId("card-inactive-note").textContent).toContain("Set plant stage");
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
    expect(screen.queryByTestId("card-window-7d")).toBeNull();
    expect(screen.getByText("VPD stability")).toBeTruthy();
    expect(screen.queryByText("Outside VPD target")).toBeNull();
  });

  it("prefixes the stage-band why context when the summary is unavailable", () => {
    // With no directly measured VPD series the summary is unavailable; the
    // stage band must read as reference context only, never as a live
    // classification of a derived VPD estimate shown elsewhere on the page.
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({
          status: "unavailable",
          stage: "flower",
          message:
            "No directly measured VPD readings in the recent window. Derived VPD (calculated from temperature and humidity) is shown on the VPD card but is not used for stability tracking.",
          sparse: true,
        })}
      />,
    );
    const why = screen.getByTestId("card-why-context");
    expect(why.textContent).toBe(
      "Target for reference: Flower VPD target: 1.0–1.5 kPa",
    );
    expect(screen.getByTestId("card-inactive-note").textContent).toContain(
      "No directly measured VPD readings",
    );
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
  });

  it("does not prefix the stage-band why context when the summary is active", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({ status: "stable", stage: "flower" })}
      />,
    );
    expect(screen.getByTestId("card-why-context").textContent).toBe(
      "Flower VPD target: 1.0–1.5 kPa",
    );
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
    expect(screen.getByTestId("card-status").textContent).toBe("Context only");
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
    expect(screen.queryByTestId("card-window-7d")).toBeNull();
    expect(screen.getByText("VPD stability")).toBeTruthy();
    expect(screen.queryByText("Outside VPD target")).toBeNull();
  });

  it("uses a neutral heading and hides windows when readings are unavailable", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({
          status: "unavailable",
          message: "No usable VPD readings in the selected window.",
          sparse: true,
        })}
      />,
    );

    expect(screen.getByTestId("card-status")).toHaveTextContent("Unavailable");
    expect(screen.getByText("VPD stability")).toBeTruthy();
    expect(screen.queryByText("Outside VPD target")).toBeNull();
    expect(screen.getByTestId("card-inactive-note")).toHaveTextContent("No usable VPD readings");
    expect(screen.queryByTestId("card-window-24h")).toBeNull();
    expect(screen.queryByTestId("card-window-7d")).toBeNull();
  });

  it.each(["watch", "unstable"] as const)(
    "uses the breach heading for %s only when outside-target evidence exists",
    (status) => {
      render(
        <EnvironmentStabilityCard
          testId="card"
          result={baseResult({
            status,
            last24h: {
              hoursOutside: 2,
              hoursConsidered: 18,
              totalConsidered: 18,
              outsideCount: 2,
            },
          })}
        />,
      );

      expect(screen.getByText("Outside VPD target")).toBeTruthy();
      expect(screen.queryByText("VPD stability")).toBeNull();
    },
  );

  it("does not invent a breach heading from a watch status without outside evidence", () => {
    render(<EnvironmentStabilityCard testId="card" result={baseResult({ status: "watch" })} />);

    expect(screen.getByText("VPD stability")).toBeTruthy();
    expect(screen.queryByText("Outside VPD target")).toBeNull();
  });
});
