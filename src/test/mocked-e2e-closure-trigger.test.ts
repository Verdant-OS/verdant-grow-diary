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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether a `pull_request` trigger's `branches` or `paths` filters admit `target`. GitHub
 * reads the filters in order: a `!` pattern excludes, and the last pattern that matches
 * decides. `*` stops at `/`; `**` does not, and `**` followed by `/` also matches no
 * directory at all. A membership check passed with `!main` listed after `main`, which stops the
 * lane for PRs into main (CodeRabbit, #1221 round 16), and the same holds for a later
 * `!src/**` in `paths` (round 18).
 */
function filterAdmits(filters: readonly string[], target: string): boolean {
  let admitted = false;
  for (const filter of filters) {
    const negated = filter.startsWith("!");
    const pattern = negated ? filter.slice(1) : filter;
    if (/[?+[\]]/.test(pattern)) throw new Error(`filter syntax not modelled: ${filter}`);
    const source = pattern
      .split("**/")
      .map((segment) =>
        segment
          .split("**")
          .map((part) => part.split("*").map(escapeRegExp).join("[^/]*"))
          .join(".*"),
      )
      .join("(?:.*/)?");
    if (new RegExp(`^${source}$`).test(target)) admitted = !negated;
  }
  return admitted;
}

describe("mocked E2E closure lane — its trigger covers what the lane depends on", () => {
  const closure = pullRequestTrigger("mocked-e2e-unwired-closure.yml");

  it("runs on every PR target ci.yml runs on (CodeRabbit, #1221 rounds 9 and 16)", () => {
    const ciBranches = pullRequestTrigger("ci.yml").branches ?? [];
    expect(ciBranches.length).toBeGreaterThan(0);
    for (const target of ciBranches) {
      // ci.yml's filters are plain branch names, so each one is a PR target.
      expect(target).toMatch(/^[\w./-]+$/);
      // No `branches` key means every target.
      expect(filterAdmits(closure.branches ?? ["**"], target), target).toBe(true);
    }
  });

  it("reads filters the way GitHub does: in order, the last match wins", () => {
    expect(filterAdmits(["main", "verdant-grow-diary"], "main")).toBe(true);
    expect(filterAdmits(["main", "verdant-grow-diary", "!main"], "main")).toBe(false);
    expect(filterAdmits(["!main", "main"], "main")).toBe(true);
    expect(filterAdmits(["**", "!main"], "verdant-grow-diary")).toBe(true);
    expect(filterAdmits(["**", "!main"], "main")).toBe(false);
    expect(filterAdmits(["release/*"], "release/a")).toBe(true);
    expect(filterAdmits(["release/*"], "release/a/b")).toBe(false);
    expect(filterAdmits(["release/**"], "release/a/b")).toBe(true);
    expect(filterAdmits(["main"], "mainline")).toBe(false);
    expect(filterAdmits(["src/**", "!src/**/*.md"], "src/a/b.md")).toBe(false);
    expect(filterAdmits(["src/**", "!src/**/*.md"], "src/b.md")).toBe(false);
    expect(filterAdmits(["src/**", "!src/**/*.md"], "src/a/b.ts")).toBe(true);
    expect(filterAdmits(["e2e/**", "!e2e/**"], "e2e/x.spec.ts")).toBe(false);
    expect(filterAdmits([".env"], ".envrc")).toBe(false);
    // Syntax this model does not cover fails loudly instead of guessing.
    expect(() => filterAdmits(["v[0-9]"], "v1")).toThrow(/not modelled/);
  });

  it("triggers on source and spec changes and on every committed file its `bunx vite` webServer reads (Codex, #1221 rounds 6 and 9; CodeRabbit, rounds 13 and 18)", () => {
    // tsconfig.json: the Vite preset's tsconfigPaths resolves the `@/*` alias from it, so
    // a PR changing only it can break every import the specs boot (round 13). The filters
    // are read in order, so a later `!src/**` fails here where membership passed (round 18).
    const paths = closure.paths ?? ["**"];
    for (const file of [
      "src/lib/exampleRules.ts",
      "src/components/Example.tsx",
      "e2e/example.spec.ts",
      "playwright.config.ts",
      "vite.config.ts",
      "tsconfig.json",
      ".env",
      ".env.development",
    ]) {
      expect(filterAdmits(paths, file), file).toBe(true);
    }
  });
});
