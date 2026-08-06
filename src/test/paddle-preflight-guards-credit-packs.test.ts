/**
 * The Paddle catalog preflight must require the FULL paid-plan allowlist —
 * every credit pack, not just Craft, and with no prefix-filtered subset to
 * fall out of sync with it.
 *
 * History: "Can a user actually buy a credit pack?" was an open unknown —
 * the SKUs exist in the allowlist and in SERVER_PRICE_CONFIG, the webhook
 * grants them, and the Buy buttons are live — but whether a matching price
 * with `external_id = credit_pack_50` / `credit_pack_150` exists in the
 * Paddle catalog was verifiable only by a human opening the dashboard. The
 * preflight that answers exactly this question already existed; it just
 * filtered to `craft_monthly` / `craft_annual`.
 *
 * A first widening filtered REQUIRED_PLAN_IDS down to ids matching
 * GUARDED_EXTERNAL_ID_PREFIXES — which reintroduced the exact same drift
 * class one layer down: a PAID_PLAN_IDS entry added under a prefix nobody
 * remembered to add to that second list would be silently unverified while
 * the preflight still reported green (flagged in review on PR #762). The
 * fix requires the whole PAID_PLAN_IDS allowlist directly, with no second
 * list to drift from it. GUARDED_EXTERNAL_ID_PREFIXES still exists, but
 * only for the catalog-coverage scan's opposite-direction check (a plan
 * created in the Paddle dashboard that the allowlist doesn't know about
 * yet) — see verify-paddle-craft-catalog.ts for the full explanation.
 *
 * The script has no exported function to import and re-check (it's a bare
 * CLI entrypoint that calls process.exit), so these assertions read its
 * source text directly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_PACK_IDS, PAID_PLAN_IDS } from "@/lib/paidPlanAllowlist";

const SCRIPT_PATH = resolve(process.cwd(), "scripts", "verify-paddle-craft-catalog.ts");
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");

describe("paddle preflight requires the full paid-plan allowlist", () => {
  it("assigns REQUIRED_PLAN_IDS from the unfiltered PAID_PLAN_IDS import, not a prefix-filtered subset", () => {
    // This is the actual guarantee: every PAID_PLAN_IDS entry is required,
    // regardless of what prefix it happens to use. A prefix-filtered
    // derivation here is exactly the bug this test guards against.
    expect(SCRIPT).toMatch(/REQUIRED_PLAN_IDS:\s*readonly string\[\]\s*=\s*PAID_PLAN_IDS\s*;/);
    expect(SCRIPT).not.toMatch(/REQUIRED_PLAN_IDS[^=\n]*=\s*PAID_PLAN_IDS\.filter\(/);
  });

  it("requires every credit pack SKU", () => {
    for (const pack of CREDIT_PACK_IDS) {
      expect(
        PAID_PLAN_IDS.includes(pack),
        `${pack} is sold on /pricing but missing from PAID_PLAN_IDS — whether a ` +
          `buyer can actually complete that purchase stays unverified until ` +
          `someone checks the dashboard by hand`,
      ).toBe(true);
    }
  });

  it("still requires the Craft plans it originally covered", () => {
    // Widening scope must not quietly drop the original coverage.
    expect(PAID_PLAN_IDS).toContain("craft_monthly");
    expect(PAID_PLAN_IDS).toContain("craft_annual");
  });

  it("requires Pro and Founder Lifetime — the flagship SKUs a prior comment wrongly claimed were covered elsewhere", () => {
    // An audit (2026-08) found no other preflight verifies these against the
    // live/sandbox Paddle catalog. Uncovered, a missing external_id here
    // means payments-webhook answers Paddle HTTP 200 on
    // missing_price_external_id with no subscriptions row written — a real
    // customer charged and granted nothing, silently, with no retry.
    for (const id of ["pro_monthly", "pro_annual", "founder_lifetime"] as const) {
      expect(
        PAID_PLAN_IDS.includes(id),
        `${id} is sold on /pricing but missing from PAID_PLAN_IDS — a silent ` +
          `charge-with-no-grant on the flagship plan stays unverified until ` +
          `someone checks the dashboard by hand`,
      ).toBe(true);
    }
  });

  it("fails closed if the allowlist is ever emptied", () => {
    // A preflight that checks zero ids reports green forever, which is worse
    // than not having one. Assert the guard exists rather than restating it.
    expect(SCRIPT).toMatch(/REQUIRED_PLAN_IDS\.length === 0/);
    expect(SCRIPT).toMatch(/process\.exit\(2\)/);
  });

  it("keeps GUARDED_EXTERNAL_ID_PREFIXES scoped to catalog-coverage discovery, not to what's required", () => {
    // isGuardedExternalId still exists and is still used by the
    // dashboard-drift scan (discoverActiveCraftExternalIds) — that's a
    // legitimate, separate check in the opposite direction from
    // REQUIRED_PLAN_IDS. What it must NOT do is gate REQUIRED_PLAN_IDS
    // itself, which the first test above asserts directly.
    expect(SCRIPT).toMatch(/GUARDED_EXTERNAL_ID_PREFIXES\s*=\s*\[/);
    expect(SCRIPT).toMatch(/isGuardedExternalId\(ext\)/);
  });
});
