/**
 * Static contract for the offline security-regression PR gate.
 *
 * The repository merges into `verdant-grow-diary`, while `main` remains a
 * legacy branch. Keep both branch triggers explicit so the required security
 * gate cannot silently disappear from the real merge path.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/security-regression.yml"),
  "utf8",
);

const docs = readFileSync(resolve(__dirname, "../../docs/security-regression-tests.md"), "utf8");

function triggerConfig(event: "pull_request" | "push"): string {
  const match = workflow.match(
    new RegExp(`^ {2}${event}:\\s*(?:\\r?\\n((?: {4}.*(?:\\r?\\n|$))*)|$)`, "m"),
  );

  expect(match, `${event} trigger must be configured`).toBeTruthy();
  return match?.[1] ?? "";
}

function normalizedBranch(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function configuredBranches(config: string): string[] {
  const lines = config.split(/\r?\n/);
  const index = lines.findIndex((line) => /^ {4}branches:\s*/.test(line));
  expect(index, "trigger must scope the supported branches explicitly").toBeGreaterThanOrEqual(0);

  const scalar = lines[index]?.match(/^ {4}branches:\s*(.+?)\s*$/)?.[1] ?? "";
  if (scalar) {
    const values =
      scalar.startsWith("[") && scalar.endsWith("]") ? scalar.slice(1, -1).split(",") : [scalar];
    return values.map(normalizedBranch).filter(Boolean);
  }

  const branches: string[] = [];
  for (const line of lines.slice(index + 1)) {
    const item = line.match(/^ {6}-\s*(.+?)\s*$/);
    if (!item) break;
    branches.push(normalizedBranch(item[1]));
  }
  return branches;
}

describe("security-regression workflow", () => {
  it("runs the required offline gate for unrestricted PRs and pushes on both supported branches", () => {
    const pullRequest = triggerConfig("pull_request");
    const push = triggerConfig("push");

    expect(configuredBranches(pullRequest)).toEqual(
      expect.arrayContaining(["main", "verdant-grow-diary"]),
    );
    expect(configuredBranches(push)).toEqual(
      expect.arrayContaining(["main", "verdant-grow-diary"]),
    );
    for (const config of [pullRequest, push]) {
      expect(config).not.toMatch(/^ {4}(?:paths|paths-ignore|types):\s*/m);
    }

    expect(workflow).toMatch(/^\s{2}merge_group:\s*$/m);
    expect(workflow).toContain("name: test:security-regression");
    const jobsIndex = workflow.indexOf("\njobs:");
    expect(jobsIndex, "security-regression job must remain configured").toBeGreaterThanOrEqual(0);
    expect(workflow.slice(jobsIndex)).not.toMatch(/^ {4}if:\s*/m);
  });

  it("documents branch protection against the default branch rather than the legacy branch", () => {
    expect(docs).toContain("every PR targeting `main` or `verdant-grow-diary`");
    expect(docs).toMatch(/required\s+status check on the repository's default branch/);
    expect(docs).not.toContain("status check on `main` in GitHub branch protection");
  });
});
