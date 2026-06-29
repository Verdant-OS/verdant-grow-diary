import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_PATH = join(__dirname, "..", "..", "fixtures", "demo-evidence-chain.json");
const LOADER_PATH = join(__dirname, "..", "lib", "demoEvidenceChainFixture.ts");

const BANNED = [
  "fake live",
  "fake-live",
  "auto execute",
  "auto-execute",
  "automatically executes",
  "device command",
  "controls your grow",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed with certainty",
  "raw_payload",
  "service_role",
  "bridge_token",
  "api_token",
  "access_token",
  "refresh_token",
  "jwt",
  "model_output",
];

describe("demo evidence chain fixture — static safety", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  const loaderText = readFileSync(LOADER_PATH, "utf8");

  it.each(BANNED)("fixture does not contain banned token: %s", (token) => {
    expect(fixtureText.toLowerCase()).not.toContain(token.toLowerCase());
  });

  it.each(BANNED)("loader does not contain banned token: %s", (token) => {
    // allow-list: loader may reference forbidden field set indirectly via
    // adapter import names, but must not emit any banned phrase literally.
    expect(loaderText.toLowerCase()).not.toContain(token.toLowerCase());
  });

  it("fixture never labels readings as live", () => {
    expect(fixtureText).not.toMatch(/"source"\s*:\s*"live"/);
  });

  it("loader does not import supabase client or fetch", () => {
    expect(loaderText).not.toMatch(/@\/integrations\/supabase/);
    expect(loaderText).not.toMatch(/\bfetch\(/);
  });
});
