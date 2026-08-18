import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const VERIFIER_PATH = resolve("scripts/verify-signup-acquisition-preflight-artifact.mjs");
const POLICY_PATH = resolve("scripts/lib/solo-founder-production-authorization.mjs");
const REPOSITORY = "Verdant-OS/verdant-grow-diary";
const REPOSITORY_ID = 123456789;
const WORKFLOW_PATH = ".github/workflows/apply-signup-acquisition-forward-repair.yml";
const ARTIFACT_PREFIX = "signup-acquisition-forward-repair-preflight";
const WORKFLOW_ID = 654321;
const HEAD_SHA = "a".repeat(40);
const RUN_ID = 99887766;
const RUN_ATTEMPT = 1;
const CURRENT_RUN_ID = 99887799;
const STATE_DIGEST = "b".repeat(64);
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const MIGRATION_SHA256 = "6C002AB676218C32C27E41E7A8E90FF4F452C41D7EDB446B0FCB950B93D3DEBA";
const FOUNDER_USER_ID = 72639960;
const FOUNDER_LOGIN = "cheekhimself";
const DELIVERY_MODE = "solo_founder_self_review_v1";
const PRODUCTION_ENVIRONMENT = "verdant-production-solo-founder";

async function loadVerifier() {
  return import(`${pathToFileURL(VERIFIER_PATH).href}?test=${Date.now()}-${Math.random()}`);
}

function receipt(extra: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    tool: "apply-signup-acquisition-forward-repair",
    operation: "PREFLIGHT",
    outcome: "safe_to_apply",
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
    migration_version: "20260813030000",
    migration_name: "signup_acquisition_forward_repair",
    migration_sha256: MIGRATION_SHA256,
    state_digest: STATE_DIGEST,
    delivery_mode: DELIVERY_MODE,
    founder_github_user_id: FOUNDER_USER_ID,
    founder_github_login: FOUNDER_LOGIN,
    production_environment: PRODUCTION_ENVIRONMENT,
    solo_founder_acknowledgement_verified: true,
    environment_contract_verified: true,
    environment_approval_verified: true,
    minimum_review_seconds: 900,
    maximum_review_seconds: 86400,
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
    actor: { id: FOUNDER_USER_ID, login: FOUNDER_LOGIN },
    triggering_actor: { id: FOUNDER_USER_ID, login: FOUNDER_LOGIN },
    created_at: "2026-08-15T12:00:00.000Z",
    updated_at: "2026-08-15T12:03:00.000Z",
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
    actor: { id: FOUNDER_USER_ID, login: FOUNDER_LOGIN },
    triggering_actor: { id: FOUNDER_USER_ID, login: FOUNDER_LOGIN },
    created_at: "2026-08-15T12:18:00.000Z",
    ...extra,
  };
}

