-- Disposable, migrated database only. Run with psql -X -v ON_ERROR_STOP=1 -f <this-file>.
BEGIN;

CREATE FUNCTION pg_temp.check_paid(ok boolean, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', reason; END IF;
END $$;

SELECT pg_temp.check_paid(to_regprocedure('public.get_my_first_paid_activation()') IS NOT NULL,
                          'Missing own first-paid receipt RPC');

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
SELECT md5('paid-test-' || n)::uuid, 'paid-' || n || '@verdant.test', '{}', '{}',
       'authenticated', 'authenticated', now(), now()
FROM generate_series(1, 15) AS n;

CREATE FUNCTION pg_temp.add_sub(n integer, plan text, provider text DEFAULT 'stripe',
    env text DEFAULT 'live', state text DEFAULT 'active', period_end timestamptz DEFAULT now() + interval '1 month',
    provider_id text DEFAULT NULL, period_start timestamptz DEFAULT now() - interval '2 minutes')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  sub_id text := coalesce(provider_id, 'sub_' || replace(gen_random_uuid()::text, '-', ''));
  added uuid;
BEGIN
  INSERT INTO public.subscriptions (user_id, product_id, price_id, billing_provider, status,
      environment, current_period_start, current_period_end, stripe_subscription_id, stripe_customer_id,
      paddle_subscription_id, paddle_customer_id)
  VALUES (md5('paid-test-' || n)::uuid, 'fixture', plan, provider, state, env, period_start, period_end,
      CASE WHEN provider = 'stripe' THEN sub_id END, CASE WHEN provider = 'stripe' THEN 'cus_fixture' END,
      CASE WHEN provider = 'paddle' THEN sub_id END, CASE WHEN provider = 'paddle' THEN 'ctm_fixture' END)
  RETURNING id INTO added;
  RETURN added;
END $$;

SELECT pg_temp.add_sub(1, 'pro_monthly');
CREATE TEMP TABLE expected_paid AS SELECT * FROM public.first_paid_activation_receipts
WHERE user_id = md5('paid-test-1')::uuid;
SELECT pg_temp.check_paid((SELECT count(*) = 1 AND min(activated_at) = now() - interval '2 minutes'
                          FROM expected_paid), 'Live activation did not preserve the paid period start');
UPDATE public.subscriptions SET status = 'trialing' WHERE user_id = md5('paid-test-1')::uuid;
UPDATE public.subscriptions SET status = 'active' WHERE user_id = md5('paid-test-1')::uuid;
SELECT pg_temp.check_paid((SELECT count(*) = 1 FROM public.first_paid_activation_receipts r
                          JOIN expected_paid e USING (user_id, activated_at, event_id)),
                          'Active, then trialing, then active created another receipt');
UPDATE public.subscriptions SET status = 'active', current_period_end = now() + interval '2 months'
WHERE user_id = md5('paid-test-1')::uuid;
UPDATE public.subscriptions SET status = 'canceled' WHERE user_id = md5('paid-test-1')::uuid;
SELECT pg_temp.add_sub(1, 'craft_annual', 'paddle');
SELECT pg_temp.check_paid((SELECT count(*) = 1 FROM public.first_paid_activation_receipts r
                          JOIN expected_paid e USING (user_id, activated_at, event_id)),
                          'Renewal or cross-provider resubscription changed the receipt');

SELECT pg_temp.add_sub(2, 'craft_annual', 'paddle', state => 'trialing');
SELECT pg_temp.check_paid(NOT EXISTS (SELECT 1 FROM public.first_paid_activation_receipts
                          WHERE user_id = md5('paid-test-2')::uuid), 'Open trial counted');
UPDATE public.subscriptions SET status = 'active' WHERE user_id = md5('paid-test-2')::uuid;
SELECT pg_temp.add_sub(3, 'craft_monthly');
SELECT pg_temp.add_sub(4, 'pro_annual', 'paddle');
SELECT pg_temp.add_sub(5, 'pro_monthly', env => 'sandbox');
SELECT pg_temp.add_sub(6, 'credit_pack');
SELECT pg_temp.add_sub(7, 'pro_monthly', period_end => now() - interval '1 day');
SELECT pg_temp.add_sub(8, 'pro_annual', provider => 'paddle', provider_id => 'manual_grant');
SELECT pg_temp.add_sub(9, 'founder_lifetime', provider => 'paddle', provider_id => 'lifetime_fixture');
INSERT INTO public.paid_return_cohort_memberships (user_id) VALUES (md5('paid-test-10')::uuid);
SELECT pg_temp.add_sub(10, 'pro_monthly');
SELECT pg_temp.add_sub(11, 'craft_monthly', state => 'canceled');
SELECT pg_temp.add_sub(11, 'pro_monthly');
SELECT pg_temp.add_sub(12, 'pro_monthly', period_start => NULL);
SELECT pg_temp.add_sub(13, 'craft_annual', state => 'past_due');
UPDATE public.subscriptions SET status = 'active' WHERE user_id = md5('paid-test-13')::uuid;
SELECT pg_temp.add_sub(14, 'pro_monthly', 'paddle');
DELETE FROM public.first_paid_activation_receipts WHERE user_id = md5('paid-test-14')::uuid;
UPDATE public.subscriptions
  SET created_at = now() - interval '40 days', status = 'trialing',
      current_period_start = now() - interval '1 day', current_period_end = now() + interval '6 days'
  WHERE user_id = md5('paid-test-14')::uuid;
UPDATE public.subscriptions
  SET status = 'active', current_period_start = now() - interval '1 minute',
      current_period_end = now() + interval '1 month'
  WHERE user_id = md5('paid-test-14')::uuid;
SELECT pg_temp.check_paid(NOT EXISTS (SELECT 1 FROM public.first_paid_activation_receipts
                          WHERE user_id = md5('paid-test-14')::uuid),
                          'Replayed trial on an older paid row created a receipt');
SELECT pg_temp.add_sub(15, 'craft_annual', env => 'sandbox', state => 'trialing');
UPDATE public.subscriptions SET status = 'active', environment = 'live' WHERE user_id = md5('paid-test-15')::uuid;

SELECT pg_temp.check_paid((SELECT count(*) = 4 FROM public.first_paid_activation_receipts
    WHERE user_id IN (SELECT md5('paid-test-' || n)::uuid FROM generate_series(1, 15) n))
    AND (SELECT count(*) = 4 FROM public.first_paid_activation_receipts
    WHERE user_id IN (SELECT md5('paid-test-' || n)::uuid FROM generate_series(1, 4) n)),
    'Eligibility mismatch for live recurring tiers, sandbox, credits, history, time or manual grants');
SELECT pg_temp.check_paid(EXISTS (SELECT 1 FROM public.paid_return_cohort_memberships
    WHERE user_id = md5('paid-test-9')::uuid) AND NOT EXISTS (SELECT 1 FROM public.paid_return_cohort_memberships
    WHERE user_id = md5('paid-test-2')::uuid), 'Existing operator cohort criteria changed');

SELECT pg_temp.check_paid(NOT has_function_privilege('anon', 'public.get_my_first_paid_activation()', 'EXECUTE')
    AND NOT has_table_privilege('authenticated', 'public.first_paid_activation_receipts', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'public.first_paid_activation_receipts', 'SELECT,INSERT,UPDATE,DELETE')
    AND to_regprocedure('public.get_my_first_paid_activation(uuid)') IS NULL, 'Excess receipt privileges');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('paid-test-1')::uuid::text, true);
SELECT pg_temp.check_paid((SELECT (r->>'account_id')::uuid = auth.uid()
    AND (r->>'event_id')::uuid IS NOT NULL
    AND (r->>'activated_at')::timestamptz = now() - interval '2 minutes'
    AND r - ARRAY['account_id', 'event_id', 'activated_at'] = '{}'::jsonb
    FROM public.get_my_first_paid_activation() AS r), 'Owner receipt missing or exposes extra fields');
SELECT set_config('request.jwt.claim.sub', md5('paid-test-14')::uuid::text, true);
SELECT pg_temp.check_paid(public.get_my_first_paid_activation() IS NULL, 'Other account saw a receipt');
RESET ROLE;

ROLLBACK;
