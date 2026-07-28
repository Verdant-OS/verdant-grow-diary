-- Forward-only reconciliation for the production schema drift identified by
-- the required-core-migrations gate.
--
-- Accepted inputs are deliberately narrow:
--   * soil_moisture_calibrations is wholly absent, or it already matches the
--     complete 20260619083000 contract;
--   * Pheno matches the composed 20260706191500 -> 20260707120001 contract, or
--     it already matches the final 20260707210000 taxonomy contract.
--
-- Any partial or unexpected state aborts before public-schema DDL. Pheno ACLs
-- must be either canonical or the exact known legacy default-ACL bloat; both
-- accepted inputs are normalized to canonical browser/service grants before
-- reconciliation continues. Only the two permissive owner write policies are
-- rebuilt during the pre-taxonomy -> final-taxonomy transition; the later
-- RESTRICTIVE entitlement policies remain untouched.
-- The two soil write policies are forward-hardened with explicit outer-table
-- qualification so same-user grow/tent/plant mismatches cannot pass through
-- alias shadowing in the published source expressions.
--
-- This is targeted contract reconciliation, not a claim that the overall
-- migration ledger is clean. The separately audited 91-file unrecorded-history
-- drift remains deferred; bulk/include-all migration push is explicitly out of
-- scope. Only the four exact historical rows at the end of this file are marked.

DO $reconcile$
DECLARE
  v_soil_exists boolean := false;
  v_soil_policy_state text;
  v_pheno_state text;
  v_pheno_acl_state text;
  v_shape text[];
  v_names text[];
  v_acl text[];
  v_cross_acl_shape jsonb;
  v_reversal_acl_shape jsonb;
  v_definitions text;
  v_policy_expression text;
  v_cross_count_before bigint;
  v_cross_ids_before uuid[];
  v_reversal_count_before bigint;
  v_reversal_ids_before uuid[];
  v_soil_count_before bigint := 0;
  v_soil_ids_before uuid[] := ARRAY[]::uuid[];
  v_cross_acl_after_normalization text;
  v_reversal_acl_after_normalization text;
  v_restrictive_before text[];
  v_restrictive_after text[];
  v_count_after bigint;
  v_ids_after uuid[];
  v_published_policy_count integer;
  v_hardened_policy_count integer;
  v_cross_acl_canonical CONSTANT jsonb := '{
    "authenticated": ["DELETE", "INSERT", "SELECT", "UPDATE"],
    "postgres": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ],
    "service_role": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ]
  }'::jsonb;
  v_reversal_acl_canonical CONSTANT jsonb := '{
    "authenticated": ["INSERT", "SELECT"],
    "postgres": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ],
    "service_role": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ]
  }'::jsonb;
  v_legacy_bloat_acl CONSTANT jsonb := '{
    "anon": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ],
    "authenticated": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ],
    "postgres": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ],
    "service_role": [
      "DELETE", "INSERT", "MAINTAIN", "REFERENCES",
      "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"
    ]
  }'::jsonb;
