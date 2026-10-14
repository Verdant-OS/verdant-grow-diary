-- =========================================================================
-- Referrals: keep the monthly referrer cap after the referee account is deleted.
--
-- Successor to 20261003020000_referral_referrer_monthly_cap.sql (#1872).
-- Codex P1 4263480430: deleting the referee cascades the referrals row, while
-- the referrer's ai_credit_grants row remains. The previous count used only
-- referrals, so a deleted conversion freed a reward slot.
--
-- This replaces convert_referral with the same signature. Rewarded conversions
-- that still have a referrals row are counted as before. A referrer grant whose
-- referral row is gone is counted as well, and is not counted twice while the
-- row remains. No table, column, constraint, policy, or grant change.
-- =========================================================================

DO $preflight$
BEGIN
  IF to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)') IS NULL
     OR to_regclass('public.ai_credit_grants') IS NULL THEN
    RAISE EXCEPTION
      'referral deletion cap blocked: convert_referral or ai_credit_grants is missing';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.convert_referral(
  p_referrer_user_id uuid,
  p_referee_user_id  uuid,
  p_code             text,
  p_environment      text,
  p_verified         boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  -- Founder-chosen amounts (2026-07-21): give 10, get 10.
  v_reward_per_side    int := 10;
  -- Owner decision (2026-10-03): rewarded conversions per referrer per UTC month.
  v_monthly_reward_cap int := 10;
  v_give_referrer      int := 0;
  v_give_referee       int := 10;
  v_rewarded_this_month int;
  v_existing           public.referrals%ROWTYPE;
  v_referral_id        uuid;
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
  -- one-referral-per-referee rule.
  PERFORM pg_advisory_xact_lock(hashtext('referral_convert:' || p_referee_user_id::text));

  SELECT * INTO v_existing FROM public.referrals WHERE referee_user_id = p_referee_user_id LIMIT 1;

  IF FOUND THEN
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

  IF p_verified IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'pending',
      'referral_id', v_referral_id, 'status', 'pending');
  END IF;

  -- Serialize per referrer so two referees cannot both read 9 rewarded
  -- conversions and push the referrer past the cap.
  PERFORM pg_advisory_xact_lock(hashtext('referral_reward_referrer:' || p_referrer_user_id::text));

  -- Count rewarded conversions that still have a referrals row, plus referrer
  -- grant rows whose referral was cascade-deleted with the referee account.
  -- The grant belongs to the referrer, so account deletion must not free a slot.
  -- A grant whose referral row still exists is not counted again.
  SELECT count(*) INTO v_rewarded_this_month
    FROM (
      SELECT r.id
        FROM public.referrals r
       WHERE r.referrer_user_id = p_referrer_user_id
         AND r.environment = p_environment
         AND r.status = 'converted'
         AND r.referrer_credits > 0
         AND r.converted_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      UNION
      SELECT g.id
        FROM public.ai_credit_grants g
       WHERE g.user_id = p_referrer_user_id
         AND g.source = 'referral'
         AND g.kind = 'grant'
         AND g.environment = p_environment
         AND g.credits > 0
         AND g.grant_ref LIKE '%\_referrer' ESCAPE '\'
         AND g.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
         AND NOT EXISTS (
           SELECT 1
             FROM public.referrals r
            WHERE r.id::text = substring(g.grant_ref FROM '^referral_(.*)_referrer$')
         )
    ) rewarded;

  IF v_rewarded_this_month < v_monthly_reward_cap THEN
    v_give_referrer := v_reward_per_side;
    PERFORM public.grant_lovable_credits(
      p_referrer_user_id, v_give_referrer, 'referral',
      'referral_' || v_referral_id::text || '_referrer', p_environment);
  END IF;

  PERFORM public.grant_lovable_credits(
    p_referee_user_id, v_give_referee, 'referral',
    'referral_' || v_referral_id::text || '_referee', p_environment);

  UPDATE public.referrals
     SET status = 'converted',
         -- Capture may have stored a different environment (pending signup
         -- defaults to live). The cap and later counts use this conversion
         -- environment, which is also the environment on the grant rows.
         environment = p_environment,
         referrer_credits = v_give_referrer,
         referee_credits = v_give_referee,
         converted_at = now(),
         meta = CASE WHEN v_give_referrer = 0
                     THEN meta || jsonb_build_object('referrer_reward', 'capped')
                     ELSE meta END
   WHERE id = v_referral_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'converted',
    'referral_id', v_referral_id, 'status', 'converted',
    'referrer_credits', v_give_referrer, 'referee_credits', v_give_referee,
    'referrer_capped', v_give_referrer = 0);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) IS
  'Service-only referral conversion. Referee gets 10 credits once; the referrer gets 10 for at most 10 conversions per UTC month per environment, then 0 with meta.referrer_reward = capped.';
