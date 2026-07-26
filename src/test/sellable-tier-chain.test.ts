/**
 * sellable-tier chain — every purchasable id must be handled, exactly once,
 * at every layer between "we take the money" and "we grant the thing".
 *
 * Motivated by Craft, which was marketed and priced while broken at FOUR
 * independent layers: the checkout price allow-list, the server price config,
 * the webhook's subscription-persistence allow-list, and three entitlement
 * gates. Each was found separately, days apart, and fixing one made the next
 * one's absence *less* visible rather than more — a plan that reaches checkout
 * but is skipped by the webhook is charged-and-granted-nothing, which is
 * silent, rather than merely unbuyable, which is loud.
 *
 * `src/lib/paidPlanAllowlist.ts` is the single source of truth. The plan-vs-pack
 * split now lives THERE, and `payments-webhook`'s `KNOWN_PRICE_IDS` derives
 * from it instead of keeping a hand-maintained copy, so the primary invariant
 * is checked against real exported values rather than scraped text.
 *
 * Two things are still scanned as text, deliberately: `SERVER_PRICE_CONFIG`
 * lives in a Deno edge module with `npm:` specifiers vitest cannot resolve,
 * and the derivation check exists precisely to catch the derivation being
 * replaced by a literal list again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_PACK_IDS, PAID_PLAN_IDS, SUBSCRIPTION_PLAN_IDS } from "@/lib/paidPlanAllowlist";

/**
 * Remove JS comments so a commented-out entry cannot satisfy a substring
 * match. Without this, `// credit_pack_150: Deno.env.get(…)` still contains
 * the literal `credit_pack_150:` and every assertion below stays green while
 * that SKU no longer resolves a price — a billing scan handing back false
 * assurance, which is worse than no scan.
 *
 * Quote-aware on purpose: a `//` inside a string (a URL, say) is not a
 * comment, and a naive line-wise strip would silently truncate real code and
 * shrink the very sets these assertions measure.
 */
