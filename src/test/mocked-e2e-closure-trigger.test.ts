/**
 * The mocked E2E closure lane (#1221 P2(b)) is path-filtered at its trigger, and the
 * post-merge audit mirror (config/required-status-checks.json) lists it with
 * `alwaysRuns: false`: a PR that matches no filter legitimately produces no result.
 * So every omission from the trigger is a silent gap, not a red check. Round 9 found
 * two:
 *
 *   - `branches` named only verdant-grow-diary while ci.yml runs PRs to main as well,
 *     so a PR to main touching e2e/** or src/** got no result from this lane
 *     (CodeRabbit).
 *   - `paths` omitted `.env` and `.env.development`, which the lane's `bunx vite`
 *     webServer reads in dev mode; a PR changing only them could stop every spec
 *     booting or authenticating while the lane stayed absent (Codex).
 *
 * Both workflows are parsed and the resolved trigger objects are asserted on — no
 * pattern is matched against YAML text (AGENTS.md > Testing Standard).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";

type PullRequestTrigger = { branches?: string[]; paths?: string[] };

function pullRequestTrigger(workflow: string): PullRequestTrigger {
  const doc = loadYaml(
    readFileSync(resolve(__dirname, "../../.github/workflows", workflow), "utf8"),
  ) as Record<string, { pull_request?: PullRequestTrigger | null } | undefined>;
  // js-yaml 4 keeps `on` a string key; a YAML 1.1 loader would make it boolean true.
  const on = doc.on ?? doc["true"];
  return on?.pull_request ?? {};
}

describe("mocked E2E closure lane — its trigger covers what the lane depends on", () => {
  const closure = pullRequestTrigger("mocked-e2e-unwired-closure.yml");

  it("runs on every PR target ci.yml runs on (CodeRabbit, #1221 round 9)", () => {
    const ciBranches = pullRequestTrigger("ci.yml").branches ?? [];
    expect(ciBranches.length).toBeGreaterThan(0);
    expect(closure.branches).toEqual(expect.arrayContaining(ciBranches));
  });

  it("triggers on every committed file its `bunx vite` webServer reads (Codex, #1221 rounds 6 and 9; CodeRabbit, round 13)", () => {
    // tsconfig.json: the Vite preset's tsconfigPaths resolves the `@/*` alias from it, so
    // a PR changing only it can break every import the specs boot (round 13).
    expect(closure.paths).toEqual(
      expect.arrayContaining([
        "playwright.config.ts",
        "vite.config.ts",
        "tsconfig.json",
        ".env",
        ".env.development",
      ]),
    );
  });
});
