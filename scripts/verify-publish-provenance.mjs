#!/usr/bin/env node
/**
 * verify-publish-provenance.mjs
 *
 * Publish-time preflight that runs AFTER scripts/stamp-version.mjs.
 * stamp-version must stay fail-open for provenance (degrade, don't die).
 * This script is the separate fail-closed gate:
 *
 *   FAIL when stamped dirty, ref is __orphan__, or commit is unknown/none.
 *   Token CLASS mismatch is reported only (never a new build blocker here —
 *   assert-paddle-production-sandbox.mjs owns production token acceptance).
 *
 * Report schema vocabulary (tokenClass):
 *   "test_" | "live_" | "unavailable" | "missing"
 * Prefix-only classification — token payload bytes never enter the report,
 * logs, error strings, or summary line.
 *
 * Writes: artifacts/publish-verification.json
 * npm:    bun run publish:verify
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveCanonicalPaddleProductionToken } from "./e2e/managed-session-materialize-core.mjs";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const MAX_ENV_BYTES = 64 * 1024;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/;

/** Canonical token-class labels for the downloadable report. */
export const PUBLISH_TOKEN_CLASSES = Object.freeze(["test_", "live_", "unavailable", "missing"]);

/** Fixed blocker codes that force verdict FAIL / exit 1. */
export const PUBLISH_BLOCKER_CODES = Object.freeze([
  "stamp_dirty",
  "stamp_orphan",
  "commit_unknown",
  "stamp_missing",
]);

/** Fixed mismatch codes (reported; not automatic blockers in this gate). */
export const PUBLISH_MISMATCH_CODES = Object.freeze(["token_class_mismatch"]);

/**
 * Classify a Paddle client token by PREFIX ONLY.
 * Never returns or inspects bytes after the class prefix.
 *
 * @param {unknown} token
 * @returns {"test_" | "live_" | "unavailable" | "missing"}
 */
export function classifyTokenClassByPrefix(token) {
  if (token === null || token === undefined) return "missing";
  if (typeof token !== "string") return "unavailable";
  const trimmed = token.trim();
  if (trimmed.length === 0) return "missing";
  if (trimmed.startsWith("test_") && trimmed.length > "test_".length) return "test_";
  if (trimmed.startsWith("live_") && trimmed.length > "live_".length) return "live_";
  return "unavailable";
}

/**
 * True when the stamp has no usable git identity.
 * orphan := ref === "__orphan__" OR commit unknown/none OR commitSource === "none".
 *
 * @param {{ ref?: unknown, commit?: unknown, commitSource?: unknown }} stamp
 */
export function isOrphanStamp(stamp) {
  if (!stamp || typeof stamp !== "object") return true;
  if (stamp.ref === "__orphan__") return true;
  if (stamp.commitSource === "none") return true;
  if (typeof stamp.commit !== "string") return true;
  if (stamp.commit === "unknown" || stamp.commit === "") return true;
  if (!COMMIT_SHA_RE.test(stamp.commit)) return true;
  return false;
}

/**
 * Collect fixed blocker codes from a stamped version record.
 *
 * @param {Record<string, unknown> | null | undefined} stamp
 * @returns {string[]}
 */
export function collectStampBlockers(stamp) {
  if (!stamp || typeof stamp !== "object") {
    return ["stamp_missing"];
  }

  /** @type {string[]} */
  const blockers = [];
  if (stamp.dirty === true) blockers.push("stamp_dirty");
  if (stamp.ref === "__orphan__") blockers.push("stamp_orphan");
  if (
    stamp.commitSource === "none" ||
    typeof stamp.commit !== "string" ||
    stamp.commit === "unknown" ||
    stamp.commit === "" ||
    !COMMIT_SHA_RE.test(stamp.commit)
  ) {
    blockers.push("commit_unknown");
  }
  return blockers;
}

/**
 * Compare committed vs effective token classes (labels only).
 *
 * @param {string} committedTokenClass
 * @param {string} effectiveTokenClass
 */
export function compareTokenClasses(committedTokenClass, effectiveTokenClass) {
  const committed = PUBLISH_TOKEN_CLASSES.includes(committedTokenClass)
    ? committedTokenClass
    : "unavailable";
  const effective = PUBLISH_TOKEN_CLASSES.includes(effectiveTokenClass)
    ? effectiveTokenClass
    : "unavailable";
  const tokenClassMismatch = committed !== effective;
  return {
    committedTokenClass: committed,
    effectiveTokenClass: effective,
    tokenClassMismatch,
    mismatches: tokenClassMismatch ? ["token_class_mismatch"] : [],
  };
}

/**
 * Decide PASS/FAIL from blocker list.
 * PASS only when there are no stamp blockers (clean, non-orphan, known SHA).
 *
 * @param {string[]} blockers
 * @returns {"PASS" | "FAIL"}
 */
export function decidePublishVerdict(blockers) {
  return Array.isArray(blockers) && blockers.length === 0 ? "PASS" : "FAIL";
}

