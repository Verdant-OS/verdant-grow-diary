-- =========================================================================
-- AI credit grants — generalize the ledger to accept NON-Paddle grants.
--
-- PR1 keyed every grant to a Paddle transaction (paddle_transaction_id NOT
-- NULL). Referral rewards and annual-plan bonus credits are grants with NO
-- Paddle transaction, so this migration adds a second idempotency anchor
-- (source, grant_ref) alongside the existing Paddle one and a service-role RPC
-- to write them. No new table — the same append-only ledger, and PR2's balance
-- derivation already SUMs all grant credits regardless of source (packs,
-- referrals and bonuses share the one "granted credits" overflow pool).
--
-- Additive + fail-safe: the existing grant_lovable_credit_pack path is
-- unchanged (source defaults to 'credit_pack', keyed on paddle_transaction_id).
-- =========================================================================

DO $preflight$
BEGIN
  IF to_regclass('public.ai_credit_grants') IS NULL THEN
    RAISE EXCEPTION
      'non-Paddle grants blocked: missing public.ai_credit_grants (apply the grant-ledger migration first)';
  END IF;
END;
$preflight$;

-- A referral/bonus grant carries no Paddle transaction and no pack SKU.
ALTER TABLE public.ai_credit_grants ALTER COLUMN paddle_transaction_id DROP NOT NULL;
ALTER TABLE public.ai_credit_grants ALTER COLUMN sku DROP NOT NULL;

-- Grant provenance. 'credit_pack' is the DEFAULT so the existing pack RPC keeps
-- inserting valid rows without change.
ALTER TABLE public.ai_credit_grants
  ADD COLUMN source text NOT NULL DEFAULT 'credit_pack'
    CHECK (source IN ('credit_pack', 'referral', 'bonus'));

-- Non-Paddle idempotency anchor (e.g. a referral event id, or
-- 'annual_bonus_<subscription_id>'). NULL for Paddle-keyed pack grants.
ALTER TABLE public.ai_credit_grants ADD COLUMN grant_ref text NULL;

-- Every row is anchored to EXACTLY ONE idempotency source: pack grants to a
-- Paddle transaction, referral/bonus grants to a grant_ref. This is what makes
-- "grant once" enforceable per source.
ALTER TABLE public.ai_credit_grants
  ADD CONSTRAINT ai_credit_grants_idempotency_anchor
  CHECK (
    (source = 'credit_pack' AND paddle_transaction_id IS NOT NULL AND grant_ref IS NULL)
    OR (source IN ('referral', 'bonus') AND grant_ref IS NOT NULL AND paddle_transaction_id IS NULL)
  );

-- One grant per (source, grant_ref) — the non-Paddle mirror of the pack's
-- unique paddle_transaction_id index, so a retried referral/bonus can't
-- double-grant.
CREATE UNIQUE INDEX ai_credit_grants_source_ref_uq
  ON public.ai_credit_grants(source, grant_ref)
  WHERE grant_ref IS NOT NULL AND kind = 'grant';

COMMENT ON COLUMN public.ai_credit_grants.source IS
  'Grant provenance: credit_pack (Paddle purchase), referral, or bonus. Referral/bonus grants have no Paddle transaction and are idempotent on (source, grant_ref).';

-- =========================================================================
-- grant_lovable_credits: idempotent, service-role-only NON-Paddle grant
-- (referral rewards, annual/plan bonuses). Mirrors grant_lovable_credit_pack
-- but keyed on (source, grant_ref) instead of a Paddle transaction id.
-- Returns jsonb: { ok:true, reason:'granted'|'idempotent', grant_id, credits? }
--                { ok:false, reason:'invalid_input' }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.grant_lovable_credits(
  p_expected_user_id uuid,
  p_credits          int,
  p_source           text,
  p_grant_ref        text,
  p_environment      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id      uuid;
BEGIN
  IF p_expected_user_id IS NULL
     OR p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000
     OR p_source NOT IN ('referral', 'bonus')
     OR p_grant_ref IS NULL OR length(btrim(p_grant_ref)) = 0
     OR p_environment NOT IN ('sandbox', 'live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- Serialize per (source, grant_ref) so a concurrent retry returns
  -- 'idempotent' cleanly instead of tripping the unique index.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_credit_grant:' || p_source || ':' || p_grant_ref));

  SELECT id INTO v_existing_id
    FROM public.ai_credit_grants
   WHERE source = p_source AND grant_ref = p_grant_ref AND kind = 'grant'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'idempotent', 'grant_id', v_existing_id);
  END IF;

  INSERT INTO public.ai_credit_grants
    (user_id, credits, kind, source, grant_ref, environment, meta)
  VALUES
    (p_expected_user_id, p_credits, 'grant', p_source, p_grant_ref, p_environment,
     jsonb_build_object('source', p_source))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'granted', 'grant_id', v_new_id, 'credits', p_credits);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) TO service_role;
