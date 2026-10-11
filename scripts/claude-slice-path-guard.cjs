"use strict";

// Path half of the Claude slice lock. The workflow embeds this same region in
// .github/workflows/claude-slices.yml (between path-guard-source markers). The
// privileged jobs run that embedded copy; they do not execute this file from a
// pull request head. src/test/claude-slice-path-guard.test.ts fails if the two drift.

const CONTENT_ROOT_DIRS = ["src", "scripts", "tests", "e2e", "e2e-local", "packages"];
const CONTENT_ROOTS = new RegExp(`^(?:${CONTENT_ROOT_DIRS.join("|")})/`, "i");

// path-guard-source:begin
function normalizeRepoPath(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("\0") || raw.includes("\n") || raw.includes("\r")) return null;
  let path;
  try {
    path = raw.normalize("NFKC").replaceAll("\\", "/");
  } catch {
    return null;
  }
  if (path.startsWith("/") || /^[A-Za-z]:(?:\/|$)/.test(path)) return null;
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    // Windows treats a trailing dot or space on a segment as absent.
    const stripped = segment.replace(/[. ]+$/u, "");
    if (stripped === "" || stripped === ".") continue;
    if (stripped === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(stripped);
  }
  if (parts.length === 0) return null;
  return parts.join("/");
}

// Full normalized paths, compared case-insensitively. Root HOLD prefixes from the
// locked-path rules, plus the two files a filename match lets through
// (Codex P1, deferred from #1774 to #1927).
const LOCKED_EXACT_PATHS = [
  "agents.md",
  "claude.md",
  "gemini.md",
  "docs/agents/ownership.md",
  "docs/agents/current_state.md",
  "config/claude-slice-lock-exceptions.json",
  "config/required-status-checks.json",
  "config/dependency-lockfile-transition.json",
  "src/pages/resetpassword.tsx",
  "src/lib/pendingoutcomereviewrules.ts",
];
const LOCKED_PREFIXES = [
  ".github/",
  ".claude/",
  ".grok/",
  ".git/",
  ".husky/",
  "scripts/",
  "src/test/setup",
];

function matchesLockedPrefix(folded, prefix) {
  const rule = prefix.toLowerCase();
  if (rule.endsWith("/")) {
    const directory = rule.slice(0, -1);
    return folded === directory || folded.startsWith(rule);
  }
  return folded === rule || folded.startsWith(rule);
}

function lockedPath(raw) {
  const path = normalizeRepoPath(raw);
  if (path == null) return true;
  const folded = path.toLowerCase();
  if (LOCKED_EXACT_PATHS.includes(folded)) return true;
  if (LOCKED_PREFIXES.some((prefix) => matchesLockedPrefix(folded, prefix))) return true;
  if (/^(?:\.github|\.claude|\.grok|\.git|\.husky)(?:\/|$)/i.test(path)) return true;
  if (/^(?:AGENTS|CLAUDE|GEMINI)\.md$/i.test(path)) return true;
  if (/^docs\/agents\/(?:OWNERSHIP|CURRENT_STATE)\.md$/i.test(path)) return true;
  if (/(?:^|\/)(?:supabase|migrations?|sql|rls|edge-functions?|functions)(?:\/|$)/i.test(path))
    return true;
  if (/\.sql$/i.test(path)) return true;
  if (
    /(?:\.lockb?$|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|Pipfile\.lock)$)/i.test(
      path,
    )
  )
    return true;
  if (/(?:^|\/)\.env(?:\.|$)/i.test(path)) return true;
  // Code CI executes with repository secrets: manifests (scripts), tool
  // configs and test setup. A draft could otherwise plant code there.
  if (/(?:^|\/)package\.json$/i.test(path)) return true;
  if (
    /(?:^|\/)(?:[tj]sconfig[^/]*\.json|\.npmrc|\.yarnrc(?:\.yml)?|bunfig\.toml|\.nvmrc|\.node-version)$/i.test(
      path,
    )
  )
    return true;
  if (/(?:^|\/)[^/]+\.config\.[^/]+$/i.test(path)) return true;
  if (/(?:^|\/)(?:vitest|vite|playwright)\.(?:setup|workspace)[^/]*$/i.test(path)) return true;
  if (/(?:^|\/)(?:setup-?tests?|test-?setup|global[-_.]?(?:setup|teardown))[^/]*$/i.test(path))
    return true;
  if (/^src\/test\/setup/i.test(path)) return true;
  // Prettier and legacy ESLint configs can load plugins. CI runs scripts/**
  // (ci.yml and other workflows) in jobs that hold write tokens or secrets.
  if (/(?:^|\/)(?:\.prettierrc|\.eslintrc)[^/]*$/i.test(path)) return true;
  if (/^scripts(?:\/|$)/i.test(path)) return true;
  if (/^config\/claude-slice-lock-exceptions\.json$/i.test(path)) return true;
  if (/^config\/(?:required-status-checks|dependency-lockfile-transition)\.json$/i.test(path))
    return true;
  // Same roots as the content rules, e2e-local/ included (Codex P1 at cbc0ab0f).
  const executable = CONTENT_ROOTS.test(path) && !/\.md$/i.test(path);
  return (
    executable &&
    (/auth|oauth|rls|action[-_]?(?:queue|detail|outcome|follow[-_]?up|response[-_]?memory|completion|status)|linked[-_]?actions?|assigned[-_]?tent[-_]?actions?|live[-_]?proof[-_]?action[-_]?status|recent[-_]?action[-_]?response|device[-_]?(?:control|command)|actuator/i.test(
      path,
    ) ||
      /(?:^|\/)(?:actions|edge)(?:[/._]|$)/i.test(path))
  );
}

