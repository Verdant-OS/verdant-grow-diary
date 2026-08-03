#!/usr/bin/env node
/**
 * Construct a local merge tree for PR ownership proof (ref C).
 *
 * Prefers GitHub's merge ref when available; otherwise merges head into base
 * and applies path-policy conflict strategies.
 *
 * Usage:
 *   node scripts/ci/construct-pr-merge-ref.mjs --pr 694
 *   node scripts/ci/construct-pr-merge-ref.mjs --base <sha> --head <sha>
 *   node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --apply --worktree /tmp/pr-694-merge
 *   node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --json
 *
 * Does not push. Does not update the PR branch.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAutoResolutions,
  buildResolutionPlan,
  classifyMergeOutcome,
  STRATEGIES,
} from "./merge-conflict-resolution-strategies.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = { json: false, apply: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--head") out.head = argv[++i];
    else if (a === "--worktree") out.worktree = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function git(args, cwd = root) {
  return run("git", args, cwd);
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function resolveAuthority(args) {
  let base = /** @type {string|undefined} */ (args.base);
  let head = /** @type {string|undefined} */ (args.head);
  const pr = args.pr ? String(args.pr) : undefined;

  if (pr) {
    const view = run("gh", [
      "pr",
      "view",
      pr,
      "--json",
      "baseRefOid,headRefOid,baseRefName,headRefName,number,url",
    ]);
    if (view.status !== 0) die(`gh pr view failed: ${view.stderr || view.stdout}`);
    const meta = JSON.parse(view.stdout);
    base = base || meta.baseRefOid;
    head = head || meta.headRefOid;
    return {
      pr: meta.number,
      url: meta.url,
      base_sha: base,
      head_sha: head,
      base_branch: meta.baseRefName,
      head_branch: meta.headRefName,
    };
  }

  if (!base || !head) die("Provide --pr N or both --base and --head");
  return {
    pr: null,
    url: null,
    base_sha: base,
    head_sha: head,
    base_branch: null,
    head_branch: null,
  };
}

function tryFetchGithubMergeRef(pr) {
  if (!pr) return null;
  const fetch = git(["fetch", "origin", `pull/${pr}/merge:refs/tmp/pr-${pr}-merge`]);
  if (fetch.status !== 0) {
    return { ok: false, error: fetch.stderr || fetch.stdout };
  }
  const rev = git(["rev-parse", `refs/tmp/pr-${pr}-merge`]);
  if (rev.status !== 0) return { ok: false, error: rev.stderr };
  return { ok: true, merge_sha: rev.stdout.trim(), source: "github_pull_merge_ref" };
}

