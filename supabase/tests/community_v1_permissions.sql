-- Community V1 catalog proof (T-CAT-01 … T-CAT-06, Task 2 backend packet §8).
-- Run with:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/community_v1_permissions.sql
--
-- Local disposable database only. Every assertion raises on failure; success
-- prints ✓ notices. Written before the Community V1 migration exists: until
-- then the first block fails on the missing relation (the RED receipt).

\set ON_ERROR_STOP on
BEGIN;

-- T-CAT-01: RLS enabled and forced on all 13 community tables.
DO $$
DECLARE tbl TEXT; enabled BOOLEAN; forced BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'community_profiles', 'community_follows', 'community_collections',
    'community_collection_access', 'community_collection_items',
    'community_media_derivatives', 'community_blocks', 'community_reports',
    'community_digest_seen', 'community_moderators', 'community_preview_tokens',
    'community_command_receipts', 'community_feature_state'
  ] LOOP
    SELECT relrowsecurity, relforcerowsecurity INTO enabled, forced
      FROM pg_class WHERE oid = format('public.%I', tbl)::regclass;
    ASSERT enabled AND forced, format('T-CAT-01 RLS not enabled and forced on public.%I', tbl);
  END LOOP;
  ASSERT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
             AND c.relname LIKE 'community\_%') = 13,
    'T-CAT-01 expected exactly 13 community tables';
  RAISE NOTICE '✓ T-CAT-01 RLS enabled and forced on all 13 community tables';
END $$;

-- T-CAT-02: no table or column privilege for PUBLIC, anon or authenticated (survives db reset + seed).
-- Reads the ACLs directly: information_schema.role_table_grants omits grants to PUBLIC.
DO $$
DECLARE leaked TEXT; tbl RECORD; role_name TEXT;
BEGIN
  SELECT string_agg(format('%s on %s (%s)',
                           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END,
                           c.relname, a.privilege_type), ', ')
    INTO leaked
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE 'community\_%'
     AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'));
  ASSERT leaked IS NULL, format('T-CAT-02 client table grants present: %s', leaked);
  FOR tbl IN
    SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE 'community\_%'
  LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      ASSERT NOT has_table_privilege(role_name, tbl.oid,
                 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         AND NOT has_any_column_privilege(role_name, tbl.oid, 'SELECT, INSERT, UPDATE, REFERENCES'),
        format('T-CAT-02 %I holds a privilege on %I (direct, column-level or via PUBLIC)', role_name, tbl.relname);
    END LOOP;
  END LOOP;
  RAISE NOTICE '✓ T-CAT-02 no client table or column grants on community tables';
END $$;

-- T-CAT-03: exact signatures (no extra overloads), definer, the exact fixed search_path
-- with pg_temp last, and the EXECUTE matrix, per function.
DO $$
DECLARE
  -- Identity arguments per client RPC (packet §6.3; mutating RPCs add p_idempotency_key).
  client_rpcs JSONB := '{
    "community_profile_upsert":     ["p_bio text", "p_display_name text", "p_idempotency_key uuid", "p_username text"],
    "community_profile_search":     ["p_username text"],
    "community_profile_deactivate": ["p_idempotency_key uuid"],
    "community_follow_set":         ["p_follow boolean", "p_idempotency_key uuid", "p_profile_id uuid"],
    "community_collection_draft":   ["p_collection_handle uuid", "p_description text", "p_idempotency_key uuid", "p_source_label text", "p_title text"],
    "community_source_entries":     ["p_cursor text", "p_limit integer"],
    "community_preview_create":     ["p_collection_handle uuid", "p_entries jsonb", "p_idempotency_key uuid"],
    "community_publish":            ["p_collection_handle uuid", "p_idempotency_key uuid", "p_preview_token text"],
    "community_unpublish":          ["p_collection_handle uuid", "p_idempotency_key uuid"],
    "community_access_request":     ["p_collection_handle uuid", "p_idempotency_key uuid"],
    "community_access_decide":      ["p_access_handle uuid", "p_decision text", "p_expected_revision integer", "p_idempotency_key uuid"],
    "community_access_withdraw":    ["p_access_handle uuid", "p_expected_revision integer", "p_idempotency_key uuid"],
    "community_access_leave":       ["p_collection_handle uuid", "p_idempotency_key uuid"],
    "community_collection_read":    ["p_collection_handle uuid", "p_cursor text", "p_limit integer"],
    "community_digest_read":        ["p_cursor text", "p_limit integer"],
    "community_digest_seen":        ["p_publication_handles uuid[]"],
    "community_block_set":          ["p_block boolean", "p_idempotency_key uuid", "p_profile_id uuid"],
    "community_report_create":      ["p_idempotency_key uuid", "p_publication_handle uuid", "p_reason_code text", "p_reason_text text"],
    "community_moderation_list":    ["p_cursor text", "p_limit integer"],
    "community_moderation_decide":  ["p_decision text", "p_idempotency_key uuid", "p_reason text", "p_report_handle uuid"]
  }'::jsonb;
  server_rpcs JSONB := '{
    "community_account_deletion_begin": ["p_user_id uuid"],
    "community_media_lookup":           ["p_derivative_handle uuid", "p_viewer_user_id uuid"]
  }'::jsonb;
  helpers TEXT[] := ARRAY['community_actor', 'community_can_read', 'community_fmt_ts'];
  signatures JSONB := client_rpcs || server_rpcs;
  fn RECORD; name TEXT; got JSONB;
