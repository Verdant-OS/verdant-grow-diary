import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8").replace(/\r\n?/g, "\n");

function workflowStep(workflow: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workflow.match(new RegExp(`- name: ${escaped}[\\s\\S]*?(?=\\n {6}- name:|\\n*$)`));
  expect(match, `workflow step missing: ${name}`).toBeTruthy();
  return match![0];
}

describe("Quick Log workflow diagnostic safety", () => {
  it("runs authenticated bootstrap, verification, and smoke commands without raw tee capture", () => {
    const workflow = read(".github/workflows/quicklog-smoke.yml");

    for (const [name, command] of [
      ["Bootstrap disposable E2E fixture", "bun run e2e:bootstrap-fixture"],
      ["Verify disposable E2E fixture", "bun run e2e:verify-fixture"],
      ["Run Quick Log Playwright smoke", "bun run e2e:quicklog-smoke"],
    ] as const) {
      const step = workflowStep(workflow, name);
      expect(step).toContain(`run: ${command}`);
      expect(step).not.toMatch(/2>&1\s*\|\s*tee/);
      expect(step).not.toContain("step-logs");
    }
  });

  it("keeps failure diagnostics metadata-only and links the valid run attempt", () => {
    const workflow = read(".github/workflows/quicklog-smoke.yml");
    const step = workflowStep(workflow, "Summarize failed step metadata in Job Summary");

    expect(step).toContain("/actions/runs/${GITHUB_RUN_ID}");
    expect(step).toContain("/attempts/${GITHUB_RUN_ATTEMPT}");
    expect(step).toContain("BOOTSTRAP_FIXTURE_OUTCOME");
    expect(step).toContain("VERIFY_FIXTURE_OUTCOME");
    expect(step).toContain("QUICKLOG_SMOKE_OUTCOME");
    expect(step).not.toMatch(/\btail\b/);
    expect(step).not.toContain("quicklog-smoke-report.txt");
    expect(step).not.toContain("test-results/");

    expect(workflow).not.toContain("quicklog-failure-debug");
    expect(workflow).not.toContain("Link error-context files in Job Summary");
    expect(workflow).not.toContain("error-context.md");
    expect(workflow).not.toContain("/job/${GITHUB_JOB}");
  });

  it("escapes Markdown backticks around shell metadata instead of command-substituting it", () => {
    const workflow = read(".github/workflows/quicklog-smoke.yml");
    const step = workflowStep(workflow, "Summarize failed step metadata in Job Summary");

    for (const variable of ["GITHUB_WORKFLOW", "failed_step", "failed_outcome"]) {
      expect(step).toContain(`\\\`\${${variable}}\\\``);
      expect(step).not.toContain(`\`\${${variable}}\``);
    }
  });

  it("gates trace upload and viewer guidance on proven files plus an artifact URL", () => {
    const workflow = read(".github/workflows/quicklog-smoke.yml");
    const detection = workflowStep(workflow, "Detect Playwright trace files");
    const upload = workflowStep(workflow, "Upload Playwright traces");
    const viewer = workflowStep(workflow, "Link Playwright trace viewer in Job Summary");

    expect(detection).toContain("find test-results -type f -name 'trace.zip'");
    expect(detection).toContain("present=true");
    expect(detection).toContain("present=false");
    expect(upload).toContain("steps.trace_files.outputs.present == 'true'");
    expect(upload).toContain("test-results/**/trace.zip");
    expect(viewer).toMatch(
      /if \[ "\$\{TRACE_FILES_PRESENT\}" = "true" \] && \[ -n "\$\{TRACES_URL\}" \]/,
    );
    expect(viewer).toContain(
      "Trace intentionally disabled/unavailable for this authenticated smoke run.",
    );
  });

  it("documents the standalone artifact layout and retry directories truthfully", () => {
    const workflow = read(".github/workflows/quicklog-smoke.yml");
    const viewer = workflowStep(workflow, "Link Playwright trace viewer in Job Summary");

    expect(viewer).toContain("upload wildcard strips the \\`test-results/\\` prefix");
    expect(viewer).toContain(
      "find quicklog-playwright-traces-${ARTIFACT_SUFFIX} -type f -name 'trace.zip'",
    );
    expect(viewer).toContain("<test>-retry1/trace.zip");
    expect(viewer).not.toContain("/test-results -name 'trace.zip'");
    expect(viewer).not.toContain("retry1/trace.zip\\` = retry 1");
    expect(viewer).not.toContain("smoke bundle");
  });

  it("keeps real-auth Playwright tracing off", () => {
    const config = read("playwright.config.ts");
    expect(config).toMatch(/TRACE_MODE|E2E_TEST_EMAIL/);
    expect(config).toMatch(/trace:\s*TRACE_MODE|trace:\s*process\.env\.E2E_TEST_EMAIL/);
  });
});
