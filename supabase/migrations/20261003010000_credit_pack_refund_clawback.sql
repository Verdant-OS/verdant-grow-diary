-- =========================================================================
-- AI credit packs: claw back the grant when the purchase is refunded or
-- charged back.
--
-- Grant-path audit (2026-10-03), FAIL #1: an approved refund or chargeback
-- only revoked Founder Lifetime. Nothing wrote the `clawback` rows the grant
-- ledger already allows, so a buyer could purchase a pack, spend it, then
-- reverse the payment and keep the credits.
--
-- Owner decisions (2026-10-03):
--   * claw back the FULL pack amount. If some credits were already spent, the
--     derived pack balance goes negative; ai_credit_spend then refuses
--     pack-funded overflow until later grants cover it. The monthly allowance
--     is unaffected because it is checked first and never reads this ledger.
--   * any approved refund or chargeback triggers it, partial refunds included,
--     matching Founder Lifetime revocation.
--
-- Ordering. The webhook writes the durable refund barrier
-- `internal:founder-refund:<env>:<txn>` to lovable_paddle_events for EVERY
-- approved refund/chargeback before it revokes anything. Both functions below
-- take the existing per-transaction pack lock, and the grant re-reads that
-- barrier after the lock, so a refund that lands before the purchase leaves
-- no credits behind in either order.
--
-- Additive: one new service-role function, and grant_lovable_credit_pack
-- redefined with the same signature, the same grant/idempotent behaviour, and
-- one new refusal (`credit_pack_refund_precedes_purchase`). No table, column,
-- constraint, policy or grant on a table changes.
-- =========================================================================

DO $preflight$
BEGIN
  IF to_regclass('public.ai_credit_grants') IS NULL
     OR to_regclass('public.lovable_paddle_events') IS NULL
     OR to_regprocedure('public.grant_lovable_credit_pack(uuid,text,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'credit-pack clawback blocked: ai_credit_grants, lovable_paddle_events or grant_lovable_credit_pack is missing';
  END IF;
END;
$preflight$;

-- =========================================================================
-- clawback_lovable_credit_pack: idempotent, service-role-only reversal.
-- Returns jsonb:
--   { ok:true, reason:'clawed_back', clawback_id, grant_id, credits }
--   { ok:true, reason:'idempotent',  clawback_id, grant_id }
--   { ok:true, reason:'no_grant' }        -- not a pack purchase in this env,
--                                         -- or the refund arrived first
--   { ok:false, reason:'invalid_input' | 'unsupported_transaction_isolation' }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.clawback_lovable_credit_pack(
  p_paddle_transaction_id text,
  p_environment           text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grant    public.ai_credit_grants%ROWTYPE;
  v_existing uuid;
  v_new_id   uuid;
BEGIN
  IF p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_environment IS NULL OR p_environment NOT IN ('sandbox', 'live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- A snapshot taken before waiting on the lock could miss a committed grant.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_transaction_isolation');
  END IF;

  -- Same key as grant_lovable_credit_pack, so a grant in flight finishes
  -- before this reads it.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_credit_pack_grant:' || p_paddle_transaction_id));

  SELECT * INTO v_grant
    FROM public.ai_credit_grants
   WHERE paddle_transaction_id = p_paddle_transaction_id
     AND kind = 'grant'
     AND source = 'credit_pack'
     AND environment = p_environment
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'no_grant');
  END IF;

  SELECT id INTO v_existing
    FROM public.ai_credit_grants
   WHERE paddle_transaction_id = p_paddle_transaction_id
     AND kind = 'clawback'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'reason', 'idempotent', 'clawback_id', v_existing, 'grant_id', v_grant.id);
  END IF;

  INSERT INTO public.ai_credit_grants
    (user_id, credits, kind, sku, paddle_transaction_id, environment, reverses, source, meta)
  VALUES
    (v_grant.user_id, -v_grant.credits, 'clawback', v_grant.sku, p_paddle_transaction_id,
     v_grant.environment, v_grant.id, 'credit_pack',
     jsonb_build_object('source', 'credit_pack', 'reason', 'refund_or_chargeback'))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'clawed_back', 'clawback_id', v_new_id,
    'grant_id', v_grant.id, 'credits', -v_grant.credits);
END;
$$;

REVOKE ALL ON FUNCTION public.clawback_lovable_credit_pack(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clawback_lovable_credit_pack(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.clawback_lovable_credit_pack(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clawback_lovable_credit_pack(text, text) TO service_role;

COMMENT ON FUNCTION public.clawback_lovable_credit_pack(text, text) IS
  'Service-only, idempotent reversal of a credit-pack grant on an approved refund or chargeback. Appends one clawback row for the full grant (balance may go negative). Shares the per-transaction pack lock with grant_lovable_credit_pack.';

-- =========================================================================
-- grant_lovable_credit_pack: unchanged signature and grant/idempotent
-- results. New: refuses when an approved refund for this transaction is
-- already recorded, reconciling any earlier grant first.
--   { ok:false, reason:'credit_pack_refund_precedes_purchase' }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.grant_lovable_credit_pack(
  p_expected_user_id       uuid,
  p_paddle_transaction_id  text,
  p_credits                int,
  p_sku                    text,
  p_environment            text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id   uuid;
  v_new_id        uuid;
  v_refund_result jsonb;
BEGIN
  IF p_expected_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000
     OR p_sku IS NULL OR length(btrim(p_sku)) = 0
     OR p_environment NOT IN ('sandbox', 'live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- A snapshot taken before waiting on the lock could miss a committed
  -- refund barrier. The webhook RPC contract uses Read Committed.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_transaction_isolation');
  END IF;

  -- Serialize per-transaction so a concurrent retry returns 'idempotent'
  -- cleanly instead of tripping the unique index with an exception. The
  -- clawback takes the same lock.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_credit_pack_grant:' || p_paddle_transaction_id));

  -- An approved refund or chargeback for this transaction is already
  -- recorded: never grant. Reconcile a grant written before the refund (the
  -- clawback re-enters the same lock and is idempotent).
  IF EXISTS (
    SELECT 1 FROM public.lovable_paddle_events
     WHERE paddle_event_id = 'internal:founder-refund:' || p_environment || ':' || p_paddle_transaction_id
  ) THEN
    v_refund_result := public.clawback_lovable_credit_pack(p_paddle_transaction_id, p_environment);
    IF (v_refund_result->>'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'credit-pack refund reconcile failed: %', v_refund_result->>'reason';
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_pack_refund_precedes_purchase');
  END IF;

  -- Idempotent path: this Paddle transaction was already granted.
  SELECT id INTO v_existing_id
    FROM public.ai_credit_grants
   WHERE paddle_transaction_id = p_paddle_transaction_id AND kind = 'grant'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'idempotent', 'grant_id', v_existing_id);
  END IF;

  INSERT INTO public.ai_credit_grants
    (user_id, credits, kind, sku, paddle_transaction_id, environment, meta)
  VALUES
    (p_expected_user_id, p_credits, 'grant', p_sku, p_paddle_transaction_id, p_environment,
     jsonb_build_object('source', 'credit_pack'))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'granted', 'grant_id', v_new_id, 'credits', p_credits);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) TO service_role;
