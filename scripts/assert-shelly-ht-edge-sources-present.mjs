#!/usr/bin/env node
/**
 * Stop-ship guard: every Shelly H&T edge function declared in
 * supabase/config.toml MUST have its source file present in the repo
 * at `supabase/functions/<name>/index.ts`.
 *
 * Background: the Shelly H&T client integration (hook, card, rules) is
 * active and depends on the `shelly-ht-status` and `shelly-ht-webhook`
 * edge functions. If their source disappears from the repo while the
 * config still declares them, deploys silently drift from the codebase
 * and the loop becomes unreviewable. This script makes that condition
 * a build failure.
 *
 * Scope: read-only static check. No network, no schema, no auth.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG = resolve(ROOT, "supabase/config.toml");
const FUNCTIONS_DIR = resolve(ROOT, "supabase/functions");

if (!existsSync(CONFIG)) {
  console.error(`[shelly-ht-edge-sources] supabase/config.toml not found at ${CONFIG}`);
  process.exit(1);
}

const toml = readFileSync(CONFIG, "utf8");
const declared = Array.from(
  toml.matchAll(/^\[functions\.(shelly-ht-[a-z0-9-]+)\]/gim),
).map((m) => m[1]);

if (declared.length === 0) {
  console.log(
    "[shelly-ht-edge-sources] No Shelly H&T edge functions declared in supabase/config.toml — nothing to check.",
  );
  process.exit(0);
}

const missing = [];
for (const name of declared) {
  const src = resolve(FUNCTIONS_DIR, name, "index.ts");
  if (!existsSync(src)) missing.push({ name, src });
}

if (missing.length > 0) {
  console.error(
    "[shelly-ht-edge-sources] Missing edge function source files for declared Shelly H&T functions:",
  );
  for (const m of missing) {
    console.error(`  - [functions.${m.name}] declared in supabase/config.toml`);
    console.error(`    expected source: ${m.src}`);
  }
  console.error(
    "\nEither restore the source files or remove the [functions.<name>] block from supabase/config.toml.",
  );
  process.exit(1);
}

console.log(
  `[shelly-ht-edge-sources] OK — ${declared.length} declared Shelly H&T function(s) have source files: ${declared.join(", ")}`,
);
