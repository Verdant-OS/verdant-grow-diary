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

/**
 * Check runs paginate at 100; a 35-context repo can exceed one page.
 *
 * `filter=all` is load-bearing, not tidiness. The endpoint defaults to
 * `filter=latest`, which returns only the most recent attempt per check — so
 * after a post-merge re-run the original pre-merge attempt is simply absent
 * from the payload. Combined with the merge-time cutoff that would report a
 * context as "finished only after the merge" when it had in fact completed
 * green beforehand: a false red produced by the very fix meant to prevent a
 * false green.
 */
async function fetchAllCheckRuns(sha) {
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await api(
      `/repos/${REPO}/commits/${sha}/check-runs?filter=all&per_page=100&page=${page}`,
    );
    const batch = data?.check_runs ?? [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

/**
 * The combined-status endpoint paginates too. Reading only the first page
 * means that after enough retries or post-merge updates, the status that
 * actually existed at `mergedAt` can sit on a later page — and the merge
 * cutoff would then call a required context late or missing on evidence that
 * was simply never fetched.
 *
 * Each status is stamped with the commit it came from: the payload carries the
 * sha once at the top level, but the audit needs it per observation to keep
 * landed and head evidence distinct.
 */
async function fetchCommitStatuses(sha) {
  const statuses = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = await api(`/repos/${REPO}/commits/${sha}/status?per_page=100&page=${page}`);
    const batch = data?.statuses ?? [];
    statuses.push(...batch.map((entry) => ({ ...entry, sha: data?.sha ?? sha })));
    if (batch.length < 100) break;
  }
  return statuses;
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
    // The context names are not the whole contract. `strict` is what forces a
    // head to be up to date with its base before those checks count; turning
    // it off silently admits results proven against a stale base, and the
    // context list would still match exactly.
    return diffPinnedAgainstRuleset(pinned.required, live, {
      pinnedStrict: pinned.strictRequiredStatusChecksPolicy,
      liveStrict: rule?.parameters?.strict_required_status_checks_policy,
    });
  } catch (error) {
    // A 404 is not an inability to verify — it is a verified answer. The
    // pinned ruleset does not exist, so nothing is enforcing the 35 contexts
    // this audit assumes are required. BLOCKED is advisory and would let an
    // otherwise-green run report PASS beside a ruleset that has been deleted
    // or replaced, so that case has to fail. BLOCKED stays for what it is for:
    // permission, dependency, and transient access failures.
    if (error.status === 404) {
      return {
        status: "FAIL",
        addedToRuleset: [],
        removedFromRuleset: [],
        strictPolicy: null,
        reason:
          `ruleset ${pinned.rulesetId} does not exist (404) — the pinned required ` +
          "contexts are not enforced by anything",
      };
    }
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

  // Two places the gating evidence can live, and which one applies depends on
  // how the merge happened:
  //
  //   queued   the merge queue builds a merge-group commit, runs the required
  //            checks on it, and that commit becomes the branch commit. The
  //            evidence is on the LANDED sha.
  //   direct   merged straight from the PR. The evidence is the pull_request
  //            run on the PR HEAD.
  //
  // Reading only the head would let an older green pull_request run vouch for
  // a queued merge whose merge-group run was red or unfinished. Reading only
  // the landed sha would miss direct merges entirely. So collect both and let
  // the merge-time cutoff discard whatever had not finished — for a direct
  // merge the landed sha carries post-merge `push` runs, which the cutoff
  // correctly refuses to credit.
  const evidenceShas = [SHA];
  if (prResolution.kind === PR_RESOLUTION.PULL_REQUEST && prResolution.headSha) {
    if (!evidenceShas.includes(prResolution.headSha)) evidenceShas.push(prResolution.headSha);
  }

  const [checkRunBatches, statusBatches, rulesetDrift] = await Promise.all([
    Promise.all(evidenceShas.map((sha) => fetchAllCheckRuns(sha))),
    Promise.all(evidenceShas.map((sha) => fetchCommitStatuses(sha))),
    resolveRulesetDrift(pinned),
  ]);
  const checkRuns = checkRunBatches.flat();
  const commitStatuses = statusBatches.flat();

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
