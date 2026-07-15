/**
 * CheckoutSuccess — checkout-status failure detector wiring.
 *
 * Confirms that when the entitlement resolver keeps returning free/inactive
 * BUT the read-only `checkout-status` edge function reports the webhook
 * landed and failed, the page swaps into the "payment received but
 * activation needs support" state (with a distinct heading, support link,
 * and data-webhook-failed="true").
 *
 * The entitlement poll remains the primary success signal; this test only
 * covers the fallback failure surface added in this slice.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import type { ResolvedEntitlement } from "@/lib/entitlements";

const freeEnt: ResolvedEntitlement = {
  effectivePlanId: "free",
  displayPlanId: "free",
  status: "active",
  isActive: true,
  capabilities: {} as unknown as ResolvedEntitlement["capabilities"],
  degraded: false,
  degradedReason: "null_row_free",
  isStaff: false,
  source: "free",
};

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: freeEnt,
    refetch: async () => undefined,
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import CheckoutSuccess from "@/pages/CheckoutSuccess";

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckoutSuccess />
    </MemoryRouter>,
  );
}

afterEach(() => {
  invokeMock.mockReset();
});

describe("CheckoutSuccess — checkout-status failure detection", () => {
  it("renders the failed state when checkout-status reports hasFailed=true", async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        hasFailed: true,
        eventType: "transaction.completed",
        receivedAt: "2026-07-15T18:00:00Z",
      },
      error: null,
    });

    renderPage();

    await waitFor(
      () => {
        expect(screen.getByTestId("checkout-success-page")).toHaveAttribute(
          "data-webhook-failed",
          "true",
        );
      },
      { timeout: 4000 },
    );
    expect(
      screen.getByTestId("checkout-success-failed-heading"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("checkout-success-support-link"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-success-refresh-button")).toBeNull();
  });

  it("stays in the pending state when checkout-status reports no failure", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, hasFailed: false, latestStatus: "received" },
      error: null,
    });

    renderPage();
    // Give the first poll tick time to fire.
    await new Promise((r) => setTimeout(r, 2000));
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute(
      "data-webhook-failed",
      "false",
    );
    expect(
      screen.getByTestId("checkout-success-pending-heading"),
    ).toBeInTheDocument();
  });

  it("does not crash when checkout-status invocation errors (best-effort)", async () => {
    invokeMock.mockRejectedValue(new Error("network"));

    renderPage();
    await new Promise((r) => setTimeout(r, 2000));
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute(
      "data-webhook-failed",
      "false",
    );
  });
});
