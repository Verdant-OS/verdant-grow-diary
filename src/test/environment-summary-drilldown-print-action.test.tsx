/**
 * environment-summary-drilldown-print-action.test.tsx
 *
 * Verifies the drilldown-only print button:
 *  - hidden without an active issue drilldown
 *  - hidden for non-premium users
 *  - shown for premium users with active issue
 *  - click records `drilldown_print_opened` audit (local only)
 *  - click calls window.print()
 *  - drilldown print mode hides unrelated full-report sections (via data attr)
 *  - no Supabase writes, no alerts, no Action Queue, no network
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
  clearEnvironmentSummaryExportAuditEvents,
  readEnvironmentSummaryExportAuditEvents,
} from "@/lib/environmentSummaryExportAuditRules";

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
      entitlement: resolveEntitlements(row as any, new Date("2026-06-08T00:00:00Z")),
    };
  },
}));

// Two stale entries → produces "source.review" top issue (warning).
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
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        supabaseCalls.count += 1;
        if (
          ["insert", "update", "delete", "upsert", "rpc"].includes(prop)
        ) {
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

describe("EnvironmentSummaryReportPage — drilldown print action", () => {
  beforeEach(() => {
    supabaseCalls.count = 0;
    clearEnvironmentSummaryExportAuditEvents();
  });

  it("drilldown print button is hidden without an active issue", () => {
    planMock.current = "pro";
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    expect(screen.queryByTestId("env-report-download-drilldown-pdf")).toBeNull();
  });

  it("drilldown print button is hidden for non-premium users", () => {
    planMock.current = "free";
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    expect(screen.queryByTestId("env-report-download-drilldown-pdf")).toBeNull();
    expect(screen.queryByTestId("env-report-download-pdf")).toBeNull();
  });

  it("drilldown print button appears for premium with active issue and has a deterministic filename", () => {
    planMock.current = "pro";
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    const btn = screen.getByTestId("env-report-download-drilldown-pdf");
    expect(btn.getAttribute("aria-label")).toBe(
      "Download current environment issue drilldown PDF",
    );
    expect(btn.getAttribute("data-filename")).toBe(
      "verdant-environment-drilldown-2026-06-01-to-2026-06-07-source.review.pdf",
    );
  });

  it("clicking drilldown print records audit, calls window.print, no Supabase writes", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockImplementation((() => {
        throw new Error("fetch not allowed");
      }) as any);
    renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    const before = supabaseCalls.count;
    fireEvent.click(screen.getByTestId("env-report-download-drilldown-pdf"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(supabaseCalls.count).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    const events = readEnvironmentSummaryExportAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("drilldown_print_opened");
    expect(events[0].reportMode).toBe("drilldown");
    expect(events[0].issueRuleId).toBe("source.review");
    expect(events[0].source).toBe("local_only");
    // Audit landed in localStorage only.
    expect(
      typeof window.localStorage.getItem(
        ENVIRONMENT_SUMMARY_EXPORT_AUDIT_STORAGE_KEY,
      ),
    ).toBe("string");
    printSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("drilldown print mode toggles data-print-mode='drilldown' on the print section", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    const { container } = renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=source.review",
    );
    fireEvent.click(screen.getByTestId("env-report-download-drilldown-pdf"));
    const section = container.querySelector(
      '[data-print-section="environment-summary-report"]',
    ) as HTMLElement;
    expect(section.getAttribute("data-print-mode")).toBe("drilldown");
    // The element used by the print stylesheet to hide unrelated full-report content exists.
    expect(
      container.querySelector("[data-print-full-report-only]"),
    ).toBeTruthy();
    printSpy.mockRestore();
  });
});
