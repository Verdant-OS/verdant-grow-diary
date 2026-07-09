/**
 * pheno-hunt-setup-confirmation — review-and-confirm step behavior.
 *
 * Pins: persisted state renders (goal + candidates), Pro/Founder users can
 * confirm (and continue setup after leaving), canceled/expired users cannot
 * write, goal edits persist before confirming, and an already-confirmed hunt
 * shows its stamp instead of a confirm button.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type {
  BillingSubscriptionRow,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";
import type { PhenoHuntSetupState } from "@/lib/phenoHuntService";

let currentEntitlement: ResolvedEntitlement | null = null;
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: currentEntitlement,
    refetch: async () => {},
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const loadMock = vi.fn<() => Promise<PhenoHuntSetupState>>();
const confirmMock = vi.fn(async (_input?: unknown) => ({
  setupConfirmedAt: "2026-07-09T12:00:00.000Z",
}));
const updateGoalMock = vi.fn(async (input: { huntId: string; goal: string }) => ({
  goal: input.goal.trim(),
}));
vi.mock("@/lib/phenoHuntService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/phenoHuntService")>();
  return {
    ...actual,
    loadPhenoHuntSetup: () => loadMock(),
    confirmPhenoHuntSetup: (...a: unknown[]) => confirmMock(a[0]),
    updatePhenoHuntGoal: (...a: unknown[]) =>
      updateGoalMock(a[0] as { huntId: string; goal: string }),
  };
});

import PhenoHuntSetupConfirmation from "@/pages/PhenoHuntSetupConfirmation";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";

const NOW = new Date("2026-08-01Z");
const billingRow = (
  plan_id: BillingSubscriptionRow["plan_id"],
  status: BillingSubscriptionRow["status"],
  current_period_end: string | null,
): BillingSubscriptionRow => ({
  id: "r",
  user_id: "u1",
  plan_id,
  status,
  provider: "paddle",
  provider_customer_id: null,
  provider_subscription_id: null,
  current_period_end,
  cancel_at_period_end: false,
  founder_number: null,
  created_at: "",
  updated_at: "",
});

const ENTITLEMENTS = {
  pro: () => resolveEntitlements(billingRow("pro_monthly", "active", "2099-01-01Z"), NOW),
  founder: () => resolveEntitlements(billingRow("founder_lifetime", "active", null), NOW),
  canceledPro: () => resolveEntitlements(billingRow("pro_monthly", "canceled", "2026-01-01Z"), NOW),
};

const UNCONFIRMED: PhenoHuntSetupState = {
  huntId: "h1",
  name: "Blue Dream Hunt",
  goal: "Find the keeper",
  growId: "g1",
  tentId: null,
  setupConfirmedAt: null,
  candidates: [
    { id: "p1", name: "Plant 1", candidateLabel: "#1" },
    { id: "p2", name: "Plant 2", candidateLabel: "#2" },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/h1/setup"]}>
      <Routes>
        <Route path="/pheno-hunts/:id/setup" element={<PhenoHuntSetupConfirmation />} />
        <Route
          path="/pheno-hunts/:id/workspace"
          element={<div data-testid="workspace-marker">workspace</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
  confirmMock.mockClear();
  updateGoalMock.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  loadMock.mockResolvedValue({ ...UNCONFIRMED, candidates: [...UNCONFIRMED.candidates] });
});

describe("PhenoHuntSetupConfirmation", () => {
  it("renders the persisted goal and candidates (continue-setup landing)", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-page")).toBeInTheDocument());
    expect((screen.getByTestId("pheno-setup-goal-input") as HTMLTextAreaElement).value).toBe(
      "Find the keeper",
    );
    expect(screen.getByTestId("pheno-setup-candidates").children).toHaveLength(2);
  });

  it("Pro: Confirm setup persists the stamp and continues to the workspace", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-confirm-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("pheno-setup-confirm-btn"));
    await waitFor(() => expect(screen.getByTestId("workspace-marker")).toBeInTheDocument());
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it("Founder Lifetime: can continue setup and confirm", async () => {
    currentEntitlement = ENTITLEMENTS.founder();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-confirm-btn")).toBeInTheDocument());
    expect(screen.getByTestId("pheno-setup-confirm-btn")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("pheno-setup-confirm-btn"));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
  });

  it("Canceled Pro: confirm and goal-save are write-blocked", async () => {
    currentEntitlement = ENTITLEMENTS.canceledPro();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-page")).toBeInTheDocument());
    expect(screen.getByTestId("pheno-setup-confirm-btn")).toBeDisabled();
    expect(screen.getByTestId("pheno-setup-save-goal")).toBeDisabled();
    expect(screen.getByTestId("pheno-setup-goal-input")).toBeDisabled();
    expect(screen.getByTestId("pheno-setup-confirm-blocked").textContent).toMatch(
      /active Pro or Founder Lifetime/i,
    );
    fireEvent.click(screen.getByTestId("pheno-setup-confirm-btn"));
    expect(confirmMock).not.toHaveBeenCalled();
    expect(updateGoalMock).not.toHaveBeenCalled();
  });

  it("goal edits must be saved before confirming (persisted-goal integrity)", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-page")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("pheno-setup-goal-input"), {
      target: { value: "Sharper goal" },
    });
    expect(screen.getByTestId("pheno-setup-confirm-btn")).toBeDisabled();
    expect(screen.getByTestId("pheno-setup-confirm-blocked").textContent).toMatch(
      /save your goal/i,
    );
    fireEvent.click(screen.getByTestId("pheno-setup-save-goal"));
    await waitFor(() =>
      expect(updateGoalMock).toHaveBeenCalledWith({ huntId: "h1", goal: "Sharper goal" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("pheno-setup-confirm-btn")).not.toBeDisabled(),
    );
  });

  it("zero candidates blocks confirmation with guidance", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    loadMock.mockResolvedValue({ ...UNCONFIRMED, candidates: [] });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-no-candidates")).toBeInTheDocument());
    expect(screen.getByTestId("pheno-setup-confirm-btn")).toBeDisabled();
  });

  it("an already-confirmed hunt shows the stamp and a workspace link, not a confirm button", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    loadMock.mockResolvedValue({
      ...UNCONFIRMED,
      setupConfirmedAt: "2026-07-01T00:00:00.000Z",
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-confirmed")).toBeInTheDocument());
    expect(screen.queryByTestId("pheno-setup-confirm-btn")).toBeNull();
    expect(screen.getByTestId("pheno-setup-open-workspace")).toBeInTheDocument();
  });

  it("a missing hunt (RLS-filtered or deleted) renders the error state", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    loadMock.mockRejectedValue(new Error("Pheno hunt not found."));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pheno-setup-error")).toBeInTheDocument());
  });
});
