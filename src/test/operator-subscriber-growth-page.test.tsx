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
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "paid_return_operator_snapshot") {
        return Promise.resolve({
          data: {
            ok: true,
            generated_at: "2026-07-14T05:00:00Z",
            counts: {
              tracked_paid_activations: 12,
              in_flight_paid_activations: 4,
              matured_paid_activations_60d: 8,
              manual_grow_returned_60d: 5,
              server_completed_ai_doctor_returned_60d: 1,
              paid_returned_60d: 5,
            },
          },
          error: null,
        });
      }
      if (fn === "signup_to_paid_operator_snapshot") {
        return Promise.resolve({
          data: {
            ok: true,
            generated_at: "2026-07-14T05:00:00Z",
            counts: {
              accounts_total: 24,
              active_paid_total: 10,
              attributed_accounts_total: 16,
              attributed_active_paid_total: 8,
              unattributed_accounts_total: 8,
              unattributed_active_paid_total: 2,
            },
            sources: {
              landing_page: { accounts: 6, active_paid: 3 },
              grower_invite: { accounts: 6, active_paid: 5 },
              csv_history: { accounts: 4, active_paid: 0 },
              unattributed: { accounts: 8, active_paid: 2 },
            },
          },
          error: null,
        });
      }
      if (fn === "signup_acquisition_operator_snapshot") {
        return Promise.resolve({
          data: {
            ok: true,
            generated_at: "2026-07-14T05:00:00Z",
            counts: {
              accounts_total: 24,
              accounts_7d: 12,
              attributed_total: 16,
              attributed_7d: 11,
              unattributed_total: 8,
              landing_page: 3,
              pricing_page: 2,
              founder_page: 1,
              founder_share: 2,
              pricing_interest_share: 1,
              grower_invite: 2,
              context_check: 1,
              vpd_calculator: 3,
              csv_history: 4,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({
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
            pricing_interest_pricing_page: 3,
            pricing_interest_founder_page: 5,
            pricing_interest_founder_share: 3,
            pricing_interest_referral: 4,
            pricing_interest_grower_invite: 6,
            pricing_interest_operator_outreach: 2,
            pricing_interest_context_check: 8,
            pricing_interest_vpd_calculator: 9,
            all_leads_7d: 9,
          },
        },
        error: null,
      });
    });

    renderPage();

    expect(await screen.findByText("91")).toBeInTheDocument();
    expect(screen.getByText("Subscriber Growth")).toBeInTheDocument();
    expect(screen.getByText("Authoritative active paid entitlements only")).toBeInTheDocument();
    expect(screen.getByText("Authoritative paid entitlement mix")).toBeInTheDocument();
    expect(screen.queryByText(/verified paid/i)).not.toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("subscriber_growth_operator_snapshot");
    expect(rpcMock).toHaveBeenCalledWith("signup_acquisition_operator_snapshot");
    expect(rpcMock).toHaveBeenCalledWith("signup_to_paid_operator_snapshot");
    expect(rpcMock).toHaveBeenCalledWith("paid_return_operator_snapshot");
    expect(screen.getByText("49")).toBeInTheDocument();
    expect(screen.getByText("1.9/day")).toBeInTheDocument();
    expect(screen.getByTestId("subscriber-growth-sprint-board")).toBeInTheDocument();
    expect(screen.getByTestId("subscriber-growth-sprint-status")).toHaveAttribute(
      "data-status",
      "behind_pace",
    );
    expect(screen.getByText("Paid needed — next 7d")).toBeInTheDocument();
    expect(screen.getByText("Interest signals — not subscribers")).toBeInTheDocument();
    expect(screen.getByText("Account starts — not subscribers")).toBeInTheDocument();
    expect(screen.getByText("Accounts — all time")).toBeInTheDocument();
    expect(screen.getByText("Pricing signup")).toBeInTheDocument();
    expect(screen.getAllByText("Source unavailable").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Founder shares").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Paid-interest shares").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Grower invites").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Operator outreach").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Context check")).toBeInTheDocument();
    expect(screen.getAllByText("VPD calculator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("VPD calculator signup")).toBeInTheDocument();
    expect(screen.getByText("CSV history signup")).toBeInTheDocument();
    expect(screen.getByText("CSV history")).toBeInTheDocument();
    expect(screen.getByText("Signup-to-active-paid cohorts")).toBeInTheDocument();
    expect(screen.getByTestId("paid-reconciliation")).toHaveTextContent("Paid total reconciled");
    expect(screen.getByTestId("paid-return-cohort-card")).toHaveAttribute(
      "data-status",
      "return_observed",
    );
    expect(screen.getByText("60-day paid return — forward cohort")).toBeInTheDocument();
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
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Subscriber growth snapshot unavailable.")).toBeInTheDocument();
    });
    expect(screen.getByText(/No billing or lead data was changed/)).toBeInTheDocument();
  });

  it("keeps paid progress visible when account attribution fails closed", async () => {
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "signup_acquisition_operator_snapshot"
          ? { data: { ok: false, reason: "operator_required" }, error: null }
          : { data: { ok: true, counts: { active_paid: 0 } }, error: null },
      ),
    );

    renderPage();

    expect(await screen.findByTestId("signup-acquisition-denied")).toHaveTextContent(
      "Operator role is required to view account acquisition.",
    );
    expect(screen.getByText("Active paid subscribers")).toBeInTheDocument();
    expect(screen.queryByTestId("signup-acquisition-snapshot")).not.toBeInTheDocument();
  });

  it("keeps paid progress visible when the conversion cohort RPC is unavailable", async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "signup_to_paid_operator_snapshot") {
        return Promise.resolve({ data: null, error: { message: "migration unavailable" } });
      }
      if (fn === "signup_acquisition_operator_snapshot") {
        return Promise.resolve({ data: { ok: true, counts: {} }, error: null });
      }
      return Promise.resolve({
        data: { ok: true, counts: { active_paid: 3 } },
        error: null,
      });
    });

    renderPage();

    expect(await screen.findByTestId("signup-to-paid-error")).toHaveTextContent(
      "Signup-to-paid conversion unavailable.",
    );
    expect(screen.getByText("Active paid subscribers")).toBeInTheDocument();
    expect(screen.queryByTestId("signup-to-paid-conversion-card")).not.toBeInTheDocument();
  });

  it("keeps paid progress visible when the paid-return cohort RPC is unavailable", async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "paid_return_operator_snapshot") {
        return Promise.resolve({ data: null, error: { message: "migration unavailable" } });
      }
      if (fn === "signup_acquisition_operator_snapshot") {
        return Promise.resolve({ data: { ok: true, counts: {} }, error: null });
      }
      if (fn === "signup_to_paid_operator_snapshot") {
        return Promise.resolve({ data: { ok: true, counts: {}, sources: {} }, error: null });
      }
      return Promise.resolve({
        data: { ok: true, counts: { active_paid: 3 } },
        error: null,
      });
    });

    renderPage();

    expect(await screen.findByTestId("paid-return-cohort-error")).toHaveTextContent(
      "Paid-return cohort unavailable.",
    );
    expect(screen.getByText("Active paid subscribers")).toBeInTheDocument();
    expect(screen.queryByTestId("paid-return-cohort-card")).not.toBeInTheDocument();
  });
});
