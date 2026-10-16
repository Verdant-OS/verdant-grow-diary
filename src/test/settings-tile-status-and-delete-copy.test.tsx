/**
 * Settings copy from production QA 2026-10-14 (disposable Free-plan account):
 *  1. Status: destructive and not-ready tiles never claim "Available" / "live",
 *     and the Subscription tile names the plan once.
 *  2. Delete dialog: no billing or refund copy unless the plan is paid (or
 *     unknown); type-DELETE gating is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const ent = vi.hoisted(() => ({
  loading: false as boolean,
  lookupFailed: false as boolean,
  displayPlanId: "free" as string | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const q: any = {};
    for (const m of ["select", "eq", "neq", "not", "in", "order", "limit", "range", "gte", "lte"]) {
      q[m] = () => q;
    }
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: null, error: null });
    q.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled);
    return q;
  };
  return {
    supabase: {
      from: () => makeQuery(),
      functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "grower@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: ent.loading,
    lookupFailed: ent.lookupFailed,
    entitlement: ent.displayPlanId
      ? { displayPlanId: ent.displayPlanId, status: "active", isStaff: false }
      : null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePaddleCancelNotice", () => ({
  usePaddleCancelNotice: () => ({
    visible: false,
    accessUntilIso: null,
    accessUntilLabel: "",
    reason: null,
  }),
}));

vi.mock("@/components/RewardedReferralCard", () => ({
  default: () => <div>Your referral link isn't ready yet. Check back soon.</div>,
}));

import Settings from "@/pages/Settings";
import { deleteAccountDisclosesBilling } from "@/lib/settingsTilesRules";

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

function tileNamed(name: string): HTMLElement {
  const tile = screen
    .getAllByTestId("settings-tile")
    .find((t) => within(t).queryByRole("heading", { name }));
  expect(tile, `tile ${name}`).toBeTruthy();
  return tile!;
}

function openDeleteDialog(): HTMLElement {
  fireEvent.click(screen.getByTestId("settings-delete-account"));
  return screen.getByTestId("settings-delete-account-dialog");
}

beforeEach(() => {
  ent.loading = false;
  ent.lookupFailed = false;
  ent.displayPlanId = "free";
});

describe("Settings tile status", () => {
  it.each(["Delete account", "Refer a friend"])(
    "%s shows no 'Available' badge and no 'live' helper",
    (name) => {
      renderSettings();
      const tile = tileNamed(name);
      expect(within(tile).queryByTestId("settings-tile-badge")).toBeNull();
      expect(within(tile).queryByTestId("settings-tile-helper")).toBeNull();
      expect(tile.textContent ?? "").not.toMatch(/\bAvailable\b/);
      expect(tile.textContent ?? "").not.toMatch(/This setting is live/);
    },
  );

  it("still badges an ordinary live setting", () => {
    renderSettings();
    const units = tileNamed("Units");
    expect(within(units).getByTestId("settings-tile-badge")).toHaveTextContent("Available");
  });

  it("names the Free plan once in the Subscription tile", () => {
    renderSettings();
    const tile = tileNamed("Subscription");
    expect(screen.getByTestId("settings-subscription-plan")).toHaveTextContent("Free");
    expect(within(tile).getAllByText(/^Free$/)).toHaveLength(1);
  });
});

describe("Delete account dialog billing copy", () => {
  it("Free plan: plain 'Delete account' button and no billing or refund text", () => {
    renderSettings();
    const dialog = openDeleteDialog();
    const confirm = within(dialog).getByTestId("settings-delete-account-confirm");
    expect(confirm).toHaveTextContent(/^Delete account$/);
    expect(dialog.textContent ?? "").not.toMatch(/Paddle|subscription|refund|billing/i);
  });

  it("paid plan keeps the billing and refund disclosure", () => {
    ent.displayPlanId = "pro_monthly";
    renderSettings();
    const dialog = openDeleteDialog();
    expect(within(dialog).getByTestId("settings-delete-account-confirm")).toHaveTextContent(
      "Cancel billing and delete",
    );
    expect(dialog).toHaveTextContent(/Any recurring Paddle subscription is canceled/);
    expect(dialog).toHaveTextContent(/does not automatically issue a refund/);
  });

  it.each([
    ["loading", { loading: true }],
    ["lookup failed", { lookupFailed: true }],
  ])("plan %s: keeps the billing disclosure (never hides it on unknown)", (_label, patch) => {
    Object.assign(ent, patch);
    renderSettings();
    const dialog = openDeleteDialog();
    expect(within(dialog).getByTestId("settings-delete-account-confirm")).toHaveTextContent(
      "Cancel billing and delete",
    );
  });

  // Codex P2-1 at 9fafebb3: with loading and lookup settled, a missing plan
  // (no entitlement row, null or undefined displayPlanId) is not a confirmed
  // Free plan, so the billing disclosure must stay.
  it("missing plan: keeps the billing disclosure when no entitlement is returned", () => {
    ent.displayPlanId = null;
    renderSettings();
    const dialog = openDeleteDialog();
    expect(within(dialog).getByTestId("settings-delete-account-confirm")).toHaveTextContent(
      "Cancel billing and delete",
    );
  });

  it.each([null, undefined])("rule: settled lookup with plan %s still discloses billing", (id) => {
    expect(
      deleteAccountDisclosesBilling({ loading: false, lookupFailed: false, displayPlanId: id }),
    ).toBe(true);
    expect(
      deleteAccountDisclosesBilling({ loading: false, lookupFailed: false, displayPlanId: "free" }),
    ).toBe(false);
  });

  it("keeps type-DELETE gating on the Free plan", () => {
    renderSettings();
    const dialog = openDeleteDialog();
    const confirm = within(dialog).getByTestId("settings-delete-account-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByTestId("settings-delete-account-confirm-input"), {
      target: { value: "delete" },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByTestId("settings-delete-account-confirm-input"), {
      target: { value: "DELETE" },
    });
    expect(confirm).toBeEnabled();
  });
});
