-- Production breeding workflow reconciliation.
--
-- Supported inputs:
--   1. Hosted drift: the exact historical ledger marker and the complete
--      breeding contract are both absent.
--   2. Fresh replay: 20260707120000_breeding_workflow_v1.sql already ran and
--      its exact historical marker and contract are present.
--   3. Safe rerun: this reconciliation committed, but its own migration-ledger
--      recording did not. The exact reconciled contract is present.
--
-- Any partial object set, noncanonical historical contract, or migration
-- version/name collision fails before this transaction changes persistent
-- state. The historical migration remains immutable.

BEGIN;

LOCK TABLE supabase_migrations.schema_migrations
  IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_historical_marker_exists boolean;
  v_breeding_table_exists boolean;
  v_breeding_state text;
  v_owner_function_count integer;
  v_rpc_function_count integer;
  v_historical_rpc_exists boolean;
  v_idempotent_rpc_exists boolean;
  v_names text[];
  v_arg_names text[];
  v_search_path text[];
  v_table_comment text;
  v_authenticated_oid oid;
  v_postgres_oid oid;
  v_action_policy_count integer;
  v_effective_action_insert_count integer;
  v_action_fingerprint text;
  v_function_source_fingerprint text;
  v_function_execute_grantees text[];
  v_validate_trigger_count integer;
  v_owner_trigger_count integer;
