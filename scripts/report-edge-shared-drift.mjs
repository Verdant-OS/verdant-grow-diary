#!/usr/bin/env node
/**
 * report-edge-shared-drift.mjs
 *
 * Human-readable drift report for the edge shared-lib mirror.
 *
 * Regenerates the mirror into a tmp directory (via sync-edge-shared.mjs
 * --check with SYNC_TMP_OUT) and, for every file the drift checker
 * flagged, prints a Markdown table showing:
 *   - repo-relative path
 *   - drift kind (missing / drift / stale / entry-not-rewritten / manifest)
 *   - expected sha256 (from freshly regenerated content, or "—")
 *   - actual sha256 (from committed file on disk, or "—")
 *   - short human explanation
 *
 * Writes the report to:
 *   - stdout (always)
 *   - $DRIFT_REPORT_OUT if set (path to a .md file), else
 *     dist/edge-shared-drift-report.md when a dist/ dir exists
 *   - $GITHUB_STEP_SUMMARY when running in GitHub Actions
 *
 * Exit code mirrors the underlying checker: 0 clean, 1 drift.
 *
 * Usage:
 *   node scripts/report-edge-shared-drift.mjs
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { collectFindings } from "./lib/annotate-edge-shared-drift-parse.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const MIRROR_REL = "supabase/functions/_shared/lib";
const MANIFEST_REL = `${MIRROR_REL}/.sync-manifest.json`;
const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "edge-shared-report-"));

const checkResult = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "sync-edge-shared.mjs"), "--check"],
  { encoding: "utf8", env: { ...process.env, SYNC_TMP_OUT: tmpDir } },
);
const exitCode = checkResult.status ?? 1;
const stderr = checkResult.stderr ?? "";

if (exitCode === 0) {
  rmSync(tmpDir, { recursive: true, force: true });
  const clean = "✅ Edge shared-lib mirror is in sync with `src/`. No drift detected.\n";
  process.stdout.write(clean);
  writeReport(clean);
  process.exit(0);
}

const findings = collectFindings(stderr);

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
function shortHash(hex) {
  return hex ? hex.slice(0, 12) : "—";
}
function readOr(absPath) {
  try {
    return readFileSync(absPath);
  } catch {
    return null;
  }
}
function hashOf(absPath) {
  const buf = readOr(absPath);
  return buf ? sha256Hex(buf) : null;
}

function kindLabel(title) {
  switch (title) {
    case "Edge mirror file missing":
      return "missing";
    case "Edge mirror drift":
      return "drift";
    case "Stale edge mirror file":
      return "stale";
    case "Edge mirror manifest drift":
      return "manifest-drift";
    case "Edge mirror manifest missing":
      return "manifest-missing";
    case "Edge entry not rewritten":
      return "entry-not-rewritten";
    default:
      return "unknown";
  }
}

function relInMirror(fileRel) {
  return fileRel.startsWith(MIRROR_REL + "/")
    ? fileRel.slice(MIRROR_REL.length + 1)
    : null;
}

const rows = findings.map((f) => {
  const actualPath = path.join(ROOT, f.file);
  const actualHash = hashOf(actualPath);
  let expectedHash = null;

  if (f.file === MANIFEST_REL) {
    expectedHash = hashOf(path.join(tmpDir, ".sync-manifest.json"));
  } else {
    const rel = relInMirror(f.file);
    if (rel) expectedHash = hashOf(path.join(tmpDir, rel));
  }

  return {
    file: f.file,
    kind: kindLabel(f.title),
    expected: expectedHash,
    actual: actualHash,
    message: f.message,
  };
});

// Cleanup tmp — we've hashed everything we need.
rmSync(tmpDir, { recursive: true, force: true });

const header = [
  "# Edge shared-lib drift report",
  "",
  `**Status:** ❌ ${findings.length} file(s) out of sync with \`src/\`.`,
  "",
  "Run `bun run sync-edge-shared` locally and commit the regenerated mirror.",
  "",
  "| File | Kind | Expected sha256 | Actual sha256 | Notes |",
  "| --- | --- | --- | --- | --- |",
];

const body = rows.length
  ? rows.map((r) => {
      const exp = r.expected ? `\`${shortHash(r.expected)}…\`` : "—";
      const act = r.actual ? `\`${shortHash(r.actual)}…\`` : "—";
      // Escape pipes in messages so the Markdown table survives.
      const msg = r.message.replace(/\|/g, "\\|");
      return `| \`${r.file}\` | ${r.kind} | ${exp} | ${act} | ${msg} |`;
    })
  : [
      "| _(no parseable findings — see raw checker output below)_ | — | — | — | — |",
    ];

const rawStderr = stderr.trim()
  ? ["", "<details><summary>Raw checker output</summary>", "", "```", stderr.trimEnd(), "```", "", "</details>", ""]
  : [];

const fullHashes = rows.length
  ? [
      "",
      "## Full sha256 values",
      "",
      "| File | Expected | Actual |",
      "| --- | --- | --- |",
      ...rows.map(
        (r) =>
          `| \`${r.file}\` | \`${r.expected ?? "—"}\` | \`${r.actual ?? "—"}\` |`,
      ),
      "",
    ]
  : [];

const report = [...header, ...body, ...rawStderr, ...fullHashes].join("\n") + "\n";

process.stdout.write(report);
writeReport(report);
process.exit(exitCode);

function writeReport(text) {
  const explicit = process.env.DRIFT_REPORT_OUT;
  if (explicit) {
    mkdirSync(path.dirname(path.resolve(ROOT, explicit)), { recursive: true });
    writeFileSync(path.resolve(ROOT, explicit), text, "utf8");
  } else if (existsSync(path.join(ROOT, "dist"))) {
    writeFileSync(path.join(ROOT, "dist", "edge-shared-drift-report.md"), text, "utf8");
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (IN_ACTIONS && summaryPath && existsSync(path.dirname(summaryPath))) {
    appendFileSync(summaryPath, text);
  }
}
