#!/usr/bin/env node
/**
 * verify-supabase-migrations-complete.mjs
 *
 * CI guard. Fails if the current branch is missing any Supabase migration
 * file present on the integration branch. Read-only — never modifies the
 * working tree.
 *
 * Default integration branch: `dev`.
 * Override via env `SUPABASE_MIGRATIONS_INTEGRATION_BRANCH` or `--branch <name>`.
 *
 * Exit codes:
 *   0  -> local migrations are a superset of integration migrations.
 *   1  -> missing migrations detected. Prints remediation guidance.
 *   2  -> internal / git error.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function tryFetch(branch) {
  try {
    git(["fetch", "origin", branch, "--quiet"]);
  } catch (err) {
    console.warn(
      `[supabase:migrations:verify-remote] warning: fetch failed (${err.message?.trim() ?? err}). Using local ref if available.`,
    );
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
  return null;
}

function listRemoteMigrations(ref) {
  const out = git(["ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_DIR]);
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

function main() {
  const branch = parseBranch();
  console.log(`[supabase:migrations:verify-remote] integration branch: ${branch}`);

  tryFetch(branch);
  const ref = resolveRef(branch);
  if (!ref) {
    console.warn(
      `[supabase:migrations:verify-remote] integration ref not available (origin/${branch} and ${branch} both missing). Skipping check.`,
    );
    process.exit(0);
  }

  let remote;
  try {
    remote = listRemoteMigrations(ref);
  } catch (err) {
    console.error(`[supabase:migrations:verify-remote] git error: ${err.message ?? err}`);
    process.exit(2);
  }

  const local = listLocalMigrations();
  const missing = remote.filter((p) => !local.has(p));

  if (missing.length === 0) {
    console.log(
      `[supabase:migrations:verify-remote] OK — local has all ${remote.length} migrations from ${ref}.`,
    );
    process.exit(0);
  }

  console.error(
    `[supabase:migrations:verify-remote] FAIL — ${missing.length} migration file(s) present on ${ref} are missing locally:`,
  );
  for (const path of missing) console.error(`  - ${path}`);
  console.error("");
  console.error("Remediation:");
  console.error(`  bun run supabase:migrations:sync --branch ${branch}`);
  console.error(`  git add ${MIGRATIONS_DIR}`);
  console.error(`  git commit -m "chore(supabase): sync migrations from ${branch}"`);
  console.error("");
  console.error("See docs/contributing-supabase-migrations.md for details.");
  process.exit(1);
}

main();
