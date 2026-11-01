-- Owner badge awards: permissions, kill switch, and First Diary Entry lifecycle.
-- The first plan rolls back every row it creates. The two-session plan
-- (ok 2) commits, so it runs only on a disposable local database named
-- badge_pgtap_<12 hex>. It refuses dbname=postgres and any public host.
-- The committing case also requires a runner-issued token: the session GUC
-- badge_pgtap.token must equal the database comment. A 172.16/12 address is
-- accepted only after that token matches. The database must contain no rows
-- in auth.users, diary_entries, or badge_awards before the fixture writes.
-- scripts/run-badge-pgtap-disposable.sh creates that database, loads the
-- migrated schema, sets the token, runs this file, and always drops it.
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
  ASSERT NOT has_table_privilege('anon', 'public.badge_evidence', 'SELECT'),
    'anon must not read evidence photos';
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
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'badge_awards'
      AND policyname = 'badge_awards_member_select'
  ), 'cross-account member select must not exist';

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

  ASSERT has_function_privilege('service_role', 'public.badge_awards_reconcile()', 'EXECUTE'),
    'service_role must be able to run the reconcile sweep';
  ASSERT NOT has_function_privilege('authenticated', 'public.badge_awards_reconcile()', 'EXECUTE'),
    'authenticated must not run the reconcile sweep';
  ASSERT NOT has_function_privilege('anon', 'public.badge_awards_reconcile()', 'EXECUTE'),
    'anon must not run the reconcile sweep';
  IF to_regclass('cron.job') IS NOT NULL THEN
    ASSERT (
      SELECT job.active
      FROM cron.job AS job
      WHERE job.jobname = 'badge-awards-reconcile'
    ) IS FALSE, 'the reconcile schedule must stay inactive';
  END IF;

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
  v_other_grow uuid := gen_random_uuid();
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
  v_shape uuid;
  v_switch_at timestamptz;
  v_batch_user uuid;
  v_batch_grow uuid;
  v_batch_n int;
  v_batch_first int;
  v_batch_second int;
  v_cursor_max uuid;
  v_fail_owner uuid;
  v_next_owner uuid;
  v_fail_grow uuid;
  v_next_grow uuid;
  v_anon_owner uuid;
  v_real_owner uuid;
  v_anon_grow uuid;
  v_real_grow uuid;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES
    (v_owner, 'badge-owner-' || v_owner::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_stranger, 'badge-stranger-' || v_stranger::text || '@verdant.test', crypt('harness-password', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  INSERT INTO public.grows (id, user_id, name)
  VALUES
    (v_grow, v_owner, 'badge harness grow'),
    (v_other_grow, v_stranger, 'someone else grow');

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

  PERFORM set_config('role', 'service_role', true);
  v_count := public.badge_awards_reconcile();
  RESET role;
  ASSERT v_count = 0, 'reconcile must write nothing while the switch is off';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'a disabled reconcile must not insert an award';

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

  SELECT updated_at INTO v_switch_at FROM public.badge_award_runtime WHERE id = 1;
  PERFORM pg_sleep(0.01);
  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
  RESET role;
  ASSERT (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS TRUE,
    'service_role must be able to turn the switch on';
  ASSERT (SELECT updated_at FROM public.badge_award_runtime WHERE id = 1) > v_switch_at,
    'turning the switch on must move updated_at';

  UPDATE public.diary_entries
     SET note = 'First real diary note',
         photo_url = NULL,
         details = '{}'::jsonb
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a text-only entry must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'a text-only entry must not create an award';

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
     SET photo_url = v_owner::text || '/../' || v_stranger::text || '/x.jpg'
   WHERE id = v_entry;
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('diary-photos', v_owner::text || '/../' || v_stranger::text || '/x.jpg');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a parent-directory segment must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'a parent-directory segment must not create an award';

  UPDATE public.diary_entries
     SET grow_id = v_other_grow,
         note = 'First real diary note',
         photo_url = v_photo,
         details = '{}'::jsonb
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a grow owned by someone else must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'someone else grow must not create an award';
  UPDATE public.diary_entries SET grow_id = v_grow WHERE id = v_entry;

  UPDATE storage.objects
     SET owner = v_stranger,
         owner_id = v_stranger::text
   WHERE bucket_id = 'diary-photos'
     AND name = v_photo;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a stored photo owned by someone else must not qualify';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'someone else photo owner must not create an award';
  UPDATE storage.objects
     SET owner = v_owner,
         owner_id = v_owner::text
   WHERE bucket_id = 'diary-photos'
     AND name = v_photo;

  UPDATE public.diary_entries
     SET photo_url = v_owner::text || '/diary/missing.jpg'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'missing storage object must not qualify';
  RESET role;

  -- Late attachment. v_entry was evaluated above with no photo and created
  -- no award. Writing an owned photo onto that same row and evaluating
  -- again reads the current photo.
  UPDATE public.diary_entries
     SET note = '',
         photo_url = 'https://example.invalid/legacy.jpg',
         details = jsonb_build_object('photo_url', 'storage://diary-photos/' || v_photo)
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'qualified',
    format('a photo added later to the text-only first entry should qualify, got %s', v_result);
  RESET role;
  ASSERT (SELECT note FROM public.diary_entries WHERE id = v_entry) = '',
    'the earning entry keeps an empty note';

  SELECT id, first_recognized_at INTO v_award, v_recognized
  FROM public.badge_awards
  WHERE user_id = v_owner AND badge_key = 'first_diary_entry';
  ASSERT v_award IS NOT NULL, 'qualifying diary must create one award';
  ASSERT v_recognized > '2020-01-01T00:00:00Z', 'recognition time must be stamped by the server';
  SELECT count(*) INTO v_count FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_count = 1, 'qualifying diary must store one evidence row';
  ASSERT (
    SELECT diary_entry_id FROM public.badge_evidence WHERE award_id = v_award
  ) = v_entry, 'a photo added later to the text-only first diary entry is the evidence';

  UPDATE public.diary_entries
     SET note = 'Photo attached from Quick Log.'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', format('the stock Quick Log note must keep the one award, got %s', v_result);
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner AND badge_key = 'first_diary_entry';
  ASSERT v_count = 1, 'the stock Quick Log note must not create a second award';

  PERFORM set_config('role', 'service_role', true);
  v_count := public.badge_awards_reconcile();
  RESET role;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  ASSERT v_count > 0, 'reconcile must visit the owner while the switch is on';
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 1, 'reconcile must not insert a second award';
  ASSERT (
    SELECT photo_object_name FROM public.badge_evidence WHERE award_id = v_award
  ) = v_photo, 'evidence must store the object name, not the external URL';

  INSERT INTO public.badge_awards (user_id, badge_key)
  VALUES (v_owner, 'first_tent')
  RETURNING id INTO v_shape;
  INSERT INTO public.badge_evidence (award_id, subject_kind, tent_id)
  VALUES (v_shape, 'tent', gen_random_uuid());
  BEGIN
    UPDATE public.badge_evidence
       SET subject_kind = 'not_a_subject'
     WHERE award_id = v_shape;
    RAISE EXCEPTION 'an unknown evidence subject should have failed';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
  BEGIN
    UPDATE public.badge_evidence
       SET subject_kind = 'diary_entry',
           diary_entry_id = NULL,
           photo_object_name = NULL
     WHERE award_id = v_shape;
    RAISE EXCEPTION 'a diary evidence row without a photo should have failed';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
  DELETE FROM public.badge_awards WHERE id = v_shape;
  ASSERT (
    SELECT photo_object_name FROM public.badge_evidence WHERE award_id = v_award
  ) = v_photo, 'the shape probe must leave the diary evidence in place';

  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('not_a_badge');
  ASSERT v_result->>'status' = 'not_in_slice', 'other badge keys must write nothing';
  v_result := public.badge_awards_evaluate_owner('first_tent');
  ASSERT v_result->>'status' = 'not_in_slice', 'first_tent must stay outside this slice';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'not_in_slice', 'setup_documented must stay outside this slice';
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'not_in_slice', 'first_recorded_harvest must stay outside this slice';
  SELECT count(*) INTO v_count
  FROM public.badge_awards
  WHERE user_id = v_owner AND badge_key <> 'first_diary_entry';
  ASSERT v_count = 0, 'later badge keys must not be awarded by the evaluator';
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
    'is_archived grow must leave the award visible';
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
  ASSERT v_result->>'status' = 'unchanged', 'an older qualifying entry must keep the same award';
  ASSERT (v_result->>'award_id')::uuid = v_award, 'keeping evidence must not create a new award';
  RESET role;
  SELECT diary_entry_id INTO v_evidence_entry FROM public.badge_evidence WHERE award_id = v_award;
  ASSERT v_evidence_entry = v_entry, 'evidence must stay on the current entry while it still qualifies';
  ASSERT (SELECT evidence_changed_at FROM public.badge_awards WHERE id = v_award) IS NULL,
    'keeping the same evidence must not stamp evidence_changed_at';
  ASSERT (SELECT first_recognized_at FROM public.badge_awards WHERE id = v_award) = v_recognized,
    'keeping evidence must keep the original recognition time';

  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES ('diary-photos', v_owner::text || '/diary/replacement.jpg', v_owner, v_owner::text);
  UPDATE public.diary_entries
     SET photo_url = v_owner::text || '/diary/replacement.jpg'
   WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'a new photo on the current entry must keep the award';
  RESET role;
  ASSERT (
    SELECT diary_entry_id FROM public.badge_evidence WHERE award_id = v_award
  ) = v_entry, 'a photo change must stay on the current entry';
  ASSERT (
    SELECT photo_object_name FROM public.badge_evidence WHERE award_id = v_award
  ) = v_owner::text || '/diary/replacement.jpg',
    'a photo change must store the new object name';
  ASSERT (SELECT evidence_changed_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL,
    'a photo change must stamp evidence_changed_at';

  UPDATE public.diary_entries SET retracted_at = now() WHERE id = v_entry;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'falling back to another entry must keep the same award';
  RESET role;
  ASSERT (
    SELECT diary_entry_id FROM public.badge_evidence WHERE award_id = v_award
  ) = v_earlier, 'evidence must move to the earliest remaining qualifying entry';

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

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'diary-photos'
     AND name = v_owner::text || '/diary/earlier.jpg';
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'hidden', format('a hard-deleted photo should hide, got %s', v_result);
  RESET role;
  ASSERT (SELECT count(*) FROM public.badge_evidence WHERE award_id = v_award) = 0,
    'a hard-deleted photo must remove evidence';

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('diary-photos', v_owner::text || '/diary/earlier.jpg');
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'restored', format('putting the photo back should restore, got %s', v_result);
  RESET role;

  DELETE FROM public.diary_entries WHERE id = v_earlier;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'hidden', format('a hard-deleted entry should hide, got %s', v_result);
  RESET role;
  ASSERT (SELECT count(*) FROM public.badge_evidence WHERE award_id = v_award) = 0,
    'a hard-deleted entry must remove evidence';

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
  ASSERT v_result->>'status' = 'restored', format('reinserting the entry should restore, got %s', v_result);
  RESET role;

  SELECT count(*) INTO v_queue FROM public.action_queue WHERE user_id = v_owner;
  ASSERT v_queue = 0, 'evaluation must not write an action queue row';

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards;
  ASSERT v_count = 0, format('another signed-in account must see 0 awards, got %s', v_count);
  SELECT count(*) INTO v_count FROM public.badge_evidence;
  ASSERT v_count = 0, 'another account must not see this evidence';
  RESET role;

  -- Member-read additions. The assertion above is the active award.
  -- These checks put hidden_at and revoked_at back before the switch tests.
  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('role', 'anon', true);
  v_count := -1;
  BEGIN
    SELECT count(*) INTO v_count FROM public.badge_awards;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_count := 0;
  END;
  ASSERT v_count = 0, format('anon must see 0 awards, got %s', v_count);
  v_count := -1;
  BEGIN
    SELECT count(*) INTO v_count FROM public.badge_evidence;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_count := 0;
  END;
  ASSERT v_count = 0, format('anon must see 0 evidence rows, got %s', v_count);
  RESET role;

  UPDATE public.badge_awards
     SET hidden_at = clock_timestamp()
   WHERE id = v_award;
  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE id = v_award;
  ASSERT v_count = 0, 'a signed-in member must not see a hidden award';
  RESET role;
  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE id = v_award;
  ASSERT v_count = 1, 'the owner must still see a hidden award';
  RESET role;
  UPDATE public.badge_awards SET hidden_at = NULL WHERE id = v_award;

  UPDATE public.badge_awards
     SET revoked_at = clock_timestamp()
   WHERE id = v_award;
  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE id = v_award;
  ASSERT v_count = 0, 'a signed-in member must not see a revoked award';
  RESET role;
  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE id = v_award;
  ASSERT v_count = 1, 'the owner must still see a revoked award';
  RESET role;
  UPDATE public.badge_awards SET revoked_at = NULL WHERE id = v_award;

  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger, 'is_anonymous', true)::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards;
  ASSERT v_count = 0, format('an anonymous JWT must see 0 awards, got %s', v_count);
  RESET role;

  PERFORM set_config('request.jwt.claim', '', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'is_anonymous', true)::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count FROM public.badge_awards;
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  RESET role;
  ASSERT v_count = 0
    AND COALESCE(v_result->>'status', '') = 'not_authenticated'
    AND (SELECT count(*) FROM public.badge_awards WHERE user_id = v_owner) = 1,
    format(
      'anonymous owner JWT must see 0 awards, return not_authenticated, and add no row; visible %s, status %s, rows %s',
      v_count,
      v_result->>'status',
      (SELECT count(*) FROM public.badge_awards WHERE user_id = v_owner)
    );

  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'disabled', 'turning the switch off must stop further evaluation writes';
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 1, 'disabling the switch must not insert another award';

  UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.badge_awards
       SET revoked_at = clock_timestamp()
     WHERE id = v_award;
    RAISE EXCEPTION 'authenticated must not set revoked_at';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  RESET role;
  ASSERT (SELECT revoked_at FROM public.badge_awards WHERE id = v_award) IS NULL,
    'a failed client revoke must leave revoked_at null';

  PERFORM set_config('role', 'service_role', true);
  UPDATE public.badge_awards
     SET revoked_at = clock_timestamp()
   WHERE id = v_award;
  RESET role;
  ASSERT (SELECT revoked_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL,
    'service_role must be able to set revoked_at';

  UPDATE public.diary_entries SET retracted_at = now() WHERE user_id = v_owner;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 'revocation must ignore a diary that no longer qualifies';
  RESET role;
  ASSERT (SELECT hidden_at FROM public.badge_awards WHERE id = v_award) IS NULL,
    'revocation must not be rewritten into a hide';
  UPDATE public.diary_entries SET retracted_at = NULL WHERE user_id = v_owner;
  PERFORM set_config('role', 'authenticated', true);
  v_result := public.badge_awards_evaluate_owner('first_diary_entry');
  ASSERT v_result->>'status' = 'unchanged', 're-evaluation must not restore a revoked badge';
  RESET role;
  ASSERT (SELECT revoked_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL,
    're-evaluation must keep revoked_at';
  ASSERT (SELECT restored_at FROM public.badge_awards WHERE id = v_award) IS NOT NULL,
    're-evaluation must not clear an earlier restore stamp';

  RESET role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  UPDATE public.badge_award_runtime SET reconcile_after = NULL WHERE id = 1;
  FOR v_batch_n IN 1..26 LOOP
    v_batch_user := gen_random_uuid();
    v_batch_grow := gen_random_uuid();
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, aud, role
    ) VALUES (
      v_batch_user,
      'badge-batch-' || v_batch_user::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
    );
    INSERT INTO public.grows (id, user_id, name)
    VALUES (v_batch_grow, v_batch_user, 'badge batch grow');
    INSERT INTO public.diary_entries (user_id, grow_id, note, entry_at)
    VALUES (v_batch_user, v_batch_grow, '', now());
  END LOOP;
  PERFORM set_config('role', 'service_role', true);
  v_batch_first := public.badge_awards_reconcile();
  ASSERT (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1) IS NOT NULL,
    'a full batch must store the cursor';
  v_batch_second := public.badge_awards_reconcile();
  RESET role;
  ASSERT v_batch_first = 25, format('one reconcile call must visit one batch of 25, got %s', v_batch_first);
  ASSERT v_batch_second >= 1 AND v_batch_second <= 25,
    format('the next reconcile call must visit a later batch, got %s', v_batch_second);

  -- One owner raises during reconcile. The cursor still moves, and the next
  -- owner still receives an award.
  SELECT owners.user_id
    INTO v_cursor_max
  FROM (
    SELECT entry.user_id
    FROM public.diary_entries AS entry
    WHERE entry.user_id IS NOT NULL
    UNION
    SELECT award.user_id
    FROM public.badge_awards AS award
  ) AS owners
  ORDER BY owners.user_id DESC
  LIMIT 1;
  -- Fixed high UUIDs. A version-4 id has 4 in the version nibble, so these
  -- sort after every v4 and the draw cannot miss.
  v_fail_owner := 'ffffffff-ffff-ffff-ffff-fffffffffffe';
  v_next_owner := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  ASSERT v_cursor_max IS NULL OR (v_fail_owner > v_cursor_max AND v_next_owner > v_cursor_max),
    format(
      'fixed owners must sort after the reconcile cursor %, got % and %',
      v_cursor_max, v_fail_owner, v_next_owner
    );
  ASSERT v_fail_owner < v_next_owner, 'the failing owner must sort before the next owner';
  UPDATE public.badge_award_runtime
     SET reconcile_after = v_cursor_max
   WHERE id = 1;

  CREATE TEMP TABLE badge_reconcile_skip (user_id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO badge_reconcile_skip (user_id) VALUES (v_fail_owner);
  EXECUTE $failfn$
    CREATE OR REPLACE FUNCTION public.badge_reconcile_fail_owner()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_temp.badge_reconcile_skip AS skip
        WHERE skip.user_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'forced owner reconcile error';
      END IF;
      RETURN NEW;
    END;
    $fn$;
  $failfn$;
  CREATE TRIGGER badge_reconcile_fail_owner
    BEFORE INSERT ON public.badge_awards
    FOR EACH ROW
    EXECUTE FUNCTION public.badge_reconcile_fail_owner();

  v_fail_grow := gen_random_uuid();
  v_next_grow := gen_random_uuid();
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role
  ) VALUES
    (
      v_fail_owner,
      'badge-reconcile-' || v_fail_owner::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
    ),
    (
      v_next_owner,
      'badge-reconcile-' || v_next_owner::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
    );
  INSERT INTO public.grows (id, user_id, name) VALUES
    (v_fail_grow, v_fail_owner, 'badge reconcile grow'),
    (v_next_grow, v_next_owner, 'badge reconcile grow');
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
    (
      'diary-photos',
      v_fail_owner::text || '/diary/skip.jpg',
      v_fail_owner,
      v_fail_owner::text
    ),
    (
      'diary-photos',
      v_next_owner::text || '/diary/next.jpg',
      v_next_owner,
      v_next_owner::text
    );
  INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at) VALUES
    (v_fail_owner, v_fail_grow, '', v_fail_owner::text || '/diary/skip.jpg', now()),
    (v_next_owner, v_next_grow, '', v_next_owner::text || '/diary/next.jpg', now());

  PERFORM set_config('role', 'service_role', true);
  v_batch_first := public.badge_awards_reconcile();
  RESET role;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_fail_owner;
  ASSERT v_count = 0, format('a reconcile error must skip that owner, got %s', v_count);
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_next_owner;
  ASSERT v_count = 1, format('the next owner must still reconcile, got %s', v_count);
  ASSERT v_batch_first = 1, format('reconcile must count the successful owner only, got %s', v_batch_first);

  DROP TRIGGER badge_reconcile_fail_owner ON public.badge_awards;
  DROP FUNCTION public.badge_reconcile_fail_owner();
  DELETE FROM auth.users WHERE id IN (v_fail_owner, v_next_owner);

  -- The cursor stores the last owner visited, not the last success. Twenty-five
  -- owners sit past the current max. The last one raises. A function that
  -- advanced the cursor by successes would store owner 24.
  SELECT owners.user_id
    INTO v_cursor_max
  FROM (
    SELECT entry.user_id
    FROM public.diary_entries AS entry
    WHERE entry.user_id IS NOT NULL
    UNION
    SELECT award.user_id
    FROM public.badge_awards AS award
  ) AS owners
  ORDER BY owners.user_id DESC
  LIMIT 1;
  UPDATE public.badge_award_runtime
     SET reconcile_after = v_cursor_max
   WHERE id = 1;
  v_fail_owner := ('ffffffff-ffff-ffff-ffff-' || lpad(to_hex(25), 12, '0'))::uuid;
  INSERT INTO badge_reconcile_skip (user_id) VALUES (v_fail_owner);
  EXECUTE $failfn$
    CREATE OR REPLACE FUNCTION public.badge_reconcile_fail_owner()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_temp.badge_reconcile_skip AS skip
        WHERE skip.user_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'forced owner reconcile error';
      END IF;
      RETURN NEW;
    END;
    $fn$;
  $failfn$;
  CREATE TRIGGER badge_reconcile_fail_owner
    BEFORE INSERT ON public.badge_awards
    FOR EACH ROW
    EXECUTE FUNCTION public.badge_reconcile_fail_owner();
  FOR v_batch_n IN 1..25 LOOP
    v_batch_user := ('ffffffff-ffff-ffff-ffff-' || lpad(to_hex(v_batch_n), 12, '0'))::uuid;
    v_batch_grow := gen_random_uuid();
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, aud, role
    ) VALUES (
      v_batch_user,
      'badge-cursor-' || v_batch_user::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
    );
    INSERT INTO public.grows (id, user_id, name)
    VALUES (v_batch_grow, v_batch_user, 'badge cursor grow');
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES (
      'diary-photos',
      v_batch_user::text || '/diary/cursor.jpg',
      v_batch_user,
      v_batch_user::text
    );
    INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at)
    VALUES (
      v_batch_user,
      v_batch_grow,
      '',
      v_batch_user::text || '/diary/cursor.jpg',
      now()
    );
  END LOOP;
  PERFORM set_config('role', 'service_role', true);
  v_batch_first := public.badge_awards_reconcile();
  RESET role;
  ASSERT v_batch_first = 24,
    format('reconcile must return successes while visiting 25 owners, got %s', v_batch_first);
  ASSERT (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1) = v_fail_owner,
    format(
      'reconcile_after must be the last owner visited, got %s',
      (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1)
    );
  DROP TRIGGER badge_reconcile_fail_owner ON public.badge_awards;
  DROP FUNCTION public.badge_reconcile_fail_owner();
  DELETE FROM auth.users WHERE email LIKE 'badge-cursor-%@verdant.test';

  DELETE FROM auth.users WHERE id = v_owner;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'deleting the account must cascade the award';
  SELECT count(*) INTO v_count FROM public.badge_evidence;
  ASSERT v_count = 0, 'deleting the account must cascade the evidence';
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;

  -- Anonymous reconcile. A qualifying anonymous owner is skipped. A
  -- non-anonymous owner after the same cursor still receives the award.
  -- Drop any leftover reconcile fixtures first: their ids sort above this pair.
  DELETE FROM auth.users WHERE email LIKE 'badge-reconcile-%@verdant.test';
  SELECT max(id) INTO v_cursor_max FROM auth.users;
  v_anon_owner := 'ffffffff-ffff-ffff-ffff-ffffffff0001';
  v_real_owner := 'ffffffff-ffff-ffff-ffff-ffffffff0002';
  v_anon_grow := gen_random_uuid();
  v_real_grow := gen_random_uuid();
  ASSERT v_cursor_max IS NULL OR v_anon_owner > v_cursor_max,
    'anonymous fixture must sort after the existing owners';
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, is_anonymous
  ) VALUES
    (
      v_anon_owner,
      'badge-anon-' || v_anon_owner::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated',
      true
    ),
    (
      v_real_owner,
      'badge-real-' || v_real_owner::text || '@verdant.test',
      crypt('harness-password', gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated',
      false
    );
  INSERT INTO public.grows (id, user_id, name)
  VALUES
    (v_anon_grow, v_anon_owner, 'anonymous badge grow'),
    (v_real_grow, v_real_owner, 'named badge grow');
  INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
  VALUES
    ('diary-photos', v_anon_owner::text || '/diary/anon.jpg', v_anon_owner, v_anon_owner::text),
    ('diary-photos', v_real_owner::text || '/diary/real.jpg', v_real_owner, v_real_owner::text);
  INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at)
  VALUES
    (v_anon_owner, v_anon_grow, '', v_anon_owner::text || '/diary/anon.jpg', now()),
    (v_real_owner, v_real_grow, '', v_real_owner::text || '/diary/real.jpg', now());
  UPDATE public.badge_award_runtime
     SET enabled = true, reconcile_after = v_cursor_max
   WHERE id = 1;
  PERFORM set_config('role', 'service_role', true);
  v_count := public.badge_awards_reconcile();
  RESET role;
  ASSERT v_count = 1, format('reconcile must visit the named owner only, got %s', v_count);
  ASSERT (SELECT count(*) FROM public.badge_awards WHERE user_id = v_anon_owner) = 0,
    'anonymous reconcile must not award an anonymous owner';
  ASSERT (SELECT count(*) FROM public.badge_awards WHERE user_id = v_real_owner) = 1,
    'anonymous reconcile must still award the named owner';
  DELETE FROM storage.objects
   WHERE bucket_id = 'diary-photos'
     AND name IN (
       v_anon_owner::text || '/diary/anon.jpg',
       v_real_owner::text || '/diary/real.jpg'
     );
  DELETE FROM auth.users WHERE id IN (v_anon_owner, v_real_owner);
  UPDATE public.badge_award_runtime
     SET enabled = false, reconcile_after = NULL
   WHERE id = 1;

  RAISE NOTICE '✓ kill switch, qualification, lifecycle, and owner visibility';
