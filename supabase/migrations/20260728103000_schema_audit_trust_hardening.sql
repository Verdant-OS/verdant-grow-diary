-- Forward-only trust hardening for the operator schema audit.
--
-- The RPC returns bounded catalog metadata only. It does not read application
-- rows and it re-checks the caller's operator/staff role server-side.

-- Retire the weaker legacy overload so callers cannot request a snapshot that
-- omits column, grant, and policy evidence.
DROP FUNCTION IF EXISTS public.admin_schema_audit(text[], text[]);

CREATE OR REPLACE FUNCTION public.admin_schema_audit(
  _migrations text[],
  _tables text[],
  _columns jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _migrations_result jsonb;
  _tables_result jsonb;
  _columns_result jsonb;
  _rls_result jsonb;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(_uid, 'operator'::public.app_role)
    OR public.has_role(_uid, 'staff'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- A ledger row matches only by the exact version or by an exact canonical
  -- migration name. Nearby timestamps are intentionally irrelevant. Multiple
  -- candidate rows are ambiguous and therefore not applied.
  WITH input AS (
    SELECT filename, input_order
    FROM pg_catalog.unnest(COALESCE(_migrations, ARRAY[]::text[]))
      WITH ORDINALITY AS requested(filename, input_order)
  ),
  parsed AS (
    SELECT
      filename,
      input_order,
      pg_catalog.substring(filename, '^([0-9]{14})_') AS version,
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(filename, '\.sql$', '', 'i'),
        '^[0-9]{14}_',
        ''
      ) AS canonical_name
    FROM input
  ),
  candidates AS (
    SELECT
      parsed.filename,
      parsed.input_order,
      parsed.version,
      parsed.canonical_name,
      ledger.version AS matched_version,
      ledger.name AS matched_name
    FROM parsed
    LEFT JOIN supabase_migrations.schema_migrations AS ledger
      ON ledger.version = parsed.version
      OR (
        parsed.canonical_name <> ''
        AND pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(COALESCE(ledger.name, ''), '\.sql$', '', 'i'),
          '^[0-9]{14}_',
          ''
        ) = parsed.canonical_name
      )
  ),
  summarized AS (
    SELECT
      filename,
      input_order,
      version,
      pg_catalog.count(matched_version)::integer AS candidate_count,
      CASE
        WHEN pg_catalog.count(matched_version) = 1
          THEN pg_catalog.min(matched_version)
        ELSE NULL
      END AS matched_version,
      CASE
        WHEN pg_catalog.count(matched_version) = 1
          THEN pg_catalog.min(matched_name)
        ELSE NULL
      END AS matched_name,
      COALESCE(pg_catalog.bool_or(matched_version = version), false) AS has_exact_version
    FROM candidates
    GROUP BY filename, input_order, version
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'filename', filename,
        'version', version,
        'applied', candidate_count = 1,
        'match_kind', CASE
          WHEN candidate_count = 0 THEN 'absent'
          WHEN candidate_count > 1 THEN 'ambiguous'
          WHEN has_exact_version THEN 'exact_version'
          ELSE 'canonical_name'
        END,
        'candidate_count', candidate_count,
        'matched_version', matched_version,
        'matched_name', matched_name
      )
      ORDER BY input_order
    ),
    '[]'::jsonb
  )
  INTO _migrations_result
  FROM summarized;

  WITH input AS (
    SELECT table_name, input_order
    FROM pg_catalog.unnest(COALESCE(_tables, ARRAY[]::text[]))
      WITH ORDINALITY AS requested(table_name, input_order)
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table', input.table_name,
        'exists', relation.oid IS NOT NULL
      )
      ORDER BY input.input_order
    ),
    '[]'::jsonb
  )
  INTO _tables_result
  FROM input
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = input.table_name
    AND relation.relnamespace = 'public'::pg_catalog.regnamespace
    AND relation.relkind IN ('r', 'p');

  WITH input AS (
    SELECT
      element->>'table' AS table_name,
      element->>'column' AS column_name,
      input_order
    FROM pg_catalog.jsonb_array_elements(
      CASE
        WHEN pg_catalog.jsonb_typeof(_columns) = 'array' THEN _columns
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS requested(element, input_order)
    WHERE element ? 'table' AND element ? 'column'
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table', input.table_name,
        'column', input.column_name,
        'exists', attribute.attname IS NOT NULL
      )
      ORDER BY input.input_order
    ),
    '[]'::jsonb
  )
  INTO _columns_result
  FROM input
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = input.table_name
    AND relation.relnamespace = 'public'::pg_catalog.regnamespace
    AND relation.relkind IN ('r', 'p')
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation.oid
    AND attribute.attname = input.column_name
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  WITH input AS (
    SELECT table_name, input_order
    FROM pg_catalog.unnest(COALESCE(_tables, ARRAY[]::text[]))
      WITH ORDINALITY AS requested(table_name, input_order)
  ),
  relations AS (
    SELECT
      input.table_name,
      input.input_order,
      relation.oid AS class_oid,
      relation.relowner,
      relation.relacl,
      relation.relrowsecurity AS rls_enabled,
      relation.relforcerowsecurity AS rls_forced
    FROM input
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relname = input.table_name
      AND relation.relnamespace = 'public'::pg_catalog.regnamespace
      AND relation.relkind IN ('r', 'p')
  ),
  policy_evidence AS (
    SELECT
      relations.table_name,
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', policy.policyname,
            'command', policy.cmd,
            'roles', pg_catalog.to_jsonb(policy.roles),
            'permissive', CASE
              WHEN policy.permissive = 'PERMISSIVE' THEN true
              WHEN policy.permissive = 'RESTRICTIVE' THEN false
              ELSE NULL
            END,
            'qual', policy.qual,
            'with_check', policy.with_check
          )
          ORDER BY policy.policyname
        ) FILTER (WHERE policy.policyname IS NOT NULL),
        '[]'::jsonb
      ) AS policies
    FROM relations
    LEFT JOIN pg_catalog.pg_policies AS policy
      ON policy.schemaname = 'public'
      AND policy.tablename = relations.table_name
    GROUP BY relations.table_name
  ),
  audited_roles AS (
    SELECT 'PUBLIC'::text AS role_name, 0::pg_catalog.oid AS role_oid
    UNION ALL
    SELECT requested.role_name, role.oid
    FROM (
      VALUES ('anon'::text), ('authenticated'::text), ('service_role'::text)
    ) AS requested(role_name)
    LEFT JOIN pg_catalog.pg_roles AS role
      ON role.rolname = requested.role_name
  ),
  grant_evidence AS (
    SELECT
      relations.table_name,
      audited_roles.role_name,
      COALESCE(
        pg_catalog.array_agg(
          DISTINCT pg_catalog.upper(acl.privilege_type)
          ORDER BY pg_catalog.upper(acl.privilege_type)
        ) FILTER (WHERE acl.privilege_type IS NOT NULL),
        ARRAY[]::text[]
      ) AS privileges
    FROM relations
    CROSS JOIN audited_roles
    LEFT JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relations.relacl, pg_catalog.acldefault('r', relations.relowner))
    ) AS acl
      ON acl.grantee = audited_roles.role_oid
    GROUP BY relations.table_name, audited_roles.role_name
  ),
  grants_by_table AS (
    SELECT
      table_name,
      pg_catalog.jsonb_object_agg(role_name, pg_catalog.to_jsonb(privileges)) AS grants
    FROM grant_evidence
    GROUP BY table_name
  ),
  column_grant_privileges AS (
    SELECT
      relations.table_name,
      attribute.attname AS column_name,
      acl.grantee,
      pg_catalog.array_agg(
        DISTINCT pg_catalog.upper(acl.privilege_type)
        ORDER BY pg_catalog.upper(acl.privilege_type)
      ) AS privileges
    FROM relations
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relations.class_oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attacl IS NOT NULL
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    GROUP BY relations.table_name, attribute.attname, acl.grantee
  ),
  column_grant_evidence AS (
    SELECT
      relations.table_name,
      audited_roles.role_name,
      COALESCE(
        pg_catalog.jsonb_object_agg(
          column_grant_privileges.column_name,
          pg_catalog.to_jsonb(column_grant_privileges.privileges)
          ORDER BY column_grant_privileges.column_name
        ) FILTER (WHERE column_grant_privileges.column_name IS NOT NULL),
        '{}'::jsonb
      ) AS grants
    FROM relations
    CROSS JOIN audited_roles
    LEFT JOIN column_grant_privileges
      ON column_grant_privileges.table_name = relations.table_name
      AND column_grant_privileges.grantee = audited_roles.role_oid
    GROUP BY relations.table_name, audited_roles.role_name
  ),
  column_grants_by_table AS (
    SELECT
      table_name,
      pg_catalog.jsonb_object_agg(role_name, grants) AS column_grants
    FROM column_grant_evidence
    GROUP BY table_name
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table', relations.table_name,
        'exists', relations.class_oid IS NOT NULL,
        'rls_enabled', CASE
          WHEN relations.class_oid IS NULL THEN NULL
          ELSE relations.rls_enabled
        END,
        'rls_forced', CASE
          WHEN relations.class_oid IS NULL THEN NULL
          ELSE relations.rls_forced
        END,
        'policy_count', pg_catalog.jsonb_array_length(policy_evidence.policies),
        'policies', policy_evidence.policies,
        'grants', grants_by_table.grants,
        'column_grants', column_grants_by_table.column_grants
      )
      ORDER BY relations.input_order
    ),
    '[]'::jsonb
  )
  INTO _rls_result
  FROM relations
  JOIN policy_evidence USING (table_name)
  JOIN grants_by_table USING (table_name)
  JOIN column_grants_by_table USING (table_name);

  _snapshot := pg_catalog.jsonb_build_object(
    'migrations', _migrations_result,
    'tables', _tables_result,
    'columns', _columns_result,
    'rls_audit', _rls_result,
    'user_id', pg_catalog.to_jsonb(_uid)
  );

  RETURN _snapshot || pg_catalog.jsonb_build_object(
    'checked_at', pg_catalog.to_jsonb(pg_catalog.statement_timestamp()),
    'snapshot_fingerprint', pg_catalog.md5(_snapshot::text)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_schema_audit(text[], text[], jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_schema_audit(text[], text[], jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.admin_schema_audit(text[], text[], jsonb) IS
  'Operator/staff-only bounded catalog snapshot. Policy-expression findings are heuristic review evidence, not formal authorization proof.';
