CREATE OR REPLACE FUNCTION public.admin_schema_audit(_migrations text[], _tables text[], _columns jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _migrations_result jsonb;
  _tables_result jsonb;
  _columns_result jsonb;
  _rls_result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(_uid, 'operator'::public.app_role)
       OR public.has_role(_uid, 'staff'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH input AS (
    SELECT unnest(COALESCE(_migrations, ARRAY[]::text[])) AS filename
  ),
  parsed AS (
    SELECT filename, substring(filename FROM '^(\d{14})_') AS version FROM input
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'filename', p.filename,
      'version', p.version,
      'applied', sm.version IS NOT NULL,
      'applied_at', NULL
    ) ORDER BY p.filename
  ), '[]'::jsonb)
  INTO _migrations_result
  FROM parsed p
  LEFT JOIN supabase_migrations.schema_migrations sm ON sm.version = p.version;

  WITH input AS (
    SELECT unnest(COALESCE(_tables, ARRAY[]::text[])) AS table_name
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('table', i.table_name, 'exists', t.tablename IS NOT NULL)
    ORDER BY i.table_name
  ), '[]'::jsonb)
  INTO _tables_result
  FROM input i
  LEFT JOIN pg_tables t
    ON t.schemaname = 'public' AND t.tablename = i.table_name;

  WITH input AS (
    SELECT
      (elem->>'table')  AS table_name,
      (elem->>'column') AS column_name
    FROM jsonb_array_elements(COALESCE(_columns, '[]'::jsonb)) AS elem
    WHERE elem ? 'table' AND elem ? 'column'
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table',  i.table_name,
      'column', i.column_name,
      'exists', c.column_name IS NOT NULL
    ) ORDER BY i.table_name, i.column_name
  ), '[]'::jsonb)
  INTO _columns_result
  FROM input i
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = i.table_name
   AND c.column_name = i.column_name;

  -- RLS + policy + grant audit for the requested tables
  WITH input AS (
    SELECT unnest(COALESCE(_tables, ARRAY[]::text[])) AS table_name
  ),
  rls AS (
    SELECT
      i.table_name,
      c.oid AS class_oid,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM input i
    LEFT JOIN pg_class c
      ON c.relname = i.table_name
     AND c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'r'
  ),
  policy_counts AS (
    SELECT r.table_name, COUNT(p.policyname)::int AS policy_count
    FROM rls r
    LEFT JOIN pg_policies p
      ON p.schemaname = 'public' AND p.tablename = r.table_name
    GROUP BY r.table_name
  ),
  grants AS (
    SELECT
      r.table_name,
      g.grantee,
      COALESCE(array_agg(DISTINCT g.privilege_type ORDER BY g.privilege_type)
               FILTER (WHERE g.privilege_type IS NOT NULL),
               ARRAY[]::text[]) AS privileges
    FROM rls r
    LEFT JOIN information_schema.role_table_grants g
      ON g.table_schema = 'public'
     AND g.table_name = r.table_name
     AND g.grantee IN ('anon','authenticated','service_role')
    WHERE r.class_oid IS NOT NULL
    GROUP BY r.table_name, g.grantee
  ),
  grants_by_table AS (
    SELECT
      table_name,
      jsonb_object_agg(grantee, to_jsonb(privileges)) FILTER (WHERE grantee IS NOT NULL) AS grants_map
    FROM grants
    GROUP BY table_name
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'table', r.table_name,
      'exists', r.class_oid IS NOT NULL,
      'rls_enabled', COALESCE(r.rls_enabled, false),
      'rls_forced', COALESCE(r.rls_forced, false),
      'policy_count', COALESCE(pc.policy_count, 0),
      'grants', COALESCE(gt.grants_map, '{}'::jsonb)
    ) ORDER BY r.table_name
  ), '[]'::jsonb)
  INTO _rls_result
  FROM rls r
  LEFT JOIN policy_counts pc ON pc.table_name = r.table_name
  LEFT JOIN grants_by_table gt ON gt.table_name = r.table_name;

  RETURN jsonb_build_object(
    'migrations', _migrations_result,
    'tables',     _tables_result,
    'columns',    _columns_result,
    'rls_audit',  _rls_result,
    'checked_at', to_jsonb(now())
  );
END;
$function$;