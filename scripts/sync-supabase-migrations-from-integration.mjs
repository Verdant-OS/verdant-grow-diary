#!/usr/bin/env node
/**
 * sync-supabase-migrations-from-integration.mjs
 *
 * Copies any Supabase migration files that exist on the integration branch
 * but are missing from the current working tree. Never overwrites local
 * files. Exits 0 when nothing is missing.
 *
 * Default integration branch: `dev`.
 * Override via env `SUPABASE_MIGRATIONS_INTEGRATION_BRANCH` or `--branch <name>`.
 *
 * Safety:
 *   - Read-only against the integration branch (uses `git show`).
 *   - Only writes to `supabase/migrations/`.
 *   - Refuses to overwrite an existing local migration file.
 *   - No schema, RLS, or remote changes.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const DEFAULT_BRANCH = "dev";

function parseBranch() {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--branch");
  if (flagIdx !== -1 && argv[flagIdx + 1]) return argv[flagIdx + 1];
  const eqArg = argv.find((a) => a.startsWith("--branch="));
  if (eqArg) return eqArg.split("=", 2)[1];
  if (process.env.SUPABASE_MIGRATIONS_INTEGRATION_BRANCH) {
    return process.env.SUPABASE_MIGRATIONS_INTEGRATION_BRANCH;
  }
  return DEFAULT_BRANCH;
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

function tryFetch(branch) {
  try {
    git(["fetch", "origin", branch, "--quiet"], { stdio: ["ignore", "ignore", "pipe"] });
    return true;
  } catch (err) {
    console.warn(
      `[supabase:migrations:sync] warning: \`git fetch origin ${branch}\` failed; ` +
        `falling back to local ref. (${err.message?.trim() ?? err})`,
    );
    return false;
  }
}

function resolveRef(branch) {
  for (const ref of [`origin/${branch}`, branch]) {
    try {
      git(["rev-parse", "--verify", "--quiet", ref]);
      return ref;
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not resolve integration branch ref. Tried origin/${branch} and ${branch}.`,
  );
}

function listRemoteMigrations(ref) {
  let out = "";
  try {
    out = git(["ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_DIR]);
  } catch (err) {
    throw new Error(`Failed to list migrations on ${ref}: ${err.message?.trim() ?? err}`);
  }
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith(`${MIGRATIONS_DIR}/`) && l.endsWith(".sql"));
}

function listLocalMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return new Set();
  return new Set(
    readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => `${MIGRATIONS_DIR}/${f}`),
  );
}

function readFromRef(ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
}

function main() {
  const branch = parseBranch();
  console.log(`[supabase:migrations:sync] integration branch: ${branch}`);

  tryFetch(branch);
  const ref = resolveRef(branch);
  console.log(`[supabase:migrations:sync] resolved ref: ${ref}`);

  const remote = listRemoteMigrations(ref);
  const local = listLocalMigrations();

  const missing = remote.filter((p) => !local.has(p));

  if (missing.length === 0) {
    console.log(
      `[supabase:migrations:sync] OK — no missing migrations (local has all ${remote.length} files from ${ref}).`,
    );
    process.exit(0);
  }

  if (!existsSync(MIGRATIONS_DIR)) {
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  console.log(`[supabase:migrations:sync] copying ${missing.length} missing file(s):`);
  for (const path of missing) {
    const destAbs = resolve(path);
    if (existsSync(destAbs)) {
      // Defensive: never overwrite. Should be unreachable given the diff above.
      console.log(`  - skip (exists locally): ${path}`);
      continue;
    }
    const content = readFromRef(ref, path);
    // Ensure subdirectory exists (migrations are flat today; future-proof).
    const dir = join(MIGRATIONS_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(destAbs, content, { encoding: "utf8", flag: "wx" });
    console.log(`  + ${path}`);
  }

  console.log(
    `[supabase:migrations:sync] done. Review with \`git status ${MIGRATIONS_DIR}\` and commit.`,
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`[supabase:migrations:sync] ERROR: ${err.message ?? err}`);
  process.exit(1);
}
