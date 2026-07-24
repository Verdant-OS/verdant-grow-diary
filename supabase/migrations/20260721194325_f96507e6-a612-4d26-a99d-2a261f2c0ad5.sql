DO $preflight$
BEGIN
  IF to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION
      'referral glue blocked: missing convert_referral (apply the referrals-conversion migration first)';
  END IF;
END;
$preflight$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_uq
  ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text;
  v_attempt int;
  v_pos int;
BEGIN
  FOR v_attempt IN 1..20 LOOP
    v_code := '';
    FOR v_pos IN 1..10 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'generate_referral_code: could not find a free slug';
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM authenticated;

DO $backfill$
DECLARE v_row record;
BEGIN
  FOR v_row IN SELECT user_id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles
       SET referral_code = public.generate_referral_code()
     WHERE user_id = v_row.user_id AND referral_code IS NULL;
  END LOOP;
END;
$backfill$;

CREATE OR REPLACE FUNCTION public.profiles_block_gamification_updates()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.nugs_total IS DISTINCT FROM OLD.nugs_total
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.tier  IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'gamification fields (nugs_total, level, tier) are not directly writable';
  END IF;

  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is not directly writable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
  v_ref_code text;
  v_referrer uuid;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page','pricing_page','founder_page','founder_share',
      'pricing_interest_share','operator_outreach','grower_invite',
      'context_check','vpd_calculator','csv_history'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id, display_name, marketing_opt_in, marketing_opt_in_at, referral_code
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    public.generate_referral_code()
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF v_signup_source IS NOT NULL THEN
    INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
    VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  BEGIN
    v_ref_code := lower(btrim(NEW.raw_user_meta_data->>'verdant_ref_code'));
    IF v_ref_code IS NOT NULL AND v_ref_code ~ '^[a-z0-9]{6,16}$' THEN
      SELECT p.user_id INTO v_referrer
        FROM public.profiles p
       WHERE p.referral_code = v_ref_code
       LIMIT 1;
      IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
        PERFORM public.convert_referral(
          v_referrer, NEW.id, v_ref_code,
          COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live'),
          NEW.email_confirmed_at IS NOT NULL
            AND NULLIF(current_setting('app.payments_environment', true), '') IS NOT NULL
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON COLUMN public.profiles.referral_code IS
  'Opaque per-user referral slug (share link /auth?mode=signup&ref=<code>). Assigned once by handle_new_user, immutable for non-service_role (profiles_block_gamification_updates). Never derived from user identity.';

NOTIFY pgrst, 'reload schema';