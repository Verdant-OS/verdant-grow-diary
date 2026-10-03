#!/usr/bin/env node
// Scorer lock: the repository's "locked checks folder" (docs/agents/loop-engineering.md §3).
//
//   --hook                     PreToolUse hook. Reads the tool call JSON on stdin and exits 2
//                              with the refusal on stderr when the call would edit a tracked
//                              scorer that has no valid unlock. Exits 0 otherwise, and
//                              fails open (exit 0, note on stderr) when it cannot decide.
//   --unlock <path...> --reason "<why>"
//                              Declares that this task may edit the named checks. Writes
//                              .claude/scorer-unlock.json (git-ignored). A directory is
//                              unlocked by writing it with a trailing slash. An unlock is
//                              bound to the current branch and expires after 24 hours;
//                              declaring it again refreshes the window.
//   --lock                     Removes every unlock.
//   --status                   Prints the current unlocks, expired ones marked.
//   --report [--base <ref>] [--strict]
//                              Lists every tracked scorer modified, deleted or renamed
//                              relative to <ref> (default HEAD) and whether it is unlocked.
//                              --strict exits 2 when any such scorer is still locked, for
//                              CI or a PR body.
//
// Pure rules live in scripts/lib/scorerLockRules.mjs; this file is the I/O shell.
// The lock is a tripwire against accidents, not a security boundary: an agent can run
// --unlock itself. Its value is that the unlock is an explicit, logged, reasoned act.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

import {
  UNLOCK_FILE,
  UNLOCK_TTL_MS,
  evaluateScorerEdit,
  hookFilePaths,
  isScorerPath,
  isUnlockEntryValid,
  isUnlocked,
  normalizeRelPath,
  scorerRowsFromNameStatus,
} from "./lib/scorerLockRules.mjs";

const NOTE = "scorer-lock:";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function repoRoot(cwd) {
  try {
    return git(["rev-parse", "--show-toplevel"], cwd).trim();
  } catch {
    return null;
  }
}

function currentBranch(root) {
  try {
    const name = git(["rev-parse", "--abbrev-ref", "HEAD"], root).trim();
    return name === "HEAD" ? git(["rev-parse", "HEAD"], root).trim() : name;
  } catch {
    return "";
  }
}

function decisionContext(root) {
  return { now: new Date().toISOString(), branch: currentBranch(root) };
}

function trackedAtHead(root, relPath) {
  try {
    git(["cat-file", "-e", `HEAD:${relPath}`], root);
    return true;
  } catch {
    return false;
  }
}

function readUnlocks(root) {
  const file = resolve(root, UNLOCK_FILE);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed.unlocked) ? parsed.unlocked : [];
  } catch {
    return [];
  }
}

