import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { GgsSentinelFreshnessGuidanceList } from "@/components/GgsSentinelSmokeRunnerPanel";
import type { GgsSentinelMetricFreshness } from "@/lib/ggsSentinelSmokeRunner";

function freshness(
  overrides: Partial<GgsSentinelMetricFreshness>,
): GgsSentinelMetricFreshness {
  return {
    metric: "soil_temp_c",
    capturedAt: "2026-06-17T18:20:00.000Z",
    ageMs: 600_000,
    ageLabel: "10m ago",
    freshnessWindowMs: 900_000,
    freshnessWindowLabel: "15 min",
    freshnessStatus: "fresh",
    fresh: true,
    stale: false,
    missing: false,
    nextActionLabel: "Fresh — captured 10m ago. Valid for live Sentinel.",
    ...overrides,
  };
}

describe("GgsSentinelFreshnessGuidanceList", () => {
  it("renders nothing when no freshness rows are present", () => {
    const { container } = render(<GgsSentinelFreshnessGuidanceList metricFreshness={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders compact rows with age, status, and next action visible", () => {
    render(
      <GgsSentinelFreshnessGuidanceList
        metricFreshness={[
          freshness({
            metric: "soil_moisture_pct",
            freshnessStatus: "fresh",
            ageLabel: "4m ago",
            nextActionLabel: "Fresh — captured 4m ago. Valid for live Sentinel.",
          }),
          freshness({
            metric: "ec",
            freshnessStatus: "aging",
            ageLabel: "13m ago",
            nextActionLabel: "Fresh but aging — captured 13m ago. Recheck soon; stale at 15 min.",
          }),
          freshness({
            metric: "soil_temp_c",
            freshnessStatus: "stale",
            stale: true,
            fresh: false,
            ageLabel: "24m ago",
            nextActionLabel: "Stale — captured 24m ago. Ingest a new real GGS reading to clear live Sentinel.",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("ggs-freshness-compact-list")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-freshness-priority-note")).toHaveTextContent(
      "Freshness guidance explains metric timing only",
    );

    expect(screen.getByText("4m ago")).toBeInTheDocument();
    expect(screen.getByText("13m ago")).toBeInTheDocument();
    expect(screen.getByText("24m ago")).toBeInTheDocument();
    expect(screen.getByText("Fresh — captured 4m ago. Valid for live Sentinel.")).toBeInTheDocument();
    expect(screen.getByText(/Fresh but aging/)).toBeInTheDocument();
    expect(screen.getByText(/Ingest a new real GGS reading/)).toBeInTheDocument();
  });

  it("renders missing guidance distinctly", () => {
    render(
      <GgsSentinelFreshnessGuidanceList
        metricFreshness={[
          freshness({
            metric: "soil_temp_c",
            capturedAt: null,
            ageMs: null,
            freshnessStatus: "missing",
            fresh: false,
            missing: true,
            ageLabel: "—",
            nextActionLabel: "Missing — no recent GGS soil temperature row found.",
          }),
        ]}
      />,
    );

    expect(screen.getByText(/no recent GGS soil temperature row found/)).toBeInTheDocument();
    expect(screen.getByLabelText("no row found")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-freshness-row-missing")).toHaveClass("border-dashed");
  });

  it("uses distinct accessible icon labels for stale and missing states", () => {
    render(
      <GgsSentinelFreshnessGuidanceList
        metricFreshness={[
          freshness({ metric: "ec", freshnessStatus: "stale", stale: true, fresh: false }),
          freshness({
            metric: "soil_temp_c",
            capturedAt: null,
            ageMs: null,
            ageLabel: "—",
            freshnessStatus: "missing",
            missing: true,
            fresh: false,
          }),
        ]}
      />,
    );

    expect(screen.getByLabelText("row expired")).toBeInTheDocument();
    expect(screen.getByLabelText("no row found")).toBeInTheDocument();
    expect(screen.getByTestId("ggs-freshness-row-stale")).toHaveClass("border-l-destructive");
    expect(screen.getByTestId("ggs-freshness-row-missing")).toHaveClass("border-dashed");
  });

  it("renders focusable tooltip triggers for freshness badges", () => {
    render(
      <GgsSentinelFreshnessGuidanceList
        metricFreshness={[
          freshness({ metric: "soil_moisture_pct", freshnessStatus: "fresh" }),
          freshness({ metric: "ec", freshnessStatus: "aging" }),
          freshness({ metric: "soil_temp_c", freshnessStatus: "stale", stale: true, fresh: false }),
          freshness({
            metric: "soil_temp_c",
            capturedAt: null,
            ageMs: null,
            ageLabel: "—",
            freshnessStatus: "missing",
            missing: true,
            fresh: false,
          }),
        ]}
      />,
    );

    for (const label of [
      "fresh freshness details",
      "aging freshness details",
      "stale freshness details",
      "missing freshness details",
    ]) {
      const trigger = screen.getByLabelText(label);
      expect(trigger).toBeInTheDocument();
      expect(trigger.tagName.toLowerCase()).toBe("button");
    }

    const missingBadge = screen.getByTestId("ggs-freshness-badge-missing");
    expect(within(missingBadge).getByText("missing")).toBeInTheDocument();
  });
});
