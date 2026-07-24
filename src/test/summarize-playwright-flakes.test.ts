import { describe, it, expect } from "vitest";
// @ts-ignore - .mjs script exports pure helpers for testing.
import { buildSummary, classifyTest } from "../../scripts/summarize-playwright-flakes.mjs";

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
