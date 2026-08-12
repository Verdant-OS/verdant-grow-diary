/**
 * Workflow branch-filter liveness guard.
 *
 * Regression class: a workflow whose push/pull_request filters name only
 * branches that never receive pushes or PRs (this repo's default branch is
 * `verdant-grow-diary`; a stale `main` also exists) silently never runs.
 * That is how the security-regression gate sat dead while its secret scan
 * was red on the default branch (#580/#581).
 *
 * Rules enforced here:
 *  1. Every workflow with a push or pull_request trigger must either
 *     include the default branch in its branch filter (or have no branch
 *     filter, which matches all branches), or be registered in
 *     INTENTIONALLY_DORMANT below with a reason.
 *  2. Every INTENTIONALLY_DORMANT workflow must still exist and must carry
 *     a `# dormant:` comment in the file itself so the reason is visible
 *     where the next editor will look.
 *  3. The extractor FAILS CLOSED: a push/pull_request block whose branch
 *     filter cannot be confidently parsed fails the test instead of
 *     silently passing — update the extractor, don't loosen the guard.
 *  4. A non-dormant workflow that explicitly watches stale `main` pushes
 *     must also watch the real default branch, so post-merge evidence is not
 *     lost when a PR result is green but the deploy-branch merge is broken.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DEFAULT_BRANCH = "verdant-grow-diary";
const WORKFLOWS_DIR = resolve(__dirname, "../../.github/workflows");

/**
 * Workflows that deliberately do NOT run on the default branch. Every entry
 * needs a reason; the file itself must carry a matching `# dormant:` comment.
 */
const INTENTIONALLY_DORMANT: Record<string, string> = {
  // #581 disposition sweep, 2026-07-30; keep alphabetized.
  "datadog-synthetics.yml":
    "monitors deployed production synthetics (needs DD_API_KEY/DD_APP_KEY); per-merge default-branch runs are a separate decision",
  "gamification-staging-smoke.yml":
    "needs staging Supabase secrets; payload steps have a broken env-scope gate and have never executed — fix gating before retargeting",
  "pheno-disabled-compare-e2e.yml":
    "needs Playwright browsers, E2E account secrets, and a deployed E2E_BASE_URL; run via workflow_dispatch against a configured environment",
  "release-receipt-ci.yml":
    "all validation steps are continue-on-error (no gate value over ci.yml); contract test pins its branch literal — retargeting is its own slice",
};

interface TriggerBranches {
  trigger: "push" | "pull_request";
  /** null = no branch filter (matches every branch). */
  branches: string[] | null;
  /** true when a filter exists but could not be parsed confidently. */
  unparseable: boolean;
}

/**
 * Extract push/pull_request branch filters from a workflow's `on:` block.
 * Handles the two shapes used in this repo:
 *   branches: [main, verdant-grow-diary]   (inline array, quotes optional)
 *   branches:
 *     - main                                (dash list)
 * Anything else inside a push/pull_request block that mentions `branches`
 * is reported unparseable (fail closed).
 */
