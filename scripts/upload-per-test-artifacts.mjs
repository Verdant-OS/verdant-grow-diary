#!/usr/bin/env node
// scripts/upload-per-test-artifacts.mjs
//
// Upload one dedicated GitHub Actions artifact per failed/flaky Playwright
// test, so a PR comment can link directly to just that test's evidence
// instead of the whole run's shared traces/media bundle.
//
// This is enrichment, not a gate: any failure here (missing SDK, upload
// error, empty report) is logged as a warning and the script exits 0. It
// must never be the reason a CI job goes red — the real smoke result is
// decided by the Playwright run itself, not by this script.
//
// Usage (inside a GitHub Actions job, after the Playwright run):
//   node scripts/upload-per-test-artifacts.mjs \
//     --report=e2e/results/playwright-report.json \
//     [--out=e2e/results/per-test-artifacts.json] \
//     [--retention-days=30]
//
// Exit codes: always 0. Problems are reported via stderr warnings so the
// calling workflow step can surface them without failing the job.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import { collectTests, classifyTest, testKey } from "./summarize-playwright-flakes.mjs";

const FAIL_STATUSES = new Set(["failed", "timedOut", "interrupted"]);

function parseArgs(argv) {
  const args = {
    reportPath: "e2e/results/playwright-report.json",
    outPath: "e2e/results/per-test-artifacts.json",
    retentionDays: 30,
  };
  for (const raw of argv) {
    if (raw.startsWith("--report=")) args.reportPath = raw.slice("--report=".length);
    else if (raw.startsWith("--out=")) args.outPath = raw.slice("--out=".length);
    else if (raw.startsWith("--retention-days=")) {
      const parsed = Number.parseInt(raw.slice("--retention-days=".length), 10);
      args.retentionDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    } else if (raw === "--help" || raw === "-h") {
      process.stdout.write(
        "Usage: upload-per-test-artifacts.mjs --report=<path> [--out=<path>] [--retention-days=<N>]\n",
      );
      process.exit(0);
    }
  }
  return args;
}

/**
 * Which tests get their own dedicated artifact: failed + flaky, same set the
 * PR comment already treats as "noteworthy". Passing/skipped tests never get
 * a per-test artifact — there's nothing to triage.
 */
export function selectNoteworthyTests(report) {
  const tests = collectTests(report).map(classifyTest);
  return tests.filter((t) => t.isFlake || FAIL_STATUSES.has(t.finalStatus));
}

/**
 * Every attachment file path captured for a test, across all attempts,
 * deduplicated. Playwright organizes these under test-results/<dir>/ with a
 * directory per test+project (and a -retry1, -retry2, ... suffix per retry),
 * so a test's own files are naturally already grouped on disk.
 */
export function collectAttachmentPaths(test) {
  const paths = new Set();
  for (const attempt of test.attemptResults ?? []) {
    for (const a of attempt.attachments ?? []) {
      if (a?.path) paths.add(String(a.path));
    }
  }
  return [...paths];
}

/**
 * A short, filesystem/artifact-name-safe slug for a test, unique per
 * (file, project, title) via an appended content hash — two tests with the
 * same title in different files/projects must never collide.
 */
export function artifactNameFor(test) {
  const raw = `${test.title || "test"}-${test.projectName || ""}`;
  const slug =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "test";
  const hash = createHash("sha256").update(testKey(test)).digest("hex").slice(0, 8);
  return `quicklog-pw-test-${slug}-${hash}`;
}

/**
 * Build the artifact-viewer URL the same way actions/upload-artifact@v4's
 * own `artifact-url` output does, so links behave identically whether they
 * came from the marketplace action or this script's direct SDK call.
 */
function artifactUrl(id) {
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const runId = process.env.GITHUB_RUN_ID || "";
  return `${serverUrl}/${repo}/actions/runs/${runId}/artifacts/${id}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = resolve(process.cwd(), args.reportPath);
  const outAbs = resolve(process.cwd(), args.outPath);
  const cwd = process.cwd();

  const writeEmptyMap = () => {
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, "{}\n", "utf8");
  };

  if (!existsSync(reportPath)) {
    process.stderr.write(
      `upload-per-test-artifacts: report not found at ${args.reportPath}; writing empty map.\n`,
    );
    writeEmptyMap();
    return;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    process.stderr.write(
      `upload-per-test-artifacts: failed to parse ${args.reportPath}: ${err instanceof Error ? err.message : String(err)}; writing empty map.\n`,
    );
    writeEmptyMap();
    return;
  }

  const noteworthy = selectNoteworthyTests(report);
  if (noteworthy.length === 0) {
    process.stderr.write("upload-per-test-artifacts: no failed/flaky tests; writing empty map.\n");
    writeEmptyMap();
    return;
  }

  let DefaultArtifactClient;
  try {
    ({ DefaultArtifactClient } = await import("@actions/artifact"));
  } catch (err) {
    process.stderr.write(
      `::warning::upload-per-test-artifacts: @actions/artifact unavailable (${err instanceof Error ? err.message : String(err)}); skipping per-test artifacts. This does not affect the smoke result.\n`,
    );
    writeEmptyMap();
    return;
  }

  const client = new DefaultArtifactClient();
  const map = {};
  let uploaded = 0;
  let skippedNoFiles = 0;
  let failedUploads = 0;

  for (const test of noteworthy) {
    const relPaths = collectAttachmentPaths(test);
    const absPaths = relPaths.map((p) => resolve(cwd, p)).filter((p) => existsSync(p));

    if (absPaths.length === 0) {
      skippedNoFiles += 1;
      continue;
    }

    const name = artifactNameFor(test);
    try {
      const { id } = await client.uploadArtifact(name, absPaths, cwd, {
        retentionDays: args.retentionDays,
      });
      map[testKey(test)] = { name, url: artifactUrl(id), id, fileCount: absPaths.length };
      uploaded += 1;
    } catch (err) {
      failedUploads += 1;
      process.stderr.write(
        `::warning::upload-per-test-artifacts: upload failed for "${test.title}" (${name}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(map, null, 2)}\n`, "utf8");

  process.stderr.write(
    `upload-per-test-artifacts: noteworthy=${noteworthy.length} uploaded=${uploaded} skipped_no_files=${skippedNoFiles} failed=${failedUploads}\n`,
  );
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("upload-per-test-artifacts.mjs");

if (isDirectRun) {
  main().catch((err) => {
    // Enrichment only — never fail the calling job over this script.
    process.stderr.write(
      `::warning::upload-per-test-artifacts: unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(0);
  });
}
