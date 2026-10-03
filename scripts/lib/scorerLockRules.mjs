// Pure rules for the scorer lock (docs/agents/loop-engineering.md §3).
// No I/O, no clock, no randomness: every function here is a deterministic map from
// its arguments to a verdict, so `src/test/scorer-lock-rules.test.ts` can pin it.
//
// Vocabulary, borrowed from the Karpathy-loop workflow the mechanism comes from:
//   scorer   - a file whose job is to judge other code: a test, a Playwright spec, a
//              repository gate script, or the required-checks pin. The agent that builds
//              a feature must not be the agent that quietly makes its scorer easier.
//   locked   - a scorer that is already tracked at HEAD. Creating a new scorer is always
//              allowed (that is how checks get written before the code); editing one that
//              already exists needs a declared unlock.
//   unlocked - a path (or directory, written with a trailing slash) listed in the unlock
//              file with a reason, an expiry and the branch it was declared on. The unlock
//              file is git-ignored and never ships.

import { posix } from "node:path";

export const UNLOCK_FILE = ".claude/scorer-unlock.json";

export const DOC_PATH = "docs/agents/loop-engineering.md";

/**
 * How long a declared unlock stays valid. Agents can be cut off at any time
 * (AGENTS.md › Agent Handoff / Coverage), so an unlock that outlives its task would let
 * every later task in the checkout edit the scorer without its own declaration. One day
 * matches the handoff log's own claim window.
 */
export const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;

/** The shortest reason `--unlock` accepts, and the shortest one a consumed entry may carry. */
export const UNLOCK_MIN_REASON_LENGTH = 8;

/**
 * Which repository paths count as scorers. Order does not matter; the first matching
 * rule wins and every rule yields the same answer. Kept as frozen data so a test can
 * pin the table rather than re-deriving it from behaviour.
 */
export const SCORER_PATH_RULES = Object.freeze([
  Object.freeze({
    kind: "prefix",
    value: "src/test/",
    why: "centralised Vitest suite, helpers and setup",
  }),
  Object.freeze({
    kind: "prefix",
    value: "e2e/",
    why: "Playwright specs and their fixture-safety fences",
  }),
  Object.freeze({
    kind: "prefix",
    value: "e2e-local/",
    why: "native local-browser Playwright lanes and their fixtures",
  }),
  Object.freeze({
    kind: "regex",
    value: /(^|\/)[^/]+\.(test|spec)\.(ts|tsx|mts|cts|js|mjs|cjs)$/,
    why: "any test or spec file wherever it lives: co-located src/, supabase/ Deno tests, scripts/, spikes/, plugins/",
  }),
  Object.freeze({
    kind: "regex",
    value: /(^|\/)(test_[^/]+|[^/]+_test)\.py$/,
    why: "Python testbench suites (tools/ecowitt-testbench, tools/ggs-ble-testbench)",
  }),
  Object.freeze({
    kind: "regex",
    value: /(^|\/)[^/]+_test\.(ts|tsx|js|mjs|cjs)$/,
    why: "Deno underscore-named tests (supabase/functions/*/handler_e2e_test.ts and the mint/revoke bridge-token suites that sensor-ingest-webhook-edge-tests.yml runs)",
  }),
  Object.freeze({
    kind: "prefix",
    value: "supabase/tests/",
    why: "pgTAP and RLS harness SQL suites",
  }),
  Object.freeze({
    kind: "regex",
    value:
      /^scripts\/(?:[^/]+\/)*(?:(?:test|run)-[^/]+|(?:[^/]*-)?(?:check|checks|verify|assert|validate|audit|scan|precommit|preflight|harness|harnesses|gate|db-security)(?:-[^/]*)?)\.(mjs|cjs|js|ts)$/,
    why: "repository gate scripts that CI, pre-commit and package scripts run as judges, at any depth under scripts/: a judge verb as a hyphen-delimited token anywhere in the basename (static-client-secret-scan, sensor-safety-check, run-*-harness, run-*-db-security, *-launch-gate), or a test- / run- prefix. Every tracked scripts/**/run-* is a suite orchestrator or runtime harness that decides whether its suite fails the job (run-scanner-guardrails-ci, run-quicklog-rpc-rls-harnesses, run-irrigation-integrity-suite, run-lighthouse-ci, run-postbuild-seo, e2e/run-pheno-*); measured 2026-10-03. test- stays prefix-only because measure-test-estate and send-ecowitt-test-payload are not judges",
  }),
  Object.freeze({
    kind: "regex",
    value: /(^|\/)(vitest|playwright)(\.[^/]+)?\.(config|workspace)\.(ts|mts|cts|js|mjs|cjs)$/,
    why: "test-runner configs decide which checks execute (vitest include, Playwright testDir/testMatch/testIgnore/projects); six tracked on 2026-10-03, including the native-local Playwright lanes",
  }),
  // The active Vitest suite runners and their test-selection modules: they decide which
  // tests execute, how they are sharded, and what exit status CI sees. Measured from the
  // workflow and package.json invocations on 2026-10-03; reporters of their logs stay out.
  Object.freeze({
    kind: "prefix",
    value: "scripts/vitest-controlled/",
    why: "controlled Vitest runner: discovery, manifest, sharding, execution, aggregation (vitest-controlled-full-suite.yml and the test:vitest:* package scripts)",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/run-vitest-batches.mjs",
    why: "batched Vitest runner that supplies the exit status for vitest-full-suite-pr-gate.yml and vitest-batched-full-suite.yml",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/vitest-batch-utils.mjs",
    why: "discovery and batching utilities the batched runner selects tests with",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/run-vitest-shard4-isolated.mjs",
    why: "the isolated fourth-shard runner that selects and runs that shard's files",
  }),
  Object.freeze({
    kind: "exact",
    value: "config/required-status-checks.json",
    why: "the pinned mirror of the ruleset's required checks",
  }),
  // Invoked gates whose basename carries no judge verb, and the manifests a gate reads as
  // its pin. Measured from the workflow invocations on 2026-10-03; extend by measurement,
  // not by guess.
  Object.freeze({
    kind: "exact",
    value: "scripts/diff-money-migration-prefixes.mjs",
    why: "money-migration drift judge run by prefix-diff-sarif.yml and required-money-migrations.yml; exits non-zero on drift or unknown state",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/probe-migration-drift.mjs",
    why: "production migration drift probe run by migration-drift-probe.yml; exits non-zero on drift",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/annotate-edge-shared-drift.mjs",
    why: "edge-shared drift annotator run by edge-shared-sync.yml; its exit code mirrors the checker",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/required-money-migrations.mjs",
    why: "the manifest assert-required-money-migrations*.mjs judges against: the money-migration pin",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/required-core-migrations.mjs",
    why: "the manifest assert-required-core-migrations*.mjs judges against: the core-migration pin",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/scorer-lock.mjs",
    why: "the lock's own I/O shell: it decides whether the hook refuses at all",
  }),
  Object.freeze({
    kind: "exact",
    value: "scripts/lib/scorerLockRules.mjs",
    why: "the lock's own rule table: it decides which checks are protected",
  }),
  Object.freeze({
    kind: "exact",
    value: ".claude/settings.json",
    why: "the project hook wiring: removing the PreToolUse entry disables the lock",
  }),
]);

