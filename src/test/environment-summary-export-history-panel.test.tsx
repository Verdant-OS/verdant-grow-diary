import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("EnvironmentSummaryExportHistoryPanel", () => {
  it("renders empty state when no events", () => {
    render(
      <EnvironmentSummaryExportHistoryPanel events={[]} onReopen={() => {}} />,
    );
    expect(screen.getByTestId("env-report-export-history-empty")).toBeTruthy();
    expect(
      screen.getByTestId("env-report-export-history-count").textContent,
    ).toBe("(0)");
  });

  it("renders most-recent events first and respects limit", () => {
    const events = [
      evt({ id: "e1", occurredAt: "2026-06-01T00:00:00.000Z" }),
      evt({ id: "e2", occurredAt: "2026-06-02T00:00:00.000Z" }),
      evt({ id: "e3", occurredAt: "2026-06-03T00:00:00.000Z" }),
    ];
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={events}
        limit={2}
        onReopen={() => {}}
      />,
    );
    const items = screen.getAllByTestId("env-report-export-history-item");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-event-id")).toBe("e3");
    expect(items[1].getAttribute("data-event-id")).toBe("e2");
  });

  it("calls onReopen with date range and clears issue for full report", () => {
    const onReopen = vi.fn();
    render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1" })]}
        onReopen={onReopen}
      />,
    );
    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));
    expect(onReopen).toHaveBeenCalledWith({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      issueRuleId: null,
    });
  });

  it("passes issueRuleId when reopening a drilldown event", () => {
    const onReopen = vi.fn();
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

  it("is hidden from print output via print-hidden class", () => {
    const { container } = render(
      <EnvironmentSummaryExportHistoryPanel
        events={[evt({ id: "e1" })]}
        onReopen={() => {}}
      />,
    );
    const root = container.querySelector(
      '[data-testid="env-report-export-history"]',
    );
    expect(root?.className).toMatch(/print-hidden/);
  });

  it("does not import network or supabase modules", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "src/components/EnvironmentSummaryExportHistoryPanel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/fetch\(/);
  });
});
