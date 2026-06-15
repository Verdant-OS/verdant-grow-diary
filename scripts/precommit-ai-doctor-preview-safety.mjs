#!/usr/bin/env node
/**
 * Optional pre-commit hook runner for the AI Doctor preview safety
 * scanner. Inspects staged files via `git diff --cached --name-only`
 * and runs the scanner only when a relevant file is staged:
 *
 *   - scripts/assert-ai-doctor-preview-safety.mjs
 *   - scripts/config/ai-doctor-preview-safety-allowlist.json
 *   - src/test/ai-doctor-preview-safety-scanner.test.ts
 *   - any file discovered as a preview target by the scanner
 *
 * If no relevant file is staged, prints a skip message and exits 0.
 *
 * This script never installs a git hook. Operators can wire it manually:
 *
 *   echo '#!/bin/sh' > .git/hooks/pre-commit
 *   echo 'node scripts/precommit-ai-doctor-preview-safety.mjs' \\
 *     >> .git/hooks/pre-commit
 *   chmod +x .git/hooks/pre-commit
 *
 * Exit codes:
 *   0 — no relevant staged files, or scanner passed
 *   1 — scanner failed, or git not available
 */
import { spawnSync } from "node:child_process";
import { discoverTargets } from "./assert-ai-doctor-preview-safety.mjs";

const HOOK_OWN_FILES = new Set([
  "scripts/assert-ai-doctor-preview-safety.mjs",
  "scripts/precommit-ai-doctor-preview-safety.mjs",
  "scripts/config/ai-doctor-preview-safety-allowlist.json",
  "src/test/ai-doctor-preview-safety-scanner.test.ts",
]);

export function pickRelevantStaged(stagedFiles, targets) {
  const targetSet = new Set(targets);
  return stagedFiles.filter(
    (f) => HOOK_OWN_FILES.has(f) || targetSet.has(f),
  );
}

function getStagedFiles() {
  const res = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(
      `git diff --cached failed: ${res.stderr?.trim() || "unknown error"}`,
    );
  }
  return res.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function runScanner() {
  const res = spawnSync(
    process.execPath,
    ["scripts/assert-ai-doctor-preview-safety.mjs"],
    { stdio: "inherit" },
  );
  return res.status ?? 1;
}

function main() {
  let staged;
  try {
    staged = getStagedFiles();
  } catch (err) {
    console.error(`precommit-ai-doctor-preview-safety: ${err.message}`);
    process.exit(1);
  }
  const targets = discoverTargets();
  const relevant = pickRelevantStaged(staged, targets);
  if (relevant.length === 0) {
    console.log(
      "precommit-ai-doctor-preview-safety: no relevant staged files — skipping.",
    );
    process.exit(0);
  }
  console.log(
    `precommit-ai-doctor-preview-safety: scanning (${relevant.length} relevant staged file(s)).`,
  );
  process.exit(runScanner());
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("precommit-ai-doctor-preview-safety.mjs");
if (invokedDirectly) main();