export function stripComments(source: string): string {
  let out = "";
  let quote: string | null = null;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function sourceOf(...segments: string[]): string {
  return stripComments(readFileSync(resolve(process.cwd(), ...segments), "utf8"));
}

function edgeSource(...segments: string[]): string {
  return sourceOf("supabase", "functions", ...segments);
}

const WEBHOOK = edgeSource("payments-webhook", "eventProcessor.ts");
const PRICE_FN = edgeSource("get-paddle-price", "index.ts");

/**
 * Ids inside a braced literal. Handles bare object keys (`credit_pack_50: 50`)
 * as well as quoted members — missing the bare-key form silently yields an
 * empty set, which would make assertions vacuously true. The trailing `\s*:`
 * also prevents prefix collisions: `credit_pack_50` cannot match inside
 * `credit_pack_500`.
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

const serverPriceConfigIds = extract(
  PRICE_FN,
  /SERVER_PRICE_CONFIG[^=]*=\s*\{([\s\S]*?)\n\};/,
  "SERVER_PRICE_CONFIG",
);

const sorted = (s: Iterable<string>) => [...s].sort();

describe("sellable-tier chain", () => {
  it("classifies every purchasable id as exactly one of plan or pack", () => {
    // Exhaustive: an id in NEITHER is skipped by the webhook as
    // `unknown_price_id` — payment succeeds, nothing is written, Paddle still
    // receives a 200. That is the charged-and-granted-nothing path.
    const handled = new Set([...SUBSCRIPTION_PLAN_IDS, ...CREDIT_PACK_IDS]);
    expect(sorted(handled)).toEqual(sorted(PAID_PLAN_IDS));

    // Disjoint: an id in BOTH means a $9 credit pack also writes a
    // subscriptions row and grants plan access.
    for (const packId of CREDIT_PACK_IDS) {
      expect(
        (SUBSCRIPTION_PLAN_IDS as ReadonlyArray<string>).includes(packId),
        `${packId} is a one-time pack but is also classified as a subscription plan`,
      ).toBe(false);
    }
  });

  it("keeps the webhook's KNOWN_PRICE_IDS derived, not hand-maintained", () => {
    // The regression guard for this whole class, and — since
    // sell-vs-grant-parity now imports SUBSCRIPTION_PLAN_IDS rather than
    // scraping this module — the ONLY check on the edge seam itself.
    //
    // The assignment must be the WHOLE statement, terminated. A substring
    // match would accept `= SUBSCRIPTION_PLAN_IDS.filter(id => id !==
    // "craft_annual")`, which reintroduces exactly the silent omission this
    // PR exists to kill while leaving both assertions green.
    expect(
      /KNOWN_PRICE_IDS\s*:\s*ReadonlyArray<string>\s*=\s*SUBSCRIPTION_PLAN_IDS\s*;/.test(WEBHOOK),
      "KNOWN_PRICE_IDS must be assigned SUBSCRIPTION_PLAN_IDS whole and unmodified — " +
        "a literal list, or any narrowing of the derived list, reintroduces the " +
        "hand-maintained copy that silently omitted Craft",
    ).toBe(true);

    // And it must not have quietly regained a literal array alongside it.
    expect(/KNOWN_PRICE_IDS[^=]*=\s*\[/.test(WEBHOOK)).toBe(false);
  });

  it("resolves a server price for every purchasable id", () => {
    // Without an entry, get-paddle-price returns unknown_plan /
    // price_not_configured and checkout never opens — advertised but unbuyable.
    for (const id of PAID_PLAN_IDS) {
      expect(
        serverPriceConfigIds.has(id),
        `${id} is purchasable but SERVER_PRICE_CONFIG has no entry — checkout cannot open for it`,
      ).toBe(true);
    }
  });

  it("guards a pack declared in the allowlist but never classified", () => {
    // The source module throws at import time if a `credit_pack*` id is added
    // to PAID_PLAN_IDS without being declared in CREDIT_PACK_IDS, because the
    // derivation would otherwise classify it as a subscription plan — the
    // dangerous direction. Assert the guard exists rather than re-implementing
    // its logic here.
    // Comment-stripped, so commenting the guard out fails this rather than
    // leaving it green on the strength of the disabled text.
    const source = sourceOf("src", "lib", "paidPlanAllowlist.ts");
    expect(source).toMatch(/startsWith\("credit_pack"\)/);
    expect(source).toMatch(/throw new Error/);
  });

  it("strips comments without eating real code", () => {
    // The stripper itself is load-bearing: if it silently no-opped, the
    // commented-out-entry hole would reopen; if it over-stripped, every set
    // above would shrink and the assertions would fail for the wrong reason.
    // Both directions are asserted rather than assumed.
    expect(stripComments(`{ a: 1, // b: 2\n c: 3 }`)).not.toContain("b:");
    expect(stripComments(`{ a: 1, /* b: 2 */ c: 3 }`)).not.toContain("b:");
    expect(stripComments(`{ a: 1, c: 3 }`)).toContain("c: 3");
    // A `//` inside a string is not a comment.
    expect(stripComments(`const u = "https://x.test/p"; const k = 1;`)).toContain("const k = 1;");
    // And it must actually be doing something to the real file.
    const raw = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "get-paddle-price", "index.ts"),
      "utf8",
    );
    expect(PRICE_FN.length).toBeLessThan(raw.length);
  });

  it("keeps the derived sets non-trivial", () => {
    // Guards against a matcher that silently finds nothing, which would make
    // every assertion above vacuously true while the drift it targets is live.
    expect(PAID_PLAN_IDS.length).toBeGreaterThan(2);
    expect(SUBSCRIPTION_PLAN_IDS.length).toBeGreaterThan(1);
    expect(CREDIT_PACK_IDS.length).toBeGreaterThan(0);
    expect(serverPriceConfigIds.size).toBe(PAID_PLAN_IDS.length);
  });
});
