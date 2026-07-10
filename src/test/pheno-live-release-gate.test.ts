/**
 * One-command release gate (scripts/releases/run-pheno-live-release-gate.mjs)
 * — orchestration tests with MOCKED child processes and filesystem. These
 * tests never contact production, never spawn real stage scripts, and verify
 * that secret values can never reach the terminal or the gate artifacts.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  parseEnvFile,
  verifyCredentialFile,
  evaluateWorkingCopy,
  runGate,
} from "../../scripts/releases/run-pheno-live-release-gate.mjs";
import { validateReceipt } from "../../scripts/releases/validate-pheno-release-receipt.mjs";
import { CHECKPOINT_TEST_MAP } from "../../scripts/e2e/pheno-live-smoke-report.mjs";

const REPO = "C:/fake-repo";
const ART = path.resolve(REPO, "artifacts/release-readiness/pheno-tracker-live-smoke");
const ENV_PATH = path.resolve(REPO, "e2e/.fixtures/pheno-live-smoke.env");

const SECRET_PASSWORD = "hunter2-super-secret-value";
const SECRET_EMAIL = "gate-secret@example.com";
const SECRET_HUNT_ID = "3d1c62a8-1111-4222-8333-444455556666";

const CRED_FILE = [
  "# live smoke credentials (test fixture — fake values)",
  "",
  "E2E_PHENO_LIVE_SMOKE_CONFIRM=RUN_LIVE_PHENO_SMOKE",
  `E2E_PHENO_FREE_EMAIL="${SECRET_EMAIL}"`,
  `E2E_PHENO_FREE_PASSWORD='${SECRET_PASSWORD}'`,
  `E2E_PHENO_PRO_EMAIL=${SECRET_EMAIL}`,
  `E2E_PHENO_PRO_PASSWORD=${SECRET_PASSWORD}`,
  `E2E_PHENO_FOUNDER_EMAIL=${SECRET_EMAIL}`,
  `E2E_PHENO_FOUNDER_PASSWORD=${SECRET_PASSWORD}`,
  `E2E_PHENO_CANCELED_EMAIL=${SECRET_EMAIL}`,
  `E2E_PHENO_CANCELED_PASSWORD=${SECRET_PASSWORD}`,
  `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE=${SECRET_HUNT_ID}`,
  `E2E_PHENO_HUNT_ID_COMPARISON_READY=${SECRET_HUNT_ID}`,
  "PHENO_EXPECTED_LIVE_BUILD_ID=index-DFkEvjho",
].join("\n");

function goodSmokeSummary() {
  return {
    deployment: "PASS",
    fingerprint: "PASS",
    preflight: "PASS",
    sessions: "PASS",
    playwright: "PASS",
    final: "PASS",
    tests: { passed: 10, failed: 0, skipped: 0, flaky: 0, total: 10 },
    checkpoints: CHECKPOINT_TEST_MAP.map((c: { id: number; label: string; titles: string[] }) => ({
      id: c.id,
      label: c.label,
      status: c.titles.length > 0 ? "PASS" : "PENDING",
      evidence: "automated smoke",
    })),
  };
}

function goodSchema() {
  return {
    columns: ["evidence_goals", "notes", "setup_completed_at"],
    entitlementFunctionCount: 1,
    restrictivePolicyTableCount: 13,
    allProPoliciesRestrictive: true,
    ownerSelectVerified: true,
  };
}

function goodManual() {
  return {
    expectedBuildId: "index-DFkEvjho",
    publishedAt: "2026-07-10T16:45:00Z",
    operator: "release-operator",
    decisionOwner: "release-operator",
    deployment: {
      noWhiteScreen: "PASS",
      evidence: "manual browser check",
      consoleErrors: "PASS",
      consoleEvidence: "DevTools clean",
    },
    billing: { required: false, status: "NOT_REQUIRED", evidence: "no billing change" },
    rollback: {
      priorVersionIdentified: "PASS",
      additiveMigrations: "PASS",
      entryPointDisable: "PASS",
      ownerReadPreserved: "PASS",
    },
    checkpoints: {
      6: { status: "PASS", evidence: "manual persistence check" },
      9: { status: "PASS", evidence: "manual live anchor check" },
    },
  };
}

/**
 * Build a fully mocked deps object. `files` maps absolute paths to string
 * content; `stageResults` maps stage-script path fragments to exit codes.
 * Stage side-effects (artifacts a real stage would write) are simulated via
 * `onStage`.
 */
