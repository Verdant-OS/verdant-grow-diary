import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EcowittBridgeTroubleshootingPanel from "@/components/EcowittBridgeTroubleshootingPanel";

const NOW = new Date("2026-06-19T12:00:00.000Z");

describe("EcowittBridgeTroubleshootingPanel", () => {
  it("renders actionable errors without exposing secrets", () => {
    render(
      <EcowittBridgeTroubleshootingPanel
        input={{
          env: {
            tentIdConfigured: false,
            bridgeTokenStatus: "missing",
            sendModeRequested: true,
            ingestUrlConfigured: false,
            channelMapJsonValid: false,
          },
          lastReading: null,
          now: NOW,
        }}
      />,
    );
    const panel = screen.getByTestId("ecowitt-bridge-troubleshooting-panel");
    expect(panel.getAttribute("data-overall")).toBe("error");
    expect(screen.getByTestId("troubleshooting-check-tent_id").getAttribute("data-status")).toBe(
      "error",
    );
    expect(
      screen.getByTestId("troubleshooting-check-bridge_token").getAttribute("data-status"),
    ).toBe("error");
    expect(panel.textContent ?? "").not.toMatch(/Bearer [A-Za-z0-9]/);
  });

  it("shows source: live, provider: ecowitt, transport: mqtt when available", () => {
    render(
      <EcowittBridgeTroubleshootingPanel
        input={{
          env: { tentIdConfigured: true, bridgeTokenStatus: "present" },
          lastReading: {
            capturedAt: "2026-06-19T11:59:30.000Z",
            source: "live",
            quality: "ok",
            provider: "ecowitt",
            transport: "mqtt",
            humidityPct: 55,
            soilMoisturePct: 30,
            airTempC: 23,
            vpdKpa: 1.1,
          },
          now: NOW,
        }}
      />,
    );
    expect(
      screen.getByTestId("troubleshooting-check-source_live").getAttribute("data-status"),
    ).toBe("ok");
    expect(
      screen.getByTestId("troubleshooting-check-provider_ecowitt").getAttribute("data-status"),
    ).toBe("ok");
    expect(
      screen.getByTestId("troubleshooting-check-transport_mqtt").getAttribute("data-status"),
    ).toBe("ok");
  });

  it("renders all next-action items", () => {
    render(<EcowittBridgeTroubleshootingPanel input={{}} />);
    expect(screen.getByTestId("troubleshooting-action-dry_run_first")).toBeTruthy();
    expect(screen.getByTestId("troubleshooting-action-mqtt_explorer")).toBeTruthy();
    expect(screen.getByTestId("troubleshooting-action-no_router_ports")).toBeTruthy();
  });
});
