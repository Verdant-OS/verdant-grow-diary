/**
 * environment-summary-print-export-browser-smoke.test.tsx
 *
 * Browser-like smoke gate over the Environment Summary Report
 * print/export flow. Validates the user-facing flow end-to-end in
 * jsdom before any new export/package features ship.
 *
 * QA/test-only slice. No app behavior changes.
 *
 * Verifies:
 *  - report page renders with printable cover content (full + drilldown
 *    page indicators present)
 *  - pre-print confirmation modal opens before window.print()
 *  - confirming export records exactly one local audit event
 *  - export history panel refreshes after confirmed export
 *  - Reopen restores start date, end date, mode, and optional issue
 *  - export history panel is hidden from print media (print-hidden)
 *  - reopening an export does NOT add a duplicate history row
 *  - flow works with no issue filter (full_report path)
 *  - static guards: window.print() is only invoked after modal confirm,
 *    audit storage is local-only, no Supabase write path is added
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
  clearEnvironmentSummaryExportAuditEvents,
  readEnvironmentSummaryExportAuditEvents,
} from "@/lib/environmentSummaryExportAuditRules";

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: resolveEntitlements(
      {
        id: "x",
        user_id: "u",
        plan_id: "pro_monthly",
        status: "active",
        provider: "paddle",
        provider_customer_id: null,
        provider_subscription_id: null,
        current_period_end: null,
        cancel_at_period_end: false,
        founder_number: null,
        created_at: "",
        updated_at: "",
      } as any,
      new Date("2026-06-08T00:00:00Z"),
    ),
  }),
}));

// Two stale entries → produces the `source.review` top issue (warning).
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [
      {
        id: "e-1",
        entry_at: "2026-06-02T12:00:00.000Z",
        kind: "environment",
        snapshot: { source: "stale", tempC: 24, rhPercent: 60 },
      },
      {
        id: "e-2",
        entry_at: "2026-06-03T12:00:00.000Z",
        kind: "environment",
        snapshot: { source: "stale", tempC: 24, rhPercent: 60 },
      },
    ],
    isLoading: false,
  }),
}));

const supabaseCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/integrations/supabase/client", () => {
  const writeMethods = new Set(["insert", "update", "delete", "upsert", "rpc"]);
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        supabaseCalls.count += 1;
        if (writeMethods.has(prop)) {
          throw new Error(`Forbidden Supabase write: ${prop}`);
        }
        if (prop === "from") {
          return () =>
            new Proxy(
              {},
              {
                get(_t2, p2: string) {
                  supabaseCalls.count += 1;
                  if (writeMethods.has(p2)) {
                    throw new Error(`Forbidden Supabase write: ${p2}`);
                  }
                  return () => proxy;
                },
              },
            );
        }
        if (prop === "functions") {
          return {
            invoke: () => {
              throw new Error("Forbidden functions.invoke");
            },
          };
        }
        return () => proxy;
      },
    },
  );
  return { supabase: proxy };
});

import EnvironmentSummaryReportPage from "@/pages/EnvironmentSummaryReportPage";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/diary/environment-summary"
            element={<EnvironmentSummaryReportPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Environment Summary Report — print/export browser smoke gate", () => {
  beforeEach(() => {
    supabaseCalls.count = 0;
    clearEnvironmentSummaryExportAuditEvents();
  });

  it("renders the report page with printable cover content + page indicator", () => {
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const cover = screen.getByTestId("env-report-print-cover-page");
    expect(cover).toBeTruthy();
    // Cover page indicator (print-only, visually hidden on screen).
    expect(
      within(cover).getByTestId("env-report-print-cover-page-page-indicator"),
    ).toBeTruthy();
    // Cover renders status counts.
    expect(
      within(cover).getByTestId("env-report-print-cover-page-status-counts"),
    ).toBeTruthy();
  });

  it("drilldown header exposes a print-only page indicator when an issue is active", () => {
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    expect(
      screen.getByTestId("env-report-drilldown-page-indicator"),
    ).toBeTruthy();
  });

  it("Download PDF opens the pre-print modal before window.print()", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    expect(screen.getByTestId("env-report-pre-print-modal")).toBeTruthy();
    expect(printSpy).not.toHaveBeenCalled();
    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(0);
    printSpy.mockRestore();
  });

  it("confirming export triggers local audit write, window.print, and refreshes export history", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockImplementation((() => {
        throw new Error("fetch not allowed in print/export flow");
      }) as any);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");

    // Export history starts empty.
    expect(
      screen.getByTestId("env-report-export-history-empty"),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Audit row persisted locally.
    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("local_only");
    expect(events[0].reportMode).toBe("full_report");
    expect(events[0].dateRange).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    });
    expect(
      typeof window.localStorage.getItem(
        ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
      ),
    ).toBe("string");

    // Panel refreshed: count chip updated and list now contains the item.
    expect(
      screen.getByTestId("env-report-export-history-count").textContent,
    ).toBe("(1)");
    expect(
      screen.getAllByTestId("env-report-export-history-item"),
    ).toHaveLength(1);

    printSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("Reopen restores start/end and clears issue for a full-report event", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );

    // Mutate the date inputs after exporting so we can prove Reopen restored.
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));

    const start = screen.getByTestId("env-report-start-date") as HTMLInputElement;
    const end = screen.getByTestId("env-report-end-date") as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2026-01-01" } });
    fireEvent.change(end, { target: { value: "2026-01-02" } });
    expect(start.value).toBe("2026-01-01");

    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));

    // Range restored. Issue cleared because the exported event was full_report.
    expect(
      (screen.getByTestId("env-report-start-date") as HTMLInputElement).value,
    ).toBe("2026-06-01");
    expect(
      (screen.getByTestId("env-report-end-date") as HTMLInputElement).value,
    ).toBe("2026-06-07");
    // Drilldown section should not render without an active issue.
    expect(screen.queryByTestId("env-report-drilldown-section")).toBeNull();
    printSpy.mockRestore();
  });

  it("Reopen restores the issue filter (mode = drilldown) for a drilldown event", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    fireEvent.click(screen.getByTestId("env-report-download-drilldown-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));

    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].reportMode).toBe("drilldown");
    expect(events[0].issueRuleId).toBe("source.review");

    // Drilldown section visible because the issue is active.
    expect(screen.getByTestId("env-report-drilldown-section")).toBeTruthy();
    // Reopen the same event — should keep the issue active.
    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));
    expect(screen.getByTestId("env-report-drilldown-section")).toBeTruthy();
    printSpy.mockRestore();
  });

  it("export history panel is hidden from print output", () => {
    const { container } = renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07",
    );
    const panel = container.querySelector(
      '[data-testid="env-report-export-history"]',
    ) as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.className).toMatch(/print-hidden/);
  });

  it("reopening an export does not add a duplicate history row", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));
    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(1);

    // Reopen twice — should not append new audit rows.
    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));
    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));

    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(1);
    expect(
      screen.getAllByTestId("env-report-export-history-item"),
    ).toHaveLength(1);
    printSpy.mockRestore();
  });

  it("full-report export flow works with no issue filter", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    // No drilldown button without an active issue.
    expect(
      screen.queryByTestId("env-report-download-drilldown-pdf"),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));
    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].issueRuleId).toBeNull();
    expect(events[0].reportMode).toBe("full_report");
    printSpy.mockRestore();
  });

  it("does not touch Supabase during the full export flow (no writes, no functions.invoke)", () => {
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const before = supabaseCalls.count;
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));
    fireEvent.click(screen.getByTestId("env-report-export-history-reopen"));
    expect(supabaseCalls.count).toBe(before);
    printSpy.mockRestore();
  });
});

describe("Environment Summary Report — print/export static safety", () => {
  const pageSrc = readFileSync(
    "src/pages/EnvironmentSummaryReportPage.tsx",
    "utf8",
  );
  const auditSrc = readFileSync(
    "src/lib/environmentSummaryExportAuditRules.ts",
    "utf8",
  );
  const historyPanelSrc = readFileSync(
    "src/components/EnvironmentSummaryExportHistoryPanel.tsx",
    "utf8",
  );
  const modalSrc = readFileSync(
    "src/components/EnvironmentSummaryPrePrintModal.tsx",
    "utf8",
  );

  it("window.print() is only invoked through the confirm handler (triggerPrint)", () => {
    // Exactly one window.print() call site in the page.
    const printMatches = pageSrc.match(/window\.print\s*\(/g) ?? [];
    expect(printMatches.length).toBe(1);
    // window.print is invoked inside triggerPrint, which is called only by
    // handleConfirmPrint. The two download handlers must only set
    // pendingPrintMode (they must not call triggerPrint or window.print).
    const fullHandler = pageSrc.match(
      /const handleDownloadPdf[\s\S]*?\};/,
    )?.[0];
    const drilldownHandler = pageSrc.match(
      /const handleDownloadDrilldownPdf[\s\S]*?\};/,
    )?.[0];
    expect(fullHandler).toBeTruthy();
    expect(drilldownHandler).toBeTruthy();
    expect(fullHandler!).not.toMatch(/window\.print/);
    expect(fullHandler!).not.toMatch(/triggerPrint/);
    expect(drilldownHandler!).not.toMatch(/window\.print/);
    expect(drilldownHandler!).not.toMatch(/triggerPrint/);
    // Confirm handler is where audit + print happen.
    expect(pageSrc).toMatch(/handleConfirmPrint[\s\S]*recordEnvironmentSummaryExportAuditEvent/);
    expect(pageSrc).toMatch(/handleConfirmPrint[\s\S]*triggerPrint/);
    // The pre-print modal wires its confirm button to onConfirm only.
    expect(modalSrc).toMatch(/onConfirm/);
    expect(modalSrc).not.toMatch(/window\.print/);
  });

  it("export audit storage remains local-only (no network / no Supabase)", () => {
    expect(auditSrc).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(auditSrc).not.toMatch(/fetch\s*\(/);
    expect(auditSrc).not.toMatch(/XMLHttpRequest/);
    expect(auditSrc).toMatch(/localStorage/);
    expect(auditSrc).toMatch(/source:\s*["']local_only["']/);
  });

  it("export history panel does not introduce a Supabase write path", () => {
    expect(historyPanelSrc).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(historyPanelSrc).not.toMatch(/fetch\s*\(/);
    expect(historyPanelSrc).not.toMatch(
      /\.(insert|update|delete|upsert|rpc)\s*\(/,
    );
  });

  it("report page export flow does not call Supabase write methods or functions.invoke directly", () => {
    // The page should not contain direct write/RPC/edge-function call sites.
    expect(pageSrc).not.toMatch(/supabase\.(from\([^)]*\)\.)?(insert|update|delete|upsert|rpc)\s*\(/);
    expect(pageSrc).not.toMatch(/functions\.invoke\s*\(/);
  });
});
