import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EnvironmentSummaryExportHistoryPanel from "@/components/EnvironmentSummaryExportHistoryPanel";
import type { EnvironmentSummaryExportAuditEvent } from "@/lib/environmentSummaryExportAuditRules";

function evt(
  partial: Partial<EnvironmentSummaryExportAuditEvent> & { id: string },
): EnvironmentSummaryExportAuditEvent {
  return {
    id: partial.id,
    eventType: partial.eventType ?? "full_report_print_opened",
    occurredAt: partial.occurredAt ?? "2026-06-08T12:00:00.000Z",
    dateRange: partial.dateRange ?? {
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    },
    reportMode: partial.reportMode ?? "full_report",
    issueRuleId: partial.issueRuleId ?? null,
    issueLabel: partial.issueLabel ?? null,
    source: "local_only",
  };
}

describe("EnvironmentSummaryExportReceiptDetail", () => {
  it("renders a Details action for each export history row", () => {
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1" }), evt({ id: "e2" })]}
        onReopen={() => {}}
      />,
    );
    const detailButtons = screen.getAllByTestId("env-report-export-history-details");
    expect(detailButtons).toHaveLength(2);
  });

  it("opens receipt dialog with timestamp, date range, mode, and source", () => {
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1", occurredAt: "2026-06-08T14:30:00.000Z" })]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));

    expect(screen.getByTestId("env-report-receipt-dialog")).toBeTruthy();
    expect(screen.getByTestId("receipt-event-id").textContent).toBe("e1");
    expect(screen.getByTestId("receipt-occurred-at").textContent).toBe(
      "2026-06-08 14:30:00Z",
    );
    expect(screen.getByTestId("receipt-mode").textContent).toBe("Full report");
    expect(screen.getByTestId("receipt-range").textContent).toBe(
      "2026-06-01 → 2026-06-07",
    );
    expect(screen.getByTestId("receipt-source").textContent).toBe("local_only");
  });

  it("full report receipt renders without issue filter rows", () => {
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1", reportMode: "full_report" })]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));

    expect(screen.queryByTestId("receipt-issue-label")).toBeNull();
    expect(screen.queryByTestId("receipt-issue-rule-id")).toBeNull();
    expect(screen.getByTestId("receipt-mode").textContent).toBe("Full report");
  });

  it("drilldown receipt renders with issue filter rows", () => {
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[
          evt({
            id: "e1",
            eventType: "drilldown_print_opened",
            reportMode: "drilldown",
            issueRuleId: "source.review",
            issueLabel: "Source review required",
          }),
        ]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));

    expect(screen.getByTestId("receipt-mode").textContent).toBe("Drilldown");
    expect(screen.getByTestId("receipt-issue-label").textContent).toBe(
      "Source review required",
    );
    expect(screen.getByTestId("receipt-issue-rule-id").textContent).toBe(
      "source.review",
    );
  });

  it("opening details does not create a new audit row", () => {
    const events = [evt({ id: "e1" })];
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={events}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));
    // The panel receives events as props; it should never mutate or append.
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("e1");
  });

  it("copy receipt summary calls clipboard with expected plain-text content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[
          evt({
            id: "e1",
            occurredAt: "2026-06-08T12:00:00.000Z",
            reportMode: "drilldown",
            eventType: "drilldown_print_opened",
            issueRuleId: "temp.high",
            issueLabel: "High temperature",
          }),
        ]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));
    fireEvent.click(screen.getByTestId("env-report-receipt-copy-btn"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });

    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("Verdant Environment Summary Export Receipt");
    expect(copiedText).toContain("Event ID:       e1");
    expect(copiedText).toContain("Report mode:    Drilldown");
    expect(copiedText).toContain("Issue filter:   High temperature");
    expect(copiedText).toContain("Source:         local_only");
    expect(copiedText).toContain("This receipt is stored locally");
  });

  it("clipboard failure shows a safe fallback message and does not crash", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });

    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1" })]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));
    fireEvent.click(screen.getByTestId("env-report-receipt-copy-btn"));

    await waitFor(() => {
      expect(
        screen.getByTestId("env-report-receipt-copy-fallback"),
      ).toBeTruthy();
    });

    expect(screen.getByTestId("env-report-receipt-copy-fallback").textContent).toContain(
      "Copy unavailable",
    );
  });

  it("detail modal has print-hidden structure", () => {
    const { container } = render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1" })]}
        onReopen={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-details"));

    const dialog = container.querySelector(
      '[data-testid="env-report-receipt-dialog"]',
    );
    expect(dialog?.className).toMatch(/print-hidden/);
  });

  it("receipt detail code does not import Supabase, fetch, or write helpers", async () => {
    const fs = await import("node:fs/promises");
    const panelSrc = await fs.readFile(
      "src/components/EnvironmentSummaryExportHistoryPanel.tsx",
      "utf8",
    );
    expect(panelSrc).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(panelSrc).not.toMatch(/fetch\(/);
    expect(panelSrc).not.toMatch(/functions\.invoke/);
    expect(panelSrc).not.toMatch(/\.rpc\(/);

    const receiptSrc = await fs.readFile(
      "src/lib/environmentSummaryExportReceiptView.ts",
      "utf8",
    );
    expect(receiptSrc).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(receiptSrc).not.toMatch(/fetch\(/);
    expect(receiptSrc).not.toMatch(/functions\.invoke/);
    expect(receiptSrc).not.toMatch(/\.rpc\(/);
  });

  it("reopening still works alongside details", () => {
    const onReopen = vi.fn();
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[
          evt({
            id: "e1",
            eventType: "drilldown_print_opened",
            reportMode: "drilldown",
            issueRuleId: "source.review",
          }),
        ]}
        onReopen={onReopen}
      />,
    );

    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));
    expect(onReopen).toHaveBeenCalledWith({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      issueRuleId: "source.review",
    });
  });
});
