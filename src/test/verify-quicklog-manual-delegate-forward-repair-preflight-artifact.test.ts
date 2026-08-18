import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const VERIFIER_PATH = resolve(
  "scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs",
);
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql",
);
const REPOSITORY = "Verdant-OS/verdant-grow-diary";
const REPOSITORY_ID = 123456789;
const WORKFLOW_PATH = ".github/workflows/apply-quicklog-manual-delegate-forward-repair.yml";
const WORKFLOW_ID = 654321;
const HEAD_SHA = "a".repeat(40);
const RUN_ID = 99887766;
const RUN_ATTEMPT = 2;
const CURRENT_RUN_ID = 99887799;
const STATE_DIGEST = "b".repeat(64);
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const MIGRATION_SHA256 = createHash("sha256")
  .update(readFileSync(MIGRATION_PATH))
  .digest("hex")
  .toUpperCase();

async function loadVerifier() {
  try {
    return await import(`${pathToFileURL(VERIFIER_PATH).href}?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    expect.fail(
      `Quick Log delegate receipt verifier could not be imported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function receipt(
  outcome: "safe_to_apply" | "schema_live_ledger_absent" = "safe_to_apply",
  extra: Record<string, unknown> = {},
) {
  return {
    schema_version: 1,
    tool: "apply-quicklog-manual-delegate-forward-repair",
    operation: "PREFLIGHT",
    outcome,
    safe_to_apply: true,
    repository: REPOSITORY,
    repository_id: String(REPOSITORY_ID),
    workflow_path: WORKFLOW_PATH,
    run_id: String(RUN_ID),
    run_attempt: RUN_ATTEMPT,
    event: "workflow_dispatch",
    branch: "verdant-grow-diary",
    head_sha: HEAD_SHA,
    project_ref: PROJECT_REF,
    migration_version: "20260818010000",
    migration_name: "quicklog_manual_delegate_forward_repair",
    migration_sha256: MIGRATION_SHA256,
    state_digest: STATE_DIGEST,
    ...extra,
  };
}

function priorRun(extra: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    run_attempt: RUN_ATTEMPT,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    workflow_id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    head_branch: "verdant-grow-diary",
    head_sha: HEAD_SHA,
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    head_repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: "2026-08-17T12:03:00.000Z",
    ...extra,
  };
}

function currentRun(extra: Record<string, unknown> = {}) {
  return {
    id: CURRENT_RUN_ID,
    run_attempt: 1,
    workflow_id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    event: "workflow_dispatch",
    head_branch: "verdant-grow-diary",
    head_sha: HEAD_SHA,
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    head_repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    created_at: "2026-08-17T12:05:00.000Z",
    ...extra,
  };
}

function workflow(extra: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    state: "active",
    updated_at: "2026-08-17T11:59:00.000Z",
    ...extra,
  };
}

async function archiveFor(value: Record<string, unknown> = receipt(), extraMember = false) {
  const zip = new JSZip();
  zip.file("preflight-receipt.json", `${JSON.stringify(value)}\n`, {
    unixPermissions: 0o100600,
  });
  if (extraMember) zip.file("unexpected.txt", "no");
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

function artifactFor(archive: Buffer, extra: Record<string, unknown> = {}) {
  return {
    id: 444333222,
    name: `quicklog-manual-delegate-forward-repair-preflight-run-${RUN_ID}-attempt-${RUN_ATTEMPT}`,
    size_in_bytes: archive.length,
    expired: false,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: RUN_ID,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
      head_branch: "verdant-grow-diary",
      head_sha: HEAD_SHA,
    },
    created_at: "2026-08-17T12:01:00.000Z",
    updated_at: "2026-08-17T12:02:00.000Z",
    expires_at: "2026-08-20T12:00:00.000Z",
    ...extra,
  };
}

function expectedContext(archive: Buffer, extra: Record<string, unknown> = {}) {
  return {
    repository: REPOSITORY,
    repositoryId: String(REPOSITORY_ID),
    currentRunId: String(CURRENT_RUN_ID),
    preflightRunId: String(RUN_ID),
    preflightRunAttempt: String(RUN_ATTEMPT),
    preflightArtifactSha256: createHash("sha256").update(archive).digest("hex"),
    headSha: HEAD_SHA,
    now: "2026-08-17T12:06:00.000Z",
    ...extra,
  };
}

describe("authenticated Quick Log delegate PREFLIGHT artifact", () => {
  it("uses only Node built-ins before token-bearing API access", async () => {
    await loadVerifier();
    const isolated = mkdtempSync(join(tmpdir(), "quicklog-delegate-verifier-clean-"));
    try {
      const target = join(isolated, "verifier.mjs");
      copyFileSync(VERIFIER_PATH, target);
      const source = readFileSync(target, "utf8");
      expect(source).not.toMatch(/from\s+["'](?:jszip|adm-zip|yauzl|unzipper)["']/);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("accepts one successful same-repo same-workflow preflight and rejects cross-run metadata", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifact = artifactFor(archive);

    expect(
      verifier.validatePreflightArtifactMetadata({
        priorRun: priorRun(),
        currentRun: currentRun(),
        workflow: workflow(),
        artifacts: { total_count: 1, artifacts: [artifact] },
        expected: expectedContext(archive),
      }),
    ).toEqual({
      artifact,
      artifactId: artifact.id,
      archiveDigest: createHash("sha256").update(archive).digest("hex"),
      runAttempt: RUN_ATTEMPT,
    });

    for (const mutation of [
      { priorRun: priorRun({ head_sha: "c".repeat(40) }) },
      { priorRun: priorRun({ conclusion: "failure" }) },
      { priorRun: priorRun({ event: "push" }) },
      { currentRun: currentRun({ repository: { id: 1, full_name: "other/repo" } }) },
      { workflow: workflow({ state: "disabled_manually" }) },
    ]) {
      expect(() =>
        verifier.validatePreflightArtifactMetadata({
          priorRun: mutation.priorRun ?? priorRun(),
          currentRun: mutation.currentRun ?? currentRun(),
          workflow: mutation.workflow ?? workflow(),
          artifacts: { total_count: 1, artifacts: [artifact] },
          expected: expectedContext(archive),
        }),
      ).toThrow("preflight_artifact_rejected");
    }
  });

  it("binds APPLY to the reviewed run attempt and artifact SHA-256", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifact = artifactFor(archive);
    const rerunArtifact = {
      ...artifact,
      name: `quicklog-manual-delegate-forward-repair-preflight-run-${RUN_ID}-attempt-${RUN_ATTEMPT + 1}`,
    };

    expect(() =>
      verifier.validatePreflightArtifactMetadata({
        priorRun: priorRun({ run_attempt: RUN_ATTEMPT + 1 }),
        currentRun: currentRun(),
        workflow: workflow(),
        artifacts: { total_count: 1, artifacts: [rerunArtifact] },
        expected: expectedContext(archive),
      }),
    ).toThrow("preflight_artifact_rejected");

    expect(() =>
      verifier.validatePreflightArtifactMetadata({
        priorRun: priorRun(),
        currentRun: currentRun(),
        workflow: workflow(),
        artifacts: { total_count: 1, artifacts: [artifact] },
        expected: expectedContext(archive, { preflightArtifactSha256: "0".repeat(64) }),
      }),
    ).toThrow("preflight_artifact_rejected");
  });

  it.each(["safe_to_apply", "schema_live_ledger_absent"] as const)(
    "binds the archive and strict %s receipt",
    async (outcome) => {
      const verifier = await loadVerifier();
      const archive = await archiveFor(receipt(outcome));
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
          archive,
          expected: expectedContext(archive),
        }),
      ).resolves.toEqual({ receiptDigest: STATE_DIGEST, artifactId: 444333222 });
    },
  );

  it("rejects changed keys, outcome, hash, or extra zip members", async () => {
    const verifier = await loadVerifier();
    for (const value of [
      receipt("safe_to_apply", { unexpected: "field" }),
      receipt("safe_to_apply", { outcome: "already_applied_verified" }),
      receipt("safe_to_apply", { safe_to_apply: false }),
      receipt("safe_to_apply", { migration_sha256: "0".repeat(64) }),
    ]) {
      const archive = await archiveFor(value);
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
          archive,
          expected: expectedContext(archive),
        }),
      ).rejects.toThrow("preflight_artifact_rejected");
    }

    const extra = await archiveFor(receipt(), true);
    await expect(
      verifier.verifyPreflightArtifactBundle({
        priorRun: priorRun(),
        currentRun: currentRun(),
        workflow: workflow(),
        artifacts: { total_count: 1, artifacts: [artifactFor(extra)] },
        archive: extra,
        expected: expectedContext(extra),
      }),
    ).rejects.toThrow("preflight_artifact_rejected");
  });

  it("rejects duplicate, expired, oversized, or misnamed receipt artifacts", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifact = artifactFor(archive);
    for (const artifacts of [
      { total_count: 2, artifacts: [artifact, { ...artifact, id: 2 }] },
      { total_count: 1, artifacts: [{ ...artifact, expired: true }] },
      { total_count: 1, artifacts: [{ ...artifact, size_in_bytes: 65_537 }] },
      { total_count: 1, artifacts: [{ ...artifact, name: "wrong" }] },
    ]) {
      expect(() =>
        verifier.validatePreflightArtifactMetadata({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts,
          expected: expectedContext(archive),
        }),
      ).toThrow("preflight_artifact_rejected");
    }
  });
});
