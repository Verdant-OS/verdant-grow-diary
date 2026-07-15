import { describe, expect, it } from "vitest";

import {
  buildSignupToPaidFunnelViewModel,
  parseSignupToPaidSnapshot,
} from "@/lib/signupToPaidSnapshotRules";

describe("signup-to-paid snapshot rules", () => {
  it("parses only fixed aggregate source cohorts and drops identifiers", () => {
    const parsed = parseSignupToPaidSnapshot({
      ok: true,
      generated_at: "2026-07-15T01:00:00Z",
      counts: {
        accounts_total: 20,
        active_paid_total: 6,
        attributed_accounts_total: 12,
        attributed_active_paid_total: 5,
        unattributed_accounts_total: 8,
        unattributed_active_paid_total: 1,
        email: "must-not-survive@example.com",
      },
      sources: {
        grower_invite: { accounts: 6, active_paid: 3, user_id: "must-not-survive" },
        landing_page: { accounts: 6, active_paid: 2 },
        attacker_source: { accounts: 999, active_paid: 999 },
        unattributed: { accounts: 8, active_paid: 1 },
      },
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.counts).toEqual({
      accountsTotal: 20,
      activePaidTotal: 6,
      attributedAccountsTotal: 12,
      attributedActivePaidTotal: 5,
      unattributedAccountsTotal: 8,
      unattributedActivePaidTotal: 1,
    });
    expect(parsed.sources.grower_invite).toEqual({ accounts: 6, activePaid: 3 });
    expect(parsed.sources.pricing_page).toEqual({ accounts: 0, activePaid: 0 });
    expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
    expect(JSON.stringify(parsed)).not.toContain("attacker_source");
  });

  it("fails closed for malformed and invalid counts", () => {
    expect(parseSignupToPaidSnapshot(null).ok).toBe(false);
    const parsed = parseSignupToPaidSnapshot({
      ok: true,
      counts: { accounts_total: -1, active_paid_total: "4" },
      sources: {
        founder_page: { accounts: Number.POSITIVE_INFINITY, active_paid: 2.9 },
      },
    });

    expect(parsed.counts.accountsTotal).toBe(0);
    expect(parsed.counts.activePaidTotal).toBe(0);
    expect(parsed.sources.founder_page).toEqual({ accounts: 0, activePaid: 2 });
  });

  it("ranks only usable, internally consistent attributed cohorts with stable tie-breakers", () => {
    const snapshot = parseSignupToPaidSnapshot({
      ok: true,
      counts: { attributed_accounts_total: 24, attributed_active_paid_total: 8 },
      sources: {
        grower_invite: { accounts: 8, active_paid: 3 },
        founder_share: { accounts: 6, active_paid: 3 },
        landing_page: { accounts: 4, active_paid: 4 },
        pricing_page: { accounts: 5, active_paid: 6 },
        unattributed: { accounts: 10, active_paid: 1 },
      },
    });

    const viewModel = buildSignupToPaidFunnelViewModel(snapshot);
    expect(viewModel.bestObservedSource?.id).toBe("founder_share");
    expect(viewModel.bestObservedSource?.activePaidRatePercent).toBe(50);
    expect(viewModel.rows.find((row) => row.id === "landing_page")?.sampleStatus).toBe(
      "directional",
    );
    expect(viewModel.rows.find((row) => row.id === "pricing_page")?.integrityMismatch).toBe(true);
    expect(viewModel.recommendation).toContain("Founder shares");
  });

  it("does not claim a winner before the sample floor or an active-paid match", () => {
    const noPaid = parseSignupToPaidSnapshot({
      ok: true,
      counts: { attributed_accounts_total: 6, attributed_active_paid_total: 0 },
      sources: { grower_invite: { accounts: 6, active_paid: 0 } },
    });
    expect(buildSignupToPaidFunnelViewModel(noPaid).recommendation).toContain(
      "none currently match an active-paid entitlement",
    );

    const tiny = parseSignupToPaidSnapshot({
      ok: true,
      counts: { attributed_accounts_total: 2, attributed_active_paid_total: 1 },
      sources: { grower_invite: { accounts: 2, active_paid: 1 } },
    });
    expect(buildSignupToPaidFunnelViewModel(tiny).bestObservedSource).toBeNull();
  });
});
