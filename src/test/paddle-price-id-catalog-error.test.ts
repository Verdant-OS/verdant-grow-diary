/**
 * getPaddlePriceId — surfaces server-side catalog errors as a typed
 * PaddleCheckoutCatalogUnavailableError with plan-specific copy.
 *
 * Guards against the current Craft failure mode: the resolver returns a
 * sanitized `{ error: "price_resolution_unavailable" }` because the
 * PADDLE_PRICE_CRAFT_* env vars aren't set. The client must map that to a
 * calm inline message, not a generic "Failed to resolve price".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock("@/lib/paddleEnvironment", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/paddleEnvironment")>("@/lib/paddleEnvironment");
  return {
    ...actual,
    resolvePaddleCheckoutEnvironment: () => "sandbox" as const,
  };
});

import { supabase } from "@/integrations/supabase/client";
import {
  getPaddlePriceId,
  PaddleCheckoutCatalogUnavailableError,
  getPaddleCheckoutCatalogMessage,
} from "@/lib/paddle";

const invokeMock = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  invokeMock.mockReset();
});

describe("getPaddlePriceId — catalog-unavailable mapping", () => {
  it("maps a non-2xx body carrying `error: price_resolution_unavailable` to a typed catalog error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ error: "price_resolution_unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    await expect(getPaddlePriceId("craft_monthly")).rejects.toMatchObject({
      name: "PaddleCheckoutCatalogUnavailableError",
      reason: "price_resolution_unavailable",
      planId: "craft_monthly",
    });
  });

  it("maps `unknown_plan` from the error body to a typed catalog error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "unknown_plan" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("mystery_plan").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("unknown_plan");
    expect((err as PaddleCheckoutCatalogUnavailableError).message).toContain("plan");
  });

  it("maps `plan_sold_out` from the error body to a typed catalog error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "plan_sold_out" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    await expect(getPaddlePriceId("founder_lifetime")).rejects.toMatchObject({
      reason: "plan_sold_out",
    });
  });

  it("falls back to the generic error when the body is unrecognized", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "some_unexpected_code" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).not.toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as Error).message).toBe("Failed to resolve price: pro_monthly");
  });

  it("returns the paddleId on success", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { paddleId: "pri_abc123" },
      error: null,
    });
    await expect(getPaddlePriceId("pro_monthly")).resolves.toBe("pri_abc123");
  });

  it("catalog copy is plan-agnostic and never exposes env var names or reason codes", () => {
    for (const reason of [
      "unknown_plan",
      "price_not_configured",
      "price_resolution_unavailable",
      "plan_sold_out",
    ] as const) {
      const msg = getPaddleCheckoutCatalogMessage(reason);
      expect(msg).not.toMatch(/PADDLE_PRICE_/);
      expect(msg).not.toMatch(/env(ironment)? var/i);
      expect(msg).not.toMatch(reason);
    }
  });
});
