-- Forward-repair the Action Queue table ACL after production measurement
-- proved that RLS-exempt table privileges remained on browser roles. Accept
-- only the measured post-transition ACL or this migration's exact canonical
-- end-state. Preserve every non-client ACL and all rows, policies, and
-- Action Queue function definitions byte-for-byte.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $action_queue_table_acl_preflight$
DECLARE
  v_postgres_oid oid;
  v_anon_oid oid;
  v_authenticated_oid oid;
  v_client_role_contract_count integer;
  v_table_contract_count integer;
  v_policy_total integer;
  v_policy_contract_count integer;
  v_function_total integer;
  v_function_contract_count integer;
  v_public_acl_count integer;
  v_client_column_acl_count integer;
  v_client_grant_option_count integer;
  v_direct_client_acl text[];
  v_measured_direct_acl text[];
  v_effective_client_acl text[];
  v_measured_effective_acl text[];
  v_canonical_effective_acl text[] := ARRAY[
    'action_queue|authenticated|INSERT',
    'action_queue|authenticated|SELECT',
    'action_queue_events|authenticated|INSERT',
    'action_queue_events|authenticated|SELECT'
  ]::text[];
  v_measured_acl_state boolean := false;
  v_canonical_acl_state boolean := false;
  v_privileged_acl text;
  v_privileged_effective_acl text;
  v_rows text;
  v_policies text;
  v_functions text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260820, 235900);

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_prerequisite_drift';
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

  IF v_client_role_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_role_drift';
  END IF;

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

  IF v_table_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_prerequisite_drift';
  END IF;

  LOCK TABLE public.action_queue, public.action_queue_events IN SHARE MODE;

  SELECT pg_catalog.count(*)
  INTO v_policy_total
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  );

  SELECT pg_catalog.count(*)
  INTO v_policy_contract_count
  FROM pg_catalog.pg_policy AS p
  WHERE (
      p.polrelid = 'public.action_queue'::pg_catalog.regclass
      AND p.polname = 'Users view own action_queue'
      AND p.polpermissive
      AND p.polcmd = 'r'
      AND p.polroles = ARRAY[v_authenticated_oid]
      AND p.polwithcheck IS NULL
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
      ))) = 'b3c61a20be8f6d80b62d4abd81066fab'
    )
    OR (
      p.polrelid = 'public.action_queue'::pg_catalog.regclass
      AND p.polname = 'Users insert own action_queue'
      AND p.polpermissive
      AND p.polcmd = 'a'
      AND p.polroles = ARRAY[v_authenticated_oid]
      AND p.polqual IS NULL
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
      ))) = 'e08f43c1f4e1308a8d50e6cab797f933'
    )
    OR (
      p.polrelid = 'public.action_queue_events'::pg_catalog.regclass
      AND p.polname = 'Users view own action_queue_events'
      AND p.polpermissive
      AND p.polcmd = 'r'
      AND p.polroles = ARRAY[v_authenticated_oid]
      AND p.polwithcheck IS NULL
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
      ))) = 'b3c61a20be8f6d80b62d4abd81066fab'
    )
    OR (
      p.polrelid = 'public.action_queue_events'::pg_catalog.regclass
      AND p.polname = 'Users append own non-transition action_queue_events'
      AND p.polpermissive
      AND p.polcmd = 'a'
      AND p.polroles = ARRAY[v_authenticated_oid]
      AND p.polqual IS NULL
      AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
      ))) = '420914cd6ffbd2d552c30e8d7b6ddf73'
    );

  IF v_policy_total <> 4 OR v_policy_contract_count <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_policy_drift';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_function_total
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'action_queue_guard_decision_fields',
      'action_queue_transition'
    );

  SELECT pg_catalog.count(*)
  INTO v_function_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND owner_role.rolname = 'postgres'
    AND l.lanname = 'plpgsql'
    AND p.prokind = 'f'
    AND p.prosecdef
    AND NOT p.proretset
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.provolatile = 'v'
    AND p.proparallel = 'u'
    AND (
      (
        p.proname = 'action_queue_guard_decision_fields'
        AND p.prorettype = 'trigger'::pg_catalog.regtype
        AND p.pronargs = 0
        AND p.pronargdefaults = 0
        AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
        AND pg_catalog.octet_length(
          pg_catalog.replace(p.prosrc, E'\r', '')
        ) = 1101
        AND pg_catalog.md5(
          pg_catalog.replace(p.prosrc, E'\r', '')
        ) = '88e81c4dfbc6d17260def35d1a619ee1'
        AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
      OR (
        p.proname = 'action_queue_transition'
        AND p.prorettype = 'jsonb'::pg_catalog.regtype
        AND p.pronargs = 4
        AND p.pronargdefaults = 1
        AND pg_catalog.pg_get_function_arguments(p.oid) =
          'p_action_queue_id uuid, p_transition text, p_expected_status text, p_note text DEFAULT NULL::text'
        AND p.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.octet_length(
          pg_catalog.replace(p.prosrc, E'\r', '')
        ) = 4997
        AND pg_catalog.md5(
          pg_catalog.replace(p.prosrc, E'\r', '')
        ) = 'ce755f8e6a6515640a2f86c15de3ba63'
        AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
    );

  IF v_function_total <> 2 OR v_function_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_function_drift';
  END IF;

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

  WITH privilege_universe AS (
    SELECT DISTINCT acl.privilege_type
    FROM pg_catalog.aclexplode(
      pg_catalog.acldefault('r', v_postgres_oid)
    ) AS acl
    WHERE acl.privilege_type NOT IN ('UPDATE', 'DELETE')
  ), subjects(role_name) AS (
    VALUES ('anon'::text), ('authenticated'::text)
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT pg_catalog.array_agg(
    pg_catalog.format('%s|%s|%s', r.table_name, s.role_name, u.privilege_type)
    ORDER BY r.table_name, s.role_name, u.privilege_type
  )
  INTO v_measured_effective_acl
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u;

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

  SELECT COALESCE(pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s',
      c.relname,
      grantee.rolname,
      acl.privilege_type,
      acl.is_grantable,
      grantor.rolname
    )
    ORDER BY c.relname, grantee.rolname, acl.privilege_type, grantor.rolname
  ), ARRAY[]::text[])
  INTO v_direct_client_acl
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
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
    WHERE acl.privilege_type NOT IN ('UPDATE', 'DELETE')
  ), subjects(role_name) AS (
    VALUES ('anon'::text), ('authenticated'::text)
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s|%s|f|postgres',
      r.table_name,
      s.role_name,
      u.privilege_type
    )
    ORDER BY r.table_name, s.role_name, u.privilege_type
  )
  INTO v_measured_direct_acl
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u;

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

  IF v_client_column_acl_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_column_acl_drift';
  END IF;

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

  v_measured_acl_state :=
    v_direct_client_acl = v_measured_direct_acl
    AND v_effective_client_acl = v_measured_effective_acl;

  v_canonical_acl_state :=
    v_direct_client_acl = ARRAY[
      'action_queue|authenticated|INSERT|f|postgres',
      'action_queue|authenticated|SELECT|f|postgres',
      'action_queue_events|authenticated|INSERT|f|postgres',
      'action_queue_events|authenticated|SELECT|f|postgres'
    ]::text[]
    AND v_effective_client_acl = v_canonical_effective_acl;

  IF v_public_acl_count <> 0 OR v_client_grant_option_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_acl_drift';
  END IF;

  IF NOT v_measured_acl_state AND NOT v_canonical_acl_state THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_effective_acl_drift';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s',
      c.relname,
      COALESCE(grantee.rolname, acl.grantee::text),
      acl.privilege_type,
      acl.is_grantable,
      COALESCE(grantor.rolname, acl.grantor::text)
    ),
    E'\n' ORDER BY c.relname, acl.grantee, acl.privilege_type, acl.grantor
  ), ''))
  INTO v_privileged_acl
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
  WHERE c.oid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND acl.grantee NOT IN (0, v_anon_oid, v_authenticated_oid);

  WITH privilege_universe AS (
    SELECT DISTINCT acl.privilege_type
    FROM pg_catalog.aclexplode(
      pg_catalog.acldefault('r', v_postgres_oid)
    ) AS acl
  ), subjects(role_name) AS (
    SELECT rolname
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'service_role', 'sandbox_exec')
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s',
      r.table_name,
      s.role_name,
      u.privilege_type,
      pg_catalog.has_table_privilege(
        s.role_name,
        pg_catalog.format('public.%I', r.table_name),
        u.privilege_type || ' WITH GRANT OPTION'
      )
    ),
    E'\n' ORDER BY r.table_name, s.role_name, u.privilege_type
  ), ''))
  INTO v_privileged_effective_acl
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u
  WHERE pg_catalog.has_table_privilege(
    s.role_name,
    pg_catalog.format('public.%I', r.table_name),
    u.privilege_type
  );

  SELECT pg_catalog.format(
    '%s|%s|%s|%s',
    (SELECT pg_catalog.count(*) FROM public.action_queue),
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
       pg_catalog.to_jsonb(q)::text, E'\n' ORDER BY q.id
     ), '')) FROM public.action_queue AS q),
    (SELECT pg_catalog.count(*) FROM public.action_queue_events),
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
       pg_catalog.to_jsonb(e)::text, E'\n' ORDER BY e.id
     ), '')) FROM public.action_queue_events AS e)
  )
  INTO v_rows;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s|%s|%s',
      p.oid,
      p.polname,
      p.polpermissive,
      p.polcmd,
      p.polroles::text,
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    ),
    E'\n' ORDER BY p.polrelid, p.polname
  ), ''))
  INTO v_policies
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  );

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s|%s|%s',
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid),
      owner_role.rolname,
      COALESCE(p.proacl::text, ''),
      pg_catalog.pg_get_functiondef(p.oid),
      COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '')
    ),
    E'\n' ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  ), ''))
  INTO v_functions
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'action_queue\_%' ESCAPE '\';

  PERFORM pg_catalog.set_config(
    'verdant.action_queue_table_acl.privileged_acl_before',
    v_privileged_acl,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_table_acl.privileged_effective_before',
    v_privileged_effective_acl,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_table_acl.rows_before',
    v_rows,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_table_acl.policies_before',
    v_policies,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_table_acl.functions_before',
    v_functions,
    true
  );
