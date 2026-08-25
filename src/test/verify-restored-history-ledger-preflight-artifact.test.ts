import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const VERIFIER_PATH = resolve("scripts/verify-restored-history-ledger-preflight-artifact.mjs");
const POLICY_PATH = resolve("scripts/lib/solo-founder-production-authorization.mjs");
const { SOLO_FOUNDER_POLICY } = await import(pathToFileURL(POLICY_PATH).href);

const REPOSITORY = "Verdant-OS/verdant-grow-diary";
const REPOSITORY_ID = 123456789;
const WORKFLOW_PATH = ".github/workflows/reconcile-restored-history-ledger.yml";
const ARTIFACT_PREFIX = "restored-history-ledger-reconciliation-preflight";
const WORKFLOW_ID = 654321;
const DEPLOY_HEAD_SHA = "a".repeat(40);
const CANDIDATE_HEAD_SHA = "b".repeat(40);
const CANDIDATE_PR_NUMBER = 1113;
const RUN_ID = 99887766;
const RUN_ATTEMPT = 1;
const CURRENT_RUN_ID = 99887799;
const STATE_DIGEST = "c".repeat(64);
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const MANIFEST_SHA256 = "2ccbd35a200b5030520a0801402d93b76b2f44675620bbc86730773774d707d9";
const MAX_ARCHIVE_BYTES = 65_536;
const TARGET_MIGRATIONS = [
  {
    version: "20260710003638",
    name: "pheno_hunt_setup_backfill",
    path: "supabase/migrations/20260710003638_pheno_hunt_setup_backfill.sql",
    sha256: "8945dbff9369d88ecad8d9a19c19cbb30d7c5a415107662e6b9203dfb84c5c4e",
  },
  {
    version: "20260710013255",
    name: "staff_role_grant_trigger_and_backfill",
    path: "supabase/migrations/20260710013255_staff_role_grant_trigger_and_backfill.sql",
    sha256: "8b443cc919ba4a74f02059e98d0c8f5743ba5a3bb97569a1e16d046ed7f90850",
  },
  {
    version: "20260725033124",
    name: "core_schema_forward_repair",
    path: "supabase/migrations/20260725033124_core_schema_forward_repair.sql",
    sha256: "c1c9fde7176c1e60b044a9d83a9f4ccfc4745163d5ab2d218fbd080ece40e36b",
  },
] as const;

async function loadVerifier() {
  return import(`${pathToFileURL(VERIFIER_PATH).href}?test=${Date.now()}-${Math.random()}`);
}

function receipt(extra: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    tool: "reconcile-restored-history-ledger",
    operation: "PREFLIGHT",
    outcome: "safe_to_reconcile",
    safe_to_apply: true,
    repository: REPOSITORY,
    repository_id: String(REPOSITORY_ID),
    workflow_path: WORKFLOW_PATH,
    run_id: String(RUN_ID),
    run_attempt: RUN_ATTEMPT,
    event: "workflow_dispatch",
    branch: "verdant-grow-diary",
    deploy_head_sha: DEPLOY_HEAD_SHA,
    candidate_pr_number: CANDIDATE_PR_NUMBER,
    candidate_head_sha: CANDIDATE_HEAD_SHA,
    project_ref: PROJECT_REF,
    manifest_sha256: MANIFEST_SHA256,
    target_migrations: TARGET_MIGRATIONS.map((migration) => ({ ...migration })),
    state_digest: STATE_DIGEST,
    delivery_mode: SOLO_FOUNDER_POLICY.deliveryMode,
    founder_github_user_id: SOLO_FOUNDER_POLICY.founderUserId,
    founder_github_login: SOLO_FOUNDER_POLICY.founderLogin,
    production_environment: SOLO_FOUNDER_POLICY.environmentName,
    solo_founder_acknowledgement_verified: true,
    environment_contract_verified: true,
    environment_approval_verified: true,
    minimum_review_seconds: SOLO_FOUNDER_POLICY.minimumReviewSeconds,
    maximum_review_seconds: SOLO_FOUNDER_POLICY.maximumReviewSeconds,
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
    head_sha: DEPLOY_HEAD_SHA,
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    head_repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    actor: {
      id: SOLO_FOUNDER_POLICY.founderUserId,
      login: SOLO_FOUNDER_POLICY.founderLogin,
    },
    triggering_actor: {
      id: SOLO_FOUNDER_POLICY.founderUserId,
      login: SOLO_FOUNDER_POLICY.founderLogin,
    },
    created_at: "2026-08-25T12:00:00.000Z",
    updated_at: "2026-08-25T12:03:00.000Z",
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
    head_sha: DEPLOY_HEAD_SHA,
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    head_repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
    actor: {
      id: SOLO_FOUNDER_POLICY.founderUserId,
      login: SOLO_FOUNDER_POLICY.founderLogin,
    },
    triggering_actor: {
      id: SOLO_FOUNDER_POLICY.founderUserId,
      login: SOLO_FOUNDER_POLICY.founderLogin,
    },
    created_at: "2026-08-25T12:18:00.000Z",
    ...extra,
  };
}

