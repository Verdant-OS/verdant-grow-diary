/**
 * Pheno Hunt new — grow-scoped navigation render pins.
 *
 * Follow-up to grow-detail-secondary-nav (#1608) and BreedingLogNew nav pins (#1611).
 * Grow Detail wires `/pheno-hunts/new?growId=`; these pins prove the wizard keeps
 * that grow on header back, empty-plant CTA, and cancel. Fail closed: missing or
 * blank growId stays on bare `/grows`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const from = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useMyEntitlements", async () => {
  const { resolveEntitlements } = await import("@/lib/entitlements/resolveEntitlements");
  const proEntitlement = resolveEntitlements(
    {
      id: "r",
      user_id: "user-1",
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
    },
    new Date("2026-08-01T00:00:00Z"),
  );
  return {
    useMyEntitlements: () => ({
      loading: false,
      lookupFailed: false,
      entitlement: proEntitlement,
      refetch: async () => {},
    }),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PhenoHuntNew from "@/pages/PhenoHuntNew";

function hrefForLink(name: string | RegExp): string | null {
  const link = screen.getByRole("link", { name });
  return link.getAttribute("href");
}

function mockSupabaseWithGrow(
  plants: Array<{ id: string; name: string; strain: string | null; tent_id: string | null }>,
) {
  from.mockReset().mockImplementation((table: string) => {
    if (table === "tents") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: "tent-1" }], error: null }).then(res),
      } as unknown as PromiseLike<unknown> & Record<string, unknown>;
      return builder;
    }
    if (table === "grows") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: GROW, name: "North Tent Grow" },
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
        or: () => builder,
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: plants, error: null }).then(res),
      } as unknown as PromiseLike<unknown> & Record<string, unknown>;
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

function renderHuntNew(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhenoHuntNew />
    </MemoryRouter>,
  );
}

async function goToCandidatesStep() {
  await screen.findByTestId("pheno-step-basics");
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await waitFor(() => expect(screen.getByTestId("pheno-step-candidates")).toBeInTheDocument());
}

describe("PhenoHuntNew grow-scoped navigation", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("header Back to grow retains growId when ?growId= is present", async () => {
    mockSupabaseWithGrow([{ id: "plant-1", name: "Mother", strain: "S1", tent_id: "tent-1" }]);
    renderHuntNew(`/pheno-hunts/new?growId=${GROW}`);

    await screen.findByTestId("pheno-hunt-onboarding");
    expect(hrefForLink(/Back to grow/i)).toBe(`/grows/${GROW}`);
  });

  it("empty-plant CTA links back to the scoped grow", async () => {
    mockSupabaseWithGrow([]);
    renderHuntNew(`/pheno-hunts/new?growId=${GROW}`);

    await screen.findByTestId("pheno-hunt-onboarding");
    await goToCandidatesStep();
    const cta = await screen.findByTestId("ph-empty-cta");
    expect(cta).toHaveAttribute("href", `/grows/${GROW}`);
  });

  it("Cancel link returns to the scoped grow detail", async () => {
    mockSupabaseWithGrow([{ id: "plant-1", name: "Mother", strain: "S1", tent_id: "tent-1" }]);
    renderHuntNew(`/pheno-hunts/new?growId=${GROW}`);

    await screen.findByTestId("pheno-hunt-onboarding");
    expect(hrefForLink(/^Cancel$/)).toBe(`/grows/${GROW}`);
  });

  it("fail-closed without growId keeps Back to My Grows on bare /grows", async () => {
    from.mockReset();
    renderHuntNew("/pheno-hunts/new");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/Back to My Grows/i)).toBe("/grows");
  });

  it("fail-closed: empty growId query stays on /grows", async () => {
    from.mockReset();
    renderHuntNew("/pheno-hunts/new?growId=");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/Back to My Grows/i)).toBe("/grows");
  });

  it("fail-closed: whitespace growId does not invent a grow", async () => {
    from.mockReset().mockImplementation((table: string) => {
      if (table === "tents") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(res),
        } as unknown as PromiseLike<unknown> & Record<string, unknown>;
        return builder;
      }
      if (table === "grows") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "plants") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          or: () => builder,
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(res),
        } as unknown as PromiseLike<unknown> & Record<string, unknown>;
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    renderHuntNew("/pheno-hunts/new?growId=%20");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/Back to My Grows/i)).toBe("/grows");
  });
});