function makeDeps(overrides: {
  files?: Record<string, string>;
  stageResults?: Record<string, number>;
  ignored?: (p: string) => boolean;
  statusLines?: string[];
  tracked?: string[];
  env?: Record<string, string>;
  onStage?: (script: string, files: Record<string, string>) => void;
}) {
  const files: Record<string, string> = { ...(overrides.files ?? {}) };
  const log: string[] = [];
  const spawned: string[] = [];
  const childEnvs: Array<Record<string, string | undefined>> = [];
  const deps = {
    repoRoot: REPO,
    env: { PATH: "x", ...(overrides.env ?? {}) },
    log: (line: string) => log.push(line),
    exists: (p: string) => Object.prototype.hasOwnProperty.call(files, path.resolve(p)),
    readFile: (p: string) => {
      const key = path.resolve(p);
      if (!(key in files)) throw new Error(`ENOENT: ${p}`);
      return files[key];
    },
    writeFile: (p: string, content: string) => {
      files[path.resolve(p)] = content;
    },
    gitStatusLines: () => overrides.statusLines ?? [],
    gitDiffCheck: () => "",
    gitTrackedSecretFiles: () => overrides.tracked ?? [],
    gitIsIgnored: overrides.ignored ?? ((p: string) => path.resolve(p) === ENV_PATH),
    runStage: (script: string, childEnv: Record<string, string | undefined>) => {
      spawned.push(script);
      childEnvs.push(childEnv);
      overrides.onStage?.(script, files);
      const hit = Object.entries(overrides.stageResults ?? {}).find(([frag]) =>
        script.includes(frag),
      );
      return hit ? hit[1] : 0;
    },
    now: () => "2026-07-10T00:00:00.000Z",
  };
  return { deps, log, spawned, childEnvs, files };
}

function withCredFile(extra?: Record<string, string>) {
  return { [ENV_PATH]: CRED_FILE, ...(extra ?? {}) };
}

function artifact(name: string, value: unknown) {
  return { [path.resolve(ART, name)]: JSON.stringify(value) };
}

/** Deps for a fully green run: every stage exits 0 and writes its artifact. */
function greenDeps(mutate?: Parameters<typeof makeDeps>[0]) {
  return makeDeps({
    files: {
      ...withCredFile(),
      ...artifact("schema-spot-check.json", goodSchema()),
      ...artifact("manual-release-checks.json", goodManual()),
    },
    onStage: (script, files) => {
      if (script.includes("fetch-pheno-live-build-id")) {
        files[path.resolve(ART, "deployed-build.json")] = JSON.stringify({
          status: "PASS",
          bundleId: "index-DFkEvjho",
          expectedMatch: true,
        });
      }
      if (script.includes("run-pheno-live-release-smoke")) {
        files[path.resolve(ART, "live-smoke-summary.json")] = JSON.stringify(goodSmokeSummary());
      }
    },
    ...mutate,
  });
}

describe("parseEnvFile", () => {
  it("skips blanks/comments, splits at first '=', strips matching quotes", () => {
    const parsed = parseEnvFile(CRED_FILE);
    expect(parsed.E2E_PHENO_LIVE_SMOKE_CONFIRM).toBe("RUN_LIVE_PHENO_SMOKE");
    expect(parsed.E2E_PHENO_FREE_EMAIL).toBe(SECRET_EMAIL);
    expect(parsed.E2E_PHENO_FREE_PASSWORD).toBe(SECRET_PASSWORD);
    expect(Object.keys(parsed)).not.toContain("#");
    expect(parseEnvFile("A=b=c").A).toBe("b=c");
    expect(parseEnvFile("noequals")).toEqual({});
  });
});

