/**
 * Targeted unit coverage for scripts/verify-publish-provenance.mjs.
 * Imports resolved exports (no source-regex-only assertions).
 *
 * Fixture tokens are fake labels only — never real Paddle secrets.
 */
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
  reportJsonLeaksTokenPayload,
  runPublishVerification,
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
    expect(formatPublishVerificationSummary(report)).toBe("[publish-verify] FAIL stamp_dirty");
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
    ]) {
      expect(report).toHaveProperty(key);
    }
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
});
