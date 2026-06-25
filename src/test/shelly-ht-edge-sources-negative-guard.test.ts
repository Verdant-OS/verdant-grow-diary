/**
 * Negative-guard coverage for the Shelly H&T edge-source presence check.
 *
 * Simulates a future regression where `[functions.shelly-ht-status]`
 * and/or `[functions.shelly-ht-webhook]` blocks are re-added to
 * `supabase/config.toml` without restoring matching local source files.
 * The shared pure helper must flag both and produce a CI-friendly error
 * message that includes:
 *   - the function name
 *   - the config path (supabase/config.toml)
 *   - the expected local source path
 *   - the suggested fix (restore the source file OR remove the block)
 *
 * Also verifies that on the *current* repo state the guard passes
 * (no Shelly H&T blocks remain in config).
 *
 * Pure / static. No network, no Supabase, no schema awareness.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findMissingFunctionSources,
  formatMissingSourceError,
  isShellyHtFunctionName,
  parseSupabaseFunctionNames,
  SUPABASE_CONFIG_PATH,
} from "@/lib/supabaseFunctionConfigGuard";

const ROOT = resolve(__dirname, "../..");
const CONFIG_TOML = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

describe("Shelly H&T guard — current repo passes", () => {
  it("supabase/config.toml declares no Shelly H&T function blocks", () => {
    const declared = parseSupabaseFunctionNames(CONFIG_TOML).filter(
      isShellyHtFunctionName,
    );
    expect(declared).toEqual([]);
  });

  it("findMissingFunctionSources reports nothing for the live config", () => {
    const missing = findMissingFunctionSources({
      toml: CONFIG_TOML,
      exists: () => true, // any source would be fine; none are declared
      filter: isShellyHtFunctionName,
    });
    expect(missing).toEqual([]);
  });
});

describe("Shelly H&T guard — negative regression coverage", () => {
  const SIMULATED_REGRESSION = `
project_id = "test"

[functions.shelly-ht-status]
verify_jwt = false

[functions.shelly-ht-webhook]
verify_jwt = false
`;

  it("flags both shelly-ht-status and shelly-ht-webhook when source files are missing", () => {
    const missing = findMissingFunctionSources({
      toml: SIMULATED_REGRESSION,
      exists: () => false,
      filter: isShellyHtFunctionName,
    });
    const names = missing.map((m) => m.name).sort();
    expect(names).toEqual(["shelly-ht-status", "shelly-ht-webhook"]);
  });

  for (const name of ["shelly-ht-status", "shelly-ht-webhook"] as const) {
    it(`failure for ${name} includes function name, config path, expected source path, and fix hint`, () => {
      const missing = findMissingFunctionSources({
        toml: SIMULATED_REGRESSION,
        exists: () => false,
        filter: isShellyHtFunctionName,
      });
      const hit = missing.find((m) => m.name === name)!;
      expect(hit).toBeTruthy();
      expect(hit.configPath).toBe(SUPABASE_CONFIG_PATH);
      expect(hit.expectedPath).toBe(`supabase/functions/${name}/index.ts`);
      expect(hit.message).toBe(formatMissingSourceError(name));
      expect(hit.message).toContain(`"${name}"`);
      expect(hit.message).toContain(SUPABASE_CONFIG_PATH);
      expect(hit.message).toContain(`supabase/functions/${name}/index.ts`);
      expect(hit.message).toMatch(
        new RegExp(`remove the matching \\[functions\\.${name}\\] config block`),
      );
      expect(hit.message.toLowerCase()).toContain("restore the source file");
    });
  }

  it("does NOT flag the blocks when matching source files are present", () => {
    const missing = findMissingFunctionSources({
      toml: SIMULATED_REGRESSION,
      exists: () => true,
      filter: isShellyHtFunctionName,
    });
    expect(missing).toEqual([]);
  });
});
