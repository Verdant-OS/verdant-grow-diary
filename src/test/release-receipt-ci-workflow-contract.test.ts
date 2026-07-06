/**
 * Release Receipt CI Workflow Upload v1 — workflow contract test.
 *
 * Static, read-only assertions over `.github/workflows/release-receipt-ci.yml`
 * and `scripts/ci/compose-release-receipt-inputs.mjs`.
 *
 * SAFETY
 *  - Pure file reads. No network, no Supabase, no GitHub API.
 *  - Asserts the workflow uploads the artifact, names it `release-receipt-v1`,
 *    references `release-receipt.v1.json`, uses `ci_full_suite`, never
 *    imports UI/view-model code, never calls GitHub APIs, never references
 *    forbidden tokens, and preserves CI failure after artifact upload.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/release-receipt-ci.yml");
const COMPOSER_PATH = path.join(ROOT, "scripts/ci/compose-release-receipt-inputs.mjs");

const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
const composer = fs.readFileSync(COMPOSER_PATH, "utf8");

const FORBIDDEN_SUBSTRINGS = [
  "api.github.com",
  "octokit",
  "@octokit/",
  "fetch(",
  "supabase",
  "functions.invoke",
  "setInterval",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "Authorization: Bearer",
  "Authorization:Bearer",
];

const UI_FORBIDDEN_IMPORTS = [
  "releaseReadinessViewModel",
  "releaseReadinessEvidenceReceiptViewModel",
  "ReleaseReadiness",
  "src/pages/ReleaseReadiness",
  "src/components/ReleaseReadiness",
];

describe("release-receipt CI workflow upload v1 — contract", () => {
  it("workflow file exists", () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
    expect(fs.existsSync(COMPOSER_PATH)).toBe(true);
  });

  it("uses actions/upload-artifact", () => {
    expect(workflow).toMatch(/actions\/upload-artifact/);
  });

  it("artifact name is release-receipt-v1", () => {
    expect(workflow).toMatch(/name:\s*release-receipt-v1\b/);
  });

  it("references release-receipt.v1.json output path", () => {
    expect(workflow).toContain("release-receipt.v1.json");
  });

  it("references release-receipt-input.json staging path", () => {
    expect(workflow).toContain("release-receipt-input.json");
  });

  it("references command-results.json staging path", () => {
    expect(workflow).toContain("command-results.json");
  });

  it("invokes the existing emit-release-receipt.mjs script", () => {
    expect(workflow).toContain("scripts/emit-release-receipt.mjs");
  });

  it("invokes the existing build-release-receipt-input.mjs script", () => {
    expect(workflow).toContain("scripts/build-release-receipt-input.mjs");
  });

  it("uses receipt kind ci_full_suite", () => {
    expect(workflow).toContain("ci_full_suite");
    expect(composer).toContain('"ci_full_suite"');
  });

  it("uses safe GitHub context expressions only", () => {
    for (const expr of [
      "${{ github.run_id }}",
      "${{ github.sha }}",
      "${{ github.ref_name }}",
      "${{ github.workflow }}",
    ]) {
      expect(workflow).toContain(expr);
    }
  });

  it("does not reference forbidden tokens / APIs", () => {
    const haystack = `${workflow}\n${composer}`.toLowerCase();
    for (const needle of FORBIDDEN_SUBSTRINGS) {
      expect(
        haystack.includes(needle.toLowerCase()),
        `forbidden substring leaked into workflow/composer: ${needle}`,
      ).toBe(false);
    }
  });

  it("does not import ReleaseReadiness UI/view-model code", () => {
    const haystack = `${workflow}\n${composer}`;
    for (const needle of UI_FORBIDDEN_IMPORTS) {
      expect(
        haystack.includes(needle),
        `ReleaseReadiness UI/view-model import leaked: ${needle}`,
      ).toBe(false);
    }
  });

  it("preserves CI failure with a final failing step after artifact upload", () => {
    const uploadIdx = workflow.indexOf("actions/upload-artifact");
    const preserveIdx = workflow.indexOf("Preserve CI failure if any validation command failed");
    expect(uploadIdx).toBeGreaterThan(0);
    expect(preserveIdx).toBeGreaterThan(uploadIdx);
    // The preservation step must `exit 1` on non-success outcomes.
    expect(workflow.slice(preserveIdx)).toMatch(/exit\s+1/);
    // Trusted upload must run on success, diagnostic upload on failure.
    expect(workflow).toMatch(
      /Upload release-receipt-v1 artifact \(trusted\)[\s\S]*?if:\s*success\(\)/,
    );
    expect(workflow).toMatch(
      /Upload release-receipt-v1 artifact \(diagnostic on failure\)[\s\S]*?if:\s*failure\(\)/,
    );
  });

  it("failed validation cannot emit a passing receipt (deterministic emitter rules)", async () => {
    const { emitReleaseReceiptArtifact } = await import("@/lib/releaseReceiptEmitter");
    const result = emitReleaseReceiptArtifact({
      artifactId: "ci-full-suite-contract-test",
      generatedAt: "2026-06-30T00:00:00.000Z",
      source: "github_actions",
      receiptKind: "ci_full_suite",
      summary: "contract test — failing fixture",
      commands: [
        {
          name: "typecheck",
          command: "bunx tsgo --noEmit",
          status: "pass",
          passed: 1,
          failed: 0,
          skipped: 0,
          duration_ms: 10,
          summary: "ok",
        },
        {
          name: "release-receipt-emitter",
          command: "bunx vitest run src/test/release-receipt-emitter.test.ts",
          status: "fail",
          passed: 0,
          failed: 1,
          skipped: 0,
          duration_ms: 20,
          summary: "FAILED",
        },
      ],
      sourceRunId: "1",
      commitSha: null,
      branch: "main",
      workflowName: "Release Receipt CI Upload",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.artifact.status).not.toBe("pass");
      expect(result.artifact.status).toBe("fail");
    }
  });

  it("step ordering: emit → validate → print status → upload → preserve failure", () => {
    const emitIdx = workflow.indexOf("Emit release-receipt.v1.json");
    const validateIdx = workflow.indexOf(
      "Validate release-receipt.v1.json against trusted v1 contract",
    );
    const printIdx = workflow.indexOf("Print derived release receipt status");
    const trustedIdx = workflow.indexOf("Upload release-receipt-v1 artifact (trusted)");
    const preserveIdx = workflow.indexOf("Preserve CI failure if any validation command failed");
    expect(emitIdx).toBeGreaterThan(0);
    expect(validateIdx).toBeGreaterThan(emitIdx);
    expect(printIdx).toBeGreaterThan(validateIdx);
    expect(trustedIdx).toBeGreaterThan(printIdx);
    expect(preserveIdx).toBeGreaterThan(trustedIdx);
  });

  it("validate and print-status steps do not use continue-on-error", () => {
    // Slice between validate step and the upload after it; assert no
    // `continue-on-error` is set on validate or print-status.
    const validateBlock = workflow.slice(
      workflow.indexOf("Validate release-receipt.v1.json against trusted v1 contract"),
      workflow.indexOf("Upload release-receipt-v1 artifact (trusted)"),
    );
    expect(validateBlock).not.toMatch(/continue-on-error\s*:\s*true/);
    expect(validateBlock).toContain("Print derived release receipt status");
    expect(validateBlock).toContain("scripts/validate-release-receipt-artifact.mjs");
    expect(validateBlock).toContain("scripts/print-release-receipt-status.mjs");
  });

  it("trusted upload references both validator and printer scripts in workflow", () => {
    expect(workflow).toContain("scripts/validate-release-receipt-artifact.mjs");
    expect(workflow).toContain("scripts/print-release-receipt-status.mjs");
  });

  it("package.json exposes release-receipt:dry-run, :validate and :print-status", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.["release-receipt:dry-run"]).toMatch(
      /dry-run-release-receipt-workflow\.mjs/,
    );
    expect(pkg.scripts?.["release-receipt:validate"]).toMatch(
      /validate-release-receipt-artifact\.mjs/,
    );
    expect(pkg.scripts?.["release-receipt:print-status"]).toMatch(
      /print-release-receipt-status\.mjs/,
    );
  });

  it("validator and status printer exit nonzero on invalid receipt fixture", () => {
    const tmp = path.join(os.tmpdir(), `bad-receipt-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ not: "a receipt" }), "utf8");
    try {
      const v = spawnSync(
        process.execPath,
        [path.join(ROOT, "scripts/validate-release-receipt-artifact.mjs"), tmp],
        { encoding: "utf8" },
      );
      expect(v.status).not.toBe(0);
      const p = spawnSync(
        process.execPath,
        [path.join(ROOT, "scripts/print-release-receipt-status.mjs"), tmp],
        { encoding: "utf8" },
      );
      expect(p.status).not.toBe(0);
    } finally {
      if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    }
  });

  it("dry-run script exists and is executable as a Node script", () => {
    const p = path.join(ROOT, "scripts/dry-run-release-receipt-workflow.mjs");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf8");
    expect(src).toMatch(/validate-release-receipt-artifact\.mjs/);
    expect(src).toMatch(/print-release-receipt-status\.mjs/);
    expect(src).toMatch(/emitReleaseReceiptArtifact/);
    // Safety: no network/backend in dry-run.
    expect(src.toLowerCase()).not.toContain("fetch(");
    expect(src.toLowerCase()).not.toContain("supabase");
    expect(src).not.toContain("api.github.com");
  });
});
