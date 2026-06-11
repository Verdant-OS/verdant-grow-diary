/**
 * environment-summary-print-action.test.tsx
 *
 * Verifies:
 *  - Premium user sees Download PDF.
 *  - Non-premium user does not see Download PDF.
 *  - Clicking Download PDF calls window.print().
 *  - It does not call Supabase / create alerts / create Action Queue items.
 *  - Safety footer + DST-ambiguous / invalid labels remain visible in printable section.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resolveEntitlements } from "@/lib/entitlements";

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

const dstSnapshot = {
  source: "live",
  tempC: 24,
  rhPercent: 60,
  ppfdSamples: [
    { ts: "2026-03-08T09:00:00Z", ppfd: 200, source: "live" },
    { ts: "2026-03-09T00:00:00Z", ppfd: 200, source: "live" },
  ],
  tzIana: "America/Los_Angeles",
};

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [
      {
        id: "e-invalid",
        entry_at: "2026-06-02T12:00:00.000Z",
        kind: "environment",
        snapshot: { source: "bogus", tempC: 24, rhPercent: 60 },
      },
      {
        id: "e-dst",
        entry_at: "2026-06-03T12:00:00.000Z",
        kind: "environment",
        snapshot: dstSnapshot,
      },
      {
        id: "e-ok",
        entry_at: "2026-06-04T12:00:00.000Z",
        kind: "environment",
        snapshot: {
          source: "live",
          tempC: 24,
          rhPercent: 60,
          vpdBand: { minKpa: 0.8, maxKpa: 1.5 },
        },
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
        if (prop === "from") {
          return () =>
            new Proxy(
              {},
              {
                get(_t2, p2: string) {
                  supabaseCalls.count += 1;
                  if (
                    ["insert", "update", "delete", "upsert", "rpc"].includes(p2)
                  ) {
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

describe("EnvironmentSummaryReportPage — print/download action", () => {
  beforeEach(() => {
    supabaseCalls.count = 0;
  });

  it("non-premium user does not see Download PDF", () => {
    planMock.current = "free";
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    expect(screen.queryByTestId("env-report-download-pdf")).toBeNull();
  });

  it("premium user sees Download PDF with deterministic filename + accessible label", () => {
    planMock.current = "pro";
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const btn = screen.getByTestId("env-report-download-pdf");
    expect(btn.getAttribute("aria-label")).toBe(
      "Download environment summary report PDF",
    );
    expect(btn.getAttribute("data-filename")).toBe(
      "verdant-environment-summary-2026-06-01-to-2026-06-07.pdf",
    );
  });

  it("clicking Download PDF calls window.print and does not write to Supabase", () => {
    planMock.current = "pro";
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);
    renderAt("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
    const before = supabaseCalls.count;
    fireEvent.click(screen.getByTestId("env-report-download-pdf"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    // No Supabase access triggered by the click.
    expect(supabaseCalls.count).toBe(before);
    printSpy.mockRestore();
  });

  it("printable section includes safety footer, DST-ambiguous and invalid labels", () => {
    planMock.current = "pro";
    const { container } = renderAt(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07",
    );
    const section = container.querySelector(
      '[data-print-section="environment-summary-report"]',
    ) as HTMLElement;
    expect(section).toBeTruthy();
    const txt = (section.textContent ?? "").toLowerCase();
    expect(txt).toContain("read-only report");
    expect(txt).toContain("no device control");
    expect(txt).toMatch(/invalid/);
    expect(txt).toMatch(/dst|ambiguous/);
    // Safety footer testid is inside the print section.
    expect(within(section).getByTestId("env-report-safety-footer")).toBeTruthy();
  });
});
