/**
 * Static contract for the default-branch dependency-security workflow.
 * Read-only: no GitHub API, network, secrets, or dependency installation.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/dependency-security-ci.yml"),
  "utf8",
);

function workflowRunCommands(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const commands: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;

    const [, indentation, scalar] = match;
    if (!/^[>|][+-]?$/.test(scalar.trim())) {
      commands.push(scalar.trim());
      continue;
    }

    const continuation: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = lines[next];
      if (nextLine.trim() === "") continue;
      const nextIndentation = nextLine.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndentation <= indentation.length) break;
      continuation.push(nextLine.trim());
      index = next;
    }
    commands.push(continuation.join(" "));
  }

  return commands;
}

describe("dependency-security CI workflow", () => {
  it("runs for pushes and pull requests targeting the real default branch", () => {
    expect(workflow).toMatch(/^\s{2}merge_group:\s*$/m);
    expect(workflow).toMatch(/^\s{2}push:\s*\r?\n\s{4}branches:\s*\[verdant-grow-diary\]\s*$/m);
    expect(workflow).toMatch(
      /^\s{2}pull_request:\s*\r?\n\s{4}branches:\s*\[verdant-grow-diary\]\s*$/m,
    );
    expect(workflow).not.toMatch(/branches:\s*\[[^\]]*\bmain\b/);
  });

  it("checks the canonical lockfile policy before installing dependencies", () => {
    const policyIndex = workflow.indexOf("- name: Lockfile policy check");
    const npmSemanticIndex = workflow.indexOf("- name: npm compatibility lock semantic check");
    const installIndex = workflow.indexOf("- name: Install dependencies (frozen lockfile)");

    expect(policyIndex).toBeGreaterThan(0);
    expect(npmSemanticIndex).toBeGreaterThan(policyIndex);
    expect(installIndex).toBeGreaterThan(npmSemanticIndex);
    expect(workflow.slice(policyIndex, npmSemanticIndex)).toContain("run: bun run check:lockfile");
    expect(workflow.slice(npmSemanticIndex, installIndex)).toContain(
      "run: bun run check:npm-lock-semantic",
    );
    expect(workflow.slice(installIndex)).toContain("run: bun install --frozen-lockfile");
  });

  it("keys caches only from bun.lock and runs the focused security contracts", () => {
    const cacheKeys = workflow.match(/key:\s*.*hashFiles\([^)]+\).*/g) ?? [];
    expect(cacheKeys.length).toBeGreaterThan(0);
    for (const key of cacheKeys) {
      expect(key).toContain("hashFiles('bun.lock')");
      expect(key).not.toMatch(/package-lock|bun\.lockb|yarn\.lock|pnpm-lock/);
    }

    for (const testFile of [
      "check-bun-lockfile-policy.test.ts",
      "check-dependency-security.test.ts",
      "dependency-security-ci-workflow.test.ts",
      "dependency-security-phase-a-contract.test.ts",
      "vite-dev-server-binding.test.ts",
    ]) {
      expect(workflow).toContain(testFile);
    }
  });

  it("keeps the focused security lane fail-closed and delegates repo-wide coverage", () => {
    const focusedEnd = workflow.indexOf("- name: Typecheck");
    const securitySteps = workflow.slice(
      workflow.indexOf("- name: Lockfile policy check"),
      focusedEnd,
    );

    expect(securitySteps).toContain("bun run check:deps");
    expect(securitySteps).toContain("bunx vitest run");
    expect(securitySteps).not.toMatch(/continue-on-error:\s*true/);

    const vitestCommands = workflowRunCommands(workflow).filter((command) =>
      command.startsWith("bunx vitest run"),
    );

    expect(vitestCommands).toHaveLength(1);
    for (const testFile of [
      "src/test/check-bun-lockfile-policy.test.ts",
      "src/test/check-dependency-security.test.ts",
      "src/test/dependency-security-ci-workflow.test.ts",
      "src/test/dependency-security-phase-a-contract.test.ts",
      "src/test/vite-dev-server-binding.test.ts",
    ]) {
      expect(vitestCommands[0]).toContain(testFile);
    }

    expect(workflow).not.toMatch(/- name:\s*Unit tests/);
    expect(workflow).toContain("Repo-wide Vitest coverage is intentionally delegated");
    expect(workflow).toContain("sharded `CI` and `Full Vitest Suite (PR gate)` workflows");

    const playwrightCommands = workflowRunCommands(workflow).filter((command) =>
      command.startsWith("bunx playwright test"),
    );
    expect(playwrightCommands).toEqual([
      "bunx playwright test e2e/auth-loading.spec.ts e2e/auth-route-protection.spec.ts e2e/legal-seo-metadata.spec.ts --project=chromium-mocked",
    ]);
    expect(playwrightCommands).not.toContain("bunx playwright test --project=chromium-mocked");
    expect(workflow).toContain("Repo-wide browser coverage");
    expect(workflow).toContain("existing dedicated E2E workflows");
  });
});
