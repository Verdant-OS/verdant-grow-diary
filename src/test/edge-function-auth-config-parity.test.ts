import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const FUNCTIONS_DIR = resolve(ROOT, "supabase/functions");
const CONFIG = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

function configuredFunctionNames(): string[] {
  return Array.from(
    CONFIG.matchAll(/^\s*\[functions\.([^\]]+)\]\s*$/gm),
    (match) => match[1],
  ).sort();
}

function sourceFunctionNames(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

describe("Supabase Edge function auth-config parity", () => {
  it("pins an explicit gateway JWT mode for every committed function", () => {
    expect(configuredFunctionNames()).toEqual(sourceFunctionNames());
  });

  it("lets custom-auth EcoWitt and MCP handlers receive requests before verifying them", () => {
    for (const functionName of ["ecowitt-real-ingest", "mcp"]) {
      expect(CONFIG).toMatch(
        new RegExp(
          `\\[functions\\.${functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*\\r?\\n\\s*verify_jwt\\s*=\\s*false`,
        ),
      );
    }
  });
});