function workflow(extra: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    state: "active",
    updated_at: "2026-08-25T11:59:00.000Z",
    ...extra,
  };
}

async function archiveFor(
  value: Record<string, unknown> = receipt(),
  configure?: (zip: JSZip) => void,
) {
  const zip = new JSZip();
  zip.file("preflight-receipt.json", `${JSON.stringify(value)}\n`, {
    unixPermissions: 0o100600,
  });
  configure?.(zip);
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

async function archiveWithTraversalName(value: Record<string, unknown> = receipt()) {
  const zip = new JSZip();
  zip.file("../preflight-receipt.json", `${JSON.stringify(value)}\n`, {
    createFolders: false,
    unixPermissions: 0o100600,
  });
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

function claimOversizedUncompressedReceipt(archive: Buffer) {
  const mutated = Buffer.from(archive);
  const centralOffset = mutated.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (centralOffset < 0) throw new Error("test archive has no central directory entry");
  mutated.writeUInt32LE(32_769, centralOffset + 24);
  return mutated;
}

function artifactFor(archive: Buffer, extra: Record<string, unknown> = {}) {
  return {
    id: 444333222,
    name: `${ARTIFACT_PREFIX}-run-${RUN_ID}-attempt-${RUN_ATTEMPT}`,
    size_in_bytes: archive.length,
    expired: false,
    digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    workflow_run: {
      id: RUN_ID,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
      head_branch: "verdant-grow-diary",
      head_sha: DEPLOY_HEAD_SHA,
    },
    created_at: "2026-08-25T12:01:00.000Z",
    updated_at: "2026-08-25T12:02:00.000Z",
    expires_at: "2099-08-25T12:00:00.000Z",
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
    deployHeadSha: DEPLOY_HEAD_SHA,
    candidatePrNumber: String(CANDIDATE_PR_NUMBER),
    candidateHeadSha: CANDIDATE_HEAD_SHA,
    now: "2026-08-25T12:19:00.000Z",
    ...extra,
  };
}

async function verifyBundle(
  verifier: Awaited<ReturnType<typeof loadVerifier>>,
  archive: Buffer,
  overrides: {
    priorRun?: Record<string, unknown>;
    currentRun?: Record<string, unknown>;
    workflow?: Record<string, unknown>;
    artifacts?: Record<string, unknown>;
    expected?: Record<string, unknown>;
  } = {},
) {
  return verifier.verifyPreflightArtifactBundle({
    priorRun: overrides.priorRun ?? priorRun(),
    currentRun: overrides.currentRun ?? currentRun(),
    workflow: overrides.workflow ?? workflow(),
    artifacts: overrides.artifacts ?? {
      total_count: 1,
      artifacts: [artifactFor(archive)],
    },
    archive,
    expected: overrides.expected ?? expectedContext(archive),
  });
}

function createCliFixture(archive: Buffer, candidateHeadSha = CANDIDATE_HEAD_SHA) {
  const root = mkdtempSync(join(tmpdir(), "restored-history-verifier-cli-"));
  const verifierPath = join(root, "verifier.mjs");
  const policyDir = join(root, "lib");
  const archivePath = join(root, "artifact.zip");
  const githubEnvPath = join(root, "github.env");
  mkdirSync(policyDir);
  copyFileSync(VERIFIER_PATH, verifierPath);
  copyFileSync(POLICY_PATH, join(policyDir, "solo-founder-production-authorization.mjs"));
  writeFileSync(
    join(root, "verify-quicklog-corrections-preflight-artifact.mjs"),
    'import { readFileSync } from "node:fs";\nexport async function downloadArtifactArchive() { return readFileSync(process.env.TEST_ARCHIVE_PATH); }\n',
  );
  writeFileSync(archivePath, archive);
  const artifact = artifactFor(archive);
  const jsonFiles = {
    PREFLIGHT_RUN_JSON: priorRun(),
    CURRENT_RUN_JSON: currentRun(),
    WORKFLOW_JSON: workflow(),
    PREFLIGHT_ARTIFACTS_JSON: { total_count: 1, artifacts: [artifact] },
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_PATH: "",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REPOSITORY_ID: String(REPOSITORY_ID),
    GITHUB_RUN_ID: String(CURRENT_RUN_ID),
    PREFLIGHT_RUN_ID: String(RUN_ID),
    EXPECTED_PREFLIGHT_RUN_ATTEMPT: String(RUN_ATTEMPT),
    EXPECTED_PREFLIGHT_ARTIFACT_SHA256: createHash("sha256").update(archive).digest("hex"),
    EXPECTED_HEAD_SHA: DEPLOY_HEAD_SHA,
    EXPECTED_CANDIDATE_PR_NUMBER: String(CANDIDATE_PR_NUMBER),
    EXPECTED_CANDIDATE_HEAD_SHA: candidateHeadSha,
    GITHUB_TOKEN: "not-used-by-test-stub",
    GITHUB_ENV: githubEnvPath,
    TEST_ARCHIVE_PATH: archivePath,
  };
  for (const [name, value] of Object.entries(jsonFiles)) {
    const path = join(root, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    env[name] = path;
  }
  return { root, verifierPath, githubEnvPath, env };
}

describe("authenticated restored-history ledger PREFLIGHT artifact", () => {
  it("imports the canonical founder policy and keeps production ZIP parsing Node-built-in", () => {
    expect(SOLO_FOUNDER_POLICY).toEqual({
      deliveryMode: "solo_founder_self_review_v1",
      founderUserId: 72639960,
      founderLogin: "cheekhimself",
      environmentName: "verdant-production-solo-founder",
      branchName: "verdant-grow-diary",
      acknowledgement: "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN",
      minimumReviewSeconds: 900,
      maximumReviewSeconds: 86400,
    });
    expect(Object.isFrozen(SOLO_FOUNDER_POLICY)).toBe(true);
    expect(readFileSync(VERIFIER_PATH, "utf8")).not.toMatch(
      /from\s+["'](?:jszip|adm-zip|yauzl|unzipper)["']/,
    );
  });

  it("accepts the exact run, workflow, artifact, candidate, and three-migration receipt", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();

    await expect(verifyBundle(verifier, archive)).resolves.toEqual({
      receiptDigest: STATE_DIGEST,
      artifactId: 444333222,
    });
  });

  it("rejects run, deploy-head, candidate, and artifact-digest substitutions", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const digest = createHash("sha256").update(archive).digest("hex");
    const cases = [
      { priorRun: priorRun({ id: RUN_ID + 1 }) },
      { currentRun: currentRun({ id: CURRENT_RUN_ID + 1 }) },
      { priorRun: priorRun({ head_sha: "d".repeat(40) }) },
      { expected: expectedContext(archive, { deployHeadSha: "d".repeat(40) }) },
      { expected: expectedContext(archive, { candidatePrNumber: CANDIDATE_PR_NUMBER + 1 }) },
      { expected: expectedContext(archive, { candidateHeadSha: "d".repeat(40) }) },
      {
        artifacts: {
          total_count: 1,
          artifacts: [artifactFor(archive, { digest: `sha256:${"d".repeat(64)}` })],
        },
      },
      { expected: expectedContext(archive, { preflightArtifactSha256: "d".repeat(64) }) },
      {
        artifacts: {
          total_count: 1,
          artifacts: [artifactFor(archive, { digest: `sha256:${digest.toUpperCase()}` })],
        },
      },
    ];

    for (const overrides of cases) {
      await expect(verifyBundle(verifier, archive, overrides)).rejects.toThrow(
        "preflight_artifact_rejected",
      );
    }
  });

  it("requires the exact receipt schema without missing or extra authorization fields", async () => {
    const verifier = await loadVerifier();
    const withExtra = await archiveFor(receipt({ authorization_scope: "extra" }));
    const withoutApproval = receipt();
    delete (withoutApproval as Record<string, unknown>).environment_approval_verified;
    const withMissing = await archiveFor(withoutApproval);

    for (const archive of [withExtra, withMissing]) {
      await expect(verifyBundle(verifier, archive)).rejects.toThrow("preflight_artifact_rejected");
    }
  });

  it("rejects altered, reordered, or expanded migration evidence", async () => {
    const verifier = await loadVerifier();
    const altered: Array<{
      version: string;
      name: string;
      path: string;
      sha256: string;
    }> = TARGET_MIGRATIONS.map((migration) => ({ ...migration }));
    altered[0].sha256 = "d".repeat(64);
    const reordered = TARGET_MIGRATIONS.map((migration) => ({ ...migration })).reverse();
    const expanded = [
      ...TARGET_MIGRATIONS.map((migration) => ({ ...migration })),
      { version: "1", name: "extra", path: "extra.sql", sha256: "d".repeat(64) },
    ];

    for (const migrations of [altered, reordered, expanded]) {
      const archive = await archiveFor(receipt({ target_migrations: migrations }));
      await expect(verifyBundle(verifier, archive)).rejects.toThrow("preflight_artifact_rejected");
    }
  });

  it("rejects multi-member, traversal-named, oversized-receipt, and oversized archives", async () => {
    const verifier = await loadVerifier();
    const extraMember = await archiveFor(receipt(), (zip) => zip.file("unexpected.txt", "no"));
    const traversal = await archiveWithTraversalName();
    const oversizedClaim = claimOversizedUncompressedReceipt(await archiveFor());
    const oversizedArchive = Buffer.alloc(MAX_ARCHIVE_BYTES + 1, 1);

    for (const archive of [extraMember, traversal, oversizedClaim, oversizedArchive]) {
      await expect(verifyBundle(verifier, archive)).rejects.toThrow("preflight_artifact_rejected");
    }
  });

  it("writes the verified state digest to GITHUB_ENV only after full CLI success", async () => {
    const archive = await archiveFor();
    const fixture = createCliFixture(archive);
    try {
      writeFileSync(fixture.githubEnvPath, "");
      const result = spawnSync(process.execPath, [fixture.verifierPath], {
        cwd: fixture.root,
        encoding: "utf8",
        env: fixture.env,
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(
        "Authenticated restored-history ledger PREFLIGHT artifact validated.",
      );
      expect(readFileSync(fixture.githubEnvPath, "utf8")).toBe(
        `PREFLIGHT_RECEIPT_DIGEST=${STATE_DIGEST}\n`,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed without creating GITHUB_ENV output when the candidate head is not exact", async () => {
    const archive = await archiveFor();
    const fixture = createCliFixture(archive, "d".repeat(40));
    try {
      const result = spawnSync(process.execPath, [fixture.verifierPath], {
        cwd: fixture.root,
        encoding: "utf8",
        env: fixture.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Authenticated restored-history ledger PREFLIGHT artifact validation failed closed.",
      );
      expect(existsSync(fixture.githubEnvPath)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
