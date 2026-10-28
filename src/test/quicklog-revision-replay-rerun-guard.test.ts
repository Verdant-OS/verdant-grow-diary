import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = loadYaml(
  readFileSync(resolve(".github/workflows/apply-quicklog-revision-idempotent-replay.yml"), "utf8"),
) as {
  jobs: { apply: { steps: Array<{ name: string; run?: string }> } };
};
const authorization = workflow.jobs.apply.steps.find(
  (step) => step.name === "Verify solo-founder production authorization",
);

function runAuthorization(attempt: string) {
  const directory = mkdtempSync(join(tmpdir(), "quicklog-rerun-"));
  try {
    expect(authorization?.run).toBeTypeOf("string");
    const result = spawnSync(
      "bash",
      ["-c", `gh() { echo API_REACHED; return 1; }\n${authorization!.run}`],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          GITHUB_RUN_ATTEMPT: attempt,
          GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
          GITHUB_RUN_ID: "38091479457",
          CURRENT_RUN_JSON: join(directory, "current-run.json"),
          REPORT_PATH: join(directory, "report.md"),
          AUDIT_PATH: join(directory, "audit.json"),
        },
      },
    );
    return {
      ...result,
      report: readFileSync(join(directory, "report.md"), "utf8"),
      audit: JSON.parse(readFileSync(join(directory, "audit.json"), "utf8")),
      currentRun: existsSync(join(directory, "current-run.json"))
        ? readFileSync(join(directory, "current-run.json"), "utf8")
        : "",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Quick Log revision replay protected-job rerun guard", () => {
  it.each(["2", "4", "", "0", "-1", "1 ", "invalid"])(
    "rejects attempt %j before querying authorization metadata",
    (attempt) => {
      const result = runAuthorization(attempt);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "::error::Protected workflow reruns are forbidden; use a fresh dispatch.",
      );
      expect(result.report).toContain("use a fresh dispatch");
      expect(result.audit.reason_code).toBe("solo_founder_authorization_rejected");
      expect(result.currentRun).toBe("");
    },
  );

  it("still queries authorization metadata on the first attempt and fails closed on API failure", () => {
    const result = runAuthorization("1");
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Protected workflow reruns are forbidden");
    expect(result.currentRun).toContain("API_REACHED");
    expect(result.audit.reason_code).toBe("solo_founder_authorization_rejected");
  });
});
