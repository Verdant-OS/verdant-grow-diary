-- =========================================================================
-- Referral glue 1/3 — per-user referral code + pending capture at signup.
--
-- Adds public.profiles.referral_code (opaque random slug, UNIQUE, client-
-- immutable) and extends handle_new_user() to (a) assign a code to every new
-- profile and (b) best-effort record a PENDING referral when the signup
-- metadata carries a referee's `verdant_ref_code`.
--
-- TRUST MODEL (mirrors the signup-attribution invariant): raw_user_meta_data
-- is a user-editable CLAIM. The code is used ONLY as a lookup key into the
-- trusted profiles.referral_code column; referrer identity and every grant
-- guard live inside convert_referral (anti-self-referral, one-referral-per-
-- referee, idempotent dual grant). The VERIFIED grant does NOT happen here —
-- it fires from the redeem-referral edge function, where the credit
-- environment is resolved from server secrets (PAYMENTS_ENVIRONMENT), never
-- hard-coded in the database. The p_environment passed below only labels the
-- pending row (cosmetic); convert_referral grants with the CALLER's
-- environment at verified time, never the stored row's.
-- =========================================================================

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

-- Opaque random slug: 10 chars from an unambiguous lowercase alphabet (no
-- 0/o/1/l/i). Deliberately NOT derived from user_id (enumerable, leaks the
-- auth UUID) or display_name (mutable PII). Collision-retry loop — a bare
-- column DEFAULT cannot retry against the unique index.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- 20 collisions in a 31^10 space means something is deeply wrong; fail
  -- loudly rather than looping forever inside an auth trigger.
  RAISE EXCEPTION 'generate_referral_code: could not find a free slug';
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM authenticated;

-- Backfill codes for existing profiles (mirror of the original profiles
-- backfill). Row-by-row so the collision-retry generator is honored.
DO $backfill$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT user_id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles
       SET referral_code = public.generate_referral_code()
     WHERE user_id = v_row.user_id AND referral_code IS NULL;
  END LOOP;
END;
$backfill$;

-- profiles has a client UPDATE policy (own row), so a plain new column would
-- be client-rewritable — a user could collide with / impersonate another
-- referrer's code. Extend the existing gamification freeze to also make
-- referral_code immutable for non-service_role.
CREATE OR REPLACE FUNCTION public.profiles_block_gamification_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

-- Preserve profile creation, attribution, and marketing-consent behavior;
-- add referral_code assignment + best-effort pending referral capture.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
  v_ref_code text;
  v_referrer uuid;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page',
      'pricing_page',
      'founder_page',
      'founder_share',
      'pricing_interest_share',
      'operator_outreach',
      'grower_invite',
      'context_check',
      'vpd_calculator',
      'csv_history'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id,
    display_name,
    marketing_opt_in,
    marketing_opt_in_at,
    referral_code
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

  -- Best-effort PENDING referral capture. The metadata code is an untrusted
  -- claim used only to look up a real referrer; convert_referral owns every
  -- guard. p_verified is almost always false here (email signups are
  -- unconfirmed at INSERT); pre-confirmed accounts (e.g. autoconfirm dev
  -- stacks) may convert immediately, using the DB-level environment label.
  -- NOTHING here may ever fail account creation.
  BEGIN
    v_ref_code := lower(btrim(NEW.raw_user_meta_data->>'verdant_ref_code'));
    IF v_ref_code IS NOT NULL AND v_ref_code ~ '^[a-z0-9]{6,16}$' THEN
      SELECT p.user_id INTO v_referrer
        FROM public.profiles p
       WHERE p.referral_code = v_ref_code
       LIMIT 1;
      IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
        PERFORM public.convert_referral(
          v_referrer,
          NEW.id,
          v_ref_code,
          COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live'),
          -- Fail closed: only grant DB-side when the environment GUC is explicitly
          -- set; otherwise record pending and let the edge fn grant with the
          -- server-resolved environment.
          NEW.email_confirmed_at IS NOT NULL
            AND NULLIF(current_setting('app.payments_environment', true), '') IS NOT NULL
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- referral capture is strictly best-effort
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
