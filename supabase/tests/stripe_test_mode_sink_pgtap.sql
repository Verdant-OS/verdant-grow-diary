-- Disposable-local behavior proof for the unmerged Stripe test-mode sink.
-- Reviewer B P2 and Reviewer C P2-2. Do not run this against a hosted database.
-- finish(true) raises when an assert fails so the workflow job exits non-zero.
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

SELECT plan(42);

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

-- A newer no-op update must not block an older grant.
SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_noop_update',
      'customer.subscription.updated',
      'update_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_noop_update',
      'active', '2026-06-02 00:00:00+00', '2026-07-02 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-06-02 00:00:00+00'
    )$$,
  'no-op update before a subscription row does not raise'
);

SELECT is(
  (SELECT count(*)::int FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_noop_update'),
  0,
  'no-op update does not advance the event clock'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_noop_update_grant',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_noop_update',
      'active', '2026-06-01 00:00:00+00', '2026-07-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-06-01 00:00:00+00'
    )$$,
  'older grant still applies after a newer no-op update'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions
    WHERE stripe_subscription_id = 'sub_pgtap_noop_update'),
  1,
  'grant after a newer no-op update creates the subscription'
);

SELECT is(
  (SELECT latest_event_created FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_noop_update'),
  '2026-06-01 00:00:00+00'::timestamptz,
  'clock after that grant is the grant time, not the no-op time'
);

-- A newer no-op payment_failed is the same class of no-op.
SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_noop_invoice',
      'invoice.payment_failed',
      'mark_past_due',
      NULL, NULL, NULL, 'sub_pgtap_noop_invoice',
      NULL, NULL, NULL, false, NULL, 'sandbox', false,
      '2026-06-12 00:00:00+00'
    )$$,
  'no-op payment_failed before a subscription row does not raise'
);

SELECT is(
  (SELECT count(*)::int FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_noop_invoice'),
  0,
  'no-op payment_failed does not advance the event clock'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_noop_invoice_grant',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_noop_invoice',
      'active', '2026-06-11 00:00:00+00', '2026-07-11 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-06-11 00:00:00+00'
    )$$,
  'older grant still applies after a newer no-op payment_failed'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions
    WHERE stripe_subscription_id = 'sub_pgtap_noop_invoice'),
  1,
  'grant after a newer no-op payment_failed creates the subscription'
);

SELECT is(
  (SELECT latest_event_created FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_noop_invoice'),
  '2026-06-11 00:00:00+00'::timestamptz,
  'clock after the invoice grant is the grant time'
);

-- The failing stub above rolled the event back. A later success can reuse the id.
CREATE OR REPLACE FUNCTION public.grant_lovable_credit_pack(uuid, text, integer, text, text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('ok', true, 'reason', 'granted') $$;

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_pack',
      'checkout.session.completed',
      'grant_credit_pack',
      '11111111-1111-4111-8111-111111111111',
      'credit_pack_50', NULL, NULL,
      NULL, NULL, NULL, false, 'cs_test_pgtap', 'sandbox', false,
      '2026-05-01 00:00:00+00'
    )$$,
  'credit grant retry after rollback succeeds'
);

SELECT is(
  (SELECT result FROM public.stripe_webhook_events WHERE event_id = 'evt_pgtap_pack'),
  'applied',
  'credit grant retry is recorded as applied'
);

SELECT is(
  (SELECT count(*)::int FROM public.stripe_webhook_events WHERE event_id = 'evt_pgtap_pack'),
  1,
  'credit grant retry stores one event row'
);

SELECT is(
  (
    SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_grant_late',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'craft_monthly', 'cus_pgtap', 'sub_pgtap_late',
      'active', '2026-04-01 00:00:00+00', '2026-05-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-03-02 00:00:00+00'
    )->>'reason'
  ),
  'idempotent',
  'replaying the same event id is idempotent'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_late'),
  1,
  'replaying the same event id does not duplicate the subscription'
);

