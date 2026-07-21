/**
 * Single source of truth for money-critical migration filenames.
 *
 * Consumed by:
 *   - scripts/assert-required-money-migrations.mjs         (file presence)
 *   - scripts/assert-required-money-migrations-applied.mjs (DB applied check)
 *
 * Order matches deploy order. Add entries ONLY for migrations that carry
 * credit-spend, credit-grant, referral, or entitlement logic whose absence
 * would silently regress money behavior. Never delete an entry without a
 * documented rollback plan.
 */
export const REQUIRED_MONEY_MIGRATIONS = [
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

/**
 * Supabase's migration tracker stores the leading 14-digit timestamp of the
 * filename as `version` in `supabase_migrations.schema_migrations`. Extract
 * that so the DB check compares like-for-like.
 */
export function migrationVersion(filename) {
  const match = /^(\d{14})_/.exec(filename);
  if (!match) throw new Error(`Malformed migration filename: ${filename}`);
  return match[1];
}
