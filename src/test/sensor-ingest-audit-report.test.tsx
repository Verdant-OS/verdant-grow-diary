import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorIngestAuditReport from "@/components/SensorIngestAuditReport";

describe("SensorIngestAuditReport", () => {
  it("renders accepted rows + rejected-not-persisted note + redacted payload", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "row1",
              tent_id: "tent-uuid",
              captured_at: "2026-06-19T11:59:30Z",
              metric: "temp_c",
              value: 22,
              source: "live",
              raw_payload: {
                provider: "ecowitt",
                transport: "mqtt",
                PASSKEY: "ABCSECRET",
                metrics: { vpd_kpa: 1.2, soil_moisture_pct: 38 },
              },
            },
          ],
          now: new Date("2026-06-19T12:00:00Z"),
        }}
      />,
    );
    expect(screen.getByTestId("audit-rejected-note").textContent).toMatch(/Rejected ingest attempts/);
    const row = screen.getByTestId("audit-row-row1");
    expect(row.getAttribute("data-source")).toBe("live");
    expect(row.getAttribute("data-provider")).toBe("ecowitt");
    expect(row.getAttribute("data-freshness")).toBe("fresh");
    expect(screen.getByTestId("audit-row-row1-vpd").textContent).toMatch(/1\.20/);
    expect(screen.getByTestId("sensor-ingest-audit-report").textContent ?? "").not.toContain("ABCSECRET");
  });

  it("renders blank VPD when missing (not 0)", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "row2",
              tent_id: "t",
              captured_at: "2026-06-19T11:59:30Z",
              source: "live",
              raw_payload: { metrics: { vpd_kpa: 0 } },
            },
          ],
          now: new Date("2026-06-19T12:00:00Z"),
        }}
      />,
    );
    expect(screen.getByTestId("audit-row-row2-vpd").textContent).toBe("");
  });
});
