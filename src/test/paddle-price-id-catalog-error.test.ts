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
  type PaddleCheckoutCatalogReason,
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

  it("maps an unspendable pack refusal to calm paid-plan guidance", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "pack_requires_monthly_plan" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("credit_pack_50").catch((error) => error);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect(err).toMatchObject({
      reason: "pack_requires_monthly_plan",
      planId: "credit_pack_50",
    });
    expect((err as Error).message).toMatch(/monthly AI allowance/i);
  });

  // RENEGOTIATED PIN (CHECKOUT_PRICE_ERROR_TRUTH). This case previously
  // asserted the bare `Error("Failed to resolve price: pro_monthly")`, which
  // routed the grower through usePaddleCheckout's destructive-toast branch
  // and emitted NO checkout_catalog_unavailable telemetry. An unrecognized
  // body on a 5xx is a resolver/gateway outage, not an unknown condition:
  // it is now classified so the calm inline path — and its telemetry — runs.
  // The pin is kept, inverted, rather than deleted, so the old behaviour
  // cannot silently return.
  it("classifies an unrecognized 5xx body as a gateway outage, not a generic error", async () => {
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
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_gateway_unavailable");
    expect((err as Error).message).not.toBe("Failed to resolve price: pro_monthly");
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
      "pack_requires_monthly_plan",
    ] as const) {
      const msg = getPaddleCheckoutCatalogMessage(reason);
      expect(msg).not.toMatch(/PADDLE_PRICE_/);
      expect(msg).not.toMatch(/env(ironment)? var/i);
      expect(msg).not.toMatch(reason);
    }
  });
});

/**
 * Distinct fail-closed branches (CHECKOUT_PRICE_ERROR_TRUTH).
 *
 * MEASURED on live ef7cec68: a Pro Monthly click showed the generic
 * "checkout couldn't open" recovery copy while get-paddle-price answered
 * 502; an earlier pin saw 401 auth_required. Both collapsed into the same
 * bare `Error("Failed to resolve price: ...")`, so the grower could not
 * tell "sign in again" from "wait and retry" from "this plan isn't set up",
 * and the destructive-toast branch emitted NO checkout_catalog_unavailable
 * telemetry at all — the failure was invisible in the funnel.
 *
 * The contract these tests pin: EVERY resolver failure is fail-closed AND
 * classified into a distinct, non-sensitive reason token, so the hook's
 * calm inline path (which is what emits the telemetry) always runs.
 */
describe("getPaddlePriceId — every failure is classified, never generic", () => {
  it("maps the resolver's own 401 auth_required body to the auth branch", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ error: "auth_required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect(err).toMatchObject({ reason: "auth_required", planId: "pro_monthly" });
  });

  it("classifies a platform 401 whose body is NOT our contract as the auth branch", async () => {
    // The gateway rejects the JWT before the function runs, so the body is
    // the platform's shape ({ code, message }), not our { error } envelope.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ code: 401, message: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("auth_required");
  });

  it("classifies a 502 with a non-JSON gateway body as the gateway branch, not auth or config", async () => {
    // This is the MEASURED case: an HTML/empty 502 from above the function,
    // so there is no sanitized `error` code to read.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: "FunctionsHttpError",
        context: new Response("<html><body>Bad Gateway</body></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_gateway_unavailable");
  });

  it("classifies a transport failure with no HTTP response as the request branch", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_request_failed");
  });

  // Coverage gap closed alongside this change: paddle.ts reads a reason off
  // the `data` body as well as off `error.context`, and no test in the repo
  // exercised the `data` path. Defensive rather than live — the resolver
  // proves a non-empty paddleId before its only 200 — but it is a real
  // branch in the classifier, so it is pinned rather than assumed.
  it("reads a server reason off a 2xx body when there is no invoke error", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "price_not_configured" }, error: null });

    const err = await getPaddlePriceId("craft_annual").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect(err).toMatchObject({ reason: "price_not_configured", planId: "craft_annual" });
  });

  it("ignores a client-classified reason claimed by a response body", async () => {
    // The resolver never emits these; honouring one off the wire would let
    // an upstream pick which message the grower reads.
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "price_request_failed" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_gateway_unavailable");
  });

  it("classifies a 2xx that carries no paddleId as an unusable response", async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(PaddleCheckoutCatalogUnavailableError);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_response_unusable");
  });

  it("classifies an unrecognized 4xx body as an unusable response, not a gateway outage", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    const err = await getPaddlePriceId("pro_monthly").catch((e) => e);
    expect((err as PaddleCheckoutCatalogUnavailableError).reason).toBe("price_response_unusable");
  });

  it("fails closed on every branch — no failure ever resolves a price id", async () => {
    const failures = [
      { data: null, error: { context: new Response("", { status: 401 }) } },
      { data: null, error: { context: new Response("", { status: 502 }) } },
      { data: null, error: { context: new TypeError("offline") } },
      { data: {}, error: null },
      { data: { paddleId: "" }, error: null },
    ];
    for (const outcome of failures) {
      invokeMock.mockResolvedValueOnce(outcome);
      await expect(getPaddlePriceId("pro_monthly")).rejects.toBeInstanceOf(
        PaddleCheckoutCatalogUnavailableError,
      );
    }
  });
});

describe("catalog copy — auth, gateway and config tell the grower different things", () => {
  const AUTH = getPaddleCheckoutCatalogMessage("auth_required");
  const GATEWAY = getPaddleCheckoutCatalogMessage("price_gateway_unavailable");
  const REQUEST = getPaddleCheckoutCatalogMessage("price_request_failed");
  const UNUSABLE = getPaddleCheckoutCatalogMessage("price_response_unusable");
  const CONFIG = getPaddleCheckoutCatalogMessage("price_not_configured");

  it("gives auth, gateway and missing-config three different messages", () => {
    expect(new Set([AUTH, GATEWAY, CONFIG]).size).toBe(3);
  });

  it("every reason's copy is unique, so no two failures read alike", () => {
    const reasons: readonly PaddleCheckoutCatalogReason[] = [
      "unknown_plan",
      "price_not_configured",
      "price_resolution_unavailable",
      "plan_sold_out",
      "pack_requires_monthly_plan",
      "auth_required",
      "price_gateway_unavailable",
      "price_request_failed",
      "price_response_unusable",
    ];
    const copies = reasons.map((r) => getPaddleCheckoutCatalogMessage(r));
    expect(new Set(copies).size).toBe(reasons.length);
  });

  it("tells a signed-out grower to sign in, and never says that for a gateway failure", () => {
    expect(AUTH).toMatch(/sign in/i);
    expect(GATEWAY).not.toMatch(/sign in/i);
    expect(REQUEST).not.toMatch(/sign in/i);
    expect(CONFIG).not.toMatch(/sign in/i);
  });

  it("reassures the grower that a failed resolve charged nothing", () => {
    for (const copy of [GATEWAY, REQUEST, UNUSABLE]) {
      expect(copy).toMatch(/nothing was charged/i);
    }
  });

  it("new branch copy leaks no reason token, env var name, or status code", () => {
    for (const reason of [
      "auth_required",
      "price_gateway_unavailable",
      "price_request_failed",
      "price_response_unusable",
    ] as const) {
      const msg = getPaddleCheckoutCatalogMessage(reason);
      expect(msg).not.toMatch(/PADDLE_PRICE_/);
      expect(msg).not.toMatch(/env(ironment)? var/i);
      expect(msg).not.toMatch(reason);
      expect(msg).not.toMatch(/\b(401|403|404|500|502|503)\b/);
      expect(msg).not.toMatch(/token|JWT|Paddle\b/i);
    }
  });
});
