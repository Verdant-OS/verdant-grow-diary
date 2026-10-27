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
  v_both uuid := gen_random_uuid();
  v_both_grow uuid := gen_random_uuid();
  v_both_tent uuid := gen_random_uuid();
  v_stolen uuid := gen_random_uuid();
  v_stolen_tent uuid := gen_random_uuid();
  v_harvest_event uuid := gen_random_uuid();
  v_unlinked_entry uuid := gen_random_uuid();
  v_linked_entry uuid := gen_random_uuid();
  v_hw uuid := gen_random_uuid();
  v_hw_grow uuid := gen_random_uuid();
  v_hw_tent uuid := gen_random_uuid();
  v_hw_photo text;
  v_photo text;
  v_both_photo text;
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
    (v_stranger, 'badge-tent-stranger-' || v_stranger::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_both, 'badge-tent-both-' || v_both::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_stolen, 'badge-tent-stolen-' || v_stolen::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.grows (id, user_id, name)
  VALUES
    (v_grow, v_owner, 'badge tent harness'),
    (v_both_grow, v_both, 'both badges grow');
  RESET role;

  v_photo := v_owner::text || '/tents/owned.jpg';
  v_stranger_photo := v_stranger::text || '/tents/other.jpg';
  v_both_photo := v_both::text || '/tents/both.jpg';
  INSERT INTO storage.objects (bucket_id, name)
  VALUES
    ('diary-photos', v_photo),
    ('diary-photos', v_stranger_photo),
    ('diary-photos', v_both_photo);

  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, created_at)
  VALUES (
    v_first_tent, v_owner, v_grow, 'First tent', 'seedling', true, '2026-10-01T00:00:00Z'
  );
  RESET role;
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.tents (
    id, user_id, grow_id, name, stage, light_on, brand, photo_url, created_at
  ) VALUES (
    v_later_tent, v_owner, v_grow, 'Later tent', 'veg', true, 'Gorilla',
    'storage://diary-photos/' || v_photo, '2026-10-02T00:00:00Z'
  );
  RESET role;

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
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.tents (id, user_id, grow_id, name, stage, light_on, photo_url, created_at)
  VALUES (
    v_name_only, v_stranger, v_grow, 'Name only', 'seedling', true,
    'storage://diary-photos/' || v_stranger_photo, '2026-10-03T00:00:00Z'
  );
  RESET role;
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
  ASSERT (
    SELECT yield_grams FROM public.harvests WHERE id = v_harvest
  ) = 12.5, 'the later harvest yield stays unread';
  ASSERT position(
    'yield_grams' in pg_get_functiondef('public.badge_awards_evaluate_photo_subject(text,uuid)'::regprocedure)
  ) = 0, 'the photo-subject evaluator must not mention yield';

  RESET role;
  -- One save: a single tent row with an owned photo and a brand earns both tent badges.
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.tents (
    id, user_id, grow_id, name, stage, light_on, brand, photo_url, created_at
  ) VALUES (
    v_both_tent, v_both, v_both_grow, 'Both badges', 'flower', true, 'Gorilla',
    'storage://diary-photos/' || v_both_photo, '2026-10-06T00:00:00Z'
  );
  RESET role;
  -- An anonymous session is refused before the photo-subject evaluator runs,
  -- even when its tent would qualify (#1979 aadcd1f6e, carried onto this stack).
  PERFORM set_config('request.jwt.claim.sub', v_both::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_both, 'is_anonymous', true)::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'not_authenticated',
    'an anonymous session must not earn First Tent';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_both;
  ASSERT v_count = 0, 'an anonymous session writes no award';
  RESET role;

  PERFORM set_config('request.jwt.claim.sub', v_both::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_both)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'qualified', 'one saved tent photo earns First Tent';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'qualified', 'the same saved tent earns Setup Documented';
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'First Tent from that save is once only';
  SELECT count(*) INTO v_count
  FROM public.badge_awards
  WHERE user_id = v_both
    AND badge_key IN ('first_tent', 'setup_documented');
  ASSERT v_count = 2, 'one save earns both tent badges once';

  RESET role;
  -- Another user's photo, with no owned photo, earns nothing and writes nothing.
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.tents (
    id, user_id, grow_id, name, stage, light_on, photo_url, created_at
  ) VALUES (
    v_stolen_tent, v_stolen, v_both_grow, 'Stolen photo', 'veg', true,
    'storage://diary-photos/' || v_both_photo, '2026-10-07T00:00:00Z'
  );
  RESET role;
  PERFORM set_config('request.jwt.claim.sub', v_stolen::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stolen)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'unchanged', 'another user photo earns nothing';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'another user photo does not document a setup';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_stolen;
  ASSERT v_count = 0, 'another user photo writes no award';

  RESET role;
  -- A Quick Log harvest event earns First Recorded Harvest only through the
  -- owned, unretracted diary photo attached to that exact event id.
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.grow_events (id, user_id, grow_id, event_type, occurred_at, source)
  VALUES (v_harvest_event, v_both, v_both_grow, 'harvest', '2026-10-08T00:00:00Z', 'manual');
  INSERT INTO public.diary_entries (id, user_id, grow_id, note, photo_url, entry_at, details)
  VALUES (
    v_unlinked_entry, v_both, v_both_grow, 'unlinked', v_both_photo, '2026-10-08T00:00:01Z',
    jsonb_build_object(
      'event_type', 'quicklog_photo_attachment',
      'source', 'manual',
      'attached_to_action', 'harvest'
    )
  );
  INSERT INTO public.diary_entries (
    id, user_id, grow_id, note, photo_url, entry_at, details, retracted_at
  ) VALUES (
    v_linked_entry, v_both, v_both_grow, 'linked', v_both_photo, '2026-10-08T00:00:02Z',
    jsonb_build_object(
      'event_type', 'quicklog_photo_attachment',
      'source', 'manual',
      'attached_to_action', 'harvest',
      'grow_event_id', v_harvest_event::text
    ),
    '2026-10-09T00:00:00Z'
  );
  RESET role;
  PERFORM set_config('request.jwt.claim.sub', v_both::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_both)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'unchanged',
    'a harvest photo not linked to the event, or retracted, earns nothing';

  RESET role;
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.diary_entries SET retracted_at = NULL WHERE id = v_linked_entry;
  RESET role;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'qualified',
    'an owned photo linked to the Quick Log harvest event earns First Recorded Harvest';
  RESET role;
  ASSERT (
    SELECT evidence.harvest_id
    FROM public.badge_evidence AS evidence
    JOIN public.badge_awards AS award ON award.id = evidence.award_id
    WHERE award.user_id = v_both AND award.badge_key = 'first_recorded_harvest'
    ORDER BY evidence.created_at DESC
    LIMIT 1
  ) = v_harvest_event, 'the evidence names the harvest event';

  RESET role;
  -- Hardware config documents a setup only as a non-empty JSON object.
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES (
    v_hw, 'badge-tent-hw-' || v_hw::text || '@verdant.test', crypt('harness-password', gen_salt('bf')),
    now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
  );
  v_hw_photo := v_hw::text || '/tents/hw.jpg';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('diary-photos', v_hw_photo);
  -- Fixture insert: service_role is the only free-cap fixture bypass
  -- (enforce_free_creation_caps keeps bare postgres sessions cap-checked).
  PERFORM set_config('role', 'service_role', true);
  INSERT INTO public.grows (id, user_id, name) VALUES (v_hw_grow, v_hw, 'hardware grow');
  INSERT INTO public.tents (
    id, user_id, grow_id, name, stage, light_on, hardware_config, photo_url, created_at
  ) VALUES (
    v_hw_tent, v_hw, v_hw_grow, 'Array hardware', 'veg', true, '[]'::jsonb,
    'storage://diary-photos/' || v_hw_photo, '2026-10-09T00:00:00Z'
  );
  RESET role;
  PERFORM set_config('request.jwt.claim.sub', v_hw::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_hw)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'an empty array does not document hardware';
  RESET role;
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.tents SET hardware_config = 'false'::jsonb WHERE id = v_hw_tent;
  RESET role;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'a scalar does not document hardware';
  RESET role;
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.tents SET hardware_config = '{"fan": "6in"}'::jsonb WHERE id = v_hw_tent;
  RESET role;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'qualified', 'a non-empty hardware object documents a setup';

  RESET role;
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  RESET role;
END $$;

ROLLBACK;
