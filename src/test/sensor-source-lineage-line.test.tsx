/**
 * Read-only display tests for SensorSourceLineageLine. Verifies that
 * source + vendor lineage renders cleanly and that non-live sources are
 * never rendered as "Live", even when a vendor is supplied.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceLineageLine from "@/components/SensorSourceLineageLine";

describe("SensorSourceLineageLine", () => {
  it("renders MQTT · EcoWitt when both source and vendor present", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="ecowitt" />);
    const root = screen.getByTestId("sensor-source-lineage");
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("MQTT");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("EcoWitt");
    expect(root.getAttribute("data-non-live")).toBe("false");
  });

  it("renders Webhook · Home Assistant", () => {
    render(<SensorSourceLineageLine source="webhook" vendor="home_assistant" />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("Webhook");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe(
      "Home Assistant",
    );
  });

  it("renders source only when vendor is absent", () => {
    render(<SensorSourceLineageLine source="mqtt" />);
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("MQTT");
    expect(screen.queryByTestId("sensor-source-lineage-vendor")).toBeNull();
  });

  it.each(["manual", "csv", "demo", "stale", "invalid", "import"] as const)(
    "never renders %s source as Live",
    (src) => {
      render(<SensorSourceLineageLine source={src} vendor="ecowitt" />);
      const root = screen.getByTestId("sensor-source-lineage");
      expect(root.getAttribute("data-non-live")).toBe("true");
      expect(root.textContent).not.toContain("Live");
    },
  );

  it("vendor lineage advertises 'never used for auth' as a title hint", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="ecowitt" />);
    const vendorEl = screen.getByTestId("sensor-source-lineage-vendor");
    expect(vendorEl.getAttribute("title")?.toLowerCase()).toContain("never used for auth");
  });

  it("preserves an unknown vendor string verbatim as lineage", () => {
    render(<SensorSourceLineageLine source="mqtt" vendor="future-brand-x" />);
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe(
      "future-brand-x",
    );
  });
});
