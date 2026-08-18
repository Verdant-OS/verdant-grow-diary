-- Forward-repair the private Quick Log manual-save delegate without changing
-- the public dual-timestamp wrapper. Production can contain either the
-- 20260722 conditional-mirror delegate or the intended 20260723
-- unconditional-mirror delegate beneath the 20260725 wrapper. Every other
-- catalog shape fails closed before persistent mutation.

BEGIN;

DO $quicklog_manual_delegate_preflight$
DECLARE
  v_signature CONSTANT text :=
    'text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text';
  v_function_arguments CONSTANT text :=
    'p_target_type text, p_target_id uuid, p_action text, p_volume_ml numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_temperature_c numeric DEFAULT NULL::numeric, p_humidity_pct numeric DEFAULT NULL::numeric, p_vpd_kpa numeric DEFAULT NULL::numeric, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_details jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text';
  v_wrapper_oid oid;
  v_delegate_oid oid;
  v_wrapper_owner oid;
  v_delegate_owner oid;
  v_wrapper_acl aclitem[];
  v_delegate_acl aclitem[];
  v_wrapper_source_length integer;
  v_delegate_source_length integer;
  v_wrapper_source_md5 text;
  v_delegate_source_md5 text;
  v_wrapper_contract_count integer;
  v_wrapper_overload_count integer;
  v_delegate_contract_count integer;
  v_delegate_overload_count integer;
  v_helper_overload_count integer;
  v_helper_contract_count integer;
  v_prerequisite_count integer;
  v_wrapper_service_execute boolean;
