/**
 * Post-merge audit: did the gates that guard the deploy branch actually run?
 *
 * Runs after a commit lands on `verdant-grow-diary`. Resolves the pull request
 * that produced it, reads the check runs and commit statuses recorded against
 * that PR's head SHA, and fails when a context the repo relies on was red,
 * absent, or still running when the merge happened.
 *
 * Required checks are reported against the PR head, not the merge commit, so
 * auditing the merge commit's own SHA would find nothing and pass vacuously.
 *
 * All verdict logic lives in scripts/lib/requiredCheckAuditRules.mjs. This file
 * only does IO: fetch, print, exit.
 *
 * Environment:
 *   GH_TOKEN            required. Needs checks:read, statuses:read, pull-requests:read.
 *   GITHUB_REPOSITORY   owner/repo. Defaults to Verdant-OS/verdant-grow-diary.
 *   AUDIT_SHA           commit to audit. Defaults to GITHUB_SHA.
 *   AUDIT_BRANCH        base branch a PR must target. Defaults to verdant-grow-diary.
 *   RULESET_ADMIN_TOKEN optional. A PAT with Administration:read. Without it the
 *                       pinned-list-versus-live-ruleset axis reports BLOCKED.
 *                       GITHUB_TOKEN can never satisfy this: the Actions
 *                       `permissions:` block has no administration scope.
 *   GITHUB_STEP_SUMMARY optional. Markdown report is appended when set.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIT_VERDICT,
  PR_RESOLUTION,
  auditRequiredChecks,
  diffPinnedAgainstRuleset,
  formatAuditReport,
} from "./lib/requiredCheckAuditRules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config/required-status-checks.json");

const REPO = process.env.GITHUB_REPOSITORY || "Verdant-OS/verdant-grow-diary";
const SHA = process.env.AUDIT_SHA || process.env.GITHUB_SHA || "";
const BRANCH = process.env.AUDIT_BRANCH || "verdant-grow-diary";
const TOKEN = process.env.GH_TOKEN || "";
const ADMIN_TOKEN = process.env.RULESET_ADMIN_TOKEN || "";

function fail(message) {
  console.error(`required-check-audit: ${message}`);
  process.exit(1);
}

async function api(path, { token = TOKEN } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "verdant-required-check-audit",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`GitHub API ${response.status} for ${path}: ${body.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/** Check runs paginate at 100; a 35-context repo can exceed one page. */
async function fetchAllCheckRuns(sha) {
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await api(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100&page=${page}`);
    const batch = data?.check_runs ?? [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

async function fetchCommitStatuses(sha) {
  const data = await api(`/repos/${REPO}/commits/${sha}/status?per_page=100`);
  return data?.statuses ?? [];
}

/**
 * Find the merged PR that produced this commit. A direct push has none — that
 * is not "nothing to check", it is the strongest finding the audit can make.
 */
async function resolvePullRequest(sha) {
  const pulls = await api(`/repos/${REPO}/commits/${sha}/pulls?per_page=100`);
  const merged = (Array.isArray(pulls) ? pulls : []).filter(
    (pr) => pr?.merged_at && pr?.base?.ref === BRANCH,
  );
  if (merged.length === 0) return { kind: PR_RESOLUTION.NO_PULL_REQUEST };
  // Newest merge wins; number breaks ties so the choice is deterministic.
  merged.sort((a, b) =>
    a.merged_at === b.merged_at ? b.number - a.number : a.merged_at < b.merged_at ? 1 : -1,
  );
  const pr = merged[0];
  return {
    kind: PR_RESOLUTION.PULL_REQUEST,
    number: pr.number,
    headSha: pr.head?.sha ?? "",
    mergedBy: pr.merged_by?.login ?? "",
    // Load-bearing: evidence is read as of this instant, so a check that
    // finished after the merge cannot retroactively vouch for it.
    mergedAt: pr.merged_at ?? null,
  };
}

async function resolveRulesetDrift(pinned) {
  if (!ADMIN_TOKEN) {
    return {
      status: "BLOCKED",
      reason:
        "RULESET_ADMIN_TOKEN not set — the pinned list could not be compared with the live " +
        "ruleset. GITHUB_TOKEN cannot read /rulesets (no administration scope exists for it).",
    };
  }
  try {
    const ruleset = await api(`/repos/${REPO}/rulesets/${pinned.rulesetId}`, {
      token: ADMIN_TOKEN,
    });
    const rule = (ruleset?.rules ?? []).find((r) => r.type === "required_status_checks");
    const live = (rule?.parameters?.required_status_checks ?? []).map((c) => c.context);
    return diffPinnedAgainstRuleset(pinned.required, live);
  } catch (error) {
    return { status: "BLOCKED", reason: `ruleset read failed: ${error.message}` };
  }
}

async function main() {
  if (!TOKEN) fail("GH_TOKEN is not set");
  if (!SHA) fail("no commit to audit (set AUDIT_SHA or GITHUB_SHA)");

  let pinned;
  try {
    pinned = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    fail(`could not read ${CONFIG_PATH}: ${error.message}`);
  }

  const prResolution = await resolvePullRequest(SHA);
  const evidenceSha =
    prResolution.kind === PR_RESOLUTION.PULL_REQUEST ? prResolution.headSha || SHA : SHA;

  const [checkRuns, commitStatuses, rulesetDrift] = await Promise.all([
    fetchAllCheckRuns(evidenceSha),
    fetchCommitStatuses(evidenceSha),
    resolveRulesetDrift(pinned),
  ]);

  const result = auditRequiredChecks({
    pinned,
    checkRuns,
    commitStatuses,
    prResolution,
    rulesetDrift,
  });

  const report = formatAuditReport(result, {
    sha: SHA,
    prNumber: prResolution.kind === PR_RESOLUTION.PULL_REQUEST ? prResolution.number : null,
  });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }

  if (result.verdict === AUDIT_VERDICT.FAIL) {
    console.error("");
    console.error(
      "required-check-audit: FAIL — a merge landed on " +
        `${BRANCH} without the gates it is supposed to have passed.`,
    );
    process.exit(1);
  }
}

main().catch((error) => fail(error.stack || error.message));
