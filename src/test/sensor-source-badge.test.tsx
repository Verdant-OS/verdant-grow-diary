import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceBadge from "@/components/sensor/SensorSourceBadge";

describe("SensorSourceBadge", () => {
  it("renders accessible label for demo", () => {
    render(<SensorSourceBadge source="demo" />);
    const el = screen.getByTestId("sensor-source-badge");
    expect(el.getAttribute("aria-label")).toMatch(/demo/i);
    expect(el.textContent).toMatch(/demo/i);
    expect(el.getAttribute("data-source")).toBe("demo");
  });

  it("renders stale and invalid distinctly from live", () => {
    const { rerender } = render(<SensorSourceBadge source="stale" />);
    expect(screen.getByTestId("sensor-source-badge").textContent).toMatch(/stale/i);
    rerender(<SensorSourceBadge source="invalid" />);
    expect(screen.getByTestId("sensor-source-badge").textContent).toMatch(/invalid/i);
  });

  it("unknown sources collapse to invalid, never live", () => {
    render(<SensorSourceBadge source="autopilot" />);
    const el = screen.getByTestId("sensor-source-badge");
    expect(el.getAttribute("data-source")).toBe("invalid");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });
});