/**
 * Build the downloadable verification report. Token bytes must never appear.
 *
 * @param {{
 *   stamp: Record<string, unknown> | null | undefined,
 *   committedTokenClass: string,
 *   effectiveTokenClass: string,
 *   generatedAt?: string,
 * }} input
 */
export function buildPublishVerificationReport({
  stamp,
  committedTokenClass,
  effectiveTokenClass,
  generatedAt = new Date().toISOString(),
}) {
  const blockers = collectStampBlockers(stamp);
  const tokenCompare = compareTokenClasses(committedTokenClass, effectiveTokenClass);
  const verdict = decidePublishVerdict(blockers);
  const orphan = isOrphanStamp(stamp);

  const commit = stamp && typeof stamp.commit === "string" ? stamp.commit : "unknown";
  const shortCommit =
    stamp && typeof stamp.shortCommit === "string"
      ? stamp.shortCommit
      : commit !== "unknown" && COMMIT_SHA_RE.test(commit)
        ? commit.slice(0, 12)
        : "unknown";
  const ref = stamp && typeof stamp.ref === "string" ? stamp.ref : "unknown";
  const dirty = stamp && typeof stamp.dirty === "boolean" ? stamp.dirty : true;
  // Prefer the stamped field. Legacy public/version.json may omit it; do not
  // invent commitSource:"none" when a 40-char commit is already present.
  const commitSource =
    stamp && typeof stamp.commitSource === "string"
      ? stamp.commitSource
      : stamp && typeof stamp.commit === "string" && COMMIT_SHA_RE.test(stamp.commit)
        ? "git"
        : "none";
  const treeHash =
    stamp && (typeof stamp.treeHash === "string" || stamp.treeHash === null)
      ? stamp.treeHash
      : null;
  const treeHashShort =
    stamp && (typeof stamp.treeHashShort === "string" || stamp.treeHashShort === null)
      ? stamp.treeHashShort
      : null;

  return {
    schema: "verdant.publish-verification.v1",
    tokenClassVocabulary: [...PUBLISH_TOKEN_CLASSES],
    commit,
    shortCommit,
    ref,
    dirty,
    orphan,
    commitSource,
    treeHash,
    treeHashShort,
    committedTokenClass: tokenCompare.committedTokenClass,
    effectiveTokenClass: tokenCompare.effectiveTokenClass,
    tokenClassMismatch: tokenCompare.tokenClassMismatch,
    verdict,
    blockers,
    mismatches: tokenCompare.mismatches,
    generatedAt,
  };
}

/**
 * One-line operator summary using FIXED codes only (no token bytes).
 *
 * @param {ReturnType<typeof buildPublishVerificationReport>} report
 */
export function formatPublishVerificationSummary(report) {
  const codes = [...report.blockers, ...report.mismatches];
  if (report.verdict === "PASS" && codes.length === 0) {
    return "[publish-verify] PASS";
  }
  if (report.verdict === "PASS") {
    return `[publish-verify] PASS ${codes.join(",")}`;
  }
  return `[publish-verify] FAIL ${codes.join(",") || "unknown"}`;
}

/**
 * Scan a serialized report for token-shaped values. Used by tests and as a
 * last-line defense before writing the artifact.
 *
 * @param {string} serialized
 * @returns {boolean} true when a token-shaped payload appears
 */
export function reportJsonLeaksTokenPayload(serialized) {
  if (typeof serialized !== "string") return true;
  // Class labels alone ("test_" / "live_") are allowed; anything with a
  // non-empty payload after the prefix is a leak.
  return /(?:test_|live_)[A-Za-z0-9_-]+/.test(serialized);
}

