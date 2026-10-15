import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCursorCloudAgentInstallScript,
  parseCursorCloudAgentEnvironment,
} from "@/lib/cursorCloudAgentEnvironmentRules";

const ROOT = join(__dirname, "..", "..");
const ENVIRONMENT_JSON_PATH = join(ROOT, ".cursor", "environment.json");

describe("cursor cloud agent environment.json", () => {
  it("keeps Bun bootstrap before frozen lockfile install (regression #2181)", () => {
    const raw = readFileSync(ENVIRONMENT_JSON_PATH, "utf8");
    const environment = parseCursorCloudAgentEnvironment(raw);
    expect(() => assertCursorCloudAgentInstallScript(environment.install)).not.toThrow();
  });
});

describe("assertCursorCloudAgentInstallScript", () => {
  const validInstall = [
    "set -euo pipefail",
    "if ! command -v bun >/dev/null 2>&1; then",
    "  curl -fsSL https://bun.sh/install | bash",
    "fi",
    'sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun',
    'sudo ln -sfn "$HOME/.bun/bin/bunx" /usr/local/bin/bunx',
    "bun install --frozen-lockfile",
    "bunx playwright install chromium",
  ].join("\n");

  it("accepts the canonical ordering", () => {
    expect(() => assertCursorCloudAgentInstallScript(validInstall)).not.toThrow();
  });

  it("rejects frozen lockfile before Bun bootstrap", () => {
    const reversed = validInstall.replace(
      /set -euo pipefail[\s\S]*bun install --frozen-lockfile/,
      "set -euo pipefail\nbun install --frozen-lockfile\nif ! command -v bun >/dev/null 2>&1; then\nfi",
    );
    expect(() => assertCursorCloudAgentInstallScript(reversed)).toThrow(
      "cursor_cloud_agent_install_bun_bootstrap_after_frozen_lockfile",
    );
  });

  it("rejects npx playwright bootstrap", () => {
    const withNpx = validInstall.replace("bunx playwright", "npx playwright");
    expect(() => assertCursorCloudAgentInstallScript(withNpx)).toThrow(
      "cursor_cloud_agent_install_uses_npx",
    );
  });
});
