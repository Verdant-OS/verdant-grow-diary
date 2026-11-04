/**
 * Grower bug item 20 (#2857): the production write smoke may sign in only as
 * the disposable account named by vars.E2E_FIXTURE_EXPECTED_ACCOUNT_HINT, and
 * never as a personal account. This runs the workflow's own "Verify required
 * configuration" script under bash, so it tests the gate's behaviour rather
 * than its text.
 * @source-scan-justified: the gate is a bash step inside a GitHub workflow; the
 * test extracts that step's script and executes it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = load(fs.readFileSync(".github/workflows/quicklog-smoke.yml", "utf8")) as {
  jobs: Record<string, { steps: { name: string; run?: string; env?: Record<string, string> }[] }>;
};
const step = workflow.jobs["quicklog-smoke"].steps.find(
  (s) => s.name === "Verify required configuration",
)!;
const script = step.run!.replace(/\$\{\{\s*github\.event_name\s*\}\}/g, "workflow_dispatch");

const disposable = "e2e-fixture@verdant-test.invalid";
const baseEnv = {
  E2E_BASE_URL: "https://verdantgrowdiary.com",
  E2E_GROW_1_PLANT_URL: "https://verdantgrowdiary.com/plants/x",
  E2E_TEST_PASSWORD: "not-a-real-password",
  E2E_FIXTURE_MODE: "true",
  E2E_FIXTURE_EXPECTED_TENT_NAME: "E2E Test Tent",
  E2E_FIXTURE_EXPECTED_PLANT_NAME: "E2E Test Plant",
};

function runGate(email: string, hint: string): { passed: boolean; output: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-gate-"));
  const out = path.join(dir, "out");
  fs.writeFileSync(out, "");
  // A clean environment: no GIT_* or other inherited variables.
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    GITHUB_OUTPUT: out,
    ...baseEnv,
    E2E_TEST_EMAIL: email,
    E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: hint,
  };
  try {
    execFileSync("bash", ["-c", script], { env, stdio: "pipe" });
    return { passed: true, output: fs.readFileSync(out, "utf8") };
  } catch {
    return { passed: false, output: fs.readFileSync(out, "utf8") };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("quicklog-smoke write gate (grower bug item 20)", () => {
  it("passes the disposable account named by the hint", () => {
    expect(runGate(disposable, disposable).passed).toBe(true);
  });

  it("matches the hint case- and whitespace-insensitively", () => {
    expect(runGate(" E2E-Fixture@Verdant-Test.invalid ", disposable).passed).toBe(true);
  });

  it("refuses when no hint is configured", () => {
    const result = runGate(disposable, "");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("should_run=false");
  });

  it("refuses an email that does not match the hint", () => {
    expect(runGate("someone-else@verdant-test.invalid", disposable).passed).toBe(false);
  });

  it("refuses each personal account even when the hint names it", () => {
    for (const personal of ["cheekhimself@gmail.com", "matt@verdantgrowdiary.com"]) {
      expect(runGate(personal, personal).passed).toBe(false);
      expect(runGate(personal.toUpperCase(), personal).passed).toBe(false);
    }
  });

  it("refuses a non-production host", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-gate-"));
    const out = path.join(dir, "out");
    fs.writeFileSync(out, "");
    let passed = true;
    try {
      execFileSync("bash", ["-c", script], {
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          GITHUB_OUTPUT: out,
          ...baseEnv,
          E2E_BASE_URL: "https://preview.example.invalid",
          E2E_TEST_EMAIL: disposable,
          E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: disposable,
        },
        stdio: "pipe",
      });
    } catch {
      passed = false;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(passed).toBe(false);
  });

  it("reads the write smoke's own secrets, never the owner login", () => {
    expect(step.env).toEqual({
      E2E_TEST_EMAIL: "${{ secrets.E2E_SMOKE_EMAIL }}",
      E2E_TEST_PASSWORD: "${{ secrets.E2E_SMOKE_PASSWORD }}",
    });
  });
});

/**
 * The authenticated One-Tent proof in the same workflow creates and tears down a
 * marker-tagged grow, tent and plant on production. It must sign in with the same
 * disposable account and the same gate (#2857, Reviewer B P2).
 */
const oneTentStep = workflow.jobs["one-tent-authenticated-proof"].steps.find(
  (s) => s.name === "Verify E2E credentials are configured",
)!;

function runOneTentGate(email: string, hint: string): boolean {
  try {
    execFileSync("bash", ["-c", oneTentStep.run!], {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        E2E_TEST_EMAIL: email,
        E2E_TEST_PASSWORD: "not-a-real-password",
        E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: hint,
      },
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

describe("One-Tent proof account gate (grower bug item 20)", () => {
  it("passes only the disposable account named by the hint", () => {
    expect(runOneTentGate(disposable, disposable)).toBe(true);
    expect(runOneTentGate(" E2E-Fixture@Verdant-Test.invalid ", disposable)).toBe(true);
  });

  it("refuses a missing hint, a mismatch and each personal account", () => {
    expect(runOneTentGate(disposable, "")).toBe(false);
    expect(runOneTentGate("someone-else@verdant-test.invalid", disposable)).toBe(false);
    for (const personal of ["cheekhimself@gmail.com", "matt@verdantgrowdiary.com"]) {
      expect(runOneTentGate(personal, personal)).toBe(false);
    }
  });

  it("reads the disposable account's secrets, never the owner login", () => {
    expect(oneTentStep.env).toMatchObject({
      E2E_TEST_EMAIL: "${{ secrets.E2E_SMOKE_EMAIL }}",
      E2E_TEST_PASSWORD: "${{ secrets.E2E_SMOKE_PASSWORD }}",
    });
    expect(JSON.stringify(workflow.jobs["one-tent-authenticated-proof"])).not.toContain(
      "secrets.E2E_TEST_",
    );
  });
});
