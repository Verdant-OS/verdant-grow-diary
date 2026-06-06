/**
 * Pure parser + guard-output tests for the Supabase function config
 * guard. No filesystem reads.
 */
import { describe, it, expect } from "vitest";

import {
  SUPABASE_CONFIG_PATH,
  expectedFunctionSourcePath,
  findMissingFunctionSources,
  formatMissingSourceError,
  isShellyHtFunctionName,
  parseSupabaseFunctionNames,
} from "@/lib/supabaseFunctionConfigGuard";

describe("parseSupabaseFunctionNames", () => {
  it("parses a basic [functions.foo] block", () => {
    expect(parseSupabaseFunctionNames(`[functions.foo]\nverify_jwt = false\n`)).toEqual([
      "foo",
    ]);
  });

  it("tolerates whitespace inside brackets", () => {
    expect(parseSupabaseFunctionNames(`[ functions.foo ]\n`)).toEqual(["foo"]);
  });

  it("tolerates leading whitespace before the block", () => {
    expect(parseSupabaseFunctionNames(`   [functions.foo]\n`)).toEqual(["foo"]);
  });

  it("ignores blank lines and comments around blocks", () => {
    const toml = `
# top comment
project_id = "abc"

# block A
[functions.alpha]
verify_jwt = false

# block B
[functions.beta]
verify_jwt = false
`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["alpha", "beta"]);
  });

  it("accepts an inline comment after the block header", () => {
    expect(parseSupabaseFunctionNames(`[functions.foo] # active\n`)).toEqual(["foo"]);
  });

  it("ignores a fully commented-out function block", () => {
    const toml = `# [functions.retired]\n[functions.live]\n`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["live"]);
  });

  it("ignores commented-out blocks even with leading whitespace", () => {
    const toml = `   # [functions.retired]\n[functions.live]\n`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["live"]);
  });

  it("supports quoted function names", () => {
    expect(parseSupabaseFunctionNames(`[functions."shelly-ht-webhook"]\n`)).toEqual([
      "shelly-ht-webhook",
    ]);
  });

  it("returns names sorted deterministically and deduped", () => {
    const toml = `[functions.zeta]\n[functions.alpha]\n[functions.mike]\n[functions.alpha]\n`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["alpha", "mike", "zeta"]);
  });

  it("ignores unrelated TOML blocks", () => {
    const toml = `[project]\nid = "x"\n[functions.foo]\n[storage.buckets.images]\n`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["foo"]);
  });

  it("ignores sub-tables like [functions.foo.secrets]", () => {
    const toml = `[functions.foo]\n[functions.foo.secrets]\nKEY = "x"\n`;
    expect(parseSupabaseFunctionNames(toml)).toEqual(["foo"]);
  });

  it("handles multiple function blocks with mixed formatting", () => {
    const toml = `
[functions.bravo] # inline
   [functions.alpha]
[ functions.charlie ]
# [functions.retired]
[functions."delta-one"]
`;
    expect(parseSupabaseFunctionNames(toml)).toEqual([
      "alpha",
      "bravo",
      "charlie",
      "delta-one",
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseSupabaseFunctionNames("")).toEqual([]);
  });

  it("strips a BOM if present", () => {
    expect(parseSupabaseFunctionNames(`\uFEFF[functions.foo]\n`)).toEqual(["foo"]);
  });
});

describe("expectedFunctionSourcePath", () => {
  it("returns the canonical repo-relative source path", () => {
    expect(expectedFunctionSourcePath("shelly-ht-webhook")).toBe(
      "supabase/functions/shelly-ht-webhook/index.ts",
    );
  });
});

describe("formatMissingSourceError", () => {
  const msg = formatMissingSourceError("shelly-ht-webhook");

  it("includes the function name", () => {
    expect(msg).toContain('"shelly-ht-webhook"');
  });

  it("references supabase/config.toml as the config path", () => {
    expect(msg).toContain(SUPABASE_CONFIG_PATH);
    expect(SUPABASE_CONFIG_PATH).toBe("supabase/config.toml");
  });

  it("references the expected source file path", () => {
    expect(msg).toContain("supabase/functions/shelly-ht-webhook/index.ts");
  });

  it("suggests both restore-file and remove-config-block fixes", () => {
    expect(msg).toMatch(/Restore the source file/);
    expect(msg).toMatch(/remove the matching \[functions\.shelly-ht-webhook\] config block/);
  });

  it("matches the documented canonical wording verbatim", () => {
    expect(msg).toBe(
      'Supabase function "shelly-ht-webhook" is configured in supabase/config.toml ' +
        "but missing source file supabase/functions/shelly-ht-webhook/index.ts. " +
        "Restore the source file or remove the matching [functions.shelly-ht-webhook] " +
        "config block if retired.",
    );
  });
});

describe("findMissingFunctionSources", () => {
  const toml = `
[functions.shelly-ht-webhook]
verify_jwt = false

[functions.shelly-ht-status]
verify_jwt = false

[functions.unrelated]
`;

  it("flags every declared function whose source is missing", () => {
    const missing = findMissingFunctionSources({
      toml,
      exists: () => false,
    });
    const names = missing.map((m) => m.name).sort();
    expect(names).toEqual(["shelly-ht-status", "shelly-ht-webhook", "unrelated"]);
  });

  it("each entry carries the canonical config + expected paths and message", () => {
    const missing = findMissingFunctionSources({
      toml,
      exists: () => false,
      filter: isShellyHtFunctionName,
    });
    const webhook = missing.find((m) => m.name === "shelly-ht-webhook")!;
    expect(webhook.configPath).toBe("supabase/config.toml");
    expect(webhook.expectedPath).toBe(
      "supabase/functions/shelly-ht-webhook/index.ts",
    );
    expect(webhook.message).toBe(formatMissingSourceError("shelly-ht-webhook"));
  });

  it("filter restricts the check to Shelly H&T functions", () => {
    const missing = findMissingFunctionSources({
      toml,
      exists: () => false,
      filter: isShellyHtFunctionName,
    });
    expect(missing.map((m) => m.name).sort()).toEqual([
      "shelly-ht-status",
      "shelly-ht-webhook",
    ]);
    expect(missing.find((m) => m.name === "unrelated")).toBeUndefined();
  });

  it("returns [] when every declared source file exists", () => {
    const missing = findMissingFunctionSources({
      toml,
      exists: () => true,
      filter: isShellyHtFunctionName,
    });
    expect(missing).toEqual([]);
  });

  it("returns [] when no Shelly H&T functions are declared (intentionally retired)", () => {
    const cleanToml = `[functions.unrelated]\n`;
    const missing = findMissingFunctionSources({
      toml: cleanToml,
      exists: () => false,
      filter: isShellyHtFunctionName,
    });
    expect(missing).toEqual([]);
  });
});
