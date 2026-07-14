/**
 * get-paddle-price hardening contract (paid-launch gate).
 *
 * Static source assertions in the repo's server-enforcement style: the
 * function must require a verified user, accept only the paid plan
 * allowlist, select environment server-side (never from the browser),
 * return only the resolved public price id, and sanitize every error.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
  "utf8",
);
const CONFIG = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("get-paddle-price — paid plan allowlist", () => {
  it("accepts exactly pro_monthly, pro_annual, founder_lifetime", () => {
    expect(SRC).toMatch(/PAID_PLAN_ALLOWLIST[\s\S]{0,120}'pro_monthly',\s*'pro_annual',\s*'founder_lifetime',/);
    expect(SRC).toMatch(/PAID_PLAN_ALLOWLIST\.has\(requested\)/);
    // Fail-closed branch for anything outside the allowlist.
    expect(SRC).toMatch(/unknown_plan/);
    // The old permissive snake_case regex is gone.
    expect(stripped).not.toMatch(/\[a-z0-9_\]\{1,64\}/);
  });
});

describe("get-paddle-price — verified user required", () => {
  it("re-verifies the caller via auth.getUser with the anon key (no service_role)", () => {
    expect(SRC).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(SRC).toMatch(/SUPABASE_ANON_KEY/);
    expect(stripped).not.toMatch(/SERVICE_ROLE/i);
    expect(SRC).toMatch(/auth_required/);
  });

  it("config.toml pins verify_jwt = true for the function", () => {
    expect(CONFIG).toMatch(/\[functions\.get-paddle-price\]\s*\n\s*verify_jwt = true/);
  });
});

describe("get-paddle-price — server-controlled environment", () => {
  it("uses resolveServerBillingEnvironment and never reads a browser environment field", () => {
    expect(SRC).toMatch(/resolveServerBillingEnvironment\(\)/);
    expect(stripped).not.toMatch(/body\??\.environment/);
  });
});

describe("get-paddle-price — sanitized output", () => {
  it("returns only the resolved paddleId on success", () => {
    expect(SRC).toMatch(/json\(200, \{ paddleId \}\)/);
  });

  it("never surfaces upstream error text or echoes unexpected input", () => {
    expect(stripped).not.toMatch(/err instanceof Error/);
    expect(stripped).not.toMatch(/err\.message|error\.message/);
    expect(stripped).not.toMatch(/Price not found: \$\{/);
    for (const constant of [
      "price_resolution_unavailable",
      "price_not_configured",
      "method_not_allowed",
    ]) {
      expect(SRC).toContain(constant);
    }
  });

  it("never exposes keys, secrets, or the gateway wiring in responses", () => {
    // Responses are built only via the json() helper with constant error ids.
    const responseBodies = [...stripped.matchAll(/json\(\d+, \{ ([^}]*) \}\)/g)].map((m) => m[1]);
    expect(responseBodies.length).toBeGreaterThan(4);
    for (const body of responseBodies) {
      expect(body).not.toMatch(/key|secret|token|gateway|Authorization/i);
    }
  });
});

describe("webhook receivers — JWT posture pinned", () => {
  it("paddle-webhook and payments-webhook are declared verify_jwt = false", () => {
    expect(CONFIG).toMatch(/\[functions\.paddle-webhook\]\s*\n\s*verify_jwt = false/);
    expect(CONFIG).toMatch(/\[functions\.payments-webhook\]\s*\n\s*verify_jwt = false/);
  });
});