function listConflicted(cwd) {
  const r = git(["diff", "--name-only", "--diff-filter=U"], cwd);
  if (r.status !== 0 && !r.stdout.trim()) return [];
  return r.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function constructLocalMerge(authority, worktree, apply, dryRun) {
  const wt = worktree || path.join("/tmp", `pr-merge-${authority.pr || "local"}-${Date.now()}`);
  if (!existsSync(wt)) {
    mkdirSync(path.dirname(wt), { recursive: true });
  }

  // Fresh worktree at base
  const add = git(["worktree", "add", "--detach", wt, authority.base_sha]);
  if (add.status !== 0) {
    return {
      ok: false,
      error: `worktree add failed: ${add.stderr || add.stdout}`,
      worktree: wt,
    };
  }

  // Merge head into base (same topology as GitHub PR merge)
  const merge = git(["merge", "--no-ff", "--no-edit", authority.head_sha], wt);
  const conflicted = listConflicted(wt);

  if (merge.status === 0 && conflicted.length === 0) {
    const sha = git(["rev-parse", "HEAD"], wt);
    return {
      ok: true,
      source: "local_clean_merge",
      merge_sha: sha.stdout.trim(),
      worktree: wt,
      conflicted: [],
      plan: buildResolutionPlan([]),
      outcome: classifyMergeOutcome({
        clean: true,
        conflicted: [],
        plan: buildResolutionPlan([]),
        remainingConflicts: [],
      }),
    };
  }

  const plan = buildResolutionPlan(conflicted);
  let remaining = conflicted.slice();
  /** @type {unknown} */
  let applied = null;

  if (apply || dryRun) {
    applied = applyAutoResolutions({
      cwd: wt,
      plan: plan.plan,
      dryRun,
      run: (cmd, args, cwd) => {
        const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
        return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      },
    });
    if (!dryRun) {
      remaining = listConflicted(wt);
    } else {
      remaining = plan.manual.concat(plan.regenerate);
    }
  }

  const outcome = classifyMergeOutcome({
    clean: false,
    conflicted,
    plan,
    remainingConflicts: remaining,
  });

  let merge_sha = null;
  if (!dryRun && apply && remaining.length === 0) {
    const commit = git(
      [
        "commit",
        "--no-edit",
        "-m",
        `ci: local merge ${authority.base_sha.slice(0, 7)}+${authority.head_sha.slice(0, 7)} with strategy auto-resolve`,
      ],
      wt,
    );
    if (commit.status === 0) {
      merge_sha = git(["rev-parse", "HEAD"], wt).stdout.trim();
    }
  }

  return {
    ok: remaining.length === 0 && Boolean(merge_sha),
    source: "local_merge_with_strategies",
    merge_sha,
    worktree: wt,
    conflicted,
    remaining_conflicts: remaining,
    plan,
    applied,
    outcome,
    merge_stderr: merge.stderr || merge.stdout,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node scripts/ci/construct-pr-merge-ref.mjs --pr 694
  node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --apply --worktree /tmp/pr-694-merge
  node scripts/ci/construct-pr-merge-ref.mjs --base <sha> --head <sha> --apply
  node scripts/ci/construct-pr-merge-ref.mjs --pr 694 --json

Strategies: ${Object.keys(STRATEGIES).join(", ")}
`);
    process.exit(0);
  }

  const authority = resolveAuthority(args);
  /** @type {Record<string, unknown>} */
  const report = {
    schema_version: "1.0",
    purpose: "construct_merge_ref_for_ownership_proof",
    authority,
    strategies_available: Object.keys(STRATEGIES),
  };

  // 1) Prefer GitHub merge ref
  if (authority.pr) {
    const gh = tryFetchGithubMergeRef(authority.pr);
    report.github_merge_ref = gh;
    if (gh?.ok) {
      report.merge_sha = gh.merge_sha;
      report.source = gh.source;
      report.outcome = {
        kind: "github_merge_ref",
        merge_interaction_risk: "low",
        note: "Use this SHA as MERGE for three-ref experiments",
      };
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`MERGE_SHA=${gh.merge_sha}`);
        console.log(`source=${gh.source}`);
        console.log("GitHub pull merge ref available — no local conflict resolution needed.");
      }
      process.exit(0);
    }
  }

  // 2) Local merge + strategies
  if (!args.apply && !args.dryRun) {
    report.note =
      "GitHub merge ref unavailable. Re-run with --apply [--worktree DIR] to construct local merge and auto-resolve policy paths.";
    report.hint = `node scripts/ci/construct-pr-merge-ref.mjs --pr ${authority.pr || "N"} --apply --json`;
    // Still compute what would happen: merge in temp with dry planning via merge-tree if possible
    const tree = git([
      "merge-tree",
      "--write-tree",
      authority.base_sha,
      authority.base_sha,
      authority.head_sha,
    ]);
    // git merge-tree usage varies by version; fall through to instruct apply
    report.merge_tree_probe = {
      status: tree.status,
      stdout: tree.stdout.slice(0, 500),
      stderr: tree.stderr.slice(0, 500),
    };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("GitHub merge ref not available.");
      console.log(report.note);
      console.log(report.hint);
    }
    process.exit(2);
  }

  const local = constructLocalMerge(
    authority,
    args.worktree ? String(args.worktree) : undefined,
    Boolean(args.apply),
    Boolean(args.dryRun),
  );
  Object.assign(report, local);

  // Optional artifact
  const outDir = path.join(root, "artifacts/ci");
  try {
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `pr-${authority.pr || "local"}-merge-construction.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
    report.artifact = outPath;
  } catch {
    /* non-fatal */
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(local.ok ? 0 : 1);
}

main();
