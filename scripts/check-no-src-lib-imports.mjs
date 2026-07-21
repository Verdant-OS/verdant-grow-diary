#!/usr/bin/env node
/**
 * Fails if any .ts file under supabase/functions/ carries an import that the
 * edge runtime cannot resolve:
 *
 *  1. Relative escapes into src/lib (../../../src/lib/...). All src/lib code
 *     reaches edge functions through the generated mirror at
 *     supabase/functions/_shared/lib/**. See docs/edge-shared-sync.md.
 *  2. Vite-alias specifiers ("@/..." or "npm:@/..."). The "@/" alias only
 *     exists in the Vite build; in a function bundle it is a broken
 *     specifier. Incident 2026-07-21: the mcp function is auto-regenerated
 *     from src/lib/mcp/** and a value import of "@/lib/ecUnits" leaked into
 *     the bundle as "npm:@/lib/ecUnits", breaking deploys. Scoped packages
 *     ("npm:@scope/pkg") are fine — the rule only matches "@" followed
 *     directly by "/".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FUNCTIONS = join(ROOT, "supabase", "functions");

// Match import/export ... from "<spec>" and bare `import "<spec>"`, single or double quoted.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/g;

// Anything that reaches src/lib via a relative path: ../src/lib/, ../../src/lib/, ...
const FORBIDDEN_RE = /(?:\.\.\/)+src\/lib\//;

// Vite alias specifiers: "@/..." or "npm:@/..." — unresolvable in Deno.
const ALIAS_RE = /^(?:npm:)?@\//;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(FUNCTIONS)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    if (FORBIDDEN_RE.test(m[1]) || ALIAS_RE.test(m[1])) {
      offenders.push(`${relative(ROOT, file)}  →  ${m[1]}`);
    }
  }
}

if (offenders.length) {
  console.error(
    "❌ Unresolvable import(s) in supabase/functions/** (src/lib escape or @/ alias):\n",
  );
  for (const o of offenders) console.error("  - " + o);
  console.error(
    "\nRoute src/lib code through the generated mirror (bun run sync-edge-shared)\n" +
      "and replace @/ alias imports with relative ones — the alias does not\n" +
      "exist in the edge runtime. See docs/edge-shared-sync.md.",
  );
  process.exit(1);
}

console.log(
  "OK — no src/lib escapes or @/ alias specifiers in supabase/functions/**.",
);
