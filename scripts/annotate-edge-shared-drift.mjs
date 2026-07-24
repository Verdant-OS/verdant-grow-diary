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
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  collectFindings,
  enrichFinding,
  formatAnnotation,
} from "./lib/annotate-edge-shared-drift-parse.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";
const MIRROR_REL = "supabase/functions/_shared/lib";

// Pin the generator's tmp output dir so we can diff committed mirror
// files against expected content to compute a real "first differing
// line" number for DRIFT findings.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "edge-shared-annot-"));

const result = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "sync-edge-shared.mjs"), "--check"],
  { encoding: "utf8", env: { ...process.env, SYNC_TMP_OUT: tmpDir } },
);

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
process.stdout.write(stdout);
process.stderr.write(stderr);

const exitCode = result.status ?? 1;
if (exitCode === 0) {
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

const rawFindings = collectFindings(stderr);

const safeRead = (rel) => {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
};
const safeReadExpected = (relInMirror) => {
  try {
    return readFileSync(path.join(tmpDir, relInMirror), "utf8");
  } catch {
    return null;
  }
};

const findings = rawFindings.map((f) =>
  enrichFinding(f, {
    readFile: safeRead,
    readExpected: safeReadExpected,
    mirrorRel: MIRROR_REL,
  }),
);

// Best-effort tmp cleanup — we've already read everything we needed.
rmSync(tmpDir, { recursive: true, force: true });

if (findings.length === 0) {
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
      .map((f) => {
        const loc = f.line ? `:${f.line}${f.col ? `:${f.col}` : ""}` : "";
        return `| \`${f.file}${loc}\` | ${f.title} | ${f.message} |`;
      })
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

