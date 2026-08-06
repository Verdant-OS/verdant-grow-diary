/**
 * The Paddle catalog preflight must guard the credit packs, not just Craft.
 *
 * "Can a user actually buy a credit pack?" was an open unknown: the SKUs exist
 * in the allowlist and in SERVER_PRICE_CONFIG, the webhook grants them, and the
 * Buy buttons are live — but whether a matching price with
 * `external_id = credit_pack_50` / `credit_pack_150` exists in the Paddle
 * catalog was verifiable only by a human opening the dashboard. If it does not,
 * `get-paddle-price` 404s and every pack button dead-ends after the click.
 *
 * The preflight that answers exactly this question already existed; it just
 * filtered to `craft_monthly` / `craft_annual`. This pins the widened scope.
 *
 * Reads the prefixes out of the script source and applies them to the REAL
 * imported PAID_PLAN_IDS, rather than restating the expected id list — so the
 * assertion tracks the allowlist instead of drifting from it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_PACK_IDS, PAID_PLAN_IDS } from "@/lib/paidPlanAllowlist";

const SCRIPT_PATH = resolve(process.cwd(), "scripts", "verify-paddle-craft-catalog.ts");
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");

/** The guarded prefixes exactly as the script declares them. */
function guardedPrefixes(): string[] {
  const block = SCRIPT.match(/GUARDED_EXTERNAL_ID_PREFIXES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("Could not locate GUARDED_EXTERNAL_ID_PREFIXES");
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

const PREFIXES = guardedPrefixes();
const guarded = PAID_PLAN_IDS.filter((id) => PREFIXES.some((p) => id.startsWith(p)));

describe("paddle preflight guards credit packs", () => {
  it("declares a non-empty set of guarded prefixes", () => {
    // Non-triviality: an empty or unparsed prefix list would make every
    // assertion below vacuous while the preflight verifies nothing.
    expect(PREFIXES.length).toBeGreaterThan(0);
    expect(guarded.length).toBeGreaterThan(0);
  });

  it("requires every credit pack SKU", () => {
    for (const pack of CREDIT_PACK_IDS) {
      expect(
        guarded.includes(pack),
        `${pack} is sold on /pricing but the Paddle catalog preflight does not ` +
          `require it — whether a buyer can actually complete that purchase ` +
          `stays unverified until someone checks the dashboard by hand`,
      ).toBe(true);
    }
  });

  it("still requires the Craft plans it originally covered", () => {
    // Widening scope must not quietly drop the original coverage.
    expect(guarded).toContain("craft_monthly");
    expect(guarded).toContain("craft_annual");
  });

  it("requires Pro and Founder Lifetime — the flagship SKUs a prior comment wrongly claimed were covered elsewhere", () => {
    // An audit (2026-08) found no other preflight verifies these against the
    // live/sandbox Paddle catalog. Uncovered, a missing external_id here
    // means payments-webhook answers Paddle HTTP 200 on
    // missing_price_external_id with no subscriptions row written — a real
    // customer charged and granted nothing, silently, with no retry.
    for (const id of ["pro_monthly", "pro_annual", "founder_lifetime"] as const) {
      expect(
        guarded.includes(id),
        `${id} is sold on /pricing but the Paddle catalog preflight does not ` +
          `require it — a silent charge-with-no-grant on the flagship plan ` +
          `stays unverified until someone checks the dashboard by hand`,
      ).toBe(true);
    }
  });

  it("fails closed if the prefixes ever match nothing", () => {
    // A preflight that checks zero ids reports green forever, which is worse
    // than not having one. Assert the guard exists rather than restating it.
    expect(SCRIPT).toMatch(/REQUIRED_PLAN_IDS\.length === 0/);
    expect(SCRIPT).toMatch(/process\.exit\(2\)/);
  });

  it("enumerates the catalog by the same predicate it requires by", () => {
    // The coverage sweep and the required list must share one predicate;
    // otherwise an active pack price could be neither required nor reported
    // as a coverage gap.
    expect(SCRIPT).toMatch(/isGuardedExternalId\(ext\)/);
    expect(SCRIPT).toMatch(/PAID_PLAN_IDS\.filter\(isGuardedExternalId\)/);
  });
});
