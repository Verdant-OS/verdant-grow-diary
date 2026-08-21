-- Disposable local-replay compatibility baseline.
--
-- Fresh Supabase replay reaches the Action Queue ACL repair with the legacy
-- local Data API DML defaults already narrowed by the transition migration:
-- anon and authenticated each retain only SELECT/INSERT. The immutable repair
-- deliberately accepts only the measured hosted ACL or its canonical end
-- state, so validate this exact local-only input and converge it to canonical
-- immediately before that repair runs. Trusted-role ACLs remain untouched.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $action_queue_local_replay_acl_baseline$
DECLARE
  v_postgres_oid oid;
  v_anon_oid oid;
  v_authenticated_oid oid;
  v_client_role_contract_count integer;
  v_table_contract_count integer;
  v_public_acl_count integer;
  v_client_column_acl_count integer;
  v_client_grant_option_count integer;
  v_direct_client_acl text[];
  v_effective_client_acl text[];
  v_local_replay_acl_state boolean := false;
  v_canonical_acl_state boolean := false;
BEGIN
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'anon', 'authenticated')
  ) <> 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_local_replay_acl_baseline_drift',
      DETAIL = 'required_roles_missing';
  END IF;

  SELECT oid INTO v_postgres_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'postgres';

  SELECT oid INTO v_anon_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'anon';

  SELECT oid INTO v_authenticated_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'authenticated';

  SELECT pg_catalog.count(*)
  INTO v_client_role_contract_count
  FROM pg_catalog.pg_roles AS role_state
  WHERE role_state.rolname IN ('anon', 'authenticated')
    AND NOT role_state.rolsuper
    AND NOT role_state.rolbypassrls
    AND NOT role_state.rolcreaterole
    AND NOT role_state.rolcreatedb;

  SELECT pg_catalog.count(*)
  INTO v_table_contract_count
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('action_queue', 'action_queue_events')
    AND c.relkind = 'r'
    AND c.relowner = v_postgres_oid
    AND c.relrowsecurity
    AND NOT c.relforcerowsecurity;

  IF v_client_role_contract_count <> 2 OR v_table_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_local_replay_acl_baseline_drift',
      DETAIL = pg_catalog.format(
        'client_role_contract_count=%s table_contract_count=%s',
        v_client_role_contract_count,
        v_table_contract_count
      );
  END IF;

  LOCK TABLE public.action_queue, public.action_queue_events IN SHARE MODE;

  SELECT COALESCE(pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s|%s|%s',
      c.relname,
      grantee.rolname,
      acl.privilege_type,
      acl.is_grantable
    )
    ORDER BY c.relname, grantee.rolname, acl.privilege_type
  ), ARRAY[]::text[])
  INTO v_direct_client_acl
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE c.oid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND acl.grantee IN (v_anon_oid, v_authenticated_oid);

  WITH privilege_universe AS (
    SELECT DISTINCT acl.privilege_type
    FROM pg_catalog.aclexplode(
      pg_catalog.acldefault('r', v_postgres_oid)
    ) AS acl
  ), subjects(role_name) AS (
    VALUES ('anon'::text), ('authenticated'::text)
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT COALESCE(pg_catalog.array_agg(
    pg_catalog.format('%s|%s|%s', r.table_name, s.role_name, u.privilege_type)
    ORDER BY r.table_name, s.role_name, u.privilege_type
  ), ARRAY[]::text[])
  INTO v_effective_client_acl
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u
  WHERE pg_catalog.has_table_privilege(
    s.role_name,
    pg_catalog.format('public.%I', r.table_name),
    u.privilege_type
  );

  SELECT pg_catalog.count(*)
  INTO v_public_acl_count
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  WHERE c.oid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND acl.grantee = 0;

  SELECT pg_catalog.count(*)
  INTO v_client_column_acl_count
  FROM pg_catalog.pg_attribute AS a
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
  WHERE a.attrelid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND acl.grantee IN (0, v_anon_oid, v_authenticated_oid);

  WITH privilege_universe AS (
    SELECT DISTINCT acl.privilege_type
    FROM pg_catalog.aclexplode(
      pg_catalog.acldefault('r', v_postgres_oid)
    ) AS acl
  ), subjects(role_name) AS (
    VALUES ('anon'::text), ('authenticated'::text)
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT pg_catalog.count(*)
  INTO v_client_grant_option_count
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u
  WHERE pg_catalog.has_table_privilege(
    s.role_name,
    pg_catalog.format('public.%I', r.table_name),
    u.privilege_type || ' WITH GRANT OPTION'
  );

  v_local_replay_acl_state :=
    v_direct_client_acl = ARRAY[
      'action_queue|anon|INSERT|f',
      'action_queue|anon|SELECT|f',
      'action_queue|authenticated|INSERT|f',
      'action_queue|authenticated|SELECT|f',
      'action_queue_events|anon|INSERT|f',
      'action_queue_events|anon|SELECT|f',
      'action_queue_events|authenticated|INSERT|f',
      'action_queue_events|authenticated|SELECT|f'
    ]::text[]
    AND v_effective_client_acl = ARRAY[
      'action_queue|anon|INSERT',
      'action_queue|anon|SELECT',
      'action_queue|authenticated|INSERT',
      'action_queue|authenticated|SELECT',
      'action_queue_events|anon|INSERT',
      'action_queue_events|anon|SELECT',
      'action_queue_events|authenticated|INSERT',
      'action_queue_events|authenticated|SELECT'
    ]::text[];

  v_canonical_acl_state :=
    v_direct_client_acl = ARRAY[
      'action_queue|authenticated|INSERT|f',
      'action_queue|authenticated|SELECT|f',
      'action_queue_events|authenticated|INSERT|f',
      'action_queue_events|authenticated|SELECT|f'
    ]::text[]
    AND v_effective_client_acl = ARRAY[
      'action_queue|authenticated|INSERT',
      'action_queue|authenticated|SELECT',
      'action_queue_events|authenticated|INSERT',
      'action_queue_events|authenticated|SELECT'
    ]::text[];

  IF v_public_acl_count <> 0
     OR v_client_column_acl_count <> 0
     OR v_client_grant_option_count <> 0
     OR (NOT v_local_replay_acl_state AND NOT v_canonical_acl_state) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_local_replay_acl_baseline_drift',
      DETAIL = pg_catalog.format(
        'public_acl_count=%s client_column_acl_count=%s client_grant_option_count=%s direct_client_acl=%s effective_client_acl=%s',
        v_public_acl_count,
        v_client_column_acl_count,
        v_client_grant_option_count,
        v_direct_client_acl::text,
        v_effective_client_acl::text
      );
  END IF;
END;
$action_queue_local_replay_acl_baseline$;

REVOKE ALL PRIVILEGES ON TABLE
  public.action_queue,
  public.action_queue_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE
  public.action_queue,
  public.action_queue_events
TO authenticated;

COMMIT;
