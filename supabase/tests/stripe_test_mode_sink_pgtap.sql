-- Disposable-local behavior proof for the unmerged Stripe test-mode sink.
-- Reviewer B P2 and Reviewer C P2-2. Do not run this against a hosted database.
--
-- The file applies supabase/migrations/20261101180000_stripe_test_mode_subscription_sink.sql
-- on a fresh database. It creates only the roles and tables that migration expects
-- to already exist. grant_lovable_credit_pack is a local stub that returns ok false,
-- so the rollback assertion does not call the production credit function.
--
--   createdb stripe_sink_pgtap
--   psql -d stripe_sink_pgtap -v ON_ERROR_STOP=1 -f supabase/tests/stripe_test_mode_sink_pgtap.sql
--   dropdb stripe_sink_pgtap

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgtap;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.grant_lovable_credit_pack(uuid, text, integer, text, text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('ok', false, 'reason', 'forced_failure') $$;

\ir ../migrations/20261101180000_stripe_test_mode_subscription_sink.sql

INSERT INTO auth.users (id)
VALUES ('11111111-1111-4111-8111-111111111111')
ON CONFLICT (id) DO NOTHING;

SELECT plan(13);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_cancel_early',
      'customer.subscription.deleted',
      'cancel_subscription',
      NULL, NULL, NULL, 'sub_pgtap_early',
      NULL, NULL, NULL, false, NULL, 'sandbox', false,
      '2026-02-01 00:00:00+00'
    )$$,
  'cancel before a subscription row is stored'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_grant_early',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_early',
      'active', '2026-02-01 00:00:00+00', '2026-03-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-02-02 00:00:00+00'
    )$$,
  'grant after an earlier cancel does not raise'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_early'),
  0,
  'cancel-before-grant creates no subscription row'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_grant_late',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_late',
      'active', '2026-03-01 00:00:00+00', '2026-04-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-03-02 00:00:00+00'
    )$$,
  'first grant is stored'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_cancel_late',
      'customer.subscription.deleted',
      'cancel_subscription',
      NULL, NULL, NULL, 'sub_pgtap_late',
      NULL, NULL, NULL, false, NULL, 'sandbox', false,
      '2026-03-03 00:00:00+00'
    )$$,
  'cancel after grant is stored'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_grant_after_cancel',
      'customer.subscription.updated',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'craft_monthly', 'cus_pgtap', 'sub_pgtap_late',
      'active', '2026-04-01 00:00:00+00', '2026-05-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-03-04 00:00:00+00'
    )$$,
  'grant after cancel does not raise'
);

SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_late'),
  'canceled',
  'grant-after-cancel leaves the subscription canceled'
);

SELECT is(
  (SELECT price_id FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_late'),
  'pro_monthly',
  'grant-after-cancel does not replace the plan'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_order_new',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_order',
      'active', '2026-04-01 00:00:00+00', '2026-05-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-04-02 00:00:00+00'
    )$$,
  'newer grant sets the event clock'
);

SELECT is(
  (
    SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_order_old',
      'customer.subscription.updated',
      'update_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_order',
      'trialing', '2026-03-01 00:00:00+00', '2026-04-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-04-01 00:00:00+00'
    )->>'reason'
  ),
  'stale_event',
  'older non-cancel event is ignored after a newer one'
);

SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_order'),
  'active',
  'ignored older event does not rewind status'
);

SELECT throws_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_pack',
      'checkout.session.completed',
      'grant_credit_pack',
      '11111111-1111-4111-8111-111111111111',
      'credit_pack_50', NULL, NULL,
      NULL, NULL, NULL, false, 'cs_test_pgtap', 'sandbox', false,
      '2026-05-01 00:00:00+00'
    )$$,
  'P0001',
  'stripe_test_mode_credit_grant_failed',
  'failed credit grant rolls the event back'
);

SELECT is(
  (SELECT count(*)::int FROM public.stripe_webhook_events WHERE event_id = 'evt_pgtap_pack'),
  0,
  'failed credit grant leaves no event row'
);

SELECT finish();
