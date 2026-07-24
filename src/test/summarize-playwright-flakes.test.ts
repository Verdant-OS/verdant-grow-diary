import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { buildSummary, classifyTest, buildPrComment, buildTraceabilityHeader } from "../../scripts/summarize-playwright-flakes.mjs";

const flakyReport = {
  suites: [
    {
      file: "e2e/quicklog.spec.ts",
      specs: [
        {
          title: "logs a watering event",
          line: 12,
          tests: [
            {
              projectName: "chromium-authed",
              status: "passed",
              results: [
                {
                  retry: 0,
                  status: "failed",
                  attachments: [
                    { name: "trace", contentType: "application/zip", path: "test-results/quicklog-watering-chromium-authed/trace.zip" },
                    { name: "screenshot", contentType: "image/png", path: "test-results/quicklog-watering-chromium-authed/test-failed-1.png" },
                    { name: "video", contentType: "video/webm", path: "test-results/quicklog-watering-chromium-authed/video.webm" },
                  ],
                },
                { retry: 1, status: "passed", attachments: [] },
              ],
            },
          ],
        },
        {
          title: "logs a feeding event",
          line: 40,
          tests: [
            {
              projectName: "chromium-authed",
              status: "passed",
              results: [{ retry: 0, status: "passed", attachments: [] }],
            },
          ],
        },
        {
          title: "logs environment reading",
          line: 80,
          tests: [
            {
              projectName: "chromium-authed",
              status: "failed",
              results: [
                { retry: 0, status: "failed", attachments: [] },
                { retry: 1, status: "failed", attachments: [] },
              ],
            },
          ],
        },
        {
          title: "skipped until fixture ready",
          line: 100,
          tests: [
            {
              projectName: "chromium-authed",
              status: "skipped",
              results: [{ retry: 0, status: "skipped", attachments: [] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("summarize-playwright-flakes", () => {
  it("classifies a test that fails on attempt 0 but passes on retry as flaky", () => {
    const test = {
      file: "x.spec.ts",
      title: "t",
      projectName: "chromium-authed",
      status: "passed",
      results: [
        { retry: 0, status: "failed", attachments: [] },
        { retry: 1, status: "passed", attachments: [] },
      ],
    };
    const c = classifyTest(test);
    expect(c.isFlake).toBe(true);
    expect(c.retryCount).toBe(1);
    expect(c.attempts).toBe(2);
  });

  it("does not classify a first-attempt pass as flaky", () => {
    const c = classifyTest({
      file: "x",
      title: "t",
      projectName: "",
      status: "passed",
      results: [{ retry: 0, status: "passed", attachments: [] }],
    });
    expect(c.isFlake).toBe(false);
    expect(c.retryCount).toBe(0);
  });

  it("does not classify a hard failure (both attempts failed) as flaky", () => {
    const c = classifyTest({
      file: "x",
      title: "t",
      projectName: "",
      status: "failed",
      results: [
        { retry: 0, status: "failed", attachments: [] },
        { retry: 1, status: "failed", attachments: [] },
      ],
    });
    expect(c.isFlake).toBe(false);
    expect(c.finalStatus).toBe("failed");
  });

  it("honors an explicit Playwright status: 'flaky'", () => {
    const c = classifyTest({
      file: "x",
      title: "t",
      projectName: "",
      status: "flaky",
      results: [
        { retry: 0, status: "failed", attachments: [] },
        { retry: 1, status: "passed", attachments: [] },
      ],
    });
    expect(c.isFlake).toBe(true);
  });

  it("collects attachments only from failing attempts, with retry index preserved", () => {
    const c = classifyTest({
      file: "x",
      title: "t",
      projectName: "",
      status: "passed",
      results: [
        {
          retry: 0,
          status: "failed",
          attachments: [{ name: "trace", contentType: "application/zip", path: "test-results/a/trace.zip" }],
        },
        { retry: 1, status: "passed", attachments: [{ name: "should-not-appear", path: "nope" }] },
      ],
    });
    expect(c.attachments).toHaveLength(1);
    expect(c.attachments[0].name).toBe("trace");
    expect(c.attachments[0].retry).toBe(0);
  });

  it("emits a markdown summary with counts, retry count, and artifact paths", () => {
    const { markdown, counts, flakes } = buildSummary(flakyReport);
    expect(counts).toEqual({ total: 4, passed: 1, failed: 1, flaky: 1, skipped: 1 });
    expect(flakes).toHaveLength(1);
    expect(markdown).toContain("## Playwright flake summary");
    expect(markdown).toContain("logs a watering event");
    expect(markdown).toContain("Retry count");
    expect(markdown).toContain("trace.zip");
    expect(markdown).toContain("test-failed-1.png");
    expect(markdown).toContain("video.webm");
    // Hard failure listed in its own section, not as a flake.
    expect(markdown).toContain("Hard failures (1)");
    expect(markdown).toContain("logs environment reading");
  });

  it("reports 'no flaky tests' when the run is clean", () => {
    const clean = {
      suites: [
        {
          file: "e2e/x.spec.ts",
          specs: [
            {
              title: "a",
              tests: [
                {
                  projectName: "chromium-authed",
                  status: "passed",
                  results: [{ retry: 0, status: "passed", attachments: [] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const { markdown, counts } = buildSummary(clean);
    expect(counts.flaky).toBe(0);
    expect(markdown).toContain("_No flaky tests detected in this run._");
  });
});

describe("buildPrComment", () => {
  it("emits a sticky PR comment with per-attempt attachments and artifact links", () => {
    const body = buildPrComment(flakyReport, {
      tracesUrl: "https://github.com/o/r/actions/runs/1/artifacts/traces",
      mediaUrl: "https://github.com/o/r/actions/runs/1/artifacts/media",
      reportUrl: "https://github.com/o/r/actions/runs/1/artifacts/report",
      bundleUrl: "https://github.com/o/r/actions/runs/1/artifacts/bundle",
      runUrl: "https://github.com/o/r/actions/runs/1",
    });
    // Sticky marker so the comment updates in place across re-runs.
    expect(body).toContain("<!-- verdant:playwright-flake-pr-comment -- do not edit -->");
    // Header + counts
    expect(body).toContain("## Playwright failure artifacts");
    expect(body).toContain("**Flaky:** 1");
    expect(body).toContain("**Failed:** 1");
    // Artifact bundle links
    expect(body).toContain("Traces bundle");
    expect(body).toContain("Media bundle");
    expect(body).toContain("actions/runs/1/artifacts/traces");
    expect(body).toContain("actions/runs/1/artifacts/media");
    expect(body).toContain("actions/runs/1/artifacts/report");
    expect(body).toContain("actions/runs/1");
    // Separated sections: Failed listed before Flaky so failures get scanned first.
    const failedIdx = body.indexOf("### ❌ Failed (1)");
    const flakyIdx = body.indexOf("### ⚠️ Flaky (1)");
    expect(failedIdx).toBeGreaterThan(-1);
    expect(flakyIdx).toBeGreaterThan(-1);
    expect(failedIdx).toBeLessThan(flakyIdx);
    // Flaky test with BOTH attempts labeled
    expect(body).toContain("FLAKY · logs a watering event");
    expect(body).toContain("Attempt 1 (initial)");
    expect(body).toContain("Retry 1");
    // Attempt 1 (failing) attachments listed with kind + path
    expect(body).toContain("**trace**");
    expect(body).toContain("trace.zip");
    expect(body).toContain("test-failed-1.png");
    expect(body).toContain("video.webm");
    // Hard failure block for the second failing test
    expect(body).toContain("FAILED · logs environment reading");
    // Failed test's block appears in the Failed section (before Flaky heading).
    const failedTestIdx = body.indexOf("FAILED · logs environment reading");
    expect(failedTestIdx).toBeGreaterThan(failedIdx);
    expect(failedTestIdx).toBeLessThan(flakyIdx);

    // Bundle-hint deep links
    expect(body).toContain("[open in traces bundle]");
    expect(body).toContain("[open in media bundle]");
  });

  it("reports 'no failed or flaky tests' when the run is clean", () => {
    const clean = {
      suites: [
        {
          file: "e2e/x.spec.ts",
          specs: [
            {
              title: "a",
              tests: [
                {
                  projectName: "chromium-authed",
                  status: "passed",
                  results: [{ retry: 0, status: "passed", attachments: [] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const body = buildPrComment(clean, {});
    expect(body).toContain("_No failed or flaky tests in this run — no per-attempt artifacts to link._");
  });
});

describe("summarize-playwright-flakes CLI --min-failed gate", () => {
  const flakeOnlyReport = {
    suites: [
      {
        file: "e2e/quicklog.spec.ts",
        specs: [
          {
            title: "logs a watering event",
            line: 12,
            tests: [
              {
                projectName: "chromium-authed",
                status: "passed",
                results: [
                  { retry: 0, status: "failed", attachments: [] },
                  { retry: 1, status: "passed", attachments: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const hardFailedReport = {
    suites: [
      {
        file: "e2e/quicklog.spec.ts",
        specs: [
          {
            title: "logs a watering event",
            line: 12,
            tests: [
              {
                projectName: "chromium-authed",
                status: "failed",
                results: [
                  { retry: 0, status: "failed", attachments: [] },
                  { retry: 1, status: "failed", attachments: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };


  const runCli = (report: unknown, minFailed: number) => {
    const dir = mkdtempSync(join(tmpdir(), "pw-flakes-"));
    const reportPath = join(dir, "report.json");
    const commentPath = join(dir, "pr-comment.md");
    writeFileSync(reportPath, JSON.stringify(report), "utf8");
    execFileSync(
      process.execPath,
      [
        "scripts/summarize-playwright-flakes.mjs",
        `--report=${reportPath}`,
        `--pr-comment=${commentPath}`,
        `--min-failed=${minFailed}`,
      ],
      { stdio: "ignore" },
    );
    const written = existsSync(commentPath);
    rmSync(dir, { recursive: true, force: true });
    return written;
  };

  it("skips PR comment on flake-only runs when --min-failed=1", () => {
    expect(runCli(flakeOnlyReport, 1)).toBe(false);
  });

  it("writes PR comment on flake-only runs when --min-failed=0", () => {
    expect(runCli(flakeOnlyReport, 0)).toBe(true);
  });

  it("writes PR comment when hard failures meet threshold", () => {
    expect(runCli(hardFailedReport, 1)).toBe(true);
  });

  it("skips PR comment when hard failures below threshold", () => {
    expect(runCli(hardFailedReport, 2)).toBe(false);
  });

  it("writes Job Summary with failed/flaky sections + top links even when PR comment is gated by --min-failed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pw-flakes-jobsum-"));
    const reportPath = join(dir, "report.json");
    const commentPath = join(dir, "pr-comment.md");
    const stepSummaryPath = join(dir, "step-summary.md");
    writeFileSync(reportPath, JSON.stringify(flakeOnlyReport), "utf8");
    writeFileSync(stepSummaryPath, "", "utf8");
    execFileSync(
      process.execPath,
      [
        "scripts/summarize-playwright-flakes.mjs",
        `--report=${reportPath}`,
        `--pr-comment=${commentPath}`,
        `--min-failed=1`,
        `--traces-url=https://gh/traces`,
        `--media-url=https://gh/media`,
        `--run-url=https://gh/run`,
      ],
      {
        stdio: "ignore",
        env: { ...process.env, GITHUB_STEP_SUMMARY: stepSummaryPath },
      },
    );
    expect(existsSync(commentPath)).toBe(false);
    const summary = readFileSync(stepSummaryPath, "utf8");
    // Top-level counts + section headings present
    expect(summary).toContain("## Playwright failure artifacts");
    expect(summary).toContain("### ❌ Failed");
    expect(summary).toContain("### ⚠️ Flaky (1)");
    expect(summary).toContain("logs a watering event");
    // Top trace/media/run links published
    expect(summary).toContain("https://gh/traces");
    expect(summary).toContain("https://gh/media");
    expect(summary).toContain("https://gh/run");
    // Suppression notice explains the empty PR comment
    expect(summary).toContain("PR comment suppressed by `--min-failed=1`");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("buildTraceabilityHeader", () => {
  const reportWithConfig = {
    config: {
      version: "1.47.0",
      workers: 4,
      projects: [
        { name: "chromium-authed", use: { defaultBrowserType: "chromium", viewport: { width: 1280, height: 720 } } },
        { name: "firefox-guest", use: { defaultBrowserType: "firefox" } },
      ],
    },
    suites: [],
  };

  it("renders commit SHA, workflow, and browser/config rows from env + report", () => {
    const header = buildTraceabilityHeader(reportWithConfig, {
      GITHUB_SHA: "abcdef1234567890",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_WORKFLOW: "quicklog-smoke",
      GITHUB_JOB: "e2e",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF_NAME: "feature/x",
      GITHUB_ACTOR: "verdant",
    });
    expect(header).toContain("### Run traceability");
    expect(header).toContain("`quicklog-smoke`");
    expect(header).toContain("job `e2e`");
    expect(header).toContain("`pull_request`");
    expect(header).toContain("ref `feature/x`");
    expect(header).toContain("[`abcdef1`](https://github.com/o/r/commit/abcdef1234567890)");
    expect(header).toContain("[42 (attempt 2)](https://github.com/o/r/actions/runs/42/attempts/2)");
    expect(header).toContain("Playwright workers | 4");
    expect(header).toContain("`1.47.0`");
    expect(header).toContain("`chromium-authed` → chromium · viewport 1280×720");
    expect(header).toContain("`firefox-guest` → firefox · viewport default");
  });

  it("omits rows for missing env vars", () => {
    const header = buildTraceabilityHeader({ suites: [] }, {});
    expect(header).toContain("### Run traceability");
    expect(header).not.toContain("Workflow |");
    expect(header).not.toContain("Commit |");
  });
});