END;
$action_queue_table_acl_preflight$;

REVOKE ALL PRIVILEGES ON TABLE
  public.action_queue,
  public.action_queue_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE
  public.action_queue,
  public.action_queue_events
TO authenticated;

DO $action_queue_table_acl_postflight$
DECLARE
  v_postgres_oid oid;
  v_anon_oid oid;
  v_authenticated_oid oid;
  v_client_role_contract_count integer;
  v_client_acl text[];
  v_effective_client_acl text[];
  v_canonical_effective_acl text[] := ARRAY[
    'action_queue|authenticated|INSERT',
    'action_queue|authenticated|SELECT',
    'action_queue_events|authenticated|INSERT',
    'action_queue_events|authenticated|SELECT'
  ]::text[];
  v_public_acl_count integer;
  v_client_column_acl_count integer;
  v_privileged_acl text;
  v_privileged_effective_acl text;
  v_rows text;
  v_policies text;
  v_functions text;
BEGIN
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

  IF v_client_role_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_role_drift';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s',
      c.relname,
      grantee.rolname,
      acl.privilege_type,
      acl.is_grantable,
      grantor.rolname
    )
    ORDER BY c.relname, grantee.rolname, acl.privilege_type, grantor.rolname
  ), ARRAY[]::text[])
  INTO v_client_acl
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
  WHERE c.oid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND acl.grantee IN (v_anon_oid, v_authenticated_oid);

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

  IF v_client_acl IS DISTINCT FROM ARRAY[
       'action_queue|authenticated|INSERT|f|postgres',
       'action_queue|authenticated|SELECT|f|postgres',
       'action_queue_events|authenticated|INSERT|f|postgres',
       'action_queue_events|authenticated|SELECT|f|postgres'
     ]::text[]
     OR v_effective_client_acl IS DISTINCT FROM v_canonical_effective_acl
     OR v_public_acl_count <> 0
     OR v_client_column_acl_count <> 0
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'TRIGGER'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'TRIGGER'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'TRUNCATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'REFERENCES'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'TRIGGER'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue', 'SELECT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue', 'INSERT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue', 'REFERENCES'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue_events', 'SELECT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue_events', 'INSERT'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_any_column_privilege(
       'anon', 'public.action_queue_events', 'REFERENCES'
     )
     OR pg_catalog.has_any_column_privilege(
       'authenticated', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_any_column_privilege(
       'authenticated', 'public.action_queue', 'REFERENCES'
     )
     OR pg_catalog.has_any_column_privilege(
       'authenticated', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_any_column_privilege(
       'authenticated', 'public.action_queue_events', 'REFERENCES'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_postcondition_failed';
  END IF;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s',
      c.relname,
      COALESCE(grantee.rolname, acl.grantee::text),
      acl.privilege_type,
      acl.is_grantable,
      COALESCE(grantor.rolname, acl.grantor::text)
    ),
    E'\n' ORDER BY c.relname, acl.grantee, acl.privilege_type, acl.grantor
  ), ''))
  INTO v_privileged_acl
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
  WHERE c.oid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  )
    AND acl.grantee NOT IN (0, v_anon_oid, v_authenticated_oid);

  WITH privilege_universe AS (
    SELECT DISTINCT acl.privilege_type
    FROM pg_catalog.pg_class AS c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.acldefault('r', c.relowner)
    ) AS acl
    WHERE c.oid = 'public.action_queue'::pg_catalog.regclass
  ), subjects(role_name) AS (
    SELECT rolname
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'service_role', 'sandbox_exec')
  ), relations(table_name) AS (
    VALUES ('action_queue'::text), ('action_queue_events'::text)
  )
  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s',
      r.table_name,
      s.role_name,
      u.privilege_type,
      pg_catalog.has_table_privilege(
        s.role_name,
        pg_catalog.format('public.%I', r.table_name),
        u.privilege_type || ' WITH GRANT OPTION'
      )
    ),
    E'\n' ORDER BY r.table_name, s.role_name, u.privilege_type
  ), ''))
  INTO v_privileged_effective_acl
  FROM relations AS r
  CROSS JOIN subjects AS s
  CROSS JOIN privilege_universe AS u
  WHERE pg_catalog.has_table_privilege(
    s.role_name,
    pg_catalog.format('public.%I', r.table_name),
    u.privilege_type
  );

  SELECT pg_catalog.format(
    '%s|%s|%s|%s',
    (SELECT pg_catalog.count(*) FROM public.action_queue),
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
       pg_catalog.to_jsonb(q)::text, E'\n' ORDER BY q.id
     ), '')) FROM public.action_queue AS q),
    (SELECT pg_catalog.count(*) FROM public.action_queue_events),
    (SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
       pg_catalog.to_jsonb(e)::text, E'\n' ORDER BY e.id
     ), '')) FROM public.action_queue_events AS e)
  )
  INTO v_rows;

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s|%s|%s',
      p.oid,
      p.polname,
      p.polpermissive,
      p.polcmd,
      p.polroles::text,
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    ),
    E'\n' ORDER BY p.polrelid, p.polname
  ), ''))
  INTO v_policies
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid IN (
    'public.action_queue'::pg_catalog.regclass,
    'public.action_queue_events'::pg_catalog.regclass
  );

  SELECT pg_catalog.md5(COALESCE(pg_catalog.string_agg(
    pg_catalog.format(
      '%s|%s|%s|%s|%s|%s|%s',
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid),
      owner_role.rolname,
      COALESCE(p.proacl::text, ''),
      pg_catalog.pg_get_functiondef(p.oid),
      COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '')
    ),
    E'\n' ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  ), ''))
  INTO v_functions
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'action_queue\_%' ESCAPE '\';

  IF v_privileged_acl IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.action_queue_table_acl.privileged_acl_before', true
     )
     OR v_privileged_effective_acl IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.action_queue_table_acl.privileged_effective_before', true
     )
     OR v_rows IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.action_queue_table_acl.rows_before', true
     )
     OR v_policies IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.action_queue_table_acl.policies_before', true
     )
     OR v_functions IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.action_queue_table_acl.functions_before', true
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_table_acl_forward_repair_scope_changed';
  END IF;
END;
$action_queue_table_acl_postflight$;

COMMIT;
