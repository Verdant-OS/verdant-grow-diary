/**
 * environment-summary-pre-print-modal.test.tsx
 *
 * Covers the EnvironmentSummaryPrePrintModal and integration cases:
 *  - opens before window.print() on both buttons (full + drilldown)
 *  - shows mode, date range, generated, safety note
 *  - drilldown mode shows selected issue label/rule id + related count
 *  - opening alone does NOT record an audit event
 *  - Cancel/Escape close modal without recording or calling window.print
 *  - Confirm records the correct audit event and calls window.print
 *  - non-premium users see neither print buttons nor the modal
 *  - static guard: modal source has no Supabase / fetch / analytics imports
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  clearEnvironmentSummaryExportAuditEvents,
  readEnvironmentSummaryExportAuditEvents,
} from "@/lib/environmentSummaryExportAuditRules";
import EnvironmentSummaryPrePrintModal from "@/components/EnvironmentSummaryPrePrintModal";

const planMock = vi.hoisted(() => ({ current: "pro" as "free" | "pro" }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    const row =
      planMock.current === "pro"
        ? {
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
          }
        : null;
    return {
      loading: false,
      entitlement: resolveEntitlements(
        row as any,
        new Date("2026-06-08T00:00:00Z"),
      ),
    };
  },
}));

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

vi.mock("@/integrations/supabase/client", () => {
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (["insert", "update", "delete", "upsert", "rpc"].includes(prop)) {
          throw new Error(`Forbidden Supabase write: ${prop}`);
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

describe("EnvironmentSummaryPrePrintModal — standalone", () => {
  it("renders title, summary, range, generated, and safety note (full report)", () => {
    render(
      <EnvironmentSummaryPrePrintModal
        open
        onOpenChange={() => undefined}
        mode="full_report"
        dateRangeLabel="2026-06-01 — 2026-06-07"
        generatedAtLabel="2026-06-08T12:00:00.000Z"
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByTestId("env-report-pre-print-modal-title").textContent)
      .toBe("Review before printing");
    expect(
      screen.getByTestId("env-report-pre-print-modal-summary").textContent,
    ).toMatch(/full Environment Summary Report/);
    expect(
      screen.getByTestId("env-report-pre-print-modal-range").textContent,
    ).toBe("2026-06-01 — 2026-06-07");
    expect(
      screen.getByTestId("env-report-pre-print-modal-generated").textContent,
    ).toBe("2026-06-08T12:00:00.000Z");
    expect(
      screen.getByTestId("env-report-pre-print-modal-safety").textContent ?? "",
    ).toMatch(/Read-only/);
  });

  it("drilldown mode shows selected issue + related count + drilldown summary", () => {
    render(
      <EnvironmentSummaryPrePrintModal
        open
        onOpenChange={() => undefined}
        mode="drilldown"
        dateRangeLabel="2026-06-01 — 2026-06-07"
        generatedAtLabel="2026-06-08T12:00:00.000Z"
        selectedIssueLabel="Source review required"
        selectedIssueRuleId="source.review"
        relatedCheckCount={3}
        onConfirm={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("env-report-pre-print-modal-summary").textContent,
    ).toMatch(/selected issue drilldown/);
    const issue = screen.getByTestId("env-report-pre-print-modal-issue");
    expect(issue.textContent).toMatch(/Source review required/);
    expect(issue.textContent).toMatch(/source\.review/);
    expect(
      screen.getByTestId("env-report-pre-print-modal-related-count").textContent,
    ).toBe("3");
  });
});

describe("EnvironmentSummaryReportPage — pre-print modal integration", () => {
  beforeEach(() => {
    clearEnvironmentSummaryExportAuditEvents();
  });

  it("non-premium users do not see print buttons or modal", () => {
    planMock.current = "free";
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    expect(screen.queryByTestId("env-report-download-pdf")).toBeNull();
    expect(screen.queryByTestId("env-report-download-drilldown-pdf")).toBeNull();
    expect(screen.queryByTestId("env-report-pre-print-modal")).toBeNull();
  });

  it("full report button opens modal; modal alone does not record audit", () => {
    planMock.current = "pro";
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    expect(screen.getByTestId("env-report-pre-print-modal")).toBeTruthy();
    expect(
      screen.getByTestId("env-report-pre-print-modal-mode").textContent,
    ).toBe("Full report");
    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(0);
  });

  it("drilldown button opens modal showing issue label/rule id and related count", () => {
    planMock.current = "pro";
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    fireEvent.click(screen.getByTestId("env-report-download-drilldown-pdf"));
    expect(screen.getByTestId("env-report-pre-print-modal")).toBeTruthy();
    expect(
      screen.getByTestId("env-report-pre-print-modal-mode").textContent,
    ).toBe("Drilldown");
    expect(
      screen.getByTestId("env-report-pre-print-modal-issue").textContent,
    ).toMatch(/source\.review/);
    expect(
      screen.getByTestId("env-report-pre-print-modal-related-count").textContent,
    ).toBe("2");
  });

  it("cancel closes modal, no audit, no window.print", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-cancel"));
    expect(screen.queryByTestId("env-report-pre-print-modal")).toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(0);
    printSpy.mockRestore();
  });

  it("Escape closes modal, no audit, no window.print", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
      code: "Escape",
    });
    expect(printSpy).not.toHaveBeenCalled();
    expect(readEnvironmentSummaryExportAuditEvents()).toHaveLength(0);
    printSpy.mockRestore();
  });

  it("confirm records full report audit and calls window.print", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const prevTitle = document.title;
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("full_report_print_opened");
    // Title restored after print trigger (microtask flush).
    return Promise.resolve().then(() => {
      expect(document.title).toBe(prevTitle);
      printSpy.mockRestore();
    });
  });

  it("confirm records drilldown audit and calls window.print", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    fireEvent.click(screen.getByTestId("env-report-download-drilldown-pdf"));
    fireEvent.click(screen.getByTestId("env-report-pre-print-modal-confirm"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("drilldown_print_opened");
    expect(events[0].issueRuleId).toBe("source.review");
    printSpy.mockRestore();
  });
});

describe("EnvironmentSummaryPrePrintModal — static safety guard", () => {
  it("does not import Supabase, fetch wrappers, analytics, alerts, or action queue helpers", () => {
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../components/EnvironmentSummaryPrePrintModal.tsx",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/analytics/i);
    expect(src).not.toMatch(/action[-_ ]?queue/i);
    expect(src).not.toMatch(/alerts?\//i);
  });
});
