#!/usr/bin/env node
/**
 * check-pr-merge-ready — automate pre-merge readiness for a GitHub PR.
 *
 * Usage:
 *   node scripts/check-pr-merge-ready.mjs <pr-number> [--docs-only] [--json] [--require-all]
 *
 * Checks (fail closed unless noted):
 *   1. PR exists, is open, not draft
 *   2. mergeable === MERGEABLE (or true)
 *   3. GitHub status checks: no pending; no failed/cancelled (required set by default)
 *   4. Optional --docs-only: diff paths only under allowlisted docs/skill/governance
 *   5. Optional local: Sentinel-Version parity when governance files present
 *
 * Exit codes:
 *   0  ready to merge
 *   1  not ready (blocking findings)
 *   2  usage / infrastructure error (gh missing, network, bad PR id)
 *
 * Does NOT merge. Pair with: gh pr merge <n> --squash --delete-branch
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const docsOnly = args.includes("--docs-only");
const requireAll = args.includes("--require-all");
const prArg = args.find((a) => !a.startsWith("--"));

if (!prArg || !/^\d+$/.test(prArg)) {
  console.error(
    "Usage: node scripts/check-pr-merge-ready.mjs <pr-number> [--docs-only] [--json] [--require-all]",
  );
  process.exit(2);
}

const PR = prArg;

/** Checks whose failure is informational for many PRs (not merge blockers). */
const OPTIONAL_CHECK_NAMES = new Set([
  "Cursor Automation: Find vulnerabilities",
  "Supabase Preview",
  "CodeQL", // sometimes "skipping" shows as neutral
]);

/** When --docs-only, every changed path must match at least one prefix/pattern. */
const DOCS_ONLY_ALLOW = [
  /^\.claude\/skills\//,
  /^docs\//,
  /^AGENTS\.md$/,
  /^GEMINI\.md$/,
  /^CLAUDE\.md$/,
  /^\.grok\/rules\//,
  /^README\.md$/,
  /^\.github\/PULL_REQUEST_TEMPLATE/,
  // Merge-gate tooling shipped with the hygiene skill
  /^scripts\/check-pr-merge-ready\.mjs$/,
  /^scripts\/check-sentinel-version-parity\.mjs$/,
  /^package\.json$/,
];

function sh(cmd, argv, opts = {}) {
  try {
    const out = execFileSync(cmd, argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { ok: true, stdout: out, stderr: "" };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString?.() ?? "",
      stderr: err.stderr?.toString?.() ?? String(err.message ?? err),
      status: err.status ?? 1,
    };
  }
}

function ghJson(argv) {
  const r = sh("gh", argv);
  if (!r.ok) {
    return { ok: false, error: r.stderr || r.stdout || "gh failed" };
  }
  try {
    return { ok: true, data: JSON.parse(r.stdout) };
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}\n${r.stdout}` };
  }
}

const findings = [];
const notes = [];

// ---------------------------------------------------------------------------
// 1–2 PR metadata
// ---------------------------------------------------------------------------
const meta = ghJson([
  "pr",
  "view",
  PR,
  "--json",
  "number,title,state,isDraft,mergeable,mergeStateStatus,baseRefName,headRefName,url,statusCheckRollup,files",
]);

if (!meta.ok) {
  console.error(`Cannot load PR #${PR}: ${meta.error}`);
  process.exit(2);
}

const pr = meta.data;
if (pr.state !== "OPEN") {
  findings.push(`PR state is ${pr.state} (need OPEN)`);
}
if (pr.isDraft) {
  findings.push("PR is draft — mark ready before merge");
}
const mergeable = pr.mergeable;
if (mergeable !== "MERGEABLE" && mergeable !== true) {
  findings.push(`mergeable=${mergeable} (need MERGEABLE); mergeStateStatus=${pr.mergeStateStatus}`);
} else {
  notes.push(`mergeable OK (${mergeable}, status=${pr.mergeStateStatus})`);
}

// ---------------------------------------------------------------------------
// 3 Status checks
// ---------------------------------------------------------------------------
// Prefer rollup from pr view; also parse `gh pr checks` for pending.
const checksRaw = sh("gh", ["pr", "checks", PR, "--json", "name,state,bucket,workflow"]);
let checks = [];
if (checksRaw.ok) {
  try {
    checks = JSON.parse(checksRaw.stdout);
  } catch {
    notes.push("Could not parse gh pr checks --json; falling back to rollup only");
  }
}

if (!checks.length && Array.isArray(pr.statusCheckRollup)) {
  checks = pr.statusCheckRollup.map((c) => ({
    name: c.name,
    state: c.conclusion || c.status,
    bucket:
      c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.conclusion === "SKIPPED"
        ? "pass"
        : c.status === "IN_PROGRESS" || c.status === "QUEUED"
          ? "pending"
          : "fail",
    workflow: c.workflowName || "",
  }));
}

