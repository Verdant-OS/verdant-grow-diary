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
  const path = raw.replaceAll("\\", "/");
  if (path.startsWith("/") || /^[A-Za-z]:(?:\/|$)/.test(path)) return null;
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
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
  "src/pages/resetpassword.tsx",
  "src/lib/pendingoutcomereviewrules.ts",
];
const LOCKED_PREFIXES = [".github/", ".claude/", ".grok/", ".git/", "scripts/", "src/test/setup"];

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
  if (/^(?:\.github|\.claude|\.grok|\.git)(?:\/|$)/i.test(path)) return true;
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

// Compare-API entries. A symlink or submodule is rejected, not read as text.
// A missing or unknown mode is fail-closed only when a mode is actually present;
// GitHub's compare payload often omits mode on ordinary files.
function compareNonBlobReason(file) {
  if (!file || typeof file !== "object") return "unparsable";
  const labels = [file.type, file.object_type]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());
  if (labels.some((label) => label === "symlink" || label === "submodule" || label === "commit")) {
    return "symlink-or-submodule";
  }
  const modes = [file.mode, file.new_mode, file.old_mode].filter(
    (value) => value !== undefined && value !== null && value !== "",
  );
  for (const mode of modes) {
    const text = String(mode);
    if (text === "120000" || text === "160000") return "symlink-or-submodule";
    if (text !== "100644" && text !== "100755") return "unknown-mode";
  }
  return null;
}
// path-guard-source:end

module.exports = {
  normalizeRepoPath,
  lockedPath,
  compareNonBlobReason,
  LOCKED_EXACT_PATHS,
  LOCKED_PREFIXES,
  CONTENT_ROOTS,
};
