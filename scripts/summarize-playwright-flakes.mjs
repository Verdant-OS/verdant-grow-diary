#!/usr/bin/env node
// scripts/summarize-playwright-flakes.mjs
//
// Parse a Playwright JSON reporter output file and emit a markdown summary
// that classifies tests as flaky when they FAILED on attempt 0 but PASSED on
// a retry (retry >= 1). For each flake we report the retry count and every
// artifact path Playwright captured across the failing attempts
// (trace zips, videos, screenshots).
//
// This script never mutates state and never exits non-zero on the presence of
// flakes by default — it is a summary tool. Pass --fail-on-flake to make the
// CI job explicitly red when flakes are detected.
//
// Usage:
//   node scripts/summarize-playwright-flakes.mjs \
//     --report=e2e/results/playwright-report.json \
//     [--out=e2e/results/playwright-flake-summary.md] \
//     [--fail-on-flake]
//
// Exit codes:
//   0  Report parsed successfully (flakes may or may not be present).
//   1  Report missing or unreadable/unparseable JSON.
//   2  Flakes detected AND --fail-on-flake was passed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";

const FAIL_STATUSES = new Set(["failed", "timedOut", "interrupted"]);

function parseArgs(argv) {
  const args = {
    reportPath: "e2e/results/playwright-report.json",
    outPath: null,
    prCommentPath: null,
    tracesUrl: "",
    mediaUrl: "",
    reportUrl: "",
    bundleUrl: "",
    runUrl: "",
    failOnFlake: false,
  };
  for (const raw of argv) {
    if (raw.startsWith("--report=")) args.reportPath = raw.slice("--report=".length);
    else if (raw.startsWith("--out=")) args.outPath = raw.slice("--out=".length);
    else if (raw.startsWith("--pr-comment=")) args.prCommentPath = raw.slice("--pr-comment=".length);
    else if (raw.startsWith("--traces-url=")) args.tracesUrl = raw.slice("--traces-url=".length);
    else if (raw.startsWith("--media-url=")) args.mediaUrl = raw.slice("--media-url=".length);
    else if (raw.startsWith("--report-url=")) args.reportUrl = raw.slice("--report-url=".length);
    else if (raw.startsWith("--bundle-url=")) args.bundleUrl = raw.slice("--bundle-url=".length);
    else if (raw.startsWith("--run-url=")) args.runUrl = raw.slice("--run-url=".length);
    else if (raw === "--fail-on-flake") args.failOnFlake = true;
    else if (raw === "--help" || raw === "-h") {
      process.stdout.write(
        "Usage: summarize-playwright-flakes.mjs --report=<path> [--out=<path>] [--pr-comment=<path>] [--traces-url=<url>] [--media-url=<url>] [--report-url=<url>] [--bundle-url=<url>] [--run-url=<url>] [--fail-on-flake]\n",
      );
      process.exit(0);
    }
  }
  return args;
}

/**
 * Walk the Playwright JSON report structure and collect every leaf test.
 * The shape is: report.suites[].suites[]*.specs[].tests[].results[].
 */
function collectTests(report) {
  const out = [];
  const visitSuite = (suite, filePath) => {
    const currentFile = suite?.file || filePath || "";
    const specs = Array.isArray(suite?.specs) ? suite.specs : [];
    for (const spec of specs) {
      const tests = Array.isArray(spec?.tests) ? spec.tests : [];
      for (const test of tests) {
        out.push({
          file: currentFile,
          title: spec?.title ?? "",
          line: spec?.line ?? null,
          projectName: test?.projectName ?? "",
          status: test?.status ?? "",
          results: Array.isArray(test?.results) ? test.results : [],
        });
      }
    }
    const nested = Array.isArray(suite?.suites) ? suite.suites : [];
    for (const child of nested) visitSuite(child, currentFile);
  };
  const rootSuites = Array.isArray(report?.suites) ? report.suites : [];
  for (const s of rootSuites) visitSuite(s, "");
  return out;
}

/**
 * Classify a single test. A "flake" means the final attempt passed but at
 * least one earlier attempt failed / timed out / was interrupted. We also
 * honor Playwright's own `status: "flaky"` if it's already set on the test.
 */
