-- Community V1 catalog proof (T-CAT-01 … T-CAT-05, Task 2 backend packet §8).
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

-- T-CAT-02: no table privilege for PUBLIC, anon or authenticated (survives db reset + seed).
DO $$
DECLARE leaked TEXT;
BEGIN
  SELECT string_agg(format('%s on %s (%s)', grantee, table_name, privilege_type), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'community\_%'
     AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  ASSERT leaked IS NULL, format('T-CAT-02 client table grants present: %s', leaked);
  RAISE NOTICE '✓ T-CAT-02 no client table grants on community tables';
END $$;

-- T-CAT-03: definer + fixed search_path, and the EXECUTE matrix, per function.
DO $$
DECLARE
  client_rpcs TEXT[] := ARRAY[
    'community_profile_upsert', 'community_profile_search', 'community_profile_deactivate',
    'community_follow_set', 'community_collection_draft', 'community_source_entries',
    'community_preview_create', 'community_publish', 'community_unpublish',
    'community_access_request', 'community_access_decide', 'community_access_withdraw',
    'community_access_leave', 'community_collection_read', 'community_digest_read',
    'community_digest_seen', 'community_block_set', 'community_report_create',
    'community_moderation_list', 'community_moderation_decide'
  ];
  server_rpcs TEXT[] := ARRAY['community_account_deletion_begin', 'community_media_lookup'];
  helpers TEXT[] := ARRAY['community_actor', 'community_can_read', 'community_fmt_ts'];
  fn RECORD; name TEXT;
BEGIN
  FOREACH name IN ARRAY client_rpcs || server_rpcs || helpers LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = name),
      format('T-CAT-03 missing function public.%I', name);
  END LOOP;
  FOR fn IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'community\_%'
  LOOP
    ASSERT fn.proname = ANY (client_rpcs || server_rpcs || helpers),
      format('T-CAT-03 unexpected community function %I', fn.proname);
    ASSERT fn.prosecdef, format('T-CAT-03 %I is not SECURITY DEFINER', fn.proname);
    ASSERT EXISTS (SELECT 1 FROM unnest(fn.proconfig) c WHERE c LIKE 'search_path=%'),
      format('T-CAT-03 %I has no fixed search_path', fn.proname);
    ASSERT NOT has_function_privilege('anon', fn.oid, 'EXECUTE'),
      format('T-CAT-03 anon can execute %I', fn.proname);
    ASSERT NOT EXISTS (SELECT 1 FROM aclexplode(
                        (SELECT proacl FROM pg_proc WHERE oid = fn.oid)) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
             AND (SELECT proacl FROM pg_proc WHERE oid = fn.oid) IS NOT NULL,
      format('T-CAT-03 PUBLIC can execute %I', fn.proname);
    ASSERT has_function_privilege('authenticated', fn.oid, 'EXECUTE') = (fn.proname = ANY (client_rpcs)),
      format('T-CAT-03 authenticated EXECUTE on %I is wrong', fn.proname);
    ASSERT has_function_privilege('service_role', fn.oid, 'EXECUTE') = (fn.proname = ANY (server_rpcs)),
      format('T-CAT-03 service_role EXECUTE on %I is wrong', fn.proname);
  END LOOP;
  RAISE NOTICE '✓ T-CAT-03 community functions are definer, pinned and correctly granted';
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

ROLLBACK;
