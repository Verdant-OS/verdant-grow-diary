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
import { PAID_PLAN_IDS, buildPaidPlanAllowlistSourceRegex } from "@/lib/paidPlanAllowlist";

const SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/get-paddle-price/index.ts"),
  "utf8",
);
const CONFIG = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("get-paddle-price — paid plan allowlist", () => {
  it("imports PAID_PLAN_ALLOWLIST from the single-source-of-truth module", () => {
    // Drift guard: the edge function must NOT redeclare its own allowlist.
    // Anyone re-adding a local `const PAID_PLAN_ALLOWLIST = new Set([...])`
    // would let plan ids drift again — the exact bug this refactor closes.
    expect(SRC).toMatch(
      /from\s+["']@\/lib\/paidPlanAllowlist["']|from\s+["'][^"']*_shared\/lib\/lib\/paidPlanAllowlist(?:\.ts)?["']/,
    );
    expect(stripped).not.toMatch(/const\s+PAID_PLAN_ALLOWLIST\s*(?::\s*[^=]+)?=\s*new Set\(/);
    expect(SRC).toMatch(/PAID_PLAN_ALLOWLIST\.has\(requested\)/);
    expect(SRC).toMatch(/unknown_plan/);
    expect(stripped).not.toMatch(/\[a-z0-9_\]\{1,64\}/);
  });

  it("shared PAID_PLAN_IDS contains the exact paid-plan universe in the pinned order", () => {
    // If this ever changes, the intent must be reviewed here — not silently
    // in the edge function or a webhook file.
    expect([...PAID_PLAN_IDS]).toEqual([
      "pro_monthly",
      "pro_annual",
      "craft_monthly",
      "craft_annual",
      "founder_lifetime",
      "credit_pack_50",
      "credit_pack_150",
    ]);
  });

  it("the shared allowlist regex still matches the mirrored source (recurring paid plans)", () => {
    // Recurring paid plans (excludes founder_lifetime and credit packs) —
    // the assertion that historically caught Craft's absence.
    const recurring = ["pro_monthly", "pro_annual", "craft_monthly", "craft_annual"];
    const mirrorPath = resolve(
      process.cwd(),
      "supabase/functions/_shared/lib/lib/paidPlanAllowlist.ts",
    );
    const mirrored = readFileSync(mirrorPath, "utf8");
    expect(mirrored).toMatch(buildPaidPlanAllowlistSourceRegex(recurring));
    // And the full pinned order round-trips through the builder too.
    expect(mirrored).toMatch(buildPaidPlanAllowlistSourceRegex());
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

  it("H1 (audit fix): the blanket live_billing_not_enabled 409 is removed so live checkout can settle", () => {
    // The Lovable webhook path (payments-webhook + allocate_lovable_founder_lifetime)
    // now handles both environments and enforces the founder cap atomically,
    // so the previous blanket live refusal is no longer correct.
    expect(stripped).not.toMatch(/if \(environment === 'live'\)/);
    expect(SRC).not.toMatch(/live_billing_not_enabled/);
  });
});

describe("get-paddle-price — founder sold-out pre-check (before payment)", () => {
  it("founder_lifetime availability is checked via the aggregate RPC before any price is returned", () => {
    // Quote-agnostic: prettier normalizes edge functions to double quotes.
    expect(SRC).toMatch(/requested === ["']founder_lifetime["']/);
    expect(SRC).toMatch(/supabase\.rpc\(\s*["']founder_lifetime_slots_remaining["'],?\s*\)/);
    expect(SRC).toMatch(/plan_sold_out/);
  });

  it("fails closed: RPC error blocks checkout, and a non-number or <=0 count is sold out", () => {
    expect(stripped).toMatch(/if \(capError\) \{/);
    expect(stripped).toMatch(/typeof remaining !== ["']number["'] \|\| remaining <= 0/);
    // The pre-check happens BEFORE the gateway price fetch in source order,
    // so a sold-out founder plan can never reach checkout pricing at all.
    const soldOutIdx = stripped.indexOf("plan_sold_out");
    const gatewayIdx = stripped.indexOf("await gatewayFetch(");
    expect(soldOutIdx).toBeGreaterThan(-1);
    expect(soldOutIdx).toBeLessThan(gatewayIdx);
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
