import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "granted", granted: true, error: null }),
}));

import OperatorSubscriberGrowth from "@/pages/OperatorSubscriberGrowth";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OperatorSubscriberGrowth />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  vi.restoreAllMocks();
});

describe("OperatorSubscriberGrowth", () => {
  it("renders authoritative paid progress and labels interest separately", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-07-14T05:00:00.000Z"));
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        generated_at: "2026-07-14T05:00:00Z",
        counts: {
          active_paid: 10,
          pro_monthly: 4,
          pro_annual: 3,
          founder_lifetime: 3,
          at_risk: 1,
          scheduled_cancellation: 2,
          new_active_7d: 4,
          new_active_30d: 10,
          pricing_interest_total: 18,
          pricing_interest_7d: 7,
          pricing_interest_needs_contact: 6,
          pricing_interest_follow_up_due: 2,
          pricing_interest_contacted_7d: 5,
          pricing_interest_direct: 2,
          pricing_interest_landing: 4,
          pricing_interest_founder_page: 5,
          pricing_interest_founder_share: 3,
          pricing_interest_referral: 4,
          all_leads_7d: 9,
        },
      },
      error: null,
    });

    renderPage();

    expect(await screen.findByText("91")).toBeInTheDocument();
    expect(screen.getByText("Subscriber Growth")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("subscriber_growth_operator_snapshot");
    expect(screen.getByText("49")).toBeInTheDocument();
    expect(screen.getByText("1.9/day")).toBeInTheDocument();
    expect(screen.getByText("Interest signals — not subscribers")).toBeInTheDocument();
    expect(screen.getByText("Founder shares")).toBeInTheDocument();
    expect(screen.getByText("Paid-interest shares")).toBeInTheDocument();
    expect(screen.getByText("Needs first contact")).toBeInTheDocument();
    expect(screen.getByText("Follow-up due")).toBeInTheDocument();
    expect(screen.getByText("Contacted — 7 days")).toBeInTheDocument();
    expect(screen.getByText(/Unique normalized email addresses only/)).toBeInTheDocument();
    expect(screen.getByText("Review interest leads").closest("a")).toHaveAttribute(
      "href",
      "/admin/leads",
    );
  });

  it("shows a calm read-only error when the RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Subscriber growth snapshot unavailable.")).toBeInTheDocument();
    });
    expect(screen.getByText(/No billing or lead data was changed/)).toBeInTheDocument();
  });
});
