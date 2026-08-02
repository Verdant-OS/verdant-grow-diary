import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(repoPath: string): string {
  return fs.readFileSync(path.join(ROOT, repoPath), "utf8").replace(/\r\n?/g, "\n");
}

function readPullRequestPaths(workflow: string): string[] {
  const pullRequestStart = workflow.indexOf("  pull_request:");
  expect(pullRequestStart, "workflow must define a pull_request trigger").toBeGreaterThanOrEqual(0);

  const pathsStart = workflow.indexOf("    paths:\n", pullRequestStart);
  expect(pathsStart, "pull_request trigger must define path filters").toBeGreaterThanOrEqual(0);

  const pathBlock = workflow.slice(pathsStart + "    paths:\n".length).split("\n\n", 1)[0];
  return pathBlock
    .split("\n")
    .map((line) => line.match(/^ {6}- "([^"]+)"$/)?.[1])
    .filter((value): value is string => Boolean(value));
}

describe("Symptom Check branch E2E workflow", () => {
  it("runs both the authenticated branch flow and public guide burden specs", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    const command = packageJson.scripts?.["test:symptom-check:e2e"];
    expect(command).toBe(
      "playwright test e2e/symptom-check-branch.spec.ts e2e/symptom-guides-burden.spec.ts --project=chromium-mocked",
    );
    expect(command).not.toContain("--reporter");

    const playwrightConfig = read("playwright.config.ts");
    expect(playwrightConfig).toContain('["list"]');
    expect(playwrightConfig).toContain('["html", { open: "never" }]');
    expect(playwrightConfig).toContain(
      '["json", { outputFile: "e2e/results/playwright-report.json" }]',
    );

    const workflow = read(".github/workflows/symptom-check-branch-e2e.yml");
    expect(workflow).toContain("run: bun run test:symptom-check:e2e");
  });

  it("reruns for every source, spec, and runner configuration dependency", () => {
    const workflow = read(".github/workflows/symptom-check-branch-e2e.yml");

    expect(readPullRequestPaths(workflow)).toEqual([
      "e2e/symptom-check-branch.spec.ts",
      "e2e/symptom-guides-burden.spec.ts",
      "src/**",
      ".env",
      ".env.development",
      "index.html",
      "playwright.config.ts",
      "vite.config.ts",
      "tailwind.config.ts",
      "postcss.config.js",
      "tsconfig.json",
      "tsconfig.json",
      "tsconfig.node.json",
      "package.json",
      "bun.lock",
      "bun.lockb",
      ".github/workflows/symptom-check-branch-e2e.yml",
    ]);
  });
});
