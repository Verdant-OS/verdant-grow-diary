import { describe, it, expect } from "vitest";
import {
  selectNoteworthyTests,
  collectAttachmentPaths,
  artifactNameFor,
} from "../../scripts/upload-per-test-artifacts.mjs";
import { classifyTest, testKey } from "../../scripts/summarize-playwright-flakes.mjs";

const mixedReport = {
  suites: [
    {
      file: "e2e/quicklog.spec.ts",
      specs: [
        {
          title: "logs a watering event",
          tests: [
            {
              projectName: "chromium-authed",
              status: "passed",
              results: [
                {
                  retry: 0,
                  status: "failed",
                  attachments: [
                    {
                      name: "trace",
                      contentType: "application/zip",
                      path: "test-results/quicklog-watering-chromium-authed/trace.zip",
                    },
                    {
                      name: "screenshot",
                      contentType: "image/png",
                      path: "test-results/quicklog-watering-chromium-authed/test-failed-1.png",
                    },
                  ],
                },
                { retry: 1, status: "passed", attachments: [] },
              ],
            },
          ],
        },
        {
          title: "logs environment reading",
          tests: [
            {
              projectName: "chromium-authed",
              status: "failed",
              results: [
                {
                  retry: 0,
                  status: "failed",
                  attachments: [
                    {
                      name: "video",
                      contentType: "video/webm",
                      path: "test-results/quicklog-env-chromium-authed/video.webm",
                    },
                  ],
                },
                { retry: 1, status: "failed", attachments: [] },
              ],
            },
          ],
        },
        {
          title: "clean pass",
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

describe("selectNoteworthyTests", () => {
  it("selects only failed and flaky tests, never clean passes", () => {
    const selected = selectNoteworthyTests(mixedReport);
    const titles = selected.map((t: ReturnType<typeof classifyTest>) => t.title);
    expect(titles).toContain("logs a watering event");
    expect(titles).toContain("logs environment reading");
    expect(titles).not.toContain("clean pass");
    expect(selected).toHaveLength(2);
  });
});

describe("collectAttachmentPaths", () => {
  it("gathers every attachment path across all attempts, deduplicated", () => {
    const [flaky, failed] = selectNoteworthyTests(mixedReport);
    expect(collectAttachmentPaths(flaky)).toEqual([
      "test-results/quicklog-watering-chromium-authed/trace.zip",
      "test-results/quicklog-watering-chromium-authed/test-failed-1.png",
    ]);
    expect(collectAttachmentPaths(failed)).toEqual([
      "test-results/quicklog-env-chromium-authed/video.webm",
    ]);
  });

  it("returns an empty array when a test has no attachments", () => {
    const test = classifyTest({
      file: "x",
      title: "t",
      projectName: "",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    expect(collectAttachmentPaths(test)).toEqual([]);
  });
});

describe("artifactNameFor", () => {
  it("produces a slug derived from the test title", () => {
    const [flaky] = selectNoteworthyTests(mixedReport);
    expect(artifactNameFor(flaky)).toMatch(
      /^quicklog-pw-test-logs-a-watering-event-chromium-authed-[0-9a-f]{8}$/,
    );
  });

  it("is stable across calls for the same test", () => {
    const [flaky] = selectNoteworthyTests(mixedReport);
    expect(artifactNameFor(flaky)).toBe(artifactNameFor(flaky));
  });

  it("never collides for two tests with the same title in different files/projects", () => {
    const a = classifyTest({
      file: "e2e/a.spec.ts",
      title: "same title",
      projectName: "chromium-authed",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    const b = classifyTest({
      file: "e2e/b.spec.ts",
      title: "same title",
      projectName: "chromium-authed",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    expect(testKey(a)).not.toBe(testKey(b));
    expect(artifactNameFor(a)).not.toBe(artifactNameFor(b));
  });

  it("never collides for two tests with the same title in the SAME file/project but a different line (e.g. duplicated across two describe blocks)", () => {
    const a = classifyTest({
      file: "e2e/x.spec.ts",
      title: "shows locked state",
      line: 12,
      projectName: "chromium-authed",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    const b = classifyTest({
      file: "e2e/x.spec.ts",
      title: "shows locked state",
      line: 40,
      projectName: "chromium-authed",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    expect(testKey(a)).not.toBe(testKey(b));
    expect(artifactNameFor(a)).not.toBe(artifactNameFor(b));
  });

  it("stays within a safe artifact-name length even for a very long title", () => {
    const long = classifyTest({
      file: "e2e/x.spec.ts",
      title: "a".repeat(300),
      projectName: "chromium-authed",
      status: "failed",
      results: [{ retry: 0, status: "failed", attachments: [] }],
    });
    expect(artifactNameFor(long).length).toBeLessThan(100);
  });
});
