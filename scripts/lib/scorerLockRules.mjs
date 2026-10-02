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
//              file with a reason. The unlock file is git-ignored and never ships.

export const UNLOCK_FILE = ".claude/scorer-unlock.json";

export const DOC_PATH = "docs/agents/loop-engineering.md";

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
    kind: "regex",
    value: /^src\/.*\.(test|spec)\.(ts|tsx)$/,
    why: "co-located Vitest files outside src/test/",
  }),
  Object.freeze({
    kind: "regex",
    value: /^scripts\/(check|verify|assert)-[^/]+\.(mjs|cjs|js|ts)$/,
    why: "repository gate scripts that CI and pre-commit run as judges",
  }),
  Object.freeze({
    kind: "exact",
    value: "config/required-status-checks.json",
    why: "the pinned mirror of the ruleset's required checks",
  }),
]);

/** Normalises a repository-relative path: forward slashes, no leading `./`. */
export function normalizeRelPath(relPath) {
  if (typeof relPath !== "string") return "";
  let out = relPath.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
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

/**
 * True when an unlock entry covers the path. An entry is an exact path, or a directory
 * written with a trailing slash. A bare prefix never matches, so unlocking
 * `src/test/a.test.ts` does not unlock `src/test/a.test.tsx`.
 */
export function isUnlocked(relPath, unlockedEntries) {
  const path = normalizeRelPath(relPath);
  if (!path || !Array.isArray(unlockedEntries)) return false;
  for (const entry of unlockedEntries) {
    const target = normalizeRelPath(entry && entry.path);
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
    "It is an existing check (test, spec, gate script or required-checks pin), and a loop",
    "must not make its own checks easier. If this task genuinely renegotiates the pin,",
    "declare it first:",
    `  node scripts/scorer-lock.mjs --unlock ${relPath} --reason "<why the check changes>"`,
    `then edit, and name the renegotiated pin in the commit. See ${DOC_PATH} §3.`,
  ].join("\n");
}

/**
 * The one decision the hook makes.
 *
 * @param {{ relPath: string, trackedAtHead: boolean, unlockedEntries?: Array<{path: string}> }} input
 * @returns {{ decision: "allow" | "deny", reason: string }}
 */
export function evaluateScorerEdit(input) {
  const relPath = normalizeRelPath(input && input.relPath);
  if (!relPath) return { decision: "allow", reason: "no repository path" };
  if (!isScorerPath(relPath)) return { decision: "allow", reason: "not a scorer path" };
  if (!input.trackedAtHead) return { decision: "allow", reason: "new check, not yet tracked" };
  if (isUnlocked(relPath, input.unlockedEntries)) {
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