function readStampFile(versionPath) {
  try {
    const raw = readFileSync(versionPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read the last-committed (HEAD) .env.production text via git.
 * Working-tree mutations from the publisher must not redefine "committed".
 */
function readCommittedProductionEnvText(rootDir) {
  try {
    const text = execSync("git show HEAD:.env.production", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: MAX_ENV_BYTES,
    });
    if (typeof text !== "string") {
      return { ok: false, reason: "committed_env_unavailable" };
    }
    if (Buffer.byteLength(text, "utf8") > MAX_ENV_BYTES) {
      return { ok: false, reason: "committed_env_too_large" };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "committed_env_unavailable" };
  }
}

function tokenClassFromEnvText(envText) {
  const resolved = resolveCanonicalPaddleProductionToken(envText);
  if (!resolved.ok) {
    if (
      resolved.reason === "canonical_paddle_env_invalid" ||
      resolved.reason === "canonical_paddle_token_count_invalid"
    ) {
      // Missing assignment vs malformed — count zero assignments as missing.
      if (resolved.reason === "canonical_paddle_token_count_invalid") {
        const lines = String(envText)
          .split(/\r?\n/u)
          .filter((line) => /^VITE_PAYMENTS_CLIENT_TOKEN\s*=/u.test(line));
        if (lines.length === 0) return "missing";
      }
      return "unavailable";
    }
    return "unavailable";
  }
  // Classify from the resolved token, then drop the local immediately.
  const tokenClass = classifyTokenClassByPrefix(resolved.token);
  return tokenClass;
}

/**
 * Resolve committed token CLASS from HEAD:.env.production (prefix only).
 * @param {string} rootDir
 * @returns {Promise<"test_" | "live_" | "unavailable" | "missing">}
 */
export async function resolveCommittedTokenClass(rootDir = process.cwd()) {
  const raw = readCommittedProductionEnvText(rootDir);
  if (!raw.ok) return "missing";
  return tokenClassFromEnvText(raw.text);
}

async function loadEffectiveProductionEnv(rootDir) {
  const hadDebug = Object.hasOwn(process.env, "DEBUG");
  const previousDebug = process.env.DEBUG;
  const previousStdoutWrite = process.stdout.write;
  const previousStderrWrite = process.stderr.write;
  const previousConsole = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const suppressConsoleOutput = () => undefined;
  const suppressStreamOutput = () => true;

  delete process.env.DEBUG;
  process.stdout.write = suppressStreamOutput;
  process.stderr.write = suppressStreamOutput;
  console.debug = suppressConsoleOutput;
  console.error = suppressConsoleOutput;
  console.info = suppressConsoleOutput;
  console.log = suppressConsoleOutput;
  console.warn = suppressConsoleOutput;

  try {
    const { loadEnv } = await import("vite");
    return { ok: true, env: loadEnv("production", rootDir, "VITE_PAYMENTS_") };
  } catch {
    return { ok: false, reason: "effective_paddle_env_resolution_failed" };
  } finally {
    process.stdout.write = previousStdoutWrite;
    process.stderr.write = previousStderrWrite;
    console.debug = previousConsole.debug;
    console.error = previousConsole.error;
    console.info = previousConsole.info;
    console.log = previousConsole.log;
    console.warn = previousConsole.warn;
    if (hadDebug) process.env.DEBUG = previousDebug;
    else delete process.env.DEBUG;
  }
}

/**
 * Resolve effective token CLASS from Vite production env resolution.
 * Token bytes stay in locals and are never returned.
 *
 * @param {string} rootDir
 * @returns {Promise<"test_" | "live_" | "unavailable" | "missing">}
 */
export async function resolveEffectiveTokenClass(rootDir = process.cwd()) {
  const effectiveEnv = await loadEffectiveProductionEnv(rootDir);
  if (!effectiveEnv.ok) return "unavailable";

  const raw = effectiveEnv.env[TOKEN_NAME];
  if (raw === undefined || raw === null) return "missing";
  if (typeof raw !== "string") return "unavailable";

  // Reuse the canonical production parser so we do not invent a second
  // dotenv/token parser. Class is taken from the resolved local only.
  const wrapped = resolveCanonicalPaddleProductionToken(`${TOKEN_NAME}=${JSON.stringify(raw)}`);
  if (!wrapped.ok) {
    // Still attempt prefix classification on the raw string for reporting
    // when the value is present but fails the production pattern.
    return classifyTokenClassByPrefix(raw);
  }
  return classifyTokenClassByPrefix(wrapped.token);
}

/**
 * Run verification, write the downloadable report, print one-line summary.
 *
 * @param {{
 *   rootDir?: string,
 *   versionPath?: string,
 *   reportPath?: string,
 *   readStamp?: (path: string) => Record<string, unknown> | null,
 *   resolveCommitted?: (root: string) => Promise<string>,
 *   resolveEffective?: (root: string) => Promise<string>,
 *   now?: () => string,
 *   logger?: { log: Function, error: Function },
 * }} [options]
 * @returns {Promise<{ exitCode: number, report: ReturnType<typeof buildPublishVerificationReport> }>}
 */
export async function runPublishVerification({
  rootDir = process.cwd(),
  versionPath = resolve(rootDir, "public/version.json"),
  reportPath = resolve(rootDir, "artifacts/publish-verification.json"),
  readStamp = readStampFile,
  resolveCommitted = resolveCommittedTokenClass,
  resolveEffective = resolveEffectiveTokenClass,
  now = () => new Date().toISOString(),
  logger = console,
} = {}) {
  const stamp = readStamp(versionPath);
  const committedTokenClass = await resolveCommitted(rootDir);
  const effectiveTokenClass = await resolveEffective(rootDir);

  const report = buildPublishVerificationReport({
    stamp,
    committedTokenClass,
    effectiveTokenClass,
    generatedAt: now(),
  });

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportJsonLeaksTokenPayload(serialized)) {
    // Refuse to write a leaking report; fail closed with fixed codes only.
    const safeFail = {
      ...report,
      verdict: "FAIL",
      blockers: [...new Set([...report.blockers, "stamp_missing"])],
    };
    const safeSerialized = `${JSON.stringify(safeFail, null, 2)}\n`;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, safeSerialized, "utf8");
    logger.error(formatPublishVerificationSummary(safeFail));
    return { exitCode: 1, report: safeFail };
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, serialized, "utf8");

  const summary = formatPublishVerificationSummary(report);
  if (report.verdict === "PASS") logger.log(summary);
  else logger.error(summary);

  return { exitCode: report.verdict === "PASS" ? 0 : 1, report };
}

async function main() {
  const { exitCode } = await runPublishVerification();
  process.exitCode = exitCode;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
