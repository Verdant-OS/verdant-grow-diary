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

  it("pi_bridge renders Live sensor with Pi bridge provenance — never the raw token", () => {
    render(<SensorSourceBadge source="pi_bridge" />);
    const el = screen.getByTestId("sensor-source-badge");
    expect(el.getAttribute("data-source")).toBe("live");
    expect(el.textContent).toBe("Live sensor");
    expect(el.getAttribute("data-provenance")).toBe("Pi bridge");
    expect(el.getAttribute("aria-label")).toBe("Sensor source: Live sensor. Provenance: Pi bridge");
    expect(el.textContent?.toLowerCase()).not.toContain("pi_bridge");
  });

  it("home_assistant stays invalid with Home Assistant provenance in aria-label", () => {
    render(<SensorSourceBadge source="home_assistant" />);
    const el = screen.getByTestId("sensor-source-badge");
    expect(el.getAttribute("data-source")).toBe("invalid");
    expect(el.textContent).toBe("Invalid reading");
    expect(el.getAttribute("data-provenance")).toBe("Home Assistant");
    expect(el.getAttribute("aria-label")).toContain("Provenance: Home Assistant");
    expect(el.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it.each(["manual", "csv", "demo", "stale"] as const)(
    "%s never surfaces provenance on the badge",
    (source) => {
      render(<SensorSourceBadge source={source} />);
      const el = screen.getByTestId("sensor-source-badge");
      expect(el.getAttribute("data-provenance")).toBe("");
      expect(el.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
    },
  );
});
