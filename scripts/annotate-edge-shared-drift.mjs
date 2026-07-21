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

/**
 * Parse each drift line into a file path + human-readable message.
 * Known shapes emitted by sync-edge-shared.mjs --check:
 *   - "MISSING committed mirror: <rel>"
 *   - "DRIFT: <rel> differs from generator output"
 *   - "STALE committed mirror: <rel> — not referenced by any entry file"
 *   - "DRIFT: .sync-manifest.json sourceHashes differ"
 *   - "MISSING .sync-manifest.json"
 *   - "ENTRY not rewritten: <rel> still imports \"<spec>\""
 */
function parseDrift(line) {
  const trimmed = line.replace(/^\s*-\s*/, "").trim();
  if (!trimmed) return null;

  let m;
  if ((m = trimmed.match(/^MISSING committed mirror:\s+(\S+)/))) {
    return {
      file: m[1],
      title: "Edge mirror file missing",
      message: `Mirror file ${m[1]} is expected by the generator but not committed. Run \`bun run sync-edge-shared\` and commit the result.`,
    };
  }
  if ((m = trimmed.match(/^DRIFT:\s+(\S+)\s+differs from generator output/))) {
    return {
      file: m[1],
      title: "Edge mirror drift",
      message: `${m[1]} does not match its src/ origin. Run \`bun run sync-edge-shared\` and commit the regenerated mirror.`,
    };
  }
  if ((m = trimmed.match(/^STALE committed mirror:\s+(\S+)/))) {
    return {
      file: m[1],
      title: "Stale edge mirror file",
      message: `${m[1]} is committed but no edge function references it. Run \`bun run sync-edge-shared\` to prune.`,
    };
  }
  if (/^DRIFT: \.sync-manifest\.json sourceHashes differ/.test(trimmed)) {
    return {
      file: "supabase/functions/_shared/lib/.sync-manifest.json",
      title: "Edge mirror manifest drift",
      message:
        "The committed .sync-manifest.json sourceHashes disagree with the generator. Run `bun run sync-edge-shared` and commit.",
    };
  }
  if (/^MISSING \.sync-manifest\.json/.test(trimmed)) {
    return {
      file: "supabase/functions/_shared/lib/.sync-manifest.json",
      title: "Edge mirror manifest missing",
      message: "No .sync-manifest.json committed. Run `bun run sync-edge-shared` and commit the result.",
    };
  }
  if (
    (m = trimmed.match(
      /^ENTRY not rewritten:\s+(\S+)\s+still imports\s+"([^"]+)"/,
    ))
  ) {
    return {
      file: m[1],
      title: "Edge entry not rewritten",
      message: `${m[1]} still imports "${m[2]}" via a raw src/ path or @/ alias. Run \`bun run sync-edge-shared\` to rewrite entry imports into the mirror.`,
    };
  }
  return null;
}

const findings = [];
for (const line of stderr.split(/\r?\n/)) {
  const parsed = parseDrift(line);
  if (parsed) findings.push(parsed);
}

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
    // GitHub Actions annotation format. line=1 is fine — the annotation
    // attaches to the file in the PR diff view, and every mirror file
    // header is on line 1.
    const escaped = (s) =>
      String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(
      `::error file=${f.file},line=1,col=1,title=${escaped(f.title)}::${escaped(f.message)}`,
    );
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
