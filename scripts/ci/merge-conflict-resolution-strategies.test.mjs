import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResolutionPlan,
  classifyMergeOutcome,
  selectStrategy,
  STRATEGIES,
} from "./merge-conflict-resolution-strategies.mjs";

describe("selectStrategy", () => {
  it("prefers base lockfile for bun.lock", () => {
    const { strategy } = selectStrategy("bun.lock");
    assert.equal(strategy.id, "base_lockfile");
    assert.equal(strategy.gitCheckout, "ours");
  });

  it("marks route tree as regenerate", () => {
    const { strategy } = selectStrategy("src/routeTree.gen.ts");
    assert.equal(strategy.id, "regenerate");
    assert.equal(strategy.auto, false);
  });

  it("gives SSR client head_contract", () => {
    const { strategy } = selectStrategy("src/integrations/supabase/client.ts");
    assert.equal(strategy.id, "head_contract");
    assert.equal(strategy.gitCheckout, "theirs");
  });

  it("gives vitest harness head_contract", () => {
    const { strategy } = selectStrategy("src/test/helpers/reactRouterCompat.vitest.tsx");
    assert.equal(strategy.id, "head_contract");
  });

  it("requires manual for ordinary product source", () => {
    const { strategy } = selectStrategy("src/pages/Dashboard.tsx");
    assert.equal(strategy.id, "manual");
  });

  it("docs prefer theirs", () => {
    const { strategy } = selectStrategy("docs/biome-adoption.md");
    assert.equal(strategy.id, "theirs");
  });
});

describe("buildResolutionPlan", () => {
  it("partitions auto vs manual vs regenerate", () => {
    const plan = buildResolutionPlan([
      "bun.lock",
      "src/routeTree.gen.ts",
      "src/integrations/supabase/client.ts",
      "src/pages/Dashboard.tsx",
    ]);
    assert.ok(plan.auto.includes("bun.lock"));
    assert.ok(plan.auto.includes("src/integrations/supabase/client.ts"));
    assert.ok(plan.regenerate.includes("src/routeTree.gen.ts"));
    assert.ok(plan.manual.includes("src/pages/Dashboard.tsx"));
  });
});

describe("classifyMergeOutcome", () => {
  it("clean merge is low risk", () => {
    const o = classifyMergeOutcome({
      clean: true,
      conflicted: [],
      plan: buildResolutionPlan([]),
      remainingConflicts: [],
    });
    assert.equal(o.kind, "clean_merge");
    assert.equal(o.merge_interaction_risk, "low");
  });

  it("manual remaining is high risk", () => {
    const o = classifyMergeOutcome({
      clean: false,
      conflicted: ["src/pages/Dashboard.tsx"],
      plan: buildResolutionPlan(["src/pages/Dashboard.tsx"]),
      remainingConflicts: ["src/pages/Dashboard.tsx"],
    });
    assert.equal(o.kind, "manual_required");
    assert.equal(o.merge_interaction_risk, "high");
  });
});

describe("STRATEGIES catalog", () => {
  it("exposes expected ids", () => {
    for (const id of [
      "ours",
      "theirs",
      "union",
      "regenerate",
      "manual",
      "base_lockfile",
      "head_contract",
    ]) {
      assert.ok(STRATEGIES[id], id);
    }
  });
});
