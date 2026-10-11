import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import EnvironmentRibbon from "@/components/EnvironmentRibbon";
import type { EnvironmentRibbonReadingLike } from "@/lib/environmentRibbonViewModel";

const NOW = Date.parse("2026-09-02T15:00:00.000Z");
const MIN = 60_000;

function reading(
  minutesAgo: number,
  over: Partial<EnvironmentRibbonReadingLike> = {},
): EnvironmentRibbonReadingLike {
  return {
    capturedAt: new Date(NOW - minutesAgo * MIN).toISOString(),
    temp: 24,
    rh: 55,
    source: "live",
    status: "usable",
    ...over,
  };
}

const base = { now: NOW, utcOffsetMinutes: 0, temperatureUnit: "celsius" as const };

describe("EnvironmentRibbon — render", () => {
  it("renders the latest reading paired with its source and a band status", () => {
    render(
      <EnvironmentRibbon
        {...base}
        readings={[reading(10), reading(0)]}
        targetVpd={{ minKpa: 1.2, maxKpa: 1.5 }}
      />,
    );
    const nowBlock = screen.getByTestId("environment-ribbon-now");
    expect(within(nowBlock).getByText("24.0 °C")).toBeInTheDocument();
    expect(within(nowBlock).getByText("55 %")).toBeInTheDocument();
    expect(screen.getByTestId("environment-ribbon-temp-source")).toHaveTextContent("live");
    expect(screen.getByTestId("environment-ribbon-rh-source")).toHaveTextContent("live");
    expect(screen.getByTestId("environment-ribbon-vpd-status")).toHaveTextContent("in band");
    expect(screen.getByTestId("environment-ribbon")).toHaveAttribute("data-latest-source", "live");
  });

  it("draws one provenance run per contiguous source and a target band", () => {
    render(
      <EnvironmentRibbon
        {...base}
        readings={[reading(20, { source: "manual" }), reading(0)]}
        targetVpd={{ minKpa: 1.2, maxKpa: 1.5 }}
      />,
    );
    const runs = screen.getAllByTestId("environment-ribbon-run");
    const sources = runs.map((r) => r.getAttribute("data-source"));
    // none … manual … none … live — order preserved, contiguous grouping
    expect(sources).toEqual(["none", "manual", "none", "live"]);
    expect(screen.getByTestId("environment-ribbon-target-band")).toBeInTheDocument();
  });

  it("converts temperature for display when the unit is fahrenheit", () => {
    render(<EnvironmentRibbon {...base} temperatureUnit="fahrenheit" readings={[reading(0)]} />);
    expect(screen.getByTestId("environment-ribbon-now")).toHaveTextContent("75.2 °F");
  });

  it("shows the empty state and no now-block when there are no readings", () => {
    render(<EnvironmentRibbon {...base} readings={[]} />);
    expect(screen.getByTestId("environment-ribbon-empty")).toHaveTextContent("No readings");
    expect(screen.queryByTestId("environment-ribbon-now")).toBeNull();
    expect(screen.getByTestId("environment-ribbon")).toHaveAttribute("data-latest-source", "none");
  });
});

describe("EnvironmentRibbon — safety fences", () => {
  it("never renders a number for an invalid reading", () => {
    render(
      <EnvironmentRibbon
        {...base}
        readings={[reading(0, { rh: 100 })]}
        targetVpd={{ minKpa: 1.2, maxKpa: 1.5 }}
      />,
    );
    const nowBlock = screen.getByTestId("environment-ribbon-now");
    expect(nowBlock).not.toHaveTextContent("24.0");
    expect(nowBlock).not.toHaveTextContent("100");
    expect(screen.getByTestId("environment-ribbon-rh-source")).toHaveTextContent(
      "invalid, excluded",
    );
    expect(screen.getByTestId("environment-ribbon-vpd-status")).toHaveTextContent("not computed");
    expect(screen.getByTestId("environment-ribbon-vpd-path")).toHaveAttribute("d", "");
  });

  it("labels an unknown vendor token as invalid, never live", () => {
    render(<EnvironmentRibbon {...base} readings={[reading(0, { source: "acme_cloud" })]} />);
    expect(screen.getByTestId("environment-ribbon")).toHaveAttribute(
      "data-latest-source",
      "invalid",
    );
    expect(screen.getByTestId("environment-ribbon-temp-source")).not.toHaveTextContent("live");
  });

  it("keeps stale and demo labels visible on the latest block", () => {
    const { rerender } = render(
      <EnvironmentRibbon {...base} readings={[reading(0, { status: "stale" })]} />,
    );
    expect(screen.getByTestId("environment-ribbon-temp-source")).toHaveTextContent("stale");
    rerender(<EnvironmentRibbon {...base} readings={[reading(0, { source: "demo" })]} />);
    expect(screen.getByTestId("environment-ribbon-temp-source")).toHaveTextContent("demo");
  });

  it("breaks the VPD line across a gap instead of interpolating", () => {
    render(<EnvironmentRibbon {...base} readings={[reading(30), reading(0)]} />);
    const d = screen.getByTestId("environment-ribbon-vpd-path").getAttribute("d") ?? "";
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect(d).not.toContain("L");
  });

  it("performs no network or storage side effects on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<EnvironmentRibbon {...base} readings={[reading(0)]} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    setItem.mockRestore();
  });
});

describe("EnvironmentRibbon — cursor", () => {
  it("moves the cursor with the keyboard and updates the readout with the bucket source", () => {
    render(
      <EnvironmentRibbon {...base} readings={[reading(30, { source: "manual" }), reading(0)]} />,
    );
    const svg = screen.getByTestId("environment-ribbon-svg");
    svg.focus();
    fireEvent.keyDown(svg, { key: "End" });
    expect(screen.getByTestId("environment-ribbon-cursor")).toBeInTheDocument();
    expect(screen.getByTestId("environment-ribbon-readout")).toHaveTextContent("source live");
    // 6 buckets back from the end is the manual reading (30 min / 5 min)
    for (let i = 0; i < 6; i++) fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(screen.getByTestId("environment-ribbon-readout")).toHaveTextContent("source manual");
    expect(screen.getByTestId("environment-ribbon-readout")).toHaveTextContent("14:30");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(screen.queryByTestId("environment-ribbon-cursor")).toBeNull();
  });

  it("clears the cursor on pointer leave", () => {
    render(<EnvironmentRibbon {...base} readings={[reading(0)]} />);
    const svg = screen.getByTestId("environment-ribbon-svg");
    fireEvent.keyDown(svg, { key: "Home" });
    expect(screen.getByTestId("environment-ribbon-cursor")).toBeInTheDocument();
    fireEvent.pointerLeave(svg);
    expect(screen.queryByTestId("environment-ribbon-cursor")).toBeNull();
  });
});
