-- Read-only privilege contract for public.stripe_payment_receipts
-- (migration 20261104233500_stripe_payment_receipts_billing_privileges.sql).
--
-- THIS IS AN OPERATOR VERIFICATION QUERY, NOT A CI SUITE. Nothing in CI runs
-- it; it lives outside supabase/tests/ so the test-execution manifest does not
-- count it as a pgTAP lane. Run it after the founder applies the migration.
-- Writes nothing: every check is a catalog read inside a transaction that
-- rolls back. Fails with an ASSERT message naming the first broken rule.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/verify-stripe-payment-receipts-privileges.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  t constant text := 'public.stripe_payment_receipts';
  p text;
BEGIN
  ASSERT to_regclass(t) IS NOT NULL, 'public.stripe_payment_receipts is missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass),
    'RLS must stay enabled on stripe_payment_receipts';

  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    ASSERT NOT has_table_privilege('anon', t, p),
      format('anon must not hold %s on stripe_payment_receipts', p);
  END LOOP;

  ASSERT has_table_privilege('authenticated', t, 'SELECT'),
    'authenticated must keep SELECT (owner-read policy)';
  FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    ASSERT NOT has_table_privilege('authenticated', t, p),
      format('authenticated must not hold %s on stripe_payment_receipts', p);
  END LOOP;

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = t::regclass AND a.grantee = 0
  ), 'PUBLIC must hold no privilege on stripe_payment_receipts';

  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    ASSERT has_table_privilege('service_role', t, p),
      format('service_role must hold %s on stripe_payment_receipts', p);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_payment_receipts'
      AND policyname = 'stripe_receipts_owner_read' AND cmd = 'SELECT'
  ), 'owner-read policy stripe_receipts_owner_read must remain';

  RAISE NOTICE 'stripe_payment_receipts privilege contract: PASS';
END
$$;

ROLLBACK;
