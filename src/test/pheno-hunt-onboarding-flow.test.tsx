/**
 * pheno-hunt-onboarding-flow — guided setup flow on /pheno-hunts/new.
 *
 * Pins: the goal field is required and persisted through createPhenoHunt,
 * successful creation continues to the setup-confirmation step, and the
 * write handler blocks Free / canceled entitlements (belt-and-suspenders
 * under the route gate; the database RLS is the authority).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type {
  BillingSubscriptionRow,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

// Switchable entitlement: each test picks the plan state before rendering.
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

const createPhenoHuntMock = vi.fn(async (_input?: unknown) => ({
  huntId: "h1",
  taggedPlantIds: ["p1"],
}));
vi.mock("@/lib/phenoHuntService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/phenoHuntService")>();
  return {
    ...actual,
    createPhenoHunt: (...a: unknown[]) => createPhenoHuntMock(a[0]),
  };
});

import PhenoHuntNew from "@/pages/PhenoHuntNew";
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
  free: () => resolveEntitlements(null, NOW),
  pro: () => resolveEntitlements(billingRow("pro_monthly", "active", "2099-01-01Z"), NOW),
  founder: () => resolveEntitlements(billingRow("founder_lifetime", "active", null), NOW),
  canceledPro: () => resolveEntitlements(billingRow("pro_monthly", "canceled", "2026-01-01Z"), NOW),
};

function mockGrowAndPlants() {
  fromMock.mockImplementation((table: string) => {
    if (table === "grows") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "g1", name: "Tent A" }, error: null }),
          }),
        }),
      };
    }
    if (table === "plants") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [{ id: "p1", name: "Plant 1", strain: "S1", tent_id: null }],
            error: null,
          }).then(res),
      } as unknown as PromiseLike<unknown> & Record<string, unknown>;
      return builder;
    }
    return {} as never;
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=g1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
        <Route
          path="/pheno-hunts/:id/setup"
          element={<div data-testid="setup-step-marker">setup step</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillDraft(opts: { goal?: string } = {}) {
  await waitFor(() => expect(screen.getByTestId("ph-plant-list")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("ph-toggle-p1"));
  if (opts.goal !== undefined) {
    fireEvent.change(screen.getByTestId("ph-goal-input"), { target: { value: opts.goal } });
  }
}

beforeEach(() => {
  fromMock.mockReset();
  createPhenoHuntMock.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  mockGrowAndPlants();
});

describe("guided setup flow (goal capture)", () => {
  it("renders the goal field and keeps Create disabled until a goal is set", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    renderPage();
    await fillDraft(); // candidate selected, no goal
    expect(screen.getByTestId("ph-goal-input")).toBeInTheDocument();
    expect(screen.getByTestId("ph-save-btn")).toBeDisabled();
    fireEvent.change(screen.getByTestId("ph-goal-input"), {
      target: { value: "Find the loudest gas pheno" },
    });
    expect(screen.getByTestId("ph-save-btn")).not.toBeDisabled();
  });

  it("Pro: creates the hunt with the goal and continues to setup confirmation", async () => {
    currentEntitlement = ENTITLEMENTS.pro();
    renderPage();
    await fillDraft({ goal: "  Find the loudest gas pheno  " });
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    await waitFor(() => expect(screen.getByTestId("setup-step-marker")).toBeInTheDocument());
    expect(createPhenoHuntMock).toHaveBeenCalledTimes(1);
    expect(createPhenoHuntMock.mock.calls[0][0]).toMatchObject({
      growId: "g1",
      goal: "Find the loudest gas pheno",
      plantIds: ["p1"],
    });
  });

  it("Founder Lifetime: can create and continue setup", async () => {
    currentEntitlement = ENTITLEMENTS.founder();
    renderPage();
    await fillDraft({ goal: "Keeper for the mother room" });
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    await waitFor(() => expect(screen.getByTestId("setup-step-marker")).toBeInTheDocument());
    expect(createPhenoHuntMock).toHaveBeenCalledTimes(1);
  });

  it("Free: the write handler blocks createPhenoHunt", async () => {
    currentEntitlement = ENTITLEMENTS.free();
    renderPage();
    await fillDraft({ goal: "Should never persist" });
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("setup-step-marker")).toBeNull();
  });

  it("Canceled Pro: the write handler blocks createPhenoHunt", async () => {
    currentEntitlement = ENTITLEMENTS.canceledPro();
    renderPage();
    await fillDraft({ goal: "Should never persist" });
    fireEvent.click(screen.getByTestId("ph-save-btn"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(createPhenoHuntMock).not.toHaveBeenCalled();
  });
});