/**
 * Normalises a repository-relative path: forward slashes, `.` and `..` segments
 * resolved, no leading `./`. Canonical form matters because an unlock is matched by
 * string equality against the hook's canonical path: `src/test/../../` must not pass
 * the prefix check and then never match anything.
 */
export function normalizeRelPath(relPath) {
  if (typeof relPath !== "string") return "";
  let out = relPath.replace(/\\/g, "/").trim();
  if (!out) return "";
  const keepTrailingSlash = out.endsWith("/");
  out = posix.normalize(out);
  while (out.startsWith("./")) out = out.slice(2);
  if (!out || out === "." || out === "/" || out.startsWith("../") || out === "..") return "";
  if (keepTrailingSlash && !out.endsWith("/")) out = `${out}/`;
  return out;
}

/** True when the path is one of the files the loop may not weaken. */
export function isScorerPath(relPath) {
  const path = normalizeRelPath(relPath);
  if (!path) return false;
  for (const rule of SCORER_PATH_RULES) {
    if (rule.kind === "prefix" && path.startsWith(rule.value)) return true;
    if (rule.kind === "exact" && path === rule.value) return true;
    if (rule.kind === "regex" && rule.value.test(path)) return true;
  }
  return false;
}

function parseTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * True when an unlock entry is still in force for the given moment and branch.
 *
 * The consumer enforces the same contract `--unlock` writes, so a hand-made or stale record
 * cannot be weaker than a declared one: the entry must carry a path, a reason of at least
 * `UNLOCK_MIN_REASON_LENGTH` characters, a declaration time `at`, a non-empty `branch` equal
 * to the current one, and an `expires_at` later than `at` by at most `UNLOCK_TTL_MS`; and
 * `now` must still be before `expires_at`. Anything missing or out of bounds is not in force.
 *
 * @param {{ path?: string, reason?: string, at?: string, expires_at?: string, branch?: string }} entry
 * @param {{ now: string | number | Date, branch?: string }} context
 */
export function isUnlockEntryValid(entry, context) {
  if (!entry || typeof entry !== "object" || !context) return false;
  if (typeof entry.path !== "string" || !normalizeRelPath(entry.path)) return false;
  if (typeof entry.reason !== "string" || entry.reason.trim().length < UNLOCK_MIN_REASON_LENGTH) {
    return false;
  }
  if (typeof entry.branch !== "string" || entry.branch.length === 0) return false;
  if (typeof context.branch !== "string" || context.branch !== entry.branch) return false;
  const now = parseTime(context.now);
  const at = parseTime(entry.at);
  const expires = parseTime(entry.expires_at);
  if (now === null || at === null || expires === null) return false;
  if (expires <= at || expires - at > UNLOCK_TTL_MS) return false;
  if (now >= expires) return false;
  return true;
}

