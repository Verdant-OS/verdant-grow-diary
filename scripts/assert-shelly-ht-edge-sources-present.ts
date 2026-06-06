#!/usr/bin/env bun
/**
 * Stop-ship guard: every Shelly H&T edge function declared in
 * `supabase/config.toml` MUST have its source file present in the repo
 * at `supabase/functions/<name>/index.ts`.
 *
 * Uses the shared pure parser in `src/lib/supabaseFunctionConfigGuard`
 * so the CI message matches the unit-tested error format exactly.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findMissingFunctionSources,
  isShellyHtFunctionName,
  parseSupabaseFunctionNames,
  SUPABASE_CONFIG_PATH,
} from "../src/lib/supabaseFunctionConfigGuard";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG = resolve(ROOT, SUPABASE_CONFIG_PATH);

if (!existsSync(CONFIG)) {
  console.error(`[shelly-ht-edge-sources] ${SUPABASE_CONFIG_PATH} not found at ${CONFIG}`);
  process.exit(1);
}

const toml = readFileSync(CONFIG, "utf8");
const declared = parseSupabaseFunctionNames(toml).filter(isShellyHtFunctionName);

if (declared.length === 0) {
  console.log(
    `[shelly-ht-edge-sources] No Shelly H&T edge functions declared in ${SUPABASE_CONFIG_PATH} — nothing to check.`,
  );
  process.exit(0);
}

const missing = findMissingFunctionSources({
  toml,
  exists: (p) => existsSync(resolve(ROOT, p)),
  filter: isShellyHtFunctionName,
});

if (missing.length > 0) {
  console.error(
    `[shelly-ht-edge-sources] ${missing.length} Shelly H&T function(s) declared in ${SUPABASE_CONFIG_PATH} are missing source files:\n`,
  );
  for (const m of missing) {
    console.error(`  • ${m.message}`);
    console.error(`    config:   ${m.configPath}  (block: [functions.${m.name}])`);
    console.error(`    expected: ${m.expectedPath}`);
    console.error("");
  }
  console.error(
    "Fix options:\n" +
      "  1. Restore the missing source file(s) listed above, OR\n" +
      `  2. Remove the matching [functions.<name>] block from ${SUPABASE_CONFIG_PATH} if the function is intentionally retired.`,
  );
  process.exit(1);
}

console.log(
  `[shelly-ht-edge-sources] OK — ${declared.length} declared Shelly H&T function(s) have source files: ${declared.join(", ")}`,
);
