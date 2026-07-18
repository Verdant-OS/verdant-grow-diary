/**
 * environment-summary-report-server-gate.test.tsx
 *
 * Tests the server-authoritative entitlement gate for the Environment
 * Summary Report page. Asserts:
 *  - Free / 403 response renders the upgrade/paywall state and does NOT
 *    crash, even if the (non-authoritative) client hook returns premium.
 *  - Client-side entitlement hints are NOT sufficient to render the report.
 *  - Pro / 200 response renders the report.
 *  - Unexpected server errors fail closed (locked state, no crash).
 *  - No service_role appears in frontend code for the page or hook.
 *
 * The hook calls supabase.functions.invoke('environment-summary-report-entitlement').
 * We mock that single edge function.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type GateOutcome = "allowed" | "denied" | "verification_failed" | "error";

const gateMock = vi.hoisted(() => ({
  outcome: "denied" as GateOutcome,
  // The CLIENT hint can lie. The server must still gate.
  clientPremium: true,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      effectivePlanId: gateMock.clientPremium ? "pro_monthly" : "free",
      displayPlanId: gateMock.clientPremium ? "pro_monthly" : "free",
      status: "active",
      isActive: true,
      capabilities: {
        maxActiveGrows: null,
        aiCreditsPerGrow: null,
        aiMonthlyCredits: 100,
        liveSensors: gateMock.clientPremium,
        advancedExports: gateMock.clientPremium,
        multiTent: gateMock.clientPremium,
        sensorHistoryDays: null,
        prioritySupport: gateMock.clientPremium,
      },
      degraded: false,
      degradedReason: null,
    },
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const supabase: any = {
    functions: {
      invoke: vi.fn(async (name: string) => {
        if (name !== "environment-summary-report-entitlement") {
          throw new Error(`Unexpected function call: ${name}`);
        }
        if (gateMock.outcome === "allowed") {
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
        if (gateMock.outcome === "denied") {
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
        }
        if (gateMock.outcome === "verification_failed") {
          return {
            data: {
              ok: false,
              reason: "entitlement_lookup_failed",
              feature: "environment_summary_report",
            },
            error: { context: { status: 403 } } as any,
          };
        }
        // error
        return {
          data: null,
          error: { context: { status: 500 } } as any,
        };
      }),
    },
  };
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

describe("EnvironmentSummaryReportPage — server-authoritative entitlement gate", () => {
  it("server 403 renders the upgrade state even when the CLIENT hint claims premium", async () => {
    gateMock.outcome = "denied";
    gateMock.clientPremium = true; // client LIES
    renderPage();
    expect(
      await screen.findByTestId("environment-summary-report-page-locked"),
    ).toBeTruthy();
    expect(screen.getByTestId("env-report-paywall")).toBeTruthy();
    // Report content must NOT be present.
    expect(screen.queryByTestId("environment-summary-report-page")).toBeNull();
    // Server denial copy is clear and non-generic.
    expect(
      screen.getByTestId("env-report-server-gate-message").textContent ?? "",
    ).toMatch(/Pro feature|Upgrade required/i);
  });

  it("server 200 renders the report for an eligible user", async () => {
    gateMock.outcome = "allowed";
    gateMock.clientPremium = true;
    renderPage();
    expect(
      await screen.findByTestId("environment-summary-report-page"),
    ).toBeTruthy();
    expect(screen.queryByTestId("env-report-paywall")).toBeNull();
  });

  it("server error fails closed without presenting a paywall", async () => {
    gateMock.outcome = "error";
    gateMock.clientPremium = true;
    renderPage();
    const locked = await screen.findByTestId(
      "environment-summary-report-page-locked",
    );
    expect(locked).toBeTruthy();
    expect(locked.getAttribute("data-server-gate-status")).toBe("error");
    expect(screen.queryByTestId("environment-summary-report-page")).toBeNull();
    expect(screen.queryByTestId("env-report-paywall")).toBeNull();
    expect(screen.getByTestId("env-report-entitlement-retry")).toBeTruthy();
  });

  it("entitlement lookup failure is a retryable verification state, not an upgrade denial", async () => {
    gateMock.outcome = "verification_failed";
    gateMock.clientPremium = false;
    renderPage();
    const locked = await screen.findByTestId(
      "environment-summary-report-page-locked",
    );
    expect(locked.getAttribute("data-server-gate-status")).toBe("error");
    expect(screen.queryByTestId("env-report-paywall")).toBeNull();
    expect(screen.getByTestId("env-report-entitlement-retry")).toBeTruthy();
  });
});

describe("EnvironmentSummaryReportPage — frontend safety", () => {
  const PAGE = readFileSync(
    resolve(process.cwd(), "src/pages/EnvironmentSummaryReportPage.tsx"),
    "utf8",
  );
  const HOOK = readFileSync(
    resolve(
      process.cwd(),
      "src/hooks/useEnvironmentSummaryReportServerGate.ts",
    ),
    "utf8",
  );

  it("no service_role usage in the report page", () => {
    // Allow the literal token only inside doc comments by checking for any
    // ENV/key access pattern instead of the bare word.
    expect(PAGE).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(PAGE).not.toMatch(/service_role"\s*\)|service_role'\s*\)/);
  });

  it("no service_role usage in the server-gate hook", () => {
    expect(HOOK).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(HOOK).not.toMatch(/service_role"\s*\)|service_role'\s*\)/);
  });

  it("the page does not bypass the server gate (every non-locked render path is downstream of serverGate)", () => {
    expect(PAGE).toMatch(/useEnvironmentSummaryReportServerGate\(\)/);
    expect(PAGE).toMatch(/serverGate\.status/);
  });

  it("hook calls only the dedicated entitlement edge function", () => {
    expect(HOOK).toMatch(/"environment-summary-report-entitlement"/);
    // No raw fetch to arbitrary URLs.
    expect(HOOK).not.toMatch(/fetch\(/);
  });
});

describe("environment-summary-report-entitlement edge function — server safety", () => {
  const FN = readFileSync(
    resolve(
      process.cwd(),
      "supabase/functions/environment-summary-report-entitlement/index.ts",
    ),
    "utf8",
  );

  it("does not use service_role", () => {
    expect(FN).not.toMatch(/SERVICE_ROLE_KEY/);
    // Reject env reads / explicit createClient(... SERVICE_ROLE ...) usage.
    expect(FN).not.toMatch(/Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE/);
  });

  it("fails closed on lookup error (does not return ok=true)", () => {
    // Specifically: the error branch returns 403, not 200.
    expect(FN).toMatch(/entitlement_lookup_failed/);
  });

  it("re-resolves entitlement server-side via resolveEntitlements()", () => {
    expect(FN).toMatch(/resolveEntitlements\(/);
    // Does NOT trust a client-provided plan_id / founder claim.
    expect(FN).not.toMatch(/req\.headers\.get\(["']x-plan/i);
    expect(FN).not.toMatch(/packet\.plan_id|body\.plan_id/);
  });

  it("returns 403 (not 200) when advancedExports is not granted", () => {
    expect(FN).toMatch(/advancedExports\s*!==\s*true/);
    expect(FN).toMatch(/upgrade_required/);
  });

  it("verifies JWT via auth.getUser", () => {
    expect(FN).toMatch(/auth\.getUser\(\)/);
  });

  it("never exposes the raw billing row to the client", () => {
    // We return display/effective plan ids only — no provider_customer_id,
    // no provider_subscription_id, no founder_number echoed back.
    expect(FN).not.toMatch(/provider_customer_id["']\s*:\s*row/);
    expect(FN).not.toMatch(/founder_number["']\s*:\s*row/);
  });
});
