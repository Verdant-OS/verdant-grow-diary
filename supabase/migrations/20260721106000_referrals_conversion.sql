-- =========================================================================
-- Referral conversion engine — "give 10, get 10" AI credits.
--
-- The security-critical core of the referral program: a per-referee referral
-- record + an idempotent, anti-abuse conversion RPC that grants credits to BOTH
-- sides via grant_lovable_credits (source='referral'). The surrounding glue
-- (referral-code generation, /auth?ref= capture, the trigger that decides WHEN
-- a referral is "verified", and the share UI) is built on top of this.
--
-- Anti-abuse baked in here (not left to the caller):
--   * no self-referral (CHECK + guard)
--   * one referral per referee, ever (unique index) — a referee can't be
--     re-attributed to a second referrer, and can't be farmed twice
--   * dual grant is idempotent (grant_lovable_credits is keyed on grant_ref),
--     so a re-fired conversion never double-pays
-- The "verified" gate (email-confirmed vs first-paid, etc.) stays a caller
-- decision via p_verified — the fraud policy is a thin layer, not baked into SQL.
-- =========================================================================

DO $preflight$
BEGIN
  IF to_regprocedure('public.grant_lovable_credits(uuid,int,text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'referral conversion blocked: missing grant_lovable_credits (apply the non-Paddle grant migration first)';
  END IF;
END;
$preflight$;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted')),
  referrer_credits int NOT NULL DEFAULT 0 CHECK (referrer_credits >= 0),
  referee_credits int NOT NULL DEFAULT 0 CHECK (referee_credits >= 0),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT referrals_no_self_referral CHECK (referrer_user_id <> referee_user_id)
);

-- A referee can be referred at most once, ever — the core anti-farming guard.
CREATE UNIQUE INDEX referrals_referee_uq ON public.referrals(referee_user_id);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_user_id);

-- Grants. A referrer may read their own referrals (share dashboard); no client
-- write path — the conversion RPC (service_role) owns all writes.
REVOKE ALL ON public.referrals FROM anon, authenticated;
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_select_own_referrer"
  ON public.referrals
  FOR SELECT
  TO authenticated
  USING (referrer_user_id = auth.uid());

COMMENT ON TABLE public.referrals IS
  'Referral attribution + conversion state. One row per referee (unique). Written ONLY by convert_referral (service_role), which grants "give 10 / get 10" credits to both sides on a verified conversion via grant_lovable_credits.';

-- =========================================================================
-- convert_referral: idempotent, service-role-only. Records the referral (once
-- per referee) and, when verified, grants credits to both sides.
--   p_verified=false → record/keep a 'pending' attribution, no grant.
--   p_verified=true  → convert + grant give/get to referrer & referee.
-- Returns jsonb: { ok, reason, referral_id?, status?, referrer_credits?,
--                  referee_credits? }
-- =========================================================================
CREATE OR REPLACE FUNCTION public.convert_referral(
  p_referrer_user_id uuid,
  p_referee_user_id  uuid,
  p_code             text,
  p_environment      text,
  p_verified         boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Founder-chosen amounts (2026-07-21): give 10, get 10.
  v_give_referrer int := 10;
  v_give_referee  int := 10;
  v_existing      public.referrals%ROWTYPE;
  v_referral_id   uuid;
BEGIN
  IF p_referrer_user_id IS NULL OR p_referee_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF p_referrer_user_id = p_referee_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;
  IF p_environment NOT IN ('sandbox', 'live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- Serialize per referee so concurrent signup + verify calls can't race the
  -- one-referral-per-referee guard or double-grant.
  PERFORM pg_advisory_xact_lock(hashtext('referral_convert:' || p_referee_user_id::text));

  SELECT * INTO v_existing FROM public.referrals WHERE referee_user_id = p_referee_user_id LIMIT 1;

  IF FOUND THEN
    -- A referee is bound to their first referrer forever; a different one is
    -- an attribution conflict (or an abuse attempt), never a second reward.
    IF v_existing.referrer_user_id <> p_referrer_user_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'referee_already_referred');
    END IF;
    IF v_existing.status = 'converted' THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'idempotent',
        'referral_id', v_existing.id, 'status', 'converted');
    END IF;
    v_referral_id := v_existing.id;
  ELSE
    INSERT INTO public.referrals
      (referrer_user_id, referee_user_id, code, status, environment)
    VALUES
      (p_referrer_user_id, p_referee_user_id, COALESCE(p_code, ''), 'pending', p_environment)
    RETURNING id INTO v_referral_id;
  END IF;

  -- Not verified yet → keep the pending attribution, grant nothing.
  IF p_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'pending',
      'referral_id', v_referral_id, 'status', 'pending');
  END IF;

  -- Verified → grant both sides (each idempotent on its own grant_ref) and mark
  -- converted. A re-fired verify replays the same grants and updates nothing new.
  PERFORM public.grant_lovable_credits(
    p_referrer_user_id, v_give_referrer, 'referral',
    'referral_' || v_referral_id::text || '_referrer', p_environment);
  PERFORM public.grant_lovable_credits(
    p_referee_user_id, v_give_referee, 'referral',
    'referral_' || v_referral_id::text || '_referee', p_environment);

  UPDATE public.referrals
     SET status = 'converted',
         referrer_credits = v_give_referrer,
         referee_credits = v_give_referee,
         converted_at = now()
   WHERE id = v_referral_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'converted',
    'referral_id', v_referral_id, 'status', 'converted',
    'referrer_credits', v_give_referrer, 'referee_credits', v_give_referee);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) TO service_role;