function writeUnlocks(root, unlocked) {
  const file = resolve(root, UNLOCK_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ unlocked }, null, 2)}\n`);
}

function toRelPath(root, filePath) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  const rel = normalizeRelPath(relative(root, absolute));
  if (!rel || rel.startsWith("../") || rel === "..") return null;
  return rel;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runHook() {
  const raw = readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write(`${NOTE} hook input was not JSON; allowing the call.\n`);
    return 0;
  }
  const paths = hookFilePaths(input);
  if (paths.length === 0) return 0;
  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write(`${NOTE} not inside a git repository; allowing the call.\n`);
    return 0;
  }
  const unlocked = readUnlocks(root);
  const context = decisionContext(root);
  for (const filePath of paths) {
    const rel = toRelPath(root, filePath);
    if (!rel) continue;
    const verdict = evaluateScorerEdit({
      relPath: rel,
      trackedAtHead: trackedAtHead(root, rel),
      unlockedEntries: unlocked,
      now: context.now,
      branch: context.branch,
    });
    if (verdict.decision === "deny") {
      process.stderr.write(`${verdict.reason}\n`);
      return 2;
    }
  }
  return 0;
}

function parseArgs(argv) {
  const out = { mode: null, paths: [], reason: null, base: "HEAD", strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--hook", "--unlock", "--lock", "--status", "--report"].includes(arg)) {
      out.mode = arg;
    } else if (arg === "--reason") {
      // A flag token is not a reason: `--reason --strict` must be refused, not recorded.
      const next = argv[i + 1];
      if (typeof next === "string" && !next.startsWith("--")) {
        out.reason = next;
        i += 1;
      } else {
        out.reason = "";
      }
    } else if (arg === "--base") {
      out.base = argv[i + 1] ?? "HEAD";
      i += 1;
    } else if (arg === "--strict") {
      out.strict = true;
    } else if (!arg.startsWith("--")) {
      out.paths.push(arg);
    }
  }
  return out;
}

function runUnlock(args) {
  const root = repoRoot(process.cwd());
  if (!root) {
    process.stderr.write(`${NOTE} not inside a git repository.\n`);
    return 1;
  }
  if (args.paths.length === 0) {
    process.stderr.write(`${NOTE} --unlock needs at least one path.\n`);
    return 1;
  }
  const reason = (args.reason ?? "").trim();
  if (reason.length < 8) {
    process.stderr.write(`${NOTE} --unlock needs --reason "<why the check changes>" (8+ chars).\n`);
    return 1;
  }
  const context = decisionContext(root);
  const atMs = Date.parse(context.now);
  const at = context.now;
  const expiresAt = new Date(atMs + UNLOCK_TTL_MS).toISOString();
  // Drop entries that have already expired or belong to another branch; a stale
  // declaration from an earlier task is exactly what must not carry over.
  const kept = readUnlocks(root).filter((e) => isUnlockEntryValid(e, context));
  for (const p of args.paths) {
    const rel = normalizeRelPath(p);
    if (!isScorerPath(rel)) {
      process.stderr.write(`${NOTE} ${rel} is not a scorer path; nothing to unlock.\n`);
      continue;
    }
    const entry = { path: rel, reason, at, expires_at: expiresAt, branch: context.branch };
    const index = kept.findIndex((e) => normalizeRelPath(e.path) === rel);
    if (index === -1) kept.push(entry);
    else kept[index] = entry;
  }
  writeUnlocks(root, kept);
  process.stdout.write(
    `${NOTE} ${kept.length} unlock(s) in force on ${context.branch} until ${expiresAt}; recorded in ${UNLOCK_FILE}.\n`,
  );
  return 0;
}

function runLock() {
  const root = repoRoot(process.cwd());
  if (!root) return 1;
  const file = resolve(root, UNLOCK_FILE);
  if (existsSync(file)) unlinkSync(file);
  process.stdout.write(`${NOTE} every check is locked again.\n`);
  return 0;
}

function runStatus() {
  const root = repoRoot(process.cwd());
  if (!root) return 1;
  const unlocked = readUnlocks(root);
  if (unlocked.length === 0) {
    process.stdout.write(`${NOTE} no unlocks; every tracked check is locked.\n`);
    return 0;
  }
  const context = decisionContext(root);
  for (const e of unlocked) {
    const label = isUnlockEntryValid(e, context) ? "UNLOCKED" : "EXPIRED ";
    process.stdout.write(
      `${label} ${e.path}  (${e.reason}; declared ${e.at} on ${e.branch ?? "?"}; until ${e.expires_at ?? "never, so invalid"})\n`,
    );
  }
  return 0;
}

function runReport(args) {
  const root = repoRoot(process.cwd());
  if (!root) return 1;
  let changed = "";
  try {
    changed = git(["diff", "--name-status", "--diff-filter=MDR", args.base, "--"], root);
  } catch {
    process.stderr.write(`${NOTE} git diff against ${args.base} failed.\n`);
    return 1;
  }
  const unlocked = readUnlocks(root);
  const context = decisionContext(root);
  const rows = scorerRowsFromNameStatus(changed).map((row) => ({
    ...row,
    unlocked: isUnlocked(row.from ?? row.path, unlocked, context),
  }));
  if (rows.length === 0) {
    process.stdout.write(
      `${NOTE} no tracked scorer modified, deleted or renamed relative to ${args.base}.\n`,
    );
    return 0;
  }
  for (const r of rows) {
    const where = r.change === "renamed" ? `${r.from} -> ${r.path}` : r.path;
    process.stdout.write(
      `${r.unlocked ? "UNLOCKED" : "LOCKED  "} ${r.change.padEnd(8)} ${where}\n`,
    );
  }
  const locked = rows.filter((r) => !r.unlocked).length;
  process.stdout.write(
    `${NOTE} ${rows.length} changed scorer(s), ${locked} still locked. Name each renegotiated, removed or moved check in the PR body.\n`,
  );
  return args.strict && locked > 0 ? 2 : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.mode) {
    case "--hook":
      return runHook();
    case "--unlock":
      return runUnlock(args);
    case "--lock":
      return runLock();
    case "--status":
      return runStatus();
    case "--report":
      return runReport(args);
    default:
      process.stderr.write(
        "usage: scorer-lock.mjs --hook | --unlock <path...> --reason <why> | --lock | --status | --report [--base <ref>] [--strict]\n",
      );
      return 1;
  }
}

process.exit(main());
