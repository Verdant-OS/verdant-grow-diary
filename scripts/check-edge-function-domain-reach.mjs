#!/usr/bin/env node
/**
 * Phase 0 detector for POSTGRES_RESTRICTED_ROLE_SPIKE (GAP-PGROLE-001).
 *
 * Contract: docs/specs/postgres-restricted-role-alternative.md §5.1.
 *
 * WHAT THIS DOES
 * Every `supabase/functions/<fn>/index.ts` that reads SUPABASE_SERVICE_ROLE_KEY
 * holds an identity that bypasses RLS and can reach all 115 public tables.
 * This script records, per function, which tables and RPCs it actually
 * touches, and fails when a function reaches something its manifest entry does
 * not declare. That turns "we review carefully" into a gate that fires at
 * review time.
 *
 * It also reports **cross-domain reach**: a function whose declared domain is
 * `money` touching a `grower` table. Cross-domain reach is NOT automatically a
 * failure — some of it is legitimate and is declared with a justification in
 * the manifest. Undeclared reach of any kind IS a failure.
 *
 * WHAT THIS IS NOT
 * A static source scan. It cannot see a table name built at runtime
 * (`.from(someVariable)`), reached through a SECURITY DEFINER function's body,
 * or reached by a helper that takes the table name as an argument. A green run
 * therefore means "no undeclared *literal* reach", never "this function cannot
 * touch anything else". Only a restricted Postgres role would give the latter,
 * which is exactly the gap this detector exists to measure rather than close.
 *
 * Per AGENTS.md, source-text scanning is the correct tool here: this proves a
 * pattern is present/absent in a file. It is not a contract test over resolved
 * configuration, so the check-contract-test-resolution.mjs rule does not apply.
 *
 * Usage:
 *   node scripts/check-edge-function-domain-reach.mjs            # gate
 *   node scripts/check-edge-function-domain-reach.mjs --report   # measurement
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const MANIFEST_PATH = join(ROOT, "config", "edge-function-domain-reach.json");

const SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY";

/** Recursively list files under a directory. */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Extract literal `.from("table")` and `.rpc("fn")` targets from source text.
 * Deliberately literal-only — see the "WHAT THIS IS NOT" note above.
 */
export function extractReach(source) {
  const tables = new Set();
  const rpcs = new Set();
  for (const m of source.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)/g)) tables.add(m[1]);
  for (const m of source.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) rpcs.add(m[1]);
  return {
    tables: [...tables].sort(),
    rpcs: [...rpcs].sort(),
  };
}

/** Does this function directory hold a service-role identity? */
export function holdsServiceRole(files) {
  return files.some((f) => readFileSync(f, "utf-8").includes(SERVICE_ROLE_ENV));
}

/** Enumerate service-role function directories and their measured reach. */
export function measureFunctions(functionsDir = FUNCTIONS_DIR) {
  const results = [];
  if (!existsSync(functionsDir)) return results;
  for (const name of readdirSync(functionsDir).sort()) {
    if (name.startsWith("_")) continue;
    const dir = join(functionsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const files = listFiles(dir).filter((f) => f.endsWith(".ts"));
    if (files.length === 0) continue;
    if (!holdsServiceRole(files)) continue;
    const merged = { tables: new Set(), rpcs: new Set() };
    for (const f of files) {
      const { tables, rpcs } = extractReach(readFileSync(f, "utf-8"));
      tables.forEach((t) => merged.tables.add(t));
      rpcs.forEach((r) => merged.rpcs.add(r));
    }
    results.push({
      name,
      tables: [...merged.tables].sort(),
      rpcs: [...merged.rpcs].sort(),
    });
  }
  return results;
}

/**
 * Compare measured reach against the manifest.
 * Returns { violations, crossDomain, undeclaredFunctions, staleDeclarations }.
 */
export function evaluate(measured, manifest) {
  const violations = [];
  const crossDomain = [];
  const undeclaredFunctions = [];
  const staleDeclarations = [];
  const tableDomains = manifest.tableDomains ?? {};

  for (const fn of measured) {
    const entry = manifest.functions?.[fn.name];
    if (!entry) {
      undeclaredFunctions.push(fn.name);
      continue;
    }
    const allowedTables = new Set(entry.tables ?? []);
    const allowedRpcs = new Set(entry.rpcs ?? []);

    for (const t of fn.tables) {
      if (!allowedTables.has(t)) {
        violations.push({ fn: fn.name, kind: "table", target: t });
        continue;
      }
      const domain = tableDomains[t];
      if (domain && domain !== entry.domain && entry.domain !== "cross") {
        crossDomain.push({ fn: fn.name, from: entry.domain, target: t, domain });
      }
    }
    for (const r of fn.rpcs) {
      if (!allowedRpcs.has(r)) violations.push({ fn: fn.name, kind: "rpc", target: r });
    }

    // A declaration that no longer matches reality is its own defect: it makes
    // the manifest read as coverage it does not have.
    for (const t of allowedTables) {
      if (!fn.tables.includes(t)) staleDeclarations.push({ fn: fn.name, kind: "table", target: t });
    }
    for (const r of allowedRpcs) {
      if (!fn.rpcs.includes(r)) staleDeclarations.push({ fn: fn.name, kind: "rpc", target: r });
    }
  }
  return { violations, crossDomain, undeclaredFunctions, staleDeclarations };
}

function main() {
  const reportOnly = process.argv.includes("--report");
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`check-edge-function-domain-reach: manifest missing at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const measured = measureFunctions();
  const { violations, crossDomain, undeclaredFunctions, staleDeclarations } = evaluate(
    measured,
    manifest,
  );

  if (reportOnly) {
    console.log(`Service-role edge functions measured: ${measured.length}`);
    for (const fn of measured) {
      const entry = manifest.functions?.[fn.name];
      console.log(
        `  ${fn.name} [${entry?.domain ?? "UNDECLARED"}] tables=${fn.tables.length} rpcs=${fn.rpcs.length}`,
      );
    }
    console.log(`\nDeclared cross-domain table reaches: ${crossDomain.length}`);
    for (const c of crossDomain) {
      console.log(`  ${c.fn} (${c.from}) -> ${c.target} (${c.domain})`);
    }
  }

  let failed = false;
  if (undeclaredFunctions.length) {
    failed = true;
    console.error(
      `\nFAIL: service-role function(s) missing a manifest entry: ${undeclaredFunctions.join(", ")}`,
    );
  }
  if (violations.length) {
    failed = true;
    console.error(`\nFAIL: undeclared reach (${violations.length}):`);
    for (const v of violations) console.error(`  ${v.fn} -> ${v.kind} "${v.target}"`);
    console.error(
      `\nEither remove the access, or declare it in config/edge-function-domain-reach.json\n` +
        `with a justification. Do not widen a domain to make this pass.`,
    );
  }
  if (staleDeclarations.length) {
    failed = true;
    console.error(`\nFAIL: manifest declares reach that no longer exists (${staleDeclarations.length}):`);
    for (const s of staleDeclarations) console.error(`  ${s.fn} -> ${s.kind} "${s.target}"`);
    console.error(`\nRemove the stale entries so the manifest stays an honest map.`);
  }

  if (failed) process.exit(1);
  console.log(
    `check-edge-function-domain-reach: OK — ${measured.length} service-role function(s), ` +
      `no undeclared reach, ${crossDomain.length} declared cross-domain table reach(es).`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("check-edge-function-domain-reach.mjs")) main();
