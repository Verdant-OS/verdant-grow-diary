-- Record the Stripe billing schema that already exists in production.
--
-- Why: production project knkwiiywfkbqznbxwqfh carries Stripe objects that no
-- migration in this repository defines. They were applied outside the repo,
-- before the 2026-11-03 Lovable Stripe work on branch lovable-sync-1793724974
-- (reference head f0680d3da1af7b3e136b1c749d98463d2762b0ca). Definitions below
-- were read from production's catalog on 2026-11-04 at about 18:40 UTC
-- (Lovable query_database, read-only): pg_get_constraintdef, pg_indexes,
-- pg_get_functiondef, pg_policies and information_schema.columns.
--
-- Contract: every step is guarded by a catalog check, so on production this
-- file changes nothing. On a database built from this repository (local or
-- CI replay) it brings the schema up to production's shape.
--
-- Not reproduced on purpose: table privileges on public.stripe_payment_receipts.
-- Production shows anon and authenticated holding all table privileges there
-- (RLS still limits API reads to the owner). Tightening that is a separate,
-- owner-approved change, not part of recording what exists.
--
-- Interaction with 20261101180000_stripe_test_mode_subscription_sink.sql:
-- that migration was never applied to production and must never be. In a
-- replay it adds a column named "provider" and a constraint named
-- subscriptions_provider_check on that column. Production uses the same
-- constraint name on billing_provider instead. When the name is already taken
-- by a different definition, this file adds the billing_provider rule under
-- subscriptions_billing_provider_check. That branch never runs in production.

-- 1. public.subscriptions: provider identity columns.
-- Each ALTER runs only when needed, so production never takes the table lock.
DO $record$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'billing_provider'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN billing_provider text NOT NULL DEFAULT 'paddle';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN stripe_subscription_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN stripe_customer_id text;
  END IF;

  -- Stripe rows carry no Paddle identity, so these are nullable in production.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'paddle_subscription_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.subscriptions ALTER COLUMN paddle_subscription_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'paddle_customer_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.subscriptions ALTER COLUMN paddle_customer_id DROP NOT NULL;
  END IF;
END
$record$;

