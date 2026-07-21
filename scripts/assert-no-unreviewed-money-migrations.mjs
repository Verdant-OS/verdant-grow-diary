#!/usr/bin/env node
/**
 * Guard: refuse to accept a change that ADDS or RENAMES a money-adjacent
 * migration outside the reviewed allowlist.
 *
 * Companion to the presence + applied guards:
 *   - assert-required-money-migrations.mjs          (deploy-required files on disk)
 *   - assert-required-money-migrations-applied.mjs  (deploy-required rows in target DB)
 *   - assert-no-unreviewed-money-migrations.mjs     (this file — drift detection)
 *
 * The first two ensure the KNOWN money migrations are present and applied.
 * This one ensures no NEW money migration slips in without being explicitly
 * added to KNOWN_MONEY_MIGRATIONS in scripts/required-money-migrations.mjs.
 *
 * How it works:
 *   1. Scan supabase/migrations/*.sql.
 *   2. For each filename matching MONEY_MIGRATION_PATTERNS, assert it is
 *      listed in KNOWN_MONEY_MIGRATIONS. Any unlisted match = drift.
 *   3. For each KNOWN entry, assert the file still exists on disk. A
 *      missing entry = rename or delete that needs to be reconciled in
 *      the allowlist in the same PR.
 *
 * This does NOT parse SQL. It is a filename firewall. Its purpose is to
 * make money-adjacent scope explicit: adding a credit/referral/paddle/
 * billing/entitlement/founder migration requires a two-line edit to the
 * allowlist, which surfaces the change in code review.
 *
 * Exit codes: 0 = clean, 1 = drift detected.
 */
import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_MONEY_MIGRATIONS,
  isMoneyMigrationFilename,
} from "./required-money-migrations.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

const unreviewed = onDisk
  .filter(isMoneyMigrationFilename)
  .filter((f) => !KNOWN_MONEY_MIGRATIONS.has(f))
  .sort();

const missing = [...KNOWN_MONEY_MIGRATIONS]
  .filter((f) => !existsSync(join(MIGRATIONS_DIR, f)))
  .sort();

let failed = false;

if (unreviewed.length > 0) {
  failed = true;
  console.error(
    "✗ Unreviewed money-adjacent migration(s) added outside the allowlist:",
  );
  for (const f of unreviewed) console.error(`    supabase/migrations/${f}`);
  console.error(
    "\nThese filenames match a money pattern (credit, referral, entitlement,\n" +
      "paddle, billing, founder, subscription, checkout, invoice, price, refund)\n" +
      "but are not listed in KNOWN_MONEY_MIGRATIONS.\n" +
      "\n" +
      "Do NOT deploy. In the SAME PR:\n" +
      "  1. Confirm the migration truly belongs in money-critical scope.\n" +
      "  2. Add the filename to KNOWN_MONEY_MIGRATIONS in\n" +
      "     scripts/required-money-migrations.mjs.\n" +
      "  3. If it also gates a deploy, add it to REQUIRED_MONEY_MIGRATIONS.\n",
  );
}

if (missing.length > 0) {
  failed = true;
  console.error(
    "✗ Allowlisted money migration file(s) missing from supabase/migrations/:",
  );
  for (const f of missing) console.error(`    ${f}`);
  console.error(
    "\nA KNOWN money migration was renamed or deleted. In the SAME PR,\n" +
      "update KNOWN_MONEY_MIGRATIONS (and REQUIRED_MONEY_MIGRATIONS if the\n" +
      "file was in that list) to match the new name, or restore the file.\n",
  );
}

if (failed) process.exit(1);

const scanned = onDisk.filter(isMoneyMigrationFilename).length;
console.log(
  `✓ ${scanned} money-adjacent migration(s) on disk, all in KNOWN_MONEY_MIGRATIONS; no drift.`,
);
