/**
 * pheno-hunt-new-route-entry-gate — the /pheno-hunts/new WIZARD is
 * unreachable for non-entitled growers.
 *
 * Regression for the bug where a non-Pro account could walk through all six
 * wizard steps and only fail at the final save with a raw RLS error. This
 * mounts the same composition App.tsx registers for the route
 * (PhenoTrackerUpgradeGate wrapping PhenoHuntNew) and proves:
 *   - Free: upgrade card renders, the wizard (steps, save button) never
 *     mounts, and no Supabase query fires at all.
 *   - Pro: the wizard renders normally through the same gate.
 * The static route-registration guard lives in pheno-routes-safety.test.ts;
 * this covers the rendered behavior behind it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import { canUseFeature } from "@/lib/featureEntitlements";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const entMode = vi.hoisted(() => ({ current: "free" as "free" | "pro" }));

vi.mock("@/hooks/useMyEntitlements", async () => {
  const { resolveEntitlements: resolve } = await import(
    "@/lib/entitlements/resolveEntitlements"
  );
  const NOW = new Date("2026-08-01T00:00:00Z");
  return {
    useMyEntitlements: () => ({
      loading: false,
      lookupFailed: false,
      entitlement: resolve(
        entMode.current === "pro"
          ? {
              id: "r",
              user_id: "u1",
              plan_id: "pro_monthly",
              status: "active",
              provider: "paddle",
              provider_customer_id: null,
              provider_subscription_id: null,
              current_period_end: "2099-01-01T00:00:00Z",
              cancel_at_period_end: false,
              founder_number: null,
              created_at: "",
              updated_at: "",
            }
          : null,
        NOW,
      ),
      refetch: async () => {},
    }),
  };
});

import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";
import PhenoHuntNew from "@/pages/PhenoHuntNew";

function mockGrowData() {
  fromMock.mockImplementation((table: string) => {
    if (table === "grows") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "g1", name: "Tent A" },
              error: null,
            }),
          }),
        }),
      };
    }
    // BUG-A grow attribution: the wizard resolves the grow's tent ids first
    // so orphan-attributed plants can appear as candidates.
    if (table === "tents" || table === "plants") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res),
      } as unknown as PromiseLike<unknown> & Record<string, unknown>;
      return builder;
    }
    return {} as never;
  });
}

function renderRoute() {
  // Same shape App.tsx registers for the wizard route.
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=g1"]}>
      <Routes>
        <Route
          path="/pheno-hunts/new"
          element={
            <PhenoTrackerUpgradeGate>
              <PhenoHuntNew />
            </PhenoTrackerUpgradeGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/pheno-hunts/new route entry gate", () => {
  beforeEach(() => {
    cleanup();
    fromMock.mockReset();
  });

  it("Free entitlement: upgrade card renders and the wizard never mounts", () => {
    entMode.current = "free";
    mockGrowData();
    renderRoute();

    expect(screen.getByTestId("pheno-tracker-upgrade-gate")).toBeDefined();
    expect(screen.getByRole("link", { name: /upgrade to pro/i })).toBeDefined();

    // The six-step wizard never mounts — no stepper, no steps, no save button.
    expect(screen.queryByTestId("pheno-hunt-onboarding")).toBeNull();
    expect(screen.queryByTestId("pheno-step-basics")).toBeNull();
    expect(screen.queryByTestId("ph-save-btn")).toBeNull();

    // A gated visit performs zero Supabase reads or writes.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("a null billing row can never use pheno_tracker (gate predicate)", () => {
    // Belt-and-suspenders: guards against a future default flip in the
    // resolver quietly opening the gate for Free accounts.
    const e = resolveEntitlements(null, new Date("2026-08-01T00:00:00Z"));
    expect(canUseFeature(e, "pheno_tracker")).toBe(false);
  });

  it("Pro entitlement: the same gated route renders the wizard", async () => {
    entMode.current = "pro";
    mockGrowData();
    renderRoute();

    await waitFor(() =>
      expect(screen.getByTestId("pheno-hunt-onboarding")).toBeDefined(),
    );
    expect(screen.queryByTestId("pheno-tracker-upgrade-gate")).toBeNull();
  });
});
