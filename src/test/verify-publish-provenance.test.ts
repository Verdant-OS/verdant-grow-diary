/**
 * Targeted unit coverage for scripts/verify-publish-provenance.mjs.
 * Imports resolved exports (no source-regex-only assertions).
 *
 * Fixture tokens are fake labels only — never real Paddle secrets.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPublishVerificationReport,
  classifyTokenClassByPrefix,
  collectStampBlockers,
  compareTokenClasses,
  decidePublishVerdict,
  formatPublishVerificationSummary,
  isOrphanStamp,
  parseGitPorcelainPaths,
  reportJsonLeaksTokenPayload,
  resolveCommittedTokenClass,
  resolveEffectiveTokenClass,
  runPublishVerification,
  sanitizeDirtyPathList,
} from "../../scripts/verify-publish-provenance.mjs";

const FIXTURE_TEST_TOKEN = "test_REDACTED_SANDBOX";
const FIXTURE_LIVE_TOKEN = "live_REDACTED_LIVE";

const CLEAN_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function cleanStamp(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.0.0+20260825.aaaaaaaaaaaa",
    commit: CLEAN_SHA,
    shortCommit: "aaaaaaaaaaaa",
    ref: "verdant-grow-diary",
    dirty: false,
    commitSource: "git",
    treeHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    treeHashShort: "bbbbbbbbbbbb",
    ...overrides,
  };
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("classifyTokenClassByPrefix", () => {
  it("reports test_ and live_ from prefix only", () => {
    expect(classifyTokenClassByPrefix(FIXTURE_TEST_TOKEN)).toBe("test_");
    expect(classifyTokenClassByPrefix(FIXTURE_LIVE_TOKEN)).toBe("live_");
  });

  it("reports missing for nullish or empty values", () => {
    expect(classifyTokenClassByPrefix(null)).toBe("missing");
    expect(classifyTokenClassByPrefix(undefined)).toBe("missing");
    expect(classifyTokenClassByPrefix("")).toBe("missing");
    expect(classifyTokenClassByPrefix("   ")).toBe("missing");
  });

  it("reports unavailable for prefix-only or unknown shapes", () => {
    expect(classifyTokenClassByPrefix("test_")).toBe("unavailable");
    expect(classifyTokenClassByPrefix("live_")).toBe("unavailable");
    expect(classifyTokenClassByPrefix("pk_not_paddle")).toBe("unavailable");
    expect(classifyTokenClassByPrefix(123 as unknown as string)).toBe("unavailable");
  });
});

describe("stamp blockers and orphan classification", () => {
  it("passes a clean stamp with a real ref and 40-char SHA", () => {
    const stamp = cleanStamp();
    expect(collectStampBlockers(stamp)).toEqual([]);
    expect(isOrphanStamp(stamp)).toBe(false);
    expect(decidePublishVerdict([])).toBe("PASS");
  });

  it("fails dirty stamps", () => {
    expect(collectStampBlockers(cleanStamp({ dirty: true }))).toEqual(["stamp_dirty"]);
    expect(decidePublishVerdict(["stamp_dirty"])).toBe("FAIL");
  });

  it("fails stamps whose dirty flag is missing or non-boolean (PASS requires dirty false)", () => {
    const omitted = cleanStamp();
    delete (omitted as { dirty?: boolean }).dirty;
    expect(collectStampBlockers(omitted)).toEqual(["stamp_dirty"]);
    expect(collectStampBlockers(cleanStamp({ dirty: "false" }))).toEqual(["stamp_dirty"]);
    const report = buildPublishVerificationReport({
      stamp: omitted,
      committedTokenClass: "test_",
      effectiveTokenClass: "test_",
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    expect(report.dirty).toBe(true);
    expect(report.verdict).toBe("FAIL");
    expect(report.blockers).toEqual(["stamp_dirty"]);
  });

  it("fails __orphan__ refs", () => {
    const stamp = cleanStamp({ ref: "__orphan__" });
    expect(collectStampBlockers(stamp)).toEqual(["stamp_orphan"]);
    expect(isOrphanStamp(stamp)).toBe(true);
  });

  it("fails unknown / missing commits and commitSource none", () => {
    expect(collectStampBlockers(cleanStamp({ commit: "unknown" }))).toEqual(["commit_unknown"]);
    expect(collectStampBlockers(cleanStamp({ commit: "" }))).toEqual(["commit_unknown"]);
    expect(collectStampBlockers(cleanStamp({ commit: "deadbeef" }))).toEqual(["commit_unknown"]);
    expect(collectStampBlockers(cleanStamp({ commitSource: "none", commit: "unknown" }))).toEqual([
      "commit_unknown",
    ]);
    expect(collectStampBlockers(cleanStamp({ commitSource: "none" }))).toEqual(["commit_unknown"]);
    expect(isOrphanStamp(cleanStamp({ commit: "unknown" }))).toBe(true);
    expect(isOrphanStamp(cleanStamp({ commitSource: "none" }))).toBe(true);
  });

  it("treats legacy stamps without commitSource as non-orphan when commit is a SHA", () => {
    const stamp = cleanStamp();
    delete (stamp as { commitSource?: string }).commitSource;
    expect(collectStampBlockers(stamp)).toEqual([]);
    expect(isOrphanStamp(stamp)).toBe(false);
    const report = buildPublishVerificationReport({
      stamp,
      committedTokenClass: "test_",
      effectiveTokenClass: "test_",
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    expect(report.commitSource).toBe("git");
    expect(report.verdict).toBe("PASS");
  });

  it("fails a missing stamp record", () => {
    expect(collectStampBlockers(null)).toEqual(["stamp_missing"]);
    expect(collectStampBlockers(undefined)).toEqual(["stamp_missing"]);
  });
});

describe("token class compare + report assembly", () => {
  it("reports tokenClassMismatch for committed test_ vs effective live_ without leaking bytes", () => {
    const compare = compareTokenClasses("test_", "live_");
    expect(compare).toEqual({
      committedTokenClass: "test_",
      effectiveTokenClass: "live_",
      tokenClassMismatch: true,
      mismatches: ["token_class_mismatch"],
    });

    const report = buildPublishVerificationReport({
      stamp: cleanStamp(),
      committedTokenClass: "test_",
      effectiveTokenClass: "live_",
      generatedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(report.verdict).toBe("PASS");
    expect(report.tokenClassMismatch).toBe(true);
    expect(report.mismatches).toEqual(["token_class_mismatch"]);
    expect(report.blockers).toEqual([]);
    expect(report.committedTokenClass).toBe("test_");
    expect(report.effectiveTokenClass).toBe("live_");
    expect(formatPublishVerificationSummary(report)).toBe(
      "[publish-verify] PASS token_class_mismatch",
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(FIXTURE_TEST_TOKEN);
    expect(serialized).not.toContain(FIXTURE_LIVE_TOKEN);
    expect(reportJsonLeaksTokenPayload(serialized)).toBe(false);
  });

  it("keeps matching classes without a mismatch code", () => {
    expect(compareTokenClasses("test_", "test_").tokenClassMismatch).toBe(false);
    expect(compareTokenClasses("live_", "live_").mismatches).toEqual([]);
  });

  it("preserves unavailable and missing classes in the report", () => {
    const report = buildPublishVerificationReport({
      stamp: cleanStamp(),
      committedTokenClass: "missing",
      effectiveTokenClass: "unavailable",
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    expect(report.committedTokenClass).toBe("missing");
    expect(report.effectiveTokenClass).toBe("unavailable");
    expect(report.tokenClassMismatch).toBe(true);
  });

  it("FAIL report for dirty stamp includes fixed blocker code only", () => {
    const report = buildPublishVerificationReport({
      stamp: cleanStamp({ dirty: true }),
      committedTokenClass: "test_",
      effectiveTokenClass: "test_",
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    expect(report.verdict).toBe("FAIL");
    expect(report.dirty).toBe(true);
    expect(report.blockers).toEqual(["stamp_dirty"]);
    expect(report.dirtyPaths).toEqual([]);
    expect(formatPublishVerificationSummary(report)).toBe("[publish-verify] FAIL stamp_dirty");
  });

  it("omits dirty path names from PASS reports even if supplied", () => {
    const report = buildPublishVerificationReport({
      stamp: cleanStamp(),
      committedTokenClass: "test_",
      effectiveTokenClass: "test_",
      generatedAt: "2026-08-25T00:00:00.000Z",
      dirtyPaths: [".env.production"],
    });
    expect(report.verdict).toBe("PASS");
    expect(report.dirtyPaths).toEqual([]);
  });

  it("records dirty path names without env dumps", () => {
    const report = buildPublishVerificationReport({
      stamp: cleanStamp({ dirty: true }),
      committedTokenClass: "test_",
      effectiveTokenClass: "test_",
      generatedAt: "2026-08-25T00:00:00.000Z",
      dirtyPaths: [".env.production", "scripts/verify-publish-provenance.mjs"],
    });
    expect(report.dirtyPaths).toEqual([".env.production", "scripts/verify-publish-provenance.mjs"]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("VITE_PAYMENTS_CLIENT_TOKEN=");
    expect(serialized).not.toContain(FIXTURE_TEST_TOKEN);
    expect(serialized).not.toContain(FIXTURE_LIVE_TOKEN);
    expect(reportJsonLeaksTokenPayload(serialized)).toBe(false);
  });

  it("flags token-shaped payloads and allows class labels", () => {
    expect(reportJsonLeaksTokenPayload(JSON.stringify({ token: FIXTURE_TEST_TOKEN }))).toBe(true);
    expect(reportJsonLeaksTokenPayload(JSON.stringify({ token: FIXTURE_LIVE_TOKEN }))).toBe(true);
    expect(
      reportJsonLeaksTokenPayload(
        JSON.stringify({ committedTokenClass: "test_", effectiveTokenClass: "live_" }),
      ),
    ).toBe(false);
  });

  it("serialized report never contains token-shaped payloads", () => {
    const report = buildPublishVerificationReport({
      stamp: cleanStamp({
        dirty: true,
        ref: "__orphan__",
        commit: "unknown",
        commitSource: "none",
      }),
      committedTokenClass: classifyTokenClassByPrefix(FIXTURE_TEST_TOKEN),
      effectiveTokenClass: classifyTokenClassByPrefix(FIXTURE_LIVE_TOKEN),
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    expect(reportJsonLeaksTokenPayload(serialized)).toBe(false);
    expect(serialized).not.toMatch(/(?:test_|live_)[A-Za-z0-9_-]+/);
    for (const key of [
      "commit",
      "shortCommit",
      "ref",
      "dirty",
      "orphan",
      "commitSource",
      "treeHash",
      "treeHashShort",
      "committedTokenClass",
      "effectiveTokenClass",
      "tokenClassMismatch",
      "verdict",
      "blockers",
      "mismatches",
      "generatedAt",
      "dirtyPaths",
    ]) {
      expect(report).toHaveProperty(key);
    }
    expect(report.dirtyPaths).toEqual([]);
  });
});

describe("parseGitPorcelainPaths", () => {
  it("extracts path names only from porcelain status", () => {
    expect(
      parseGitPorcelainPaths(" M .env.production\n?? vite.config.ts.timestamp-1.mjs\n"),
    ).toEqual([".env.production", "vite.config.ts.timestamp-1.mjs"]);
  });

  it("uses the rename destination and ignores empty input", () => {
    expect(parseGitPorcelainPaths('R  "old file" -> scripts/new-name.mjs')).toEqual([
      "scripts/new-name.mjs",
    ]);
    expect(parseGitPorcelainPaths("")).toEqual([]);
    expect(sanitizeDirtyPathList(["docs/a.md", "docs/a.md", "\n"])).toEqual(["docs/a.md"]);
  });
});

describe("runPublishVerification (injected I/O)", () => {
  it("writes artifacts/publish-verification.json and exits 0 on a clean stamp", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-"));
    temporaryRoots.push(root);
    const versionPath = resolve(root, "public/version.json");
    const reportPath = resolve(root, "artifacts/publish-verification.json");
    mkdirSync(resolve(root, "public"), { recursive: true });
    writeFileSync(versionPath, `${JSON.stringify(cleanStamp(), null, 2)}\n`, "utf8");

    const logs: string[] = [];
    const { exitCode, report } = await runPublishVerification({
      rootDir: root,
      versionPath,
      reportPath,
      resolveCommitted: async () => "test_",
      resolveEffective: async () => "test_",
      now: () => "2026-08-25T12:00:00.000Z",
      logger: {
        log: (line: string) => logs.push(line),
        error: (line: string) => logs.push(line),
      },
    });

    expect(exitCode).toBe(0);
    expect(report.verdict).toBe("PASS");
    expect(logs).toEqual(["[publish-verify] PASS"]);
    const written = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(written.verdict).toBe("PASS");
    expect(written.dirty).toBe(false);
    expect(written.orphan).toBe(false);
    expect(reportJsonLeaksTokenPayload(JSON.stringify(written))).toBe(false);
  });

  it("exits 1 for orphan stamp and still writes the report", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-"));
    temporaryRoots.push(root);
    const versionPath = resolve(root, "public/version.json");
    const reportPath = resolve(root, "artifacts/publish-verification.json");
    mkdirSync(resolve(root, "public"), { recursive: true });
    writeFileSync(
      versionPath,
      `${JSON.stringify(cleanStamp({ ref: "__orphan__", commit: "unknown", commitSource: "none" }), null, 2)}\n`,
      "utf8",
    );

    const { exitCode, report } = await runPublishVerification({
      rootDir: root,
      versionPath,
      reportPath,
      resolveCommitted: async () => "test_",
      resolveEffective: async () => "live_",
      now: () => "2026-08-25T12:00:00.000Z",
      logger: { log: () => undefined, error: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(report.verdict).toBe("FAIL");
    expect(report.blockers).toEqual(["stamp_orphan", "commit_unknown"]);
    expect(report.tokenClassMismatch).toBe(true);
    expect(report.mismatches).toEqual(["token_class_mismatch"]);
    const written = readFileSync(reportPath, "utf8");
    expect(written).not.toContain(FIXTURE_TEST_TOKEN);
    expect(written).not.toContain(FIXTURE_LIVE_TOKEN);
    expect(reportJsonLeaksTokenPayload(written)).toBe(false);
  });

  it("exits 1 for a dirty stamp without leaking token bytes", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-"));
    temporaryRoots.push(root);
    const versionPath = resolve(root, "public/version.json");
    const reportPath = resolve(root, "artifacts/publish-verification.json");
    mkdirSync(resolve(root, "public"), { recursive: true });
    writeFileSync(versionPath, `${JSON.stringify(cleanStamp({ dirty: true }), null, 2)}\n`, "utf8");

    const logs: string[] = [];
    const { exitCode, report } = await runPublishVerification({
      rootDir: root,
      versionPath,
      reportPath,
      resolveCommitted: async () => classifyTokenClassByPrefix(FIXTURE_TEST_TOKEN),
      resolveEffective: async () => classifyTokenClassByPrefix(FIXTURE_TEST_TOKEN),
      now: () => "2026-08-25T12:00:00.000Z",
      logger: {
        log: (line: string) => logs.push(line),
        error: (line: string) => logs.push(line),
      },
    });

    expect(exitCode).toBe(1);
    expect(report.verdict).toBe("FAIL");
    expect(report.blockers).toEqual(["stamp_dirty"]);
    expect(report.tokenClassMismatch).toBe(false);
    expect(logs).toEqual(["[publish-verify] FAIL stamp_dirty"]);
    expect(reportJsonLeaksTokenPayload(readFileSync(reportPath, "utf8"))).toBe(false);
  });
});

describe("package.json wiring", () => {
  it("registers publish:verify and runs the verifier after stamp-version", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["publish:verify"]).toBe(
      "node scripts/verify-publish-provenance.mjs",
    );
    const prebuild = String(packageJson.scripts.prebuild).split(/\s*&&\s*/u);
    expect(prebuild[0]).toBe("node scripts/restore-env-production-from-head.mjs");
    expect(prebuild.at(-2)).toBe("node scripts/stamp-version.mjs");
    expect(prebuild.at(-1)).toBe("node scripts/verify-publish-provenance.mjs");
  });

  it("restores a clean CI worktree immediately before the production stamp", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const restoreAt = workflow.indexOf("Restore clean worktree before production stamp");
    const buildAt = workflow.indexOf("\n      - name: Build\n");
    const uploadAt = workflow.indexOf("Upload publish verification report");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(restoreAt);
    expect(uploadAt).toBeGreaterThan(buildAt);
    expect(workflow.includes("git restore --source=HEAD --worktree --staged -- .")).toBe(true);
    expect(workflow.includes("path: artifacts/publish-verification.json")).toBe(true);
  });
});

