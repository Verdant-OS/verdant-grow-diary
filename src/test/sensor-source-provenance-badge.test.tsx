/**
 * SensorSourceProvenanceBadge — presenter tests.
 *
 * Validates the One-Tent Loop's source/provenance chip:
 *   - Manual renders as "Manual reading" with a manual tone (never Live).
 *   - Live renders as "Live" (or promoted vendor) with a live tone.
 *   - CSV / Demo / Stale / Invalid / Unknown render degraded — never Live.
 *   - Manual with a vendor hint still renders Manual, never EcoWitt/Live.
 *   - data-tone and data-degraded mirror buildSensorSourceBadge.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceProvenanceBadge from "@/components/SensorSourceProvenanceBadge";

const TESTID = "sensor-source-provenance-badge";

describe("SensorSourceProvenanceBadge", () => {
  it("renders Manual prominently and never as Live", () => {
    render(<SensorSourceProvenanceBadge source="manual" />);
    const el = screen.getByTestId(TESTID);
    expect(el.textContent).toBe("Manual reading");
    expect(el.getAttribute("data-tone")).toBe("manual");
    expect(el.getAttribute("data-degraded")).toBe("false");
    expect(el.getAttribute("data-manual")).toBe("true");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });

  it("appends the manual device note when provided", () => {
    render(
      <SensorSourceProvenanceBadge
        source="manual"
        manualDeviceNote="EcoWitt WH45"
      />,
    );
    expect(screen.getByTestId(TESTID).textContent).toBe(
      "Manual reading · EcoWitt WH45",
    );
  });

  it("renders Live for live readings", () => {
    render(<SensorSourceProvenanceBadge source="live" />);
    const el = screen.getByTestId(TESTID);
    expect(el.textContent).toBe("Live");
    expect(el.getAttribute("data-tone")).toBe("live");
    expect(el.getAttribute("data-degraded")).toBe("false");
  });

  it("promotes recognised vendor for live readings", () => {
    render(<SensorSourceProvenanceBadge source="live" vendor="ecowitt" />);
    expect(screen.getByTestId(TESTID).textContent).toBe("Ecowitt");
  });

  it("never promotes vendor for manual readings (no Live, no Ecowitt-as-label)", () => {
    render(<SensorSourceProvenanceBadge source="manual" vendor="ecowitt" />);
    const txt = screen.getByTestId(TESTID).textContent ?? "";
    expect(txt).toContain("Manual");
    expect(txt).not.toMatch(/^Live$/);
    expect(txt).not.toMatch(/^Ecowitt$/);
  });

  it.each(["demo", "stale", "invalid"] as const)(
    "renders %s as degraded, not Live",
    (src) => {
      render(<SensorSourceProvenanceBadge source={src} />);
      const el = screen.getByTestId(TESTID);
      expect(el.getAttribute("data-tone")).toBe(src);
      expect(el.getAttribute("data-degraded")).toBe("true");
      expect(el.textContent?.toLowerCase()).not.toContain("live");
    },
  );

  it("renders CSV with its csv tone (not Live, not degraded)", () => {
    render(<SensorSourceProvenanceBadge source="csv" />);
    const el = screen.getByTestId(TESTID);
    expect(el.getAttribute("data-tone")).toBe("csv");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });

  it("renders unknown source as degraded (never as Live)", () => {
    render(<SensorSourceProvenanceBadge source={null} />);
    const el = screen.getByTestId(TESTID);
    expect(el.getAttribute("data-tone")).toBe("unknown");
    expect(el.getAttribute("data-degraded")).toBe("true");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });
});
