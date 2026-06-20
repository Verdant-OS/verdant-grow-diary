import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SensorIngestAuditReport from "@/components/SensorIngestAuditReport";
import EcowittBridgeTroubleshootingPanel from "@/components/EcowittBridgeTroubleshootingPanel";

describe("Operator empty states", () => {
  it("audit report shows calm empty state when no readings", () => {
    render(<SensorIngestAuditReport input={{ rows: [] }} />);
    expect(screen.getByTestId("audit-empty-no-readings").textContent).toMatch(
      /No EcoWitt readings found yet/,
    );
    expect(screen.getByTestId("audit-empty-no-readings").textContent).toMatch(
      /Run the dry-run command first/,
    );
    expect(screen.getByTestId("audit-rejected-note").textContent).toMatch(/Rejected/);
  });

  it("audit report empty-after-filters preserves rejected note", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "r1",
              tent_id: "t",
              captured_at: "2026-06-19T12:00:00Z",
              source: "live",
              raw_payload: { provider: "ecowitt", device_name: "Tent A" },
            },
          ],
        }}
      />,
    );
    fireEvent.change(screen.getByTestId("audit-device-query"), {
      target: { value: "no-match-string" },
    });
    expect(screen.getByTestId("audit-empty-after-filters")).toBeTruthy();
    expect(screen.getByTestId("audit-rejected-note").textContent).toMatch(/Rejected/);
  });

  it("audit empty state contains no start/listen/control CTA", () => {
    const { container } = render(<SensorIngestAuditReport input={{ rows: [] }} />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/start bridge/);
    expect(html).not.toMatch(/listen to mqtt/);
    expect(html).not.toMatch(/port-forward/);
  });

  it("troubleshooting panel renders calm empty state when no last reading", () => {
    render(
      <EcowittBridgeTroubleshootingPanel
        input={{
          env: { bridgeTokenStatus: "unknown", tentIdConfigured: false },
          lastReading: null,
        }}
      />,
    );
    expect(screen.getByTestId("troubleshooting-empty-no-readings").textContent).toMatch(
      /No EcoWitt readings found yet/,
    );
    expect(screen.getByTestId("troubleshooting-token-unknown-note").textContent).toMatch(
      /needs verification/,
    );
    expect(screen.getByTestId("troubleshooting-missing-tent-id-note").textContent).toMatch(
      /VERDANT_TENT_ID/,
    );
  });

  it("troubleshooting panel does not expose token values", () => {
    const { container } = render(
      <EcowittBridgeTroubleshootingPanel
        input={{
          env: { bridgeTokenStatus: "present" },
          lastReading: null,
        }}
      />,
    );
    const html = container.innerHTML;
    // No JWT / Bearer / hex tokens
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\./);
    expect(html).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  });
});
