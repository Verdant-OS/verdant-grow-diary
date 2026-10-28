-- Cut 001 AC6: deleting the first tent and creating a new one earns First
-- Tent again (Cheeko, 2026-10-22). Pins the current evaluator: the award row
-- is reused, so the badge comes back as `restored` with its original
-- first_recognized_at. No migration is needed for this behavior.
-- Local or disposable database only. Rolls back every row it creates.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/badge_awards_first_tent_reearn.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_grow uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_third uuid := gen_random_uuid();
  v_bare uuid := gen_random_uuid();
  v_photo text;
  v_result jsonb;
  v_award uuid;
  v_recognized timestamptz;
  v_hidden timestamptz;
  v_evidence_tent uuid;
  v_count int;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES (
    v_owner, 'badge-reearn-' || v_owner::text || '@verdant.test',
    crypt('harness-password', gen_salt('bf')), now(), now(), now(),
    '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
  );
  INSERT INTO public.grows (id, user_id, name) VALUES (v_grow, v_owner, 'badge reearn harness');

  v_photo := v_owner::text || '/tents/reearn.jpg';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('diary-photos', v_photo);

  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
  RESET role;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);

  -- 1. First tent with an owned photo earns First Tent.
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, photo_url, created_at)
  VALUES (v_first, v_owner, v_grow, 'First tent', 'veg', true,
          'storage://diary-photos/' || v_photo, '2026-10-01T00:00:00Z');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'qualified', 'the first tent with a photo earns First Tent';
  v_award := (v_result->>'award_id')::uuid;
  RESET role;
  SELECT first_recognized_at INTO v_recognized FROM public.badge_awards WHERE id = v_award;

  -- 2. Deleting it drops the badge.
  DELETE FROM public.tents WHERE id = v_first;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'hidden', 'deleting the only tent hides First Tent';
  RESET role;

  -- 3. A new tent without a photo earns nothing.
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, created_at)
  VALUES (v_bare, v_owner, v_grow, 'Bare tent', 'veg', true, '2026-10-04T00:00:00Z');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'a replacement tent without a photo does not earn First Tent';
  RESET role;
  DELETE FROM public.tents WHERE id = v_bare;

  -- 4. A new tent with an owned photo earns First Tent again.
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, photo_url, created_at)
  VALUES (v_second, v_owner, v_grow, 'Second tent', 'veg', true,
          'storage://diary-photos/' || v_photo, '2026-10-05T00:00:00Z');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'restored', 'a new tent with a photo earns First Tent again';
  ASSERT (v_result->>'award_id')::uuid = v_award, 'earning again reuses the award row';
  RESET role;
  SELECT hidden_at INTO v_hidden FROM public.badge_awards WHERE id = v_award;
  ASSERT v_hidden IS NULL, 'the re-earned badge is visible';
  ASSERT (SELECT first_recognized_at FROM public.badge_awards WHERE id = v_award) = v_recognized,
    'first_recognized_at keeps the original earn time';
  SELECT tent_id INTO v_evidence_tent FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_evidence_tent = v_second, 'evidence points at the new tent';

  -- 5. Replaced before any evaluation runs: the badge never drops, evidence moves.
  DELETE FROM public.tents WHERE id = v_second;
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, photo_url, created_at)
  VALUES (v_third, v_owner, v_grow, 'Third tent', 'veg', true,
          'storage://diary-photos/' || v_photo, '2026-10-06T00:00:00Z');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'a swap between evaluations keeps First Tent';
  ASSERT (v_result->>'award_id')::uuid = v_award, 'the swap keeps the same award row';
  RESET role;
  SELECT tent_id INTO v_evidence_tent FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_evidence_tent = v_third, 'evidence follows the replacement tent';

  SELECT count(*) INTO v_count FROM public.badge_awards
  WHERE user_id = v_owner AND badge_key = 'first_tent';
  ASSERT v_count = 1, 'one First Tent row per account';
END;
$$;

ROLLBACK;