// GitHub compare `files` entries have filename, status, and sha. They do not
// carry mode or type, so those fields on `file` are ignored. Modes come from
// the git tree of the side that contains the path (head for an add, merge-base
// for a delete, both for an edit or rename). 120000 is a symlink and 160000 is
// a submodule. A missing tree, a truncated listing, or an entry with no usable
// mode fails closed.
function indexTree(tree) {
  if (!tree || typeof tree !== "object" || tree.truncated === true) return null;
  const list = Array.isArray(tree) ? tree : tree.tree;
  if (!Array.isArray(list)) return null;
  const indexed = new Map();
  for (const entry of list) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.path !== "string" ||
      entry.path.length === 0
    ) {
      return null;
    }
    indexed.set(entry.path, entry);
  }
  return indexed;
}

function reasonForTreeEntry(entry) {
  if (!entry || typeof entry !== "object") return "mode-unknown";
  const label = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
  if (label === "symlink" || label === "submodule" || label === "commit")
    return "symlink-or-submodule";
  const mode = entry.mode == null || entry.mode === "" ? "" : String(entry.mode);
  if (mode === "120000" || mode === "160000") return "symlink-or-submodule";
  if (mode === "100644" || mode === "100755") return null;
  return "mode-unknown";
}

function treeSides(file) {
  if (
    !file ||
    typeof file !== "object" ||
    typeof file.filename !== "string" ||
    file.filename.length === 0
  ) {
    return null;
  }
  const name = file.filename;
  if (file.status === "added" || file.status === "copied") return [["head", name]];
  if (file.status === "removed") return [["base", name]];
  if (file.status === "modified" || file.status === "changed")
    return [
      ["base", name],
      ["head", name],
    ];
  if (file.status === "renamed") {
    if (typeof file.previous_filename !== "string" || file.previous_filename.length === 0)
      return null;
    return [
      ["base", file.previous_filename],
      ["head", name],
    ];
  }
  return null;
}

function compareNonBlobReason(file, trees) {
  if (!file || typeof file !== "object") return "unparsable";
  const sides = treeSides(file);
  const head = trees && indexTree(trees.head);
  const base = trees && indexTree(trees.base);
  if (!sides || !head || !base) return "mode-unknown";
  for (const [side, path] of sides) {
    const entry = (side === "head" ? head : base).get(path);
    if (!entry) return "mode-unknown";
    const reason = reasonForTreeEntry(entry);
    if (reason) return reason;
  }
  return null;
}

// Compare responses have no `truncated` field. 300 files is GitHub's cap, and
// commits ahead of the base with an empty file list is an omitted diff.
function assertCompareComplete(compare) {
  if (!compare || typeof compare !== "object") throw new Error("Compare response is unparsable");
  if (!Array.isArray(compare.files)) throw new Error("Compare file list is missing");
  if (compare.files.length >= 300) {
    throw new Error(
      `Compare file list has ${compare.files.length} files; GitHub stops at 300, so the diff is incomplete`,
    );
  }
  if (
    typeof compare.ahead_by !== "number" ||
    !Number.isInteger(compare.ahead_by) ||
    compare.ahead_by < 0
  ) {
    throw new Error("Compare response is missing ahead_by");
  }
  if (compare.ahead_by > 0 && compare.files.length === 0) {
    throw new Error("Compare reports commits ahead but lists no files");
  }
}

// `git diff --raw -z` records: ":oldmode newmode oldsha newsha STATUS\0path\0",
// and for a rename or copy a second path. 000000 is the absent side of an add
// or delete, not an unknown mode.
function diffModeReason(oldMode, newMode) {
  for (const mode of [oldMode, newMode]) {
    if (mode === "000000") continue;
    if (mode === "120000" || mode === "160000") return "symlink-or-submodule";
    if (mode !== "100644" && mode !== "100755") return "mode-unknown";
  }
  return null;
}

function recordModeReason(record) {
  if (
    !record ||
    (record.status !== "A" &&
      record.status !== "C" &&
      record.status !== "D" &&
      record.status !== "M" &&
      record.status !== "R" &&
      record.status !== "T")
  ) {
    return "mode-unknown";
  }
  return diffModeReason(record.oldMode, record.newMode);
}

function parseRawDiff(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "");
  const parts = text.split("\0");
  const records = [];
  let index = 0;
  while (index < parts.length) {
    const header = parts[index];
    index += 1;
    if (header === "") continue;
    const match = /^:([0-7]+) ([0-7]+) ([0-9a-f]+) ([0-9a-f]+) ([ACDMRTUX])([0-9]*)$/.exec(header);
    if (!match) throw new Error("Unparsable git diff --raw record");
    const oldMode = match[1];
    const newMode = match[2];
    const status = match[5];
    const path = parts[index];
    index += 1;
    if (typeof path !== "string" || path.length === 0)
      throw new Error("git diff --raw record is missing a path");
    if (status === "R" || status === "C") {
      const nextPath = parts[index];
      index += 1;
      if (typeof nextPath !== "string" || nextPath.length === 0) {
        throw new Error("git diff --raw rename is missing a path");
      }
      records.push({ oldMode, newMode, status, oldPath: path, path: nextPath });
      continue;
    }
    records.push({ oldMode, newMode, status, path });
  }
  return records;
}
// path-guard-source:end

module.exports = {
  normalizeRepoPath,
  lockedPath,
  compareNonBlobReason,
  assertCompareComplete,
  parseRawDiff,
  diffModeReason,
  recordModeReason,
  LOCKED_EXACT_PATHS,
  LOCKED_PREFIXES,
  CONTENT_ROOTS,
};
