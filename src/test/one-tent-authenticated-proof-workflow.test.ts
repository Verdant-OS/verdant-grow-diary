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
import { serializeEnvFile } from "../../scripts/e2e/managed-session-materialize-core.mjs";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/quicklog-smoke.yml");
const SPEC_PATH = resolve(ROOT, "e2e/one-tent-loop-golden-path-ui.spec.ts");
const GUIDE_PATH = resolve(ROOT, "docs/one-tent-loop-golden-path.md");
const VERIFIER_PATH = resolve(ROOT, "scripts/e2e/verify-one-tent-browser-proof-log.mjs");
const MATERIALIZER_PATH = resolve(ROOT, "scripts/e2e/materialize-managed-session.mjs");
const BRANCH = "codex/one-tent-authenticated-proof-current";
const BRANCH_REF = `refs/heads/${BRANCH}`;

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
      },
      cleanup: {
        status: "completed_with_retained_history",
        active_rows_removed: true,
        retained_history: true,
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
  const workflow = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
  const spec = readFileSync(SPEC_PATH, "utf8").replace(/\r\n/g, "\n");
  const guide = readFileSync(GUIDE_PATH, "utf8").replace(/\r\n/g, "\n");
  const jobMarker = "  one-tent-authenticated-proof:";
  const nextJobMarker = "\n  quicklog-smoke:";
  const jobStart = workflow.indexOf(jobMarker);
  const jobEnd = workflow.indexOf(nextJobMarker, jobStart);
  const job = jobStart >= 0 && jobEnd > jobStart ? workflow.slice(jobStart, jobEnd) : "";

  it("uses an explicit mutually-exclusive dispatch mode and cannot false-green proof mode", () => {
    const inputBlock = workflow.slice(
      workflow.indexOf("  workflow_dispatch:"),
      workflow.indexOf("\n  push:"),
    );
    expect(inputBlock).toMatch(/run_mode:\s*\n\s+description:/);
    expect(inputBlock).toMatch(/run_mode:[\s\S]*?required: true/);
    expect(inputBlock).toMatch(/run_mode:[\s\S]*?type: choice/);
    expect(inputBlock).toContain('options: ["quicklog_smoke", "one_tent_proof"]');
    expect(inputBlock).toMatch(/expected_sha:[\s\S]*?required: false/);

    expect(job).toContain("github.event_name == 'workflow_dispatch'");
    expect(job).toContain("inputs.run_mode == 'one_tent_proof'");
    expect(job).toContain(`[ "$GITHUB_REF" = "${BRANCH_REF}" ]`);
    expect(job).not.toContain("github.ref_name");
    expect(job).not.toContain("GITHUB_REF_NAME");
    expect(job).toContain("runs-on: ubuntu-latest");
    expect(job).toContain("permissions:\n      contents: read");
    expect(job).not.toContain("environment:");

    const ordinaryJob = workflow.slice(workflow.indexOf(nextJobMarker));
    expect(ordinaryJob).toContain(
      "github.event_name != 'workflow_dispatch' || inputs.run_mode == 'quicklog_smoke'",
    );
    expect(ordinaryJob).not.toContain(`github.ref != '${BRANCH_REF}'`);
  });

  it("requires and verifies the exact immutable deployment SHA before any secret is available", () => {
    const inputBlock = workflow.slice(
      workflow.indexOf("  workflow_dispatch:"),
      workflow.indexOf("\n  push:"),
    );
    expect(inputBlock).toMatch(/expected_sha:\s*\n\s+description:/);
    expect(inputBlock).toMatch(/expected_sha:[\s\S]*?required: false/);

    const dispatchFence = job.indexOf("      - name: Verify immutable dispatch identity");
    const checkout = job.indexOf("      - name: Checkout exact expected commit");
    const headFence = job.indexOf("      - name: Verify checked-out deployment identity");
    const credentialStep = job.indexOf("      - name: Verify E2E credentials are configured");
    expect(dispatchFence).toBeGreaterThan(0);
    expect(checkout).toBeGreaterThan(dispatchFence);
    expect(headFence).toBeGreaterThan(checkout);
    expect(credentialStep).toBeGreaterThan(headFence);

    const preSecret = job.slice(dispatchFence, credentialStep);
    expect(preSecret).toContain('EXPECTED_SHA: "${{ inputs.expected_sha }}"');
    expect(preSecret).toContain('GITHUB_CONTEXT_SHA: "${{ github.sha }}"');
    expect(preSecret).toContain('GITHUB_ACTOR: "${{ github.actor }}"');
    expect(preSecret).toContain('GITHUB_TRIGGERING_ACTOR: "${{ github.triggering_actor }}"');
    expect(preSecret).toContain('GITHUB_RUN_ATTEMPT: "${{ github.run_attempt }}"');
    expect(preSecret).toContain('[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(preSecret).toContain('[ "$GITHUB_ACTOR" = "cheekhimself" ]');
    expect(preSecret).toContain('[ "$GITHUB_TRIGGERING_ACTOR" = "cheekhimself" ]');
    expect(preSecret).toContain('[ "$GITHUB_RUN_ATTEMPT" = "1" ]');
    expect(preSecret).toContain('[ "$EXPECTED_SHA" = "$GITHUB_CONTEXT_SHA" ]');
    expect(preSecret).toContain('[ "$(git rev-parse HEAD)" = "$EXPECTED_SHA" ]');
    expect(preSecret).not.toContain("node scripts/stamp-version.mjs");
    expect(preSecret).not.toContain("secrets.");

    const checkoutStep = job.slice(checkout, headFence);
    expect(checkoutStep).toContain("ref: ${{ inputs.expected_sha }}");
    expect(checkoutStep).toContain("persist-credentials: false");
  });

  it("attests the fixed public HTTPS deployment before credentials without local stamping", () => {
    const headFence = job.indexOf("      - name: Verify checked-out deployment identity");
    const publicFence = job.indexOf("      - name: Verify public deployment identity");
    const credentialStep = job.indexOf("      - name: Verify E2E credentials are configured");
    expect(publicFence).toBeGreaterThan(headFence);
    expect(credentialStep).toBeGreaterThan(publicFence);

    const preSecret = job.slice(publicFence, credentialStep);
    expect(preSecret).toContain("https://verdantgrowdiary.com/version.json");
    expect(preSecret).toContain('require("node:https")');
    expect(preSecret).toContain("PUBLIC_VERSION_TIMEOUT_MS = 5_000");
    expect(preSecret).toContain("PUBLIC_VERSION_MAX_BYTES = 4_096");
    expect(preSecret).toContain("signal: AbortSignal.timeout(PUBLIC_VERSION_TIMEOUT_MS)");
    expect(preSecret).toContain("redirect_rejected");
    expect(preSecret).toContain("content-length");
    expect(preSecret).toContain("JSON.parse");
    expect(preSecret).toContain("parsed.commit !== expectedSha");
    expect(preSecret).not.toContain("scripts/stamp-version.mjs");
    expect(preSecret).not.toContain("console.log(body");
    expect(preSecret).not.toContain("secrets.");
    expect(job).toContain('E2E_BASE_URL: "https://verdantgrowdiary.com"');
  });

  it("serializes dispatches and rejects re-runs", () => {
    expect(job).toContain("concurrency:");
    expect(job).toContain("group: one-tent-authenticated-proof");
    expect(job).toContain("cancel-in-progress: false");
  });

  it("keeps at least ten deterministic job minutes beyond the 15-minute proof", () => {
    const proofTimeout = spec.match(/const AUTHENTICATED_PROOF_TIMEOUT_MS = (\d+) \* 60_000/);
    const jobTimeout = job.match(/timeout-minutes:\s*(\d+)/);
    expect(Number(proofTimeout?.[1])).toBe(15);
    expect(Number(jobTimeout?.[1]) - Number(proofTimeout?.[1])).toBeGreaterThanOrEqual(10);
  });

  it("uses only the existing end-user E2E credentials and fixed public app", () => {
    const jobEnv = job.slice(job.indexOf("\n    env:"), job.indexOf("\n    steps:"));
    const boundaryStep = job.slice(
      job.indexOf("      - name: Verify E2E credentials are configured"),
      job.indexOf("      - name: Setup Bun"),
    );
    const materializeStep = job.slice(
      job.indexOf("      - name: Materialize authenticated managed session"),
      job.indexOf("      - name: Run and verify authenticated One-Tent proof"),
    );
    const proofStep = job.slice(
      job.indexOf("      - name: Run and verify authenticated One-Tent proof"),
      job.indexOf("      - name: Remove generated authentication state"),
    );
    expect(jobEnv).not.toContain("secrets.E2E_TEST_EMAIL");
    expect(jobEnv).not.toContain("secrets.E2E_TEST_PASSWORD");
    for (const firstPartyStep of [boundaryStep, materializeStep]) {
      expect(firstPartyStep).toContain("E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}");
      expect(firstPartyStep).toContain("E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}");
    }
    expect(proofStep).not.toContain("${{ secrets.");
    expect(proofStep).toContain('E2E_TEST_EMAIL: "managed-session-trace-off"');
    expect(job).toContain('E2E_BASE_URL: "https://verdantgrowdiary.com"');
    expect(job).toContain('PLAYWRIGHT_RETRIES: "0"');
    expect(job).toContain("LOVABLE_E2E_TARGET_PROJECT_REF: knkwiiywfkbqznbxwqfh");
    expect(job).toContain('LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS: "true"');
    expect(job).toContain('E2E_EXPECTED_SHA: "${{ inputs.expected_sha }}"');
    expect(job).toContain(
      'E2E_ONE_TENT_FIXTURE_MARKER: "[GOLDEN-PATH-FIXTURE-RUN-${{ github.run_id }}-ATTEMPT-${{ github.run_attempt }}]"',
    );
  });

  it("validates the exact parsed Supabase origin before any step receives credentials", () => {
    const targetStepName = "      - name: Verify exact Supabase target origin";
    const credentialStepName = "      - name: Verify E2E credentials are configured";
    const targetStepStart = job.indexOf(targetStepName);
    const credentialStepStart = job.indexOf(credentialStepName);
    const setupBunStart = job.indexOf("      - name: Setup Bun");
    expect(targetStepStart).toBeGreaterThan(0);
    expect(credentialStepStart).toBeGreaterThan(targetStepStart);
    expect(setupBunStart).toBeGreaterThan(credentialStepStart);

    const targetStep = job.slice(targetStepStart, credentialStepStart);
    const credentialStep = job.slice(credentialStepStart, setupBunStart);
    expect(targetStep).toContain(
      "node --env-file=.env scripts/e2e/verify-one-tent-supabase-target.mjs",
    );
    expect(targetStep).not.toContain("secrets.E2E_TEST_");
    expect(targetStep).not.toContain("grep");
    expect(credentialStep).toContain("secrets.E2E_TEST_EMAIL");
    expect(credentialStep).toContain("secrets.E2E_TEST_PASSWORD");
    expect(credentialStep).not.toContain("VITE_SUPABASE_URL");
  });

  it("installs only the pinned browser binary without an apt package transaction", () => {
    expect(job).toContain("bunx playwright install chromium");
    expect(job).not.toContain("--with-deps");
    expect(job).not.toContain("e2e:install:ci");
  });

  it("preflights, runs, and owner-cleans the isolated real UI proof", () => {
    const materializeCommand =
      "bun --env-file=.env run scripts/e2e/materialize-managed-session.mjs";
    const proofCommandPrefix = "bun --env-file=.env --env-file=e2e/.auth/managed-session.env run";
    const materialize = job.indexOf(materializeCommand);
    const preflight = job.indexOf(`${proofCommandPrefix} e2e:one-tent:preflight`);
    const ui = job.indexOf(`${proofCommandPrefix} e2e:one-tent:ui`);
    const verify = job.indexOf("verify-one-tent-browser-proof-log.mjs");
    expect(materialize).toBeGreaterThan(0);
    expect(preflight).toBeGreaterThan(materialize);
    expect(ui).toBeGreaterThan(preflight);
    expect(verify).toBeGreaterThan(ui);
    expect(job).not.toContain("source .env");
    expect(job).not.toContain("source e2e/.auth/managed-session.env");
    expect(job).not.toContain("| tee");
    expect(job).toContain("> e2e/results/one-tent-authenticated-proof.log 2>&1");
    expect(job).toContain('LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS: "true"');
  });

  it("does not expose elevated credentials, paid AI, artifacts, deployment, or device control", () => {
    expect(job).not.toMatch(/SERVICE_ROLE|SUPABASE_DB_URL|OPENAI|ANTHROPIC|upload-artifact/i);
    expect(job).not.toMatch(/actions\/(?:deploy|upload-artifact)|device.control/i);
  });

  it("always removes generated authentication state and every Playwright artifact", () => {
    expect(job).toContain("if: always()");
    expect(job).toContain("e2e/.auth/managed-session.env");
    expect(job).toContain("e2e/.auth/user.json");
    expect(job).toContain("e2e/.auth/session-storage.json");
    expect(job).toContain("e2e/results/one-tent-authenticated-proof.log");
    expect(job).toContain("e2e/results/playwright-report.json");
    expect(job).toContain("rm -rf -- test-results playwright-report");
    expect(job).not.toMatch(/actions\/upload-artifact/i);
  });

  it("documents the immutable merge, deploy, public-version, branch-move, dispatch order", () => {
    const orderedTokens = [
      "Merge the exact proof commit",
      "Deploy that exact commit",
      "https://verdantgrowdiary.com/version.json",
      `Move \`${BRANCH}\` to that same immutable commit`,
      "run_mode=one_tent_proof",
      "expected_sha=<same 40-hex commit>",
      "first attempt only",
    ];
    let previous = -1;
    for (const token of orderedTokens) {
      const current = guide.indexOf(token);
      expect(current, token).toBeGreaterThan(previous);
      previous = current;
    }
  });
});

