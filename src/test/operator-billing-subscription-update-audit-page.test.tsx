/**
 * Operator subscription updater audit page — render + safety tests.
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

import OperatorBillingSubscriptionUpdateAudit from "@/pages/OperatorBillingSubscriptionUpdateAudit";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OperatorBillingSubscriptionUpdateAudit />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("OperatorBillingSubscriptionUpdateAudit render", () => {
  it("renders summary counts and sanitized rows from RPC response", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        reason: null,
        generated_at: "2026-06-22T17:00:00Z",
        limit: 50,
        counts: { created: 2, updated: 3, noop: 1, blocked: 0, failed: 0, skipped: 1, total: 7 },
        latest: [
          {
            created_at: "2026-06-22T16:55:00Z",
            result_status: "created",
            result_reason: "new_subscription",
            candidate_plan_id: "pro_monthly",
            candidate_status: "active",
            subscription_status: "active",
          },
        ],
      },
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Created")).toBeInTheDocument();
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "billing_subscription_update_operator_audit",
      { p_limit: 50 },
    );
    expect(screen.getByText("Pro Monthly")).toBeInTheDocument();
    expect(screen.getByText("new_subscription")).toBeInTheDocument();
    // total is 7
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders empty state when no rows are returned", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        reason: null,
        generated_at: null,
        limit: 50,
        counts: { created: 0, updated: 0, noop: 0, blocked: 0, failed: 0, skipped: 0, total: 0 },
        latest: [],
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText("No subscription updater audit rows found for this window."),
    ).toBeInTheDocument();
  });

  it("renders error state when RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Subscription updater audit unavailable."),
      ).toBeInTheDocument();
    });
  });
});