-- 2. public.subscriptions: provider constraints and Stripe identity keys.
DO $record$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.subscriptions'::regclass
    AND conname = 'subscriptions_provider_check';

  IF v_def IS NULL THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_provider_check
      CHECK (billing_provider = ANY (ARRAY['paddle'::text, 'stripe'::text]));
  ELSIF v_def <> 'CHECK ((billing_provider = ANY (ARRAY[''paddle''::text, ''stripe''::text])))'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.subscriptions'::regclass
        AND conname = 'subscriptions_billing_provider_check'
    )
  THEN
    -- Replay-only path: the name belongs to 20261101180000's "provider" rule.
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_provider_check
      CHECK (billing_provider = ANY (ARRAY['paddle'::text, 'stripe'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_provider_identity_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_provider_identity_check
      CHECK (
        (
          billing_provider = 'paddle'::text
          AND paddle_subscription_id IS NOT NULL
          AND paddle_customer_id IS NOT NULL
        )
        OR (
          billing_provider = 'stripe'::text
          AND stripe_subscription_id IS NOT NULL
          AND stripe_customer_id IS NOT NULL
          AND price_id <> 'founder_lifetime'::text
        )
      );
  END IF;

  -- Upsert target for persistStripeSubscription (onConflict environment,stripe_subscription_id).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_stripe_upsert_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_stripe_upsert_key
      UNIQUE (environment, stripe_subscription_id);
  END IF;
END
$record$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_identity
  ON public.subscriptions USING btree (environment, stripe_subscription_id)
  WHERE (stripe_subscription_id IS NOT NULL);

-- 3. public.ai_credit_grants: allow the stripe_credit_pack source.
-- Each constraint is replaced only when its definition differs from
-- production's. Production's definitions match, so nothing changes there.
DO $record$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.ai_credit_grants'::regclass
    AND conname = 'ai_credit_grants_source_check';

  IF v_def IS DISTINCT FROM
    'CHECK ((source = ANY (ARRAY[''credit_pack''::text, ''stripe_credit_pack''::text, ''referral''::text, ''bonus''::text])))'
  THEN
    ALTER TABLE public.ai_credit_grants DROP CONSTRAINT IF EXISTS ai_credit_grants_source_check;
    ALTER TABLE public.ai_credit_grants
      ADD CONSTRAINT ai_credit_grants_source_check
      CHECK (source = ANY (ARRAY['credit_pack'::text, 'stripe_credit_pack'::text, 'referral'::text, 'bonus'::text]));
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.ai_credit_grants'::regclass
    AND conname = 'ai_credit_grants_idempotency_anchor';

  IF v_def IS DISTINCT FROM
    'CHECK ((((source = ''credit_pack''::text) AND (paddle_transaction_id IS NOT NULL) AND (grant_ref IS NULL)) OR ((source = ANY (ARRAY[''stripe_credit_pack''::text, ''referral''::text, ''bonus''::text])) AND (grant_ref IS NOT NULL) AND (paddle_transaction_id IS NULL))))'
  THEN
    ALTER TABLE public.ai_credit_grants DROP CONSTRAINT IF EXISTS ai_credit_grants_idempotency_anchor;
    ALTER TABLE public.ai_credit_grants
      ADD CONSTRAINT ai_credit_grants_idempotency_anchor
      CHECK (
        (
          source = 'credit_pack'::text
          AND paddle_transaction_id IS NOT NULL
          AND grant_ref IS NULL
        )
        OR (
          source = ANY (ARRAY['stripe_credit_pack'::text, 'referral'::text, 'bonus'::text])
          AND grant_ref IS NOT NULL
          AND paddle_transaction_id IS NULL
        )
      );
  END IF;
END
$record$;

-- 4. public.stripe_payment_receipts: one row per settled Stripe credit-pack payment.
CREATE TABLE IF NOT EXISTS public.stripe_payment_receipts (
  environment text NOT NULL,
  payment_id text NOT NULL,
  user_id uuid NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_payment_receipts_pkey PRIMARY KEY (environment, payment_id),
  CONSTRAINT stripe_payment_receipts_environment_check
    CHECK (environment = ANY (ARRAY['sandbox'::text, 'live'::text])),
  CONSTRAINT stripe_payment_receipts_status_check
    CHECK (status = ANY (ARRAY['paid'::text, 'refunded'::text]))
);

DO $record$
BEGIN
  IF NOT (
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stripe_payment_receipts'::regclass
  ) THEN
    ALTER TABLE public.stripe_payment_receipts ENABLE ROW LEVEL SECURITY;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_payment_receipts'
      AND policyname = 'stripe_receipts_owner_read'
  ) THEN
    CREATE POLICY stripe_receipts_owner_read ON public.stripe_payment_receipts
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$record$;

-- 5. public.stripe_record_credit_payment: idempotent credit-pack settlement
-- and refund clawback. Created only when missing; production keeps its own
-- copy, whose body this text reproduces exactly.
DO $record$
BEGIN
  IF to_regprocedure('public.stripe_record_credit_payment(text,text,uuid,text,boolean)') IS NULL THEN
    CREATE FUNCTION public.stripe_record_credit_payment(p_environment text, p_payment_id text, p_user_id uuid, p_price_id text, p_refunded boolean DEFAULT false)
     RETURNS void
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp'
    AS $function$
DECLARE v_credits integer; v_parent public.ai_credit_grants; v_ref text; v_status text;
BEGIN
IF p_environment NOT IN ('sandbox','live') OR p_payment_id !~ '^pi_[A-Za-z0-9]+$' OR p_user_id IS NULL THEN RAISE EXCEPTION 'Invalid Stripe payment'; END IF;
v_credits:=CASE p_price_id WHEN 'credit_pack_50' THEN 50 WHEN 'credit_pack_150' THEN 150 ELSE NULL END;
IF v_credits IS NULL THEN RAISE EXCEPTION 'Unknown credit pack'; END IF;
v_ref:=p_environment||':'||p_payment_id;
PERFORM pg_advisory_xact_lock(hashtextextended('stripe:'||v_ref,0));
SELECT status INTO v_status FROM public.stripe_payment_receipts WHERE environment=p_environment AND payment_id=p_payment_id;
IF EXISTS(SELECT 1 FROM public.stripe_payment_receipts WHERE environment=p_environment AND payment_id=p_payment_id AND (user_id<>p_user_id OR price_id<>p_price_id)) THEN RAISE EXCEPTION 'Payment identity conflict'; END IF;
INSERT INTO public.stripe_payment_receipts(environment,payment_id,user_id,price_id,status) VALUES(p_environment,p_payment_id,p_user_id,p_price_id,CASE WHEN p_refunded THEN 'refunded' ELSE 'paid' END) ON CONFLICT(environment,payment_id) DO UPDATE SET status=CASE WHEN stripe_payment_receipts.status='refunded' OR p_refunded THEN 'refunded' ELSE 'paid' END,updated_at=now();
IF NOT p_refunded AND v_status IS DISTINCT FROM 'refunded' THEN
INSERT INTO public.ai_credit_grants(user_id,credits,kind,sku,source,grant_ref,environment) VALUES(p_user_id,v_credits,'grant',p_price_id,'stripe_credit_pack',v_ref,p_environment) ON CONFLICT DO NOTHING;
END IF;
IF p_refunded THEN
SELECT * INTO v_parent FROM public.ai_credit_grants WHERE source='stripe_credit_pack' AND grant_ref=v_ref AND kind='grant';
IF FOUND AND NOT EXISTS(SELECT 1 FROM public.ai_credit_grants WHERE reverses=v_parent.id) THEN
INSERT INTO public.ai_credit_grants(user_id,credits,kind,sku,source,grant_ref,environment,reverses) VALUES(p_user_id,-v_parent.credits,'clawback',p_price_id,'stripe_credit_pack',v_ref,p_environment,v_parent.id);
END IF;
END IF;
END; $function$;

    -- Production ACL: {postgres=X/postgres,service_role=X/postgres}.
    REVOKE ALL ON FUNCTION public.stripe_record_credit_payment(text, text, uuid, text, boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.stripe_record_credit_payment(text, text, uuid, text, boolean) FROM anon;
    REVOKE ALL ON FUNCTION public.stripe_record_credit_payment(text, text, uuid, text, boolean) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.stripe_record_credit_payment(text, text, uuid, text, boolean) TO service_role;
  END IF;
END
$record$;