describe("managed-session materializer target fence", () => {
  it("round-trips session JSON through Bun env-file loading without escape corruption", () => {
    const root = mkdtempSync(join(tmpdir(), "one-tent-materializer-env-"));
    tempRoots.push(root);
    const envPath = join(root, "managed-session.env");
    const sessionJson = JSON.stringify({
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_at: 1,
      user: { id: "fake-user-id", display_name: "O'Connor $HOME" },
    });
    writeFileSync(
      envPath,
      serializeEnvFile({
        LOVABLE_BROWSER_AUTH_STATUS: "signed_in",
        LOVABLE_BROWSER_SUPABASE_SESSION_JSON: sessionJson,
        LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: "sb-knkwiiywfkbqznbxwqfh-auth-token",
      }),
      "utf8",
    );
    const childEnv = { ...process.env };
    delete childEnv.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
    childEnv.HOME = "must-not-expand";
    const result = spawnSync(
      "bun",
      [
        `--env-file=${envPath}`,
        "-e",
        [
          'const parsed = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "")',
          'if (parsed.access_token !== "fake-access-token") process.exit(2)',
          'if (parsed.user?.display_name !== "O\'Connor $HOME") process.exit(3)',
          'console.log("managed-session-env=verified")',
        ].join("; "),
      ],
      { cwd: root, encoding: "utf8", env: childEnv },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("managed-session-env=verified");
    expect(result.stderr).toBe("");
  });

  it("rejects raw newlines at the managed-session dotenv boundary", () => {
    expect(() =>
      serializeEnvFile({ LOVABLE_BROWSER_SUPABASE_SESSION_JSON: "line-one\nline-two" }),
    ).toThrow("managed_session_env_value_contains_newline");
  });

  it("blocks a mismatched local origin before attempting password authentication", () => {
    const root = mkdtempSync(join(tmpdir(), "one-tent-materializer-target-"));
    tempRoots.push(root);
    const email = "credential-must-not-leave@example.test";
    const password = "credential-must-not-leave-123";
    const result = spawnSync(process.execPath, [MATERIALIZER_PATH], {
      cwd: root,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        E2E_TEST_EMAIL: email,
        E2E_TEST_PASSWORD: password,
        VITE_SUPABASE_URL: "http://127.0.0.1:1",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
        VITE_SUPABASE_PROJECT_ID: "knkwiiywfkbqznbxwqfh",
        LOVABLE_E2E_TARGET_PROJECT_REF: "knkwiiywfkbqznbxwqfh",
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Reason: target_project_mismatch");
    expect(result.stdout).toContain("No login fabricated. No env written.");
    expect(`${result.stdout}${result.stderr}`).not.toContain(email);
    expect(`${result.stdout}${result.stderr}`).not.toContain(password);
  });
});

describe("One-Tent browser-proof log verifier", () => {
  it("accepts exactly one complete pass receipt when Playwright exits zero", () => {
    const result = runVerifier(`browser output\n${passReceiptLine()}\n`, 0);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(passReceiptLine());
    expect(result.stderr).toBe("");
  });

  it("rejects a missing or duplicated receipt", () => {
    expect(runVerifier("browser output only\n", 0).status).not.toBe(0);
    const line = passReceiptLine();
    expect(runVerifier(`${line}\n${line}\n`, 0).status).not.toBe(0);
  });

  it("rejects a nonzero Playwright exit even if a pass receipt was emitted", () => {
    const result = runVerifier(`${passReceiptLine()}\n`, 1);
    expect(result.status).not.toBe(0);
    expect(result.stderr.trim()).toBe("one_tent_browser_proof=playwright_failed:unclassified");
  });

  it("reports only the closed first-stage blocker code for a failed browser run", () => {
    const line = renderOneTentBrowserProofReceipt(
      buildOneTentBrowserProofReceipt({
        restoreStrategy: "storage_session",
        seedStatus: "completed",
        blockerReason: "timeline_visible_failed",
        stages: {
          auth_restored: "pass",
          hierarchy_created_via_ui: "pass",
          grow_resolved: "pass",
          tent_resolved: "pass",
          plant_resolved: "pass",
          quick_log_context_verified: "pass",
          plant_persisted_after_refresh: "pass",
          photo_and_manual_evidence_persisted: "pass",
          quick_log_persisted: "pass",
          timeline_visible: "fail",
        },
      }),
    );
    const result = runVerifier(`${line}\n`, 1);
    expect(result.status).not.toBe(0);
    expect(result.stderr.trim()).toBe(
      "one_tent_browser_proof=playwright_failed:timeline_visible_failed",
    );
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

  it("rejects cookie-only receipts for a database-backed complete pass", () => {
    const receipt = JSON.parse(passReceiptLine().split("=")[1]);
    receipt.restore_strategy = "cookies_only";
    const result = runVerifier(`ONE_TENT_BROWSER_PROOF_JSON=${JSON.stringify(receipt)}\n`, 0);
    expect(result.status).not.toBe(0);
    expect(result.stderr.trim()).toBe("one_tent_browser_proof=receipt_not_complete_pass");
  });
});