function workflow(extra: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    state: "active",
    updated_at: "2026-08-15T11:59:00.000Z",
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

function claimOversizedUncompressedReceipt(archive: Buffer) {
  const mutated = Buffer.from(archive);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const centralOffset = mutated.indexOf(centralSignature);
  if (centralOffset < 0) throw new Error("test archive has no central directory entry");
  mutated.writeUInt32LE(65_536, centralOffset + 24);
  return mutated;
}

function artifactFor(archive: Buffer, extra: Record<string, unknown> = {}) {
  return {
    id: 444333222,
    name: `signup-acquisition-forward-repair-preflight-run-${RUN_ID}-attempt-${RUN_ATTEMPT}`,
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
    created_at: "2026-08-15T12:01:00.000Z",
    updated_at: "2026-08-15T12:02:00.000Z",
    expires_at: "2026-08-20T12:00:00.000Z",
    ...extra,
  };
}

function expectedContext(archive: Buffer) {
  return {
    repository: REPOSITORY,
    repositoryId: String(REPOSITORY_ID),
    currentRunId: String(CURRENT_RUN_ID),
    preflightRunId: String(RUN_ID),
    preflightRunAttempt: RUN_ATTEMPT,
    preflightArtifactSha256: createHash("sha256").update(archive).digest("hex"),
    headSha: HEAD_SHA,
    now: "2026-08-15T12:19:00.000Z",
  };
}

describe("authenticated signup-acquisition PREFLIGHT artifact", () => {
  it("imports on a clean runner using only Node built-ins before token-bearing API access", () => {
    const isolated = mkdtempSync(join(tmpdir(), "signup-repair-verifier-clean-"));
    const isolatedVerifier = join(isolated, "verify-signup-acquisition-preflight-artifact.mjs");
    try {
      copyFileSync(VERIFIER_PATH, isolatedVerifier);
      mkdirSync(join(isolated, "lib"));
      copyFileSync(POLICY_PATH, join(isolated, "lib", "solo-founder-production-authorization.mjs"));
      const source = readFileSync(isolatedVerifier, "utf8");
      expect(source).not.toMatch(/from\s+["'](?:jszip|adm-zip|yauzl|unzipper)["']/);

      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import(${JSON.stringify(pathToFileURL(isolatedVerifier).href)})`,
        ],
        {
          cwd: isolated,
          encoding: "utf8",
          env: { ...process.env, NODE_PATH: "" },
        },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("accepts both exact GitHub REST run.path variants for one immutable receipt", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const safeRunPaths = [WORKFLOW_PATH, `${WORKFLOW_PATH}@verdant-grow-diary`];

    for (const priorPath of safeRunPaths) {
      for (const currentPath of safeRunPaths) {
        expect(
          await verifier.verifyPreflightArtifactBundle({
            priorRun: priorRun({ path: priorPath }),
            currentRun: currentRun({ path: currentPath }),
            workflow: workflow(),
            artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
            archive,
            expected: expectedContext(archive),
          }),
        ).toEqual({ receiptDigest: STATE_DIGEST, artifactId: 444333222 });
      }
    }
  });

  it("rejects every non-founder run identity and any non-first run attempt", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const cases = [
      { priorRun: priorRun({ actor: { id: 1, login: FOUNDER_LOGIN } }) },
      { priorRun: priorRun({ actor: { login: FOUNDER_LOGIN } }) },
      { priorRun: priorRun({ triggering_actor: { id: FOUNDER_USER_ID, login: "other" } }) },
      { priorRun: priorRun({ triggering_actor: { login: FOUNDER_LOGIN } }) },
      { currentRun: currentRun({ actor: { id: 1, login: FOUNDER_LOGIN } }) },
      { currentRun: currentRun({ actor: { login: FOUNDER_LOGIN } }) },
      { currentRun: currentRun({ triggering_actor: { id: FOUNDER_USER_ID, login: "other" } }) },
      { currentRun: currentRun({ triggering_actor: { login: FOUNDER_LOGIN } }) },
      {
        priorRun: priorRun({ run_attempt: 2 }),
        artifacts: {
          total_count: 1,
          artifacts: [
            artifactFor(archive, {
              name: `${ARTIFACT_PREFIX}-run-${RUN_ID}-attempt-2`,
            }),
          ],
        },
      },
      { currentRun: currentRun({ run_attempt: 2 }) },
    ];

    for (const item of cases) {
      expect(() =>
        verifier.validatePreflightArtifactMetadata({
          priorRun: item.priorRun ?? priorRun(),
          currentRun: item.currentRun ?? currentRun(),
          workflow: workflow(),
          artifacts: item.artifacts ?? { total_count: 1, artifacts: [artifactFor(archive)] },
          expected: expectedContext(archive),
        }),
      ).toThrow(/preflight_artifact_rejected/);
    }
  });

  it("accepts only the inclusive authenticated 15-minute-to-24-hour review window", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifacts = { total_count: 1, artifacts: [artifactFor(archive)] };
    const accepted = ["2026-08-15T12:18:00.000Z", "2026-08-16T12:03:00.000Z"];
    const rejected = ["2026-08-15T12:17:59.999Z", "2026-08-16T12:03:00.001Z"];

    for (const createdAt of accepted) {
      expect(
        verifier.validatePreflightArtifactMetadata({
          priorRun: priorRun(),
          currentRun: currentRun({ created_at: createdAt }),
          workflow: workflow(),
          artifacts,
          expected: expectedContext(archive),
        }),
      ).toMatchObject({ artifactId: 444333222 });
    }
    for (const createdAt of rejected) {
      expect(() =>
        verifier.validatePreflightArtifactMetadata({
          priorRun: priorRun(),
          currentRun: currentRun({ created_at: createdAt }),
          workflow: workflow(),
          artifacts,
          expected: expectedContext(archive),
        }),
      ).toThrow(/preflight_artifact_rejected/);
    }
  });

  it("rejects an attempt or artifact digest other than the founder-pinned PREFLIGHT evidence", async () => {
    const verifier = await loadVerifier();
    const reviewedArchive = await archiveFor();
    const replacementArchive = await archiveFor(receipt({ state_digest: "c".repeat(64) }));
    const cases = [
      {
        archive: reviewedArchive,
        expected: { ...expectedContext(reviewedArchive), preflightRunAttempt: 2 },
      },
      {
        archive: reviewedArchive,
        expected: expectedContext(reviewedArchive),
        artifacts: {
          total_count: 1,
          artifacts: [artifactFor(reviewedArchive, { digest: `sha256:${"0".repeat(64)}` })],
        },
      },
      {
        archive: replacementArchive,
        expected: expectedContext(reviewedArchive),
      },
    ];

    for (const item of cases) {
      expect(() =>
        verifier.validatePreflightArtifactMetadata({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: item.artifacts ?? { total_count: 1, artifacts: [artifactFor(item.archive)] },
          expected: item.expected,
        }),
      ).toThrow(/preflight_artifact_rejected/);
    }
  });

  it("rejects wrong run, repo, workflow, branch, SHA, lifecycle, or chronology metadata", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifact = artifactFor(archive);
    const mutations = [
      { priorRun: priorRun({ id: CURRENT_RUN_ID }) },
      { priorRun: priorRun({ repository: { id: 1, full_name: REPOSITORY } }) },
      { priorRun: priorRun({ head_repository: { id: 1, full_name: REPOSITORY } }) },
      { priorRun: priorRun({ workflow_id: WORKFLOW_ID + 1 }) },
      { priorRun: priorRun({ path: `${WORKFLOW_PATH}@main` }) },
      { priorRun: priorRun({ path: `${WORKFLOW_PATH}@verdant-grow-diary-extra` }) },
      { priorRun: priorRun({ path: `${WORKFLOW_PATH}@refs/heads/verdant-grow-diary` }) },
      { priorRun: priorRun({ head_branch: "main" }) },
      { priorRun: priorRun({ head_sha: "c".repeat(40) }) },
      { priorRun: priorRun({ event: "push" }) },
      { priorRun: priorRun({ status: "in_progress" }) },
      { priorRun: priorRun({ conclusion: "failure" }) },
      { priorRun: priorRun({ run_attempt: 0 }) },
      { priorRun: priorRun({ created_at: "2026-08-15T12:06:00.000Z" }) },
      { priorRun: priorRun({ updated_at: "2026-08-15T12:06:00.000Z" }) },
      { currentRun: currentRun({ path: `${WORKFLOW_PATH}@main` }) },
      { currentRun: currentRun({ path: `${WORKFLOW_PATH}@verdant-grow-diary-extra` }) },
      { currentRun: currentRun({ path: `${WORKFLOW_PATH}@refs/heads/verdant-grow-diary` }) },
      { currentRun: currentRun({ event: "push" }) },
      { currentRun: currentRun({ head_branch: "main" }) },
      { currentRun: currentRun({ head_sha: "d".repeat(40) }) },
      { workflow: workflow({ id: WORKFLOW_ID + 1 }) },
      { workflow: workflow({ path: ".github/workflows/other.yml" }) },
      { workflow: workflow({ path: `${WORKFLOW_PATH}@verdant-grow-diary` }) },
      { workflow: workflow({ state: "disabled_manually" }) },
      { workflow: workflow({ updated_at: "2026-08-15T12:01:00.000Z" }) },
    ];

    for (const mutation of mutations) {
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: mutation.priorRun ?? priorRun(),
          currentRun: mutation.currentRun ?? currentRun(),
          workflow: mutation.workflow ?? workflow(),
          artifacts: { total_count: 1, artifacts: [artifact] },
          archive,
          expected: expectedContext(archive),
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });

  it("rejects duplicate, expired, oversized, misnamed, or cross-run artifact metadata", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const artifact = artifactFor(archive);
    const cases = [
      { total_count: 2, artifacts: [artifact, { ...artifact, id: artifact.id + 1 }] },
      { total_count: 1, artifacts: [{ ...artifact, expired: true }] },
      { total_count: 1, artifacts: [{ ...artifact, size_in_bytes: 65537 }] },
      { total_count: 1, artifacts: [{ ...artifact, name: "wrong" }] },
      {
        total_count: 1,
        artifacts: [{ ...artifact, workflow_run: { ...artifact.workflow_run, id: RUN_ID + 1 } }],
      },
      { total_count: 1, artifacts: [{ ...artifact, created_at: "2026-08-15T11:59:00.000Z" }] },
      { total_count: 1, artifacts: [{ ...artifact, updated_at: "2026-08-15T12:04:00.000Z" }] },
      { total_count: 1, artifacts: [{ ...artifact, expires_at: "2026-08-15T12:05:00.000Z" }] },
    ];

    for (const artifacts of cases) {
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts,
          archive,
          expected: expectedContext(archive),
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });

  it("rejects archive hash drift, extra members, wrong paths, links, and oversized receipt data", async () => {
    const verifier = await loadVerifier();
    const goodArchive = await archiveFor();
    const archives = [
      {
        archive: Buffer.from(goodArchive),
        artifact: artifactFor(goodArchive, { digest: `sha256:${"0".repeat(64)}` }),
      },
      {
        archive: await archiveFor(receipt(), (zip) => zip.file("extra.txt", "no")),
        artifact: null,
      },
      {
        archive: await archiveFor(receipt(), (zip) =>
          zip.file("link", "target", { unixPermissions: 0o120777 }),
        ),
        artifact: null,
      },
      {
        archive: await archiveFor({ ...receipt(), padding: "x".repeat(65_536) }),
        artifact: null,
      },
    ];

    for (const item of archives) {
      const artifact = item.artifact ?? artifactFor(item.archive);
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: { total_count: 1, artifacts: [artifact] },
          archive: item.archive,
          expected: expectedContext(item.archive),
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });

  it("rejects a zip bomb before decompressing an oversized declared receipt", async () => {
    const verifier = await loadVerifier();
    const archive = claimOversizedUncompressedReceipt(await archiveFor());

    await expect(
      verifier.verifyPreflightArtifactBundle({
        priorRun: priorRun(),
        currentRun: currentRun(),
        workflow: workflow(),
        artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
        archive,
        expected: expectedContext(archive),
      }),
    ).rejects.toThrow(/preflight_artifact_rejected/);
  });

  it("strictly rejects altered or extended receipt JSON", async () => {
    const verifier = await loadVerifier();
    for (const changed of [
      receipt({ operation: "APPLY" }),
      receipt({ outcome: "already_applied_verified" }),
      receipt({ safe_to_apply: false }),
      receipt({ head_sha: "d".repeat(40) }),
      receipt({ state_digest: "not-a-digest" }),
      receipt({ unexpected: "field" }),
    ]) {
      const archive = await archiveFor(changed);
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
          archive,
          expected: expectedContext(archive),
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });

  it("strictly rejects missing, altered, mistyped, or extra solo-founder receipt authorization", async () => {
    const verifier = await loadVerifier();
    const { environment_approval_verified: _environmentApprovalVerified, ...missingAuthorization } =
      receipt();
    const cases = [
      missingAuthorization,
      receipt({ founder_github_login: "other" }),
      receipt({ minimum_review_seconds: "900" }),
      receipt({ authorization_scope: "replacement" }),
    ];

    for (const changed of cases) {
      const archive = await archiveFor(changed);
      await expect(
        verifier.verifyPreflightArtifactBundle({
          priorRun: priorRun(),
          currentRun: currentRun(),
          workflow: workflow(),
          artifacts: { total_count: 1, artifacts: [artifactFor(archive)] },
          archive,
          expected: expectedContext(archive),
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });

  it("uses authorization only for the API 302 and fetches the signed HTTPS URL without credentials or redirects", async () => {
    const verifier = await loadVerifier();
    const archive = await archiveFor();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://artifact.example.invalid/signed.zip?sig=secret" },
        });
      }
      return new Response(new Uint8Array(archive), {
        status: 200,
        headers: { "content-length": String(archive.length) },
      });
    };

    const downloaded = await verifier.downloadArtifactArchive({
      repository: REPOSITORY,
      artifactId: 444333222,
      token: "github-token-secret",
      fetchImpl,
    });

    expect(Buffer.from(downloaded)).toEqual(archive);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/444333222/zip`,
    );
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe(
      "Bearer github-token-secret",
    );
    expect(calls[0].init.redirect).toBe("manual");
    expect(new Headers(calls[1].init.headers).get("authorization")).toBeNull();
    expect(calls[1].init.redirect).toBe("manual");
  });

  it("rejects non-HTTPS or credential-bearing redirects and enforces header and streamed byte caps", async () => {
    const verifier = await loadVerifier();
    const oversized = Buffer.alloc(65_537, 1);
    const cases: Array<(input: string | URL | Request, init?: RequestInit) => Promise<Response>> = [
      async () =>
        new Response(null, { status: 302, headers: { location: "http://artifact.invalid/a.zip" } }),
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://user:pass@artifact.invalid/a.zip" },
        }),
      async (_input, init) =>
        new Headers(init?.headers).has("authorization")
          ? new Response(null, {
              status: 302,
              headers: { location: "https://artifact.invalid/a.zip" },
            })
          : new Response(new Uint8Array(Buffer.from("x")), {
              status: 200,
              headers: { "content-length": "65537" },
            }),
      async (_input, init) =>
        new Headers(init?.headers).has("authorization")
          ? new Response(null, {
              status: 302,
              headers: { location: "https://artifact.invalid/a.zip" },
            })
          : new Response(new Uint8Array(oversized), { status: 200 }),
    ];

    for (const fetchImpl of cases) {
      await expect(
        verifier.downloadArtifactArchive({
          repository: REPOSITORY,
          artifactId: 444333222,
          token: "github-token-secret",
          fetchImpl,
        }),
      ).rejects.toThrow(/preflight_artifact_rejected/);
    }
  });
});
