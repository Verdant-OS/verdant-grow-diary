/**
 * pheno-hunt-create-blocked-reasons.test.tsx (#3083)
 *
 * "Create Pheno Hunt" sits in the shared footer on every onboarding step and
 * stays disabled until vm.canCreate. It must not look enabled while it is
 * disabled, and the footer must say why it is disabled on every step that does
 * not already list the blocking reasons in-section.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";
import {
  PHENO_CREATE_BLOCKED_HEADING,
  PHENO_GOALS_REVIEW_REQUIRED_REASON,
} from "@/lib/phenoHuntOnboardingViewModel";

const NOW = new Date("2026-08-01T00:00:00Z");

const createPhenoHuntMock = vi.hoisted(() =>
  vi.fn(async () => ({ huntId: "hunt-1", taggedPlantIds: ["p1"] })),
);

const supabaseMock = vi.hoisted(() => {
  const growRow = { id: "grow-1", name: "Basement A" };
  const plantRows = [
    { id: "p1", name: "Plant A", strain: "OG", tent_id: null },
    { id: "p2", name: "Plant B", strain: "Haze", tent_id: null },
  ];
  function makeQuery(table: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      maybeSingle: async () => ({ data: table === "grows" ? growRow : null, error: null }),
      then: (onFulfilled: (v: any) => any) =>
        Promise.resolve({ data: table === "plants" ? plantRows : null, error: null }).then(
          onFulfilled,
        ),
    };
    return chain;
  }
  return { from: (table: string) => makeQuery(table) };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PhenoHuntNew from "@/pages/PhenoHuntNew";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=grow-1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
      </Routes>
    </MemoryRouter>,
  );
}

function saveButton() {
  return screen.getByTestId("ph-save-btn") as HTMLButtonElement;
}

function footerReasons() {
  return screen.queryByTestId("ph-save-blocking-reasons");
}

describe("PhenoHuntNew Create button explains why it is disabled (#3083)", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    createPhenoHuntMock.mockClear();
  });

  it("on step 1 the disabled Create button is not green and the footer lists why", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-step-basics"));

    const save = saveButton();
    expect(save.disabled).toBe(true);
    expect(save.className).not.toMatch(/gradient-leaf/);
    expect(save.getAttribute("aria-describedby")).toBe("ph-save-blocking-reasons");

    const reasons = footerReasons();
    expect(reasons).not.toBeNull();
    expect(reasons!.textContent).toContain(PHENO_CREATE_BLOCKED_HEADING);
    expect(reasons!.textContent).toContain("Select at least one candidate plant");
    expect(reasons!.textContent).toContain(PHENO_GOALS_REVIEW_REQUIRED_REASON);
    expect(reasons!.textContent).toContain("Confirm setup to enter the workspace");

    fireEvent.click(save);
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });

  it("the footer reasons shrink as the grower completes each gate", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    expect(footerReasons()!.textContent).not.toContain("Select at least one candidate plant");

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-goals"));
    expect(footerReasons()!.textContent).not.toContain(PHENO_GOALS_REVIEW_REQUIRED_REASON);
    expect(footerReasons()!.textContent).toContain("Confirm setup to enter the workspace");
  });

  it("checklist and confirmation steps keep their in-section list with no footer duplicate", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-checklist"));
    expect(screen.getByTestId("pheno-blocking-reasons")).toBeDefined();
    expect(footerReasons()).toBeNull();

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-goals"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-confirmation"));
    expect(screen.getByTestId("pheno-confirmation-blocking")).toBeDefined();
    expect(footerReasons()).toBeNull();
    expect(saveButton().getAttribute("aria-describedby")).toBeNull();
  });

  it("once every gate passes, Create is green, enabled and the reasons are gone", async () => {
    renderPage();
    await waitFor(() => screen.getByTestId("pheno-onboarding-stepper"));

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-candidates"));
    fireEvent.click(screen.getByTestId("ph-toggle-p1"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-goals"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-confirmation"));
    fireEvent.click(screen.getByTestId("pheno-setup-confirm-toggle"));

    const save = saveButton();
    expect(save.disabled).toBe(false);
    expect(save.className).toMatch(/gradient-leaf/);
    expect(screen.queryByTestId("pheno-confirmation-blocking")).toBeNull();

    // Moving back to an earlier step keeps Create enabled and shows no reasons.
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-basics"));
    expect(footerReasons()).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(createPhenoHuntMock).toHaveBeenCalledTimes(1));
  });
});