SELECT is(
  (SELECT price_id FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_late'),
  'pro_monthly',
  'replaying the same event id does not replace the plan'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_old_cancel_grant',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_old_cancel',
      'active', '2026-07-01 00:00:00+00', '2026-08-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-07-02 00:00:00+00'
    )$$,
  'grant before an older cancel is stored'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_old_cancel',
      'customer.subscription.deleted',
      'cancel_subscription',
      NULL, NULL, NULL, 'sub_pgtap_old_cancel',
      NULL, NULL, NULL, false, NULL, 'sandbox', false,
      '2026-07-01 00:00:00+00'
    )$$,
  'older cancel still applies'
);

SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_old_cancel'),
  'canceled',
  'older cancel sets the subscription canceled'
);

SELECT is(
  (SELECT latest_event_created FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_old_cancel'),
  '2026-07-02 00:00:00+00'::timestamptz,
  'older cancel does not rewind the event clock'
);

SELECT lives_ok(
  $$SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_equal_grant',
      'customer.subscription.created',
      'grant_subscription',
      '11111111-1111-4111-8111-111111111111',
      'pro_monthly', 'cus_pgtap', 'sub_pgtap_equal',
      'active', '2026-08-01 00:00:00+00', '2026-09-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-08-01 00:00:00+00'
    )$$,
  'grant at the equal-timestamp mark is stored'
);

SELECT is(
  (
    SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_equal_update',
      'customer.subscription.updated',
      'update_subscription',
      NULL, NULL, NULL, 'sub_pgtap_equal',
      'trialing', '2026-08-01 00:00:00+00', '2026-09-01 00:00:00+00', false, NULL,
      'sandbox', false,
      '2026-08-01 00:00:00+00'
    )->>'reason'
  ),
  'applied',
  'an event with an equal timestamp is not stale'
);

SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_equal'),
  'trialing',
  'equal timestamp update applies'
);

SELECT is(
  (SELECT latest_event_created FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_equal'),
  '2026-08-01 00:00:00+00'::timestamptz,
  'equal timestamp does not move the event clock'
);

SELECT is(
  (
    SELECT public.apply_stripe_test_mode_event(
      'evt_pgtap_null_created',
      'invoice.payment_failed',
      'mark_past_due',
      NULL, NULL, NULL, 'sub_pgtap_equal',
      NULL, NULL, NULL, false, NULL, 'sandbox', false,
      NULL
    )->>'reason'
  ),
  'applied',
  'a null event.created is not stale'
);

SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pgtap_equal'),
  'past_due',
  'null event.created still applies the status write'
);

SELECT is(
  (SELECT latest_event_created FROM public.stripe_test_mode_subscription_clock
    WHERE stripe_subscription_id = 'sub_pgtap_equal'),
  '2026-08-01 00:00:00+00'::timestamptz,
  'null event.created does not move the event clock backward'
);

SELECT throws_ok(
  $anon$DO $body$
    BEGIN
      SET LOCAL ROLE anon;
      PERFORM public.apply_stripe_test_mode_event(
        'evt_pgtap_anon',
        'customer.subscription.updated',
        'update_subscription',
        NULL, NULL, NULL, 'sub_pgtap_perm',
        NULL, NULL, NULL, false, NULL, 'sandbox', false,
        '2026-01-01 00:00:00+00'
      );
    END
    $body$$anon$,
  '42501',
  NULL,
  'anon cannot execute apply_stripe_test_mode_event'
);

SELECT throws_ok(
  $auth$DO $body$
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.apply_stripe_test_mode_event(
        'evt_pgtap_auth',
        'customer.subscription.updated',
        'update_subscription',
        NULL, NULL, NULL, 'sub_pgtap_perm',
        NULL, NULL, NULL, false, NULL, 'sandbox', false,
        '2026-01-01 00:00:00+00'
      );
    END
    $body$$auth$,
  '42501',
  NULL,
  'authenticated cannot execute apply_stripe_test_mode_event'
);

SELECT * FROM finish(true);
