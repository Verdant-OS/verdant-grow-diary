-- Owner badge awards: permissions, kill switch, and First Diary Entry lifecycle.
-- Local or disposable database only. Rolls back every row it creates.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/badge_awards_permissions.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  fn oid;
  rls_enabled boolean;
  pol_count int;
  badge_triggers int;
BEGIN
  SELECT p.oid INTO fn
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'badge_awards_evaluate_owner'
    AND pg_get_function_identity_arguments(p.oid) = 'badge_key text';
  ASSERT fn IS NOT NULL, 'badge_awards_evaluate_owner(text) is missing';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = fn), 'evaluator must be SECURITY DEFINER';
  ASSERT (
    SELECT proconfig::text FROM pg_proc WHERE oid = fn
  ) LIKE '%search_path=public, pg_temp%', 'evaluator search_path must be public, pg_temp';

  ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'),
    'authenticated must be able to execute the evaluator';
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'),
    'anon must not execute the evaluator';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.badge_awards_owned_diary_photo_name(text, uuid)',
    'EXECUTE'
  ), 'photo helper must not be executable by authenticated';

  ASSERT has_table_privilege('authenticated', 'public.badge_awards', 'SELECT');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_awards', 'INSERT');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_awards', 'UPDATE');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_awards', 'DELETE');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_evidence', 'INSERT');
  ASSERT NOT has_table_privilege('anon', 'public.badge_awards', 'SELECT');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_award_runtime', 'SELECT');
  ASSERT NOT has_table_privilege('authenticated', 'public.badge_award_runtime', 'UPDATE');
  ASSERT has_table_privilege('service_role', 'public.badge_award_runtime', 'SELECT');
  ASSERT has_table_privilege('service_role', 'public.badge_award_runtime', 'UPDATE');
  ASSERT NOT has_table_privilege('service_role', 'public.badge_award_runtime', 'INSERT');
  ASSERT NOT has_table_privilege('service_role', 'public.badge_award_runtime', 'DELETE');
  ASSERT NOT has_table_privilege('service_role', 'public.badge_awards', 'INSERT');

  SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid = 'public.badge_awards'::regclass;
  ASSERT rls_enabled, 'RLS must be enabled on badge_awards';
  SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid = 'public.badge_evidence'::regclass;
  ASSERT rls_enabled, 'RLS must be enabled on badge_evidence';
  SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid = 'public.badge_award_runtime'::regclass;
  ASSERT rls_enabled, 'RLS must be enabled on badge_award_runtime';

  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('badge_awards', 'badge_evidence')
    AND cmd <> 'SELECT';
  ASSERT pol_count = 0, 'client write policies are not allowed on badge tables';

  SELECT count(*) INTO badge_triggers
  FROM pg_trigger AS tg
  JOIN pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
    AND tg.tgname ILIKE '%badge%'
    AND (
      (n.nspname = 'public' AND c.relname IN ('diary_entries', 'grows', 'tents'))
      OR (n.nspname = 'storage' AND c.relname = 'objects')
    );
  ASSERT badge_triggers = 0, 'badge triggers must not sit on diary, grow, tent, or storage rows';

  ASSERT (
    SELECT runtime.enabled FROM public.badge_award_runtime AS runtime WHERE runtime.id = 1
  ) IS FALSE, 'kill switch must default to false';

  RAISE NOTICE '✓ grants, RLS, default switch, and trigger fence';
