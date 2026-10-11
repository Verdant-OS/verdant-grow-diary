-- First Tent, Setup Documented, and First Recorded Harvest.
-- Local or disposable database only. Rolls back every row it creates.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/badge_awards_tent_setup_harvest.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_grow uuid := gen_random_uuid();
  v_first_tent uuid := gen_random_uuid();
  v_later_tent uuid := gen_random_uuid();
  v_name_only uuid := gen_random_uuid();
  v_harvest uuid := gen_random_uuid();
  v_bare_harvest uuid := gen_random_uuid();
  v_photo text;
  v_stranger_photo text;
  v_result jsonb;
  v_count int;
BEGIN
  ASSERT NOT has_function_privilege(
    'anon',
    'public.badge_awards_evaluate_owner(text)',
    'EXECUTE'
  ), 'anon must not execute the evaluator';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.badge_awards_evaluate_photo_subject(text, uuid)',
    'EXECUTE'
  ), 'anon must not execute the photo-subject helper';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.badge_awards_evaluate_photo_subject(text, uuid)',
    'EXECUTE'
  ), 'authenticated must not execute the photo-subject helper';
  ASSERT NOT has_table_privilege('anon', 'public.badge_evidence', 'SELECT'),
    'anon must not read evidence photos';

  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES
    (v_owner, 'badge-tent-' || v_owner::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_stranger, 'badge-tent-stranger-' || v_stranger::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  INSERT INTO public.grows (id, user_id, name)
  VALUES (v_grow, v_owner, 'badge tent harness');

  v_photo := v_owner::text || '/tents/owned.jpg';
  v_stranger_photo := v_stranger::text || '/tents/other.jpg';
  INSERT INTO storage.objects (bucket_id, name)
  VALUES
    ('diary-photos', v_photo),
    ('diary-photos', v_stranger_photo);

  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, created_at)
  VALUES (
    v_first_tent, v_owner, v_grow, 'First tent', 'seedling', true, '2026-10-01T00:00:00Z'
  );
  INSERT INTO public.tents (
    id, user_id, grow_id, name, stage, light_on, brand, photo_url, created_at
  ) VALUES (
    v_later_tent, v_owner, v_grow, 'Later tent', 'veg', true, 'Gorilla',
    'storage://diary-photos/' || v_photo, '2026-10-02T00:00:00Z'
  );

  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
  RESET role;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'a later tent photo must not earn First Tent';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'qualified', 'a later tent with a photo and brand earns Setup Documented';

  UPDATE public.tents
     SET photo_url = 'storage://diary-photos/' || v_photo,
         brand = 'AC Infinity'
   WHERE id = v_first_tent;

  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'qualified', 'a late photo on the first tent earns First Tent';
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'First Tent is awarded once';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'Setup Documented stays once the first qualifying tent remains';

  SELECT count(*) INTO v_count
  FROM public.badge_awards
  WHERE user_id = v_owner
    AND badge_key IN ('first_tent', 'setup_documented');
  ASSERT v_count = 2, 'one account earns each tent badge once';

  UPDATE public.tents
     SET photo_url = 'storage://diary-photos/' || v_stranger_photo
   WHERE id = v_first_tent;
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'hidden', 'another user photo must drop First Tent';
  UPDATE public.tents
     SET photo_url = 'storage://diary-photos/' || v_photo
   WHERE id = v_first_tent;
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'restored', 'returning the owned photo restores First Tent';

  RESET role;
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, photo_url, created_at)
  VALUES (
    v_name_only, v_stranger, v_grow, 'Name only', 'seedling', true,
    'storage://diary-photos/' || v_stranger_photo, '2026-10-03T00:00:00Z'
  );
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'name, stage, and light_on do not document a setup';
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'qualified', 'the stranger first tent with an owned photo earns First Tent';

  RESET role;
  INSERT INTO public.harvests (id, user_id, grow_id, grow_type, harvested_at)
  VALUES (v_bare_harvest, v_owner, v_grow, 'indoor', '2026-10-04T00:00:00Z');
  INSERT INTO public.harvests (id, user_id, grow_id, grow_type, harvested_at, yield_grams, photo_url)
  VALUES (
    v_harvest, v_owner, v_grow, 'indoor', '2026-10-05T00:00:00Z', 12.5,
    'storage://diary-photos/' || v_photo
  );

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'unchanged', 'the earliest harvest without a photo earns nothing';

  UPDATE public.harvests
     SET photo_url = 'storage://diary-photos/' || v_photo,
         yield_grams = NULL
   WHERE id = v_bare_harvest;
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'qualified', 'a late owned photo earns First Recorded Harvest without reading yield';
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'unchanged', 'First Recorded Harvest is awarded once';

  SELECT count(*) INTO v_count
  FROM public.badge_awards
  WHERE user_id = v_owner AND badge_key = 'first_recorded_harvest';
  ASSERT v_count = 1, 'harvest badge is once per account';

  RESET role;
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  RESET role;
END $$;

ROLLBACK;
