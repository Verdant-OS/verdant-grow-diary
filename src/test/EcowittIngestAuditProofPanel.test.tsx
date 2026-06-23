/**
 * Component tests for EcowittIngestAuditProofPanel.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EcowittIngestAuditProofPanel } from "@/components/EcowittIngestAuditProofPanel";
import type { EcowittIngestAuditProofRow } from "@/lib/ecowittIngestAuditProofRules";

const TENT = "tent-1";
const NOW = new Date("2025-01-15T12:00:00Z");

describe("EcowittIngestAuditProofPanel", () => {
  it("renders loaded counts when audit rows are present", () => {
    const rows: EcowittIngestAuditProofRow[] = [
      {
        source: "ecowitt",
        tent_id: TENT,
        rows_received: 10,
        rows_inserted: 7,
        captured_at: "2025-01-15T11:00:00Z",
        created_at: "2025-01-15T11:00:00Z",
      },
    ];
    render(
      <EcowittIngestAuditProofPanel
        tentId={TENT}
        status="loaded"
        rows={rows}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("ecowitt-ingest-audit-proof-panel")).toBeTruthy();
    expect(screen.getByTestId("ecowitt-ingest-audit-proof-received").textContent).toBe("10");
    expect(screen.getByTestId("ecowitt-ingest-audit-proof-inserted").textContent).toBe("7");
    expect(screen.getByTestId("ecowitt-ingest-audit-proof-rejected").textContent).toBe("3");
    expect(screen.getByTestId("ecowitt-ingest-audit-proof-window-label").textContent).toMatch(
      /last 24 hours/,
    );
  });

  it("renders no-audit-rows copy when loaded but empty", () => {
    render(
      <EcowittIngestAuditProofPanel
        tentId={TENT}
        status="loaded"
        rows={[]}
        now={NOW}
      />,
    );
    expect(
      screen.getByTestId("ecowitt-ingest-audit-proof-detail").textContent,
    ).toMatch(/No EcoWitt ingest audit rows found in the current proof window/);
  });

  it("renders unavailable copy when blocked", () => {
    render(
      <EcowittIngestAuditProofPanel
        tentId={TENT}
        status="blocked"
        rows={[]}
        now={NOW}
      />,
    );
    expect(
      screen.getByTestId("ecowitt-ingest-audit-proof-detail").textContent,
    ).toMatch(/unavailable with current read permissions/);
  });

  it("renders unavailable copy when tentId missing", () => {
    render(
      <EcowittIngestAuditProofPanel
        tentId={null}
        status="loaded"
        rows={[]}
        now={NOW}
      />,
    );
    const panel = screen.getByTestId("ecowitt-ingest-audit-proof-panel");
    expect(panel.getAttribute("data-status")).toBe("unavailable");
  });
});
