#!/usr/bin/env node
// Scorer lock: the repository's "locked checks folder" (docs/agents/loop-engineering.md §3).
//
//   --hook                     PreToolUse hook. Reads the tool call JSON on stdin and exits 2
//                              with the refusal on stderr when the call would edit a tracked
//                              scorer that has not been unlocked. Exits 0 otherwise, and
//                              fails open (exit 0, note on stderr) when it cannot decide.
//   --unlock <path...> --reason "<why>"
//                              Declares that this task may edit the named checks. Writes
//                              .claude/scorer-unlock.json (git-ignored). A directory is
//                              unlocked by writing it with a trailing slash.
//   --lock                     Removes every unlock.
//   --status                   Prints the current unlocks.
//   --report [--base <ref>] [--strict]
//                              Lists every tracked scorer modified relative to <ref>
//                              (default HEAD) and whether it is unlocked. --strict exits 2
//                              when any modified scorer is still locked, for CI or a PR body.
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
  evaluateScorerEdit,
  hookFilePaths,
  isScorerPath,
  isUnlocked,
  normalizeRelPath,
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
  for (const filePath of paths) {
    const rel = toRelPath(root, filePath);
    if (!rel) continue;
    const verdict = evaluateScorerEdit({
      relPath: rel,
      trackedAtHead: trackedAtHead(root, rel),
      unlockedEntries: unlocked,
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
      out.reason = argv[i + 1] ?? "";
      i += 1;
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
  const existing = readUnlocks(root);
  const at = new Date().toISOString();
  for (const p of args.paths) {
    const rel = normalizeRelPath(p);
    if (!isScorerPath(rel)) {
      process.stderr.write(`${NOTE} ${rel} is not a scorer path; nothing to unlock.\n`);
      continue;
    }
    if (!existing.some((e) => normalizeRelPath(e.path) === rel)) {
      existing.push({ path: rel, reason, at });
    }
  }
  writeUnlocks(root, existing);
  process.stdout.write(
    `${NOTE} unlocked ${existing.length} path(s); recorded in ${UNLOCK_FILE}.\n`,
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
  for (const e of unlocked) process.stdout.write(`UNLOCKED ${e.path}  (${e.reason}; ${e.at})\n`);
  return 0;
}

function runReport(args) {
  const root = repoRoot(process.cwd());
  if (!root) return 1;
  let changed = "";
  try {
    changed = git(["diff", "--name-only", "--diff-filter=M", args.base, "--"], root);
  } catch {
    process.stderr.write(`${NOTE} git diff against ${args.base} failed.\n`);
    return 1;
  }
  const unlocked = readUnlocks(root);
  const rows = changed
    .split(/\r?\n/)
    .map((l) => normalizeRelPath(l.trim()))
    .filter((p) => p && isScorerPath(p))
    .map((p) => ({ path: p, unlocked: isUnlocked(p, unlocked) }));
  if (rows.length === 0) {
    process.stdout.write(`${NOTE} no tracked scorer modified relative to ${args.base}.\n`);
    return 0;
  }
  for (const r of rows) {
    process.stdout.write(`${r.unlocked ? "UNLOCKED" : "LOCKED  "} ${r.path}\n`);
  }
  const locked = rows.filter((r) => !r.unlocked).length;
  process.stdout.write(
    `${NOTE} ${rows.length} modified scorer(s), ${locked} still locked. Name each renegotiated pin in the PR body.\n`,
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
