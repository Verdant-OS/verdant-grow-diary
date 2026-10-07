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

  // Fail closed (grant-path audit, 2026-10-03): only an explicit selector is
  // trusted. Everything else resolves to "live", so the entitlement loader
  // honours only live rows and sandbox rows never entitle (AGENTS.md:
  // sandbox rows grant only when PAYMENTS_ENVIRONMENT=sandbox is explicit).
  it.each([
    ["unset, no keys", {}],
    ["unset, both keys", { PADDLE_LIVE_API_KEY: "k", PADDLE_SANDBOX_API_KEY: "k" }],
    ["unset, sandbox key only", { PADDLE_SANDBOX_API_KEY: "k" }],
    ["unset, live key only", { PADDLE_LIVE_API_KEY: "k" }],
    ["invalid selector", { PAYMENTS_ENVIRONMENT: "prod", PADDLE_SANDBOX_API_KEY: "k" }],
    ["selector differing only in case", { PAYMENTS_ENVIRONMENT: "Sandbox" }],
    ["empty selector", { PAYMENTS_ENVIRONMENT: "", PADDLE_SANDBOX_API_KEY: "k" }],
  ])("never resolves sandbox from an inferred setting (%s)", (_label, env) => {
    expect(resolveServerBillingEnvironment(envFrom(env))).toBe("live");
  });

  it("keeps an explicit selector even when the opposite key is the only one present", () => {
    expect(
      resolveServerBillingEnvironment(
        envFrom({ PAYMENTS_ENVIRONMENT: "sandbox", PADDLE_LIVE_API_KEY: "k" }),
      ),
    ).toBe("sandbox");
    expect(
      resolveServerBillingEnvironment(
        envFrom({ PAYMENTS_ENVIRONMENT: "live", PADDLE_SANDBOX_API_KEY: "k" }),
      ),
    ).toBe("live");
  });

  it("agrees with the strict resolver whenever the strict resolver resolves", () => {
    for (const env of [
      { PAYMENTS_ENVIRONMENT: "live" },
      { PAYMENTS_ENVIRONMENT: "sandbox" },
      { PAYMENTS_ENVIRONMENT: "sandbox", PADDLE_LIVE_API_KEY: "k", PADDLE_SANDBOX_API_KEY: "k" },
    ]) {
      const strict = resolveRequiredServerBillingEnvironment(envFrom(env));
      expect(strict.ok).toBe(true);
      if (strict.ok) expect(resolveServerBillingEnvironment(envFrom(env))).toBe(strict.environment);
    }
  });

  it("is deterministic for the same configuration", () => {
    const env = envFrom({ PADDLE_SANDBOX_API_KEY: "k" });
    expect(resolveServerBillingEnvironment(env)).toBe(resolveServerBillingEnvironment(env));
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