export function extractTriggerBranches(yamlText: string): TriggerBranches[] {
  const lines = yamlText.split(/\r?\n/);
  const results: TriggerBranches[] = [];

  const onIndex = lines.findIndex((l) => /^(on|"on"):\s*$/.test(l.trim()) || /^on:\s*$/.test(l));
  if (onIndex === -1) return results;

  // The `on:` block ends at the next top-level (column-0, non-comment) key.
  let onEnd = lines.length;
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_"']/.test(lines[i]) && !lines[i].startsWith(" ")) {
      onEnd = i;
      break;
    }
  }

  for (const trigger of ["push", "pull_request"] as const) {
    const trigRe = new RegExp(`^\\s{2}${trigger}:\\s*(#.*)?$`);
    const trigBare = new RegExp(`^\\s{2}${trigger}:\\s*\\{\\}\\s*(#.*)?$`);
    let trigIndex = -1;
    for (let i = onIndex + 1; i < onEnd; i += 1) {
      if (trigRe.test(lines[i]) || trigBare.test(lines[i])) {
        trigIndex = i;
        break;
      }
    }
    if (trigIndex === -1) continue;

    // The trigger block ends at the next line with indent <= 2 (a sibling
    // trigger or the end of `on:`).
    let trigEnd = onEnd;
    for (let i = trigIndex + 1; i < onEnd; i += 1) {
      const m = lines[i].match(/^(\s*)\S/);
      if (m && m[1].length <= 2) {
        trigEnd = i;
        break;
      }
    }

    let branches: string[] | null = null;
    let unparseable = false;
    for (let i = trigIndex + 1; i < trigEnd; i += 1) {
      const line = lines[i];
      if (!/^\s+branches(-ignore)?:/.test(line)) continue;
      if (/branches-ignore:/.test(line)) {
        // Rare shape; treat as needing human eyes rather than guessing.
        unparseable = true;
        break;
      }
      const inline = line.match(/branches:\s*\[([^\]]*)\]/);
      if (inline) {
        branches = inline[1]
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        break;
      }
      if (/branches:\s*(#.*)?$/.test(line)) {
        // Dash-list form on the following deeper-indented lines.
        const listIndent = (line.match(/^(\s+)/) as RegExpMatchArray)[1].length;
        const items: string[] = [];
        for (let j = i + 1; j < trigEnd; j += 1) {
          const item = lines[j].match(/^(\s+)-\s*(.+?)\s*(#.*)?$/);
          if (!item || item[1].length <= listIndent) break;
          items.push(item[2].replace(/^["']|["']$/g, ""));
        }
        if (items.length === 0) {
          unparseable = true;
        } else {
          branches = items;
        }
        break;
      }
      unparseable = true;
      break;
    }

    results.push({ trigger, branches, unparseable });
  }

  return results;
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
}

describe("workflow branch-filter liveness", () => {
  it("every push/pull_request workflow reaches the default branch or is registered dormant", () => {
    const dead: string[] = [];
    const broken: string[] = [];

    for (const file of workflowFiles()) {
      const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      const triggers = extractTriggerBranches(text);
      if (triggers.length === 0) continue; // schedule/dispatch-only — fine.

      for (const t of triggers) {
        if (t.unparseable) {
          broken.push(`${file} (${t.trigger}): branch filter present but not parseable`);
        }
      }
      const anyReachesDefault = triggers.some(
        (t) => !t.unparseable && (t.branches === null || t.branches.includes(DEFAULT_BRANCH)),
      );
      if (!anyReachesDefault && !(file in INTENTIONALLY_DORMANT)) {
        dead.push(
          `${file}: filters [${triggers
            .map((t) => `${t.trigger}: ${t.branches?.join("|") ?? "all"}`)
            .join("; ")}] never match ${DEFAULT_BRANCH}`,
        );
      }
    }

    expect(
      broken,
      `unparseable branch filters (update the extractor):\n${broken.join("\n")}`,
    ).toEqual([]);
    expect(
      dead,
      `workflows that can never run (add ${DEFAULT_BRANCH} to their filters or register them in INTENTIONALLY_DORMANT with a reason):\n${dead.join("\n")}`,
    ).toEqual([]);
  });

  it("every registered dormant workflow still exists and documents itself", () => {
    const files = new Set(workflowFiles());
    for (const [file, reason] of Object.entries(INTENTIONALLY_DORMANT)) {
      expect(files.has(file), `stale INTENTIONALLY_DORMANT entry: ${file}`).toBe(true);
      expect(reason.trim().length, `empty dormancy reason for ${file}`).toBeGreaterThan(0);
      const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      expect(
        /#\s*dormant:/i.test(text),
        `${file} is registered dormant but carries no "# dormant:" comment explaining why`,
      ).toBe(true);
    }
  });

  it("keeps default-branch push parity for workflows that still watch main", () => {
    const missingDefault: string[] = [];

    for (const file of workflowFiles()) {
      if (file in INTENTIONALLY_DORMANT) continue;
      const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      const push = extractTriggerBranches(text).find((trigger) => trigger.trigger === "push");
      if (!push || push.unparseable || push.branches === null) continue;
      if (push.branches.includes("main") && !push.branches.includes(DEFAULT_BRANCH)) {
        missingDefault.push(file);
      }
    }

    expect(
      missingDefault,
      `workflows watching main pushes without ${DEFAULT_BRANCH}:\n${missingDefault.join("\n")}`,
    ).toEqual([]);
  });

  it("the default branch constant matches the repository", () => {
    // If the default branch is ever renamed, this test must be updated
    // deliberately along with every workflow filter — fail loudly here.
    const ci = readFileSync(join(WORKFLOWS_DIR, "ci.yml"), "utf8");
    expect(ci).toContain(DEFAULT_BRANCH);
  });
});
