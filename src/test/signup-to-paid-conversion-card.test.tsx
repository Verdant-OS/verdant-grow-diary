import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SignupToPaidConversionCard from "@/components/SignupToPaidConversionCard";
import { parseSignupToPaidSnapshot } from "@/lib/signupToPaidSnapshotRules";

describe("SignupToPaidConversionCard", () => {
  it("shows cohort rates, evidence strength, and paid-total reconciliation", () => {
    const snapshot = parseSignupToPaidSnapshot({
      ok: true,
      counts: {
        accounts_total: 20,
        active_paid_total: 6,
        attributed_accounts_total: 12,
        attributed_active_paid_total: 5,
        unattributed_accounts_total: 8,
        unattributed_active_paid_total: 1,
      },
      sources: {
        grower_invite: { accounts: 6, active_paid: 3 },
        landing_page: { accounts: 6, active_paid: 2 },
        unattributed: { accounts: 8, active_paid: 1 },
      },
    });

    render(<SignupToPaidConversionCard snapshot={snapshot} authoritativeActivePaid={6} />);

    expect(screen.getByText("Signup-to-active-paid cohorts")).toBeInTheDocument();
    expect(screen.getByTestId("paid-reconciliation")).toHaveTextContent("Paid total reconciled");
    const inviteRow = document.querySelector('tr[data-source="grower_invite"]');
    expect(inviteRow).not.toBeNull();
    expect(within(inviteRow as HTMLElement).getByText("50%")).toBeInTheDocument();
    expect(within(inviteRow as HTMLElement).getByText("Usable sample")).toBeInTheDocument();
    expect(screen.getByText(/observed attribution, not proof/i)).toBeInTheDocument();
  });

  it("flags impossible cohort counts and cross-snapshot paid drift", () => {
    const snapshot = parseSignupToPaidSnapshot({
      ok: true,
      counts: { active_paid_total: 7 },
      sources: { pricing_page: { accounts: 2, active_paid: 3 } },
    });

    render(<SignupToPaidConversionCard snapshot={snapshot} authoritativeActivePaid={6} />);
    expect(screen.getByTestId("paid-reconciliation")).toHaveTextContent("Paid total needs audit");
    const pricingRow = document.querySelector('tr[data-source="pricing_page"]');
    expect(within(pricingRow as HTMLElement).getByText("Audit required")).toBeInTheDocument();
    expect(within(pricingRow as HTMLElement).getByText("Mismatch")).toBeInTheDocument();
  });
});
