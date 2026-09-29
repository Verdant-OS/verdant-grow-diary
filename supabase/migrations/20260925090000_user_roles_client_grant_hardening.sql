-- Remove the browser roles' write and RLS-exempt privileges on public.user_roles.
--
-- Measured read-only on production (knkwiiywfkbqznbxwqfh, PostgreSQL 17.6) on
-- 2026-09-25: anon and authenticated each held every table privilege on
-- public.user_roles (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER and MAINTAIN). These are Supabase's default grants on new public
-- tables; no migration ever narrowed them. RLS keeps INSERT, UPDATE and DELETE
-- to operators ("Operators manage roles"), but RLS does not govern TRUNCATE,
-- REFERENCES, TRIGGER or MAINTAIN, and the write grants leave self-granted
-- roles one policy mistake away.
--
-- End state for the browser roles:
--   PUBLIC, anon    no privilege
--   authenticated   SELECT only; "Users view own roles" still decides the rows
--
-- Every other grantee (postgres, service_role and any platform role) keeps its
-- exact table and column privileges. Rows, policies, has_role(), triggers and
-- ownership are not touched.
--
-- Nothing in the app writes user_roles as a browser role. Roles come from the
-- SECURITY DEFINER staff-grant trigger, service_role scripts, and operators
-- with database access. assignRoleAsOperator() (src/lib/permissions.ts) has
-- no caller. After this migration an operator's browser session can still
-- read roles but can no longer insert, update or delete them. That is
-- intended.
--
-- Fails closed with SQLSTATE 55000, changing nothing, when a prerequisite
-- differs or when a browser role would still hold a privilege afterwards (for
-- example through membership in another role). Re-running it is a no-op.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $user_roles_client_grant_preflight$
DECLARE
  v_table regclass := pg_catalog.to_regclass('public.user_roles');
  v_role_count integer;
  v_client_role_contract_count integer;
  v_table_contract boolean;
  v_preserved text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260925, 90000);

  SELECT pg_catalog.count(*) INTO v_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role');

  SELECT pg_catalog.count(*) INTO v_client_role_contract_count
  FROM pg_catalog.pg_roles AS role_state
  WHERE role_state.rolname IN ('anon', 'authenticated')
    AND NOT role_state.rolsuper
    AND NOT role_state.rolbypassrls
    AND NOT role_state.rolcreaterole
    AND NOT role_state.rolcreatedb;

  IF v_table IS NULL OR v_role_count <> 4 OR v_client_role_contract_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'user_roles_client_grant_hardening_prerequisite_drift';
  END IF;

  SELECT
    c.relkind = 'r'
    AND c.relrowsecurity
    AND owner_role.rolname = 'postgres'
    AND pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER')
  INTO v_table_contract
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
  WHERE c.oid = v_table;

  IF NOT coalesce(v_table_contract, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'user_roles_client_grant_hardening_prerequisite_drift';
  END IF;

  -- Everything this migration must leave exactly as it found it: every
  -- non-browser table and column grant, and every policy.
  SELECT pg_catalog.md5(pg_catalog.concat_ws(E'\n',
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('table|%s|%s|%s|%s',
         coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname),
       E'\n' ORDER BY coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, grantor.rolname)
     FROM pg_catalog.pg_class AS c
     CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl
     LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
     JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     WHERE c.oid = v_table
       AND acl.grantee <> 0
       AND grantee.rolname NOT IN ('anon', 'authenticated')),
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('column|%s|%s|%s|%s|%s',
         a.attname, coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname),
       E'\n' ORDER BY a.attname, coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, grantor.rolname)
     FROM pg_catalog.pg_attribute AS a
     CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
     LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
     JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     WHERE a.attrelid = v_table
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attacl IS NOT NULL
       AND acl.grantee <> 0
       AND grantee.rolname NOT IN ('anon', 'authenticated')),
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('policy|%s|%s|%s|%s|%s|%s',
         p.polname, p.polcmd, p.polpermissive, p.polroles::text,
         coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
         coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')),
       E'\n' ORDER BY p.polname)
     FROM pg_catalog.pg_policy AS p
     WHERE p.polrelid = v_table)
  )) INTO v_preserved;

  PERFORM pg_catalog.set_config('verdant.user_roles_client_grant_preserved', v_preserved, true);
END
$user_roles_client_grant_preflight$;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

DO $user_roles_client_grant_postcondition$
DECLARE
  v_table regclass := pg_catalog.to_regclass('public.user_roles');
  v_denied text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']::text[];
  v_privilege text;
  v_direct text[];
  v_preserved text;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer >= 170000 THEN
    v_denied := v_denied || 'MAINTAIN'::text;
  END IF;

  -- Effective privileges, including anything inherited through membership.
  IF pg_catalog.has_table_privilege('anon', v_table, 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT')
     OR pg_catalog.has_any_column_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,REFERENCES')
     OR pg_catalog.has_any_column_privilege('authenticated', v_table, 'INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'user_roles_client_grant_hardening_postcondition_failed';
  END IF;

  FOREACH v_privilege IN ARRAY v_denied LOOP
    IF pg_catalog.has_table_privilege('anon', v_table, v_privilege)
       OR pg_catalog.has_table_privilege('authenticated', v_table, v_privilege) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'user_roles_client_grant_hardening_postcondition_failed';
    END IF;
  END LOOP;

  -- Direct grants: nothing for PUBLIC or anon; exactly SELECT for authenticated.
  SELECT coalesce(pg_catalog.array_agg(
    pg_catalog.format('%s|%s|%s', coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    ORDER BY coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type), ARRAY[]::text[])
  INTO v_direct
  FROM pg_catalog.pg_class AS c
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE c.oid = v_table
    AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'));

  IF v_direct <> ARRAY['authenticated|SELECT|f']::text[]
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS a
       CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       WHERE a.attrelid = v_table
         AND a.attnum > 0
         AND a.attacl IS NOT NULL
         AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'user_roles_client_grant_hardening_postcondition_failed';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.concat_ws(E'\n',
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('table|%s|%s|%s|%s',
         coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname),
       E'\n' ORDER BY coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, grantor.rolname)
     FROM pg_catalog.pg_class AS c
     CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS acl
     LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
     JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     WHERE c.oid = v_table
       AND acl.grantee <> 0
       AND grantee.rolname NOT IN ('anon', 'authenticated')),
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('column|%s|%s|%s|%s|%s',
         a.attname, coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable, grantor.rolname),
       E'\n' ORDER BY a.attname, coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type, grantor.rolname)
     FROM pg_catalog.pg_attribute AS a
     CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
     LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
     JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     WHERE a.attrelid = v_table
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attacl IS NOT NULL
       AND acl.grantee <> 0
       AND grantee.rolname NOT IN ('anon', 'authenticated')),
    (SELECT pg_catalog.string_agg(
       pg_catalog.format('policy|%s|%s|%s|%s|%s|%s',
         p.polname, p.polcmd, p.polpermissive, p.polroles::text,
         coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
         coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')),
       E'\n' ORDER BY p.polname)
     FROM pg_catalog.pg_policy AS p
     WHERE p.polrelid = v_table)
  )) INTO v_preserved;

  IF v_preserved IS DISTINCT FROM
     pg_catalog.current_setting('verdant.user_roles_client_grant_preserved', true) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'user_roles_client_grant_hardening_preserved_state_changed';
  END IF;
END
$user_roles_client_grant_postcondition$;

COMMIT;
