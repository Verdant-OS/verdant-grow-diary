
-- ============================================================================
-- Founding 100 A.1 — Scarcity source of truth + content validation
-- ============================================================================

-- 1. Content validation on publicly-rendered fields ---------------------------
-- optional_link: https-only. Blocks javascript:, data:, http, relative, etc.
ALTER TABLE public.founders
  DROP CONSTRAINT IF EXISTS founders_optional_link_https_only;
ALTER TABLE public.founders
  ADD CONSTRAINT founders_optional_link_https_only
  CHECK (
    optional_link IS NULL
    OR (
      length(optional_link) <= 300
      AND optional_link ~ '^https://[^[:space:]]+$'
    )
  );

-- display_name: no control chars (already length-capped at 60 by prior migration).
ALTER TABLE public.founders
  DROP CONSTRAINT IF EXISTS founders_display_name_no_control_chars;
ALTER TABLE public.founders
  ADD CONSTRAINT founders_display_name_no_control_chars
  CHECK (
    display_name IS NULL
    OR display_name !~ '[[:cntrl:]]'
  );

-- 2. Seats-consumed = authoritative scarcity number ---------------------------
-- Counts Founders Wall rows regardless of status. A refunded/revoked seat is
-- still consumed (it never re-enters the pool), so the 100-cap can never
-- silently re-open and founder_number stays gap-free.
CREATE OR REPLACE FUNCTION public.founders_seats_consumed()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COUNT(*)::int FROM public.founders;
$$;
REVOKE ALL ON FUNCTION public.founders_seats_consumed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founders_seats_consumed()
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.founders_seats_consumed() IS
  'Authoritative scarcity count. Drives slots-remaining, sold-out gating, and the /founder "N of 100 claimed" counter. Counts every founders row regardless of status so refunds retire a seat rather than reopening it. Do not repoint sold-out at founders_wall_count (that is roster-visible only).';

-- 3. Slots remaining now derives from seats-consumed --------------------------
CREATE OR REPLACE FUNCTION public.founder_lifetime_slots_remaining()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT GREATEST(0, 100 - public.founders_seats_consumed());
$$;

-- 4. Allocator cap check uses seats-consumed (not subscription active count) --
-- Prevents the "refund reopens seat → next buyer gets founder_number=101 →
-- CHECK(1..100) violation" path.
CREATE OR REPLACE FUNCTION public.allocate_lovable_founder_lifetime(
  p_user_id                uuid,
  p_paddle_transaction_id  text,
  p_paddle_customer_id     text,
  p_environment            text,
  p_now                    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pseudo_sub_id   text;
  v_seats_consumed  integer;
  v_existing_sub    public.subscriptions%ROWTYPE;
  v_existing_fnd    public.founders%ROWTYPE;
  v_next_number     integer;
  v_assigned_number integer;
BEGIN
  IF p_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  v_pseudo_sub_id := 'lifetime_' || p_paddle_transaction_id;

  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  -- Idempotent path: Paddle retried the same transaction.
  SELECT * INTO v_existing_sub
    FROM public.subscriptions
   WHERE paddle_subscription_id = v_pseudo_sub_id
   LIMIT 1;
  IF FOUND THEN
    IF p_environment = 'live' THEN
      SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
      IF NOT FOUND THEN
        SELECT public.founders_seats_consumed() INTO v_seats_consumed;
        IF v_seats_consumed < 100 THEN
          SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next_number FROM public.founders;
          INSERT INTO public.founders
            (user_id, founder_number, paddle_subscription_ref, status)
          VALUES
            (p_user_id, v_next_number, v_pseudo_sub_id, 'confirmed')
          RETURNING founder_number INTO v_assigned_number;
        END IF;
      ELSE
        v_assigned_number := v_existing_fnd.founder_number;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'reason', 'idempotent',
      'paddle_subscription_id', v_pseudo_sub_id,
      'founder_number', v_assigned_number
    );
  END IF;

  -- Cap check uses seats-consumed so refunds cannot reopen the pool.
  SELECT public.founders_seats_consumed() INTO v_seats_consumed;
  IF p_environment = 'live' AND v_seats_consumed >= 100 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap_reached',
      'seats_consumed', v_seats_consumed);
  END IF;

  INSERT INTO public.subscriptions (
    user_id, paddle_subscription_id, paddle_customer_id,
    product_id, price_id, status,
    current_period_start, current_period_end, cancel_at_period_end,
    environment, updated_at
  ) VALUES (
    p_user_id, v_pseudo_sub_id, COALESCE(p_paddle_customer_id, ''),
    'founder_lifetime', 'founder_lifetime', 'active',
    p_now, NULL, false,
    p_environment, p_now
  );

  IF p_environment = 'live' THEN
    SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
    IF FOUND THEN
      v_assigned_number := v_existing_fnd.founder_number;
    ELSE
      -- Re-check after taking the subscription slot; still guard by seats.
      SELECT public.founders_seats_consumed() INTO v_seats_consumed;
      IF v_seats_consumed < 100 THEN
        SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next_number FROM public.founders;
        INSERT INTO public.founders
          (user_id, founder_number, paddle_subscription_ref, status)
        VALUES
          (p_user_id, v_next_number, v_pseudo_sub_id, 'confirmed')
        RETURNING founder_number INTO v_assigned_number;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'allocated',
    'paddle_subscription_id', v_pseudo_sub_id,
    'founder_number', v_assigned_number
  );
END;
$$;

-- 5. Load-bearing view comment (do not flip to security_invoker) --------------
COMMENT ON VIEW public.founders_wall_public IS
  'PUBLIC WALL VIEW. Load-bearing security_barrier=true, security_invoker=false. Do NOT change to invoker to satisfy a linter — anon has NO base-table SELECT on public.founders and the CASE resolves display_name server-side. Exposes exactly three columns: founder_number, public_display_name, optional_link. Never add a fourth column.';
