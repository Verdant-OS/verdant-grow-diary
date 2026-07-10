/**
 * pheno-tracker-upgrade-gate.test.tsx
 *
 * Free → improved upgrade card + single primary CTA + demo link + returnTo.
 * Pro → children. Founder → children. Canceled Pro + allowReadOnly → banner +
 * children. Forbidden marketing phrases stay absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const NOW = new Date("2026-08-01T00:00:00Z");
const mode = vi.hoisted(() => ({ current: "free" as
  | "free"
  | "pro"
  | "founder"
  | "canceled"
  | "loading" }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    if (mode.current === "loading") {
      return { loading: true, entitlement: resolveEntitlements(null, NOW), refetch: async () => {} };
    }
    const base: BillingSubscriptionRow = {
      id: "r", user_id: "u",
      plan_id: "pro_monthly", status: "active",
      provider: "paddle",
      provider_customer_id: null, provider_subscription_id: null,
      current_period_end: "2027-01-01T00:00:00Z", cancel_at_period_end: false,
      founder_number: null, created_at: "", updated_at: "",
    };
    let row: BillingSubscriptionRow | null = null;
    if (mode.current === "pro") row = base;
    if (mode.current === "founder") row = { ...base, plan_id: "founder_lifetime" };
    if (mode.current === "canceled") row = { ...base, status: "canceled" };
    return {
      loading: false,
      entitlement: resolveEntitlements(row, NOW),
      refetch: async () => {},
    };
  },
}));

import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

const FORBIDDEN = [
  /AI picks winners/i,
  /guaranteed keeper/i,
  /guaranteed yield/i,
  /automated breeding/i,
  /autopilot/i,
  /device control/i,
];

function renderGate(
  props: Partial<React.ComponentProps<typeof PhenoTrackerUpgradeGate>> = {},
  initialPath = "/pheno-hunts/new",
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PhenoTrackerUpgradeGate {...props}>
        <div data-testid="gated-child">Real workspace</div>
      </PhenoTrackerUpgradeGate>
    </MemoryRouter>,
  );
}

describe("PhenoTrackerUpgradeGate", () => {
  beforeEach(() => cleanup());

  it("renders loading state while entitlement resolves", () => {
    mode.current = "loading";
    renderGate();
    expect(screen.getByTestId("pheno-tracker-upgrade-gate-loading")).toBeDefined();
    expect(screen.queryByTestId("gated-child")).toBeNull();
  });

  it("Free user sees improved upgrade card with new copy + single primary CTA + demo link", () => {
    mode.current = "free";
    renderGate();
    expect(screen.getByText(/Pheno Tracker is a Pro feature\./i)).toBeDefined();
    expect(
      screen.getByText(
        /Track candidate evidence, compare phenos, preserve keeper decisions, and document post-cure results\./i,
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        /Use it to see what changed, what held up after cure, and what deserves another run\./i,
      ),
    ).toBeDefined();

    const upgradeLinks = screen.getAllByRole("link", { name: /upgrade to pro/i });
    expect(upgradeLinks.length).toBe(1);
    // returnTo carried into the upgrade href for the gated Pheno route.
    // Destination is /pricing — the page with LIVE checkout (/upgrade is a
    // dead end: every paddlePriceId there is null).
    expect(upgradeLinks[0].getAttribute("href")).toBe(
      "/pricing?returnTo=%2Fpheno-hunts%2Fnew",
    );

    const demo = screen.getByTestId("pheno-tracker-upgrade-gate-demo-link");
    expect(demo.getAttribute("href")).toBe("/pheno-comparison");
    expect(demo.textContent).toMatch(/View Pheno Demo/i);

    expect(screen.queryByTestId("gated-child")).toBeNull();
    const body = document.body.textContent ?? "";
    for (const rx of FORBIDDEN) expect(body).not.toMatch(rx);
  });

  it("returnTo param is scoped to gated Pheno pathnames", () => {
    mode.current = "free";
    renderGate({}, "/pheno-hunts/abc/workspace");
    const upgrade = screen.getAllByRole("link", { name: /upgrade to pro/i })[0];
    expect(upgrade.getAttribute("href")).toBe(
      "/pricing?returnTo=%2Fpheno-hunts%2Fabc%2Fworkspace",
    );
  });

  it("returnTo preserves the query context of a deep-linked gated route", () => {
    // A buyer arriving at /pheno-hunts/new?growId=... must keep growId/tentId
    // through checkout, or the new-hunt page shows "Grow not found".
    mode.current = "free";
    renderGate({}, "/pheno-hunts/new?growId=g1&tentId=t1");
    const upgrade = screen.getAllByRole("link", { name: /upgrade to pro/i })[0];
    expect(upgrade.getAttribute("href")).toBe(
      "/pricing?returnTo=%2Fpheno-hunts%2Fnew%3FgrowId%3Dg1%26tentId%3Dt1",
    );
  });

  it("Pro user sees children (no gate)", () => {
    mode.current = "pro";
    renderGate();
    expect(screen.getByTestId("gated-child")).toBeDefined();
    expect(screen.queryByTestId("pheno-tracker-upgrade-gate")).toBeNull();
  });

  it("Founder lifetime user sees children (no gate)", () => {
    mode.current = "founder";
    renderGate();
    expect(screen.getByTestId("gated-child")).toBeDefined();
  });

  it("Canceled Pro with allowReadOnly shows read-only banner + children", () => {
    mode.current = "canceled";
    renderGate({ allowReadOnly: true });
    expect(screen.getByTestId("pheno-tracker-upgrade-gate-readonly-banner")).toBeDefined();
    expect(screen.getByTestId("gated-child")).toBeDefined();
  });

  it("Canceled Pro without allowReadOnly falls back to upgrade card", () => {
    mode.current = "canceled";
    renderGate();
    expect(screen.getByTestId("pheno-tracker-upgrade-gate")).toBeDefined();
    expect(screen.queryByTestId("gated-child")).toBeNull();
  });
});
