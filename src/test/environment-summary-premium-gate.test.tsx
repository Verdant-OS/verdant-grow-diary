/**
 * environment-summary-premium-gate.test.tsx
 *
 * Verifies:
 *  - Free users see upgrade prompt, not detailed report data.
 *  - Premium users see the report.
 *  - Upgrade prompt uses the existing PaywallCta pattern and CTA href.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resolveEntitlements } from "@/lib/entitlements";

const entitlementMock = vi.hoisted(() => ({ current: "free" as "free" | "pro" }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    const row =
      entitlementMock.current === "pro"
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

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  // Minimal supabase mock — only `functions.invoke` is allowed (the server-
  // authoritative gate). Any other property access throws to keep the test
  // honest about what surfaces are touched.
  const supabase: any = new Proxy(
    {
      functions: {
        invoke: async () => {
          if (entitlementMock.current === "pro") {
            return {
              data: {
                ok: true,
                feature: "environment_summary_report",
                display_plan_id: "pro_monthly",
                effective_plan_id: "pro_monthly",
                capabilities: { advancedExports: true },
              },
              error: null,
            };
          }
          return {
            data: {
              ok: false,
              reason: "upgrade_required",
              feature: "environment_summary_report",
              display_plan_id: "free",
              effective_plan_id: "free",
            },
            error: { context: { status: 403 } } as any,
          };
        },
      },
    },
    {
      get(target: any, prop) {
        if (prop in target) return target[prop];
        throw new Error(
          `Supabase access not allowed in premium gate test: ${String(prop)}`,
        );
      },
    },
  );
  return { supabase };
});

import EnvironmentSummaryReportPage from "@/pages/EnvironmentSummaryReportPage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/diary/environment-summary"]}>
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

describe("EnvironmentSummaryReportPage — premium gate", () => {
  it("non-premium user sees upgrade prompt, not detailed report", () => {
    entitlementMock.current = "free";
    renderPage();
    expect(screen.getByTestId("environment-summary-report-page-locked")).toBeTruthy();
    expect(screen.getByTestId("env-report-paywall")).toBeTruthy();
    // Detailed report controls/section MUST NOT be present.
    expect(screen.queryByTestId("environment-summary-report-page")).toBeNull();
    expect(screen.queryByTestId("env-report-range-controls")).toBeNull();
    expect(screen.queryByTestId("env-report-print-section")).toBeNull();
    expect(screen.queryByTestId("env-report-download-pdf")).toBeNull();
  });

  it("upgrade prompt uses existing PaywallCta link to /pricing", () => {
    entitlementMock.current = "free";
    renderPage();
    const link = screen.getByTestId("env-report-paywall-link") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("premium user sees the report and Download PDF button once server gate allows", async () => {
    entitlementMock.current = "pro";
    renderPage();
    expect(
      await screen.findByTestId("environment-summary-report-page"),
    ).toBeTruthy();
    expect(screen.getByTestId("env-report-range-controls")).toBeTruthy();
    expect(screen.getByTestId("env-report-print-section")).toBeTruthy();
    expect(screen.getByTestId("env-report-download-pdf")).toBeTruthy();
    expect(screen.queryByTestId("env-report-paywall")).toBeNull();
  });
});