END $$;

\echo 1..2
\echo ok 1 - badge awards permissions, kill switch, and owner visibility

ROLLBACK;

-- Petal test 23: two sessions evaluate the same owner at once.
-- The fixture commits, so this plan runs only when the connected database
-- is a disposable local database named badge_pgtap_<12 hex>. dbname=postgres
-- skips this plan and commits nothing. The runner token is the primary
-- fence: badge_pgtap.token must equal the database comment before any write.
-- A loopback or 172.16/12 TCP address is accepted only after that token matches.
-- A connection without a server address or port is refused before any fixture commits.
-- The database must be empty of users, diary entries, and awards. Session-2
-- cleanup commits through dblink so a later RAISE cannot roll it back.
SELECT CASE
  WHEN current_database() ~ '^badge_pgtap_[0-9a-f]{12}$'
   AND current_database() <> 'postgres'
  THEN 1
  ELSE 0
END AS badge_pgtap_disposable
\gset

\if :badge_pgtap_disposable
DO $$
DECLARE
  v_token text := NULLIF(btrim(current_setting('badge_pgtap.token', true)), '');
  v_comment text;
  v_users bigint;
  v_entries bigint;
  v_awards bigint;
BEGIN
  IF current_database() !~ '^badge_pgtap_[0-9a-f]{12}$'
     OR current_database() = 'postgres' THEN
    RAISE EXCEPTION 'two-session test refuses database %', current_database();
  END IF;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'two-session test refuses a missing token';
  END IF;
  SELECT shobj_description(d.oid, 'pg_database')
    INTO v_comment
  FROM pg_database AS d
  WHERE d.datname = current_database();
  IF v_comment IS DISTINCT FROM v_token THEN
    RAISE EXCEPTION 'two-session test refuses a token that does not match the database comment';
  END IF;
  IF inet_server_addr() IS NULL OR inet_server_port() IS NULL THEN
    RAISE EXCEPTION 'two-session test refuses a connection without a loopback host and port';
  END IF;
  IF host(inet_server_addr()) NOT IN ('127.0.0.1', '::1', 'localhost')
     AND NOT (
       host(inet_server_addr())::inet << '172.16.0.0/12'::inet
       AND inet_client_addr() IS NOT NULL
       AND host(inet_client_addr())::inet << '172.16.0.0/12'::inet
     ) THEN
    RAISE EXCEPTION 'two-session test refuses host %', host(inet_server_addr());
  END IF;
  SELECT count(*) INTO v_users FROM auth.users;
  SELECT count(*) INTO v_entries FROM public.diary_entries;
  SELECT count(*) INTO v_awards FROM public.badge_awards;
  IF v_users <> 0 OR v_entries <> 0 OR v_awards <> 0 THEN
    RAISE EXCEPTION 'two-session test refuses a non-empty database';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS dblink;