BEGIN
  -- Serialize this narrowly-scoped catalog repair across concurrent runners.
  PERFORM pg_catalog.pg_advisory_xact_lock(20260818, 10000);

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_unrecognized';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_wrapper_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual';

  v_wrapper_oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual(' || v_signature || ')'
  );
  IF v_wrapper_oid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_wrapper_unrecognized';
  END IF;

  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ),
    pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    )
  INTO
    v_wrapper_owner,
    v_wrapper_acl,
    v_wrapper_source_length,
    v_wrapper_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_wrapper_oid;

  SELECT pg_catalog.count(*)
  INTO v_wrapper_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l
    ON l.oid = p.prolang
  WHERE p.oid = v_wrapper_oid
    AND n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual'
    AND p.prokind = 'f'
    AND p.prorettype = 'jsonb'::pg_catalog.regtype
    AND NOT p.proretset
    AND l.lanname = 'plpgsql'
    AND owner_role.rolname = 'postgres'
    AND p.prosecdef
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.provolatile = 'v'
    AND p.proparallel = 'u'
    AND p.pronargs = 12
    AND p.pronargdefaults = 9
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_target_type',
      'p_target_id',
      'p_action',
      'p_volume_ml',
      'p_note',
      'p_temperature_c',
      'p_humidity_pct',
      'p_vpd_kpa',
      'p_occurred_at',
      'p_details',
      'p_idempotency_key',
      'p_stage'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) = v_function_arguments
    AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[];

  IF v_wrapper_overload_count <> 1
     OR v_wrapper_contract_count <> 1
     OR v_wrapper_source_length <> 7752
     OR v_wrapper_source_md5 <> '0d3098b81787fa90898da921345c0dbc'
     OR NOT COALESCE((
       SELECT pg_catalog.array_agg(
         pg_catalog.format(
           '%s|%s|%s|%s',
           COALESCE(grantee.rolname, 'PUBLIC'),
           acl.privilege_type,
           acl.is_grantable,
           grantor.rolname
         )
         ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
       ) = ARRAY[
         'authenticated|EXECUTE|f|postgres',
         'postgres|EXECUTE|f|postgres',
         'service_role|EXECUTE|f|postgres'
       ]::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_wrapper_acl, pg_catalog.acldefault('f', v_wrapper_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           v_wrapper_acl,
           pg_catalog.acldefault('f', v_wrapper_owner)
         )
       ) AS acl
       WHERE acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       v_wrapper_oid,
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       v_wrapper_oid,
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       v_wrapper_oid,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_wrapper_unrecognized';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_delegate_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual_pre_logged_at';

  v_delegate_oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual_pre_logged_at(' || v_signature || ')'
  );
  IF v_delegate_overload_count <> 1 OR v_delegate_oid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_unrecognized';
  END IF;

  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ),
    pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    )
  INTO
    v_delegate_owner,
    v_delegate_acl,
    v_delegate_source_length,
    v_delegate_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_delegate_oid;

  SELECT pg_catalog.count(*)
  INTO v_delegate_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l
    ON l.oid = p.prolang
  WHERE p.oid = v_delegate_oid
    AND n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual_pre_logged_at'
    AND p.prokind = 'f'
    AND p.prorettype = 'jsonb'::pg_catalog.regtype
    AND NOT p.proretset
    AND l.lanname = 'plpgsql'
    AND owner_role.rolname = 'postgres'
    AND p.prosecdef
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.provolatile = 'v'
    AND p.proparallel = 'u'
    AND p.pronargs = 12
    AND p.pronargdefaults = 9
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_target_type',
      'p_target_id',
      'p_action',
      'p_volume_ml',
      'p_note',
      'p_temperature_c',
      'p_humidity_pct',
      'p_vpd_kpa',
      'p_occurred_at',
      'p_details',
      'p_idempotency_key',
      'p_stage'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) = v_function_arguments
    AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[];

  IF v_delegate_contract_count <> 1
     OR (
       (v_delegate_source_length, v_delegate_source_md5)
       NOT IN (
         (6548, 'e161b2e15c8de2e5ae1048edb4c72c3d'),
         (6734, '7ec296e422f7f47c8b2793b051840798')
       )
     )
     OR NOT COALESCE((
       SELECT pg_catalog.array_agg(
         pg_catalog.format(
           '%s|%s|%s|%s',
           COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type,
           acl.is_grantable, grantor.rolname
         )
         ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
       ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_delegate_acl, pg_catalog.acldefault('f', v_delegate_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           v_delegate_acl,
           pg_catalog.acldefault('f', v_delegate_owner)
         )
       ) AS acl
       WHERE acl.privilege_type = 'EXECUTE'
         AND acl.grantee <> v_delegate_owner
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       v_delegate_oid,
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       v_delegate_oid,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_unrecognized';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_helper_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'quicklog_try_parse_logged_at',
      'quicklog_try_parse_uuid',
      'quicklog_stamp_diary_logged_at',
      'quicklog_stamp_grow_event_logged_at'
    );

  SELECT pg_catalog.count(*)
  INTO v_helper_contract_count
  FROM (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.quicklog_try_parse_logged_at(text)')
      AND n.nspname = 'public'
      AND p.proname = 'quicklog_try_parse_logged_at'
      AND p.prokind = 'f'
      AND p.prorettype = 'timestamp with time zone'::pg_catalog.regtype
      AND NOT p.proretset
      AND l.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
      AND NOT p.prosecdef
      AND p.proisstrict
      AND NOT p.proleakproof
      AND p.provolatile = 'i'
      AND p.proparallel = 'u'
      AND p.pronargs = 1
      AND p.pronargdefaults = 0
      AND p.proargmodes IS NULL
      AND p.proallargtypes IS NULL
      AND p.proargnames = ARRAY['p_value']::text[]
      AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
      AND pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', '')) = 414
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) = '77f1aa70a70a9714057ef226b6996149'
      AND COALESCE((
        SELECT pg_catalog.array_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            COALESCE(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable,
            grantor.rolname
          )
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
        ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
        FROM pg_catalog.aclexplode(
          COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      ), false)
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.quicklog_try_parse_uuid(text)')
      AND n.nspname = 'public'
      AND p.proname = 'quicklog_try_parse_uuid'
      AND p.prokind = 'f'
      AND p.prorettype = 'uuid'::pg_catalog.regtype
      AND NOT p.proretset
      AND l.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
      AND NOT p.prosecdef
      AND p.proisstrict
      AND NOT p.proleakproof
      AND p.provolatile = 'i'
      AND p.proparallel = 'u'
      AND p.pronargs = 1
      AND p.pronargdefaults = 0
      AND p.proargmodes IS NULL
      AND p.proallargtypes IS NULL
      AND p.proargnames = ARRAY['p_value']::text[]
      AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
      AND pg_catalog.octet_length(p.prosrc) = 289
      AND pg_catalog.md5(p.prosrc) = 'a34d120aad5c37a33ac05fd9597624f4'
      AND COALESCE((
        SELECT pg_catalog.array_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            COALESCE(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable,
            grantor.rolname
          )
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
        ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
        FROM pg_catalog.aclexplode(
          COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      ), false)
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid IN (
        pg_catalog.to_regprocedure('public.quicklog_stamp_diary_logged_at()'),
        pg_catalog.to_regprocedure('public.quicklog_stamp_grow_event_logged_at()')
      )
      AND n.nspname = 'public'
      AND p.proname IN (
        'quicklog_stamp_diary_logged_at',
        'quicklog_stamp_grow_event_logged_at'
      )
      AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::pg_catalog.regtype
      AND NOT p.proretset
      AND l.lanname = 'plpgsql'
      AND owner_role.rolname = 'postgres'
      AND p.prosecdef
      AND NOT p.proisstrict
      AND NOT p.proleakproof
      AND p.provolatile = 'v'
      AND p.proparallel = 'u'
      AND p.pronargs = 0
      AND p.pronargdefaults = 0
      AND p.proargmodes IS NULL
      AND p.proallargtypes IS NULL
      AND p.proargnames IS NULL
      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
      AND pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', '')) = 276
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', '')) = 'd9df46d36eb5d7aac767a3c87e53e92f'
      AND COALESCE((
        SELECT pg_catalog.array_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            COALESCE(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable,
            grantor.rolname
          )
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
        ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
        FROM pg_catalog.aclexplode(
          COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
      ), false)
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) AS helpers;

  IF v_helper_overload_count <> 4 OR v_helper_contract_count <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_unrecognized';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_prerequisite_count
  FROM (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.diary_entries')
      AND a.attname = 'logged_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'timestamp with time zone'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.grow_events')
      AND a.attname = 'logged_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'timestamp with time zone'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.quicklog_idempotency')
      AND a.attname = 'request_hash'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'text'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = pg_catalog.to_regclass('public.diary_entries')
      AND tg.tgname = 'trg_quicklog_stamp_diary_logged_at'
      AND NOT tg.tgisinternal
      AND tg.tgtype = 7
      AND tg.tgenabled <> 'D'
      AND tg.tgenabled IN ('O', 'A')
      AND tg.tgqual IS NULL
      AND tg.tgnargs = 0
      AND pg_catalog.octet_length(tg.tgargs) = 0
      AND tg.tgparentid = 0
      AND tg.tgfoid = pg_catalog.to_regprocedure(
        'public.quicklog_stamp_diary_logged_at()'
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = pg_catalog.to_regclass('public.grow_events')
      AND tg.tgname = 'trg_quicklog_stamp_grow_event_logged_at'
      AND NOT tg.tgisinternal
      AND tg.tgtype = 7
      AND tg.tgenabled <> 'D'
      AND tg.tgenabled IN ('O', 'A')
      AND tg.tgqual IS NULL
      AND tg.tgnargs = 0
      AND pg_catalog.octet_length(tg.tgargs) = 0
      AND tg.tgparentid = 0
      AND tg.tgfoid = pg_catalog.to_regprocedure(
        'public.quicklog_stamp_grow_event_logged_at()'
      )
  ) AS prerequisites;

  IF v_prerequisite_count <> 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_unrecognized';
  END IF;

  v_wrapper_service_execute := pg_catalog.has_function_privilege(
    'service_role',
    v_wrapper_oid,
    'EXECUTE'
  );

  -- Transaction-local snapshots make preservation an asserted postcondition.
  PERFORM pg_catalog.set_config(
    'verdant.quicklog_manual_delegate.wrapper_oid',
    v_wrapper_oid::text,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.quicklog_manual_delegate.wrapper_acl',
    COALESCE(v_wrapper_acl::text, '<null>'),
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.quicklog_manual_delegate.wrapper_service_execute',
    v_wrapper_service_execute::text,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.quicklog_manual_delegate.delegate_oid',
    v_delegate_oid::text,
    true
  );
END;
$quicklog_manual_delegate_preflight$;

CREATE OR REPLACE FUNCTION public."quicklog_save_manual_pre_logged_at"(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_volume_ml numeric DEFAULT NULL::numeric,
  p_note text DEFAULT NULL::text,
  p_temperature_c numeric DEFAULT NULL::numeric,
  p_humidity_pct numeric DEFAULT NULL::numeric,
  p_vpd_kpa numeric DEFAULT NULL::numeric,
  p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_details jsonb DEFAULT NULL::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_stage text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid             uuid := auth.uid();
  v_grow_id       uuid;
  v_tent_id       uuid;
  v_plant_id      uuid;
  v_occurred      timestamptz := COALESCE(p_occurred_at, now());
  v_parent_event  uuid;
  v_env_parent    uuid;
  v_env_child     uuid;
  v_has_sensors   boolean;
  v_parent_type   text;
  v_diary_id      uuid := NULL;
  v_safe_details  jsonb;
  v_diary_note    text;
  v_existing      uuid;
  v_stage         text := NULL;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_idempotency_key');
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
    END IF;

    SELECT grow_event_id INTO v_existing
      FROM public.quicklog_idempotency
     WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
        VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
      RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
    END IF;
  END IF;

  IF p_target_type NOT IN ('tent','plant') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_target_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target_type');
  END IF;

  IF p_target_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'missing_target_id');
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target_id');
  END IF;

  IF p_action NOT IN ('water','note') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'unsupported_action');
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_action');
  END IF;

  IF p_action = 'water'
     AND (p_volume_ml IS NULL OR p_volume_ml <= 0) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_volume');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_volume');
  END IF;

  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_details');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  IF p_stage IN ('seedling','veg','flower','flush','harvest','drying') THEN
    v_stage := p_stage;
  END IF;

  IF p_target_type = 'plant' THEN
    SELECT p.tent_id, p.grow_id, p.id
      INTO v_tent_id, v_grow_id, v_plant_id
      FROM public.plants p
     WHERE p.id = p_target_id AND p.user_id = uid;
  ELSE
    SELECT t.id, t.grow_id
      INTO v_tent_id, v_grow_id
      FROM public.tents t
     WHERE t.id = p_target_id AND t.user_id = uid;
    v_plant_id := NULL;
  END IF;

  IF v_grow_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'target_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows g
     WHERE g.id = v_grow_id AND g.user_id = uid
  ) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'grow_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  v_has_sensors := (p_temperature_c IS NOT NULL
                    OR p_humidity_pct IS NOT NULL
                    OR p_vpd_kpa IS NOT NULL);

  v_parent_type := CASE
    WHEN p_action = 'water' THEN 'watering'
    ELSE 'observation'
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status)
    VALUES (uid, p_idempotency_key, 'save_started');

  BEGIN
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_parent_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_parent_event;

    IF p_action = 'water' THEN
      INSERT INTO public.watering_events (event_id, user_id, volume_ml)
      VALUES (v_parent_event, uid, p_volume_ml);
    END IF;

    IF v_has_sensors THEN
      INSERT INTO public.grow_events
        (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         'environment', 'manual', v_occurred, NULL)
      RETURNING id INTO v_env_parent;

      INSERT INTO public.environment_events
        (event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
      VALUES
        (v_env_parent, uid, p_temperature_c, p_humidity_pct, p_vpd_kpa)
      RETURNING event_id INTO v_env_child;
    END IF;

    -- Always mirror to diary_entries: strip auth-rebind keys from any
    -- caller-supplied details, then tag the mirror with linked_grow_event_id
    -- so mergeTimelineSources dedups it against the grow_events spine row.
    v_safe_details := (
      COALESCE(p_details, '{}'::jsonb)
        - 'user_id'
        - 'grow_id'
        - 'tent_id'
        - 'plant_id'
        - 'auth_uid'
        - 'auth.uid'
    ) || jsonb_build_object('linked_grow_event_id', v_parent_event);
    v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
    INSERT INTO public.diary_entries
      (user_id, grow_id, tent_id, plant_id, note, details, entry_at, stage)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_diary_note, v_safe_details, v_occurred, v_stage)
    RETURNING id INTO v_diary_id;

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.quicklog_idempotency (user_id, idempotency_key, grow_event_id)
        VALUES (uid, p_idempotency_key, v_parent_event);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;

  INSERT INTO public.quicklog_audit_events (user_id, grow_event_id, status)
    VALUES (uid, v_parent_event, 'save_succeeded');

  RETURN jsonb_build_object(
    'ok', true,
    'grow_event_id', v_parent_event,
    'environment_event_id', v_env_child,
    'diary_entry_id', v_diary_id,
    'reused', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM service_role;

DO $quicklog_manual_delegate_postcondition$
DECLARE
  v_signature CONSTANT text :=
    'text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text';
  v_function_arguments CONSTANT text :=
    'p_target_type text, p_target_id uuid, p_action text, p_volume_ml numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_temperature_c numeric DEFAULT NULL::numeric, p_humidity_pct numeric DEFAULT NULL::numeric, p_vpd_kpa numeric DEFAULT NULL::numeric, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_details jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text';
  v_wrapper_oid oid;
  v_delegate_oid oid;
  v_wrapper_owner oid;
  v_delegate_owner oid;
  v_wrapper_acl aclitem[];
  v_delegate_acl aclitem[];
  v_wrapper_source_length integer;
  v_delegate_source_length integer;
  v_wrapper_source_md5 text;
  v_delegate_source_md5 text;
  v_wrapper_contract_count integer;
  v_wrapper_overload_count integer;
  v_delegate_contract_count integer;
  v_delegate_overload_count integer;
  v_helper_overload_count integer;
  v_helper_contract_count integer;
  v_prerequisite_count integer;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_wrapper_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual';

  v_wrapper_oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual(' || v_signature || ')'
  );
  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ),
    pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    )
  INTO
    v_wrapper_owner,
    v_wrapper_acl,
    v_wrapper_source_length,
    v_wrapper_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_wrapper_oid;

  SELECT pg_catalog.count(*)
  INTO v_wrapper_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l
    ON l.oid = p.prolang
  WHERE p.oid = v_wrapper_oid
    AND n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual'
    AND p.prokind = 'f'
    AND p.prorettype = 'jsonb'::pg_catalog.regtype
    AND NOT p.proretset
    AND l.lanname = 'plpgsql'
    AND owner_role.rolname = 'postgres'
    AND p.prosecdef
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.provolatile = 'v'
    AND p.proparallel = 'u'
    AND p.pronargs = 12
    AND p.pronargdefaults = 9
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_target_type',
      'p_target_id',
      'p_action',
      'p_volume_ml',
      'p_note',
      'p_temperature_c',
      'p_humidity_pct',
      'p_vpd_kpa',
      'p_occurred_at',
      'p_details',
      'p_idempotency_key',
      'p_stage'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) = v_function_arguments
    AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[];

  IF v_wrapper_overload_count <> 1
     OR v_wrapper_contract_count <> 1
     OR v_wrapper_oid::text IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.quicklog_manual_delegate.wrapper_oid',
       true
     )
     OR v_wrapper_source_length <> 7752
     OR v_wrapper_source_md5 <> '0d3098b81787fa90898da921345c0dbc'
     OR NOT COALESCE((
       SELECT pg_catalog.array_agg(
         pg_catalog.format(
           '%s|%s|%s|%s',
           COALESCE(grantee.rolname, 'PUBLIC'),
           acl.privilege_type,
           acl.is_grantable,
           grantor.rolname
         )
         ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
       ) = ARRAY[
         'authenticated|EXECUTE|f|postgres',
         'postgres|EXECUTE|f|postgres',
         'service_role|EXECUTE|f|postgres'
       ]::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_wrapper_acl, pg_catalog.acldefault('f', v_wrapper_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR COALESCE(v_wrapper_acl::text, '<null>')
        IS DISTINCT FROM pg_catalog.current_setting(
          'verdant.quicklog_manual_delegate.wrapper_acl',
          true
        )
     OR pg_catalog.has_function_privilege(
       'service_role',
       v_wrapper_oid,
       'EXECUTE'
     )::text IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.quicklog_manual_delegate.wrapper_service_execute',
       true
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           v_wrapper_acl,
           pg_catalog.acldefault('f', v_wrapper_owner)
         )
       ) AS acl
       WHERE acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       v_wrapper_oid,
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       v_wrapper_oid,
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role',
       v_wrapper_oid,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_wrapper_postcondition_failed';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_delegate_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual_pre_logged_at';

  v_delegate_oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual_pre_logged_at(' || v_signature || ')'
  );
  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ),
    pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    )
  INTO
    v_delegate_owner,
    v_delegate_acl,
    v_delegate_source_length,
    v_delegate_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_delegate_oid;

  SELECT pg_catalog.count(*)
  INTO v_delegate_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l
    ON l.oid = p.prolang
  WHERE p.oid = v_delegate_oid
    AND n.nspname = 'public'
    AND p.proname = 'quicklog_save_manual_pre_logged_at'
    AND p.prokind = 'f'
    AND p.prorettype = 'jsonb'::pg_catalog.regtype
    AND NOT p.proretset
    AND l.lanname = 'plpgsql'
    AND owner_role.rolname = 'postgres'
    AND p.prosecdef
    AND NOT p.proisstrict
    AND NOT p.proleakproof
    AND p.provolatile = 'v'
    AND p.proparallel = 'u'
    AND p.pronargs = 12
    AND p.pronargdefaults = 9
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_target_type',
      'p_target_id',
      'p_action',
      'p_volume_ml',
      'p_note',
      'p_temperature_c',
      'p_humidity_pct',
      'p_vpd_kpa',
      'p_occurred_at',
      'p_details',
      'p_idempotency_key',
      'p_stage'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) = v_function_arguments
    AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[];

  IF v_delegate_overload_count <> 1
     OR v_delegate_contract_count <> 1
     OR v_delegate_oid::text IS DISTINCT FROM pg_catalog.current_setting(
       'verdant.quicklog_manual_delegate.delegate_oid',
       true
     )
     OR v_delegate_source_length <> 6734
     OR v_delegate_source_md5 <> '7ec296e422f7f47c8b2793b051840798'
     OR NOT COALESCE((
       SELECT pg_catalog.array_agg(
         pg_catalog.format(
           '%s|%s|%s|%s',
           COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type,
           acl.is_grantable, grantor.rolname
         )
         ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
       ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_delegate_acl, pg_catalog.acldefault('f', v_delegate_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           v_delegate_acl,
           pg_catalog.acldefault('f', v_delegate_owner)
         )
       ) AS acl
       WHERE acl.privilege_type = 'EXECUTE'
         AND acl.grantee <> v_delegate_owner
     )
     OR pg_catalog.has_function_privilege('anon', v_delegate_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_delegate_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_delegate_oid, 'EXECUTE')
     THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_postcondition_failed';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_helper_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'quicklog_try_parse_logged_at',
      'quicklog_try_parse_uuid',
      'quicklog_stamp_diary_logged_at',
      'quicklog_stamp_grow_event_logged_at'
    );

  WITH expected_helpers(
    signature,
    function_name,
    return_type,
    security_definer,
    is_strict,
    volatility,
    argument_count,
    argument_names,
    function_config,
    source_length,
    source_md5
  ) AS (
    VALUES
      (
        'public.quicklog_try_parse_logged_at(text)',
        'quicklog_try_parse_logged_at',
        'timestamp with time zone'::pg_catalog.regtype,
        false,
        true,
        'i',
        1,
        ARRAY['p_value']::text[],
        ARRAY['search_path=pg_catalog, pg_temp']::text[],
        414,
        '77f1aa70a70a9714057ef226b6996149'
      ),
      (
        'public.quicklog_try_parse_uuid(text)',
        'quicklog_try_parse_uuid',
        'uuid'::pg_catalog.regtype,
        false,
        true,
        'i',
        1,
        ARRAY['p_value']::text[],
        ARRAY['search_path=pg_catalog, pg_temp']::text[],
        289,
        'a34d120aad5c37a33ac05fd9597624f4'
      ),
      (
        'public.quicklog_stamp_diary_logged_at()',
        'quicklog_stamp_diary_logged_at',
        'trigger'::pg_catalog.regtype,
        true,
        false,
        'v',
        0,
        NULL::text[],
        ARRAY['search_path=public, pg_temp']::text[],
        276,
        'd9df46d36eb5d7aac767a3c87e53e92f'
      ),
      (
        'public.quicklog_stamp_grow_event_logged_at()',
        'quicklog_stamp_grow_event_logged_at',
        'trigger'::pg_catalog.regtype,
        true,
        false,
        'v',
        0,
        NULL::text[],
        ARRAY['search_path=public, pg_temp']::text[],
        276,
        'd9df46d36eb5d7aac767a3c87e53e92f'
      )
  )
  SELECT pg_catalog.count(*)
  INTO v_helper_contract_count
  FROM expected_helpers AS expected
  JOIN pg_catalog.pg_proc AS p
    ON p.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = expected.function_name
    AND p.prokind = 'f'
    AND NOT p.proretset
    AND p.prorettype = expected.return_type
    AND l.lanname = 'plpgsql'
    AND owner_role.rolname = 'postgres'
    AND p.prosecdef = expected.security_definer
    AND p.proisstrict = expected.is_strict
    AND NOT p.proleakproof
    AND p.provolatile::text = expected.volatility
    AND p.proparallel = 'u'
    AND p.pronargs = expected.argument_count
    AND p.pronargdefaults = 0
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames IS NOT DISTINCT FROM expected.argument_names
    AND p.proconfig = expected.function_config
    AND (
      CASE expected.function_name
        WHEN 'quicklog_try_parse_uuid' THEN pg_catalog.octet_length(p.prosrc)
        ELSE pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', ''))
      END
    ) = expected.source_length
    AND (
      CASE expected.function_name
        WHEN 'quicklog_try_parse_uuid' THEN pg_catalog.md5(p.prosrc)
        ELSE pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
      END
    ) = expected.source_md5
    AND COALESCE((
      SELECT pg_catalog.array_agg(
        pg_catalog.format(
          '%s|%s|%s|%s',
          COALESCE(grantee.rolname, 'PUBLIC'),
          acl.privilege_type,
          acl.is_grantable,
          grantor.rolname
        )
        ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
      ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
      FROM pg_catalog.aclexplode(
        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
    ), false)
    AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE');

  SELECT pg_catalog.count(*)
  INTO v_prerequisite_count
  FROM (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.diary_entries')
      AND a.attname = 'logged_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'timestamp with time zone'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.grow_events')
      AND a.attname = 'logged_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'timestamp with time zone'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.quicklog_idempotency')
      AND a.attname = 'request_hash'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'text'::pg_catalog.regtype
      AND NOT a.attnotnull
      AND a.atttypmod = -1
      AND a.attgenerated = ''
      AND a.attidentity = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attrdef AS d
        WHERE d.adrelid = a.attrelid
          AND d.adnum = a.attnum
      )
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = pg_catalog.to_regclass('public.diary_entries')
      AND tg.tgname = 'trg_quicklog_stamp_diary_logged_at'
      AND NOT tg.tgisinternal
      AND tg.tgtype = 7
      AND tg.tgenabled IN ('O', 'A')
      AND tg.tgqual IS NULL
      AND tg.tgnargs = 0
      AND pg_catalog.octet_length(tg.tgargs) = 0
      AND tg.tgparentid = 0
      AND tg.tgfoid = pg_catalog.to_regprocedure('public.quicklog_stamp_diary_logged_at()')
    UNION ALL
    SELECT 1
    FROM pg_catalog.pg_trigger AS tg
    WHERE tg.tgrelid = pg_catalog.to_regclass('public.grow_events')
      AND tg.tgname = 'trg_quicklog_stamp_grow_event_logged_at'
      AND NOT tg.tgisinternal
      AND tg.tgtype = 7
      AND tg.tgenabled IN ('O', 'A')
      AND tg.tgqual IS NULL
      AND tg.tgnargs = 0
      AND pg_catalog.octet_length(tg.tgargs) = 0
      AND tg.tgparentid = 0
      AND tg.tgfoid = pg_catalog.to_regprocedure('public.quicklog_stamp_grow_event_logged_at()')
  ) AS prerequisites;

  IF v_helper_overload_count <> 4
     OR v_helper_contract_count <> 4
     OR v_prerequisite_count <> 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_delegate_postcondition_failed';
  END IF;
END;
$quicklog_manual_delegate_postcondition$;

COMMIT;

NOTIFY pgrst, 'reload schema';
