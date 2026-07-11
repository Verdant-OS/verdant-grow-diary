-- Trust-boundary hardening — Slice 0a: make ai_credit_refund server-only.
--
-- VULNERABILITY (live-verified): ai_credit_refund had EXECUTE granted to anon
-- and authenticated. Because ai_credit_spend meters usage as SUM(weight), a
-- caller could spend a credit (get the AI result), then call ai_credit_refund
-- on their OWN successful spend to insert a compensating -weight row, resetting
-- their usage to zero -> unlimited free AI at full model COGS, defeating the
-- per-user cap and the paid tier. Refund is meant to be called by the SERVER
-- on upstream failure, never by the client after a successful spend.
--
-- FIX: refund becomes callable by service_role only. Because a service_role
-- client carries NO user JWT, auth.uid() would be NULL inside the function and
-- the ownership checks would no-op; so the caller identity is now passed
-- explicitly as p_user_id. The edge functions (ai-doctor-review, ai-coach)
-- resolve the authenticated user via auth.getUser() on the USER client, then
-- call this RPC on a SERVICE_ROLE client passing that id. Ownership is still
-- enforced (v_orig.user_id must equal p_user_id), so the server cannot refund
-- one user's spend on behalf of another.
--
-- The old (uuid, text, text) signature is dropped so its anon/authenticated
-- grants disappear with it. Body is otherwise byte-for-byte the live body with
-- `v_uid := auth.uid()` replaced by `v_uid := p_user_id`.

DROP FUNCTION IF EXISTS public.ai_credit_refund(uuid, text, text);

CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_spend_id uuid,
  p_idempotency_key text,
  p_user_id uuid,
  p_reason text DEFAULT 'upstream_failure'::text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := p_user_id;
  v_orig record;
  v_existing_refund uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'user_id_required');
  END IF;
  IF p_spend_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_id_required');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_idempotency_key');
  END IF;

  -- Idempotent: replaying the refund key returns the existing refund row.
  SELECT id INTO v_new_id
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_new_id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  SELECT id, user_id, grow_id, period_key, weight, model_tier, feature, status
    INTO v_orig
    FROM public.ai_credit_spends
   WHERE id = p_spend_id
   LIMIT 1;
  IF NOT FOUND OR v_orig.user_id <> v_uid OR v_orig.status <> 'spent' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_not_refundable');
  END IF;

  SELECT id INTO v_existing_refund
    FROM public.ai_credit_spends
   WHERE refund_of = p_spend_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'replayed', 'refund_id', v_existing_refund);
  END IF;

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, refund_of, meta)
  VALUES
    (v_uid, v_orig.grow_id, v_orig.period_key, -v_orig.weight, v_orig.model_tier,
     v_orig.feature, 'refunded', p_idempotency_key, p_spend_id,
     jsonb_build_object('reason', p_reason))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'status', 'refunded',
    'refund_id', v_new_id, 'spend_id', p_spend_id, 'weight', -v_orig.weight);
END;
$function$;

-- Server-only: revoke every client role, grant service_role exclusively.
REVOKE ALL     ON FUNCTION public.ai_credit_refund(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, uuid, text) TO service_role;

-- Refresh PostgREST schema cache so the signature + grant change take effect.
NOTIFY pgrst, 'reload schema';
