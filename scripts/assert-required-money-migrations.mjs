#!/usr/bin/env node
/**
 * Guard: refuse to deploy if any money-critical credit-spend / referral
 * migration file is missing from supabase/migrations/.
 *
 * Purpose: the credit-packs + referral release depends on an exact chain
 * of migrations landing in order. If one is deleted, renamed, or never
 * committed, the ai_credit_spend RPC / referral conversion logic silently
 * regresses to an older shape and money-critical behavior (pack overflow,
 * idempotent grants, referral grant_ref anchoring) can break.
 *
 * This scan is INTENTIONALLY a filename allowlist. It does not parse SQL,
 * it does not diff against the DB, and it does not verify content. It
 * only asserts presence. Adding a new required migration is a deliberate
 * two-line change here.
 *
 * Exit codes: 0 = all present, 1 = one or more missing.
 */
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

/**
 * Required money-critical migrations. Order matches deploy order. Update
 * this list ONLY when adding a new money-critical migration; never delete
 * an entry without a documented rollback plan.
 */
const REQUIRED = [
  // credit ledger + spend foundation
  "20260620231000_harden_ai_credit_effective_entitlement.sql",
  "20260710010000_ai_credit_spend_union_hardening.sql",
  "20260718160000_ai_credit_server_billing_environment_expand.sql",
  "20260719043000_ai_credit_result_cache.sql",
  "20260720093000_ai_credit_grow_scope_integrity.sql",
  // credit-packs + referral release
  "20260721103000_ai_credit_grants.sql",
  "20260721104000_ai_credit_spend_pack_overflow.sql",
  "20260721105000_ai_credit_grants_non_paddle_grants.sql",
  "20260721106000_referrals_conversion.sql",
  "20260721107000_referral_code_and_pending_capture.sql",
];

const missing = REQUIRED.filter((f) => !existsSync(join(MIGRATIONS_DIR, f)));

if (missing.length > 0) {
  console.error("✗ Missing money-critical migration files:");
  for (const f of missing) console.error(`    supabase/migrations/${f}`);
  console.error(
    "\nDo NOT deploy. Restore the file(s) from git history, or if a rename is\n" +
      "intentional, update scripts/assert-required-money-migrations.mjs in the\n" +
      "same PR with a rollback note.",
  );
  process.exit(1);
}

console.log(`✓ All ${REQUIRED.length} money-critical migration files present.`);