const pending = [];
const failed = [];
const passed = [];

for (const c of checks) {
  const name = c.name || "unknown";
  const state = String(c.state || c.bucket || "").toUpperCase();
  const bucket = String(c.bucket || "").toLowerCase();
  const optional = OPTIONAL_CHECK_NAMES.has(name) && !requireAll;

  const isPending =
    bucket === "pending" ||
    state === "PENDING" ||
    state === "IN_PROGRESS" ||
    state === "QUEUED" ||
    state === "EXPECTED";
  const isFail =
    bucket === "fail" ||
    state === "FAILURE" ||
    state === "FAILED" ||
    state === "CANCELLED" ||
    state === "TIMED_OUT" ||
    state === "ACTION_REQUIRED" ||
    state === "ERROR";
  const isPass =
    bucket === "pass" ||
    bucket === "skipping" ||
    state === "SUCCESS" ||
    state === "NEUTRAL" ||
    state === "SKIPPED" ||
    state === "PASS";

  if (isPending) pending.push(name);
  else if (isFail && !optional) failed.push(name);
  else if (isFail && optional) notes.push(`optional check failed (ignored): ${name}`);
  else if (isPass) passed.push(name);
  else notes.push(`unclassified check ${name} state=${state} bucket=${bucket}`);
}

if (pending.length) {
  findings.push(`Checks still pending: ${pending.join(", ")}`);
}
if (failed.length) {
  findings.push(`Required checks failed: ${failed.join(", ")}`);
}
if (passed.length) {
  notes.push(`${passed.length} check(s) passed/skipped`);
}

// ---------------------------------------------------------------------------
// 4 Docs-only path allowlist
// ---------------------------------------------------------------------------
if (docsOnly) {
  const files = Array.isArray(pr.files) ? pr.files : [];
  // files from gh may be { path } or need separate call
  let paths = files.map((f) => f.path).filter(Boolean);
  if (!paths.length) {
    const diff = sh("gh", ["pr", "diff", PR, "--name-only"]);
    if (diff.ok) {
      paths = diff.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }
  const bad = paths.filter((p) => !DOCS_ONLY_ALLOW.some((re) => re.test(p)));
  if (bad.length) {
    findings.push(`--docs-only violated by: ${bad.join(", ")}`);
  } else {
    notes.push(`docs-only OK (${paths.length} path(s))`);
  }
}

// ---------------------------------------------------------------------------
// 5 Local sentinel when available
// ---------------------------------------------------------------------------
const sentinelScript = resolve("scripts/check-sentinel-version-parity.mjs");
if (existsSync(sentinelScript)) {
  const r = spawnSync(process.execPath, [sentinelScript], {
    encoding: "utf8",
    env: process.env,
  });
  if (r.status === 0) {
    notes.push("Sentinel-Version parity OK (local)");
  } else {
    // Only block if this PR touches governance — otherwise note
    const touchGov =
      docsOnly ||
      (Array.isArray(pr.files) &&
        pr.files.some((f) =>
          /^(AGENTS\.md|GEMINI\.md|CLAUDE\.md|docs\/agents\/|\.grok\/rules\/)/.test(f.path || ""),
        ));
    const msg = (r.stdout || r.stderr || "").trim().split("\n").slice(0, 4).join(" | ");
    if (touchGov || docsOnly) {
      findings.push(`Sentinel-Version parity failed: ${msg || `exit ${r.status}`}`);
    } else {
      notes.push(`Sentinel local check non-zero (not blocking non-gov PR): ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const ready = findings.length === 0;
const report = {
  pr: PR,
  url: pr.url,
  title: pr.title,
  base: pr.baseRefName,
  head: pr.headRefName,
  ready,
  findings,
  notes,
  checks: { pending, failed, passed: passed.length },
  docsOnly,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`PR #${PR} — ${pr.title}`);
  console.log(`  ${pr.url}`);
  console.log(`  ${pr.baseRefName} ← ${pr.headRefName}`);
  console.log("");
  if (notes.length) {
    console.log("Notes:");
    for (const n of notes) console.log(`  · ${n}`);
    console.log("");
  }
  if (findings.length) {
    console.log("BLOCKERS:");
    for (const f of findings) console.log(`  ✗ ${f}`);
    console.log("");
    console.log("MERGE READY: NO");
  } else {
    console.log("MERGE READY: YES");
    console.log("");
    console.log("Suggested merge:");
    console.log(`  gh pr merge ${PR} --squash --delete-branch`);
  }
}

process.exit(ready ? 0 : 1);
