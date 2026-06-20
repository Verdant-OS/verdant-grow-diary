/**
 * timeline-sensor-source-badge-component — render tests for the
 * canonical source badge.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineSensorSourceBadge from "@/components/TimelineSensorSourceBadge";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";

describe("TimelineSensorSourceBadge", () => {
  for (const [raw, expected, label] of [
    ["live", "live", "Source: live"],
    ["manual", "manual", "Source: manual"],
    ["csv", "csv", "Source: CSV"],
    ["demo", "demo", "Source: demo"],
    ["stale", "stale", "Source: stale"],
    ["invalid", "invalid", "Source: invalid"],
  ] as const) {
    it(`renders ${expected} kind from source=${raw}`, () => {
      const badge = classifyTimelineSensorSource({ rawSource: raw });
      render(<TimelineSensorSourceBadge badge={badge} />);
      const el = screen.getByTestId(`timeline-sensor-source-badge-${expected}`);
      expect(el).toHaveTextContent(label);
      expect(el).toHaveAttribute("data-source-kind", expected);
    });
  }

  it("missing source renders invalid (never live)", () => {
    const badge = classifyTimelineSensorSource({ rawSource: null });
    render(<TimelineSensorSourceBadge badge={badge} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-invalid")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-sensor-source-badge-live")).toBeNull();
  });
});