describe("resolveCommittedTokenClass (HEAD blob, not working tree)", () => {
  it("reports the committed class when the working tree is mutated to the other class", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-git-"));
    temporaryRoots.push(root);

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.com",
      GIT_COMMITTER_NAME: "fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.com",
    };
    const git = (args: string[]) =>
      spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: gitEnv });

    expect(git(["init"]).status).toBe(0);
    git(["config", "user.email", "fixture@example.com"]);
    git(["config", "user.name", "fixture"]);
    writeFileSync(
      join(root, ".env.production"),
      `VITE_PAYMENTS_CLIENT_TOKEN=${FIXTURE_TEST_TOKEN}\n`,
    );
    expect(git(["add", ".env.production"]).status).toBe(0);
    expect(git(["commit", "-m", "fixture env"]).status).toBe(0);

    writeFileSync(
      join(root, ".env.production"),
      `VITE_PAYMENTS_CLIENT_TOKEN=${FIXTURE_LIVE_TOKEN}\n`,
    );

    const committed = await resolveCommittedTokenClass(root);
    expect(committed).toBe("test_");
    expect(committed).not.toBe(FIXTURE_TEST_TOKEN);
    expect(committed).not.toBe(FIXTURE_LIVE_TOKEN);
  });
});

describe("resolveEffectiveTokenClass (Vite production env, class only)", () => {
  const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";

  it("classifies the effective production token by prefix without returning bytes", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-effective-"));
    temporaryRoots.push(root);
    writeFileSync(join(root, ".env.production"), `${TOKEN_NAME}=${FIXTURE_LIVE_TOKEN}\n`);

    const hadToken = Object.hasOwn(process.env, TOKEN_NAME);
    const previous = process.env[TOKEN_NAME];
    delete process.env[TOKEN_NAME];
    try {
      const effective = await resolveEffectiveTokenClass(root);
      expect(effective).toBe("live_");
      expect(effective).not.toBe(FIXTURE_LIVE_TOKEN);
      expect(effective).not.toBe(FIXTURE_TEST_TOKEN);
    } finally {
      if (hadToken) process.env[TOKEN_NAME] = previous;
      else delete process.env[TOKEN_NAME];
    }
  });

  it("reports missing when production env has no client token", async () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-publish-verify-effective-missing-"));
    temporaryRoots.push(root);
    writeFileSync(join(root, ".env.production"), "VITE_APP_NAME=fixture\n");

    const hadToken = Object.hasOwn(process.env, TOKEN_NAME);
    const previous = process.env[TOKEN_NAME];
    delete process.env[TOKEN_NAME];
    try {
      expect(await resolveEffectiveTokenClass(root)).toBe("missing");
    } finally {
      if (hadToken) process.env[TOKEN_NAME] = previous;
      else delete process.env[TOKEN_NAME];
    }
  });
});
