/**
 * /pheno-hunts/new — empty-state CTA and deterministic candidate label
 * generation via selection order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import PhenoHuntNew from "@/pages/PhenoHuntNew";
import { defaultCandidateLabel } from "@/lib/phenoHuntService";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

// PhenoHuntNew became Pro-gated: it calls useMyEntitlements, which otherwise
// fires a real billing_subscriptions/subscriptions query the mocked supabase
// client above doesn't implement (leaking an unhandled rejection). Return a
// stable, non-loading Pro entitlement so the page renders its normal
// empty-state / candidate UI and no entitlement query runs. Async factory +
// dynamic import so the real resolver survives vi.mock hoisting.
vi.mock("@/hooks/useMyEntitlements", async () => {
  const { resolveEntitlements } = await import("@/lib/entitlements/resolveEntitlements");
  const proEntitlement = resolveEntitlements(
    {
      id: "r",
      user_id: "u1",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: "2099-01-01Z",
      cancel_at_period_end: false,
      founder_number: null,
      created_at: "",
      updated_at: "",
    },
    new Date("2026-08-01Z"),
  );
  return {
    useMyEntitlements: () => ({
      loading: false,
      entitlement: proEntitlement,
      refetch: async () => {},
    }),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mockData(plants: { id: string; name: string; strain: string | null; tent_id: string | null }[]) {
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
    if (table === "plants") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: plants, error: null }).then(res),
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
        <Route path="/grows/:id" element={<div>grow detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoHuntNew empty state", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  /** The guided stepper opens on the basics step — advance to candidates. */
  async function goToCandidatesStep() {
    await screen.findByTestId("pheno-step-basics");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByTestId("pheno-step-candidates")).toBeInTheDocument(),
    );
  }

  it("shows empty state CTA when the grow has no plants", async () => {
    mockData([]);
    renderPage();
    await goToCandidatesStep();
    const cta = (await screen.findByTestId("ph-empty-cta")) as HTMLElement;
    const anchor = cta.querySelector("a") ?? cta;
    expect(anchor.getAttribute("href")).toBe("/grows/g1");
    expect(screen.getByTestId("ph-empty").textContent).toMatch(
      /No plants in this grow yet/i,
    );
  });

  it("keeps the candidate list when plants exist", async () => {
    mockData([
      { id: "p1", name: "Plant 1", strain: "S1", tent_id: null },
      { id: "p2", name: "Plant 2", strain: "S2", tent_id: null },
    ]);
    renderPage();
    await goToCandidatesStep();
    await waitFor(() =>
      expect(screen.getByTestId("ph-plant-list")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("ph-empty")).toBeNull();
    expect(screen.getByTestId("ph-toggle-p1")).toBeInTheDocument();
    expect(screen.getByTestId("ph-toggle-p2")).toBeInTheDocument();
  });
});

describe("deterministic candidate label generation", () => {
  it("produces #1, #2, #3 based on order", () => {
    expect(defaultCandidateLabel(0)).toBe("#1");
    expect(defaultCandidateLabel(1)).toBe("#2");
    expect(defaultCandidateLabel(2)).toBe("#3");
  });

  it("is referentially deterministic across repeated calls", () => {
    const a = [0, 1, 2, 3].map(defaultCandidateLabel);
    const b = [0, 1, 2, 3].map(defaultCandidateLabel);
    expect(a).toEqual(b);
  });

  it("Set-based selection order moves a re-added id to the end", () => {
    // Mirrors the selection model used by PhenoHuntNew (Set<string>).
    const sel = new Set<string>();
    sel.add("a");
    sel.add("b");
    sel.add("c");
    sel.delete("a");
    sel.add("a");
    expect(Array.from(sel)).toEqual(["b", "c", "a"]);
    // Labels follow the resulting order.
    expect(Array.from(sel).map((_, i) => defaultCandidateLabel(i))).toEqual([
      "#1",
      "#2",
      "#3",
    ]);
  });
});
