import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const runbookRelativePath = "docs/ecowitt-live-soil-bridge.md";
const canonicalDryRunCommand =
  "bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once";
const checklistRelativePath = "scripts/dev/print-ecowitt-pc-checklist.ts";
const packageJsonPath = resolve(repoRoot, "package.json");
const runbookPath = resolve(repoRoot, runbookRelativePath);
const checklistPath = resolve(repoRoot, checklistRelativePath);

const read = (path: string) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read(packageJsonPath)) as {
  scripts?: Record<string, string>;
};
const checklist = existsSync(checklistPath) ? read(checklistPath) : "";
const runbook = existsSync(runbookPath) ? read(runbookPath) : "";

describe("Ecowitt PC checklist script", () => {
  it("exists in the repo-standard scripts/dev directory", () => {
    expect(existsSync(checklistPath)).toBe(true);
  });

  it("has an operator-friendly package script", () => {
    expect(packageJson.scripts?.["dev:ecowitt-checklist"]).toBe(
      "bun run scripts/dev/print-ecowitt-pc-checklist.ts",
    );
  });

  it("points operators to the canonical live-bridge runbook", () => {
    expect(checklist).toContain(runbookRelativePath);
    expect(existsSync(runbookPath)).toBe(true);
    expect(runbook).toMatch(/EcoWitt Live Soil Bridge/i);
    expect(runbook).toMatch(/Mosquitto/i);
    expect(runbook).toMatch(/dry-run/i);
  });

  it("prints the required dry-run-first local PC operator flow", () => {
    expect(checklist).toMatch(/Ecowitt gateway[\s\S]*local PC bridge/i);
    expect(checklist).toMatch(/Mosquitto/i);
    expect(checklist).toMatch(/MQTT Explorer[\s\S]*payload/i);
    expect(checklist).toMatch(/VERDANT_TENT_ID[\s\S]*ECOWITT_SOIL_CHANNEL_MAP_JSON[\s\S]*same one tent/i);
    expect(checklist).toContain(canonicalDryRunCommand);
    expect(checklist).not.toMatch(/dev:ecowitt-mqtt:dry-run/);
    expect(checklist).toMatch(/Verdant one-message dry-run/i);
    expect(checklist).toMatch(/Only consider live send after a clean dry-run/i);
    expect(checklist).toMatch(/source and freshness labels/i);
  });

  it("prints the required token and secret handling reminders", () => {
    expect(checklist).toMatch(/Never paste the bridge token into chat/i);
    expect(checklist).toMatch(/Never paste service role keys/i);
    expect(checklist).toMatch(/API keys/i);
    expect(checklist).toMatch(/webhook secrets/i);
    expect(checklist).toMatch(/private env values/i);
  });

  it("prints the required no-write, no-automation, no-control safety reminders", () => {
    for (const phrase of [
      "No direct database writes.",
      "No service role key.",
      "No Action Queue.",
      "No alert creation.",
      "No automation.",
      "No equipment/device control.",
    ]) {
      expect(checklist).toContain(phrase);
    }
  });

  it("does not include network-call primitives or network libraries", () => {
    expect(checklist).not.toMatch(/\bfetch\s*\(/);
    expect(checklist).not.toMatch(/\baxios\b/);
    expect(checklist).not.toMatch(/\bXMLHttpRequest\b/);
    expect(checklist).not.toMatch(/\bWebSocket\b/);
    expect(checklist).not.toMatch(/\bnode:(http|https|net|tls|dgram)\b/);
  });

  it("does not import Supabase clients or any other module", () => {
    expect(checklist).not.toMatch(/@supabase\/supabase-js/);
    expect(checklist).not.toMatch(/integrations\/supabase/i);
    expect(checklist).not.toMatch(/^\s*import\s/m);
    expect(checklist).not.toMatch(/\brequire\s*\(/);
  });

  it("does not contain database write calls", () => {
    expect(checklist).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(checklist).not.toMatch(/\.from\s*\(/);
    expect(checklist).not.toMatch(/\brpc\s*\(/);
  });

  it("does not read environment variables or write files", () => {
    expect(checklist).not.toMatch(/process\.env/);
    expect(checklist).not.toMatch(
      /\b(writeFile|appendFile|createWriteStream|mkdir|rmSync|unlink|truncate)\b/,
    );
  });
});
