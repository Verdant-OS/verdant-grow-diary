/**
 * When the Stripe provider is selected, usePaddleCheckout must not consume a
 * Pro plan intent. Stripe resume owns that intent.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/config/checkoutProvider", () => ({
  PRO_CHECKOUT_PROVIDER: "stripe",
  resolveProCheckoutProvider: () => "stripe",
}));
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "grower@example.com" }, loading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/paddle", () => {
  class PaddleCheckoutUnavailableError extends Error {}
  class PaddleCheckoutCatalogUnavailableError extends Error {}
  return {
    PaddleCheckoutUnavailableError,
    PaddleCheckoutCatalogUnavailableError,
    resolvePaddleCheckout: () => "sandbox",
    getCheckoutUnavailableMessage: () => null,
    initializePaddle: vi.fn(async () => {}),
    getPaddlePriceId: vi.fn(async (id: string) => `pri_${id}`),
  };
});

import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { getPaddlePriceId } from "@/lib/paddle";
import { CHECKOUT_PLAN_INTENT_STORAGE_KEY, savePlanIntent } from "@/lib/checkoutPlanIntent";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Stripe Pro intent is not resumed by Paddle", () => {
  it("leaves the saved Pro plan in place", async () => {
    expect(savePlanIntent("pro_annual")).toBe(true);
    renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toContain("pro_annual");
    expect(getPaddlePriceId).not.toHaveBeenCalled();
  });
});
