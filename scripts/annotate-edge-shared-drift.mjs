#!/usr/bin/env node
/**
 * annotate-edge-shared-drift.mjs
 *
 * Runs the edge shared-lib drift checker and emits GitHub Actions
 * workflow commands (`::error file=<path>,line=<n>,title=...::<msg>`) so
 * every drifted mirror file / stale entry / missing manifest shows up as
 * a line-level annotation on the PR "Files changed" view.
 *
 * Exit code mirrors the underlying checker (0 clean, 1 drift). Also
 * prints a Job Summary table when $GITHUB_STEP_SUMMARY is set.
 *
 * Usage (locally or in CI):
 *   node scripts/annotate-edge-shared-drift.mjs
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import {
  collectFindings,
  formatAnnotation,
} from "./lib/annotate-edge-shared-drift-parse.mjs";


const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

const result = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "sync-edge-shared.mjs"), "--check"],
  { encoding: "utf8" },
);

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
process.stdout.write(stdout);
process.stderr.write(stderr);

const exitCode = result.status ?? 1;
if (exitCode === 0) process.exit(0);

const findings = collectFindings(stderr);

if (findings.length === 0) {
  // Non-zero exit but no parseable drift — pass through as a generic annotation.
  if (IN_ACTIONS) {
    console.log(
      `::error title=Edge mirror drift check failed::sync-edge-shared --check exited ${exitCode}. See job log.`,
    );
  }
  process.exit(exitCode);
}

if (IN_ACTIONS) {
  for (const f of findings) {
    console.log(formatAnnotation(f));
  }


  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath && existsSync(path.dirname(summaryPath))) {
    const rows = findings
      .map((f) => `| \`${f.file}\` | ${f.title} | ${f.message} |`)
      .join("\n");
    appendFileSync(
      summaryPath,
      [
        "### Edge shared-lib mirror drift",
        "",
        `${findings.length} file(s) out of sync with \`src/\`. Run \`bun run sync-edge-shared\` and commit.`,
        "",
        "| File | Issue | Fix |",
        "| --- | --- | --- |",
        rows,
        "",
      ].join("\n"),
    );
  }
}

process.exit(exitCode);
