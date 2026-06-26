#!/usr/bin/env node
/**
 * precommit-release-workbooks
 * ---------------------------
 * Lightweight pre-commit guard for release workbook artifacts.
 *
 * Only runs the full release-workbook verification when staged files
 * touch the workbook surface — so unrelated commits stay fast.
 *
 * On failure, prints a clear remediation pointer and exits non-zero.
 * Never prints env vars. Never fetches network resources.
 *
 * Exit codes:
 *   0 — no relevant staged files, or verification passed
 *   1 — verification failed (or git not available)
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const RELEVANT_PATTERNS = [
  /^docs\/artifacts\//,
  /^docs\/seed-production-tracking-workbook-spec\.md$/,
  /^docs\/commercial-release-review-traceability-workbook-spec\.md$/,
  /^scripts\/generate-release-workbook-templates\.mjs$/,
  /^scripts\/verify-release-workbooks\.mjs$/,
  /^scripts\/regenerate-release-workbooks\.mjs$/,
  /^scripts\/assert-release-traceability-mapping\.mjs$/,
  /^scripts\/assert-premium-workbook-access-docs\.mjs$/,
  /^scripts\/assert-premium-workbook-placeholder-safety\.mjs$/,
  /^src\/test\/(release-workbook|generate-release-workbook|assert-premium-workbook|assert-release-traceability)/,
];

export function pickRelevantStaged(staged) {
  return staged.filter((f) => RELEVANT_PATTERNS.some((re) => re.test(f)));
}

function getStaged() {
  const r = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`git diff --cached failed: ${r.stderr?.trim() || "unknown"}`);
  }
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function main() {
  let staged;
  try {
    staged = getStaged();
  } catch (err) {
    console.error(`precommit-release-workbooks: ${err.message}`);
    process.exit(1);
  }
  const relevant = pickRelevantStaged(staged);
  if (relevant.length === 0) {
    console.log("precommit-release-workbooks: no relevant staged files — skipping.");
    process.exit(0);
  }
  console.log(
    `precommit-release-workbooks: ${relevant.length} relevant staged file(s) — verifying.`,
  );
  const r = spawnSync("bun", ["run", "docs:verify-release-workbooks"], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0 || r.error) {
    console.error("");
    console.error(
      "Release workbook verification failed. Run `bun run docs:verify-release-workbooks:diff` for focused diagnostics.",
    );
    process.exit(1);
  }
  process.exit(0);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("precommit-release-workbooks.mjs");
if (invokedDirectly) main();
