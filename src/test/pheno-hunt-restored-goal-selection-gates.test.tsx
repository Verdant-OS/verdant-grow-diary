/**
 * Coverage for review 5505824828:
 * a restored draft that omits evidenceGoals keeps the suggested defaults and
 * its saved confirmation step, and an explicit empty selection creates once
 * only after the grower chooses a goal and confirms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const NOW = new Date("2026-08-01T00:00:00Z");

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const createPhenoHuntMock = vi.hoisted(() =>
  vi.fn(async (_input: { evidenceGoals: readonly string[]; plantIds: readonly string[] }) => ({
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

vi.mock("@/lib/phenoHuntService", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/phenoHuntService")>("@/lib/phenoHuntService");
  return {
    ...actual,
    createPhenoHunt: createPhenoHuntMock,
  };
});

vi.mock("sonner", () => ({
  toast: toastMock,
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

describe("restored goal selection gates", () => {
  beforeEach(() => {
    cleanup();
    clearLocalStorageForTest();
    createPhenoHuntMock.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  afterEach(() => {
    clearLocalStorageForTest();
  });

  it("keeps suggested defaults when a restored draft omits evidenceGoals", async () => {
    setLocalStorageItemForTest(
      DRAFT_KEY,
      JSON.stringify({
        name: "Legacy hunt",
        notes: "",
        selected: ["p1", "p2"],
        currentStep: "confirmation",
        goalsReviewed: true,
      }),
    );

    renderPage();
    await waitFor(() => screen.getByTestId("ph-draft-restored"));

    expect(screen.getByTestId("pheno-step-confirmation")).toBeDefined();
    expect(screen.getByTestId("pheno-confirmation-summary").textContent).toContain(
      "8 of 12 selected — the suggested starting set",
    );
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });

  it("creates once after an empty selection gains a goal and an explicit confirmation", async () => {
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
    expect(screen.getByTestId("pheno-evidence-goals-summary").textContent).toBe(
      "None selected yet — choose at least one goal",
    );

    const save = screen.getByTestId("ph-save-btn") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(createPhenoHuntMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-confirmation"));
    expect(screen.queryByTestId("pheno-step-confirmation")).toBeNull();

    fireEvent.click(screen.getByTestId("pheno-evidence-goals-toggle-structure"));
    fireEvent.click(screen.getByTestId("pheno-onboarding-stepper-step-confirmation"));
    expect(screen.getByTestId("pheno-step-confirmation")).toBeDefined();
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(createPhenoHuntMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("pheno-setup-confirm-toggle"));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(createPhenoHuntMock).toHaveBeenCalledTimes(1));
    expect(createPhenoHuntMock.mock.calls[0]?.[0]).toMatchObject({
      evidenceGoals: ["structure"],
      plantIds: ["p1", "p2"],
    });
  });
});
