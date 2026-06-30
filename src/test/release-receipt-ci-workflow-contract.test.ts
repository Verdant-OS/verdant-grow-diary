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
import path from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/release-receipt-ci.yml",
);
const COMPOSER_PATH = path.join(
  ROOT,
  "scripts/ci/compose-release-receipt-inputs.mjs",
);

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
    const preserveIdx = workflow.indexOf(
      "Preserve CI failure if any validation command failed",
    );
    expect(uploadIdx).toBeGreaterThan(0);
    expect(preserveIdx).toBeGreaterThan(uploadIdx);
    // The preservation step must `exit 1` on non-success outcomes.
    expect(workflow.slice(preserveIdx)).toMatch(/exit\s+1/);
    // Upload step must always run even on prior failure.
    expect(workflow).toMatch(
      /Upload release-receipt-v1 artifact[\s\S]*?if:\s*always\(\)/,
    );
  });

  it("failed validation cannot emit a passing receipt (deterministic emitter rules)", async () => {
    // Round-trip a failing fixture through the pure emitter and assert the
    // resulting artifact status is NOT `pass`.
    const { emitReleaseReceiptArtifact } = await import(
      "@/lib/releaseReceiptEmitter"
    );
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

  it("step ordering: emit happens before upload, upload happens before failure preservation", () => {
    const emitIdx = workflow.indexOf("Emit release-receipt.v1.json");
    const uploadIdx = workflow.indexOf("Upload release-receipt-v1 artifact");
    const preserveIdx = workflow.indexOf(
      "Preserve CI failure if any validation command failed",
    );
    expect(emitIdx).toBeGreaterThan(0);
    expect(uploadIdx).toBeGreaterThan(emitIdx);
    expect(preserveIdx).toBeGreaterThan(uploadIdx);
  });
});
