/**
 * Unit tests for the paddle-portal-session client (Code #6).
 *
 * Verifies the client distinguishes the "Founder Lifetime — nothing to
 * manage" error code from the generic "no active subscription" one, so the
 * UI never shows the misleading "no active paid subscription" message to a
 * lifetime-only account.
 *
 * REGRESSION GUARD: every failure here is built from a real
 * `FunctionsHttpError` wrapping a real `Response`, because that is what
 * supabase-js actually throws on a non-2xx — `error.context` IS the Response.
 * The original tests hand-rolled `{ context: { status, body } }`, an envelope
 * the library never produces, which is exactly how the `lifetime_only` branch
 * shipped as permanently dead code. Do not reintroduce the fabricated shape.
 *
 * The `status: 404` cases are load-bearing: paddle-portal-session answers 404
 * for lifetime_only AND for no_subscription, so a client that fails to read
 * the body silently falls through to the status fallback and tells a paid-up
 * Founder Lifetime customer they have no subscription.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  openPaddleCustomerPortal,
  PORTAL_LIFETIME_ONLY_MESSAGE,
  PORTAL_NO_SUBSCRIPTION_MESSAGE,
  PORTAL_UNAVAILABLE_MESSAGE,
  portalErrorMessage,
} from "@/lib/customerPortal";

/** Exactly what supabase-js hands back on a non-2xx edge-function response. */
function httpError(status: number, body: string): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(body, { status, headers: { "Content-Type": "application/json" } }),
  );
}

function jsonError(status: number, code: string): FunctionsHttpError {
  return httpError(status, JSON.stringify({ error: code }));
}

beforeEach(() => {
  invokeMock.mockReset();
  vi.stubGlobal("open", vi.fn());
});

describe("customerPortal — Code #6 lifetime_only reason", () => {
  it("reads lifetime_only off the FunctionsHttpError Response at 404 (the real server shape)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: jsonError(404, "lifetime_only") });
    const res = await openPaddleCustomerPortal();
    expect(res.ok).toBe(false);
    expect(res.code).toBe("lifetime_only");
    expect(res.error).toBe(PORTAL_LIFETIME_ONLY_MESSAGE);
    expect(res.error).not.toMatch(/no active paid subscription/i);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("reads lifetime_only at a non-404 status too (body wins, not status)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: jsonError(403, "lifetime_only") });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("lifetime_only");
    expect(res.error).toBe(PORTAL_LIFETIME_ONLY_MESSAGE);
  });

  it("does not consume the response body — the Response stays readable (proves .clone())", async () => {
    const error = jsonError(404, "lifetime_only");
    invokeMock.mockResolvedValue({ data: null, error });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("lifetime_only");
    await expect((error.context as Response).json()).resolves.toEqual({
      error: "lifetime_only",
    });
  });

  it("reads no_subscription off the body at a non-404 status (body alone drives it)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: jsonError(403, "no_subscription") });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("no_subscription");
    expect(res.error).toBe(PORTAL_NO_SUBSCRIPTION_MESSAGE);
  });

  it("legacy 404 with an empty body still maps to no_subscription (back-compat)", async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404, "") });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("no_subscription");
    expect(res.error).toBe(PORTAL_NO_SUBSCRIPTION_MESSAGE);
  });

  it("404 with a non-JSON body falls back to no_subscription, never a hard failure", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response("<html>gateway error</html>", { status: 404 })),
    });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("no_subscription");
  });

  it("unknown failures degrade to PORTAL_UNAVAILABLE_MESSAGE", async () => {
    invokeMock.mockResolvedValue({ data: null, error: jsonError(500, "unavailable") });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("unavailable");
    expect(res.error).toBe(PORTAL_UNAVAILABLE_MESSAGE);
  });

  it("an error with no context at all degrades to unavailable", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("network down") });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("unavailable");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("lifetime_only surfaced on a 2xx data payload still maps correctly", async () => {
    invokeMock.mockResolvedValue({ data: { error: "lifetime_only" }, error: null });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("lifetime_only");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("no_subscription surfaced on a 2xx data payload still maps correctly", async () => {
    invokeMock.mockResolvedValue({ data: { error: "no_subscription" }, error: null });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("no_subscription");
  });

  it("a 2xx payload with no url degrades to unavailable", async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const res = await openPaddleCustomerPortal();
    expect(res.code).toBe("unavailable");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("happy path: url opens in a new tab with noopener,noreferrer", async () => {
    invokeMock.mockResolvedValue({
      data: { url: "https://customer-portal.paddle.com/abc" },
      error: null,
    });
    const res = await openPaddleCustomerPortal();
    expect(res.ok).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      "https://customer-portal.paddle.com/abc",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("portalErrorMessage maps every code deterministically", () => {
    expect(portalErrorMessage("lifetime_only")).toBe(PORTAL_LIFETIME_ONLY_MESSAGE);
    expect(portalErrorMessage("no_subscription")).toBe(PORTAL_NO_SUBSCRIPTION_MESSAGE);
    expect(portalErrorMessage("unavailable")).toBe(PORTAL_UNAVAILABLE_MESSAGE);
  });
});
