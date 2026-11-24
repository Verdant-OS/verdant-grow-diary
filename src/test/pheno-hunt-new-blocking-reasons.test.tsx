/**
 * Step 1 must show why Create is blocked, and the button must not look actionable.
 * Create still runs on the confirmation step once the view-model requirements are met.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";
import { PHENO_GOALS_REVIEW_REQUIRED_REASON } from "@/lib/phenoHuntOnboardingViewModel";

const NOW = new Date("2026-08-01T00:00:00Z");

const createPhenoHuntMock = vi.hoisted(() =>
  vi.fn(async () => ({
    huntId: "hunt-1",
    taggedPlantIds: ["p1", "p2"],
  })),
);

const supabaseMock = vi.hoisted(() => {
  const growRow = { id: "grow-1", name: "Basement A" };
  const plantRows = [
    { id: "p1", name: "Plant A", strain: "OG", tent_id: null },
    { id: "p2", name: "Plant B", strain: "Haze", tent_id: null },
  ];
  function makeQuery(table: string) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.or = self;
    chain.maybeSingle = async () => ({
      data: table === "grows" ? growRow : null,
      error: null,
    });
    chain.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === "plants" ? plantRows : null,
        error: null,
      }).then(onFulfilled);
    return chain;
  }
  return { from: (table: string) => makeQuery(table) };
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

vi.mock("@/lib/phenoHuntService", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/phenoHuntService")>("@/lib/phenoHuntService");
  return { ...actual, createPhenoHunt: createPhenoHuntMock };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PhenoHuntNew from "@/pages/PhenoHuntNew";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=grow-1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
        <Route path="/logs" element={<div>logs</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoHuntNew footer blocking reasons", () => {
  beforeEach(() => {
    cleanup();
    createPhenoHuntMock.mockClear();
    window.localStorage.clear();
  });

  it("shows blocking reasons on step 1 and does not present Create as actionable", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-step-basics"));

    const reasons = screen.getByTestId("pheno-footer-blocking-reasons");
    expect(reasons.textContent).toContain("Select at least one candidate plant");
    expect(reasons.textContent).toContain(PHENO_GOALS_REVIEW_REQUIRED_REASON);
    expect(reasons.textContent).toContain("Confirm setup to enter the workspace");

    const save = screen.getByTestId("ph-save-btn") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(save.className).not.toContain("gradient-leaf");
    expect(save.getAttribute("aria-describedby")).toBe("pheno-footer-blocking-reasons");
    fireEvent.click(save);
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });

  it("creates the hunt from the confirmation step once the requirements are met", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("ph-toggle-p2"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-goals"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-confirmation"));
    fireEvent.click(screen.getByTestId("pheno-setup-confirm-toggle"));

    expect(screen.queryByTestId("pheno-footer-blocking-reasons")).toBeNull();
    const save = screen.getByTestId("ph-save-btn") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-disabled")).toBe("false");
    expect(save.className).toContain("gradient-leaf");
    fireEvent.click(save);
    await waitFor(() => expect(createPhenoHuntMock).toHaveBeenCalledTimes(1));
  });
});
