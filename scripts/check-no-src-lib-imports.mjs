#!/usr/bin/env node
/**
 * Fails if any supabase/functions/<fn>/index.ts imports from ../../../src/lib/.
 * All src/lib code reaches edge functions through the generated mirror at
 * supabase/functions/_shared/lib/**. See docs/edge-shared-sync.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FUNCTIONS = join(ROOT, "supabase", "functions");

// Match import/export ... from "<spec>" and bare `import "<spec>"`, single or double quoted.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:\s+[\s\S]*?\s+from)?\s*["']([^"']+)["']/g;

// Anything that reaches src/lib via a relative path: ../src/lib/, ../../src/lib/, ...
const FORBIDDEN_RE = /(?:\.\.\/)+src\/lib\//;

const offenders = [];
for (const name of readdirSync(FUNCTIONS)) {
  const entry = join(FUNCTIONS, name, "index.ts");
  try {
    if (!statSync(entry).isFile()) continue;
  } catch {
    continue;
  }
  const text = readFileSync(entry, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    if (FORBIDDEN_RE.test(m[1])) {
      offenders.push(`${relative(ROOT, entry)}  →  ${m[1]}`);
    }
  }
}

if (offenders.length) {
  console.error(
    "❌ Forbidden src/lib import(s) in supabase/functions/*/index.ts:\n",
  );
  for (const o of offenders) console.error("  - " + o);
  console.error(
    "\nRoute the import through the generated mirror instead:\n" +
      "  bun run sync-edge-shared\n" +
      "See docs/edge-shared-sync.md.",
  );
  process.exit(1);
}

console.log(
  "OK — no supabase/functions/*/index.ts file imports from ../../../src/lib/.",
);
