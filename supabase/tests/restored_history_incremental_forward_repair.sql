\set ON_ERROR_STOP on

BEGIN;

-- Snapshot the exact target catalog before any restored historical file runs.
-- The whole adversarial exercise remains inside this transaction and rolls
-- back, so no synthetic late-history effects survive the receipt.
CREATE TEMP TABLE restored_history_baseline_catalog AS
SELECT
  pg_get_functiondef(
    'public.ai_credit_spend(text,uuid,text,text,jsonb)'::regprocedure
  ) AS legacy_spend_definition,
  (
    SELECT p.proacl::text
    FROM pg_proc p
    WHERE p.oid =
      'public.ai_credit_spend(text,uuid,text,text,jsonb)'::regprocedure
  ) AS legacy_spend_acl,
  pg_get_functiondef(
    'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
  ) AS service_spend_definition,
  (
    SELECT p.proacl::text
    FROM pg_proc p
    WHERE p.oid =
      'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
  ) AS service_spend_acl,
  pg_get_functiondef(
    'public.has_pheno_tracker_entitlement(uuid)'::regprocedure
  ) AS pheno_entitlement_definition,
  (
    SELECT p.proacl::text
    FROM pg_proc p
    WHERE p.oid =
      'public.has_pheno_tracker_entitlement(uuid)'::regprocedure
  ) AS pheno_entitlement_acl,
  pg_get_functiondef(
    'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure
  ) AS quicklog_definition,
  (
    SELECT p.proacl::text
    FROM pg_proc p
    WHERE p.oid =
      'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure
  ) AS quicklog_acl,
  obj_description(
    'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure,
    'pg_proc'
  ) AS quicklog_comment,
  (
    SELECT pg_get_triggerdef(trigger_row.oid)
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'auth.users'::regclass
      AND trigger_row.tgname = 'on_auth_user_created_grant_staff'
      AND NOT trigger_row.tgisinternal
  ) AS created_staff_trigger_definition,
  (
    SELECT pg_get_triggerdef(trigger_row.oid)
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'auth.users'::regclass
      AND trigger_row.tgname = 'on_auth_user_confirmed_grant_staff'
      AND NOT trigger_row.tgisinternal
  ) AS confirmed_staff_trigger_definition,
  (
    SELECT md5(COALESCE(jsonb_agg(to_jsonb(pol) ORDER BY pol.tablename, pol.policyname)::text, '[]'))
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename LIKE 'pheno_%'
  ) AS pheno_policy_fingerprint;

-- Seed an intentionally incomplete legacy hunt. The canonical backfill ran in
-- the baseline history already; this later NULL is valid grower state and must
-- survive the restored duplicate version.
CREATE TEMP TABLE restored_history_setup_null_fixture (
  hunt_id uuid PRIMARY KEY
);

DO $fixture$
DECLARE
  v_user uuid := gen_random_uuid();
  v_grow uuid;
  v_hunt uuid;
