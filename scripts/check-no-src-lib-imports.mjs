#!/usr/bin/env node
/**
 * Fails if any .ts/.tsx file under supabase/functions/ carries an import that
 * the edge runtime (or the mirror/sync-edge-shared pipeline) cannot resolve:
 *
 *  1. Relative escapes into src/** (../../../src/lib/..., ../../src/hooks/...).
 *     Shared code reaches edge only through supabase/functions/_shared/lib/**.
 *     See docs/edge-shared-sync.md.
 *  2. Vite-alias specifiers ("@/..." or "npm:@/..."). The "@/" alias only
 *     exists in the Vite build; in a function bundle it is a broken
 *     specifier. Incident 2026-07-21: mcp leaked "npm:@/lib/ecUnits".
 *     Scoped packages ("npm:@scope/pkg") are fine — only "@" + "/".
 *  3. Windows drive-absolute specifiers ("C:\..." or "npm:C:\...").
 *     Incident 2026-07-26.
 *  4. Browser / Vite-only bare modules (react, react-dom, …) that must never
 *     land in Deno edge entry or shared function code.
 *  5. Dynamic import("...") / import('...') of any of the above.
 *
 * Used by: prebuild, predeploy:functions, CI edge-shared-sync-preflight,
 * deployment-preview, edge-shared-sync workflow.
 *
 * Pure helpers are exported for unit tests so the rules cannot regress without
 * failing src/test/check-no-src-lib-imports.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

/** Repo root. Tolerates Vitest rewriting import.meta.url to a non-file URL. */
function resolveRepoRoot() {
  const u = import.meta.url;
  if (typeof u === "string" && u.startsWith("file:")) {
    return resolve(fileURLToPath(new URL("..", u)));
  }
  // Transformed / virtual modules: assume cwd is the package root.
  return resolve(process.cwd());
}

const ROOT = resolveRepoRoot();
const FUNCTIONS = join(ROOT, "supabase", "functions");

/** Static import/export-from and bare side-effect import. */
const STATIC_IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/g;

/** Dynamic import("...") / import('...'). */
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Relative path that climbs into the app src tree. */
const SRC_ESCAPE_RE = /(?:\.\.\/)+src\//;

/** Vite alias: "@/..." or "npm:@/...". */
const ALIAS_RE = /^(?:npm:)?@\//;

/** Machine-local Windows paths. */
const WINDOWS_ABSOLUTE_RE = /^(?:npm:)?[A-Za-z]:[\\/]/;

/**
 * Bare module names that are browser/Vite-only and must not appear in edge
 * function sources. Keep this list product-focused (not every npm package).
 */
const BROWSER_BARE_MODULES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
  "react-router",
  "react-router-dom",
  "next",
  "next/link",
  "next/router",
  "vite",
  "@vitejs/plugin-react",
]);

/**
 * @param {string} spec
 * @returns {string | null} reason code if forbidden
 */
export function classifyForbiddenSpecifier(spec) {
  if (typeof spec !== "string" || !spec) return null;
  const s = spec.trim();
  if (!s) return null;

  if (ALIAS_RE.test(s)) return "vite_alias";
  if (WINDOWS_ABSOLUTE_RE.test(s)) return "windows_absolute";
  if (SRC_ESCAPE_RE.test(s)) return "src_escape";

  // Bare or subpath browser modules (no ./ and not npm:/jsr:/node:/http(s):/deno:)
  if (!s.startsWith(".") && !/^(?:npm:|jsr:|node:|https?:|deno:)/.test(s)) {
    if (BROWSER_BARE_MODULES.has(s)) return "browser_bare";
    // Also catch react/jsx-runtime style if listed; already in set.
    // Prefix form: "react/..." not in set beyond known entries.
    if (s === "react" || s.startsWith("react/") || s.startsWith("react-dom")) {
      return "browser_bare";
    }
  }

  // npm:react etc.
  if (/^npm:(react|react-dom)(\/|$)/.test(s)) return "browser_bare";

  return null;
}

/**
 * @param {string} source
 * @returns {{ spec: string, reason: string }[]}
 */
export function findForbiddenImportsInSource(source) {
  const hits = [];
  const seen = new Set();
  const push = (spec) => {
    const reason = classifyForbiddenSpecifier(spec);
    if (!reason) return;
    const key = `${reason}\0${spec}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ spec, reason });
  };

  for (const m of source.matchAll(STATIC_IMPORT_RE)) push(m[1]);
  for (const m of source.matchAll(DYNAMIC_IMPORT_RE)) push(m[1]);
  return hits;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * @param {string} [functionsDir]
 * @returns {{ file: string, spec: string, reason: string }[]}
 */
export function scanFunctionsTree(functionsDir = FUNCTIONS) {
  const offenders = [];
  for (const file of walk(functionsDir)) {
    const text = readFileSync(file, "utf8");
    for (const hit of findForbiddenImportsInSource(text)) {
      offenders.push({
        file: relative(ROOT, file),
        spec: hit.spec,
        reason: hit.reason,
      });
    }
  }
  return offenders;
}

export const REASONS = Object.freeze({
  vite_alias: "Vite @/ alias (unresolvable in Deno edge)",
  windows_absolute: "Windows absolute path (machine-local)",
  src_escape: "Relative escape into src/** (use _shared/lib mirror)",
  browser_bare: "Browser/Vite-only bare module (not edge-safe)",
});

function main() {
  const offenders = scanFunctionsTree(FUNCTIONS);
  if (offenders.length) {
    console.error("❌ Unresolvable / edge-incompatible import(s) in supabase/functions/**:\n");
    for (const o of offenders) {
      const label = REASONS[o.reason] ?? o.reason;
      console.error(`  - ${o.file}  →  ${o.spec}  (${label})`);
    }
    console.error(
      "\nRoute shared code through the generated mirror (bun run sync-edge-shared),\n" +
        "replace @/ aliases with relative paths into _shared/lib, and never import\n" +
        "react / browser packages in edge functions. See docs/edge-shared-sync.md.",
    );
    process.exit(1);
  }

  console.log(
    "OK — no @/ aliases, src/** escapes, Windows absolute paths, or browser-only " +
      "imports in supabase/functions/**.",
  );
}

// Only auto-run when invoked as a script (not when imported by tests).
function isExecutedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const u = import.meta.url;
    if (typeof u === "string" && u.startsWith("file:")) {
      return resolve(entry) === fileURLToPath(u);
    }
  } catch {
    /* fall through */
  }
  // Vitest import or non-file URL: never auto-run main.
  return /check-no-src-lib-imports\.mjs$/.test(entry.replace(/\\/g, "/"));
}

if (isExecutedAsCli()) {
  main();
}
