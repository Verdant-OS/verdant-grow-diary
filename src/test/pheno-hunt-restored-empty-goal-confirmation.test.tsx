/**
 * A restored draft that explicitly saved an empty goal list must reopen on
 * Goals. Confirmation must not render until the grower chooses a known goal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const NOW = new Date("2026-08-01T00:00:00Z");

const supabaseMock = vi.hoisted(() => {
  const growRow = { id: "grow-1", name: "Basement A" };
  const plantRows = [
    { id: "p1", name: "Plant A", strain: "OG", tent_id: null },
    { id: "p2", name: "Plant B", strain: "Haze", tent_id: null },
  ];
  function makeQuery(table: string) {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      maybeSingle: async () => ({
        data: table === "grows" ? growRow : null,
        error: null,
      }),
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({
          data: table === "plants" ? plantRows : null,
          error: null,
        }).then(onFulfilled),
    };
    return chain;
  }
  return {
    from: (table: string) => makeQuery(table),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => {
    const row: BillingSubscriptionRow = {
      id: "r",
      user_id: "u1",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: "2027-01-01T00:00:00Z",
      cancel_at_period_end: false,
      founder_number: null,
      created_at: "",
      updated_at: "",
    };
    return {
      loading: false,
      lookupFailed: false,
      entitlement: resolveEntitlements(row, NOW),
      refetch: async () => {},
    };
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PhenoHuntNew from "@/pages/PhenoHuntNew";

const DRAFT_KEY = "verdant:pheno-hunt-draft:u1:grow-1:all";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=grow-1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("restored draft with an explicit empty goal list", () => {
  beforeEach(() => {
    cleanup();
    clearLocalStorageForTest();
  });

  afterEach(() => {
    clearLocalStorageForTest();
  });

  it("reopens on Goals and does not show Confirmation", async () => {
    setLocalStorageItemForTest(
      DRAFT_KEY,
      JSON.stringify({
        name: "Resumed hunt",
        notes: "",
        selected: ["p1", "p2"],
        evidenceGoals: [],
        currentStep: "confirmation",
        goalsReviewed: true,
      }),
    );

    renderPage();
    await waitFor(() => screen.getByTestId("ph-draft-restored"));

    expect(screen.queryByTestId("pheno-step-confirmation")).toBeNull();
    expect(screen.getByTestId("pheno-evidence-goals")).toBeDefined();
    expect(screen.getByTestId("pheno-evidence-goals-summary").textContent).toBe(
      "None selected yet — choose at least one goal",
    );
  });
});