BEGIN
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role
  ) VALUES (
    v_user,
    'restored-history-safe-' || replace(v_user::text, '-', '') || '@verdant.test',
    crypt('local-harness-only', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  );

  INSERT INTO public.grows (user_id, name)
  VALUES (v_user, 'Restored history prepared backfill control')
  RETURNING id INTO v_grow;

  INSERT INTO public.pheno_hunts (
    user_id,
    grow_id,
    name,
    created_at,
    setup_completed_at
  ) VALUES (
    v_user,
    v_grow,
    'Intentional incomplete legacy hunt',
    timestamptz '2026-07-01 12:00:00+00',
    NULL
  )
  RETURNING id INTO v_hunt;

  INSERT INTO restored_history_setup_null_fixture (hunt_id) VALUES (v_hunt);
END;
$fixture$;

-- Apply the ten official CLI-fetched files late through the SHA-verified
-- compatibility workspace. Duplicate historical effects are no-op'd only in
-- this disposable copy; the repository inputs remain immutable.
\ir ../migrations/20260710003624_pheno_hunt_guided_setup_onboarding.sql
\ir ../migrations/20260710003638_pheno_hunt_setup_backfill.sql
\ir ../migrations/20260710005819_ai_credit_spend_union_hardening.sql
\ir ../migrations/20260710012854_lovable_paddle_sink_subscriptions_and_events.sql
\ir ../migrations/20260710012950_app_role_add_staff_value.sql
\ir ../migrations/20260710013213_pheno_tracker_pro_entitlement_enforcement.sql
\ir ../migrations/20260710013235_pheno_entitlement_anti_oracle_guard.sql
\ir ../migrations/20260710013255_staff_role_grant_trigger_and_backfill.sql
\ir ../migrations/20260725033124_core_schema_forward_repair.sql
\ir ../migrations/20260728230229_ai_doctor_receipts_server_only_deny_marker.sql

DO $control$
DECLARE
  v_before restored_history_baseline_catalog%ROWTYPE;
  v_pheno_definition text;
  v_quicklog_definition text;
  v_old_trigger_count integer;
  v_pheno_policy_fingerprint text;
  v_receipt_marker_count integer;
  v_setup_completed_at timestamptz;
BEGIN
  SELECT * INTO STRICT v_before FROM restored_history_baseline_catalog;

  IF NOT has_function_privilege(
    'authenticated',
    'public.ai_credit_spend(text,uuid,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'negative control failed: restored legacy AI spend was not reopened';
  END IF;
  IF pg_get_functiondef(
       'public.ai_credit_spend(text,uuid,text,text,jsonb)'::regprocedure
     ) IS NOT DISTINCT FROM v_before.legacy_spend_definition THEN
    RAISE EXCEPTION 'negative control failed: restored legacy AI spend body did not change';
  END IF;

  IF pg_get_functiondef(
       'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.service_spend_definition THEN
    RAISE EXCEPTION 'negative control changed the authoritative service AI spend body';
  END IF;
  IF (
       SELECT p.proacl::text
       FROM pg_proc p
       WHERE p.oid =
         'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.service_spend_acl THEN
    RAISE EXCEPTION 'negative control changed the authoritative service AI spend ACL';
  END IF;

  v_pheno_definition := pg_get_functiondef(
    'public.has_pheno_tracker_entitlement(uuid)'::regprocedure
  );
  IF position('public.billing_subscriptions' IN v_pheno_definition) = 0 THEN
    RAISE EXCEPTION 'negative control failed: restored pheno oracle was not stale';
  END IF;
  IF v_pheno_definition IS NOT DISTINCT FROM v_before.pheno_entitlement_definition THEN
    RAISE EXCEPTION 'negative control failed: restored pheno oracle body did not change';
  END IF;

  v_quicklog_definition := pg_get_functiondef(
    'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure
  );
  IF v_quicklog_definition IS DISTINCT FROM v_before.quicklog_definition THEN
    RAISE EXCEPTION 'prepared compatibility path changed the canonical Quick Log wrapper';
  END IF;

  SELECT hunt.setup_completed_at
    INTO STRICT v_setup_completed_at
    FROM restored_history_setup_null_fixture fixture
    JOIN public.pheno_hunts hunt ON hunt.id = fixture.hunt_id;
  IF v_setup_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'prepared compatibility path replayed the duplicate setup backfill';
  END IF;

  SELECT count(*)
    INTO v_old_trigger_count
    FROM pg_trigger trigger_row
    JOIN pg_proc proc_row ON proc_row.oid = trigger_row.tgfoid
    JOIN pg_namespace proc_namespace ON proc_namespace.oid = proc_row.pronamespace
   WHERE NOT trigger_row.tgisinternal
     AND trigger_row.tgrelid = 'auth.users'::regclass
     AND trigger_row.tgname IN (
       'on_auth_user_created_grant_staff',
       'on_auth_user_confirmed_grant_staff'
     )
     AND proc_namespace.nspname = 'public'
     AND proc_row.proname = 'grant_staff_role_for_verified_email';
  IF v_old_trigger_count <> 2 THEN
    RAISE EXCEPTION 'negative control failed: expected 2 stale staff trigger targets, found %',
      v_old_trigger_count;
  END IF;

  SELECT md5(COALESCE(jsonb_agg(to_jsonb(pol) ORDER BY pol.tablename, pol.policyname)::text, '[]'))
    INTO v_pheno_policy_fingerprint
    FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND pol.tablename LIKE 'pheno_%';
  IF v_pheno_policy_fingerprint IS DISTINCT FROM v_before.pheno_policy_fingerprint THEN
    RAISE EXCEPTION 'negative control changed final pheno policy definitions';
  END IF;

  SELECT count(*)
    INTO v_receipt_marker_count
    FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND pol.tablename = 'ai_doctor_review_evidence_receipts'
     AND pol.policyname = 'server_only_no_client_access'
     AND pol.cmd = 'SELECT'
     AND pol.roles::text = '{authenticated}'
     AND pol.qual = 'false';
  IF v_receipt_marker_count <> 1
     OR has_table_privilege(
       'anon', 'public.ai_doctor_review_evidence_receipts', 'SELECT'
     )
     OR has_table_privilege(
       'authenticated', 'public.ai_doctor_review_evidence_receipts', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'negative control did not preserve the receipts server-only deny boundary';
  END IF;
END;
$control$;

\ir ../migrations/20260823120000_restored_history_ai_credit_pheno_quicklog_repair.sql

DO $repair$
DECLARE
  v_before restored_history_baseline_catalog%ROWTYPE;
  v_pheno_definition text;
  v_quicklog_definition text;
  v_allowlist_trigger_count integer;
  v_pheno_policy_fingerprint text;
  v_receipt_marker_count integer;
  v_setup_completed_at timestamptz;
BEGIN
  SELECT * INTO STRICT v_before FROM restored_history_baseline_catalog;

  IF has_function_privilege(
       'anon', 'public.ai_credit_spend(text,uuid,text,text,jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.ai_credit_spend(text,uuid,text,text,jsonb)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.ai_credit_spend(text,uuid,text,text,jsonb)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'repair failed: retired legacy AI spend remains executable';
  END IF;
  IF pg_get_functiondef(
       'public.ai_credit_spend(text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.legacy_spend_definition THEN
    RAISE EXCEPTION 'repair did not restore the exact legacy AI spend body';
  END IF;
  IF (
       SELECT p.proacl::text
       FROM pg_proc p
       WHERE p.oid =
         'public.ai_credit_spend(text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.legacy_spend_acl THEN
    RAISE EXCEPTION 'repair did not restore the exact legacy AI spend ACL';
  END IF;

  IF pg_get_functiondef(
       'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.service_spend_definition THEN
    RAISE EXCEPTION 'repair changed the authoritative service AI spend body';
  END IF;
  IF (
       SELECT p.proacl::text
       FROM pg_proc p
       WHERE p.oid =
         'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.service_spend_acl THEN
    RAISE EXCEPTION 'repair changed the authoritative service AI spend ACL';
  END IF;

  v_pheno_definition := pg_get_functiondef(
    'public.has_pheno_tracker_entitlement(uuid)'::regprocedure
  );
  IF position('public.billing_subscriptions' IN v_pheno_definition) > 0
     OR position('craft_monthly' IN v_pheno_definition) = 0
     OR position('founder_lifetime' IN v_pheno_definition) = 0
     OR position('current_period_end IS NOT NULL' IN v_pheno_definition) = 0 THEN
    RAISE EXCEPTION 'repair failed: pheno entitlement oracle is not canonical';
  END IF;
  IF v_pheno_definition IS DISTINCT FROM v_before.pheno_entitlement_definition THEN
    RAISE EXCEPTION 'repair did not restore the exact pheno entitlement body';
  END IF;
  IF (
       SELECT p.proacl::text
       FROM pg_proc p
       WHERE p.oid =
         'public.has_pheno_tracker_entitlement(uuid)'::regprocedure
     ) IS DISTINCT FROM v_before.pheno_entitlement_acl THEN
    RAISE EXCEPTION 'repair did not restore the exact pheno entitlement ACL';
  END IF;
  IF has_function_privilege(
       'anon', 'public.has_pheno_tracker_entitlement(uuid)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated', 'public.has_pheno_tracker_entitlement(uuid)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.has_pheno_tracker_entitlement(uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'repair failed: pheno entitlement ACL is wrong';
  END IF;

  v_quicklog_definition := pg_get_functiondef(
    'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure
  );
  IF position('quicklog_save_event_pre_logged_at' IN v_quicklog_definition) = 0
     OR position('verdant.quicklog_logged_at' IN v_quicklog_definition) = 0
     OR position('dual_timestamp_persist_failed' IN v_quicklog_definition) = 0 THEN
    RAISE EXCEPTION 'repair failed: Quick Log dual-timestamp wrapper is not canonical';
  END IF;
  IF v_quicklog_definition IS DISTINCT FROM v_before.quicklog_definition THEN
    RAISE EXCEPTION 'repair did not restore the exact Quick Log wrapper body';
  END IF;
  IF (
       SELECT p.proacl::text
       FROM pg_proc p
       WHERE p.oid =
         'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure
     ) IS DISTINCT FROM v_before.quicklog_acl THEN
    RAISE EXCEPTION 'repair did not restore the exact Quick Log wrapper ACL';
  END IF;
  IF has_function_privilege(
       'anon',
       'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'repair failed: Quick Log wrapper ACL is wrong';
  END IF;
  IF obj_description(
       'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure,
       'pg_proc'
     ) IS DISTINCT FROM v_before.quicklog_comment THEN
    RAISE EXCEPTION 'repair did not restore the exact Quick Log canonical comment';
  END IF;
  IF COALESCE(position(
       'Persists canonical Captured logged_at separately from occurred_at'
       IN obj_description(
         'public.quicklog_save_event(text,uuid,text,uuid,uuid,text,text,jsonb,timestamptz,jsonb,jsonb,jsonb)'::regprocedure,
         'pg_proc'
       )
     ), 0) = 0 THEN
    RAISE EXCEPTION 'repair failed: Quick Log canonical comment is missing';
  END IF;

  SELECT count(*)
    INTO v_allowlist_trigger_count
    FROM pg_trigger trigger_row
    JOIN pg_proc proc_row ON proc_row.oid = trigger_row.tgfoid
    JOIN pg_namespace proc_namespace ON proc_namespace.oid = proc_row.pronamespace
   WHERE NOT trigger_row.tgisinternal
     AND trigger_row.tgrelid = 'auth.users'::regclass
     AND trigger_row.tgname IN (
       'on_auth_user_created_grant_staff',
       'on_auth_user_confirmed_grant_staff'
     )
     AND proc_namespace.nspname = 'public'
     AND proc_row.proname = 'grant_staff_role_for_verified_allowlist';
  IF v_allowlist_trigger_count <> 2 THEN
    RAISE EXCEPTION 'repair failed: expected 2 final staff trigger targets, found %',
      v_allowlist_trigger_count;
  END IF;
  IF (
       SELECT pg_get_triggerdef(trigger_row.oid)
       FROM pg_trigger trigger_row
       WHERE trigger_row.tgrelid = 'auth.users'::regclass
         AND trigger_row.tgname = 'on_auth_user_created_grant_staff'
         AND NOT trigger_row.tgisinternal
     ) IS DISTINCT FROM v_before.created_staff_trigger_definition
     OR (
       SELECT pg_get_triggerdef(trigger_row.oid)
       FROM pg_trigger trigger_row
       WHERE trigger_row.tgrelid = 'auth.users'::regclass
         AND trigger_row.tgname = 'on_auth_user_confirmed_grant_staff'
         AND NOT trigger_row.tgisinternal
     ) IS DISTINCT FROM v_before.confirmed_staff_trigger_definition THEN
    RAISE EXCEPTION 'repair did not restore the exact staff trigger definitions';
  END IF;

  IF has_function_privilege(
       'anon', 'public.grant_staff_role_for_verified_email()', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.grant_staff_role_for_verified_email()', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.grant_staff_role_for_verified_email()', 'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.grant_staff_role_for_verified_allowlist()', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.grant_staff_role_for_verified_allowlist()', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.grant_staff_role_for_verified_allowlist()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'repair failed: staff trigger helper remains API-executable';
  END IF;

  SELECT md5(COALESCE(jsonb_agg(to_jsonb(pol) ORDER BY pol.tablename, pol.policyname)::text, '[]'))
    INTO v_pheno_policy_fingerprint
    FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND pol.tablename LIKE 'pheno_%';
  IF v_pheno_policy_fingerprint IS DISTINCT FROM v_before.pheno_policy_fingerprint THEN
    RAISE EXCEPTION 'repair changed pheno policy definitions';
  END IF;

  SELECT hunt.setup_completed_at
    INTO STRICT v_setup_completed_at
    FROM restored_history_setup_null_fixture fixture
    JOIN public.pheno_hunts hunt ON hunt.id = fixture.hunt_id;
  IF v_setup_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'repair path did not preserve intentional setup NULL';
  END IF;

  SELECT count(*)
    INTO v_receipt_marker_count
    FROM pg_policies pol
   WHERE pol.schemaname = 'public'
     AND pol.tablename = 'ai_doctor_review_evidence_receipts'
     AND pol.policyname = 'server_only_no_client_access'
     AND pol.cmd = 'SELECT'
     AND pol.roles::text = '{authenticated}'
     AND pol.qual = 'false';
  IF v_receipt_marker_count <> 1
     OR has_table_privilege(
       'anon', 'public.ai_doctor_review_evidence_receipts', 'SELECT'
     )
     OR has_table_privilege(
       'authenticated', 'public.ai_doctor_review_evidence_receipts', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'repair did not preserve the receipts server-only deny boundary';
  END IF;
END;
$repair$;

SELECT 'PASS: prepared late history preserved grower state and converged through repair' AS result;

ROLLBACK;