/**
 * True when a valid unlock entry covers the path. An entry is an exact path, or a
 * directory written with a trailing slash. A bare prefix never matches, so unlocking
 * `src/test/a.test.ts` does not unlock `src/test/a.test.tsx`.
 *
 * `context` carries the moment and branch the decision is made for; without it every
 * entry is treated as expired, so a caller cannot forget the clock and get a lenient answer.
 *
 * @param {string} relPath
 * @param {Array<{ path: string, expires_at?: string, branch?: string }> | undefined} unlockedEntries
 * @param {{ now: string | number | Date, branch?: string } | undefined} context
 */
export function isUnlocked(relPath, unlockedEntries, context) {
  const path = normalizeRelPath(relPath);
  if (!path || !Array.isArray(unlockedEntries)) return false;
  for (const entry of unlockedEntries) {
    if (!isUnlockEntryValid(entry, context)) continue;
    const target = normalizeRelPath(entry.path);
    if (!target) continue;
    if (target.endsWith("/")) {
      if (path.startsWith(target)) return true;
    } else if (path === target) {
      return true;
    }
  }
  return false;
}

function refusal(relPath) {
  return [
    `scorer-lock: refusing to edit \`${relPath}\`.`,
    "It is an existing check (test, spec, gate script, required-checks pin, or one of the",
    "lock's own control files), and a loop must not make its own checks easier. If this",
    "task genuinely renegotiates the pin,",
    "declare it first:",
    `  node scripts/scorer-lock.mjs --unlock ${relPath} --reason "<why the check changes>"`,
    `then edit, and name the renegotiated pin in the commit. See ${DOC_PATH} §3.`,
  ].join("\n");
}

/**
 * The one decision the hook makes.
 *
 * @param {{ relPath: string, trackedAtHead: boolean, unlockedEntries?: Array<{path: string}>, now?: string | number | Date, branch?: string }} input
 * @returns {{ decision: "allow" | "deny", reason: string }}
 */
export function evaluateScorerEdit(input) {
  const relPath = normalizeRelPath(input && input.relPath);
  if (!relPath) return { decision: "allow", reason: "no repository path" };
  if (!isScorerPath(relPath)) return { decision: "allow", reason: "not a scorer path" };
  if (!input.trackedAtHead) return { decision: "allow", reason: "new check, not yet tracked" };
  const context = { now: input.now, branch: input.branch };
  if (isUnlocked(relPath, input.unlockedEntries, context)) {
    return { decision: "allow", reason: "unlocked with a declared reason" };
  }
  return { decision: "deny", reason: refusal(relPath) };
}

/**
 * Extracts the file paths a PreToolUse hook input is about to write. Returns an empty
 * list for anything that is not a file-writing tool call, so the caller fails open.
 */
export function hookFilePaths(hookInput) {
  if (!hookInput || typeof hookInput !== "object") return [];
  const toolInput = hookInput.tool_input;
  if (!toolInput || typeof toolInput !== "object") return [];
  const paths = [];
  if (typeof toolInput.file_path === "string") paths.push(toolInput.file_path);
  if (typeof toolInput.notebook_path === "string") paths.push(toolInput.notebook_path);
  return paths;
}

/**
 * Parses `git diff --name-status` output into scorer rows. Modified (M), deleted (D) and
 * renamed (R) and type-changed (T, a check replaced by a symlink) entries all count: a
 * deleted, moved or retyped check is a weakened check. A rename
 * is a row only when the old path was a scorer, and the unlock is judged on that old
 * path, the one that existed at the base. A rename from a non-scorer into a scorer path
 * is a new check, which the policy always allows, so it is not a row.
 *
 * @param {string} nameStatus
 * @returns {Array<{ change: "modified" | "deleted" | "renamed" | "retyped", path: string, from?: string }>}
 */
export function scorerRowsFromNameStatus(nameStatus) {
  const rows = [];
  if (typeof nameStatus !== "string") return rows;
  for (const rawLine of nameStatus.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split("\t").map((p) => normalizeRelPath(p.trim()));
    const status = parts[0] ?? "";
    if (status.startsWith("M") && parts[1]) {
      if (isScorerPath(parts[1])) rows.push({ change: "modified", path: parts[1] });
    } else if (status.startsWith("D") && parts[1]) {
      if (isScorerPath(parts[1])) rows.push({ change: "deleted", path: parts[1] });
    } else if (status.startsWith("T") && parts[1]) {
      if (isScorerPath(parts[1])) rows.push({ change: "retyped", path: parts[1] });
    } else if (status.startsWith("R") && parts[1] && parts[2]) {
      if (isScorerPath(parts[1])) {
        rows.push({ change: "renamed", path: parts[2], from: parts[1] });
      }
    }
  }
  return rows;
}
