/**
 * Phase 2b hardening — server-authoritative billing environment.
 *
 * Verifies that `resolveServerBillingEnvironment` in the shared server
 * helper NEVER trusts client-provided billing_env and derives the
 * expected environment from server-side config only.
 *
 * The helper lives in a Deno edge-function module, so we import it via
 * relative path and inject a `getEnv` shim to simulate server env.
 */
import { describe, it, expect } from "vitest";
import {
  resolveRequiredServerBillingEnvironment,
  resolveServerBillingEnvironment,
} from "../../supabase/functions/_shared/unionEntitlementLookup.ts";

function envFrom(map: Record<string, string | undefined>) {
  return (name: string) => map[name];
}

describe("resolveServerBillingEnvironment (server-authoritative)", () => {
  it("returns 'live' when PAYMENTS_ENVIRONMENT=live", () => {
    expect(resolveServerBillingEnvironment(envFrom({ PAYMENTS_ENVIRONMENT: "live" }))).toBe("live");
  });

  it("returns 'sandbox' when PAYMENTS_ENVIRONMENT=sandbox", () => {
    expect(resolveServerBillingEnvironment(envFrom({ PAYMENTS_ENVIRONMENT: "sandbox" }))).toBe(
      "sandbox",
    );
  });

  it("derives live from PADDLE_LIVE_API_KEY alone", () => {
    expect(resolveServerBillingEnvironment(envFrom({ PADDLE_LIVE_API_KEY: "k" }))).toBe("live");
  });

  it("derives sandbox from PADDLE_SANDBOX_API_KEY alone", () => {
    expect(resolveServerBillingEnvironment(envFrom({ PADDLE_SANDBOX_API_KEY: "k" }))).toBe(
      "sandbox",
    );
  });

  it("defaults conservatively to sandbox when ambiguous / unset", () => {
    expect(resolveServerBillingEnvironment(envFrom({}))).toBe("sandbox");
    expect(
      resolveServerBillingEnvironment(
        envFrom({ PADDLE_LIVE_API_KEY: "k", PADDLE_SANDBOX_API_KEY: "k" }),
      ),
    ).toBe("sandbox");
  });

  it("ignores invalid PAYMENTS_ENVIRONMENT values", () => {
    expect(resolveServerBillingEnvironment(envFrom({ PAYMENTS_ENVIRONMENT: "prod" }))).toBe(
      "sandbox",
    );
  });

  // Spoofing surface: the resolver takes NO request-derived input, so a
  // caller cannot pass body/query params here. This test documents the
  // invariant at the type/signature level.
  it("has no request-body input surface (spoof-proof by construction)", () => {
    expect(resolveServerBillingEnvironment.length).toBeLessThanOrEqual(1);
  });
});

describe("resolveRequiredServerBillingEnvironment (cost-bearing AI)", () => {
  it.each(["live", "sandbox"] as const)("accepts explicit %s", (environment) => {
    expect(
      resolveRequiredServerBillingEnvironment(
        envFrom({
          PAYMENTS_ENVIRONMENT: environment,
          PADDLE_LIVE_API_KEY: "live-key",
          PADDLE_SANDBOX_API_KEY: "sandbox-key",
        }),
      ),
    ).toEqual({ ok: true, environment });
  });

  it("rejects an invalid explicit value", () => {
    expect(
      resolveRequiredServerBillingEnvironment(envFrom({ PAYMENTS_ENVIRONMENT: "prod" })),
    ).toEqual({ ok: false, reason: "payments_environment_invalid" });
  });

  it("rejects a missing selector even when exactly one Paddle key exists", () => {
    expect(
      resolveRequiredServerBillingEnvironment(envFrom({ PADDLE_SANDBOX_API_KEY: "key" })),
    ).toEqual({ ok: false, reason: "payments_environment_missing" });
  });

  it.each([
    ["both", { PADDLE_LIVE_API_KEY: "live-key", PADDLE_SANDBOX_API_KEY: "sandbox-key" }],
    ["neither", {}],
  ])("rejects missing selector with %s-key ambiguity", (_label, env) => {
    expect(resolveRequiredServerBillingEnvironment(envFrom(env))).toEqual({
      ok: false,
      reason: "paddle_key_configuration_ambiguous",
    });
  });

  it("has no request-body input surface", () => {
    expect(resolveRequiredServerBillingEnvironment.length).toBeLessThanOrEqual(1);
  });
});
