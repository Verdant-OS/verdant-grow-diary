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
  ASSERT v_result->>'status' = 'unchanged', 'first_tent with no photo must write nothing';
  v_result := public.badge_awards_evaluate_owner('setup_documented');
  ASSERT v_result->>'status' = 'unchanged', 'setup_documented with no photo must write nothing';
  v_result := public.badge_awards_evaluate_owner('first_recorded_harvest');
  ASSERT v_result->>'status' = 'unchanged', 'first_recorded_harvest with no photo must write nothing';
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
  ASSERT v_count = 1, format('the second signed-in account sees exactly 1 active award, got %s', v_count);
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

  DELETE FROM auth.users WHERE id = v_owner;
  SELECT count(*) INTO v_count FROM public.badge_awards WHERE user_id = v_owner;
  ASSERT v_count = 0, 'deleting the account must cascade the award';
  SELECT count(*) INTO v_count FROM public.badge_evidence;
  ASSERT v_count = 0, 'deleting the account must cascade the evidence';
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;

  RAISE NOTICE '✓ kill switch, qualification, lifecycle, and owner visibility';
END $$;

\echo 1..2
\echo ok 1 - badge awards permissions, kill switch, and owner visibility

ROLLBACK;

-- Petal test 23: two sessions evaluate the same owner at once.
-- The fixture commits so the second connection can see it, then this
-- session deletes it and turns the kill switch back off.
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
  v_sql text;
  v_count int;
BEGIN
  SELECT owner INTO v_owner FROM badge_two_session;
  SELECT format(
    'host=%s port=%s dbname=postgres user=postgres password=postgres',
    host(inet_server_addr()),
    inet_server_port()
  ) INTO v_conn;
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
  UPDATE public.badge_award_runtime SET enabled = false WHERE id = 1;
  DELETE FROM auth.users WHERE email LIKE 'badge-two-session-%@verdant.test';
  RAISE;
END $$;

\echo ok 2 - two simultaneous sessions leave one award
