/**
 * environment-summary-report-logged-at-filter.test.tsx
 *
 * PR #442 remediation: EnvironmentSummaryReportPage must filter/group by
 * the grower's "Captured" moment (logged_at column, falling back through
 * details.logged_at → entry_at → occurred_at via
 * resolveDiaryEntryObservationTime), not by raw entry_at alone.
 *
 * These rows are deliberately constructed so entry_at and logged_at
 * disagree about whether the row falls inside the selected date range —
 * a case where the pre-remediation code (which read entry.entry_at
 * directly) and the fixed code diverge. A suite that only ever sets
 * entry_at (see environment-summary-print-action.test.tsx) cannot catch
 * this; these tests exist specifically to close that gap.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resolveEntitlements } from "@/lib/entitlements";

vi.mock("@/hooks/useEnvironmentSummaryReportServerGate", () => ({
  useEnvironmentSummaryReportServerGate: () => ({
    status: "allowed",
    reason: null,
    displayPlanId: "pro_monthly",
  }),
}));

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

const diaryRows = vi.hoisted(() => ({ current: [] as any[] }));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: diaryRows.current, isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "from") {
          return () =>
            new Proxy(
              {},
              {
                get(_t2, p2: string) {
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

const validSnapshot = {
  source: "manual",
  tempC: 24,
  rhPercent: 60,
  vpdBand: { minKpa: 0.8, maxKpa: 1.5 },
};

const RANGE = "/diary/environment-summary?start=2026-06-01&end=2026-06-07";

describe("EnvironmentSummaryReportPage — logged_at (Captured) consultation", () => {
  it("includes a row whose entry_at is OUTSIDE the range but logged_at is INSIDE it", () => {
    diaryRows.current = [
      {
        id: "e-backdated-outside-entry-at",
        // entry_at is well before the 2026-06-01..06-07 window.
        entry_at: "2026-05-01T12:00:00.000Z",
        // Captured (logged_at) falls inside the window.
        logged_at: "2026-06-03T12:00:00.000Z",
        kind: "environment",
        snapshot: validSnapshot,
      },
    ];
    renderAt(RANGE);
    // If the fix works, this row is counted and the report renders instead
    // of the "No Environment Check entries" empty state.
    expect(screen.queryByText(/No Environment Check entries/i)).toBeNull();
    expect(screen.getByTestId("env-report-full-section")).toBeTruthy();
  });

  it("excludes a row whose logged_at is OUTSIDE the range even though entry_at is INSIDE it", () => {
    diaryRows.current = [
      {
        id: "e-entry-at-inside-logged-at-outside",
        // entry_at falls inside the window...
        entry_at: "2026-06-03T12:00:00.000Z",
        // ...but the grower's Captured moment is outside it.
        logged_at: "2026-05-01T12:00:00.000Z",
        kind: "environment",
        snapshot: validSnapshot,
      },
    ];
    renderAt(RANGE);
    // The row must NOT be counted: empty state renders.
    expect(screen.getByText(/No Environment Check entries/i)).toBeTruthy();
  });

  it("falls back to details.logged_at when the real column is absent (pre-migration rows)", () => {
    diaryRows.current = [
      {
        id: "e-details-logged-at",
        entry_at: "2026-05-01T12:00:00.000Z",
        logged_at: null,
        details: { logged_at: "2026-06-05T12:00:00.000Z" },
        kind: "environment",
        snapshot: validSnapshot,
      },
    ];
    renderAt(RANGE);
    expect(screen.queryByText(/No Environment Check entries/i)).toBeNull();
    expect(screen.getByTestId("env-report-full-section")).toBeTruthy();
  });

  it("falls back to entry_at when neither logged_at column nor details.logged_at are present", () => {
    diaryRows.current = [
      {
        id: "e-legacy-entry-at-only",
        entry_at: "2026-06-04T12:00:00.000Z",
        kind: "environment",
        snapshot: validSnapshot,
      },
    ];
    renderAt(RANGE);
    expect(screen.queryByText(/No Environment Check entries/i)).toBeNull();
    expect(screen.getByTestId("env-report-full-section")).toBeTruthy();
  });
});