BEGIN
  IF to_regclass('public.grows') IS NULL
     OR to_regclass('public.tents') IS NULL
     OR to_regclass('public.plants') IS NULL
     OR to_regclass('public.grow_events') IS NULL
     OR to_regclass('public.quicklog_idempotency') IS NULL
     OR to_regclass('public.action_queue') IS NULL
     OR to_regprocedure('public.validate_grow_event()') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused missing base prerequisites';
  END IF;

  SELECT r.oid
  INTO v_authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  SELECT r.oid
  INTO v_postgres_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'postgres';

  IF v_authenticated_oid IS NULL
     OR v_postgres_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS r
       WHERE r.rolname = 'service_role'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS r
       WHERE r.oid = v_authenticated_oid
         AND (r.rolsuper OR r.rolbypassrls)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused missing canonical database roles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('user_id', 'uuid', true),
        ('idempotency_key', 'text', true),
        ('grow_event_id', 'uuid', true),
        ('request_hash', 'text', false)
    ) AS expected(column_name, formatted_type, is_not_null)
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
        a.attnotnull AS is_not_null
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = 'public.quicklog_idempotency'::regclass
        AND a.attname = expected.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) AS actual ON true
    WHERE actual.formatted_type IS DISTINCT FROM expected.formatted_type
       OR actual.is_not_null IS DISTINCT FROM expected.is_not_null
  )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS con
       JOIN pg_catalog.pg_index AS i ON i.indexrelid = con.conindid
       WHERE con.conrelid = 'public.quicklog_idempotency'::regclass
         AND con.conname = 'quicklog_idempotency_pkey'
         AND con.contype = 'p'
         AND con.convalidated
         AND NOT con.condeferrable
         AND NOT con.condeferred
         AND con.conkey = ARRAY[1, 2]::smallint[]
         AND i.indrelid = con.conrelid
         AND i.indisprimary
         AND i.indisunique
         AND i.indisvalid
         AND i.indisready
         AND i.indimmediate
         AND i.indnkeyatts = 2
         AND i.indnatts = 2
         AND i.indpred IS NULL
         AND i.indexprs IS NULL
         AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
         AND pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'idempotency_key'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused noncanonical quicklog_idempotency mapping';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS sm
    WHERE (sm.version = '20260707120000' OR sm.name = 'breeding_workflow_v1')
      AND (
        sm.version IS DISTINCT FROM '20260707120000'
        OR sm.name IS DISTINCT FROM 'breeding_workflow_v1'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'breeding reconciliation refused schema_migrations version/name collision',
      HINT = 'Resolve migration history explicitly; do not overwrite or rename ledger rows.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations AS sm
    WHERE sm.version = '20260707120000'
      AND sm.name = 'breeding_workflow_v1'
  )
  INTO v_historical_marker_exists;

  v_breeding_table_exists :=
    to_regclass('public.breeding_events') IS NOT NULL;

  SELECT count(*)
  INTO v_owner_function_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_breeding_event_owner';

  SELECT count(*)
  INTO v_rpc_function_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'breeding_log_save_event';

  v_historical_rpc_exists := to_regprocedure(
    'public.breeding_log_save_event(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,jsonb)'
  ) IS NOT NULL;
  v_idempotent_rpc_exists := to_regprocedure(
    'public.breeding_log_save_event(text,uuid,uuid,text,uuid,timestamp with time zone,text,text,text,jsonb)'
  ) IS NOT NULL;

  IF NOT v_historical_marker_exists THEN
    IF v_breeding_table_exists
       OR v_owner_function_count <> 0
       OR v_rpc_function_count <> 0
       OR to_regclass('public.idx_breeding_events_user') IS NOT NULL
       OR to_regclass('public.idx_breeding_events_donor') IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused partial unledgered breeding contract';
    END IF;
    v_breeding_state := 'absent';
  ELSE
    IF NOT v_breeding_table_exists
       OR v_owner_function_count <> 1
       OR v_rpc_function_count <> 1
       OR to_regprocedure(
         'public.validate_breeding_event_owner()'
       ) IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused incomplete ledgered breeding contract';
    END IF;

    IF v_historical_rpc_exists AND NOT v_idempotent_rpc_exists THEN
      v_breeding_state := 'historical';
    ELSIF v_idempotent_rpc_exists AND NOT v_historical_rpc_exists THEN
      v_breeding_state := 'reconciled';
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused ambiguous breeding RPC state';
    END IF;
  END IF;

  SELECT
    md5(
      pg_catalog.replace(
        pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      )
    ),
    p.proconfig
  INTO v_function_source_fingerprint, v_search_path
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.validate_grow_event()'::regprocedure
    AND p.proowner = v_postgres_oid
    AND NOT p.prosecdef;

  IF v_search_path IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR (
       v_breeding_state = 'absent'
       AND v_function_source_fingerprint IS DISTINCT FROM
         '63940e0de9a279203d9d7701734e5cf0'
     )
     OR (
       v_breeding_state = 'historical'
       AND v_function_source_fingerprint IS DISTINCT FROM
         '9fe08ca1d3c6d1438ba97295f4e79b5e'
     )
     OR (
       v_breeding_state = 'reconciled'
       AND v_function_source_fingerprint IS DISTINCT FROM
         '75836d25f8881ac807213b1017224de9'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused noncanonical validate_grow_event definition';
  END IF;

  SELECT count(*)
  INTO v_validate_trigger_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'public.grow_events'::regclass
    AND NOT t.tgisinternal
    AND (
      t.tgname = 'trg_validate_grow_event'
      OR t.tgfoid = 'public.validate_grow_event()'::regprocedure
    );

  IF v_validate_trigger_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS t
       WHERE t.tgrelid = 'public.grow_events'::regclass
         AND t.tgname = 'trg_validate_grow_event'
         AND t.tgfoid = 'public.validate_grow_event()'::regprocedure
         AND t.tgtype = 23
         AND t.tgenabled = 'O'
         AND t.tgqual IS NULL
         AND t.tgnargs = 0
         AND t.tgattr = ''::int2vector
         AND t.tgoldtable IS NULL
         AND t.tgnewtable IS NULL
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused noncanonical grow-event validation trigger';
  END IF;

  IF v_breeding_state <> 'absent' THEN

    SELECT array_agg(a.attname ORDER BY a.attnum)
    INTO v_names
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'public.breeding_events'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_names IS DISTINCT FROM ARRAY[
      'event_id',
      'user_id',
      'method',
      'intensity',
      'donor_plant_id',
      'notes',
      'details',
      'created_at'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events columns';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        VALUES
          ('event_id', 'uuid', true, NULL::text),
          ('user_id', 'uuid', true, NULL::text),
          ('method', 'text', false, NULL::text),
          ('intensity', 'text', false, NULL::text),
          ('donor_plant_id', 'uuid', false, NULL::text),
          ('notes', 'text', false, NULL::text),
          ('details', 'jsonb', true, '''{}''::jsonb'),
          ('created_at', 'timestamp with time zone', true, 'now()')
      ) AS expected(column_name, formatted_type, is_not_null, default_expression)
      LEFT JOIN LATERAL (
        SELECT
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
          a.attnotnull AS is_not_null,
          pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
        FROM pg_catalog.pg_attribute AS a
        LEFT JOIN pg_catalog.pg_attrdef AS d
          ON d.adrelid = a.attrelid
         AND d.adnum = a.attnum
        WHERE a.attrelid = 'public.breeding_events'::regclass
          AND a.attname = expected.column_name
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS actual ON true
      WHERE actual.formatted_type IS DISTINCT FROM expected.formatted_type
         OR actual.is_not_null IS DISTINCT FROM expected.is_not_null
         OR actual.default_expression IS DISTINCT FROM expected.default_expression
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events column definitions';
    END IF;

    SELECT array_agg(con.conname ORDER BY con.conname)
    INTO v_names
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'public.breeding_events'::regclass
      AND con.contype <> 'n';

    IF v_names IS DISTINCT FROM ARRAY[
      'breeding_events_donor_plant_id_fkey',
      'breeding_events_event_id_fkey',
      'breeding_events_pkey'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events constraints';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS con
      JOIN pg_catalog.pg_index AS i ON i.indexrelid = con.conindid
      WHERE con.conrelid = 'public.breeding_events'::regclass
        AND con.conname = 'breeding_events_pkey'
        AND con.contype = 'p'
        AND con.convalidated
        AND NOT con.condeferrable
        AND NOT con.condeferred
        AND con.conkey = ARRAY[1]::smallint[]
        AND i.indrelid = con.conrelid
        AND i.indisprimary
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indimmediate
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'event_id'
    )
       OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS con
      WHERE con.conrelid = 'public.breeding_events'::regclass
        AND con.conname = 'breeding_events_event_id_fkey'
        AND con.contype = 'f'
        AND con.convalidated
        AND NOT con.condeferrable
        AND NOT con.condeferred
        AND con.conkey = ARRAY[1]::smallint[]
        AND con.confrelid = 'public.grow_events'::regclass
        AND con.confkey = ARRAY[1]::smallint[]
        AND con.confdeltype = 'c'
        AND con.confupdtype = 'a'
        AND con.confmatchtype = 's'
    )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_constraint AS con
         WHERE con.conrelid = 'public.breeding_events'::regclass
           AND con.conname = 'breeding_events_donor_plant_id_fkey'
           AND con.contype = 'f'
           AND con.convalidated
           AND NOT con.condeferrable
           AND NOT con.condeferred
           AND con.conkey = ARRAY[5]::smallint[]
           AND con.confrelid = 'public.plants'::regclass
           AND con.confkey = ARRAY[1]::smallint[]
           AND con.confdeltype = 'n'
           AND con.confupdtype = 'a'
           AND con.confmatchtype = 's'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events foreign keys';
    END IF;

    SELECT array_agg(ci.relname ORDER BY ci.relname)
    INTO v_names
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = 'public.breeding_events'::regclass;

    IF v_names IS DISTINCT FROM ARRAY[
      'breeding_events_pkey',
      'idx_breeding_events_donor',
      'idx_breeding_events_user'
    ]::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events indexes';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS i
      JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
      WHERE i.indrelid = 'public.breeding_events'::regclass
        AND ci.relname = 'idx_breeding_events_user'
        AND NOT i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
        AND i.indpred IS NULL
    )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_index AS i
         JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
           WHERE i.indrelid = 'public.breeding_events'::regclass
           AND ci.relname = 'idx_breeding_events_donor'
           AND NOT i.indisunique
           AND i.indisvalid
           AND i.indisready
           AND i.indnkeyatts = 1
           AND i.indnatts = 1
           AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true)
             = 'donor_plant_id'
           AND pg_catalog.pg_get_expr(i.indpred, i.indrelid)
             = '(donor_plant_id IS NOT NULL)'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events index definitions';
    END IF;

    SELECT pg_catalog.obj_description(
      'public.breeding_events'::regclass,
      'pg_class'
    )
    INTO v_table_comment;

    IF v_table_comment IS DISTINCT FROM
      'Breeding-specific payload (method, intensity, donor) for grow_events of a breeding subtype. Advisory log only.' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events comment';
    END IF;

    SELECT array_agg(p.polname ORDER BY p.polname)
    INTO v_names
    FROM pg_catalog.pg_policy AS p
    WHERE p.polrelid = 'public.breeding_events'::regclass;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      WHERE c.oid = 'public.breeding_events'::regclass
        AND c.relrowsecurity
        AND c.relowner = v_postgres_oid
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused breeding_events without RLS';
    END IF;

    IF v_breeding_state = 'historical' THEN
      IF v_names IS DISTINCT FROM ARRAY[
        'Users delete own breeding_events',
        'Users insert own breeding_events',
        'Users update own breeding_events',
        'Users view own breeding_events'
      ]::text[]
         OR EXISTS (
           SELECT 1
           FROM (
             VALUES
               (
                 'Users view own breeding_events',
                 'r',
                 '(auth.uid() = user_id)',
                 NULL::text
               ),
               (
                 'Users insert own breeding_events',
                 'a',
                 NULL::text,
                 '(auth.uid() = user_id)'
               ),
               (
                 'Users update own breeding_events',
                 'w',
                 '(auth.uid() = user_id)',
                 '(auth.uid() = user_id)'
               ),
               (
                 'Users delete own breeding_events',
                 'd',
                 '(auth.uid() = user_id)',
                 NULL::text
               )
           ) AS expected(policy_name, command, using_expression, check_expression)
           LEFT JOIN pg_catalog.pg_policy AS p
             ON p.polrelid = 'public.breeding_events'::regclass
            AND p.polname = expected.policy_name
           WHERE p.oid IS NULL
              OR NOT p.polpermissive
              OR p.polcmd IS DISTINCT FROM expected.command
              OR p.polroles IS DISTINCT FROM ARRAY[v_authenticated_oid]
              OR pg_catalog.pg_get_expr(p.polqual, p.polrelid)
                IS DISTINCT FROM expected.using_expression
              OR pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
                IS DISTINCT FROM expected.check_expression
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'breeding reconciliation refused noncanonical historical breeding_events policies';
      END IF;
    ELSE
      IF v_names IS DISTINCT FROM ARRAY[
        'Users view own breeding_events'
      ]::text[]
         OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_policy AS p
           WHERE p.polrelid = 'public.breeding_events'::regclass
             AND p.polname = 'Users view own breeding_events'
             AND p.polpermissive
             AND p.polcmd = 'r'
             AND p.polroles = ARRAY[v_authenticated_oid]
             AND pg_catalog.pg_get_expr(p.polqual, p.polrelid)
               = '(auth.uid() = user_id)'
             AND p.polwithcheck IS NULL
         ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'breeding reconciliation refused noncanonical reconciled breeding_events policies';
      END IF;
    END IF;

    IF v_breeding_state = 'reconciled'
       AND (
         EXISTS (
           SELECT 1
           FROM pg_catalog.pg_class AS c
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(
               c.relacl,
               pg_catalog.acldefault('r', c.relowner)
             )
           ) AS acl
           LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
           WHERE c.oid = 'public.breeding_events'::regclass
             AND acl.privilege_type IN (
               'SELECT',
               'INSERT',
               'UPDATE',
               'DELETE',
               'TRUNCATE',
               'REFERENCES',
               'TRIGGER',
               'MAINTAIN'
             )
             AND (
               acl.grantee = 0
               OR r.rolname IS NULL
               OR r.rolname = 'anon'
               OR r.rolname NOT IN (
                 'postgres',
                 'authenticated',
                 'service_role'
               )
               OR (
                 r.rolname = 'authenticated'
                 AND acl.privilege_type <> 'SELECT'
               )
             )
         )
         OR has_table_privilege(
           'anon',
           'public.breeding_events',
           'SELECT'
         )
         OR has_table_privilege(
           'anon',
           'public.breeding_events',
           'INSERT'
         )
         OR has_table_privilege(
           'anon',
           'public.breeding_events',
           'UPDATE'
         )
         OR has_table_privilege(
           'anon',
           'public.breeding_events',
           'DELETE'
         )
         OR NOT has_table_privilege(
           'authenticated',
           'public.breeding_events',
           'SELECT'
         )
         OR has_table_privilege(
           'authenticated',
           'public.breeding_events',
           'INSERT'
         )
         OR has_table_privilege(
           'authenticated',
           'public.breeding_events',
           'UPDATE'
         )
         OR has_table_privilege(
           'authenticated',
           'public.breeding_events',
           'DELETE'
         )
         OR NOT has_table_privilege(
           'service_role',
           'public.breeding_events',
           'SELECT'
         )
         OR NOT has_table_privilege(
           'service_role',
           'public.breeding_events',
           'INSERT'
         )
         OR NOT has_table_privilege(
           'service_role',
           'public.breeding_events',
           'UPDATE'
         )
         OR NOT has_table_privilege(
           'service_role',
           'public.breeding_events',
           'DELETE'
         )
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical reconciled breeding_events ACL';
    END IF;

    IF v_breeding_state = 'historical' THEN
      SELECT
        p.proargnames,
        p.proconfig,
        md5(
          pg_catalog.replace(
            pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
            E'\r',
            E'\n'
          )
        )
      INTO v_arg_names, v_search_path, v_function_source_fingerprint
      FROM pg_catalog.pg_proc AS p
      WHERE p.oid = 'public.breeding_log_save_event(
        uuid,
        uuid,
        text,
        uuid,
        timestamp with time zone,
        text,
        text,
        text,
        jsonb
        )'::regprocedure
        AND p.proowner = v_postgres_oid
        AND p.prosecdef
        AND p.prolang = (
          SELECT l.oid
          FROM pg_catalog.pg_language AS l
          WHERE l.lanname = 'plpgsql'
        )
        AND p.prorettype = 'jsonb'::regtype
        AND NOT p.proretset
        AND p.provolatile = 'v'
        AND NOT p.proisstrict
        AND NOT p.proleakproof
        AND p.proparallel = 'u'
        AND p.pronargdefaults = 6
        AND pg_catalog.pg_get_expr(p.proargdefaults, 0) =
          'NULL::uuid, NULL::timestamp with time zone, NULL::text, NULL::text, NULL::text, NULL::jsonb'
        AND p.prokind = 'f';

      IF v_arg_names IS DISTINCT FROM ARRAY[
        'p_grow_id',
        'p_plant_id',
        'p_event_type',
        'p_tent_id',
        'p_occurred_at',
        'p_method',
        'p_intensity',
        'p_notes',
        'p_details'
      ]::text[]
         OR v_search_path IS DISTINCT FROM ARRAY[
           'search_path=public, pg_temp'
         ]::text[]
         OR v_function_source_fingerprint IS DISTINCT FROM
           'e2e0d624ab9b0b01ac278d741527426c' THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'breeding reconciliation refused noncanonical historical breeding RPC';
      END IF;
    ELSE
      SELECT
        p.proargnames,
        p.proconfig,
        md5(
          pg_catalog.replace(
            pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
            E'\r',
            E'\n'
          )
        )
      INTO v_arg_names, v_search_path, v_function_source_fingerprint
      FROM pg_catalog.pg_proc AS p
      WHERE p.oid = 'public.breeding_log_save_event(
        text,
        uuid,
        uuid,
        text,
        uuid,
        timestamp with time zone,
        text,
        text,
        text,
        jsonb
        )'::regprocedure
        AND p.proowner = v_postgres_oid
        AND p.prosecdef
        AND p.prolang = (
          SELECT l.oid
          FROM pg_catalog.pg_language AS l
          WHERE l.lanname = 'plpgsql'
        )
        AND p.prorettype = 'jsonb'::regtype
        AND NOT p.proretset
        AND p.provolatile = 'v'
        AND NOT p.proisstrict
        AND NOT p.proleakproof
        AND p.proparallel = 'u'
        AND p.pronargdefaults = 6
        AND pg_catalog.pg_get_expr(p.proargdefaults, 0) =
          'NULL::uuid, NULL::timestamp with time zone, NULL::text, NULL::text, NULL::text, NULL::jsonb'
        AND p.prokind = 'f';

      IF v_arg_names IS DISTINCT FROM ARRAY[
        'p_idempotency_key',
        'p_grow_id',
        'p_plant_id',
        'p_event_type',
        'p_tent_id',
        'p_occurred_at',
        'p_method',
        'p_intensity',
        'p_notes',
        'p_details'
      ]::text[]
         OR v_search_path IS DISTINCT FROM ARRAY[
           'search_path=public, pg_temp'
          ]::text[]
         OR v_function_source_fingerprint IS DISTINCT FROM
           'cddc5e91657330b8975f843d10ff82bf' THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'breeding reconciliation refused noncanonical reconciled breeding RPC';
      END IF;
    END IF;

    SELECT array_agg(grantee_name ORDER BY grantee_name)
    INTO v_function_execute_grantees
    FROM (
      SELECT DISTINCT
        CASE
          WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE r.rolname
        END AS grantee_name
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          p.proacl,
          pg_catalog.acldefault('f', p.proowner)
        )
      ) AS acl
      LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
      WHERE p.oid = CASE
        WHEN v_breeding_state = 'historical' THEN
          to_regprocedure('public.breeding_log_save_event(
            uuid,
            uuid,
            text,
            uuid,
            timestamp with time zone,
            text,
            text,
            text,
            jsonb
          )')
        ELSE
          to_regprocedure('public.breeding_log_save_event(
            text,
            uuid,
            uuid,
            text,
            uuid,
            timestamp with time zone,
            text,
            text,
            text,
            jsonb
          )')
        END
        AND acl.privilege_type = 'EXECUTE'
    ) AS execute_grantees;

    IF v_function_execute_grantees IS DISTINCT FROM ARRAY[
      'authenticated',
      'postgres',
      'service_role'
    ]::text[]
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS p
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             p.proacl,
             pg_catalog.acldefault('f', p.proowner)
           )
         ) AS acl
         WHERE p.oid = CASE
           WHEN v_breeding_state = 'historical' THEN
             to_regprocedure('public.breeding_log_save_event(
               uuid,
               uuid,
               text,
               uuid,
               timestamp with time zone,
               text,
               text,
               text,
               jsonb
             )')
           ELSE
             to_regprocedure('public.breeding_log_save_event(
               text,
               uuid,
               uuid,
               text,
               uuid,
               timestamp with time zone,
               text,
               text,
               text,
               jsonb
             )')
           END
           AND acl.privilege_type = 'EXECUTE'
           AND (
             acl.grantor <> v_postgres_oid
             OR acl.is_grantable
           )
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding RPC execute ACL';
    END IF;

    SELECT
      md5(
        pg_catalog.replace(
          pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
          E'\r',
          E'\n'
        )
      ),
      p.proconfig
    INTO v_function_source_fingerprint, v_search_path
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid =
      'public.validate_breeding_event_owner()'::regprocedure
      AND p.proowner = v_postgres_oid
      AND NOT p.prosecdef;

    IF v_search_path IS DISTINCT FROM ARRAY[
         'search_path=public'
       ]::text[]
       OR (
         v_breeding_state = 'historical'
         AND v_function_source_fingerprint IS DISTINCT FROM
           'b2c5284862651e593e0ae98e72fccc86'
       )
       OR (
         v_breeding_state = 'reconciled'
         AND v_function_source_fingerprint IS DISTINCT FROM
           '4a25390d7509f19002825eda30fb3b4c'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding owner function';
    END IF;

    IF v_breeding_state = 'reconciled' THEN
      SELECT array_agg(grantee_name ORDER BY grantee_name)
      INTO v_function_execute_grantees
      FROM (
        SELECT DISTINCT
          CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE r.rolname
          END AS grantee_name
        FROM pg_catalog.pg_proc AS p
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
        WHERE p.oid =
          'public.validate_breeding_event_owner()'::regprocedure
          AND acl.privilege_type = 'EXECUTE'
      ) AS execute_grantees;

      IF v_function_execute_grantees IS DISTINCT FROM ARRAY[
        'postgres',
        'service_role'
      ]::text[] THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'breeding reconciliation refused noncanonical breeding owner-function execute ACL';
      END IF;
    END IF;

    SELECT count(*)
    INTO v_owner_trigger_count
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = 'public.breeding_events'::regclass
      AND NOT t.tgisinternal
      AND (
        t.tgname = 'trg_validate_breeding_event_owner'
        OR t.tgfoid =
          'public.validate_breeding_event_owner()'::regprocedure
      );

    IF v_owner_trigger_count <> 1
       OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS t
      WHERE t.tgrelid = 'public.breeding_events'::regclass
        AND t.tgname = 'trg_validate_breeding_event_owner'
        AND t.tgfoid = 'public.validate_breeding_event_owner()'::regprocedure
        AND t.tgtype = 23
        AND t.tgenabled = 'O'
        AND t.tgqual IS NULL
        AND t.tgnargs = 0
        AND t.tgattr = ''::int2vector
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'breeding reconciliation refused noncanonical breeding_events owner trigger';
    END IF;
  END IF;

  SELECT r.oid
  INTO v_authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  SELECT
    count(*),
    max(
      md5(
        lower(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
            '\s+',
            '',
            'g'
          )
        )
      )
    )
  INTO v_action_policy_count, v_action_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = 'public.action_queue'::regclass
    AND p.polname = 'Users insert own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT count(DISTINCT p.oid)
  INTO v_effective_action_insert_count
  FROM pg_catalog.pg_policy AS p
  CROSS JOIN LATERAL unnest(p.polroles) AS policy_role(role_oid)
  WHERE p.polrelid = 'public.action_queue'::regclass
    AND p.polpermissive
    AND p.polcmd IN ('a', '*')
    AND (
      policy_role.role_oid = 0
      OR policy_role.role_oid = v_authenticated_oid
      OR (
        policy_role.role_oid <> 0
        AND pg_catalog.pg_has_role(
          v_authenticated_oid,
          policy_role.role_oid,
          'MEMBER'
        )
      )
    );

  IF v_authenticated_oid IS NULL
     OR v_action_policy_count <> 1
     OR v_effective_action_insert_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS c
       WHERE c.oid = 'public.action_queue'::regclass
         AND c.relrowsecurity
         AND c.relowner = v_postgres_oid
     )
     OR v_action_fingerprint NOT IN (
       -- Exact normalized pg_get_expr fingerprint from
       -- 20260726094000_action_queue_transition_contract.sql.
       '4d4741c455cf307f3e4909041c9d85d7',
       -- Exact normalized pg_get_expr fingerprint from this migration's
       -- already-reconciled direct-grow-first/tent-fallback policy.
       'e08f43c1f4e1308a8d50e6cab797f933'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation refused noncanonical action_queue insert policy',
      HINT = 'Expected the exact 20260726094000 policy or the exact already-reconciled direct-first policy; inspect unknown drift before replacing it.';
  END IF;
END;
$preflight$;

-- Preserve the latest grow-event allow-list, including all six breeding types.
CREATE OR REPLACE FUNCTION public.validate_grow_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  IF NEW.event_type NOT IN (
    'watering','feeding','training','observation','photo','environment',
    'harvest','cure_check',
    'reversal_application','isolation_start','pollination',
    'pollen_shed_observed','stigmas_receptive','cross_harvest'
  ) THEN
    RAISE EXCEPTION 'invalid event_type: %', NEW.event_type;
  END IF;
  IF NEW.source NOT IN ('manual','voice','import','ai') THEN
    RAISE EXCEPTION 'invalid source: %', NEW.source;
  END IF;
  IF NEW.is_deleted = true AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;
  IF NEW.is_deleted = false THEN
    NEW.deleted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

ALTER FUNCTION public.validate_grow_event() OWNER TO postgres;

CREATE TABLE IF NOT EXISTS public.breeding_events (
  event_id uuid PRIMARY KEY
    REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  method text,
  intensity text,
  donor_plant_id uuid
    REFERENCES public.plants(id) ON DELETE SET NULL,
  notes text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.breeding_events IS
  'Breeding-specific payload (method, intensity, donor) for grow_events of a breeding subtype. Advisory log only.';

CREATE INDEX IF NOT EXISTS idx_breeding_events_user
  ON public.breeding_events (user_id);
CREATE INDEX IF NOT EXISTS idx_breeding_events_donor
  ON public.breeding_events (donor_plant_id)
  WHERE donor_plant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_breeding_event_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  parent_user uuid;
  parent_type text;
BEGIN
  SELECT user_id, event_type
  INTO parent_user, parent_type
  FROM public.grow_events
  WHERE id = NEW.event_id;

  IF parent_user IS NULL THEN
    RAISE EXCEPTION 'parent grow_event not found: %', NEW.event_id;
  END IF;
  IF parent_user <> NEW.user_id THEN
    RAISE EXCEPTION 'breeding_events user_id does not match parent grow_event user_id';
  END IF;
  IF parent_type NOT IN (
    'reversal_application',
    'isolation_start',
    'pollination',
    'pollen_shed_observed',
    'stigmas_receptive',
    'cross_harvest'
  ) THEN
    RAISE EXCEPTION
      'breeding_events attached to non-breeding grow_event of type %',
      parent_type;
  END IF;
  IF NEW.donor_plant_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.plants AS p
       WHERE p.id = NEW.donor_plant_id
         AND p.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION
      'breeding_events donor_plant_id % is not owned by the caller',
      NEW.donor_plant_id;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.validate_breeding_event_owner() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_validate_breeding_event_owner
  ON public.breeding_events;
CREATE TRIGGER trg_validate_breeding_event_owner
  BEFORE INSERT OR UPDATE ON public.breeding_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_breeding_event_owner();

ALTER TABLE public.breeding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own breeding_events"
  ON public.breeding_events;
DROP POLICY IF EXISTS "Users insert own breeding_events"
  ON public.breeding_events;
DROP POLICY IF EXISTS "Users update own breeding_events"
  ON public.breeding_events;
DROP POLICY IF EXISTS "Users delete own breeding_events"
  ON public.breeding_events;

CREATE POLICY "Users view own breeding_events"
  ON public.breeding_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.breeding_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.breeding_events TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.breeding_events TO service_role;

REVOKE ALL ON FUNCTION public.validate_breeding_event_owner()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_breeding_event_owner()
  TO service_role;

-- Authenticated writes flow only through this owner-scoped RPC. Plant grow
-- attribution is direct grow first, then the owning tent's grow for legacy
-- rows whose direct grow_id is null. Its required idempotency key maps through
-- quicklog_idempotency. Exact replays reuse one parent/subtype pair; changed
-- payloads fail closed instead of silently reusing an unrelated event.
DROP FUNCTION IF EXISTS public.breeding_log_save_event(
  uuid,
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb
);
DROP FUNCTION IF EXISTS public.breeding_log_save_event(
  text,
  uuid,
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb
);

CREATE FUNCTION public.breeding_log_save_event(
  p_idempotency_key text,
  p_grow_id uuid,
  p_plant_id uuid,
  p_event_type text,
  p_tent_id uuid DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_intensity text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_existing_event_id uuid;
  v_existing_request_hash text;
  v_event_id uuid;
  v_plant_direct_grow uuid;
  v_plant_tent uuid;
  v_plant_tent_owned_id uuid;
  v_plant_tent_grow uuid;
  v_resolved_plant_grow uuid;
  v_selected_tent_grow uuid;
  v_effective_tent uuid;
  v_occurred timestamptz := COALESCE(p_occurred_at, now());
  v_details jsonb := COALESCE(p_details, '{}'::jsonb);
  v_method text := NULLIF(btrim(COALESCE(p_method, '')), '');
  v_intensity text := NULLIF(btrim(COALESCE(p_intensity, '')), '');
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_replay_matches boolean;
  v_collision_retries integer := 0;
  v_request_hash text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NULL
     OR length(p_idempotency_key) < 8
     OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'reason',
      'invalid_idempotency_key'
    );
  END IF;

  IF p_event_type IS NULL
     OR p_event_type NOT IN (
    'reversal_application',
    'isolation_start',
    'pollination',
    'pollen_shed_observed',
    'stigmas_receptive',
    'cross_harvest'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  END IF;

  IF jsonb_typeof(v_details) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.grows AS g
    WHERE g.id = p_grow_id
      AND g.user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  IF p_plant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_required');
  END IF;

  SELECT p.grow_id, p.tent_id, pt.id, pt.grow_id
  INTO
    v_plant_direct_grow,
    v_plant_tent,
    v_plant_tent_owned_id,
    v_plant_tent_grow
  FROM public.plants AS p
  LEFT JOIN public.tents AS pt
    ON pt.id = p.tent_id
   AND pt.user_id = uid
  WHERE p.id = p_plant_id
    AND p.user_id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
  END IF;

  IF v_plant_tent IS NOT NULL AND v_plant_tent_owned_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'reason',
      'plant_tent_not_owned'
    );
  END IF;

  IF v_plant_tent IS NOT NULL AND v_plant_tent_grow IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
  END IF;

  IF v_plant_direct_grow IS NOT NULL
     AND v_plant_tent_grow IS NOT NULL
     AND v_plant_direct_grow IS DISTINCT FROM v_plant_tent_grow THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_cross_grow');
  END IF;

  v_resolved_plant_grow :=
    COALESCE(v_plant_direct_grow, v_plant_tent_grow);

  IF v_resolved_plant_grow IS DISTINCT FROM p_grow_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
  END IF;

  IF p_tent_id IS NOT NULL THEN
    SELECT t.grow_id
    INTO v_selected_tent_grow
    FROM public.tents AS t
    WHERE t.id = p_tent_id
      AND t.user_id = uid;

    IF NOT FOUND
       OR v_selected_tent_grow IS DISTINCT FROM p_grow_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_in_grow');
    END IF;

    IF v_plant_tent IS DISTINCT FROM p_tent_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_tent');
    END IF;
  END IF;

  v_effective_tent := COALESCE(p_tent_id, v_plant_tent);
  v_request_hash := pg_catalog.md5(
    jsonb_build_object(
      'contract',
      'breeding_log_save_event_v2',
      'grow_id',
      p_grow_id,
      'plant_id',
      p_plant_id,
      'event_type',
      p_event_type,
      'tent_id',
      v_effective_tent,
      'occurred_at',
      p_occurred_at,
      'method',
      v_method,
      'intensity',
      v_intensity,
      'notes',
      v_notes,
      'details',
      v_details
    )::text
  );

  <<idempotent_save>>
  LOOP
    SELECT qi.grow_event_id, qi.request_hash
    INTO v_existing_event_id, v_existing_request_hash
    FROM public.quicklog_idempotency AS qi
    WHERE qi.user_id = uid
      AND qi.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing_request_hash IS DISTINCT FROM v_request_hash THEN
        RETURN jsonb_build_object(
          'ok',
          false,
          'reason',
          'idempotency_key_conflict'
        );
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.grow_events AS ge
        JOIN public.breeding_events AS be
          ON be.event_id = ge.id
         AND be.user_id = uid
        WHERE ge.id = v_existing_event_id
          AND ge.user_id = uid
          AND ge.grow_id = p_grow_id
          AND ge.plant_id IS NOT DISTINCT FROM p_plant_id
          AND ge.tent_id IS NOT DISTINCT FROM v_effective_tent
          AND ge.event_type = p_event_type
          AND ge.source = 'manual'
          AND ge.note IS NOT DISTINCT FROM v_notes
          AND NOT COALESCE(ge.is_deleted, false)
          AND (
            p_occurred_at IS NULL
            OR ge.occurred_at = p_occurred_at
          )
          AND be.method IS NOT DISTINCT FROM v_method
          AND be.intensity IS NOT DISTINCT FROM v_intensity
          AND be.donor_plant_id IS NULL
          AND be.notes IS NOT DISTINCT FROM v_notes
          AND be.details = v_details
      )
      INTO v_replay_matches;

      IF v_replay_matches THEN
        RETURN jsonb_build_object(
          'ok',
          true,
          'grow_event_id',
          v_existing_event_id,
          'reused',
          true
        );
      END IF;

      RETURN jsonb_build_object(
        'ok',
        false,
        'reason',
        'idempotency_key_conflict'
      );
    END IF;

    BEGIN
      INSERT INTO public.grow_events (
        user_id,
        grow_id,
        tent_id,
        plant_id,
        event_type,
        source,
        occurred_at,
        note
      )
      VALUES (
        uid,
        p_grow_id,
        v_effective_tent,
        p_plant_id,
        p_event_type,
        'manual',
        v_occurred,
        v_notes
      )
      RETURNING id INTO v_event_id;

      INSERT INTO public.breeding_events (
        event_id,
        user_id,
        method,
        intensity,
        notes,
        details
      )
      VALUES (
        v_event_id,
        uid,
        v_method,
        v_intensity,
        v_notes,
        v_details
      );

      INSERT INTO public.quicklog_idempotency (
        user_id,
        idempotency_key,
        grow_event_id,
        request_hash
      )
      VALUES (
        uid,
        p_idempotency_key,
        v_event_id,
        v_request_hash
      );

      RETURN jsonb_build_object(
        'ok',
        true,
        'grow_event_id',
        v_event_id,
        'reused',
        false
      );
    EXCEPTION
      WHEN unique_violation THEN
        -- This handler is a nested subtransaction. PostgreSQL rolls back its
        -- tentative grow_event and breeding_event before control arrives here.
        v_collision_retries := v_collision_retries + 1;
        IF v_collision_retries > 1 THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
        END IF;

        PERFORM 1
        FROM public.quicklog_idempotency AS qi
        WHERE qi.user_id = uid
          AND qi.idempotency_key = p_idempotency_key;

        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
        END IF;
        -- Re-enter the loop and run the same canonical replay comparison.
    END;
  END LOOP idempotent_save;
END;
$function$;

ALTER FUNCTION public.breeding_log_save_event(
  text,
  uuid,
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.breeding_log_save_event(
  text,
  uuid,
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.breeding_log_save_event(
  text,
  uuid,
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;

-- Replace only this INSERT policy. Lifecycle initialization stays
-- approval-required; grow/tent/plant ownership stays owner-scoped. Plant grow
-- attribution now matches the RPC's direct-first/tent-fallback resolution.
DROP POLICY IF EXISTS "Users insert own action_queue"
  ON public.action_queue;

CREATE POLICY "Users insert own action_queue"
  ON public.action_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = action_queue.user_id
    AND action_queue.status = 'pending_approval'
    AND action_queue.approved_at IS NULL
    AND action_queue.rejected_at IS NULL
    AND action_queue.completed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.grows AS g
      WHERE g.id = action_queue.grow_id
        AND g.user_id = auth.uid()
    )
    AND (
      action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.tents AS t
        WHERE t.id = action_queue.tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.plants AS p
        LEFT JOIN public.tents AS pt
          ON pt.id = p.tent_id
         AND pt.user_id = auth.uid()
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND COALESCE(p.grow_id, pt.grow_id) = action_queue.grow_id
          AND (
            p.grow_id = action_queue.grow_id
            OR (
              p.grow_id IS NULL
              AND pt.grow_id = action_queue.grow_id
            )
          )
          AND (p.tent_id IS NULL OR pt.id IS NOT NULL)
          AND (
            p.grow_id IS NULL
            OR pt.grow_id IS NULL
            OR p.grow_id = pt.grow_id
          )
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.plants AS p
        LEFT JOIN public.tents AS pt
          ON pt.id = p.tent_id
         AND pt.user_id = auth.uid()
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.tent_id = action_queue.tent_id
          AND COALESCE(p.grow_id, pt.grow_id) = action_queue.grow_id
          AND (
            p.grow_id = action_queue.grow_id
            OR (
              p.grow_id IS NULL
              AND pt.grow_id = action_queue.grow_id
            )
          )
          AND pt.id = action_queue.tent_id
      )
    )
  );

DO $postflight$
DECLARE
  v_names text[];
  v_arg_names text[];
  v_search_path text[];
  v_action_expression text;
  v_action_fingerprint text;
  v_policy_count integer;
  v_effective_action_insert_count integer;
  v_authenticated_oid oid;
  v_postgres_oid oid;
  v_function_source_fingerprint text;
  v_function_execute_grantees text[];
  v_table_comment text;
  v_rpc_function_count integer;
  v_validate_trigger_count integer;
  v_owner_trigger_count integer;
BEGIN
  SELECT r.oid
  INTO v_authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  SELECT r.oid
  INTO v_postgres_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'postgres';

  IF v_authenticated_oid IS NULL
     OR v_postgres_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS r
       WHERE r.rolname = 'service_role'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS r
       WHERE r.oid = v_authenticated_oid
         AND (r.rolsuper OR r.rolbypassrls)
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed canonical role postcondition';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('user_id', 'uuid', true),
        ('idempotency_key', 'text', true),
        ('grow_event_id', 'uuid', true),
        ('request_hash', 'text', false)
    ) AS expected(column_name, formatted_type, is_not_null)
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
        a.attnotnull AS is_not_null
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = 'public.quicklog_idempotency'::regclass
        AND a.attname = expected.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) AS actual ON true
    WHERE actual.formatted_type IS DISTINCT FROM expected.formatted_type
       OR actual.is_not_null IS DISTINCT FROM expected.is_not_null
  )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS con
       JOIN pg_catalog.pg_index AS i ON i.indexrelid = con.conindid
       WHERE con.conrelid = 'public.quicklog_idempotency'::regclass
         AND con.conname = 'quicklog_idempotency_pkey'
         AND con.contype = 'p'
         AND con.convalidated
         AND NOT con.condeferrable
         AND NOT con.condeferred
         AND con.conkey = ARRAY[1, 2]::smallint[]
         AND i.indrelid = con.conrelid
         AND i.indisprimary
         AND i.indisunique
         AND i.indisvalid
         AND i.indisready
         AND i.indimmediate
         AND i.indnkeyatts = 2
         AND i.indnatts = 2
         AND i.indpred IS NULL
         AND i.indexprs IS NULL
         AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
         AND pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = 'idempotency_key'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed quicklog_idempotency postcondition';
  END IF;

  SELECT
    md5(
      pg_catalog.replace(
        pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      )
    ),
    p.proconfig
  INTO v_function_source_fingerprint, v_search_path
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.validate_grow_event()'::regprocedure
    AND p.proowner = v_postgres_oid
    AND NOT p.prosecdef;

  IF v_function_source_fingerprint IS DISTINCT FROM
       '75836d25f8881ac807213b1017224de9'
     OR v_search_path IS DISTINCT FROM ARRAY[
       'search_path=public'
     ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed validate_grow_event postcondition';
  END IF;

  SELECT count(*)
  INTO v_validate_trigger_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'public.grow_events'::regclass
    AND NOT t.tgisinternal
    AND (
      t.tgname = 'trg_validate_grow_event'
      OR t.tgfoid = 'public.validate_grow_event()'::regprocedure
    );

  IF v_validate_trigger_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS t
       WHERE t.tgrelid = 'public.grow_events'::regclass
         AND t.tgname = 'trg_validate_grow_event'
         AND t.tgfoid = 'public.validate_grow_event()'::regprocedure
         AND t.tgtype = 23
         AND t.tgenabled = 'O'
         AND t.tgqual IS NULL
         AND t.tgnargs = 0
         AND t.tgattr = ''::int2vector
         AND t.tgoldtable IS NULL
         AND t.tgnewtable IS NULL
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed grow-event validation-trigger postcondition';
  END IF;

  SELECT array_agg(a.attname ORDER BY a.attnum)
  INTO v_names
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.breeding_events'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_names IS DISTINCT FROM ARRAY[
    'event_id',
    'user_id',
    'method',
    'intensity',
    'donor_plant_id',
    'notes',
    'details',
    'created_at'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events column postcondition';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('event_id', 'uuid', true, NULL::text),
        ('user_id', 'uuid', true, NULL::text),
        ('method', 'text', false, NULL::text),
        ('intensity', 'text', false, NULL::text),
        ('donor_plant_id', 'uuid', false, NULL::text),
        ('notes', 'text', false, NULL::text),
        ('details', 'jsonb', true, '''{}''::jsonb'),
        ('created_at', 'timestamp with time zone', true, 'now()')
    ) AS expected(column_name, formatted_type, is_not_null, default_expression)
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
        a.attnotnull AS is_not_null,
        pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
      FROM pg_catalog.pg_attribute AS a
      LEFT JOIN pg_catalog.pg_attrdef AS d
        ON d.adrelid = a.attrelid
       AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.breeding_events'::regclass
        AND a.attname = expected.column_name
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) AS actual ON true
    WHERE actual.formatted_type IS DISTINCT FROM expected.formatted_type
       OR actual.is_not_null IS DISTINCT FROM expected.is_not_null
       OR actual.default_expression IS DISTINCT FROM expected.default_expression
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events column-definition postcondition';
  END IF;

  SELECT array_agg(con.conname ORDER BY con.conname)
  INTO v_names
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conrelid = 'public.breeding_events'::regclass
    AND con.contype <> 'n';

  IF v_names IS DISTINCT FROM ARRAY[
    'breeding_events_donor_plant_id_fkey',
    'breeding_events_event_id_fkey',
    'breeding_events_pkey'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events constraint postcondition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_index AS i ON i.indexrelid = con.conindid
    WHERE con.conrelid = 'public.breeding_events'::regclass
      AND con.conname = 'breeding_events_pkey'
      AND con.contype = 'p'
      AND con.convalidated
      AND NOT con.condeferrable
      AND NOT con.condeferred
      AND con.conkey = ARRAY[1]::smallint[]
      AND i.indrelid = con.conrelid
      AND i.indisprimary
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indimmediate
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'event_id'
  )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS con
       WHERE con.conrelid = 'public.breeding_events'::regclass
         AND con.conname = 'breeding_events_event_id_fkey'
         AND con.contype = 'f'
         AND con.convalidated
         AND NOT con.condeferrable
         AND NOT con.condeferred
         AND con.conkey = ARRAY[1]::smallint[]
         AND con.confrelid = 'public.grow_events'::regclass
         AND con.confkey = ARRAY[1]::smallint[]
         AND con.confdeltype = 'c'
         AND con.confupdtype = 'a'
         AND con.confmatchtype = 's'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS con
       WHERE con.conrelid = 'public.breeding_events'::regclass
         AND con.conname = 'breeding_events_donor_plant_id_fkey'
         AND con.contype = 'f'
         AND con.convalidated
         AND NOT con.condeferrable
         AND NOT con.condeferred
         AND con.conkey = ARRAY[5]::smallint[]
         AND con.confrelid = 'public.plants'::regclass
         AND con.confkey = ARRAY[1]::smallint[]
         AND con.confdeltype = 'n'
         AND con.confupdtype = 'a'
         AND con.confmatchtype = 's'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events key-definition postcondition';
  END IF;

  SELECT array_agg(ci.relname ORDER BY ci.relname)
  INTO v_names
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
  WHERE i.indrelid = 'public.breeding_events'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'breeding_events_pkey',
    'idx_breeding_events_donor',
    'idx_breeding_events_user'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events index postcondition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = 'public.breeding_events'::regclass
      AND ci.relname = 'idx_breeding_events_user'
      AND NOT i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
      AND i.indpred IS NULL
  )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS i
       JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
       WHERE i.indrelid = 'public.breeding_events'::regclass
         AND ci.relname = 'idx_breeding_events_donor'
         AND NOT i.indisunique
         AND i.indisvalid
         AND i.indisready
         AND i.indnkeyatts = 1
         AND i.indnatts = 1
         AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, true)
           = 'donor_plant_id'
         AND pg_catalog.pg_get_expr(i.indpred, i.indrelid)
           = '(donor_plant_id IS NOT NULL)'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events index-definition postcondition';
  END IF;

  SELECT pg_catalog.obj_description(
    'public.breeding_events'::regclass,
    'pg_class'
  )
  INTO v_table_comment;

  IF v_table_comment IS DISTINCT FROM
    'Breeding-specific payload (method, intensity, donor) for grow_events of a breeding subtype. Advisory log only.' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events comment postcondition';
  END IF;

  SELECT array_agg(p.polname ORDER BY p.polname)
  INTO v_names
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = 'public.breeding_events'::regclass;

  IF v_names IS DISTINCT FROM ARRAY[
    'Users view own breeding_events'
  ]::text[]
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS c
       WHERE c.oid = 'public.breeding_events'::regclass
         AND c.relrowsecurity
         AND c.relowner = v_postgres_oid
      )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS p
       WHERE p.polrelid = 'public.breeding_events'::regclass
         AND p.polname = 'Users view own breeding_events'
         AND p.polpermissive
         AND p.polcmd = 'r'
         AND p.polroles = ARRAY[v_authenticated_oid]
         AND pg_catalog.pg_get_expr(p.polqual, p.polrelid)
           = '(auth.uid() = user_id)'
         AND p.polwithcheck IS NULL
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events RLS postcondition';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS c
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           c.relacl,
           pg_catalog.acldefault('r', c.relowner)
         )
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
       WHERE c.oid = 'public.breeding_events'::regclass
         AND acl.privilege_type IN (
           'SELECT',
           'INSERT',
           'UPDATE',
           'DELETE',
           'TRUNCATE',
           'REFERENCES',
           'TRIGGER',
           'MAINTAIN'
         )
         AND (
           acl.grantee = 0
           OR r.rolname IS NULL
           OR r.rolname = 'anon'
           OR r.rolname NOT IN (
             'postgres',
             'authenticated',
             'service_role'
           )
           OR (
             r.rolname = 'authenticated'
             AND acl.privilege_type <> 'SELECT'
           )
         )
     )
     OR has_table_privilege('anon', 'public.breeding_events', 'SELECT')
     OR has_table_privilege('anon', 'public.breeding_events', 'INSERT')
     OR has_table_privilege('anon', 'public.breeding_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.breeding_events', 'DELETE')
     OR NOT has_table_privilege(
       'authenticated',
       'public.breeding_events',
       'SELECT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.breeding_events',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.breeding_events',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.breeding_events',
       'DELETE'
     )
     OR NOT has_table_privilege(
       'service_role',
       'public.breeding_events',
       'SELECT'
     )
     OR NOT has_table_privilege(
       'service_role',
       'public.breeding_events',
       'INSERT'
     )
     OR NOT has_table_privilege(
       'service_role',
       'public.breeding_events',
       'UPDATE'
     )
     OR NOT has_table_privilege(
       'service_role',
       'public.breeding_events',
       'DELETE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding_events ACL postcondition';
  END IF;

  SELECT count(*)
  INTO v_rpc_function_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'breeding_log_save_event';

  SELECT
    p.proargnames,
    p.proconfig,
    md5(
      pg_catalog.replace(
        pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      )
    )
  INTO v_arg_names, v_search_path, v_function_source_fingerprint
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.breeding_log_save_event(
    text,
    uuid,
    uuid,
    text,
    uuid,
    timestamp with time zone,
    text,
    text,
    text,
    jsonb
  )'::regprocedure
    AND p.proowner = v_postgres_oid
    AND p.prosecdef
    AND p.prolang = (
      SELECT l.oid
      FROM pg_catalog.pg_language AS l
      WHERE l.lanname = 'plpgsql'
    )
    AND p.prorettype = 'jsonb'::regtype
    AND NOT p.proretset
    AND p.provolatile = 'v'
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.proparallel = 'u'
    AND p.pronargdefaults = 6
    AND pg_catalog.pg_get_expr(p.proargdefaults, 0) =
      'NULL::uuid, NULL::timestamp with time zone, NULL::text, NULL::text, NULL::text, NULL::jsonb'
    AND p.prokind = 'f';

  IF v_rpc_function_count <> 1
     OR to_regprocedure(
       'public.breeding_log_save_event(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,jsonb)'
     ) IS NOT NULL
     OR v_arg_names IS DISTINCT FROM ARRAY[
       'p_idempotency_key',
       'p_grow_id',
       'p_plant_id',
    'p_event_type',
    'p_tent_id',
    'p_occurred_at',
    'p_method',
    'p_intensity',
    'p_notes',
    'p_details'
  ]::text[]
     OR v_search_path IS DISTINCT FROM ARRAY[
       'search_path=public, pg_temp'
     ]::text[]
     OR v_function_source_fingerprint IS DISTINCT FROM
       'cddc5e91657330b8975f843d10ff82bf' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding RPC contract postcondition';
  END IF;

  SELECT array_agg(grantee_name ORDER BY grantee_name)
  INTO v_function_execute_grantees
  FROM (
    SELECT DISTINCT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE r.rolname
      END AS grantee_name
    FROM pg_catalog.pg_proc AS p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        p.proacl,
        pg_catalog.acldefault('f', p.proowner)
      )
    ) AS acl
    LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
    WHERE p.oid = 'public.breeding_log_save_event(
      text,
      uuid,
      uuid,
      text,
      uuid,
      timestamp with time zone,
      text,
      text,
      text,
      jsonb
    )'::regprocedure
      AND acl.privilege_type = 'EXECUTE'
  ) AS execute_grantees;

  IF v_function_execute_grantees IS DISTINCT FROM ARRAY[
    'authenticated',
    'postgres',
    'service_role'
  ]::text[]
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           p.proacl,
           pg_catalog.acldefault('f', p.proowner)
         )
       ) AS acl
       WHERE p.oid = 'public.breeding_log_save_event(
         text,
         uuid,
         uuid,
         text,
         uuid,
         timestamp with time zone,
         text,
         text,
         text,
         jsonb
       )'::regprocedure
         AND acl.privilege_type = 'EXECUTE'
         AND (
           acl.grantor <> v_postgres_oid
           OR acl.is_grantable
         )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding RPC execute-ACL postcondition';
  END IF;

  SELECT
    md5(
      pg_catalog.replace(
        pg_catalog.replace(p.prosrc, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      )
    ),
    p.proconfig
  INTO v_function_source_fingerprint, v_search_path
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.validate_breeding_event_owner()'::regprocedure
    AND p.proowner = v_postgres_oid
    AND NOT p.prosecdef;

  SELECT count(*)
  INTO v_owner_trigger_count
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgrelid = 'public.breeding_events'::regclass
    AND NOT t.tgisinternal
    AND (
      t.tgname = 'trg_validate_breeding_event_owner'
      OR t.tgfoid =
        'public.validate_breeding_event_owner()'::regprocedure
    );

  IF v_function_source_fingerprint IS DISTINCT FROM
       '4a25390d7509f19002825eda30fb3b4c'
     OR v_search_path IS DISTINCT FROM ARRAY[
       'search_path=public'
     ]::text[]
     OR v_owner_trigger_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS t
       WHERE t.tgrelid = 'public.breeding_events'::regclass
         AND t.tgname = 'trg_validate_breeding_event_owner'
         AND t.tgfoid =
           'public.validate_breeding_event_owner()'::regprocedure
         AND t.tgtype = 23
         AND t.tgenabled = 'O'
         AND t.tgqual IS NULL
         AND t.tgnargs = 0
         AND t.tgattr = ''::int2vector
         AND t.tgoldtable IS NULL
         AND t.tgnewtable IS NULL
         AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding owner-trigger postcondition';
  END IF;

  SELECT array_agg(grantee_name ORDER BY grantee_name)
  INTO v_function_execute_grantees
  FROM (
    SELECT DISTINCT
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE r.rolname
      END AS grantee_name
    FROM pg_catalog.pg_proc AS p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        p.proacl,
        pg_catalog.acldefault('f', p.proowner)
      )
    ) AS acl
    LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
    WHERE p.oid =
      'public.validate_breeding_event_owner()'::regprocedure
      AND acl.privilege_type = 'EXECUTE'
  ) AS execute_grantees;

  IF v_function_execute_grantees IS DISTINCT FROM ARRAY[
    'postgres',
    'service_role'
  ]::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed breeding owner-function ACL postcondition';
  END IF;

  SELECT
    count(*),
    max(
      lower(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
          '\s+',
          '',
          'g'
        )
      )
    ),
    max(
      md5(
        lower(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid),
            '\s+',
            '',
            'g'
          )
        )
      )
    )
  INTO v_policy_count, v_action_expression, v_action_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = 'public.action_queue'::regclass
    AND p.polname = 'Users insert own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT count(DISTINCT p.oid)
  INTO v_effective_action_insert_count
  FROM pg_catalog.pg_policy AS p
  CROSS JOIN LATERAL unnest(p.polroles) AS policy_role(role_oid)
  WHERE p.polrelid = 'public.action_queue'::regclass
    AND p.polpermissive
    AND p.polcmd IN ('a', '*')
    AND (
      policy_role.role_oid = 0
      OR policy_role.role_oid = v_authenticated_oid
      OR (
        policy_role.role_oid <> 0
        AND pg_catalog.pg_has_role(
          v_authenticated_oid,
          policy_role.role_oid,
          'MEMBER'
        )
      )
    );

  IF v_authenticated_oid IS NULL
     OR v_policy_count <> 1
     OR v_effective_action_insert_count <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS c
       WHERE c.oid = 'public.action_queue'::regclass
         AND c.relrowsecurity
         AND c.relowner = v_postgres_oid
     )
     OR v_action_fingerprint IS DISTINCT FROM
       'e08f43c1f4e1308a8d50e6cab797f933'
     OR position(
       'auth.uid()=user_id'
       IN v_action_expression
     ) = 0
     OR position(
       'status=''pending_approval''::text'
       IN v_action_expression
     ) = 0
     OR position(
       'approved_atisnull'
       IN v_action_expression
     ) = 0
     OR position(
       'rejected_atisnull'
       IN v_action_expression
     ) = 0
     OR position(
       'completed_atisnull'
       IN v_action_expression
     ) = 0
     OR position(
       'fromgrowsgwhere((g.id=action_queue.grow_id)and(g.user_id=auth.uid()))'
       IN v_action_expression
     ) = 0
     OR position(
       'fromtentstwhere((t.id=action_queue.tent_id)and(t.user_id=auth.uid())and(t.grow_id=action_queue.grow_id))'
       IN v_action_expression
     ) = 0
     OR position(
       'from(plantspleftjointentspton(((pt.id=p.tent_id)and(pt.user_id=auth.uid()))))'
       IN v_action_expression
     ) = 0
     OR position(
       'p.id=action_queue.plant_id'
       IN v_action_expression
     ) = 0
     OR position(
       'p.user_id=auth.uid()'
       IN v_action_expression
     ) = 0
     OR position(
       'coalesce(p.grow_id,pt.grow_id)=action_queue.grow_id'
       IN v_action_expression
     ) = 0
     OR position(
       '(p.grow_id=action_queue.grow_id)or((p.grow_idisnull)and(pt.grow_id=action_queue.grow_id))'
       IN v_action_expression
     ) = 0
     OR position(
       '(p.tent_idisnull)or(pt.idisnotnull)'
       IN v_action_expression
     ) = 0
     OR position(
       '(p.grow_idisnull)or(pt.grow_idisnull)or(p.grow_id=pt.grow_id)'
       IN v_action_expression
     ) = 0
     OR position(
       'p.tent_id=action_queue.tent_id'
       IN v_action_expression
     ) = 0
     OR position(
       'pt.id=action_queue.tent_id'
       IN v_action_expression
     ) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'breeding reconciliation failed action_queue insert policy postcondition';
  END IF;
END;
$postflight$;

INSERT INTO supabase_migrations.schema_migrations (
  version,
  name,
  statements
)
SELECT
  '20260707120000',
  'breeding_workflow_v1',
  ARRAY[
    '-- reconciled by 20260728163100_production_breeding_workflow_reconciliation'
  ]
WHERE NOT EXISTS (
  SELECT 1
  FROM supabase_migrations.schema_migrations AS sm
  WHERE sm.version = '20260707120000'
    AND sm.name = 'breeding_workflow_v1'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