describe("credential file verification", () => {
  it("missing file → BLOCKED exit 2", async () => {
    const { deps, log } = makeDeps({ files: {} });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.preflight).toBe("BLOCKED");
    expect(log.join("\n")).toContain("final         BLOCKED");
  });

  it("unfilled template (REPLACE_ME values) → BLOCKED exit 2 before any stage", async () => {
    const template = CRED_FILE.split(SECRET_PASSWORD)
      .join("REPLACE_ME")
      .split(SECRET_EMAIL)
      .join("REPLACE_ME");
    const { deps, spawned } = makeDeps({ files: { [ENV_PATH]: template } });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.preflight).toBe("BLOCKED");
    // Names listed, values never; no child process (no preflight, no network).
    expect(summary.problems.join(" ")).toContain("placeholder values");
    expect(summary.problems.join(" ")).toContain("E2E_PHENO_FREE_PASSWORD");
    expect(spawned).toEqual([]);
  });

  it("file outside the repository → FAIL exit 1", async () => {
    const outside = path.resolve("C:/other-place/creds.env");
    const { deps } = makeDeps({
      files: { [outside]: CRED_FILE },
      env: { PHENO_LIVE_SMOKE_ENV_FILE: "../other-place/creds.env" },
      ignored: () => true,
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.problems.join(" ")).toContain("outside the repository");
  });

  it("file not gitignored → FAIL exit 1, never loaded", async () => {
    const { deps, spawned } = makeDeps({ files: withCredFile(), ignored: () => false });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.problems.join(" ")).toContain("not gitignored");
    expect(spawned).toEqual([]);
  });

  it("verifyCredentialFile unit contract", () => {
    expect(
      verifyCredentialFile({
        envFile: "e2e/.fixtures/pheno-live-smoke.env",
        repoRoot: REPO,
        exists: () => true,
        isIgnored: () => true,
      }).ok,
    ).toBe(true);
    expect(
      verifyCredentialFile({
        envFile: "../outside.env",
        repoRoot: REPO,
        exists: () => true,
        isIgnored: () => true,
      }),
    ).toMatchObject({ ok: false, exitCode: 1 });
  });
});