export function classifyTest(test) {
  const results = [...test.results].sort(
    (a, b) => (a?.retry ?? 0) - (b?.retry ?? 0),
  );
  const attempts = results.length;
  const maxRetry = attempts === 0 ? 0 : results[results.length - 1]?.retry ?? 0;
  const finalStatus = results[results.length - 1]?.status ?? test.status ?? "";
  const failedAttempts = results.filter((r) =>
    FAIL_STATUSES.has(String(r?.status ?? "")),
  );
  const declaredFlaky = String(test.status ?? "").toLowerCase() === "flaky";
  const passedAfterFailure =
    finalStatus === "passed" && failedAttempts.length > 0;
  const isFlake = declaredFlaky || passedAfterFailure;

  const attachments = [];
  for (const r of failedAttempts) {
    const list = Array.isArray(r?.attachments) ? r.attachments : [];
    for (const a of list) {
      if (!a) continue;
      attachments.push({
        name: String(a.name ?? "attachment"),
        contentType: String(a.contentType ?? ""),
        path: a.path ? String(a.path) : "",
        retry: r?.retry ?? 0,
      });
    }
  }

  // Per-attempt breakdown for the PR-comment view: every attempt keeps its
  // status + full attachment list (trace zip, screenshot, video), grouped by
  // retry index so users can jump straight to the exact attempt's evidence.
  const attemptResults = results.map((r) => ({
    retry: r?.retry ?? 0,
    status: String(r?.status ?? ""),
    durationMs: typeof r?.duration === "number" ? r.duration : null,
    attachments: (Array.isArray(r?.attachments) ? r.attachments : [])
      .filter(Boolean)
      .map((a) => ({
        name: String(a.name ?? "attachment"),
        contentType: String(a.contentType ?? ""),
        path: a.path ? String(a.path) : "",
      })),
  }));

  return {
    file: test.file,
    title: test.title,
    projectName: test.projectName,
    finalStatus,
    attempts,
    retryCount: maxRetry,
    failedAttemptCount: failedAttempts.length,
    isFlake,
    attachments,
    attemptResults,
  };
}

export function buildSummary(report, { cwd = process.cwd() } = {}) {
  const tests = collectTests(report).map(classifyTest);
  const flakes = tests.filter((t) => t.isFlake);
  const failed = tests.filter(
    (t) => !t.isFlake && FAIL_STATUSES.has(t.finalStatus),
  );
  const passed = tests.filter(
    (t) => !t.isFlake && t.finalStatus === "passed",
  );
  const skipped = tests.filter(
    (t) => t.finalStatus === "skipped" || t.finalStatus === "",
  );

  const lines = [];
  lines.push("## Playwright flake summary");
  lines.push("");
  lines.push(
    `- **Total tests:** ${tests.length}  ·  **Passed:** ${passed.length}  ·  **Failed:** ${failed.length}  ·  **Flaky:** ${flakes.length}  ·  **Skipped:** ${skipped.length}`,
  );
  lines.push("");

  if (flakes.length === 0) {
    lines.push("_No flaky tests detected in this run._");
    lines.push("");
  } else {
    lines.push(
      "Tests below **failed on attempt 1 and passed on a retry**. Inspect the linked artifacts to decide whether to file a regression or accept the flake.",
    );
    lines.push("");
    lines.push("| # | Test | File | Project | Attempts | Retry count | Artifacts |");
    lines.push("|---|------|------|---------|----------|-------------|-----------|");
    flakes.forEach((f, i) => {
      const relFile = f.file
        ? relative(cwd, resolve(cwd, f.file)) || f.file
        : "";
      const attachmentCell = f.attachments.length
        ? f.attachments
            .map((a) => {
              const rel = a.path
                ? relative(cwd, resolve(cwd, a.path)) || a.path
                : "";
              const label = `${a.name}${a.retry ? ` (retry${a.retry})` : ""}`;
              return rel ? `\`${rel}\` — ${label}` : label;
            })
            .join("<br>")
        : "_none captured_";
      lines.push(
        `| ${i + 1} | ${escapeCell(f.title)} | ${escapeCell(relFile)} | ${escapeCell(f.projectName) || "—"} | ${f.attempts} | ${f.retryCount} | ${attachmentCell} |`,
      );
    });
    lines.push("");
  }

  if (failed.length > 0) {
    lines.push(`### Hard failures (${failed.length})`);
    lines.push("");
    for (const t of failed) {
      const relFile = t.file
        ? relative(cwd, resolve(cwd, t.file)) || t.file
        : "";
      lines.push(`- **${t.title}** — \`${relFile}\` (${t.finalStatus})`);
    }
    lines.push("");
  }

  return {
    markdown: lines.join("\n"),
    counts: {
      total: tests.length,
      passed: passed.length,
      failed: failed.length,
      flaky: flakes.length,
      skipped: skipped.length,
    },
    flakes,
  };
}

const PR_COMMENT_MARKER =
  "<!-- verdant:playwright-flake-pr-comment -- do not edit -->";

/**
 * Build the sticky PR comment body. Includes per-test, per-attempt
 * (attempt 1 = retry0, attempt 2 = retry1) attachment listings and direct
 * links to the uploaded artifact bundles so the user can open the exact
 * trace/video/screenshot without digging through the run.
 *
 * GitHub artifact URLs point to the artifact zip — inside each zip, the
 * per-attempt file path is what's printed next to each attachment.
 */
