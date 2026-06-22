/**
 * Operator entitlement resolution audit page — render + safety tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "granted", granted: true, error: null }),
}));

import OperatorBillingEntitlementResolutionAudit from "@/pages/OperatorBillingEntitlementResolutionAudit";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OperatorBillingEntitlementResolutionAudit />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("OperatorBillingEntitlementResolutionAudit render", () => {
  it("renders summary counts and sanitized rows from RPC response", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        reason: null,
        generated_at: "2026-06-22T17:00:00Z",
        limit: 50,
        counts: {
          total: 4,
          active: 2,
          free_fallback: 1,
          expired_fallback: 1,
          blocked: 0,
          unknown: 0,
        },
        latest: [
          {
            plan_id: "pro_monthly",
            subscription_status: "active",
            effective_entitlement_state: "active",
            fallback_reason: null,
            cancel_at_period_end: false,
            current_period_end_present: true,
            updated_at: "2026-06-22T16:55:00Z",
          },
        ],
      },
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pro Monthly")).toBeInTheDocument();
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "billing_entitlement_resolution_operator_audit",
      { p_limit: 50 },
    );
    expect(screen.getByText("100 / month")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Billing Entitlement Resolution")).toBeInTheDocument();
  });

  it("renders empty state when no rows are returned", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        reason: null,
        generated_at: null,
        limit: 50,
        counts: {
          total: 0,
          active: 0,
          free_fallback: 0,
          expired_fallback: 0,
          blocked: 0,
          unknown: 0,
        },
        latest: [],
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText("No entitlement resolution rows found."),
    ).toBeInTheDocument();
  });

  it("renders error state when RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Entitlement resolution audit unavailable."),
      ).toBeInTheDocument();
    });
  });
});
