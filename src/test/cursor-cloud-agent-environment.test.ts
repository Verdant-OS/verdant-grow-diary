import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES,
  CURSOR_CLOUD_AGENT_CANONICAL_START_LINES,
  assertCursorCloudAgentInstallScript,
  assertCursorCloudAgentStartScript,
  parseCursorCloudAgentEnvironment,
} from "@/lib/cursorCloudAgentEnvironmentRules";

const ROOT = join(__dirname, "..", "..");
const ENVIRONMENT_JSON_PATH = join(ROOT, ".cursor", "environment.json");

describe("cursor cloud agent environment.json", () => {
  it("keeps Bun bootstrap before frozen lockfile install (regression #2181)", () => {
    const raw = readFileSync(ENVIRONMENT_JSON_PATH, "utf8");
    const environment = parseCursorCloudAgentEnvironment(raw);
    expect(() => assertCursorCloudAgentInstallScript(environment.install)).not.toThrow();
    expect(() => assertCursorCloudAgentStartScript(environment.start)).not.toThrow();
  });

  it("rejects an environment that has no start command", () => {
    const raw = JSON.stringify({ install: "set -euo pipefail\ntrue\n" });
    expect(() => parseCursorCloudAgentEnvironment(raw)).toThrow(
      "cursor_cloud_agent_environment_invalid_shape",
    );
  });
});

describe("assertCursorCloudAgentInstallScript", () => {
  const validInstall = CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES.join("\n");
  const pinnedInstaller = CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES.find((line) =>
    line.includes("bun.sh/install"),
  );
  if (!pinnedInstaller) throw new Error("pinned bun installer missing from canonical install");

  it("accepts the canonical ordering", () => {
    expect(() => assertCursorCloudAgentInstallScript(validInstall)).not.toThrow();
  });

  it("rejects frozen lockfile before Bun bootstrap", () => {
    const lines = [...CURSOR_CLOUD_AGENT_CANONICAL_INSTALL_LINES];
    const frozenAt = lines.indexOf("bun install --frozen-lockfile");
    const bootstrapAt = lines.indexOf("if ! command -v bun >/dev/null 2>&1; then");
    const reordered = [lines[0], lines[frozenAt], ...lines.slice(bootstrapAt)].join("\n");
    expect(bootstrapAt).toBeGreaterThan(0);
    expect(frozenAt).toBeGreaterThan(bootstrapAt);
    expect(() => assertCursorCloudAgentInstallScript(reordered)).toThrow(
      "cursor_cloud_agent_install_bun_bootstrap_after_frozen_lockfile",
    );
  });

  it("rejects symlinks created outside the Bun bootstrap block (Bun installed elsewhere)", () => {
    const unconditional = [
      "set -euo pipefail",
      "if ! command -v bun >/dev/null 2>&1; then",
      `  ${pinnedInstaller}`,
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
      "if [ ! -d node_modules ]; then\nbun install --frozen-lockfile\nfi",
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
    "bun install --frozen-lockfile",
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

  it("rejects an unpinned Bun installer", () => {
    const unpinned = validInstall.replace(
      pinnedInstaller,
      "curl -fsSL https://bun.sh/install | bash",
    );
    expect(unpinned).not.toContain('bash -s "bun-v1.3.14"');
    expect(() => assertCursorCloudAgentInstallScript(unpinned)).toThrow(
      "cursor_cloud_agent_install_bun_not_pinned",
    );
  });

  it("rejects a pipefail line that is not the first statement", () => {
    const late = [validInstall.replace("set -euo pipefail\n", ""), "set -euo pipefail"].join("\n");
    expect(() => assertCursorCloudAgentInstallScript(late)).toThrow(
      "cursor_cloud_agent_install_missing_pipefail",
    );
  });
});

describe("assertCursorCloudAgentStartScript", () => {
  const validStart = CURSOR_CLOUD_AGENT_CANONICAL_START_LINES.join("\n");

  it("accepts a start command that skips a server already on port 8080", () => {
    expect(validStart).toContain("http://127.0.0.1:8080/");
    expect(validStart).toContain("exec bun run dev -- --host 127.0.0.1 --port 8080");
    expect(() => assertCursorCloudAgentStartScript(validStart)).not.toThrow();
  });

  it("rejects a start command that always launches the dev server", () => {
    const always = ["set -euo pipefail", "exec bun run dev -- --host 127.0.0.1 --port 8080"].join(
      "\n",
    );
    expect(() => assertCursorCloudAgentStartScript(always)).toThrow(
      "cursor_cloud_agent_start_not_canonical",
    );
  });
});
