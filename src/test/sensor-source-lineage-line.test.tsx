/**
 * Read-only display tests for SensorSourceLineageLine. Verifies that
 * Source is always a canonical label, provenance/vendor stays separate,
 * and non-live sources are never rendered as "Live".
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceLineageLine from "@/components/SensorSourceLineageLine";

describe("SensorSourceLineageLine", () => {
  it("renders canonical Source + vendor provenance for mqtt · EcoWitt", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="ecowitt" />);
    const root = screen.getByTestId("sensor-source-lineage");
    // mqtt is not a canonical source — Source is Invalid reading, vendor is lineage.
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("Invalid reading");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("EcoWitt");
    expect(root.getAttribute("data-source")).toBe("invalid");
    expect(root.getAttribute("data-non-live")).toBe("true");
    expect(root.textContent).not.toMatch(/\bLive\b/i);
  });

  it("renders canonical Source + Home Assistant vendor lineage", () => {
    render(<SensorSourceLineageLine source="webhook" vendor="home_assistant" />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("Invalid reading");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("Home Assistant");
    expect(screen.getByTestId("sensor-source-lineage").textContent).not.toMatch(/\bLive\b/i);
  });

  it("surfaces display-canon provenance when vendor is absent", () => {
    render(<SensorSourceLineageLine source="mqtt" />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("Invalid reading");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("MQTT");
  });

  it("shows Live sensor for pi_bridge with Pi bridge provenance", () => {
    render(<SensorSourceLineageLine source="pi_bridge" />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("Live sensor");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("Pi bridge");
    expect(screen.getByTestId("sensor-source-lineage").getAttribute("data-source")).toBe("live");
  });

  it.each(["manual", "csv", "demo", "stale", "invalid", "import"] as const)(
    "never renders %s source as Live",
    (src) => {
      render(<SensorSourceLineageLine source={src} vendor="ecowitt" />);
      const root = screen.getByTestId("sensor-source-lineage");
      expect(root.getAttribute("data-non-live")).toBe("true");
      expect(root.textContent).not.toMatch(/\bLive\b/i);
    },
  );

  it("vendor lineage advertises it is never used as Source", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="ecowitt" />);
    const vendorEl = screen.getByTestId("sensor-source-lineage-vendor");
    expect(vendorEl.getAttribute("title")?.toLowerCase()).toContain("never used as source");
    expect(vendorEl.getAttribute("title")?.toLowerCase()).toContain("never used for auth");
  });

  it("preserves an unknown vendor string verbatim as lineage", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="future-brand-x" />);
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("future-brand-x");
  });
});
