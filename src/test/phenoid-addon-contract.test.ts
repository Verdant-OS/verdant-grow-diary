/**
 * PhenoID add-on carve-out — enforcement of the amended keeper contract
 * (docs/pheno-keeper-contract.md, founder-authorized 2026-07-21).
 *
 * The add-on MAY sort grower-entered scores as a shortlist; these assertions
 * pin the conditions that authorization depends on. Sibling fence:
 * phenoid-ranking-read-fence.test.ts (core never reads ranking data).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

const CONTENDERS_VM = read("lib/phenoContendersViewModel.ts");
const FIGHT_VM = read("lib/phenoFightViewModel.ts");
const BOARD = read("components/PhenoContendersBoard.tsx");
const SHOWCASE = read("pages/PhenoHuntShowcase.tsx");
const DOC = readFileSync(
  resolve(__dirname, "..", "..", "docs", "pheno-keeper-contract.md"),
  "utf8",
);

describe("PhenoID add-on carve-out conditions", () => {
  it("the amendment is documented with its authorization date", () => {
    expect(DOC).toContain("carve-out (authorized 2026-07-21)");
    expect(DOC).toContain("sortable shortlist");
  });

  it("condition 1 — composite inputs are grower-entered scores, never sensors", () => {
    for (const src of [CONTENDERS_VM, FIGHT_VM]) {
      expect(src).not.toMatch(/sensorSnapshot|useLatestSensorSnapshot|sensor_readings/);
    }
  });

  it("condition 2 — every ranked surface carries a non-deciding disclaimer", () => {
    expect(CONTENDERS_VM).toContain("it never declares a winner");
    expect(BOARD).toContain("doesn't decide");
    expect(BOARD).toContain("earned at the cure");
    expect(SHOWCASE).toMatch(/don&rsquo;t decide|doesn't decide/);
    expect(SHOWCASE).toContain("earned at the cure");
  });

  it("condition 3 — Verdant never emits a winner (fight VM has no winner field)", () => {
    expect(FIGHT_VM).toMatch(/deliberately NO `winner`/);
    // No exported/returned winner property in the fight view-model.
    expect(FIGHT_VM).not.toMatch(/winner\s*[:=](?!.*(?:NO|never|by design))/);
  });

  it("condition 4 — nothing ranked writes keeper status", () => {
    for (const src of [CONTENDERS_VM, FIGHT_VM, BOARD, SHOWCASE]) {
      expect(src).not.toMatch(/pheno_keeper|promoteToKeeper|nameKeeper|keeper_decisions/);
    }
  });

  it("condition 5 — forbidden recommendation language stays absent from the add-on", () => {
    for (const src of [CONTENDERS_VM, FIGHT_VM, BOARD, SHOWCASE]) {
      expect(src).not.toMatch(/recommended keeper|AI top pick|guaranteed keeper|picks winners/i);
    }
  });

  it("claim hygiene — no paid-enforcement claims on add-on surfaces while plan_ids are placeholders", () => {
    // Step 8 of the autoflower/photoperiod plan (2026-07-21): until real
    // phenoid SKUs are wired and verified, no add-on surface may state or
    // imply that ranking is a server-enforced paid/subscription feature.
    // (Core Pheno Tracker Pro gating copy lives elsewhere and is genuine.)
    const BANNER = read("components/PhenoComparabilityBanner.tsx");
    for (const src of [CONTENDERS_VM, FIGHT_VM, BOARD, SHOWCASE, BANNER]) {
      expect(src).not.toMatch(
        /paid add-on|Pro feature|requires (a |an active )?subscription|unlocked with/i,
      );
    }
  });

  it("claim hygiene — the plant type field itself is core, never entitlement-gated", () => {
    const TYPE_RULES = read("lib/plantTypeRules.ts");
    expect(TYPE_RULES).not.toMatch(/entitlement|phenoid|plan_id|subscription/i);
  });
});