export function buildPrComment(
  report,
  {
    cwd = process.cwd(),
    tracesUrl = "",
    mediaUrl = "",
    reportUrl = "",
    bundleUrl = "",
    runUrl = "",
  } = {},
) {
  const tests = collectTests(report).map(classifyTest);
  const flakes = tests.filter((t) => t.isFlake);
  const failed = tests.filter(
    (t) => !t.isFlake && FAIL_STATUSES.has(t.finalStatus),
  );
  const noteworthy = [...flakes, ...failed];

  const lines = [];
  lines.push(PR_COMMENT_MARKER);
  lines.push("## Playwright failure artifacts");
  lines.push("");
  lines.push(
    `**Flaky:** ${flakes.length}  ·  **Failed:** ${failed.length}  ·  **Total tests:** ${tests.length}`,
  );
  lines.push("");

  const artifactLinks = [];
  if (tracesUrl)
    artifactLinks.push(`- [Traces bundle (\`*.zip\`)](${tracesUrl})`);
  if (mediaUrl)
    artifactLinks.push(`- [Media bundle (screenshots + videos)](${mediaUrl})`);
  if (reportUrl)
    artifactLinks.push(`- [Playwright HTML report](${reportUrl})`);
  if (bundleUrl)
    artifactLinks.push(`- [Full smoke artifact bundle](${bundleUrl})`);
  if (runUrl) artifactLinks.push(`- [Workflow run](${runUrl})`);
  if (artifactLinks.length) {
    lines.push("### Artifact bundles for this run");
    lines.push("");
    for (const link of artifactLinks) lines.push(link);
    lines.push("");
    lines.push(
      "> GitHub artifact URLs point to the artifact zip. Download the bundle above, then open the file path listed under each attempt.",
    );
    lines.push("");
  }

  if (noteworthy.length === 0) {
    lines.push("_No failed or flaky tests in this run — no per-attempt artifacts to link._");
    lines.push("");
    return lines.join("\n");
  }

  for (const t of noteworthy) {
    const relFile = t.file
      ? relative(cwd, resolve(cwd, t.file)) || t.file
      : "";
    const badge = t.isFlake ? "FLAKY" : "FAILED";
    lines.push(`### ${badge} · ${t.title}`);
    lines.push("");
    lines.push(
      `\`${relFile}\`${t.projectName ? ` · project \`${t.projectName}\`` : ""} · attempts: ${t.attempts} · retry count: ${t.retryCount}`,
    );
    lines.push("");

    for (const attempt of t.attemptResults) {
      const label =
        attempt.retry === 0 ? "Attempt 1 (initial)" : `Retry ${attempt.retry}`;
      lines.push(`**${label} — status: \`${attempt.status || "unknown"}\`**`);
      if (attempt.attachments.length === 0) {
        lines.push("");
        lines.push("- _no attachments captured for this attempt_");
        lines.push("");
        continue;
      }
      lines.push("");
      for (const a of attempt.attachments) {
        const rel = a.path
          ? relative(cwd, resolve(cwd, a.path)) || a.path
          : "";
        const kind = describeAttachmentKind(a);
        const bundleHint = bundleHintFor(a, { tracesUrl, mediaUrl });
        const pathCell = rel ? `\`${rel}\`` : "_(path unavailable)_";
        const link = bundleHint ? ` — [open in ${bundleHint.label}](${bundleHint.url})` : "";
        lines.push(`- ${kind}: ${pathCell}${link}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function describeAttachmentKind(a) {
  const name = a.name?.toLowerCase() ?? "";
  const ct = a.contentType?.toLowerCase() ?? "";
  if (name === "trace" || ct === "application/zip") return "**trace**";
  if (name === "video" || ct.startsWith("video/")) return "**video**";
  if (name.includes("screenshot") || ct.startsWith("image/"))
    return "**screenshot**";
  return `**${a.name || "attachment"}**`;
}

function bundleHintFor(a, { tracesUrl, mediaUrl }) {
  const ct = a.contentType?.toLowerCase() ?? "";
  const name = a.name?.toLowerCase() ?? "";
  if ((name === "trace" || ct === "application/zip") && tracesUrl) {
    return { label: "traces bundle", url: tracesUrl };
  }
  if (
    mediaUrl &&
    (name === "video" ||
      name.includes("screenshot") ||
      ct.startsWith("video/") ||
      ct.startsWith("image/"))
  ) {
    return { label: "media bundle", url: mediaUrl };
  }
  return null;
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = resolve(process.cwd(), args.reportPath);

  if (!existsSync(reportPath)) {
    process.stderr.write(
      `summarize-playwright-flakes: report not found at ${args.reportPath}\n`,
    );
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    process.stderr.write(
      `summarize-playwright-flakes: failed to parse ${args.reportPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  const { markdown, counts, flakes } = buildSummary(report);

  process.stdout.write(`${markdown}\n`);

  if (args.outPath) {
    const outAbs = resolve(process.cwd(), args.outPath);
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, `${markdown}\n`, "utf8");
  }

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    try {
      writeFileSync(stepSummary, `${markdown}\n`, { flag: "a" });
    } catch (err) {
      process.stderr.write(
        `summarize-playwright-flakes: unable to append to GITHUB_STEP_SUMMARY: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  process.stderr.write(
    `summarize-playwright-flakes: total=${counts.total} passed=${counts.passed} failed=${counts.failed} flaky=${counts.flaky} skipped=${counts.skipped}\n`,
  );

  if (args.failOnFlake && flakes.length > 0) {
    process.exit(2);
  }
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("summarize-playwright-flakes.mjs");

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(
      `summarize-playwright-flakes: unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
