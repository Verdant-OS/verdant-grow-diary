#!/usr/bin/env node
/**
 * Notify on edge shared-lib drift.
 *
 * Called from CI immediately after the preflight/verify step reports
 * drift. Sends a GitHub notification via `gh` so the drift is visible
 * before the next build:
 *
 *   - pull_request  → posts (or updates) a single PR comment.
 *   - push / other  → opens (or updates) a single tracking issue.
 *
 * Idempotent: both paths key off a hidden HTML marker so repeated runs
 * update the same comment/issue instead of stacking new ones.
 *
 * Requires:
 *   - `gh` CLI (pre-installed on GitHub-hosted runners).
 *   - GH_TOKEN env var with `issues: write` and/or `pull-requests: write`.
 *   - GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_SHA, GITHUB_RUN_ID.
 *   - GITHUB_REF (for push) or PR_NUMBER (for pull_request).
 *
 * Exit code is always 0 — notification failures must not mask the
 * underlying drift failure the preflight already reported.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MARKER = "<!-- edge-shared-drift-notification -->";
const ISSUE_TITLE = "Edge shared-lib mirror is out of sync";
const LABEL = "edge-shared-drift";
const REPORT_PATH = process.env.DRIFT_REPORT_PATH || "edge-shared-drift-report.md";

const repo = process.env.GITHUB_REPOSITORY;
const event = process.env.GITHUB_EVENT_NAME || "";
const sha = process.env.GITHUB_SHA || "";
const runId = process.env.GITHUB_RUN_ID || "";
const runUrl = repo && runId
  ? `https://github.com/${repo}/actions/runs/${runId}`
  : "";

if (!repo) {
  console.warn("[notify-drift] GITHUB_REPOSITORY not set — skipping.");
  process.exit(0);
}

const reportBody = existsSync(REPORT_PATH)
  ? readFileSync(REPORT_PATH, "utf8").trim()
  : "_Drift report artifact not produced by this run._";

const body = [
  MARKER,
  `### 🔴 Edge shared-lib mirror is out of sync`,
  "",
  `The preflight check detected drift between \`src/\` and`,
  `\`supabase/functions/_shared/lib\`. Edge functions will fail to build`,
  `until the mirror is regenerated.`,
  "",
  `**Fix locally:**`,
  "",
  "```bash",
  "bun run sync-edge-shared",
  "git add supabase/functions/_shared/lib .sync-manifest.json",
  'git commit -m "chore: resync edge shared-lib mirror"',
  "```",
  "",
  `**Commit:** \`${sha.slice(0, 12)}\``,
  runUrl ? `**Workflow run:** ${runUrl}` : "",
  "",
  "<details><summary>Per-file drift report</summary>",
  "",
  reportBody.length > 55_000
    ? reportBody.slice(0, 55_000) + "\n\n_…truncated; see workflow artifact `edge-shared-drift-report`._"
    : reportBody,
  "",
  "</details>",
].filter(Boolean).join("\n");

function gh(args, opts = {}) {
  const res = spawnSync("gh", args, {
    encoding: "utf8",
    env: process.env,
    ...opts,
  });
  if (res.status !== 0) {
    console.warn(`[notify-drift] gh ${args.join(" ")} failed:\n${res.stderr}`);
  }
  return res;
}

function notifyPullRequest(prNumber) {
  // Find an existing marker-bearing comment; update it if present.
  const list = gh([
    "api",
    `repos/${repo}/issues/${prNumber}/comments`,
    "--paginate",
    "-q",
    `.[] | select(.body | contains("${MARKER}")) | .id`,
  ]);
  const existingId = list.stdout.trim().split("\n").filter(Boolean)[0];

  if (existingId) {
    gh([
      "api",
      "--method", "PATCH",
      `repos/${repo}/issues/comments/${existingId}`,
      "-f", `body=${body}`,
    ]);
    console.log(`[notify-drift] Updated PR comment ${existingId} on #${prNumber}.`);
  } else {
    gh(["pr", "comment", String(prNumber), "--repo", repo, "--body", body]);
    console.log(`[notify-drift] Posted PR comment on #${prNumber}.`);
  }
}

function notifyPush() {
  // Find an open tracking issue by marker; otherwise open one.
  const list = gh([
    "issue", "list",
    "--repo", repo,
    "--state", "open",
    "--search", `"${MARKER}" in:body`,
    "--json", "number,body",
    "-q", ".[0].number",
  ]);
  const existing = list.stdout.trim();

  if (existing) {
    gh([
      "issue", "comment", existing,
      "--repo", repo,
      "--body", body,
    ]);
    console.log(`[notify-drift] Commented on tracking issue #${existing}.`);
  } else {
    // Ensure label exists (ignore failure — label may already exist).
    gh([
      "label", "create", LABEL,
      "--repo", repo,
      "--color", "b60205",
      "--description", "Edge shared-lib mirror drift detected in CI",
    ]);
    const create = gh([
      "issue", "create",
      "--repo", repo,
      "--title", ISSUE_TITLE,
      "--label", LABEL,
      "--body", body,
    ]);
    console.log(`[notify-drift] Opened tracking issue:\n${create.stdout.trim()}`);
  }
}

const prNumber = process.env.PR_NUMBER
  || (event === "pull_request" && process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//)?.[1]);

if (event === "pull_request" && prNumber) {
  notifyPullRequest(prNumber);
} else {
  notifyPush();
}

process.exit(0);
