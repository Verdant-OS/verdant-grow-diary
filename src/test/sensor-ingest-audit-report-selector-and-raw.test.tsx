import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SensorIngestAuditReport from "@/components/SensorIngestAuditReport";

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    tent_id: "t",
    captured_at: new Date(Date.UTC(2026, 5, 19, 12, 0, n - i)).toISOString(),
    metric: "temp_c",
    value: 22,
    source: "live",
    raw_payload: { provider: "ecowitt", transport: "mqtt", metrics: { vpd_kpa: 1.1 } },
  }));
}

describe("SensorIngestAuditReport — last-N selector + raw preview", () => {
  it("defaults to 25 and renders up to 25 rows", () => {
    render(
      <SensorIngestAuditReport
        input={{ rows: makeRows(40), now: new Date("2026-06-19T12:01:00Z") }}
      />,
    );
    const select = screen.getByTestId("audit-page-size") as HTMLSelectElement;
    expect(select.value).toBe("25");
    expect(screen.getAllByTestId(/^audit-row-r\d+$/)).toHaveLength(25);
  });

  it("supports 10 and 50 options; selecting 10 shrinks the list", () => {
    render(
      <SensorIngestAuditReport
        input={{ rows: makeRows(40), now: new Date("2026-06-19T12:01:00Z") }}
      />,
    );
    fireEvent.change(screen.getByTestId("audit-page-size"), { target: { value: "10" } });
    expect(screen.getAllByTestId(/^audit-row-r\d+$/)).toHaveLength(10);
    fireEvent.change(screen.getByTestId("audit-page-size"), { target: { value: "50" } });
    expect(screen.getAllByTestId(/^audit-row-r\d+$/)).toHaveLength(40);
  });

  it("shows available rows without error when fewer than requested", () => {
    render(
      <SensorIngestAuditReport
        input={{ rows: makeRows(3), now: new Date("2026-06-19T12:01:00Z") }}
      />,
    );
    expect(screen.getAllByTestId(/^audit-row-r\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("audit-rejected-note").textContent).toMatch(/Rejected/);
  });

  it("raw payload is collapsed by default and renders redacted preview when opened", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "row1",
              tent_id: "t",
              captured_at: "2026-06-19T11:59:30Z",
              metric: "temp_c",
              value: 22,
              source: "live",
              raw_payload: { PASSKEY: "S3CRET", metrics: { temp_c: 22 } },
            },
          ],
          now: new Date("2026-06-19T12:00:00Z"),
        }}
      />,
    );
    expect(screen.queryByTestId("audit-row-row1-raw")).toBeNull();
    fireEvent.click(screen.getByTestId("audit-row-row1-toggle-raw"));
    const preview = screen.getByTestId("audit-row-row1-raw-preview");
    expect(preview.textContent ?? "").toContain("[redacted]");
    expect(preview.textContent ?? "").not.toContain("S3CRET");
  });

  it("hides preview when payload contains MAC-shaped value", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "rowMAC",
              tent_id: "t",
              captured_at: "2026-06-19T11:59:30Z",
              source: "live",
              raw_payload: { note: "AA:BB:CC:DD:EE:FF" },
            },
          ],
          now: new Date("2026-06-19T12:00:00Z"),
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("audit-row-rowMAC-toggle-raw"));
    expect(screen.getByTestId("audit-row-rowMAC-raw-hidden")).toBeTruthy();
    expect(screen.queryByTestId("audit-row-rowMAC-raw-preview")).toBeNull();
  });

  it("does not put raw payload in row data-* attributes", () => {
    render(
      <SensorIngestAuditReport
        input={{
          rows: [
            {
              id: "rowX",
              tent_id: "t",
              captured_at: "2026-06-19T11:59:30Z",
              source: "live",
              raw_payload: { secret_blob: "SHOULD_NOT_LEAK_VALUE_123" },
            },
          ],
        }}
      />,
    );
    const row = screen.getByTestId("audit-row-rowX");
    for (const a of Array.from(row.attributes)) {
      expect(a.value).not.toContain("SHOULD_NOT_LEAK_VALUE_123");
    }
  });
});