BEGIN;
CREATE TEMP TABLE badge_two_session (owner uuid) ON COMMIT PRESERVE ROWS;
INSERT INTO badge_two_session VALUES (gen_random_uuid());
DELETE FROM auth.users
 WHERE email LIKE 'badge-two-session-%@verdant.test';
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, aud, role
)
SELECT owner,
  'badge-two-session-' || owner::text || '@verdant.test',
  crypt('harness-password', gen_salt('bf')),
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
FROM badge_two_session;
INSERT INTO public.grows (id, user_id, name)
SELECT gen_random_uuid(), owner, 'two session grow' FROM badge_two_session;
INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
SELECT 'diary-photos', owner::text || '/diary/two.jpg', owner, owner::text
FROM badge_two_session;
INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at)
SELECT grow.user_id, grow.id, 'Two session note', grow.user_id::text || '/diary/two.jpg', now()
FROM public.grows AS grow
JOIN badge_two_session AS probe ON probe.owner = grow.user_id;
UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
COMMIT;

DO $$
DECLARE
  v_owner uuid;
  v_conn text;
  v_cleanup_conn text;
  v_sql text;
  v_count int;
BEGIN
  IF current_database() !~ '^badge_pgtap_[0-9a-f]{12}$'
     OR current_database() = 'postgres' THEN
    RAISE EXCEPTION 'two-session test refuses database %', current_database();
  END IF;
  SELECT owner INTO v_owner FROM badge_two_session;
  v_conn := format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    COALESCE(host(inet_server_addr()), '127.0.0.1'),
    COALESCE(inet_server_port()::text, current_setting('port')),
    current_database()
  );
  v_sql := format($q$
    SELECT public.badge_awards_evaluate_owner('first_diary_entry')
    FROM (
      SELECT
        set_config('request.jwt.claim.sub', %L, false),
        set_config('request.jwt.claims', %L, false),
        set_config('role', 'authenticated', false)
    ) AS session_cfg
  $q$, v_owner::text, json_build_object('sub', v_owner)::text);

  PERFORM dblink_connect('badge_s1', v_conn);
  PERFORM dblink_connect('badge_s2', v_conn);
  IF current_setting('badge_pgtap.force_session2_failure', true) = '1' THEN
    RAISE EXCEPTION 'forced session-2 failure';
  END IF;
  IF dblink_send_query('badge_s1', v_sql) <> 1 OR dblink_send_query('badge_s2', v_sql) <> 1 THEN
    RAISE EXCEPTION 'two-session queries were not sent';
  END IF;
  PERFORM 1 FROM dblink_get_result('badge_s1') AS remote_result(result jsonb);
  PERFORM 1 FROM dblink_get_result('badge_s2') AS remote_result(result jsonb);
  PERFORM dblink_disconnect('badge_s1');
  PERFORM dblink_disconnect('badge_s2');

  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 1, format('two sessions must leave one award, got %s', v_count);
  SELECT count(*) INTO v_count
  FROM public.badge_evidence AS evidence
  JOIN public.badge_awards AS award ON award.id = evidence.award_id
  WHERE award.user_id = v_owner;
  ASSERT v_count = 1, 'two sessions must leave one evidence row';

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'diary-photos'
    AND name = v_owner::text || '/diary/two.jpg';
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'diary-photos'
    AND name = v_owner::text || '/diary/two.jpg';
  ASSERT v_count = 0, 'two-session cleanup must remove the photo';
  DELETE FROM auth.users WHERE id = v_owner;
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  ASSERT (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS FALSE,
    'two-session test must turn the switch back off';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM dblink_disconnect('badge_s1');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM dblink_disconnect('badge_s2');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  -- A RAISE below rolls this handler back. These writes commit in another
  -- session, so a session-2 failure cannot leave the switch on or the photo.
  -- A socket-only connection string cannot reach this database. Cleanup uses
  -- the same explicit host and port as the session connection, and says so
  -- when that connection cannot be built or used.
  BEGIN
    v_cleanup_conn := format(
      'host=%s port=%s dbname=%s user=postgres password=postgres',
      COALESCE(host(inet_server_addr()), '127.0.0.1'),
      COALESCE(inet_server_port()::text, current_setting('port')),
      current_database()
    );
    IF v_cleanup_conn !~ 'host=\S+' OR v_cleanup_conn !~ 'port=[0-9]+' THEN
      RAISE NOTICE 'two-session cleanup skipped: connection has no host and port';
    ELSE
      PERFORM dblink_exec(
        v_cleanup_conn,
        $cleanup$
          DO $inner$
          BEGIN
            PERFORM set_config('storage.allow_delete_query', 'true', true);
            DELETE FROM storage.objects
            WHERE bucket_id = 'diary-photos'
              AND name LIKE '%/diary/two.jpg';
          END
          $inner$
        $cleanup$
      );
      PERFORM dblink_exec(
        v_cleanup_conn,
        'UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1'
      );
      PERFORM dblink_exec(
        v_cleanup_conn,
        $cleanup$DELETE FROM auth.users WHERE email LIKE 'badge-two-session-%@verdant.test'$cleanup$
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'two-session cleanup skipped: %', SQLERRM;
  END;
  RAISE;
END $$;

-- Kill switch versus a committed disable. The test holds the owner advisory
-- lock, waits until the worker is blocked on it, commits enabled = false from
-- a separate connection, then releases the lock. The worker must write nothing.
-- Two cases: evaluate_owner inserting an award, and reconcile calling it.
DO $ks$
DECLARE
  v_case text;
  v_owner uuid;
  v_key bigint;
  v_conn text;
  v_sql text;
  v_photo text;
  v_count int;
  v_status text;
  v_reconciled int;
  v_deadline timestamptz;
  v_waiting boolean;
  v_result jsonb;
  v_failures text := '';
  v_error text;
  v_activity text;
  v_conn_name text;
  v_busy int;
BEGIN
  IF inet_server_addr() IS NULL OR inet_server_port() IS NULL THEN
    RAISE EXCEPTION 'kill-switch test refuses a connection without a loopback host and port';
  END IF;

  FOREACH v_case IN ARRAY ARRAY['evaluate', 'reconcile']
  LOOP
    v_owner := NULL;
    v_key := NULL;
    v_conn_name := NULL;
    v_status := NULL;
    v_reconciled := NULL;
    BEGIN
      v_owner := gen_random_uuid();
      v_photo := v_owner::text || '/diary/ks-' || v_case || '.jpg';
      v_conn_name := 'badge_ks_' || v_case;
      v_conn := format(
        'host=%s port=%s dbname=%s user=postgres password=postgres application_name=%s',
        host(inet_server_addr()),
        inet_server_port(),
        current_database(),
        v_conn_name
      );
      -- pg_stat_get_activity is stable for this transaction. A read taken
      -- before the worker connects stays empty, so clear it before each look.
      PERFORM pg_stat_clear_snapshot();
      PERFORM pg_terminate_backend(activity.pid)
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
        AND activity.pid <> pg_backend_pid()
        AND activity.application_name LIKE 'badge_ks_%';
      PERFORM dblink_exec(v_conn, format($fix$
        DO $inner$
        BEGIN
          INSERT INTO auth.users (
            id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data, aud, role
          ) VALUES (
            %L::uuid,
            %L,
            crypt('harness-password', gen_salt('bf')),
            now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
          );
          INSERT INTO public.grows (id, user_id, name)
          VALUES (gen_random_uuid(), %L::uuid, 'kill switch grow');
          INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
          VALUES ('diary-photos', %L, %L::uuid, %L);
          INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at)
          SELECT %L::uuid, grow.id, 'Kill switch note', %L, now()
          FROM public.grows AS grow
          WHERE grow.user_id = %L::uuid;
          UPDATE public.badge_award_runtime
             SET enabled = true, reconcile_after = NULL
           WHERE id = 1;
        END
        $inner$
      $fix$,
        v_owner,
        'badge-ks-' || v_owner::text || '@verdant.test',
        v_owner,
        v_photo,
        v_owner,
        v_owner::text,
        v_owner,
        v_photo,
        v_owner
      ));

      v_key := hashtextextended(v_owner::text || ':first_diary_entry', 0);
      PERFORM pg_advisory_lock(v_key);

      IF v_case = 'evaluate' THEN
        v_sql := format($q$
          SELECT public.badge_awards_evaluate_owner('first_diary_entry')
          FROM (
            SELECT
              set_config('request.jwt.claim.sub', %L, false),
              set_config('request.jwt.claims', %L, false),
              set_config('role', 'authenticated', false)
          ) AS session_cfg
        $q$, v_owner::text, json_build_object('sub', v_owner)::text);
      ELSE
        v_sql := 'SELECT public.badge_awards_reconcile()';
      END IF;

      BEGIN
        PERFORM dblink_disconnect(v_conn_name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      PERFORM dblink_connect(v_conn_name, v_conn);
      IF dblink_send_query(v_conn_name, v_sql) <> 1 THEN
        RAISE EXCEPTION 'kill-switch % query was not sent', v_case;
      END IF;

      v_deadline := clock_timestamp() + interval '5 seconds';
      v_waiting := false;
      v_busy := 1;
      LOOP
        v_busy := dblink_is_busy(v_conn_name);
        IF v_busy = 0 THEN
          EXIT;
        END IF;
        PERFORM pg_stat_clear_snapshot();
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity AS activity
          WHERE activity.datname = current_database()
            AND activity.pid <> pg_backend_pid()
            AND activity.application_name = v_conn_name
            AND activity.wait_event_type = 'Lock'
            AND activity.wait_event = 'advisory'
        ) INTO v_waiting;
        EXIT WHEN v_waiting OR clock_timestamp() > v_deadline;
        PERFORM pg_sleep(0.05);
      END LOOP;

      IF NOT v_waiting THEN
        PERFORM pg_stat_clear_snapshot();
        SELECT string_agg(
          COALESCE(activity.application_name, '-') || ' '
            || COALESCE(activity.state, '-') || ' '
            || COALESCE(activity.wait_event_type, '-') || '/'
            || COALESCE(activity.wait_event, '-') || ' '
            || COALESCE(left(activity.query, 120), '<no query>'),
          ' || '
        )
          INTO v_activity
        FROM pg_stat_activity AS activity
        WHERE activity.pid <> pg_backend_pid()
          AND (
            activity.datname = current_database()
            OR activity.application_name LIKE 'badge_ks_%'
          );
        IF v_busy = 0 THEN
          BEGIN
            IF v_case = 'evaluate' THEN
              SELECT remote_result.result
                INTO v_result
              FROM dblink_get_result(v_conn_name) AS remote_result(result jsonb);
              v_status := v_result->>'status';
            ELSE
              SELECT remote_result.result
                INTO v_reconciled
              FROM dblink_get_result(v_conn_name) AS remote_result(result integer);
            END IF;
          EXCEPTION WHEN OTHERS THEN
            v_status := 'error:' || SQLERRM;
          END;
        END IF;
        SELECT count(*) INTO v_count
        FROM public.badge_awards
        WHERE user_id = v_owner;
        RAISE EXCEPTION
          'kill-switch % did not reach the advisory wait: busy % rows % status % reconcile % activity %',
          v_case, v_busy, v_count, v_status, v_reconciled, v_activity;
      END IF;

      PERFORM dblink_exec(
        v_conn,
        'UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1'
      );
      PERFORM pg_advisory_unlock(v_key);

      IF v_case = 'evaluate' THEN
        SELECT remote_result.result
          INTO v_result
        FROM dblink_get_result(v_conn_name) AS remote_result(result jsonb);
        v_status := v_result->>'status';
      ELSE
        SELECT remote_result.result
          INTO v_reconciled
        FROM dblink_get_result(v_conn_name) AS remote_result(result integer);
      END IF;
      PERFORM dblink_disconnect(v_conn_name);

      SELECT count(*) INTO v_count
      FROM public.badge_awards
      WHERE user_id = v_owner;
      RAISE NOTICE 'kill-switch % rows % status % reconcile %',
        v_case, v_count, v_status, v_reconciled;
      IF v_case = 'evaluate' AND (v_count <> 0 OR v_status IS DISTINCT FROM 'disabled') THEN
        RAISE EXCEPTION
          'kill-switch evaluate wrote after disable: rows % status %',
          v_count, v_status;
      ELSIF v_case = 'reconcile' AND v_count <> 0 THEN
        RAISE EXCEPTION
          'kill-switch reconcile wrote after disable: rows % reconcile_result %',
          v_count, v_reconciled;
      END IF;

      PERFORM dblink_exec(v_conn, format($fix$
        DO $inner$
        BEGIN
          PERFORM set_config('storage.allow_delete_query', 'true', true);
          DELETE FROM storage.objects
          WHERE bucket_id = 'diary-photos'
            AND name = %L;
          DELETE FROM auth.users WHERE id = %L::uuid;
          UPDATE public.badge_award_runtime
             SET enabled = false, reconcile_after = NULL
           WHERE id = 1;
        END
        $inner$
      $fix$, v_photo, v_owner));
      IF (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'kill-switch % left the switch on', v_case;
      END IF;
      IF (SELECT count(*) FROM auth.users WHERE id = v_owner) <> 0 THEN
        RAISE EXCEPTION 'kill-switch % left the fixture user', v_case;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      IF v_conn_name IS NOT NULL THEN
        BEGIN
          PERFORM dblink_cancel_query(v_conn_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        BEGIN
          PERFORM dblink_disconnect(v_conn_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
      PERFORM pg_stat_clear_snapshot();
      PERFORM pg_terminate_backend(activity.pid)
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
        AND activity.pid <> pg_backend_pid()
        AND activity.application_name LIKE 'badge_ks_%';
      IF v_key IS NOT NULL THEN
        PERFORM pg_advisory_unlock(v_key);
      END IF;
      IF v_owner IS NOT NULL AND v_conn IS NOT NULL THEN
        BEGIN
          PERFORM dblink_exec(v_conn, format($fix$
            DO $inner$
            BEGIN
              PERFORM set_config('storage.allow_delete_query', 'true', true);
              DELETE FROM storage.objects
              WHERE bucket_id = 'diary-photos'
                AND name LIKE %L;
              DELETE FROM auth.users WHERE id = %L::uuid;
              UPDATE public.badge_award_runtime
                 SET enabled = false, reconcile_after = NULL
               WHERE id = 1;
            END
            $inner$
          $fix$, '%/diary/ks-' || v_case || '.jpg', v_owner));
        EXCEPTION WHEN OTHERS THEN
          v_error := v_error || ' cleanup: ' || SQLERRM;
        END;
      END IF;
      v_failures := v_failures || v_case || ': ' || v_error || E'\n';
    END;
  END LOOP;

  IF btrim(v_failures) <> '' THEN
    RAISE EXCEPTION 'kill-switch races failed:%', E'\n' || v_failures;
  END IF;
END
$ks$;

-- Reconcile versus a concurrent evaluate, and reconcile versus a committed
-- disable. Owner A must finish and keep its advisory lock. Reconcile then
-- waits on owner B. A client evaluate for a later owner must finish while
-- that wait is still open. A committed enabled = false during the same wait
-- must award A, skip B, and leave the cursor unchanged.
DO $race$
DECLARE
  v_case text;
  v_cursor uuid := 'ffffffff-ffff-ffff-ffff-ffffffff0100';
  v_first uuid := 'ffffffff-ffff-ffff-ffff-ffffffff0101';
  v_blocked uuid := 'ffffffff-ffff-ffff-ffff-ffffffff0102';
  v_client uuid := 'ffffffff-ffff-ffff-ffff-ffffffff0103';
  v_owner uuid;
  v_key bigint;
  v_admin text;
  v_conn text;
  v_reconcile_name text;
  v_reconcile_app text;
  v_client_name text;
  v_disable_name text;
  v_sql text;
  v_count int;
  v_status text;
  v_reconciled int;
  v_deadline timestamptz;
  v_pid int;
  v_granted int;
  v_waiting int;
  v_result jsonb;
  v_failures text := '';
  v_error text;
  v_activity text;
  v_busy int;
BEGIN
  IF inet_server_addr() IS NULL OR inet_server_port() IS NULL THEN
    RAISE EXCEPTION 'reconcile race refuses a connection without a loopback host and port';
  END IF;
  v_admin := format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()),
    inet_server_port(),
    current_database()
  );

  FOREACH v_case IN ARRAY ARRAY['reconcile_vs_evaluate', 'reconcile_vs_disable']
  LOOP
    v_key := NULL;
    v_reconcile_name := NULL;
    v_client_name := NULL;
    v_disable_name := NULL;
    v_status := NULL;
    v_reconciled := NULL;
    v_pid := NULL;
    BEGIN
      v_reconcile_name := 'badge_race_r';
      v_client_name := 'badge_race_c';
      v_disable_name := 'badge_race_d';
      v_reconcile_app := 'badge_race_reconcile_' || v_case;
      v_key := hashtextextended(v_blocked::text || ':first_diary_entry', 0);
      PERFORM pg_advisory_unlock(v_key);
      PERFORM pg_stat_clear_snapshot();
      PERFORM pg_terminate_backend(activity.pid)
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
        AND activity.pid <> pg_backend_pid()
        AND activity.application_name LIKE 'badge_race_%';

      PERFORM dblink_exec(v_admin, format($fix$
        DO $inner$
        BEGIN
          PERFORM set_config('storage.allow_delete_query', 'true', true);
          DELETE FROM storage.objects
          WHERE bucket_id = 'diary-photos'
            AND name IN (%L, %L, %L, %L);
          DELETE FROM auth.users
          WHERE id IN (%L::uuid, %L::uuid, %L::uuid, %L::uuid);
          UPDATE public.badge_award_runtime
             SET enabled = false, reconcile_after = NULL
           WHERE id = 1;
        END
        $inner$
      $fix$,
        v_cursor::text || '/diary/race.jpg',
        v_first::text || '/diary/race.jpg',
        v_blocked::text || '/diary/race.jpg',
        v_client::text || '/diary/race.jpg',
        v_cursor, v_first, v_blocked, v_client
      ));

      FOREACH v_owner IN ARRAY ARRAY[v_cursor, v_first, v_blocked, v_client]
      LOOP
        PERFORM dblink_exec(v_admin, format($fix$
          INSERT INTO auth.users (
            id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data, aud, role, is_anonymous
          ) VALUES (
            %L::uuid,
            %L,
            crypt('harness-password', gen_salt('bf')),
            now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated',
            false
          )
        $fix$, v_owner, 'badge-race-' || v_owner::text || '@verdant.test'));
        PERFORM dblink_exec(v_admin, format($fix$
          INSERT INTO public.grows (id, user_id, name)
          VALUES (gen_random_uuid(), %L::uuid, 'race grow')
        $fix$, v_owner));
        PERFORM dblink_exec(v_admin, format($fix$
          INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
          VALUES ('diary-photos', %L, %L::uuid, %L)
        $fix$, v_owner::text || '/diary/race.jpg', v_owner, v_owner::text));
        PERFORM dblink_exec(v_admin, format($fix$
          INSERT INTO public.diary_entries (user_id, grow_id, note, photo_url, entry_at)
          SELECT %L::uuid, grow.id, '', %L, now()
          FROM public.grows AS grow
          WHERE grow.user_id = %L::uuid
        $fix$, v_owner, v_owner::text || '/diary/race.jpg', v_owner));
      END LOOP;

      PERFORM dblink_exec(v_admin, format($fix$
        UPDATE public.badge_award_runtime
           SET enabled = true, reconcile_after = %L::uuid
         WHERE id = 1
      $fix$, v_cursor));

      PERFORM pg_advisory_lock(v_key);
      v_conn := format(
        'host=%s port=%s dbname=%s user=postgres password=postgres application_name=%s',
        host(inet_server_addr()),
        inet_server_port(),
        current_database(),
        v_reconcile_app
      );
      BEGIN
        PERFORM dblink_disconnect(v_reconcile_name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      PERFORM dblink_connect(v_reconcile_name, v_conn);
      IF dblink_send_query(v_reconcile_name, 'SELECT public.badge_awards_reconcile()') <> 1 THEN
        RAISE EXCEPTION 'reconcile race % query was not sent', v_case;
      END IF;

      v_deadline := clock_timestamp() + interval '10 seconds';
      v_granted := 0;
      v_waiting := 0;
      v_busy := 1;
      LOOP
        v_busy := dblink_is_busy(v_reconcile_name);
        EXIT WHEN v_busy = 0 OR clock_timestamp() > v_deadline;
        v_granted := 0;
        v_waiting := 0;
        v_pid := NULL;
        PERFORM pg_stat_clear_snapshot();
        SELECT activity.pid
          INTO v_pid
        FROM pg_stat_activity AS activity
        WHERE activity.datname = current_database()
          AND activity.pid <> pg_backend_pid()
          AND activity.application_name = v_reconcile_app
        LIMIT 1;
        IF v_pid IS NOT NULL THEN
          SELECT
            count(*) FILTER (WHERE lock.granted)::int,
            count(*) FILTER (WHERE NOT lock.granted)::int
            INTO v_granted, v_waiting
          FROM pg_locks AS lock
          WHERE lock.locktype = 'advisory'
            AND lock.pid = v_pid;
        END IF;
        EXIT WHEN v_granted >= 1 AND v_waiting >= 1;
        PERFORM pg_sleep(0.05);
      END LOOP;

      IF v_granted < 1 OR v_waiting < 1 THEN
        PERFORM pg_stat_clear_snapshot();
        SELECT string_agg(
          COALESCE(activity.application_name, '-') || ' '
            || COALESCE(activity.state, '-') || ' '
            || COALESCE(activity.wait_event_type, '-') || '/'
            || COALESCE(activity.wait_event, '-') || ' '
            || COALESCE(left(activity.query, 120), '<no query>'),
          ' || '
        )
          INTO v_activity
        FROM pg_stat_activity AS activity
        WHERE activity.pid <> pg_backend_pid()
          AND (
            activity.datname = current_database()
            OR activity.application_name LIKE 'badge_race_%'
          );
        RAISE EXCEPTION
          'reconcile race % did not hold owner A and wait on owner B: busy % granted % waiting % activity %',
          v_case, v_busy, v_granted, v_waiting, v_activity;
      END IF;

      IF v_case = 'reconcile_vs_evaluate' THEN
        v_sql := format($q$
          SELECT public.badge_awards_evaluate_owner('first_diary_entry')
          FROM (
            SELECT
              set_config('request.jwt.claim.sub', %L, false),
              set_config('request.jwt.claims', %L, false),
              set_config('role', 'authenticated', false)
          ) AS session_cfg
        $q$, v_client::text, json_build_object('sub', v_client)::text);
        v_conn := format(
          'host=%s port=%s dbname=%s user=postgres password=postgres application_name=%s',
          host(inet_server_addr()),
          inet_server_port(),
          current_database(),
          'badge_race_client_' || v_case
        );
        BEGIN
          PERFORM dblink_disconnect(v_client_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        PERFORM dblink_connect(v_client_name, v_conn);
        IF dblink_send_query(v_client_name, v_sql) <> 1 THEN
          RAISE EXCEPTION 'client evaluate was not sent';
        END IF;
        v_deadline := clock_timestamp() + interval '10 seconds';
        LOOP
          EXIT WHEN dblink_is_busy(v_client_name) = 0 OR clock_timestamp() > v_deadline;
          PERFORM pg_sleep(0.05);
        END LOOP;
        IF dblink_is_busy(v_client_name) <> 0 OR dblink_is_busy(v_reconcile_name) <> 1 THEN
          RAISE EXCEPTION
            'client evaluate did not finish while reconcile was still waiting: client busy % reconcile busy %',
            dblink_is_busy(v_client_name), dblink_is_busy(v_reconcile_name);
        END IF;
        SELECT remote_result.result
          INTO v_result
        FROM dblink_get_result(v_client_name) AS remote_result(result jsonb);
        PERFORM dblink_disconnect(v_client_name);
        v_client_name := NULL;
        v_status := v_result->>'status';
        IF v_status IS DISTINCT FROM 'qualified' THEN
          RAISE EXCEPTION 'client evaluate status %, expected qualified', v_status;
        END IF;
        SELECT count(*) INTO v_count
        FROM public.badge_awards
        WHERE user_id = v_client;
        IF v_count <> 1 THEN
          RAISE EXCEPTION 'client evaluate committed % awards, expected 1', v_count;
        END IF;
      ELSE
        v_conn := format(
          'host=%s port=%s dbname=%s user=postgres password=postgres application_name=%s',
          host(inet_server_addr()),
          inet_server_port(),
          current_database(),
          'badge_race_disable_' || v_case
        );
        BEGIN
          PERFORM dblink_disconnect(v_disable_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        PERFORM dblink_connect(v_disable_name, v_conn);
        PERFORM dblink_exec(v_disable_name, 'SET lock_timeout = ''3s''');
        PERFORM dblink_exec(
          v_disable_name,
          'UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1'
        );
        PERFORM dblink_disconnect(v_disable_name);
        v_disable_name := NULL;
        IF dblink_is_busy(v_reconcile_name) <> 1 THEN
          RAISE EXCEPTION 'reconcile finished before the committed disable could overlap the wait';
        END IF;
        IF (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS DISTINCT FROM FALSE THEN
          RAISE EXCEPTION 'committed disable did not turn the switch off';
        END IF;
      END IF;

      PERFORM pg_advisory_unlock(v_key);
      v_deadline := clock_timestamp() + interval '10 seconds';
      LOOP
        EXIT WHEN dblink_is_busy(v_reconcile_name) = 0 OR clock_timestamp() > v_deadline;
        PERFORM pg_sleep(0.05);
      END LOOP;
      IF dblink_is_busy(v_reconcile_name) <> 0 THEN
        RAISE EXCEPTION 'reconcile stayed busy after owner B was released';
      END IF;
      SELECT remote_result.result
        INTO v_reconciled
      FROM dblink_get_result(v_reconcile_name) AS remote_result(result integer);
      PERFORM dblink_disconnect(v_reconcile_name);
      v_reconcile_name := NULL;

      SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_first;
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'owner A awards %, expected 1', v_count;
      END IF;
      SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_blocked;
      IF v_case = 'reconcile_vs_evaluate' AND v_count <> 1 THEN
        RAISE EXCEPTION 'owner B awards %, expected 1', v_count;
      ELSIF v_case = 'reconcile_vs_disable' AND v_count <> 0 THEN
        RAISE EXCEPTION 'owner B was awarded after disable: %', v_count;
      END IF;
      SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_client;
      IF v_count <> 1 AND v_case = 'reconcile_vs_evaluate' THEN
        RAISE EXCEPTION 'client awards after reconcile %, expected 1', v_count;
      ELSIF v_count <> 0 AND v_case = 'reconcile_vs_disable' THEN
        RAISE EXCEPTION 'client was visited after disable: %', v_count;
      END IF;
      IF v_case = 'reconcile_vs_evaluate' AND v_reconciled IS DISTINCT FROM 3 THEN
        RAISE EXCEPTION 'reconcile visited %, expected 3', v_reconciled;
      ELSIF v_case = 'reconcile_vs_disable' AND v_reconciled IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'reconcile visited %, expected 2', v_reconciled;
      END IF;
      IF v_case = 'reconcile_vs_disable'
         AND (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1)
           IS DISTINCT FROM v_cursor THEN
        RAISE EXCEPTION
          'disable path changed reconcile_after to %',
          (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1);
      END IF;
      IF v_case = 'reconcile_vs_evaluate'
         AND (SELECT reconcile_after FROM public.badge_award_runtime WHERE id = 1) IS NOT NULL THEN
        RAISE EXCEPTION 'evaluate path left a cursor after a short batch';
      END IF;

      PERFORM dblink_exec(v_admin, format($fix$
        DO $inner$
        BEGIN
          PERFORM set_config('storage.allow_delete_query', 'true', true);
          DELETE FROM storage.objects
          WHERE bucket_id = 'diary-photos'
            AND name IN (%L, %L, %L, %L);
          DELETE FROM auth.users
          WHERE id IN (%L::uuid, %L::uuid, %L::uuid, %L::uuid);
          UPDATE public.badge_award_runtime
             SET enabled = false, reconcile_after = NULL
           WHERE id = 1;
        END
        $inner$
      $fix$,
        v_cursor::text || '/diary/race.jpg',
        v_first::text || '/diary/race.jpg',
        v_blocked::text || '/diary/race.jpg',
        v_client::text || '/diary/race.jpg',
        v_cursor, v_first, v_blocked, v_client
      ));
      IF (SELECT enabled FROM public.badge_award_runtime WHERE id = 1) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'reconcile race % left the switch on', v_case;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      IF v_client_name IS NOT NULL THEN
        BEGIN
          PERFORM dblink_cancel_query(v_client_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        BEGIN
          PERFORM dblink_disconnect(v_client_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
      IF v_disable_name IS NOT NULL THEN
        BEGIN
          PERFORM dblink_disconnect(v_disable_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
      IF v_reconcile_name IS NOT NULL THEN
        BEGIN
          PERFORM dblink_cancel_query(v_reconcile_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        BEGIN
          PERFORM dblink_disconnect(v_reconcile_name);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
      PERFORM pg_stat_clear_snapshot();
      PERFORM pg_terminate_backend(activity.pid)
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
        AND activity.pid <> pg_backend_pid()
        AND activity.application_name LIKE 'badge_race_%';
      IF v_key IS NOT NULL THEN
        PERFORM pg_advisory_unlock(v_key);
      END IF;
      BEGIN
        PERFORM dblink_exec(v_admin, format($fix$
          DO $inner$
          BEGIN
            PERFORM set_config('storage.allow_delete_query', 'true', true);
            DELETE FROM storage.objects
            WHERE bucket_id = 'diary-photos'
              AND name IN (%L, %L, %L, %L);
            DELETE FROM auth.users
            WHERE id IN (%L::uuid, %L::uuid, %L::uuid, %L::uuid);
            UPDATE public.badge_award_runtime
               SET enabled = false, reconcile_after = NULL
             WHERE id = 1;
          END
          $inner$
        $fix$,
          v_cursor::text || '/diary/race.jpg',
          v_first::text || '/diary/race.jpg',
          v_blocked::text || '/diary/race.jpg',
          v_client::text || '/diary/race.jpg',
          v_cursor, v_first, v_blocked, v_client
        ));
      EXCEPTION WHEN OTHERS THEN
        v_error := v_error || ' cleanup: ' || SQLERRM;
      END;
      v_failures := v_failures || v_case || ': ' || v_error || E'\n';
    END;
  END LOOP;

  IF btrim(v_failures) <> '' THEN
    RAISE EXCEPTION 'reconcile races failed:%', E'\n' || v_failures;
  END IF;
END
$race$;

\echo ok 2 - two simultaneous sessions leave one award
\else
\echo ok 2 - two simultaneous sessions leave one award # SKIP disposable local database required
\endif
