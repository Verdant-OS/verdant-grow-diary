#!/usr/bin/env node
/**
 * Guard: refuse to deploy if any money-critical credit-spend / referral
 * migration FILE is missing from supabase/migrations/.
 *
 * This is a filename allowlist. It does not parse SQL, does not diff
 * against the DB, and does not verify content — it only asserts presence
 * on disk. For the runtime "is it actually applied in the target DB?"
 * check, see scripts/assert-required-money-migrations-applied.mjs.
 *
 * Exit codes: 0 = all present, 1 = one or more missing.
 */
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_MONEY_MIGRATIONS } from "./required-money-migrations.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const missing = REQUIRED_MONEY_MIGRATIONS.filter(
  (f) => !existsSync(join(MIGRATIONS_DIR, f)),
);

if (missing.length > 0) {
  console.error("✗ Missing money-critical migration files:");
  for (const f of missing) console.error(`    supabase/migrations/${f}`);
  console.error(
    "\nDo NOT deploy. Restore the file(s) from git history, or if a rename is\n" +
      "intentional, update scripts/required-money-migrations.mjs in the same PR\n" +
      "with a rollback note.",
  );
  process.exit(1);
}

console.log(
  `✓ All ${REQUIRED_MONEY_MIGRATIONS.length} money-critical migration files present.`,
);
