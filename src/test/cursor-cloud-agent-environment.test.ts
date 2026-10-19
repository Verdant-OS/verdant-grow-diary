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
    '  sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun',
    '  sudo ln -sfn "$HOME/.bun/bin/bunx" /usr/local/bin/bunx',
    "fi",
    "if [ ! -d node_modules ]; then",
    "  bun install --frozen-lockfile",
    "fi",
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

  it("rejects symlinks created outside the Bun bootstrap block (Bun installed elsewhere)", () => {
    const unconditional = [
      "set -euo pipefail",
      "if ! command -v bun >/dev/null 2>&1; then",
      "  curl -fsSL https://bun.sh/install | bash",
      "fi",
      'sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun',
      'sudo ln -sfn "$HOME/.bun/bin/bunx" /usr/local/bin/bunx',
      "if [ ! -d node_modules ]; then",
      "  bun install --frozen-lockfile",
      "fi",
      "bunx playwright install chromium",
    ].join("\n");
    expect(() => assertCursorCloudAgentInstallScript(unconditional)).toThrow(
      "cursor_cloud_agent_install_symlinks_outside_bun_bootstrap",
    );
  });

  it("rejects an unguarded frozen install that reinstalls provisioned node_modules", () => {
    const unguarded = validInstall.replace(
      "if [ ! -d node_modules ]; then\n  bun install --frozen-lockfile\nfi",
      "bun install --frozen-lockfile",
    );
    expect(unguarded).not.toContain("node_modules");
    expect(() => assertCursorCloudAgentInstallScript(unguarded)).toThrow(
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    );
  });

  it("rejects npx playwright bootstrap", () => {
    const withNpx = validInstall.replace("bunx playwright", "npx playwright");
    expect(() => assertCursorCloudAgentInstallScript(withNpx)).toThrow(
      "cursor_cloud_agent_install_uses_npx",
    );
  });

  const GUARD_BLOCK = [
    "if [ ! -d node_modules ]; then",
    "  bun install --frozen-lockfile",
    "fi",
  ].join("\n");

  it.each([
    [
      "a comment carries the guard text after an always-true condition",
      ["if true; then # if [ ! -d node_modules ]; then", "  bun install --frozen-lockfile", "fi"],
      "cursor_cloud_agent_install_has_comment",
    ],
    [
      "an always-true condition wraps the install",
      ["if true; then", "  bun install --frozen-lockfile", "fi"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "the guard condition is weakened",
      ["if [ ! -d node_modules ] || true; then", "  bun install --frozen-lockfile", "fi"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "the guard is inverted",
      ["if [ -d node_modules ]; then", "  bun install --frozen-lockfile", "fi"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "an else branch reinstalls provisioned dependencies",
      [
        "if [ ! -d node_modules ]; then",
        "  bun install --frozen-lockfile",
        "else",
        "  bun install --frozen-lockfile",
        "fi",
      ],
      "cursor_cloud_agent_install_unsupported_control_flow",
    ],
    [
      "a second, unguarded install follows the guarded one",
      [GUARD_BLOCK, "bun install --frozen-lockfile"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "a different unguarded bun install follows the guarded one",
      [GUARD_BLOCK, "bun install"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "the guard body runs another command too",
      ["if [ ! -d node_modules ]; then", "  bun install --frozen-lockfile", "  true", "fi"],
      "cursor_cloud_agent_install_frozen_lockfile_not_guarded",
    ],
    [
      "the guard block is never closed",
      ["if [ ! -d node_modules ]; then", "  bun install --frozen-lockfile"],
      "cursor_cloud_agent_install_unsupported_control_flow",
    ],
  ])("rejects a dependency guard where %s", (_label, replacement, expected) => {
    const mutated = validInstall.replace(GUARD_BLOCK, replacement.join("\n"));
    expect(mutated).not.toBe(validInstall);
    expect(() => assertCursorCloudAgentInstallScript(mutated)).toThrow(expected);
  });

  it("rejects a Bun symlink repeated outside the bootstrap block", () => {
    const repeated = validInstall.replace(
      "bunx playwright install chromium",
      [
        'sudo ln -sfn "$HOME/.bun/bin/bun" /usr/local/bin/bun',
        "bunx playwright install chromium",
      ].join("\n"),
    );
    expect(() => assertCursorCloudAgentInstallScript(repeated)).toThrow(
      "cursor_cloud_agent_install_symlinks_outside_bun_bootstrap",
    );
  });

  it("rejects a pipefail line that is not the first statement", () => {
    const late = [validInstall.replace("set -euo pipefail\n", ""), "set -euo pipefail"].join("\n");
    expect(() => assertCursorCloudAgentInstallScript(late)).toThrow(
      "cursor_cloud_agent_install_missing_pipefail",
    );
  });
});
