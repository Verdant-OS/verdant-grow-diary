import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OperatorEcowittTentPreview from "@/pages/OperatorEcowittTentPreview";

describe("OperatorEcowittTentPreview (read-only)", () => {
  it("renders Flower live by default and shows read-only/evidence copy", () => {
    render(<OperatorEcowittTentPreview />);
    expect(screen.getByTestId("tent-label").textContent).toBe("Flower Tent");
    expect(screen.getByTestId("source-status").textContent).toBe("LIVE");
    expect(screen.getByTestId("provider").textContent).toBe("ecowitt");
    expect(screen.getByTestId("read-only-copy").textContent).toMatch(/Read-only preview/i);
    expect(screen.getByTestId("evidence-copy").textContent).toMatch(/EcoWitt MQTT sample/i);
  });

  it("switching to Seedling shows only temp2f/humidity2 channels, no soil", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("tent-tab-seedling"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Seedling Tent");
    const air = screen.getByTestId("metric-air_temp_f");
    expect(air.textContent).toMatch(/temp2f/);
    const sm1 = screen.getByTestId("metric-soil_moisture_pct_primary");
    expect(sm1.getAttribute("data-present")).toBe("false");
    expect(screen.getByTestId("root-zone-confidence").textContent).toBe("missing");
  });

  it("switching to Vegetation shows temp3f/humidity3/soilmoisture1", () => {
    render(<OperatorEcowittTentPreview />);
    fireEvent.click(screen.getByTestId("tent-tab-vegetation"));
    expect(screen.getByTestId("tent-label").textContent).toBe("Vegetation Tent");
    expect(screen.getByTestId("metric-air_temp_f").textContent).toMatch(/temp3f/);
    expect(screen.getByTestId("metric-humidity_pct").textContent).toMatch(/humidity3/);
    expect(screen.getByTestId("metric-soil_moisture_pct_primary").textContent).toMatch(/soilmoisture1/);
    expect(screen.getByTestId("root-zone-confidence").textContent).toBe("partial");
  });

  it("never renders PASSKEY/MAC/station/token fields from raw payload", () => {
    render(<OperatorEcowittTentPreview />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/PASSKEY/i);
    expect(body).not.toMatch(/\bMAC\b/);
    expect(body).not.toMatch(/stationtype/i);
    expect(body).not.toMatch(/token/i);
    expect(body).not.toMatch(/password/i);
  });
});