END $$;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_grow uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid();
  v_earlier uuid := gen_random_uuid();
  v_photo text;
  v_result jsonb;
  v_count int;
  v_award uuid;
  v_recognized timestamptz;
  v_recognized_again timestamptz;
  v_hidden timestamptz;
  v_evidence_entry uuid;
  v_queue int;
  v_stamped timestamptz;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES
    (v_owner, 'badge-owner-' || v_owner::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_stranger, 'badge-stranger-' || v_stranger::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  INSERT INTO public.grows (id, user_id, name)
  VALUES (v_grow, v_owner, 'badge harness grow');

  v_photo := v_owner::text || '/diary/photo.jpg';
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('diary-photos', v_photo);

  INSERT INTO public.diary_entries (id, user_id, grow_id, note, photo_url, entry_at)
  VALUES (
    v_entry,
    v_owner,
    v_grow,
    'First real diary note',
    v_photo,
    '2026-10-01T12:00:00Z'
  );

  -- Stamp discards a caller-supplied recognition time, then remove the probe row.
  INSERT INTO public.badge_awards (user_id, badge_key, first_recognized_at)
  VALUES (v_owner, 'first_diary_entry', '2000-01-01T00:00:00Z')
  RETURNING first_recognized_at INTO v_stamped;
  ASSERT v_stamped > '2020-01-01T00:00:00Z', 'stamp trigger must replace a supplied timestamp';
  DELETE FROM public.badge_awards WHERE user_id = v_owner;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'disabled', format('switch off must return disabled, got %s', v_result);

  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'direct call with the switch off must not insert an award';
  SELECT count(*) INTO v_count FROM public.badge_evidence;
  ASSERT v_count = 0, 'direct call with the switch off must not insert evidence';

  DELETE FROM public.badge_award_runtime WHERE id = 1;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'disabled', 'missing runtime row must fail closed';
  RESET role;
  INSERT INTO public.badge_award_runtime (id, enabled) VALUES (1, false);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'missing runtime row must not insert an award';

  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
    RAISE EXCEPTION 'authenticated update of the kill switch should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    INSERT INTO public.badge_awards (user_id, badge_key)
    VALUES (v_owner, 'first_diary_entry');
    RAISE EXCEPTION 'authenticated insert into badge_awards should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET role;

  ASSERT (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS FALSE,
    'authenticated update must leave the switch off';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'failed client insert must leave no award';

  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
  RESET role;
  ASSERT (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS TRUE,
    'service_role must be able to turn the switch on';

  UPDATE public.diary_entries
     SET note = 'Photo attached from Quick Log.'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', format('placeholder note must not qualify, got %s', v_result);
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'placeholder note must not create an award';

  UPDATE public.diary_entries
     SET note = 'First real diary note',
         photo_url = 'https://example.invalid/not-a-storage-object.jpg'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'external URL must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'external URL must not create an award';

  UPDATE public.diary_entries
     SET photo_url = v_stranger::text || '/diary/photo.jpg'
   WHERE id = v_entry;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('diary-photos', v_stranger::text || '/diary/photo.jpg');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'another owner prefix must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'wrong prefix must not create an award';

  UPDATE public.diary_entries
     SET photo_url = v_owner::text || '/diary/missing.jpg'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'missing storage object must not qualify';
  RESET role;

  UPDATE public.diary_entries
     SET photo_url = 'https://example.invalid/legacy.jpg',
         details = jsonb_build_object('photo_url', 'storage://diary-photos/' || v_photo)
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'qualified', format('owned details photo should qualify, got %s', v_result);
  RESET role;

  SELECT id, first_recognized_at INTO v_award, v_recognized
  FROM public.badge_awards
  WHERE user_id = v_owner AND badge_key = 'first_diary_entry';
  ASSERT v_award IS NOT NULL, 'qualifying diary must create one award';
  ASSERT v_recognized > '2020-01-01T00:00:00Z', 'recognition time must be stamped by the server';
  SELECT count(*) INTO v_count FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_count = 1, 'qualifying diary must store one evidence row';
  ASSERT (
    SELECT photo_object_name FROM public.badge_evidence WHERE award_id = v_award
  ) = v_photo, 'evidence must store the object name, not the external URL';

  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('not_a_badge');
  ASSERT v_result->>'status' = 'not_in_slice', 'other badge keys must write nothing';
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', format('second call should be unchanged, got %s', v_result);
  ASSERT (v_result->>'award_id')::uuid = v_award, 'second call must keep the same award id';
  RESET role;
  SELECT first_recognized_at INTO v_recognized_again
  FROM public.badge_awards WHERE id = v_award;
  ASSERT v_recognized_again = v_recognized, 'reevaluation must keep the original recognition time';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 1, 'one owner has one first_diary_entry award';

  UPDATE public.badge_awards
     SET first_recognized_at = '1999-01-01T00:00:00Z'
   WHERE id = v_award;
  SELECT first_recognized_at INTO v_recognized_again FROM public.badge_awards WHERE id = v_award;
  ASSERT v_recognized_again = v_recognized, 'freeze trigger must keep the original recognition time';

  UPDATE public.grows SET is_archived = true WHERE id = v_grow;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'archiving the grow must not hide a still-qualifying diary';
  RESET role;
  ASSERT (SELECT hidden_at FROM public.badge_awards WHERE id = v_award) IS NULL,
    'archived grow must leave the award visible';
  UPDATE public.grows SET is_archived = false WHERE id = v_grow;

  UPDATE public.diary_entries SET note = 'First real diary note, edited' WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a still-qualifying note edit must not hide the award';
  RESET role;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('diary-photos', v_owner::text || '/diary/earlier.jpg');
  INSERT INTO public.diary_entries (id, user_id, grow_id, note, photo_url, entry_at)
  VALUES (
    v_earlier,
    v_owner,
    v_grow,
    'Earlier qualifying note',
    v_owner::text || '/diary/earlier.jpg',
    '2026-09-01T12:00:00Z'
  );
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'switching evidence must keep the same award';
  ASSERT (v_result->>'award_id')::uuid = v_award, 'evidence switch must not create a new award';
  RESET role;
  SELECT diary_entry_id INTO v_evidence_entry FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_evidence_entry = v_earlier, 'evidence must follow the earliest qualifying entry';
  ASSERT (SELECT evidence_changed_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL,
    'evidence switch must stamp evidence_changed_at';
  ASSERT (SELECT first_recognized_at FROM public.badge_awards WHERE id = v_award) = v_recognized,
    'evidence switch must keep the original recognition time';

  UPDATE public.diary_entries SET retracted_at = now() WHERE user_id = v_owner;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'hidden', format('losing every qualifying row should hide, got %s', v_result);
  RESET role;
  SELECT hidden_at INTO v_hidden FROM public.badge_awards WHERE id = v_award;
  ASSERT v_hidden IS NOT NULL, 'hidden award must keep its row';
  SELECT count(*) INTO v_count FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_count = 0, 'hiding must delete evidence paths';
  ASSERT (SELECT first_recognized_at FROM public.badge_awards WHERE id = v_award) = v_recognized,
    'hiding must keep the original recognition time';

  UPDATE public.diary_entries SET retracted_at = NULL WHERE id = v_earlier;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'restored', format('a new qualifying row should restore, got %s', v_result);
  ASSERT (v_result->>'award_id')::uuid = v_award, 'restore must keep the same award id';
  RESET role;
  ASSERT (SELECT hidden_at FROM public.badge_awards WHERE id = v_award) IS NULL, 'restore clears hidden_at';
  ASSERT (SELECT restored_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL, 'restore stamps restored_at';
  ASSERT (SELECT first_recognized_at FROM public.badge_awards WHERE id = v_award) = v_recognized,
    'restore must keep the original recognition time';

  SELECT count(*) INTO v_queue FROM public.action_queue WHERE user_id = v_owner;
  ASSERT v_queue = 0, 'evaluation must not write an action queue row';

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards;
  ASSERT v_count = 0, 'another account must not see this award';
  SELECT count(*) INTO v_count FROM public.badge_evidence;
  ASSERT v_count = 0, 'another account must not see this evidence';
  RESET role;

  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'disabled', 'turning the switch off must stop further evaluation writes';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 1, 'disabling the switch must not insert another award';

  RAISE NOTICE '✓ kill switch, qualification, lifecycle, and owner visibility';
END $$;

\echo 1..1
\echo ok 1 - badge awards permissions, kill switch, and owner visibility

ROLLBACK;
