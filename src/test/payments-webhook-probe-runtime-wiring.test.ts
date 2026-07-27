/**
 * The settlement-time spendability probe must be wired into the REAL
 * webhook, not just injected by the orchestrator's unit tests.
 *
 * Codex, on #499: `orchestrator.ts` defines `probeCreditPackSpendable` as an
 * optional dep and only the unit tests provide it. `payments-webhook/index.ts`
 * builds the real `Deps` object that a live Paddle delivery actually uses, and
 * it never defined the probe — so in production the branch was dead code. A
 * buyer who lost entitlement between checkout and settlement would still get
 * the credits (correct — see orchestrator.ts), but the
 * `unspendable_at_settlement` marker this exists to produce would never fire.
 *
 * Deno-flavored (`npm:` specifiers, `Deno.env`), so it is read as text — the
 * same technique this repo already uses for the sibling webhook module
 * (lovable-paddle-webhook-event-processor.test.ts reads eventProcessor.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INDEX = readFileSync(
  resolve(process.cwd(), "supabase", "functions", "payments-webhook", "index.ts"),
  "utf8",
);

describe("payments-webhook runtime wires the settlement probe", () => {
  it("defines probeCreditPackSpendable in the real Deps object", () => {
    expect(INDEX).toMatch(/async probeCreditPackSpendable\(/);
  });

  it("uses the SAME entitlement loader get-paddle-price gates purchases with", () => {
    // Two independent checks of "can this user spend a pack" must not be
    // free to disagree about what spendable means. Both call
    // loadUnionEntitlementForUser rather than each keeping its own read.
    expect(INDEX).toMatch(/loadUnionEntitlementForUser/);
    const priceFn = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "get-paddle-price", "index.ts"),
      "utf8",
    );
    expect(priceFn).toMatch(/loadUnionEntitlementForUser/);
  });

  it("shares creditPackIsSpendable rather than re-deriving the rule", () => {
    // A second hand-rolled spendability check here is exactly the class of
    // drift that let Craft go missing from the webhook allowlist.
    expect(INDEX).toMatch(/creditPackIsSpendable/);
  });

  it("treats a failed lookup as unknown, never as a false mismatch", () => {
    const probeBlock = INDEX.slice(
      INDEX.indexOf("async probeCreditPackSpendable("),
      INDEX.indexOf("async allocateCreditPack("),
    );
    expect(probeBlock.length).toBeGreaterThan(0);
    expect(probeBlock).toMatch(/lookupFailed[\s\S]{0,60}known:\s*false/);
    // And a thrown error must not propagate into the grant path — a probe
    // exception must never turn a completed purchase into a failure.
    expect(probeBlock).toMatch(/catch[\s\S]{0,120}known:\s*false/);
  });
});
