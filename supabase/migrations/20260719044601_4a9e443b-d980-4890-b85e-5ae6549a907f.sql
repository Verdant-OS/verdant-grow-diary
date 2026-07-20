
-- ============================================================================
-- Founding 100 — Founders Wall + live-scoped cap coherence
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.founder_display_style AS ENUM
    ('custom_name', 'first_initial', 'number_only', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.founder_status AS ENUM
    ('confirmed', 'refunded', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.founder_milestone_status AS ENUM
    ('pending', 'met', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  founder_number           integer NOT NULL,
  paddle_subscription_ref  text,
  status                   public.founder_status NOT NULL DEFAULT 'confirmed',
  display_name             text,
  show_on_wall             boolean NOT NULL DEFAULT false,
  display_style            public.founder_display_style NOT NULL DEFAULT 'hidden',
  optional_link            text,
  milestone_status         public.founder_milestone_status NOT NULL DEFAULT 'pending',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT founders_number_range CHECK (founder_number BETWEEN 1 AND 100),
  CONSTRAINT founders_number_unique UNIQUE (founder_number),
  CONSTRAINT founders_user_unique UNIQUE (user_id),
  CONSTRAINT founders_display_name_len CHECK (display_name IS NULL OR length(display_name) <= 60),
  CONSTRAINT founders_optional_link_len CHECK (optional_link IS NULL OR length(optional_link) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_founders_status_number
  ON public.founders(status, founder_number);

-- 3. Grants (base table locked; column-level UPDATE for owner prefs only) ------
REVOKE ALL ON public.founders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.founders TO authenticated;
GRANT UPDATE (display_name, show_on_wall, display_style, optional_link)
  ON public.founders TO authenticated;
GRANT ALL ON public.founders TO service_role;

-- 4. RLS ----------------------------------------------------------------------
ALTER TABLE public.founders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founders_owner_select" ON public.founders;
CREATE POLICY "founders_owner_select" ON public.founders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "founders_owner_update_prefs" ON public.founders;
CREATE POLICY "founders_owner_update_prefs" ON public.founders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "founders_service_all" ON public.founders;
CREATE POLICY "founders_service_all" ON public.founders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
-- No INSERT/DELETE policies for authenticated → blocked. Service role only.

-- 5. Immutability trigger: founder_number freezes; status/milestone service-only.
CREATE OR REPLACE FUNCTION public.founders_guard_immutables()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.founder_number IS DISTINCT FROM OLD.founder_number THEN
    RAISE EXCEPTION 'founder_number is immutable once assigned';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS founders_guard_immutables_trg ON public.founders;
CREATE TRIGGER founders_guard_immutables_trg
  BEFORE UPDATE ON public.founders
  FOR EACH ROW EXECUTE FUNCTION public.founders_guard_immutables();

-- 6. Public wall view (three safe columns, name resolved server-side) ---------
DROP VIEW IF EXISTS public.founders_wall_public;
CREATE VIEW public.founders_wall_public
  WITH (security_invoker = false, security_barrier = true)
  AS
  SELECT
    f.founder_number,
    CASE f.display_style
      WHEN 'custom_name'   THEN NULLIF(btrim(f.display_name), '')
      WHEN 'first_initial' THEN NULLIF(upper(left(btrim(f.display_name), 1)), '')
      WHEN 'number_only'   THEN NULL
      ELSE NULL
    END                                        AS public_display_name,
    CASE f.display_style
      WHEN 'hidden' THEN NULL
      ELSE NULLIF(btrim(f.optional_link), '')
    END                                        AS optional_link
  FROM public.founders f
  WHERE f.status = 'confirmed'
    AND f.show_on_wall = true
    AND f.display_style <> 'hidden';

REVOKE ALL ON public.founders_wall_public FROM PUBLIC;
GRANT SELECT ON public.founders_wall_public TO anon, authenticated, service_role;

-- 7. Public live-scoped counter RPC -------------------------------------------
CREATE OR REPLACE FUNCTION public.founders_wall_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COUNT(*)::int FROM public.founders WHERE status = 'confirmed';
$$;
REVOKE ALL ON FUNCTION public.founders_wall_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founders_wall_count() TO anon, authenticated, service_role;

-- 8. Update slots-remaining: cap 100 + environment='live' filter --------------
CREATE OR REPLACE FUNCTION public.founder_lifetime_slots_remaining()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT GREATEST(
    0,
    100 - (
      SELECT COUNT(*)::int
      FROM public.subscriptions
      WHERE price_id = 'founder_lifetime'
        AND status = 'active'
        AND environment = 'live'
    )
  )
$$;

-- 9. Extended allocator: cap 100, live-only founders row, idempotent per user
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
  v_pseudo_sub_id  text;
  v_active_count   integer;
  v_existing_sub   public.subscriptions%ROWTYPE;
  v_existing_fnd   public.founders%ROWTYPE;
  v_next_number    integer;
  v_assigned_number integer;
BEGIN
  IF p_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_environment NOT IN ('sandbox','live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  v_pseudo_sub_id := 'lifetime_' || p_paddle_transaction_id;

  -- Serialize all founder allocations globally (test cannot race live).
  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  -- Idempotent path: same transaction retried by Paddle.
  SELECT * INTO v_existing_sub
    FROM public.subscriptions
   WHERE paddle_subscription_id = v_pseudo_sub_id
   LIMIT 1;
  IF FOUND THEN
    -- Ensure founders row exists too if this was a live retry that missed step 2.
    IF p_environment = 'live' THEN
      SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
      IF NOT FOUND THEN
        SELECT COUNT(*)::int INTO v_active_count
          FROM public.founders WHERE status = 'confirmed';
        IF v_active_count < 100 THEN
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

  -- Cap check (LIVE-scoped, aligned with founder_lifetime_slots_remaining).
  SELECT COUNT(*)::int INTO v_active_count
    FROM public.subscriptions
   WHERE price_id = 'founder_lifetime'
     AND status = 'active'
     AND environment = 'live';

  IF p_environment = 'live' AND v_active_count >= 100 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap_reached',
      'active_count', v_active_count);
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

  -- LIVE only: also write a founders row (idempotent per user_id).
  IF p_environment = 'live' THEN
    SELECT * INTO v_existing_fnd FROM public.founders WHERE user_id = p_user_id LIMIT 1;
    IF FOUND THEN
      v_assigned_number := v_existing_fnd.founder_number;
    ELSE
      SELECT COUNT(*)::int INTO v_active_count
        FROM public.founders WHERE status = 'confirmed';
      IF v_active_count < 100 THEN
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

-- 10. One-time idempotent backfill of existing live active holders ------------
-- Ordered by purchase time: current_period_start → created_at → paddle_subscription_id, asc.
-- Guarded with NOT EXISTS on user_id so re-running the migration never
-- renumbers or reassigns an existing founder — numbers freeze once assigned.
DO $$
DECLARE
  v_row record;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('lovable_founder_lifetime_allocator'));

  FOR v_row IN
    SELECT s.user_id, s.paddle_subscription_id
    FROM public.subscriptions s
    WHERE s.price_id = 'founder_lifetime'
      AND s.status = 'active'
      AND s.environment = 'live'
      AND NOT EXISTS (SELECT 1 FROM public.founders f WHERE f.user_id = s.user_id)
    ORDER BY
      COALESCE(s.current_period_start, s.created_at) ASC,
      s.created_at ASC,
      s.paddle_subscription_id ASC
  LOOP
    SELECT COALESCE(MAX(founder_number), 0) + 1 INTO v_next FROM public.founders;
    EXIT WHEN v_next > 100;
    INSERT INTO public.founders
      (user_id, founder_number, paddle_subscription_ref, status)
    VALUES
      (v_row.user_id, v_next, v_row.paddle_subscription_id, 'confirmed');
  END LOOP;
END $$;