BEGIN
  FOR name IN SELECT jsonb_object_keys(signatures) UNION ALL SELECT unnest(helpers) LOOP
    ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = name) = 1,
      format('T-CAT-03 expected exactly one public.%I (no overloads)', name);
  END LOOP;
  FOR fn IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'community\_%'
  LOOP
    ASSERT signatures ? fn.proname OR fn.proname = ANY (helpers),
      format('T-CAT-03 unexpected community function %I', fn.proname);
    IF signatures ? fn.proname THEN
      SELECT coalesce(jsonb_agg(arg ORDER BY arg), '[]'::jsonb) INTO got
        FROM unnest(string_to_array(pg_get_function_identity_arguments(fn.oid), ', ')) AS arg
       WHERE arg <> '';
      ASSERT got = signatures -> fn.proname,
        format('T-CAT-03 %I has arguments %s, expected %s', fn.proname, got, signatures -> fn.proname);
    END IF;
    ASSERT fn.prosecdef, format('T-CAT-03 %I is not SECURITY DEFINER', fn.proname);
    ASSERT (SELECT array_agg(c) FROM unnest(fn.proconfig) c WHERE c LIKE 'search_path=%')
             = ARRAY['search_path=public, pg_temp'],
      format('T-CAT-03 %I search_path must be exactly public, pg_temp (got %s)', fn.proname, fn.proconfig);
    ASSERT NOT has_function_privilege('anon', fn.oid, 'EXECUTE'),
      format('T-CAT-03 anon can execute %I', fn.proname);
    ASSERT fn.proacl IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM aclexplode(fn.proacl) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
      format('T-CAT-03 PUBLIC can execute %I', fn.proname);
    ASSERT has_function_privilege('authenticated', fn.oid, 'EXECUTE') = (client_rpcs ? fn.proname),
      format('T-CAT-03 authenticated EXECUTE on %I is wrong', fn.proname);
    ASSERT has_function_privilege('service_role', fn.oid, 'EXECUTE') = (server_rpcs ? fn.proname),
      format('T-CAT-03 service_role EXECUTE on %I is wrong', fn.proname);
  END LOOP;
  RAISE NOTICE '✓ T-CAT-03 community functions have exact signatures, definer, pinned search_path and grants';
END $$;

-- T-CAT-04: no views over community tables; no policy TO anon.
DO $$
DECLARE found TEXT;
BEGIN
  SELECT string_agg(DISTINCT v.relname, ', ') INTO found
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class AND v.relkind IN ('v', 'm')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relname LIKE 'community\_%' AND v.oid <> t.oid;
  ASSERT found IS NULL, format('T-CAT-04 views over community tables: %s', found);
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ') INTO found
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'community\_%'
     AND roles && ARRAY['anon', 'public']::name[];
  ASSERT found IS NULL, format('T-CAT-04 policies for anon/public: %s', found);
  RAISE NOTICE '✓ T-CAT-04 no community views and no anon policies';
END $$;

-- T-CAT-05: the kill switch exists, has exactly one row, and starts disabled.
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.community_feature_state) = 1,
    'T-CAT-05 community_feature_state must hold exactly one row';
  ASSERT (SELECT enabled FROM public.community_feature_state) = false,
    'T-CAT-05 community_feature_state.enabled must default to false';
  RAISE NOTICE '✓ T-CAT-05 Community V1 kill switch defaults off';
END $$;

-- T-CAT-06: no approved Community RPC declares a defaulted argument. Identity
-- arguments omit DEFAULT clauses, so T-CAT-03 alone would accept, say, a defaulted
-- p_idempotency_key that a caller could silently leave out.
DO $$
DECLARE
  fn RECORD; checked INTEGER := 0;
BEGIN
  FOR fn IN
    SELECT p.proname, p.pronargdefaults
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'community\_%'
       AND p.proname <> ALL (ARRAY['community_actor', 'community_can_read', 'community_fmt_ts'])
  LOOP
    ASSERT fn.pronargdefaults = 0,
      format('T-CAT-06 %I declares %s defaulted argument(s); approved RPCs take none', fn.proname, fn.pronargdefaults);
    checked := checked + 1;
  END LOOP;
  ASSERT checked = 17, format('T-CAT-06 expected 17 approved community RPCs, checked %s', checked);
  RAISE NOTICE '✓ T-CAT-06 approved community RPCs declare no defaulted arguments';
END $$;

ROLLBACK;
