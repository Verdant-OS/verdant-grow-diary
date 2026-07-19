-- Turn B: refund-retire RPC for Founder Lifetime.
--
-- Called by supabase/functions/payments-webhook when an adjustment.created
-- event lands with action IN ('refund','chargeback') and status='approved'.
-- Atomically:
--   1. Cancels the subscription row (revokes Pro-level entitlement).
--   2. Marks the founders row as 'refunded' (seat stays consumed; number
--      is preserved so the 100-cap cannot silently reopen).
--
-- Wall view (founders_wall_public) filters to status='confirmed', so a
-- refunded row naturally drops from the public roster without any UI change.

CREATE OR REPLACE FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(
  p_paddle_transaction_id text,
  p_environment           text,
  p_now                   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo_sub_id text := 'lifetime_' || p_paddle_transaction_id;
  v_subs_updated  int  := 0;
  v_founders_updated int := 0;
BEGIN
  IF p_paddle_transaction_id IS NULL OR p_paddle_transaction_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_environment');
  END IF;

  UPDATE public.subscriptions
     SET status               = 'canceled',
         current_period_end   = p_now,
         cancel_at_period_end = false,
         updated_at           = p_now
   WHERE paddle_subscription_id = v_pseudo_sub_id
     AND environment            = p_environment;
  GET DIAGNOSTICS v_subs_updated = ROW_COUNT;

  UPDATE public.founders
     SET status     = 'refunded',
         updated_at = p_now
   WHERE paddle_transaction_id = p_paddle_transaction_id
     AND environment           = p_environment
     AND status <> 'refunded';
  GET DIAGNOSTICS v_founders_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'subscriptions_updated', v_subs_updated,
    'founders_updated',      v_founders_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(text, text, timestamptz) IS
  'Turn B refund-retire: atomically cancels the Founder Lifetime subscription row AND marks the founders row refunded. Service-role only. Seat stays consumed so 100-cap does not reopen.';
