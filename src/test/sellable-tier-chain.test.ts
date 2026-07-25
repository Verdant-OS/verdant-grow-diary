/**
 * sellable-tier chain — every purchasable id must be handled, exactly once,
 * at every layer between "we take the money" and "we grant the thing".
 *
 * Motivated by Craft, which was marketed and priced while being broken at FOUR
 * independent layers: the checkout price allow-list, the server price config,
 * the webhook's subscription-persistence allow-list, and three entitlement
 * gates. Each was found separately, days apart, and fixing one made the next
 * one's absence *less* visible rather than more — a plan that reaches checkout
 * but is skipped by the webhook is charged-and-granted-nothing, which is worse
 * than being unbuyable.
 *
 * `src/lib/paidPlanAllowlist.ts` declares itself the single source of truth and
 * says every consumer MUST derive from it. Two consumers now do. The webhook's
 * `KNOWN_PRICE_IDS` is still hand-maintained, so this test is what stands
 * between that list and silent divergence.
 *
 * Read as text rather than imported: these are Deno edge modules with `npm:`
 * specifiers that vitest cannot resolve. The same static-scan technique the
 * repo already uses for migration SQL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAID_PLAN_IDS } from "@/lib/paidPlanAllowlist";

function edgeSource(...segments: string[]): string {
  return readFileSync(resolve(process.cwd(), "supabase", "functions", ...segments), "utf8");
}

/**
 * Ids inside a bracketed/braced literal, matched against the known universe.
 *
 * Handles both shapes these files actually use: quoted array members
 * (`"pro_monthly",`) and BARE object keys (`pro_monthly: Deno.env.get(...)`).
 * Missing the bare-key form silently yielded empty sets, which would have made
 * the assertions vacuously true — caught only by the non-triviality guard below.
 *
 * The trailing `\s*:` on the bare-key form also prevents prefix collisions:
 * `credit_pack_50` cannot match inside `credit_pack_500`, because the next
 * character there is `0`, not a colon.
 */
function idsInBlock(block: string): Set<string> {
  const found = new Set<string>();
  for (const id of PAID_PLAN_IDS) {
    const quoted = block.includes(`"${id}"`) || block.includes(`'${id}'`);
    const bareKey = new RegExp(`(^|[\\s,{])${id}\\s*:`, "m").test(block);
    if (quoted || bareKey) found.add(id);
  }
  return found;
}

function extract(source: string, pattern: RegExp, label: string): Set<string> {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not locate ${label}`);
  return idsInBlock(match[1]);
}

const WEBHOOK = edgeSource("payments-webhook", "eventProcessor.ts");
const PRICE_FN = edgeSource("get-paddle-price", "index.ts");

/** Subscription plans: a match here writes a `subscriptions` row. */
const knownPriceIds = extract(WEBHOOK, /KNOWN_PRICE_IDS[^=]*=\s*\[([\s\S]*?)\]/, "KNOWN_PRICE_IDS");
/** One-time SKUs: a match here grants credits and must NEVER grant a plan. */
const creditPackIds = extract(
  WEBHOOK,
  /CREDIT_PACK_CREDITS[^=]*=\s*\{([\s\S]*?)\}/,
  "CREDIT_PACK_CREDITS",
);
/** Server-side price resolution: checkout cannot open without an entry. */
const serverPriceConfigIds = extract(
  PRICE_FN,
  /SERVER_PRICE_CONFIG[^=]*=\s*\{([\s\S]*?)\n\};/,
  "SERVER_PRICE_CONFIG",
);

const sorted = (s: Iterable<string>) => [...s].sort();

describe("sellable-tier chain", () => {
  it("resolves a server price for every purchasable id", () => {
    // Without an entry here `get-paddle-price` returns unknown_plan/price_not_
    // configured and checkout never opens — the plan is advertised but unbuyable.
    for (const id of PAID_PLAN_IDS) {
      expect(
        serverPriceConfigIds.has(id),
        `${id} is purchasable but SERVER_PRICE_CONFIG has no entry — checkout cannot open for it`,
      ).toBe(true);
    }
  });

  it("handles every purchasable id at the webhook, exactly once", () => {
    // The union must be exhaustive: an id in NEITHER list is skipped as
    // `unknown_price_id`, so the payment succeeds, nothing is written, and
    // Paddle still receives a 200. That is the charged-and-granted-nothing
    // path, and it is silent.
    const handled = new Set([...knownPriceIds, ...creditPackIds]);
    expect(sorted(handled)).toEqual(sorted(PAID_PLAN_IDS));
  });

  it("never lets a one-time pack resolve to a subscription plan", () => {
    // A $9 credit purchase granting Pro would be a revenue and trust failure.
    // Both edge modules call this out in prose; this asserts it.
    for (const packId of creditPackIds) {
      expect(
        knownPriceIds.has(packId),
        `${packId} is a one-time credit pack but also appears in KNOWN_PRICE_IDS — ` +
          `a pack purchase would write a subscriptions row and grant plan access`,
      ).toBe(false);
    }
  });

  it("never lets a subscription plan be mistaken for a credit pack", () => {
    for (const planId of knownPriceIds) {
      expect(
        creditPackIds.has(planId),
        `${planId} is a subscription plan but also appears in CREDIT_PACK_CREDITS — ` +
          `a subscription payment would be converted into a one-off credit grant`,
      ).toBe(false);
    }
  });

  it("keeps the derived sets non-trivial", () => {
    // Guards against a regex that silently matches nothing, which would make
    // every assertion above vacuously true while the drift it targets is live.
    expect(PAID_PLAN_IDS.length).toBeGreaterThan(2);
    expect(knownPriceIds.size).toBeGreaterThan(1);
    expect(creditPackIds.size).toBeGreaterThan(0);
    expect(serverPriceConfigIds.size).toBe(PAID_PLAN_IDS.length);
  });
});