BEGIN
  -- Resolve relations by catalog identity, not search_path. A view, foreign
  -- table, or partition with a colliding name is an unexpected state.
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'soil_moisture_calibrations'
      AND c.relkind = 'r'
  )
  INTO v_soil_exists;

  IF to_regclass('public.soil_moisture_calibrations') IS NOT NULL
     AND NOT v_soil_exists THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused unexpected soil_moisture_calibrations relation',
      HINT = 'Expected the table to be wholly absent or an ordinary table with the exact canonical contract.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pheno_crosses' AND c.relkind = 'r'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pheno_reversals' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation requires canonical pheno_crosses and pheno_reversals tables',
      HINT = 'Do not synthesize a missing or partial Pheno foundation in this repair.';
  END IF;

  -- Block writes while row identity is snapshotted and the catalog transition
  -- is verified. Reads remain available.
  EXECUTE 'LOCK TABLE public.pheno_crosses, public.pheno_reversals IN SHARE MODE';
  IF v_soil_exists THEN
    EXECUTE 'LOCK TABLE public.soil_moisture_calibrations IN SHARE MODE';
  END IF;

  SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_cross_count_before, v_cross_ids_before
  FROM public.pheno_crosses;

  SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_reversal_count_before, v_reversal_ids_before
  FROM public.pheno_reversals;

  IF v_soil_exists THEN
    SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_soil_count_before, v_soil_ids_before
    FROM public.soil_moisture_calibrations;
  END IF;

  SELECT array_agg(
    format(
      '%s|%s|%s|%s|%s|%s',
      c.relname,
      p.polname,
      p.polpermissive,
      p.polcmd,
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    )
    ORDER BY c.relname, p.polname
  )
  INTO v_restrictive_before
  FROM pg_catalog.pg_policy p
  JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
  WHERE p.polrelid IN (
    'public.pheno_crosses'::regclass,
    'public.pheno_reversals'::regclass
  )
    AND p.polname LIKE '%_pro_required_%';

  -- -----------------------------------------------------------------------
  -- Soil precondition: wholly absent or exact 20260619083000 contract.
  -- -----------------------------------------------------------------------
  IF v_soil_exists THEN
    SELECT array_agg(
      format(
        '%s|%s|%s|%s|%s|%s',
        a.attnum,
        a.attname,
        pg_catalog.format_type(a.atttypid, a.atttypmod),
        CASE WHEN a.attnotnull THEN 'not_null' ELSE 'nullable' END,
        COALESCE(
          regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\s+', '', 'g'),
          ''
        ),
        a.attidentity::text || a.attgenerated::text
      )
      ORDER BY a.attnum
    )
    INTO v_shape
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.soil_moisture_calibrations'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_shape IS DISTINCT FROM ARRAY[
      '1|id|uuid|not_null|gen_random_uuid()|',
      '2|user_id|uuid|not_null|auth.uid()|',
      '3|grow_id|uuid|not_null||',
      '4|tent_id|uuid|not_null||',
      '5|plant_id|uuid|nullable||',
      '6|device_id|text|nullable||',
      '7|label|text|nullable||',
      '8|medium|text|nullable||',
      '9|sensor_depth_cm|numeric|nullable||',
      '10|dry_raw|numeric|not_null||',
      '11|wet_raw|numeric|not_null||',
      '12|source|text|not_null|''manual''::text|',
      '13|is_active|boolean|not_null|true|',
      '14|notes|text|nullable||',
      '15|created_at|timestamp with time zone|not_null|now()|',
      '16|updated_at|timestamp with time zone|not_null|now()|'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused partial soil_moisture_calibrations columns';
    END IF;

    SELECT array_agg(con.conname ORDER BY con.conname)
    INTO v_names
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'public.soil_moisture_calibrations'::regclass
      AND con.contype <> 'n';

    IF v_names IS DISTINCT FROM ARRAY[
      'soil_moisture_calibrations_depth_check',
      'soil_moisture_calibrations_distinct_points_check',
      'soil_moisture_calibrations_finite_points_check',
      'soil_moisture_calibrations_grow_id_fkey',
      'soil_moisture_calibrations_pkey',
      'soil_moisture_calibrations_plant_id_fkey',
      'soil_moisture_calibrations_source_check',
      'soil_moisture_calibrations_tent_id_fkey'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused partial soil_moisture_calibrations constraints';
    END IF;

    SELECT lower(regexp_replace(
      string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' ORDER BY con.conname),
      '\s+',
      '',
      'g'
    ))
    INTO v_definitions
    FROM pg_catalog.pg_constraint con
    WHERE con.conrelid = 'public.soil_moisture_calibrations'::regclass
      AND con.contype <> 'n';

    IF v_definitions !~ 'primarykey\(id\)'
       OR v_definitions !~ 'dry_raw<>wet_raw'
       OR v_definitions !~ 'dry_raw<>''nan''::numeric'
       OR v_definitions !~ 'wet_raw<>''nan''::numeric'
       OR v_definitions !~ '''manual''::text'
       OR v_definitions !~ '''csv''::text'
       OR v_definitions !~ '''demo''::text'
       OR v_definitions !~ 'sensor_depth_cmisnull'
       OR v_definitions !~ 'sensor_depth_cm>=\(?0'
       OR v_definitions !~ 'sensor_depth_cm<=\(?1000'
       OR replace(v_definitions, 'public.', '') !~ 'referencesgrows\(id\)ondeletecascade'
       OR replace(v_definitions, 'public.', '') !~ 'referencestents\(id\)ondeletecascade'
       OR replace(v_definitions, 'public.', '') !~ 'referencesplants\(id\)ondeletesetnull' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations constraints';
    END IF;

    SELECT array_agg(ci.relname ORDER BY ci.relname)
    INTO v_names
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = 'public.soil_moisture_calibrations'::regclass;

    IF v_names IS DISTINCT FROM ARRAY[
      'soil_moisture_calibrations_active_probe_uidx',
      'soil_moisture_calibrations_pkey',
      'soil_moisture_calibrations_plant_idx',
      'soil_moisture_calibrations_user_grow_tent_idx'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused partial soil_moisture_calibrations indexes';
    END IF;

    SELECT lower(regexp_replace(
      string_agg(pg_catalog.pg_get_indexdef(i.indexrelid), ' ' ORDER BY ci.relname),
      '\s+',
      '',
      'g'
    ))
    INTO v_definitions
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = 'public.soil_moisture_calibrations'::regclass;

    IF v_definitions !~ '\(user_id,grow_id,tent_id,is_active,created_atdesc\)'
       OR v_definitions !~ '\(user_id,plant_id\)where\(?plant_idisnotnull'
       OR v_definitions !~ 'uniqueindexsoil_moisture_calibrations_active_probe_uidx'
       OR v_definitions !~ 'coalesce\(plant_id,''00000000-0000-0000-0000-000000000000''::uuid\)'
       OR v_definitions !~ 'coalesce\(device_id,''''::text\)'
       OR v_definitions !~ 'where\(?is_active' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations indexes';
    END IF;

    SELECT array_agg(t.tgname ORDER BY t.tgname)
    INTO v_names
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'public.soil_moisture_calibrations'::regclass
      AND NOT t.tgisinternal;

    IF v_names IS DISTINCT FROM ARRAY[
      'soil_moisture_calibrations_set_updated_at'
    ]::text[]
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_trigger t
         WHERE t.tgrelid = 'public.soil_moisture_calibrations'::regclass
           AND t.tgname = 'soil_moisture_calibrations_set_updated_at'
           AND t.tgenabled = 'O'
           AND replace(
             lower(regexp_replace(pg_catalog.pg_get_triggerdef(t.oid, true), '\s+', '', 'g')),
             'public.',
             ''
           )
             ~ 'beforeupdateonsoil_moisture_calibrationsforeachrowexecutefunctionset_updated_at\(\)'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations trigger';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.soil_moisture_calibrations'::regclass
        AND c.relrowsecurity
        AND NOT c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused soil_moisture_calibrations without canonical RLS posture';
    END IF;

    SELECT array_agg(p.polname ORDER BY p.polname)
    INTO v_names
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass;

    IF v_names IS DISTINCT FROM ARRAY[
      'Users delete own soil moisture calibrations',
      'Users insert own soil moisture calibrations',
      'Users update own soil moisture calibrations',
      'Users view own soil moisture calibrations'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused partial soil_moisture_calibrations policies';
    END IF;

    SELECT array_agg(
      format(
        '%s|%s|%s|%s',
        p.polname,
        p.polcmd,
        p.polqual IS NOT NULL,
        p.polwithcheck IS NOT NULL
      )
      ORDER BY p.polname
    )
    INTO v_shape
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass;

    IF v_shape IS DISTINCT FROM ARRAY[
      'Users delete own soil moisture calibrations|d|t|f',
      'Users insert own soil moisture calibrations|a|f|t',
      'Users update own soil moisture calibrations|w|t|t',
      'Users view own soil moisture calibrations|r|t|f'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations policy commands';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy p
      WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass
        AND (
          NOT p.polpermissive
          OR p.polroles IS DISTINCT FROM ARRAY[
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
          ]::oid[]
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations policy roles';
    END IF;

    SELECT lower(regexp_replace(
      string_agg(
        COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
        COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
        ' ' ORDER BY p.polname
      ),
      '\s+',
      '',
      'g'
    ))
    INTO v_policy_expression
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass;

    IF v_policy_expression !~ 'auth.uid\(\)=(soil_moisture_calibrations\.)?user_id'
       OR v_policy_expression !~ 'fromgrowsg'
       OR v_policy_expression !~ 'g.id=(soil_moisture_calibrations\.)?grow_id'
       OR v_policy_expression !~ 'g.user_id=auth.uid\(\)'
       OR v_policy_expression !~ 'fromtentst'
       OR v_policy_expression !~ 't.id=(soil_moisture_calibrations\.)?tent_id'
       OR v_policy_expression !~ 't.user_id=auth.uid\(\)'
       OR v_policy_expression !~ 'fromplantsp'
       OR v_policy_expression !~ 'p.id=(soil_moisture_calibrations\.)?plant_id'
       OR v_policy_expression !~ 'p.user_id=auth.uid\(\)' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical soil_moisture_calibrations policy expressions';
    END IF;

    -- Accept the exact published write expressions only as an input that will
    -- be hardened below. Also accept the already-hardened result so a
    -- transactionally interrupted operator retry remains deterministic.
    SELECT
      count(*) FILTER (
        WHERE expression ~ 'auth.uid\(\)=(soil_moisture_calibrations\.)?user_id'
          AND expression ~ 'g.id=soil_moisture_calibrations\.grow_id'
          AND expression ~ 't.id=soil_moisture_calibrations\.tent_id'
          AND expression ~ 't.grow_id=soil_moisture_calibrations\.grow_id'
          AND expression ~ '(soil_moisture_calibrations\.)?plant_idisnull'
          AND expression ~ 'p.id=soil_moisture_calibrations\.plant_id'
          AND expression ~ 'p.grow_idisnull'
          AND expression ~ 'p.grow_id=soil_moisture_calibrations\.grow_id'
          AND expression ~ 'p.tent_idisnull'
          AND expression ~ 'p.tent_id=soil_moisture_calibrations\.tent_id'
      ),
      count(*) FILTER (
        WHERE expression ~ 'auth.uid\(\)=user_id'
          AND expression ~ 'g.id=soil_moisture_calibrations\.grow_id'
          AND expression ~ 't.id=soil_moisture_calibrations\.tent_id'
          AND expression ~ 't[.]grow_id=t[.]grow_id'
          AND expression ~ 'plant_idisnull'
          AND expression ~ 'p.id=soil_moisture_calibrations\.plant_id'
          AND expression ~ 'p.grow_idisnull'
          AND expression ~ 'p[.]grow_id=p[.]grow_id'
          AND expression ~ 'p.tent_idisnull'
          AND expression ~ 'p[.]tent_id=p[.]tent_id'
      )
    INTO v_hardened_policy_count, v_published_policy_count
    FROM (
      SELECT lower(regexp_replace(
        COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
        COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
        '\s+',
        '',
        'g'
      )) AS expression
      FROM pg_catalog.pg_policy p
      WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass
        AND p.polname IN (
          'Users insert own soil moisture calibrations',
          'Users update own soil moisture calibrations'
        )
    ) write_policies;

    IF v_hardened_policy_count = 2 AND v_published_policy_count = 0 THEN
      v_soil_policy_state := 'hardened';
    ELSIF v_published_policy_count = 2 AND v_hardened_policy_count = 0 THEN
      v_soil_policy_state := 'published';
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused mixed or unexpected soil write policies';
    END IF;

    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
    INTO v_acl
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    WHERE c.oid = 'public.soil_moisture_calibrations'::regclass
      AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      AND NOT a.is_grantable;

    IF v_acl IS DISTINCT FROM ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical authenticated soil_moisture_calibrations grants';
    END IF;

    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
    INTO v_acl
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    WHERE c.oid = 'public.soil_moisture_calibrations'::regclass
      AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      AND NOT a.is_grantable;

    IF v_acl IS NULL OR NOT (
      v_acl @> ARRAY[
        'DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
      ]::text[]
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused noncanonical service_role soil_moisture_calibrations grants';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
      ) a
      WHERE c.oid = 'public.soil_moisture_calibrations'::regclass
        AND a.grantee IN (
          0,
          COALESCE((SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'), 0)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused public or anon soil_moisture_calibrations grants';
    END IF;
  ELSE
    v_soil_policy_state := 'absent';
    -- Index names are schema-wide. Their presence without the table is not a
    -- wholly-absent state and must fail before CREATE TABLE.
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'soil_moisture_calibrations_active_probe_uidx',
          'soil_moisture_calibrations_pkey',
          'soil_moisture_calibrations_plant_idx',
          'soil_moisture_calibrations_user_grow_tent_idx'
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'schema reconciliation refused orphaned soil_moisture_calibrations objects';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- Pheno precondition: exact post-20260707120001 or exact final taxonomy.
  -- -----------------------------------------------------------------------
  SELECT array_agg(
    format(
      '%s|%s|%s|%s|%s|%s',
      a.attnum,
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      CASE WHEN a.attnotnull THEN 'not_null' ELSE 'nullable' END,
      COALESCE(
        regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\s+', '', 'g'),
        ''
      ),
      a.attidentity::text || a.attgenerated::text
    )
    ORDER BY a.attnum
  )
  INTO v_shape
  FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.pheno_reversals'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_shape IS DISTINCT FROM ARRAY[
    '1|id|uuid|not_null|gen_random_uuid()|',
    '2|user_id|uuid|not_null||',
    '3|keeper_id|uuid|not_null||',
    '4|method|text|not_null|''sts''::text|',
    '5|note|text|nullable||',
    '6|applied_at|timestamp with time zone|nullable||',
    '7|created_at|timestamp with time zone|not_null|now()|'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial pheno_reversals columns';
  END IF;

  SELECT array_agg(con.conname ORDER BY con.conname)
  INTO v_names
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.pheno_reversals'::regclass
    AND con.contype <> 'n';

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_reversals_keeper_id_fkey',
    'pheno_reversals_method_check',
    'pheno_reversals_pkey',
    'pheno_reversals_user_id_fkey'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial pheno_reversals constraints';
  END IF;

  SELECT lower(regexp_replace(
    string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' ORDER BY con.conname),
    '\s+',
    '',
    'g'
  ))
  INTO v_definitions
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.pheno_reversals'::regclass
    AND con.contype <> 'n';

  IF v_definitions !~ 'primarykey\(id\)'
     OR v_definitions !~ '''sts''::text'
     OR v_definitions !~ '''colloidal_silver''::text'
     OR v_definitions !~ '''ga3''::text'
     OR v_definitions !~ '''other''::text'
     OR replace(v_definitions, 'public.', '') !~ 'referencespheno_keepers\(id\)ondeletecascade'
     OR v_definitions !~ 'referencesauth.users\(id\)ondeletecascade' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_reversals constraints';
  END IF;

  SELECT array_agg(ci.relname ORDER BY ci.relname)
  INTO v_names
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
  WHERE i.indrelid = 'public.pheno_reversals'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_reversals_keeper_idx',
    'pheno_reversals_pkey',
    'pheno_reversals_user_id_idx'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial pheno_reversals indexes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.pheno_reversals'::regclass
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused pheno_reversals without canonical RLS posture';
  END IF;

  SELECT array_agg(p.polname ORDER BY p.polname)
  INTO v_names
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.pheno_reversals'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_reversals_insert_own',
    'pheno_reversals_select_own'
  ]::text[]
  AND v_names IS DISTINCT FROM ARRAY[
    'pheno_reversals_insert_own',
    'pheno_reversals_pro_required_delete',
    'pheno_reversals_pro_required_insert',
    'pheno_reversals_pro_required_update',
    'pheno_reversals_select_own'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial or unexpected pheno_reversals policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_reversals'::regclass
      AND p.polname = 'pheno_reversals_select_own'
      AND p.polpermissive
      AND p.polcmd = 'r'
      AND p.polroles = ARRAY[
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
      AND lower(regexp_replace(
        pg_catalog.pg_get_expr(p.polqual, p.polrelid),
        '\s+',
        '',
        'g'
      )) ~ 'auth.uid\(\)=user_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_reversals'::regclass
      AND p.polname = 'pheno_reversals_insert_own'
      AND p.polpermissive
      AND p.polcmd = 'a'
      AND p.polroles = ARRAY[
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
      AND lower(regexp_replace(
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
        '\s+',
        '',
        'g'
      )) ~ 'auth.uid\(\)=user_id'
      AND lower(regexp_replace(
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
        '\s+',
        '',
        'g'
      )) ~ 'frompheno_keepersk'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_reversals owner policies';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_reversals'::regclass
      AND p.polname LIKE 'pheno_reversals_pro_required_%'
      AND (
        p.polpermissive
        OR p.polroles IS DISTINCT FROM ARRAY[
          (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        ]::oid[]
        OR lower(regexp_replace(
          COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
          COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
          '\s+',
          '',
          'g'
        )) !~ 'has_pheno_tracker_entitlement\(auth.uid\(\)\)'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical Pheno restrictive entitlement policies';
  END IF;

  -- pheno_crosses common/final column shape determines the only two accepted
  -- structural states. Mixed final columns cannot match either array.
  SELECT array_agg(
    format(
      '%s|%s|%s|%s|%s|%s',
      a.attnum,
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      CASE WHEN a.attnotnull THEN 'not_null' ELSE 'nullable' END,
      COALESCE(
        regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '\s+', '', 'g'),
        ''
      ),
      a.attidentity::text || a.attgenerated::text
    )
    ORDER BY a.attnum
  )
  INTO v_shape
  FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.pheno_crosses'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_shape = ARRAY[
    '1|id|uuid|not_null|gen_random_uuid()|',
    '2|user_id|uuid|not_null||',
    '3|hunt_id|uuid|nullable||',
    '4|female_keeper_id|uuid|not_null||',
    '5|male_keeper_id|uuid|nullable||',
    '6|cross_name|text|nullable||',
    '7|note|text|nullable||',
    '8|crossed_at|timestamp with time zone|nullable||',
    '9|created_at|timestamp with time zone|not_null|now()|',
    '10|updated_at|timestamp with time zone|not_null|now()|',
    '11|cross_type|text|not_null|''standard_f1''::text|'
  ]::text[] THEN
    v_pheno_state := 'post_20260707120001';
  ELSIF v_shape = ARRAY[
    '1|id|uuid|not_null|gen_random_uuid()|',
    '2|user_id|uuid|not_null||',
    '3|hunt_id|uuid|nullable||',
    '4|female_keeper_id|uuid|not_null||',
    '5|male_keeper_id|uuid|nullable||',
    '6|cross_name|text|nullable||',
    '7|note|text|nullable||',
    '8|crossed_at|timestamp with time zone|nullable||',
    '9|created_at|timestamp with time zone|not_null|now()|',
    '10|updated_at|timestamp with time zone|not_null|now()|',
    '11|cross_type|text|not_null|''standard_f1''::text|',
    '12|channel|text|nullable||',
    '13|generation|integer|nullable||',
    '14|recurrent_parent_id|uuid|nullable||'
  ]::text[] THEN
    v_pheno_state := 'final_20260707210000';
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial or unexpected pheno_crosses columns';
  END IF;

  SELECT array_agg(con.conname ORDER BY con.conname)
  INTO v_names
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.pheno_crosses'::regclass
    AND con.contype <> 'n';

  IF v_pheno_state = 'post_20260707120001'
     AND v_names IS DISTINCT FROM ARRAY[
       'pheno_crosses_cross_type_check',
       'pheno_crosses_female_keeper_id_fkey',
       'pheno_crosses_hunt_id_fkey',
       'pheno_crosses_male_keeper_id_fkey',
       'pheno_crosses_parents_by_type',
       'pheno_crosses_pkey',
       'pheno_crosses_user_id_fkey'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial post-20260707120001 pheno_crosses constraints';
  ELSIF v_pheno_state = 'final_20260707210000'
     AND v_names IS DISTINCT FROM ARRAY[
       'pheno_crosses_channel_check',
       'pheno_crosses_cross_type_check',
       'pheno_crosses_female_keeper_id_fkey',
       'pheno_crosses_generation_check',
       'pheno_crosses_hunt_id_fkey',
       'pheno_crosses_male_keeper_id_fkey',
       'pheno_crosses_parents_by_type',
       'pheno_crosses_pkey',
       'pheno_crosses_recurrent_parent_by_type',
       'pheno_crosses_recurrent_parent_id_fkey',
       'pheno_crosses_user_id_fkey'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial final pheno_crosses constraints';
  END IF;

  SELECT lower(regexp_replace(
    string_agg(pg_catalog.pg_get_constraintdef(con.oid, true), ' ' ORDER BY con.conname),
    '\s+',
    '',
    'g'
  ))
  INTO v_definitions
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.pheno_crosses'::regclass
    AND con.contype <> 'n';

  IF v_definitions !~ 'primarykey\(id\)'
     OR v_definitions !~ 'referencesauth.users\(id\)ondeletecascade'
     OR replace(v_definitions, 'public.', '') !~ 'referencespheno_hunts\(id\)ondeletesetnull'
     OR replace(v_definitions, 'public.', '') !~ 'referencespheno_keepers\(id\)ondeletecascade'
     OR v_definitions !~ '''standard_f1''::text'
     OR v_definitions !~ '''feminized_cross''::text'
     OR v_definitions !~ '''selfing_s1''::text'
     OR v_definitions !~ 'male_keeper_idisnull'
     OR v_definitions !~ 'male_keeper_id<>female_keeper_id' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses foundation constraints';
  END IF;

  IF v_pheno_state = 'final_20260707210000' AND (
    v_definitions !~ '''filial''::text'
    OR v_definitions !~ '''ibl''::text'
    OR v_definitions !~ '''selfing_sn''::text'
    OR v_definitions !~ '''feminized_bx''::text'
    OR v_definitions !~ '''backcross''::text'
    OR v_definitions !~ '''sib_cross''::text'
    OR v_definitions !~ '''outcross''::text'
    OR v_definitions !~ '''line_cross''::text'
    OR v_definitions !~ '''open_pollination''::text'
    OR v_definitions !~ '''test_cross''::text'
    OR v_definitions !~ '''reciprocal_cross''::text'
    OR v_definitions !~ '''three_way_cross''::text'
    OR v_definitions !~ '''natural_male''::text'
    OR v_definitions !~ '''colloidal_silver''::text'
    OR v_definitions !~ '''rodelization''::text'
    OR v_definitions !~ 'generation>=2'
    OR v_definitions !~ 'generation>=1'
    OR v_definitions !~ 'recurrent_parent_idisnotnull'
    OR replace(v_definitions, 'public.', '') !~ 'referencespheno_keepers\(id\)ondeletecascade'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical final pheno_crosses taxonomy constraints';
  END IF;

  SELECT array_agg(ci.relname ORDER BY ci.relname)
  INTO v_names
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
  WHERE i.indrelid = 'public.pheno_crosses'::regclass;

  IF v_pheno_state = 'post_20260707120001'
     AND v_names IS DISTINCT FROM ARRAY[
       'pheno_crosses_cross_type_idx',
       'pheno_crosses_female_idx',
       'pheno_crosses_hunt_id_idx',
       'pheno_crosses_male_idx',
       'pheno_crosses_pkey',
       'pheno_crosses_user_id_idx'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial post-20260707120001 pheno_crosses indexes';
  ELSIF v_pheno_state = 'final_20260707210000'
     AND v_names IS DISTINCT FROM ARRAY[
       'pheno_crosses_cross_type_idx',
       'pheno_crosses_female_idx',
       'pheno_crosses_hunt_id_idx',
       'pheno_crosses_male_idx',
       'pheno_crosses_pkey',
       'pheno_crosses_recurrent_parent_idx',
       'pheno_crosses_user_id_idx'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial final pheno_crosses indexes';
  END IF;

  SELECT array_agg(t.tgname ORDER BY t.tgname)
  INTO v_names
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.pheno_crosses'::regclass
    AND NOT t.tgisinternal;

  IF v_names IS DISTINCT FROM ARRAY['pheno_crosses_set_updated_at']::text[]
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'public.pheno_crosses'::regclass
         AND t.tgname = 'pheno_crosses_set_updated_at'
         AND t.tgenabled = 'O'
         AND replace(
           lower(regexp_replace(pg_catalog.pg_get_triggerdef(t.oid, true), '\s+', '', 'g')),
           'public.',
           ''
         )
           ~ 'beforeupdateonpheno_crossesforeachrowexecutefunctionset_updated_at\(\)'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses trigger';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = 'public.pheno_crosses'::regclass
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused pheno_crosses without canonical RLS posture';
  END IF;

  SELECT array_agg(p.polname ORDER BY p.polname)
  INTO v_names
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.pheno_crosses'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_crosses_delete_own',
    'pheno_crosses_insert_own',
    'pheno_crosses_select_own',
    'pheno_crosses_update_own'
  ]::text[]
  AND v_names IS DISTINCT FROM ARRAY[
    'pheno_crosses_delete_own',
    'pheno_crosses_insert_own',
    'pheno_crosses_pro_required_delete',
    'pheno_crosses_pro_required_insert',
    'pheno_crosses_pro_required_update',
    'pheno_crosses_select_own',
    'pheno_crosses_update_own'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused partial or unexpected pheno_crosses policies';
  END IF;

  SELECT array_agg(
    format(
      '%s|%s|%s|%s',
      p.polname,
      p.polcmd,
      p.polqual IS NOT NULL,
      p.polwithcheck IS NOT NULL
    )
    ORDER BY p.polname
  )
  INTO v_shape
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.pheno_crosses'::regclass
    AND p.polname IN (
      'pheno_crosses_delete_own',
      'pheno_crosses_insert_own',
      'pheno_crosses_select_own',
      'pheno_crosses_update_own'
    );

  IF v_shape IS DISTINCT FROM ARRAY[
    'pheno_crosses_delete_own|d|t|f',
    'pheno_crosses_insert_own|a|f|t',
    'pheno_crosses_select_own|r|t|f',
    'pheno_crosses_update_own|w|t|t'
  ]::text[]
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_crosses'::regclass
      AND p.polname IN (
        'pheno_crosses_delete_own',
        'pheno_crosses_insert_own',
        'pheno_crosses_select_own',
        'pheno_crosses_update_own'
      )
      AND (
        NOT p.polpermissive
        OR p.polroles IS DISTINCT FROM ARRAY[
          (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        ]::oid[]
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses owner policy metadata';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_crosses'::regclass
      AND p.polname = 'pheno_crosses_select_own'
      AND p.polpermissive
      AND p.polcmd = 'r'
      AND p.polroles = ARRAY[
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
      AND lower(regexp_replace(
        pg_catalog.pg_get_expr(p.polqual, p.polrelid),
        '\s+',
        '',
        'g'
      )) ~ 'auth.uid\(\)=user_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_crosses'::regclass
      AND p.polname = 'pheno_crosses_delete_own'
      AND p.polpermissive
      AND p.polcmd = 'd'
      AND p.polroles = ARRAY[
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
      AND lower(regexp_replace(
        pg_catalog.pg_get_expr(p.polqual, p.polrelid),
        '\s+',
        '',
        'g'
      )) ~ 'auth.uid\(\)=user_id'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses read/delete owner policies';
  END IF;

  SELECT replace(
    lower(regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
      '\s+',
      '',
      'g'
    )),
    'pheno_crosses.',
    ''
  )
  INTO v_policy_expression
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.pheno_crosses'::regclass
    AND p.polname = 'pheno_crosses_insert_own';

  IF v_policy_expression !~ 'auth.uid\(\)=user_id'
     OR v_policy_expression !~ 'frompheno_keepersf'
     OR v_policy_expression !~ 'f.id=female_keeper_id'
     OR v_policy_expression !~ 'male_keeper_idisnull'
     OR v_policy_expression !~ 'frompheno_keepersm'
     OR v_policy_expression !~ 'hunt_idisnull'
     OR v_policy_expression !~ 'frompheno_huntsh'
     OR v_policy_expression !~ 'frompheno_reversalsr' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses insert owner policy';
  END IF;

  IF v_pheno_state = 'post_20260707120001'
     AND (
       v_policy_expression !~ 'cross_type=''standard_f1''::text'
       OR v_policy_expression !~ 'cross_type=''selfing_s1''::text'
       OR v_policy_expression !~ 'cross_type=''feminized_cross''::text'
       OR v_policy_expression ~ 'recurrent_parent_id'
       OR v_policy_expression ~ 'channel'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical post-20260707120001 pheno_crosses insert policy';
  ELSIF v_pheno_state = 'final_20260707210000'
     AND (
       v_policy_expression !~ 'recurrent_parent_idisnull'
       OR v_policy_expression !~ 'channel'
       OR v_policy_expression !~ '''colloidal_silver''::text'
       OR v_policy_expression !~ '''rodelization''::text'
       OR v_policy_expression !~ '''natural_male''::text'
       OR v_policy_expression !~ '''open_pollination''::text'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical final pheno_crosses insert policy';
  END IF;

  SELECT replace(
    lower(regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
      '\s+',
      '',
      'g'
    )),
    'pheno_crosses.',
    ''
  )
  INTO v_policy_expression
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.pheno_crosses'::regclass
    AND p.polname = 'pheno_crosses_update_own';

  IF v_policy_expression !~ 'auth.uid\(\)=user_id'
     OR v_policy_expression !~ 'frompheno_keepersf'
     OR v_policy_expression !~ 'male_keeper_idisnull'
     OR v_policy_expression !~ 'frompheno_keepersm'
     OR v_policy_expression !~ 'hunt_idisnull'
     OR v_policy_expression !~ 'frompheno_huntsh'
     OR v_policy_expression !~ 'frompheno_reversalsr' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical pheno_crosses update owner policy';
  END IF;

  IF v_pheno_state = 'post_20260707120001'
     AND (
       v_policy_expression !~ 'cross_type=''standard_f1''::text'
       OR v_policy_expression !~ 'cross_type=''selfing_s1''::text'
       OR v_policy_expression !~ 'cross_type=''feminized_cross''::text'
       OR v_policy_expression ~ 'recurrent_parent_id'
       OR v_policy_expression ~ 'channel'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical post-20260707120001 pheno_crosses update policy';
  ELSIF v_pheno_state = 'final_20260707210000'
     AND (
       v_policy_expression !~ 'recurrent_parent_idisnull'
       OR v_policy_expression !~ 'channel'
       OR v_policy_expression !~ '''colloidal_silver''::text'
       OR v_policy_expression !~ '''rodelization''::text'
       OR v_policy_expression !~ '''natural_male''::text'
       OR v_policy_expression !~ '''open_pollination''::text'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical final pheno_crosses update policy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.pheno_crosses'::regclass
      AND p.polname LIKE 'pheno_crosses_pro_required_%'
      AND (
        p.polpermissive
        OR p.polroles IS DISTINCT FROM ARRAY[
          (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        ]::oid[]
        OR lower(regexp_replace(
          COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
          COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
          '\s+',
          '',
          'g'
        )) !~ 'has_pheno_tracker_entitlement\(auth.uid\(\)\)'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused noncanonical Pheno restrictive entitlement policies';
  END IF;

  -- Accept only the canonical ACL or the exact production-observed legacy
  -- default-ACL bloat. The production relation owner and its represented ACL
  -- are part of the exact shape; so are every grantor, grantee, privilege,
  -- grant-option bit, and column ACL.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = c.relowner
    WHERE c.oid IN (
      'public.pheno_crosses'::regclass,
      'public.pheno_reversals'::regclass
    )
      AND owner_role.rolname IS DISTINCT FROM 'postgres'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused unexpected Pheno relation owners';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid IN (
      'public.pheno_crosses'::regclass,
      'public.pheno_reversals'::regclass
    )
      AND a.attacl IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused unexpected Pheno column ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    WHERE c.oid IN (
      'public.pheno_crosses'::regclass,
      'public.pheno_reversals'::regclass
    )
      AND acl.grantor IS DISTINCT FROM c.relowner
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused unexpected Pheno ACL grantors';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(grantee, privileges),
    '{}'::jsonb
  )
  INTO v_cross_acl_shape
  FROM (
    SELECT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(role.rolname, format('oid:%s', acl.grantee))
      END AS grantee,
      jsonb_agg(
        acl.privilege_type ||
          CASE WHEN acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
        ORDER BY acl.privilege_type, acl.is_grantable
      ) AS privileges
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
    WHERE c.oid = 'public.pheno_crosses'::regclass
    GROUP BY acl.grantee, role.rolname
  ) exact_grants;

  SELECT COALESCE(
    jsonb_object_agg(grantee, privileges),
    '{}'::jsonb
  )
  INTO v_reversal_acl_shape
  FROM (
    SELECT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(role.rolname, format('oid:%s', acl.grantee))
      END AS grantee,
      jsonb_agg(
        acl.privilege_type ||
          CASE WHEN acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
        ORDER BY acl.privilege_type, acl.is_grantable
      ) AS privileges
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
    WHERE c.oid = 'public.pheno_reversals'::regclass
    GROUP BY acl.grantee, role.rolname
  ) exact_grants;

  IF v_cross_acl_shape = v_cross_acl_canonical
     AND v_reversal_acl_shape = v_reversal_acl_canonical THEN
    v_pheno_acl_state := 'canonical';
  ELSIF v_cross_acl_shape = v_legacy_bloat_acl
        AND v_reversal_acl_shape = v_legacy_bloat_acl THEN
    v_pheno_acl_state := 'known_legacy_default_bloat';
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation refused unexpected Pheno ACL shape',
      DETAIL = format(
        'pheno_crosses=%s; pheno_reversals=%s',
        v_cross_acl_shape,
        v_reversal_acl_shape
      ),
      HINT = 'Expected both tables to be canonical or both to match the exact known legacy default-ACL bloat.';
  END IF;

  -- Normalize both accepted inputs to the same least-privilege contract before
  -- any soil/taxonomy DDL. Any later failure rolls this transition back with
  -- the rest of the reconciliation transaction.
  EXECUTE
    'REVOKE ALL PRIVILEGES ON TABLE ' ||
    'public.pheno_crosses, public.pheno_reversals ' ||
    'FROM PUBLIC, anon, authenticated';
  EXECUTE
    'GRANT DELETE, INSERT, SELECT, UPDATE ' ||
    'ON TABLE public.pheno_crosses TO authenticated';
  EXECUTE
    'GRANT INSERT, SELECT ' ||
    'ON TABLE public.pheno_reversals TO authenticated';
  EXECUTE
    'GRANT ALL PRIVILEGES ON TABLE ' ||
    'public.pheno_crosses, public.pheno_reversals TO service_role';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    WHERE c.oid IN (
      'public.pheno_crosses'::regclass,
      'public.pheno_reversals'::regclass
    )
      AND acl.grantor IS DISTINCT FROM c.relowner
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed canonical Pheno ACL grantor normalization';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(grantee, privileges),
    '{}'::jsonb
  )
  INTO v_cross_acl_shape
  FROM (
    SELECT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(role.rolname, format('oid:%s', acl.grantee))
      END AS grantee,
      jsonb_agg(
        acl.privilege_type ||
          CASE WHEN acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
        ORDER BY acl.privilege_type, acl.is_grantable
      ) AS privileges
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
    WHERE c.oid = 'public.pheno_crosses'::regclass
    GROUP BY acl.grantee, role.rolname
  ) exact_grants;

  SELECT COALESCE(
    jsonb_object_agg(grantee, privileges),
    '{}'::jsonb
  )
  INTO v_reversal_acl_shape
  FROM (
    SELECT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(role.rolname, format('oid:%s', acl.grantee))
      END AS grantee,
      jsonb_agg(
        acl.privilege_type ||
          CASE WHEN acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
        ORDER BY acl.privilege_type, acl.is_grantable
      ) AS privileges
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
    WHERE c.oid = 'public.pheno_reversals'::regclass
    GROUP BY acl.grantee, role.rolname
  ) exact_grants;

  IF v_cross_acl_shape IS DISTINCT FROM v_cross_acl_canonical
     OR v_reversal_acl_shape IS DISTINCT FROM v_reversal_acl_canonical THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed canonical Pheno ACL normalization',
      DETAIL = format(
        'input_state=%s; pheno_crosses=%s; pheno_reversals=%s',
        v_pheno_acl_state,
        v_cross_acl_shape,
        v_reversal_acl_shape
      );
  END IF;

  SELECT c.relacl::text
  INTO v_cross_acl_after_normalization
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.pheno_crosses'::regclass;

  SELECT c.relacl::text
  INTO v_reversal_acl_after_normalization
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.pheno_reversals'::regclass;

  -- -----------------------------------------------------------------------
  -- Apply the wholly-absent soil contract.
  -- -----------------------------------------------------------------------
  IF NOT v_soil_exists THEN
    EXECUTE $ddl$
      CREATE TABLE public.soil_moisture_calibrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL DEFAULT auth.uid(),
        grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
        tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
        plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
        device_id text,
        label text,
        medium text,
        sensor_depth_cm numeric,
        dry_raw numeric NOT NULL,
        wet_raw numeric NOT NULL,
        source text NOT NULL DEFAULT 'manual',
        is_active boolean NOT NULL DEFAULT true,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT soil_moisture_calibrations_distinct_points_check
          CHECK (dry_raw <> wet_raw),
        CONSTRAINT soil_moisture_calibrations_finite_points_check
          CHECK (dry_raw <> 'NaN'::numeric AND wet_raw <> 'NaN'::numeric),
        CONSTRAINT soil_moisture_calibrations_source_check
          CHECK (source IN ('manual', 'csv', 'demo')),
        CONSTRAINT soil_moisture_calibrations_depth_check
          CHECK (sensor_depth_cm IS NULL OR (sensor_depth_cm >= 0 AND sensor_depth_cm <= 1000))
      )
    $ddl$;

    EXECUTE $ddl$
      COMMENT ON TABLE public.soil_moisture_calibrations IS
        'Grower-owned soil moisture dry/wet raw calibration points. Read-time metadata only.'
    $ddl$;
    EXECUTE $ddl$
      COMMENT ON COLUMN public.soil_moisture_calibrations.dry_raw IS
        'Raw sensor value observed at the dry reference point.'
    $ddl$;
    EXECUTE $ddl$
      COMMENT ON COLUMN public.soil_moisture_calibrations.wet_raw IS
        'Raw sensor value observed at the wet reference point.'
    $ddl$;
    EXECUTE $ddl$
      COMMENT ON COLUMN public.soil_moisture_calibrations.source IS
        'Calibration evidence source. Allowed values: manual, csv, demo.'
    $ddl$;

    EXECUTE $ddl$
      CREATE INDEX soil_moisture_calibrations_user_grow_tent_idx
        ON public.soil_moisture_calibrations
          (user_id, grow_id, tent_id, is_active, created_at DESC)
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX soil_moisture_calibrations_plant_idx
        ON public.soil_moisture_calibrations (user_id, plant_id)
        WHERE plant_id IS NOT NULL
    $ddl$;
    EXECUTE $ddl$
      CREATE UNIQUE INDEX soil_moisture_calibrations_active_probe_uidx
        ON public.soil_moisture_calibrations (
          user_id,
          grow_id,
          tent_id,
          COALESCE(plant_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(device_id, '')
        )
        WHERE is_active
    $ddl$;
    EXECUTE $ddl$
      CREATE TRIGGER soil_moisture_calibrations_set_updated_at
        BEFORE UPDATE ON public.soil_moisture_calibrations
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    $ddl$;

    -- A new table must not inherit hosted legacy defaults. Revoke first, then
    -- state the canonical browser/service capabilities explicitly.
    EXECUTE $ddl$
      REVOKE ALL ON TABLE public.soil_moisture_calibrations
        FROM PUBLIC, anon, authenticated
    $ddl$;
    EXECUTE $ddl$
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON TABLE public.soil_moisture_calibrations TO authenticated
    $ddl$;
    EXECUTE $ddl$
      GRANT ALL ON TABLE public.soil_moisture_calibrations TO service_role
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.soil_moisture_calibrations ENABLE ROW LEVEL SECURITY
    $ddl$;
    EXECUTE $policy$
      CREATE POLICY "Users view own soil moisture calibrations"
        ON public.soil_moisture_calibrations
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id)
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Users delete own soil moisture calibrations"
        ON public.soil_moisture_calibrations
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id)
    $policy$;
  END IF;

  -- Replace the published alias-shadowed write checks (or deterministically
  -- reassert an already-hardened retry) with explicit target-table references.
  IF v_soil_exists THEN
    EXECUTE
      'DROP POLICY "Users insert own soil moisture calibrations" ' ||
      'ON public.soil_moisture_calibrations';
    EXECUTE
      'DROP POLICY "Users update own soil moisture calibrations" ' ||
      'ON public.soil_moisture_calibrations';
  END IF;

  EXECUTE $policy$
    CREATE POLICY "Users insert own soil moisture calibrations"
      ON public.soil_moisture_calibrations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = soil_moisture_calibrations.user_id
        AND EXISTS (
          SELECT 1 FROM public.grows g
          WHERE g.id = soil_moisture_calibrations.grow_id
            AND g.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.tents t
          WHERE t.id = soil_moisture_calibrations.tent_id
            AND t.user_id = auth.uid()
            AND t.grow_id = soil_moisture_calibrations.grow_id
        )
        AND (
          soil_moisture_calibrations.plant_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.plants p
            WHERE p.id = soil_moisture_calibrations.plant_id
              AND p.user_id = auth.uid()
              AND (
                p.grow_id IS NULL
                OR p.grow_id = soil_moisture_calibrations.grow_id
              )
              AND (
                p.tent_id IS NULL
                OR p.tent_id = soil_moisture_calibrations.tent_id
              )
          )
        )
      )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY "Users update own soil moisture calibrations"
      ON public.soil_moisture_calibrations
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = soil_moisture_calibrations.user_id)
      WITH CHECK (
        auth.uid() = soil_moisture_calibrations.user_id
        AND EXISTS (
          SELECT 1 FROM public.grows g
          WHERE g.id = soil_moisture_calibrations.grow_id
            AND g.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.tents t
          WHERE t.id = soil_moisture_calibrations.tent_id
            AND t.user_id = auth.uid()
            AND t.grow_id = soil_moisture_calibrations.grow_id
        )
        AND (
          soil_moisture_calibrations.plant_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.plants p
            WHERE p.id = soil_moisture_calibrations.plant_id
              AND p.user_id = auth.uid()
              AND (
                p.grow_id IS NULL
                OR p.grow_id = soil_moisture_calibrations.grow_id
              )
              AND (
                p.tent_id IS NULL
                OR p.tent_id = soil_moisture_calibrations.tent_id
              )
          )
        )
      )
  $policy$;

  SELECT
    count(*) FILTER (
      WHERE expression ~ 'auth.uid\(\)=(soil_moisture_calibrations\.)?user_id'
        AND expression ~ 'g.id=soil_moisture_calibrations\.grow_id'
        AND expression ~ 't.id=soil_moisture_calibrations\.tent_id'
        AND expression ~ 't.grow_id=soil_moisture_calibrations\.grow_id'
        AND expression ~ '(soil_moisture_calibrations\.)?plant_idisnull'
        AND expression ~ 'p.id=soil_moisture_calibrations\.plant_id'
        AND expression ~ 'p.grow_id=soil_moisture_calibrations\.grow_id'
        AND expression ~ 'p.tent_id=soil_moisture_calibrations\.tent_id'
    ),
    string_agg(expression, ' || ' ORDER BY expression)
  INTO v_hardened_policy_count, v_policy_expression
  FROM (
    SELECT lower(regexp_replace(
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ||
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
      '\s+',
      '',
      'g'
    )) AS expression
    FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass
      AND p.polname IN (
        'Users insert own soil moisture calibrations',
        'Users update own soil moisture calibrations'
      )
  ) write_policies;

  IF v_hardened_policy_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed hardened soil write policy postcondition',
      DETAIL = COALESCE(v_policy_expression, '<missing write policies>');
  END IF;

  -- -----------------------------------------------------------------------
  -- Apply the exact 20260707210000 taxonomy only from the exact prior state.
  -- -----------------------------------------------------------------------
  IF v_pheno_state = 'post_20260707120001' THEN
    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD COLUMN channel text,
        ADD COLUMN generation integer,
        ADD COLUMN recurrent_parent_id uuid
          REFERENCES public.pheno_keepers(id) ON DELETE CASCADE
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD CONSTRAINT pheno_crosses_channel_check CHECK (
          channel IS NULL
          OR channel IN (
            'natural_male',
            'colloidal_silver',
            'sts',
            'ga3',
            'rodelization',
            'open_pollination'
          )
        )
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD CONSTRAINT pheno_crosses_generation_check CHECK (
          CASE
            WHEN cross_type IN ('filial', 'selfing_sn')
              THEN generation IS NOT NULL AND generation >= 2
            WHEN cross_type IN ('backcross', 'feminized_bx')
              THEN generation IS NOT NULL AND generation >= 1
            ELSE generation IS NULL
          END
        )
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        DROP CONSTRAINT pheno_crosses_cross_type_check
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD CONSTRAINT pheno_crosses_cross_type_check CHECK (
          cross_type IN (
            'standard_f1', 'feminized_cross', 'selfing_s1',
            'filial', 'ibl', 'selfing_sn', 'feminized_bx', 'backcross',
            'sib_cross', 'outcross', 'line_cross', 'open_pollination',
            'test_cross', 'reciprocal_cross', 'three_way_cross'
          )
        )
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        DROP CONSTRAINT pheno_crosses_parents_by_type
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD CONSTRAINT pheno_crosses_parents_by_type CHECK (
          (cross_type IN ('selfing_s1', 'selfing_sn') AND male_keeper_id IS NULL)
          OR (
            cross_type = 'open_pollination'
            AND (male_keeper_id IS NULL OR male_keeper_id <> female_keeper_id)
          )
          OR (
            cross_type NOT IN ('selfing_s1', 'selfing_sn', 'open_pollination')
            AND male_keeper_id IS NOT NULL
            AND male_keeper_id <> female_keeper_id
          )
        )
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.pheno_crosses
        ADD CONSTRAINT pheno_crosses_recurrent_parent_by_type CHECK (
          (
            cross_type IN ('backcross', 'feminized_bx')
            AND recurrent_parent_id IS NOT NULL
          )
          OR (
            cross_type NOT IN ('backcross', 'feminized_bx')
            AND recurrent_parent_id IS NULL
          )
        )
    $ddl$;

    -- Drop exactly the two permissive owner write policies. The
    -- pheno_crosses_pro_required_* restrictive policies are deliberately not
    -- named or rebuilt here.
    EXECUTE 'DROP POLICY "pheno_crosses_insert_own" ON public.pheno_crosses';
    EXECUTE $policy$
      CREATE POLICY "pheno_crosses_insert_own"
        ON public.pheno_crosses FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = user_id
          AND EXISTS (
            SELECT 1 FROM public.pheno_keepers f
            WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
          )
          AND (
            male_keeper_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_keepers m
              WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
            )
          )
          AND (
            recurrent_parent_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_keepers rp
              WHERE rp.id = recurrent_parent_id AND rp.user_id = auth.uid()
            )
          )
          AND (
            hunt_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_hunts h
              WHERE h.id = hunt_id AND h.user_id = auth.uid()
            )
          )
          AND (
            CASE
              WHEN channel IN ('colloidal_silver', 'sts', 'ga3') THEN
                CASE
                  WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                  WHEN cross_type IN (
                    'feminized_cross', 'feminized_bx', 'filial', 'backcross'
                  ) THEN
                    male_keeper_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.pheno_reversals r
                      WHERE r.keeper_id = male_keeper_id
                        AND r.user_id = auth.uid()
                    )
                  ELSE FALSE
                END
              WHEN channel = 'rodelization' THEN
                CASE
                  WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                  WHEN cross_type IN (
                    'feminized_cross', 'feminized_bx', 'filial', 'backcross'
                  ) THEN TRUE
                  ELSE FALSE
                END
              WHEN channel IN ('natural_male', 'open_pollination') THEN
                cross_type NOT IN (
                  'selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM public.pheno_reversals r
                  WHERE r.keeper_id = male_keeper_id
                    AND r.user_id = auth.uid()
                )
              ELSE
                (
                  cross_type NOT IN (
                    'selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = male_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
                OR (
                  cross_type IN ('selfing_s1', 'selfing_sn') AND EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
                OR (
                  cross_type IN ('feminized_cross', 'feminized_bx')
                  AND male_keeper_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = male_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
            END
          )
        )
    $policy$;

    EXECUTE 'DROP POLICY "pheno_crosses_update_own" ON public.pheno_crosses';
    EXECUTE $policy$
      CREATE POLICY "pheno_crosses_update_own"
        ON public.pheno_crosses FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (
          auth.uid() = user_id
          AND EXISTS (
            SELECT 1 FROM public.pheno_keepers f
            WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
          )
          AND (
            male_keeper_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_keepers m
              WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
            )
          )
          AND (
            recurrent_parent_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_keepers rp
              WHERE rp.id = recurrent_parent_id AND rp.user_id = auth.uid()
            )
          )
          AND (
            hunt_id IS NULL OR EXISTS (
              SELECT 1 FROM public.pheno_hunts h
              WHERE h.id = hunt_id AND h.user_id = auth.uid()
            )
          )
          AND (
            CASE
              WHEN channel IN ('colloidal_silver', 'sts', 'ga3') THEN
                CASE
                  WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                  WHEN cross_type IN (
                    'feminized_cross', 'feminized_bx', 'filial', 'backcross'
                  ) THEN
                    male_keeper_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.pheno_reversals r
                      WHERE r.keeper_id = male_keeper_id
                        AND r.user_id = auth.uid()
                    )
                  ELSE FALSE
                END
              WHEN channel = 'rodelization' THEN
                CASE
                  WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                  WHEN cross_type IN (
                    'feminized_cross', 'feminized_bx', 'filial', 'backcross'
                  ) THEN TRUE
                  ELSE FALSE
                END
              WHEN channel IN ('natural_male', 'open_pollination') THEN
                cross_type NOT IN (
                  'selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM public.pheno_reversals r
                  WHERE r.keeper_id = male_keeper_id
                    AND r.user_id = auth.uid()
                )
              ELSE
                (
                  cross_type NOT IN (
                    'selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = male_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
                OR (
                  cross_type IN ('selfing_s1', 'selfing_sn') AND EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = female_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
                OR (
                  cross_type IN ('feminized_cross', 'feminized_bx')
                  AND male_keeper_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM public.pheno_reversals r
                    WHERE r.keeper_id = male_keeper_id
                      AND r.user_id = auth.uid()
                  )
                )
            END
          )
        )
    $policy$;

    EXECUTE $ddl$
      CREATE INDEX pheno_crosses_recurrent_parent_idx
        ON public.pheno_crosses (recurrent_parent_id)
    $ddl$;
  END IF;

  -- -----------------------------------------------------------------------
  -- Postconditions: full final objects and preserved row identities/counts.
  -- -----------------------------------------------------------------------
  SELECT array_agg(a.attname ORDER BY a.attnum)
  INTO v_names
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.soil_moisture_calibrations'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_names IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'grow_id', 'tent_id', 'plant_id', 'device_id', 'label',
    'medium', 'sensor_depth_cm', 'dry_raw', 'wet_raw', 'source', 'is_active',
    'notes', 'created_at', 'updated_at'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed soil_moisture_calibrations postcondition';
  END IF;

  SELECT array_agg(con.conname ORDER BY con.conname)
  INTO v_names
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.soil_moisture_calibrations'::regclass
    AND con.contype <> 'n';

  IF v_names IS DISTINCT FROM ARRAY[
    'soil_moisture_calibrations_depth_check',
    'soil_moisture_calibrations_distinct_points_check',
    'soil_moisture_calibrations_finite_points_check',
    'soil_moisture_calibrations_grow_id_fkey',
    'soil_moisture_calibrations_pkey',
    'soil_moisture_calibrations_plant_id_fkey',
    'soil_moisture_calibrations_source_check',
    'soil_moisture_calibrations_tent_id_fkey'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed soil constraint postcondition';
  END IF;

  SELECT array_agg(ci.relname ORDER BY ci.relname)
  INTO v_names
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
  WHERE i.indrelid = 'public.soil_moisture_calibrations'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'soil_moisture_calibrations_active_probe_uidx',
    'soil_moisture_calibrations_pkey',
    'soil_moisture_calibrations_plant_idx',
    'soil_moisture_calibrations_user_grow_tent_idx'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed soil index postcondition';
  END IF;

  SELECT array_agg(p.polname ORDER BY p.polname)
  INTO v_names
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.soil_moisture_calibrations'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'Users delete own soil moisture calibrations',
    'Users insert own soil moisture calibrations',
    'Users update own soil moisture calibrations',
    'Users view own soil moisture calibrations'
  ]::text[]
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       WHERE c.oid = 'public.soil_moisture_calibrations'::regclass
         AND c.relrowsecurity
         AND NOT c.relforcerowsecurity
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed soil RLS/policy postcondition';
  END IF;

  SELECT array_agg(a.attname ORDER BY a.attnum)
  INTO v_names
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.pheno_crosses'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_names IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'hunt_id', 'female_keeper_id', 'male_keeper_id',
    'cross_name', 'note', 'crossed_at', 'created_at', 'updated_at', 'cross_type',
    'channel', 'generation', 'recurrent_parent_id'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed final pheno_crosses column postcondition';
  END IF;

  SELECT array_agg(con.conname ORDER BY con.conname)
  INTO v_names
  FROM pg_catalog.pg_constraint con
  WHERE con.conrelid = 'public.pheno_crosses'::regclass
    AND con.contype <> 'n';

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_crosses_channel_check',
    'pheno_crosses_cross_type_check',
    'pheno_crosses_female_keeper_id_fkey',
    'pheno_crosses_generation_check',
    'pheno_crosses_hunt_id_fkey',
    'pheno_crosses_male_keeper_id_fkey',
    'pheno_crosses_parents_by_type',
    'pheno_crosses_pkey',
    'pheno_crosses_recurrent_parent_by_type',
    'pheno_crosses_recurrent_parent_id_fkey',
    'pheno_crosses_user_id_fkey'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed final pheno_crosses constraint postcondition';
  END IF;

  SELECT array_agg(ci.relname ORDER BY ci.relname)
  INTO v_names
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
  WHERE i.indrelid = 'public.pheno_crosses'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'pheno_crosses_cross_type_idx',
    'pheno_crosses_female_idx',
    'pheno_crosses_hunt_id_idx',
    'pheno_crosses_male_idx',
    'pheno_crosses_pkey',
    'pheno_crosses_recurrent_parent_idx',
    'pheno_crosses_user_id_idx'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation failed final pheno_crosses index postcondition';
  END IF;

  SELECT array_agg(
    format(
      '%s|%s|%s|%s|%s|%s',
      c.relname,
      p.polname,
      p.polpermissive,
      p.polcmd,
      COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
      COALESCE(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    )
    ORDER BY c.relname, p.polname
  )
  INTO v_restrictive_after
  FROM pg_catalog.pg_policy p
  JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
  WHERE p.polrelid IN (
    'public.pheno_crosses'::regclass,
    'public.pheno_reversals'::regclass
  )
    AND p.polname LIKE '%_pro_required_%';

  IF v_restrictive_after IS DISTINCT FROM v_restrictive_before THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation changed restrictive Pheno entitlement policies';
  END IF;

  IF (SELECT c.relacl::text FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.pheno_crosses'::regclass)
       IS DISTINCT FROM v_cross_acl_after_normalization
     OR (SELECT c.relacl::text FROM pg_catalog.pg_class c
         WHERE c.oid = 'public.pheno_reversals'::regclass)
       IS DISTINCT FROM v_reversal_acl_after_normalization THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation changed normalized canonical Pheno ACLs';
  END IF;

  SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_count_after, v_ids_after
  FROM public.pheno_crosses;
  IF v_count_after IS DISTINCT FROM v_cross_count_before
     OR v_ids_after IS DISTINCT FROM v_cross_ids_before THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation changed pheno_crosses row identity or count';
  END IF;

  SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_count_after, v_ids_after
  FROM public.pheno_reversals;
  IF v_count_after IS DISTINCT FROM v_reversal_count_before
     OR v_ids_after IS DISTINCT FROM v_reversal_ids_before THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation changed pheno_reversals row identity or count';
  END IF;

  SELECT count(*), COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_count_after, v_ids_after
  FROM public.soil_moisture_calibrations;
  IF v_count_after IS DISTINCT FROM v_soil_count_before
     OR v_ids_after IS DISTINCT FROM v_soil_ids_before THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'schema reconciliation changed soil_moisture_calibrations row identity or count';
  END IF;

  -- A version/name mismatch or a name already attached to another version is
  -- ambiguous history. Refuse it before the final marker INSERT.
  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations sm
    JOIN (
      VALUES
        ('20260619083000'::text, 'add_soil_moisture_calibration_v1'::text),
        ('20260706191500'::text, 'pheno_crosses_foundation'::text),
        ('20260707120001'::text, 'pheno_reversals_and_cross_types'::text),
        ('20260707210000'::text, 'pheno_crosses_full_taxonomy'::text)
    ) expected(version, name)
      ON sm.version = expected.version OR sm.name = expected.name
    WHERE sm.version IS DISTINCT FROM expected.version
       OR sm.name IS DISTINCT FROM expected.name
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'schema reconciliation refused schema_migrations version/name collision',
      HINT = 'Resolve migration history explicitly before retrying; do not overwrite ledger rows.';
  END IF;
END
$reconcile$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  (
    '20260619083000',
    'add_soil_moisture_calibration_v1',
    ARRAY['-- reconciled by 20260728090000_production_schema_reconciliation']
  ),
  (
    '20260706191500',
    'pheno_crosses_foundation',
    ARRAY['-- reconciled by 20260728090000_production_schema_reconciliation']
  ),
  (
    '20260707120001',
    'pheno_reversals_and_cross_types',
    ARRAY['-- reconciled by 20260728090000_production_schema_reconciliation']
  ),
  (
    '20260707210000',
    'pheno_crosses_full_taxonomy',
    ARRAY['-- reconciled by 20260728090000_production_schema_reconciliation']
  )
ON CONFLICT (version) DO NOTHING;
