-- Repair the refund RPC's undefined-column failure without changing schema.
-- Match the allocator's existing subscription reference, isolate live/sandbox,
-- and keep all writes atomic. Historical migrations remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.revoke_lovable_founder_lifetime_by_transaction(
  p_paddle_transaction_id text,
  p_environment           text,
  p_now                   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pseudo_sub_id text := 'lifetime_' || p_paddle_transaction_id;
  v_subs_updated  int  := 0;
  v_founders_updated int := 0;
BEGIN
  IF p_paddle_transaction_id IS NULL OR btrim(p_paddle_transaction_id) = '' OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_environment');
  END IF;

  UPDATE public.subscriptions
     SET status               = 'canceled',
         current_period_end   = p_now,
         cancel_at_period_end = false,
         updated_at           = p_now
   WHERE paddle_subscription_id = v_pseudo_sub_id
     AND environment            = p_environment
     AND price_id               = 'founder_lifetime'
     AND status IS DISTINCT FROM 'canceled';
  GET DIAGNOSTICS v_subs_updated = ROW_COUNT;

  -- Founders are live-only. The allocator stores the lifetime subscription
  -- reference here; founders has neither transaction_id nor environment.
  UPDATE public.founders AS f
     SET status     = 'refunded',
         updated_at = p_now
   WHERE p_environment = 'live'
     AND f.paddle_subscription_ref = v_pseudo_sub_id
     AND f.status <> 'refunded'
     AND EXISTS (
       SELECT 1
         FROM public.subscriptions AS s
        WHERE s.paddle_subscription_id = v_pseudo_sub_id
          AND s.environment = 'live'
          AND s.price_id = 'founder_lifetime'
          AND s.user_id = f.user_id
     );
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
  'Atomically cancels the matching Founder Lifetime subscription and retires its live founder row by subscription reference and owner. Service-role only; immutable founder number and consumed seat remain preserved.';

COMMIT;
