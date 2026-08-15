import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractReach,
  evaluate,
  measureFunctions,
} from "./check-edge-function-domain-reach.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(ROOT, "config", "edge-function-domain-reach.json"), "utf-8"),
);

// ── extractReach: happy path ──────────────────────────────────────────────
test("extracts literal from() and rpc() targets", () => {
  const { tables, rpcs } = extractReach(
    `await admin.from("subscriptions").select("*");
     await admin.rpc("ai_credit_spend", { x: 1 });`,
  );
  assert.deepEqual(tables, ["subscriptions"]);
  assert.deepEqual(rpcs, ["ai_credit_spend"]);
});

test("deduplicates and sorts", () => {
  const { tables } = extractReach(
    `from("tents"); from("grows"); from("tents");`.replaceAll("from(", ".from("),
  );
  assert.deepEqual(tables, ["grows", "tents"]);
});

test("tolerates whitespace inside the call", () => {
  const { tables, rpcs } = extractReach(`.from(  "plants"  )\n.rpc(\n  "has_role"`);
  assert.deepEqual(tables, ["plants"]);
  assert.deepEqual(rpcs, ["has_role"]);
});

// ── extractReach: edges and nulls ─────────────────────────────────────────
test("empty source yields empty reach", () => {
  assert.deepEqual(extractReach(""), { tables: [], rpcs: [] });
});

test("ignores non-literal targets — the documented blind spot", () => {
  // A runtime-built table name is invisible to this scanner. The test pins
  // that limitation so nobody later mistakes a green run for a runtime fence.
  const { tables } = extractReach(`.from(tableName).select("*")`);
  assert.deepEqual(tables, []);
});

test("does not match single-quoted or templated targets", () => {
  assert.deepEqual(extractReach(`.from('subscriptions')`).tables, []);
  assert.deepEqual(extractReach(".from(`subscriptions`)").tables, []);
});

// ── evaluate: violations ──────────────────────────────────────────────────
const TINY_MANIFEST = {
  tableDomains: { subscriptions: "money", diary_entries: "grower" },
  functions: {
    "fn-a": { domain: "money", tables: ["subscriptions"], rpcs: [] },
  },
};

test("undeclared table reach is a violation", () => {
  const r = evaluate(
    [{ name: "fn-a", tables: ["subscriptions", "diary_entries"], rpcs: [] }],
    TINY_MANIFEST,
  );
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { fn: "fn-a", kind: "table", target: "diary_entries" });
});

test("undeclared rpc reach is a violation", () => {
  const r = evaluate([{ name: "fn-a", tables: ["subscriptions"], rpcs: ["boom"] }], TINY_MANIFEST);
  assert.deepEqual(r.violations, [{ fn: "fn-a", kind: "rpc", target: "boom" }]);
});

test("a service-role function with no manifest entry is reported", () => {
  const r = evaluate([{ name: "ghost", tables: [], rpcs: [] }], TINY_MANIFEST);
  assert.deepEqual(r.undeclaredFunctions, ["ghost"]);
});

test("a declaration that no longer matches reality is stale, not silently ignored", () => {
  const r = evaluate([{ name: "fn-a", tables: [], rpcs: [] }], TINY_MANIFEST);
  assert.deepEqual(r.staleDeclarations, [
    { fn: "fn-a", kind: "table", target: "subscriptions" },
  ]);
});

// ── evaluate: cross-domain reporting ──────────────────────────────────────
test("declared cross-domain reach is reported but is not a violation", () => {
  const m = {
    tableDomains: { profiles: "grower" },
    functions: { "fn-b": { domain: "money", tables: ["profiles"], rpcs: [] } },
  };
  const r = evaluate([{ name: "fn-b", tables: ["profiles"], rpcs: [] }], m);
  assert.equal(r.violations.length, 0);
  assert.deepEqual(r.crossDomain, [
    { fn: "fn-b", from: "money", target: "profiles", domain: "grower" },
  ]);
});

test("the 'cross' domain is exempt from cross-domain reporting", () => {
  const m = {
    tableDomains: { profiles: "grower", subscriptions: "money" },
    functions: {
      "fn-c": { domain: "cross", tables: ["profiles", "subscriptions"], rpcs: [] },
    },
  };
  const r = evaluate([{ name: "fn-c", tables: ["profiles", "subscriptions"], rpcs: [] }], m);
  assert.equal(r.crossDomain.length, 0);
});

// ── determinism ───────────────────────────────────────────────────────────
test("evaluate is deterministic across repeated runs", () => {
  const measured = measureFunctions();
  const a = JSON.stringify(evaluate(measured, manifest));
  const b = JSON.stringify(evaluate(measured, manifest));
  assert.equal(a, b);
});

// ── regression: the real repository must stay clean ───────────────────────
test("the committed manifest matches the repository exactly", () => {
  const r = evaluate(measureFunctions(), manifest);
  assert.deepEqual(r.violations, [], "undeclared reach — update the manifest or remove the access");
  assert.deepEqual(r.undeclaredFunctions, [], "a service-role function has no manifest entry");
  assert.deepEqual(r.staleDeclarations, [], "manifest declares reach that no longer exists");
});

test("every service-role function is declared, and every declaration is real", () => {
  const measured = measureFunctions().map((f) => f.name).sort();
  const declared = Object.keys(manifest.functions).sort();
  assert.deepEqual(declared, measured);
});

// ── safety fence: the manifest must not become a rubber stamp ─────────────
test("every cross-domain or multi-domain entry carries a justification", () => {
  for (const [name, entry] of Object.entries(manifest.functions)) {
    assert.ok(
      typeof entry.justification === "string" && entry.justification.trim().length > 0,
      `${name} must carry a non-empty justification`,
    );
    assert.ok(
      Object.hasOwn(manifest.domains, entry.domain),
      `${name} declares unknown domain "${entry.domain}"`,
    );
  }
});
