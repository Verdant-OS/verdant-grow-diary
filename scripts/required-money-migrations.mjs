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
 * Full allowlist of KNOWN money-adjacent migrations already reviewed and
 * accepted into the repo. Consumed by
 * scripts/assert-no-unreviewed-money-migrations.mjs to detect drift: any
 * NEW file whose name matches MONEY_MIGRATION_PATTERNS but is not in this
 * set fails the guard, forcing the author to explicitly acknowledge the
 * money-critical scope of their change.
 *
 * Superset of REQUIRED_MONEY_MIGRATIONS. Includes historical billing,
 * paddle, entitlement, and founder migrations that are not required to
 * re-apply on every deploy but ARE money-adjacent and must not be silently
 * duplicated / re-shaped by a new file.
 *
 * When adding a new money migration:
 *   1. Add its filename here (and to REQUIRED_MONEY_MIGRATIONS if the
 *      deploy depends on it).
 *   2. Land it in the same PR as the migration file itself.
 * When RENAMING an existing money migration:
 *   1. Update the entry here in the same PR — a rename shows up as one
 *      missing entry + one unknown entry.
 */
export const KNOWN_MONEY_MIGRATIONS = new Set([
  // billing / paddle foundation
  "20260620234500_add_paddle_event_processing.sql",
  "20260621003000_paddle_event_processing_operator_audit.sql",
  "20260621004500_billing_customer_links_foundation.sql",
  "20260621015000_apply_paddle_subscription_update_rpc.sql",
  "20260622170000_billing_subscription_update_audit.sql",
  "20260622171621_billing_subscription_update_audit_retention.sql",
  "20260714230000_paddle_paid_launch_ordering_and_founder.sql",
  "20260715001000_paddle_paid_launch_review_hardening.sql",
  "20260717193000_entitlement_status_parity.sql",
  // everything in REQUIRED is by definition known
  ...REQUIRED_MONEY_MIGRATIONS,
]);

/**
 * Filename patterns that identify a migration as money-adjacent. If any
 * one of these matches the filename (case-insensitive), the migration MUST
 * appear in KNOWN_MONEY_MIGRATIONS.
 *
 * Keep patterns broad — false positives are cheap (add to the allowlist),
 * false negatives are expensive (silent money drift). Do not narrow a
 * pattern to exclude a real match; add the file to the allowlist instead.
 */
export const MONEY_MIGRATION_PATTERNS = [
  /credit/i,
  /referral/i,
  /entitlement/i,
  /paddle/i,
  /billing/i,
  /founder/i,
  /subscription/i,
  /checkout/i,
  /invoice/i,
  /price|pricing/i,
  /refund/i,
];

export function isMoneyMigrationFilename(filename) {
  return MONEY_MIGRATION_PATTERNS.some((re) => re.test(filename));
}

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
