import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EnvironmentCheckInsightsPanel, {
  ENVIRONMENT_CHECK_INSIGHTS_EXPAND_LABEL,
  ENVIRONMENT_CHECK_INSIGHTS_COLLAPSE_LABEL,
} from "@/components/EnvironmentCheckInsightsPanel";
import {
  ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER,
  ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH,
  ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE,
  ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS,
} from "@/lib/environmentCheckInsightsViewModel";
import type { EnvironmentCheckTimelineRawEntry } from "@/lib/environmentCheckTimelineViewModel";

function entry(
  id: string,
  occurredAt: string,
  env: Record<string, unknown>,
): EnvironmentCheckTimelineRawEntry {
  return {
    id,
    entry_at: occurredAt,
    event_type: "environment_check",
    note: "",
    details: { environment_check: env },
  };
}

describe("<EnvironmentCheckInsightsPanel />", () => {
  it("renders collapsed by default with the disclaimer visible", () => {
    render(<EnvironmentCheckInsightsPanel rawEntries={[]} />);
    const toggle = screen.getByTestId("env-check-insights-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("env-check-insights-expanded")).toBeNull();
    expect(
      screen.getByTestId("env-check-insights-disclaimer-collapsed").textContent,
    ).toBe(ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER);
  });

  it("shows 'not enough history' copy when fewer than 2 entries exist", () => {
    render(
      <EnvironmentCheckInsightsPanel
        rawEntries={[entry("a", "2026-06-15T10:00:00Z", { temp_c: 24 })]}
      />,
    );
    expect(screen.getByTestId("env-check-insights-summary").textContent).toBe(
      ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH,
    );
  });

  it("expands on click and reveals latest values, stats, and disclaimer", () => {
    render(
      <EnvironmentCheckInsightsPanel
        rawEntries={[
          entry("a", "2026-06-10T10:00:00Z", { temp_c: 22, humidity_pct: 50 }),
          entry("b", "2026-06-17T10:00:00Z", {
            temp_c: 26,
            humidity_pct: 60,
            vpd_kpa: 1.2,
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("env-check-insights-toggle"));
    expect(screen.getByTestId("env-check-insights-expanded")).toBeInTheDocument();
    expect(screen.getByTestId("env-check-insights-latest")).toBeInTheDocument();
    expect(screen.getByTestId("env-check-insights-stats")).toBeInTheDocument();
    expect(
      screen.getByTestId("env-check-insights-disclaimer-expanded").textContent,
    ).toBe(ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER);
    expect(
      screen.getByTestId("env-check-insights-generic-targets").textContent,
    ).toBe(ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS);
  });

  it("renders the cautious out-of-range chip when the latest value is outside the generic range", () => {
    render(
      <EnvironmentCheckInsightsPanel
        rawEntries={[
          entry("a", "2026-06-10T10:00:00Z", { temp_c: 24 }),
          entry("b", "2026-06-17T10:00:00Z", { temp_c: 35 }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("env-check-insights-toggle"));
    const chip = screen.getByTestId("env-check-insights-out-of-range-temp");
    expect(chip.textContent).toBe(ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE);
  });

  it("does not render health-score or escalation language anywhere", () => {
    render(
      <EnvironmentCheckInsightsPanel
        rawEntries={[
          entry("a", "2026-06-10T10:00:00Z", { temp_c: 22 }),
          entry("b", "2026-06-17T10:00:00Z", { temp_c: 35 }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("env-check-insights-toggle"));
    const html = screen.getByTestId("env-check-insights-panel").textContent ?? "";
    expect(html).not.toMatch(/danger/i);
    expect(html).not.toMatch(/fix immediately/i);
    expect(html).not.toMatch(/unhealthy/i);
    expect(html).not.toMatch(/health score/i);
    expect(html).not.toMatch(/\bis live\b/i);
  });

  it("toggle button exposes accessible aria-label + aria-controls", () => {
    render(<EnvironmentCheckInsightsPanel rawEntries={[]} />);
    const toggle = screen.getByTestId("env-check-insights-toggle");
    expect(toggle.getAttribute("aria-label")).toBe(
      ENVIRONMENT_CHECK_INSIGHTS_EXPAND_LABEL,
    );
    expect(toggle.getAttribute("aria-controls")).toBe("env-check-insights-region");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe(
      ENVIRONMENT_CHECK_INSIGHTS_COLLAPSE_LABEL,
    );
  });
});