describe("stage gating", () => {
  it("working-copy problems block everything (exit 1)", async () => {
    const { deps, spawned } = makeDeps({
      files: withCredFile(),
      statusLines: [" M src/components/PhenoTrackerUpgradeGate.tsx"],
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.workingCopy).toBe("FAIL");
    expect(spawned).toEqual([]);
  });

  it("tracked credential/session files block (exit 1)", () => {
    const result = evaluateWorkingCopy({
      statusLines: [],
      diffCheckOutput: "",
      trackedSecretFiles: ["e2e/.auth/pheno-pro.json"],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("TRACKED");
  });

  it("a dirty receipt (writer-owned) is allowed", () => {
    const result = evaluateWorkingCopy({
      statusLines: [" M docs/releases/pheno-tracker-pro-release-receipt.md"],
      diffCheckOutput: "",
      trackedSecretFiles: [],
    });
    expect(result.ok).toBe(true);
  });

  it("preflight BLOCKED stops all later stages (exit 2)", async () => {
    const { deps, spawned } = makeDeps({
      files: withCredFile(),
      stageResults: { "check-pheno-live-smoke-env": 2 },
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.preflight).toBe("BLOCKED");
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain("check-pheno-live-smoke-env");
  });

  it("fingerprint mismatch stops before session generation (exit 1)", async () => {
    const { deps, spawned } = greenDeps({
      files: withCredFile(),
      onStage: (script, files) => {
        if (script.includes("fetch-pheno-live-build-id")) {
          files[path.resolve(ART, "deployed-build.json")] = JSON.stringify({
            status: "FAIL",
            expectedMatch: false,
          });
        }
      },
      stageResults: { "fetch-pheno-live-build-id": 1 },
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.buildIdentity).toBe("MISMATCH");
    expect(spawned.some((s) => s.includes("run-pheno-live-release-smoke"))).toBe(false);
  });

  it("unproven expected identity (no expected id set) also stops (exit 1)", async () => {
    const { deps } = greenDeps({
      onStage: (script, files) => {
        if (script.includes("fetch-pheno-live-build-id")) {
          files[path.resolve(ART, "deployed-build.json")] = JSON.stringify({
            status: "PASS",
            expectedMatch: null,
          });
        }
      },
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.buildIdentity).toBe("UNPROVEN");
  });

  it("smoke failure prevents GO (exit 1)", async () => {
    const { deps } = greenDeps({ stageResults: { "run-pheno-live-release-smoke": 1 } });
    const { exitCode } = await runGate(deps);
    expect(exitCode).toBe(1);
  });

  it("a skipped required test prevents GO (exit 1)", async () => {
    const { deps } = greenDeps({
      onStage: (script, files) => {
        if (script.includes("fetch-pheno-live-build-id")) {
          files[path.resolve(ART, "deployed-build.json")] = JSON.stringify({
            status: "PASS",
            expectedMatch: true,
          });
        }
        if (script.includes("run-pheno-live-release-smoke")) {
          const summary = goodSmokeSummary();
          summary.tests.skipped = 1;
          files[path.resolve(ART, "live-smoke-summary.json")] = JSON.stringify(summary);
        }
      },
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(1);
    expect(summary.problems.join(" ")).toContain("skipped");
  });

  it("smoke exit 0 with Playwright never launched must never PASS (exit 1)", async () => {
    const { deps } = greenDeps({
      onStage: (script, files) => {
        if (script.includes("fetch-pheno-live-build-id")) {
          files[path.resolve(ART, "deployed-build.json")] = JSON.stringify({
            status: "PASS",
            expectedMatch: true,
          });
        }
        if (script.includes("run-pheno-live-release-smoke")) {
          const summary = goodSmokeSummary();
          summary.playwright = "PENDING";
          summary.tests = { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 };
          files[path.resolve(ART, "live-smoke-summary.json")] = JSON.stringify(summary);
        }
      },
    });
    const { exitCode } = await runGate(deps);
    expect(exitCode).toBe(1);
  });

  it("missing schema artifact → HOLD exit 2 after a passing smoke", async () => {
    const { deps, files } = greenDeps();
    delete files[path.resolve(ART, "schema-spot-check.json")];
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.schema).toBe("HOLD");
  });

  it("missing manual evidence → HOLD exit 2", async () => {
    const { deps, files } = greenDeps();
    delete files[path.resolve(ART, "manual-release-checks.json")];
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.manualEvidence).toBe("HOLD");
    expect(summary.checkpoint9Manual).toBe("MISSING");
  });

  it("checkpoint 9 automated PASS but manual evidence absent → HOLD exit 2", async () => {
    const manual = goodManual();
    delete (manual.checkpoints as Record<string, unknown>)["9"];
    const { deps } = greenDeps({
      files: {
        ...withCredFile(),
        ...artifact("schema-spot-check.json", goodSchema()),
        ...artifact("manual-release-checks.json", manual),
      },
    });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.checkpoint9Automated).toBe("PASS");
    expect(summary.checkpoint9Manual).toBe("MISSING");
    expect(summary.problems.join(" ")).toContain("checkpoint 9 manual live evidence missing");
  });

  it("complete redacted evidence → GO exit 0", async () => {
    const { deps, log, spawned } = greenDeps();
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(0);
    expect(summary.final).toBe("GO");
    expect(summary.receipt).toBe("GO");
    expect(spawned.some((s) => s.includes("write-pheno-release-receipt"))).toBe(true);
    expect(spawned.some((s) => s.includes("validate-pheno-release-receipt"))).toBe(true);
    expect(log.join("\n")).toContain("playwright    10/0/0/0");
  });

  it("validator HOLD (exit 2) caps the gate at HOLD even when everything else passed", async () => {
    const { deps } = greenDeps({ stageResults: { "validate-pheno-release-receipt": 2 } });
    const { exitCode, summary } = await runGate(deps);
    expect(exitCode).toBe(2);
    expect(summary.receipt).toBe("HOLD");
  });

  it("service-role key is stripped from every child environment", async () => {
    const { deps, childEnvs } = greenDeps({
      env: { SUPABASE_SERVICE_ROLE_KEY: "must-not-leak" },
    });
    await runGate(deps);
    expect(childEnvs.length).toBeGreaterThan(0);
    for (const env of childEnvs) {
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    }
  });

  it("secret values never appear in terminal output or gate artifacts", async () => {
    const { deps, log, files } = greenDeps();
    await runGate(deps);
    const terminal = log.join("\n");
    const gateArtifacts = [
      files[path.resolve(ART, "release-gate-summary.json")],
      files[path.resolve(ART, "release-gate-summary.md")],
    ].join("\n");
    for (const secret of [SECRET_PASSWORD, SECRET_EMAIL, SECRET_HUNT_ID]) {
      expect(terminal).not.toContain(secret);
      expect(gateArtifacts).not.toContain(secret);
    }
  });
});

describe("receipt validator (validate-pheno-release-receipt.mjs)", () => {
  function inputs() {
    return {
      smoke: goodSmokeSummary(),
      schema: goodSchema(),
      build: {
        status: "PASS",
        bundleFile: "index-DFkEvjho.js",
        bundleId: "index-DFkEvjho",
        bundleSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        siteUrl: "https://verdantgrowdiary.com",
      },
      manual: goodManual(),
    };
  }

  it("validates GO when evidence is complete and the receipt matches", () => {
    const result = validateReceipt({ ...inputs(), receiptText: "**Release status:** GO" });
    expect(result).toMatchObject({ decision: "GO", exitCode: 0 });
  });

  it("missing artifacts → HOLD exit 2", () => {
    const result = validateReceipt({ ...inputs(), schema: null, receiptText: "x" });
    expect(result.exitCode).toBe(2);
    expect(result.problems.join(" ")).toContain("schema-spot-check.json");
  });

  it("stale receipt (decision mismatch) → exit 1", () => {
    const result = validateReceipt({ ...inputs(), receiptText: "**Release status:** HOLD" });
    expect(result.exitCode).toBe(1);
    expect(result.problems.join(" ")).toContain("stale");
  });

  it("checkpoint 9 manual evidence missing → HOLD exit 2 even if all 12 auto-PASS", () => {
    const data = inputs();
    // Automated proof present via smoke checkpoints, but policy needs manual.
    (data.smoke.checkpoints as Array<{ id: number; status: string }>).find(
      (c) => c.id === 9,
    )!.status = "PASS";
    delete (data.manual.checkpoints as Record<string, unknown>)["9"];
    const result = validateReceipt({ ...data, receiptText: "**Release status:** GO" });
    expect(result.exitCode).toBe(2);
    expect(result.problems.join(" ")).toContain("checkpoint 9 manual live evidence");
  });

  it("HOLD evidence → exit 2, never GO from aggregate totals alone", () => {
    const data = inputs();
    // Great aggregate totals but a checkpoint is only PENDING.
    (data.smoke.checkpoints as Array<{ id: number; status: string }>).find(
      (c) => c.id === 5,
    )!.status = "PENDING";
    const result = validateReceipt({ ...data, receiptText: "**Release status:** HOLD" });
    expect(result.exitCode).toBe(2);
  });
});
