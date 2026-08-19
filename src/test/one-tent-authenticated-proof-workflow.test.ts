import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  ONE_TENT_PROOF_STAGES,
  buildOneTentBrowserProofReceipt,
  renderOneTentBrowserProofReceipt,
  type OneTentProofStage,
  type StageOutcome,
} from "../../e2e/helpers/oneTentBrowserProofReceipt";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/quicklog-smoke.yml");
const VERIFIER_PATH = resolve(ROOT, "scripts/e2e/verify-one-tent-browser-proof-log.mjs");
const BRANCH = "codex/one-tent-loop-plant-refresh";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

function allPassStages(): Partial<Record<OneTentProofStage, StageOutcome>> {
  return Object.fromEntries(ONE_TENT_PROOF_STAGES.map((stage) => [stage, "pass"]));
}

function passReceiptLine(): string {
  return renderOneTentBrowserProofReceipt(
    buildOneTentBrowserProofReceipt({
      restoreStrategy: "storage_session",
      seedStatus: "completed",
      stages: allPassStages(),
      duplicateFences: {
        quick_log_count: 1,
        alert_count: 1,
        action_queue_count: 1,
        follow_up_marker_count: 1,
      },
    }),
  );
}

function runVerifier(log: string, playwrightExit = 0) {
  const root = mkdtempSync(join(tmpdir(), "one-tent-proof-log-"));
  tempRoots.push(root);
  const logPath = join(root, "proof.log");
  writeFileSync(logPath, log, "utf8");
  return spawnSync(
    process.execPath,
    [VERIFIER_PATH, "--log", logPath, "--playwright-exit", String(playwrightExit)],
    { cwd: ROOT, encoding: "utf8" },
  );
}

describe("temporary authenticated One-Tent Actions lane", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const jobMarker = "  one-tent-authenticated-proof:";
  const nextJobMarker = "\n  quicklog-smoke:";
  const jobStart = workflow.indexOf(jobMarker);
  const jobEnd = workflow.indexOf(nextJobMarker, jobStart);
  const job = jobStart >= 0 && jobEnd > jobStart ? workflow.slice(jobStart, jobEnd) : "";

  it("runs only for an explicit manual dispatch on the authorized non-deploy branch", () => {
    expect(workflow).toContain(`github.ref_name != '${BRANCH}'`);
    expect(job).toContain("github.event_name == 'workflow_dispatch'");
    expect(job).toContain(`github.ref_name == '${BRANCH}'`);
    expect(job).toContain("permissions:\n      contents: read");
    expect(job).not.toContain("environment:");
  });

  it("uses only the existing end-user E2E credentials and local branch app", () => {
    expect(job).toContain("E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}");
    expect(job).toContain("E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}");
    expect(job).toMatch(/E2E_BASE_URL:\s*["']{2}/);
    expect(job).toContain('PLAYWRIGHT_RETRIES: "0"');
    expect(job).toContain("LOVABLE_E2E_TARGET_PROJECT_REF: knkwiiywfkbqznbxwqfh");
    expect(job).toContain('LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS: "false"');
    expect(job).toContain(
      'E2E_ONE_TENT_FIXTURE_MARKER: "[GOLDEN-PATH-FIXTURE-RUN-${{ github.run_id }}]"',
    );
  });

  it("installs only the pinned browser binary without an apt package transaction", () => {
    expect(job).toContain("bunx playwright install chromium");
    expect(job).not.toContain("--with-deps");
    expect(job).not.toContain("e2e:install:ci");
  });

  it("preflights and runs the isolated real UI proof without deleting retained evidence", () => {
    const materialize = job.indexOf("scripts/e2e/materialize-managed-session.mjs");
    const publicConfig = job.indexOf("source .env");
    const preflight = job.indexOf("e2e:one-tent:preflight");
    const ui = job.indexOf("e2e:one-tent:ui");
    const verify = job.indexOf("verify-one-tent-browser-proof-log.mjs");
    expect(materialize).toBeGreaterThan(0);
    expect(publicConfig).toBeGreaterThan(materialize);
    expect(preflight).toBeGreaterThan(publicConfig);
    expect(ui).toBeGreaterThan(preflight);
    expect(verify).toBeGreaterThan(ui);
    expect(job).not.toContain("--execute --confirm-fixture-teardown");
  });

  it("does not expose elevated credentials, paid AI, artifacts, deployment, or device control", () => {
    expect(job).not.toMatch(/SERVICE_ROLE|SUPABASE_DB_URL|OPENAI|ANTHROPIC|upload-artifact/i);
    expect(job).not.toMatch(/deploy|device.control/i);
  });

  it("always removes generated authentication state", () => {
    expect(job).toContain("if: always()");
    expect(job).toContain("e2e/.auth/managed-session.env");
    expect(job).toContain("e2e/.auth/user.json");
    expect(job).toContain("e2e/.auth/session-storage.json");
  });
});

describe("One-Tent browser-proof log verifier", () => {
  it("accepts exactly one complete pass receipt when Playwright exits zero", () => {
    const result = runVerifier(`browser output\n${passReceiptLine()}\n`, 0);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("one_tent_browser_proof=verified_pass");
    expect(result.stderr).toBe("");
  });

  it("rejects a missing or duplicated receipt", () => {
    expect(runVerifier("browser output only\n", 0).status).not.toBe(0);
    const line = passReceiptLine();
    expect(runVerifier(`${line}\n${line}\n`, 0).status).not.toBe(0);
  });

  it("rejects a nonzero Playwright exit even if a pass receipt was emitted", () => {
    expect(runVerifier(`${passReceiptLine()}\n`, 1).status).not.toBe(0);
  });

  it("rejects malformed or non-pass receipts without echoing attacker-controlled log text", () => {
    const marker = "DO_NOT_ECHO_SECRET_VALUE";
    const malformed = runVerifier(`ONE_TENT_BROWSER_PROOF_JSON={${marker}\n`, 0);
    expect(malformed.status).not.toBe(0);
    expect(`${malformed.stdout}${malformed.stderr}`).not.toContain(marker);

    const receipt = JSON.parse(passReceiptLine().split("=")[1]);
    receipt.status = "blocked";
    receipt.blocker_reason = marker;
    const blocked = runVerifier(`ONE_TENT_BROWSER_PROOF_JSON=${JSON.stringify(receipt)}\n`, 0);
    expect(blocked.status).not.toBe(0);
    expect(`${blocked.stdout}${blocked.stderr}`).not.toContain(marker);
  });

  it("rejects unexpected receipt fields so identifiers cannot hide in a passing proof", () => {
    const receipt = JSON.parse(passReceiptLine().split("=")[1]);
    receipt.user_id = "hidden-identifier";
    const result = runVerifier(`ONE_TENT_BROWSER_PROOF_JSON=${JSON.stringify(receipt)}\n`, 0);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("hidden-identifier");
  });
});
