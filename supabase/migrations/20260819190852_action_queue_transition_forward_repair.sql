-- Forward-repair the Action Queue owner transition contract when production
-- skipped the historical expand/contract pair. The only accepted inputs are
-- the exact measured legacy catalog or an exact already-contracted replay.
-- Every other catalog shape fails before persistent mutation.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $action_queue_transition_preflight$
DECLARE
  v_authenticated_oid oid;
  v_postgres_oid oid;
  v_transition_oid oid;
  v_guard_oid oid;
  v_transition_owner oid;
  v_transition_acl aclitem[];
  v_transition_overload_count integer;
  v_transition_contract_count integer;
  v_transition_source_length integer;
  v_transition_source_md5 text;
  v_guard_overload_count integer;
  v_guard_contract_count integer;
  v_guard_owner oid;
  v_guard_acl aclitem[];
  v_table_contract_count integer;
  v_column_contract_count integer;
  v_lineage_column_count integer;
  v_guard_trigger_count integer;
  v_action_policy_total integer;
  v_action_select_count integer;
  v_action_insert_count integer;
  v_action_insert_fingerprint text;
  v_action_update_count integer;
  v_action_update_using_fingerprint text;
  v_action_update_check_fingerprint text;
  v_action_delete_count integer;
  v_event_policy_total integer;
  v_event_select_count integer;
  v_event_legacy_insert_count integer;
  v_event_legacy_insert_fingerprint text;
  v_event_append_count integer;
  v_event_append_fingerprint text;
  v_event_delete_count integer;
  v_action_select_granted boolean;
  v_action_insert_granted boolean;
  v_action_update_granted boolean;
  v_action_delete_granted boolean;
  v_event_select_granted boolean;
  v_event_insert_granted boolean;
  v_event_update_granted boolean;
  v_event_delete_granted boolean;
  v_legacy_state boolean;
  v_contracted_state boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260819, 190852);

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_prerequisite_drift';
  END IF;

  SELECT r.oid INTO v_authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  SELECT r.oid INTO v_postgres_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'postgres';

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

  WITH expected(table_name, column_name, type_oid, is_not_null) AS (
    VALUES
      ('action_queue', 'id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'user_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'grow_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'tent_id', 'uuid'::pg_catalog.regtype, false),
      ('action_queue', 'plant_id', 'uuid'::pg_catalog.regtype, false),
      ('action_queue', 'status', 'text'::pg_catalog.regtype, true),
      ('action_queue', 'approved_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'rejected_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'completed_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'updated_at', 'timestamp with time zone'::pg_catalog.regtype, true),
      ('action_queue_events', 'id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'user_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'action_queue_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'grow_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'event_type', 'text'::pg_catalog.regtype, true),
      ('action_queue_events', 'previous_status', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'new_status', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'note', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'created_at', 'timestamp with time zone'::pg_catalog.regtype, true)
  )
  SELECT pg_catalog.count(*)
  INTO v_column_contract_count
  FROM expected AS e
  JOIN pg_catalog.pg_class AS c ON c.relname = e.table_name
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = e.column_name
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND a.atttypid = e.type_oid
    AND a.atttypmod = -1
    AND a.attnotnull = e.is_not_null
    AND a.attgenerated = ''
    AND a.attidentity = '';

  WITH expected(table_name, column_name) AS (
    VALUES
      ('grows', 'id'),
      ('grows', 'user_id'),
      ('tents', 'id'),
      ('tents', 'user_id'),
      ('tents', 'grow_id'),
      ('plants', 'id'),
      ('plants', 'user_id'),
      ('plants', 'grow_id'),
      ('plants', 'tent_id')
  )
  SELECT pg_catalog.count(*)
  INTO v_lineage_column_count
  FROM expected AS e
  JOIN pg_catalog.pg_class AS c ON c.relname = e.table_name
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = e.column_name
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND a.atttypid = 'uuid'::pg_catalog.regtype
    AND a.atttypmod = -1
    AND a.attgenerated = ''
    AND a.attidentity = '';

  IF v_table_contract_count <> 2
     OR v_column_contract_count <> 19
     OR v_lineage_column_count <> 9 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_prerequisite_drift';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_guard_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'action_queue_guard_decision_fields';

  v_guard_oid := pg_catalog.to_regprocedure(
    'public.action_queue_guard_decision_fields()'
  );

  SELECT p.proowner, p.proacl
  INTO v_guard_owner, v_guard_acl
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_guard_oid;

  SELECT pg_catalog.count(*)
  INTO v_guard_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.oid = v_guard_oid
    AND n.nspname = 'public'
    AND p.proname = 'action_queue_guard_decision_fields'
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
    AND pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ) = 1101
    AND pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ) = '88e81c4dfbc6d17260def35d1a619ee1';

  SELECT pg_catalog.count(*)
  INTO v_guard_trigger_count
  FROM pg_catalog.pg_trigger AS tg
  WHERE tg.tgrelid = pg_catalog.to_regclass('public.action_queue')
    AND tg.tgname = 'trg_action_queue_guard_decision_fields'
    AND NOT tg.tgisinternal
    AND tg.tgenabled = 'O'
    AND tg.tgtype = 19
    AND tg.tgqual IS NULL
    AND tg.tgnargs = 0
    AND pg_catalog.octet_length(tg.tgargs) = 0
    AND tg.tgparentid = 0
    AND tg.tgfoid = v_guard_oid
    AND (
      SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
      FROM pg_catalog.unnest(tg.tgattr::smallint[]) AS trigger_column(attnum)
      JOIN pg_catalog.pg_attribute AS a
        ON a.attrelid = tg.tgrelid
       AND a.attnum = trigger_column.attnum
    ) = ARRAY['approved_at', 'completed_at', 'rejected_at', 'status']::name[];

  IF v_guard_overload_count <> 1
     OR v_guard_contract_count <> 1
     OR v_guard_trigger_count <> 1
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
       ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_guard_acl, pg_catalog.acldefault('f', v_guard_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR pg_catalog.has_function_privilege('anon', v_guard_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_guard_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_guard_oid, 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_guard_drift';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_transition_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'action_queue_transition';

  v_transition_oid := pg_catalog.to_regprocedure(
    'public.action_queue_transition(uuid, text, text, text)'
  );

  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', '')),
    pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
  INTO
    v_transition_owner,
    v_transition_acl,
    v_transition_source_length,
    v_transition_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_transition_oid;

  SELECT pg_catalog.count(*)
  INTO v_transition_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.oid = v_transition_oid
    AND n.nspname = 'public'
    AND p.proname = 'action_queue_transition'
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
    AND p.pronargs = 4
    AND p.pronargdefaults = 1
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_action_queue_id',
      'p_transition',
      'p_expected_status',
      'p_note'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) =
      'p_action_queue_id uuid, p_transition text, p_expected_status text, p_note text DEFAULT NULL::text'
    AND p.proconfig = ARRAY['search_path=""']::text[];

  IF v_transition_overload_count NOT IN (0, 1)
     OR (
       v_transition_overload_count = 1
       AND (
         v_transition_contract_count <> 1
         OR v_transition_source_length <> 4997
         OR v_transition_source_md5 <> 'ce755f8e6a6515640a2f86c15de3ba63'
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
             'postgres|EXECUTE|f|postgres'
           ]::text[]
           FROM pg_catalog.aclexplode(
             COALESCE(
               v_transition_acl,
               pg_catalog.acldefault('f', v_transition_owner)
             )
           ) AS acl
           LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
           JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
         ), false)
         OR pg_catalog.has_function_privilege('anon', v_transition_oid, 'EXECUTE')
         OR NOT pg_catalog.has_function_privilege('authenticated', v_transition_oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('service_role', v_transition_oid, 'EXECUTE')
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_function_drift';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_action_policy_total
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue');

  SELECT pg_catalog.count(*)
  INTO v_action_select_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users view own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'r'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  SELECT
    pg_catalog.count(*),
    pg_catalog.min(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))))
  INTO v_action_insert_count, v_action_insert_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users insert own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT
    pg_catalog.count(*),
    pg_catalog.min(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    )))),
    pg_catalog.min(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))))
  INTO
    v_action_update_count,
    v_action_update_using_fingerprint,
    v_action_update_check_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users update own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'w'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NOT NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT pg_catalog.count(*)
  INTO v_action_delete_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users delete own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'd'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  SELECT pg_catalog.count(*)
  INTO v_event_policy_total
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events');

  SELECT pg_catalog.count(*)
  INTO v_event_select_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users view own action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'r'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  SELECT
    pg_catalog.count(*),
    pg_catalog.min(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))))
  INTO v_event_legacy_insert_count, v_event_legacy_insert_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users insert own action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT
    pg_catalog.count(*),
    pg_catalog.min(pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))))
  INTO v_event_append_count, v_event_append_fingerprint
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users append own non-transition action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND p.polwithcheck IS NOT NULL;

  SELECT pg_catalog.count(*)
  INTO v_event_delete_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users delete own action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'd'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  v_action_update_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue', 'UPDATE'
  );
  v_action_delete_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue', 'DELETE'
  );
  v_event_update_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue_events', 'UPDATE'
  );
  v_event_delete_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue_events', 'DELETE'
  );
  v_action_select_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue', 'SELECT'
  );
  v_action_insert_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue', 'INSERT'
  );
  v_event_select_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue_events', 'SELECT'
  );
  v_event_insert_granted := pg_catalog.has_table_privilege(
    'authenticated', 'public.action_queue_events', 'INSERT'
  );

  v_legacy_state :=
    v_transition_overload_count = 0
    AND v_action_policy_total = 4
    AND v_action_select_count = 1
    AND v_action_insert_count = 1
    AND v_action_insert_fingerprint = '02cf2857792d152113b7ab13fae6ca3f'
    AND v_action_update_count = 1
    AND v_action_update_using_fingerprint = 'b3c61a20be8f6d80b62d4abd81066fab'
    AND v_action_update_check_fingerprint = '02cf2857792d152113b7ab13fae6ca3f'
    AND v_action_delete_count = 1
    AND v_event_policy_total = 3
    AND v_event_select_count = 1
    AND v_event_legacy_insert_count = 1
    AND v_event_legacy_insert_fingerprint = 'e79ba22f2e33a05579e48db4b022a4a9'
    AND v_event_append_count = 0
    AND v_event_delete_count = 1
    AND v_action_select_granted
    AND v_action_insert_granted
    AND v_event_select_granted
    AND v_event_insert_granted
    AND v_action_update_granted
    AND v_action_delete_granted
    AND v_event_update_granted
    AND v_event_delete_granted;

  v_contracted_state :=
    v_transition_overload_count = 1
    AND v_transition_contract_count = 1
    AND v_action_policy_total = 2
    AND v_action_select_count = 1
    AND v_action_insert_count = 1
    AND v_action_insert_fingerprint IN (
      '4d4741c455cf307f3e4909041c9d85d7',
      'e08f43c1f4e1308a8d50e6cab797f933'
    )
    AND v_action_update_count = 0
    AND v_action_delete_count = 0
    AND v_event_policy_total = 2
    AND v_event_select_count = 1
    AND v_event_legacy_insert_count = 0
    AND v_event_append_count = 1
    AND v_event_append_fingerprint = '420914cd6ffbd2d552c30e8d7b6ddf73'
    AND v_event_delete_count = 0
    AND v_action_select_granted
    AND v_action_insert_granted
    AND v_event_select_granted
    AND v_event_insert_granted
    AND NOT v_action_update_granted
    AND NOT v_action_delete_granted
    AND NOT v_event_update_granted
    AND NOT v_event_delete_granted;

  IF NOT v_legacy_state AND NOT v_contracted_state THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_state_drift';
  END IF;

  PERFORM pg_catalog.set_config(
    'verdant.action_queue_transition.original_oid',
    COALESCE(v_transition_oid::text, '0'),
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_transition.input_state',
    CASE WHEN v_legacy_state THEN 'legacy' ELSE 'contracted' END,
    true
  );
END;
$action_queue_transition_preflight$;

CREATE OR REPLACE FUNCTION public.action_queue_transition(
  p_action_queue_id uuid,
  p_transition text,
  p_expected_status text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action public.action_queue%ROWTYPE;
  v_new_status text;
  v_event_type text;
  v_expected_status_allowed boolean := false;
  v_transitioned_at timestamptz;
  v_event_id uuid;
  v_existing_event_at timestamptz;
  v_updated_count integer := 0;
  v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_action_queue_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  CASE p_transition
    WHEN 'approve' THEN
      v_expected_status_allowed := p_expected_status IN ('pending_approval', 'simulated');
      v_new_status := 'approved';
      v_event_type := 'approved';
    WHEN 'simulate' THEN
      v_expected_status_allowed := p_expected_status = 'pending_approval';
      v_new_status := 'simulated';
      v_event_type := 'simulated';
    WHEN 'reject' THEN
      v_expected_status_allowed := p_expected_status = 'pending_approval';
      v_new_status := 'rejected';
      v_event_type := 'rejected';
    WHEN 'complete' THEN
      v_expected_status_allowed := p_expected_status IN ('approved', 'simulated');
      v_new_status := 'completed';
      v_event_type := 'completed';
    WHEN 'cancel' THEN
      v_expected_status_allowed :=
        p_expected_status IN ('pending_approval', 'approved', 'simulated');
      v_new_status := 'cancelled';
      v_event_type := 'cancelled';
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  END CASE;

  IF v_expected_status_allowed IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'illegal_transition');
  END IF;

  SELECT aq.*
    INTO v_action
    FROM public.action_queue AS aq
   WHERE aq.id = p_action_queue_id
     AND aq.user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'action_not_found');
  END IF;

  -- A retried request may arrive after the original response was lost. Reuse
  -- only a fully recorded transition; a legacy status-only write is a conflict
  -- and is never presented as an atomic success.
  IF v_action.status IS DISTINCT FROM p_expected_status THEN
    IF v_action.status = v_new_status THEN
      SELECT aqe.id, aqe.created_at
        INTO v_event_id, v_existing_event_at
        FROM public.action_queue_events AS aqe
       WHERE aqe.action_queue_id = v_action.id
         AND aqe.user_id = v_uid
         AND aqe.grow_id = v_action.grow_id
         AND aqe.event_type = v_event_type
         AND aqe.previous_status = p_expected_status
         AND aqe.new_status = v_new_status
         AND aqe.note IS NOT DISTINCT FROM v_note
       ORDER BY aqe.created_at DESC, aqe.id DESC
       LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', true,
          'action_queue_id', v_action.id,
          'previous_status', p_expected_status,
          'new_status', v_new_status,
          'event_id', v_event_id,
          'transitioned_at', v_existing_event_at,
          'reused', true
        );
      END IF;
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'status_conflict');
  END IF;

  -- Capture lifecycle time only after acquiring the row lock and validating
  -- the compare-and-swap precondition. Lock contention must never backdate
  -- the status or its audit event.
  v_transitioned_at := clock_timestamp();

  UPDATE public.action_queue AS aq
     SET status = v_new_status,
         approved_at = CASE
           WHEN p_transition = 'approve' THEN v_transitioned_at
           ELSE aq.approved_at
         END,
         rejected_at = CASE
           WHEN p_transition = 'reject' THEN v_transitioned_at
           ELSE aq.rejected_at
         END,
         completed_at = CASE
           WHEN p_transition = 'complete' THEN v_transitioned_at
           ELSE aq.completed_at
         END
   WHERE aq.id = v_action.id
     AND aq.user_id = v_uid
     AND aq.status = p_expected_status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'action_queue transition compare-and-swap failed'
      USING ERRCODE = '40001';
  END IF;

  -- Deliberately do not catch this INSERT. Any constraint, trigger, or storage
  -- failure aborts the RPC statement and rolls back the row UPDATE above.
  INSERT INTO public.action_queue_events (
    user_id,
    action_queue_id,
    grow_id,
    event_type,
    previous_status,
    new_status,
    note,
    created_at
  )
  VALUES (
    v_uid,
    v_action.id,
    v_action.grow_id,
    v_event_type,
    p_expected_status,
    v_new_status,
    v_note,
    v_transitioned_at
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_queue_id', v_action.id,
    'previous_status', p_expected_status,
    'new_status', v_new_status,
    'event_id', v_event_id,
    'transitioned_at', v_transitioned_at,
    'reused', false
  );
END;
$function$;

ALTER FUNCTION public.action_queue_transition(uuid, text, text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  TO authenticated;
COMMENT ON FUNCTION public.action_queue_transition(uuid, text, text, text) IS
  'Atomically records an owner-scoped Action Queue lifecycle transition and its audit event.';

-- Preserve the later direct-grow-first/tent-fallback insert policy while
-- adding the approval-required initialization checks missing from legacy.
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

DROP POLICY IF EXISTS "Users update own action_queue"
  ON public.action_queue;
DROP POLICY IF EXISTS "Users delete own action_queue"
  ON public.action_queue;
REVOKE UPDATE, DELETE ON TABLE public.action_queue
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users insert own action_queue_events"
  ON public.action_queue_events;
DROP POLICY IF EXISTS "Users append own non-transition action_queue_events"
  ON public.action_queue_events;
DROP POLICY IF EXISTS "Users delete own action_queue_events"
  ON public.action_queue_events;

CREATE POLICY "Users append own non-transition action_queue_events"
  ON public.action_queue_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = action_queue_events.user_id
    AND action_queue_events.event_type IN ('created', 'note')
    AND EXISTS (
      SELECT 1
      FROM public.grows AS g
      WHERE g.id = action_queue_events.grow_id
        AND g.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.action_queue AS aq
      WHERE aq.id = action_queue_events.action_queue_id
        AND aq.user_id = auth.uid()
        AND aq.grow_id = action_queue_events.grow_id
        AND (
          (
            action_queue_events.event_type = 'created'
            AND aq.status = 'pending_approval'
            AND action_queue_events.previous_status IS NULL
            AND action_queue_events.new_status = 'pending_approval'
          )
          OR
          (
            action_queue_events.event_type = 'note'
            AND NULLIF(btrim(action_queue_events.note), '') IS NOT NULL
            AND action_queue_events.previous_status IS NOT DISTINCT FROM aq.status
            AND action_queue_events.new_status IS NOT DISTINCT FROM aq.status
          )
        )
    )
  );

REVOKE UPDATE, DELETE ON TABLE public.action_queue_events
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.action_queue_guard_decision_fields() IS
  'Defense-in-depth for privileged action_queue writes; authenticated lifecycle changes use action_queue_transition because direct UPDATE is revoked.';

DO $action_queue_transition_postflight$
DECLARE
  v_authenticated_oid oid;
  v_postgres_oid oid;
  v_transition_oid oid;
  v_transition_owner oid;
  v_transition_acl aclitem[];
  v_transition_overload_count integer;
  v_transition_contract_count integer;
  v_transition_source_length integer;
  v_transition_source_md5 text;
  v_guard_oid oid;
  v_guard_owner oid;
  v_guard_acl aclitem[];
  v_guard_contract_count integer;
  v_guard_trigger_count integer;
  v_table_contract_count integer;
  v_column_contract_count integer;
  v_action_policy_total integer;
  v_action_select_count integer;
  v_action_insert_count integer;
  v_event_policy_total integer;
  v_event_select_count integer;
  v_event_append_count integer;
BEGIN
  SELECT r.oid INTO v_authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  SELECT r.oid INTO v_postgres_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'postgres';

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

  WITH expected(table_name, column_name, type_oid, is_not_null) AS (
    VALUES
      ('action_queue', 'id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'user_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'grow_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue', 'tent_id', 'uuid'::pg_catalog.regtype, false),
      ('action_queue', 'plant_id', 'uuid'::pg_catalog.regtype, false),
      ('action_queue', 'status', 'text'::pg_catalog.regtype, true),
      ('action_queue', 'approved_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'rejected_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'completed_at', 'timestamp with time zone'::pg_catalog.regtype, false),
      ('action_queue', 'updated_at', 'timestamp with time zone'::pg_catalog.regtype, true),
      ('action_queue_events', 'id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'user_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'action_queue_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'grow_id', 'uuid'::pg_catalog.regtype, true),
      ('action_queue_events', 'event_type', 'text'::pg_catalog.regtype, true),
      ('action_queue_events', 'previous_status', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'new_status', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'note', 'text'::pg_catalog.regtype, false),
      ('action_queue_events', 'created_at', 'timestamp with time zone'::pg_catalog.regtype, true)
  )
  SELECT pg_catalog.count(*)
  INTO v_column_contract_count
  FROM expected AS e
  JOIN pg_catalog.pg_class AS c ON c.relname = e.table_name
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = e.column_name
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND a.atttypid = e.type_oid
    AND a.atttypmod = -1
    AND a.attnotnull = e.is_not_null
    AND a.attgenerated = ''
    AND a.attidentity = '';

  SELECT pg_catalog.count(*)
  INTO v_transition_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'action_queue_transition';

  v_transition_oid := pg_catalog.to_regprocedure(
    'public.action_queue_transition(uuid, text, text, text)'
  );

  SELECT
    p.proowner,
    p.proacl,
    pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', '')),
    pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
  INTO
    v_transition_owner,
    v_transition_acl,
    v_transition_source_length,
    v_transition_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_transition_oid;

  SELECT pg_catalog.count(*)
  INTO v_transition_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.oid = v_transition_oid
    AND n.nspname = 'public'
    AND p.proname = 'action_queue_transition'
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
    AND p.pronargs = 4
    AND p.pronargdefaults = 1
    AND p.proargmodes IS NULL
    AND p.proallargtypes IS NULL
    AND p.proargnames = ARRAY[
      'p_action_queue_id',
      'p_transition',
      'p_expected_status',
      'p_note'
    ]::text[]
    AND pg_catalog.pg_get_function_arguments(p.oid) =
      'p_action_queue_id uuid, p_transition text, p_expected_status text, p_note text DEFAULT NULL::text'
    AND p.proconfig = ARRAY['search_path=""']::text[];

  IF v_table_contract_count <> 2
     OR v_column_contract_count <> 19
     OR v_transition_overload_count <> 1
     OR v_transition_contract_count <> 1
     OR v_transition_source_length <> 4997
     OR v_transition_source_md5 <> 'ce755f8e6a6515640a2f86c15de3ba63'
     OR (
       pg_catalog.current_setting(
         'verdant.action_queue_transition.original_oid', true
       ) <> '0'
       AND v_transition_oid::text IS DISTINCT FROM pg_catalog.current_setting(
         'verdant.action_queue_transition.original_oid', true
       )
     )
     OR pg_catalog.current_setting(
       'verdant.action_queue_transition.input_state', true
     ) NOT IN ('legacy', 'contracted')
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
         'postgres|EXECUTE|f|postgres'
       ]::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(
           v_transition_acl,
           pg_catalog.acldefault('f', v_transition_owner)
         )
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR pg_catalog.has_function_privilege('anon', v_transition_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_transition_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_transition_oid, 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_function_postcondition_failed';
  END IF;

  v_guard_oid := pg_catalog.to_regprocedure(
    'public.action_queue_guard_decision_fields()'
  );
  SELECT p.proowner, p.proacl
  INTO v_guard_owner, v_guard_acl
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_guard_oid;

  SELECT pg_catalog.count(*)
  INTO v_guard_contract_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.oid = v_guard_oid
    AND n.nspname = 'public'
    AND p.proname = 'action_queue_guard_decision_fields'
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
    AND pg_catalog.octet_length(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ) = 1101
    AND pg_catalog.md5(
      pg_catalog.replace(p.prosrc, E'\r', '')
    ) = '88e81c4dfbc6d17260def35d1a619ee1';

  SELECT pg_catalog.count(*)
  INTO v_guard_trigger_count
  FROM pg_catalog.pg_trigger AS tg
  WHERE tg.tgrelid = pg_catalog.to_regclass('public.action_queue')
    AND tg.tgname = 'trg_action_queue_guard_decision_fields'
    AND NOT tg.tgisinternal
    AND tg.tgenabled = 'O'
    AND tg.tgtype = 19
    AND tg.tgqual IS NULL
    AND tg.tgnargs = 0
    AND pg_catalog.octet_length(tg.tgargs) = 0
    AND tg.tgparentid = 0
    AND tg.tgfoid = v_guard_oid
    AND (
      SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
      FROM pg_catalog.unnest(tg.tgattr::smallint[]) AS trigger_column(attnum)
      JOIN pg_catalog.pg_attribute AS a
        ON a.attrelid = tg.tgrelid
       AND a.attnum = trigger_column.attnum
    ) = ARRAY['approved_at', 'completed_at', 'rejected_at', 'status']::name[];

  IF v_guard_contract_count <> 1
     OR v_guard_trigger_count <> 1
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
       ) = ARRAY['postgres|EXECUTE|f|postgres']::text[]
       FROM pg_catalog.aclexplode(
         COALESCE(v_guard_acl, pg_catalog.acldefault('f', v_guard_owner))
       ) AS acl
       LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor
     ), false)
     OR pg_catalog.has_function_privilege('anon', v_guard_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', v_guard_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_guard_oid, 'EXECUTE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_guard_postcondition_failed';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_action_policy_total
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue');

  SELECT pg_catalog.count(*)
  INTO v_action_select_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users view own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'r'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  SELECT pg_catalog.count(*)
  INTO v_action_insert_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue')
    AND p.polname = 'Users insert own action_queue'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))) = 'e08f43c1f4e1308a8d50e6cab797f933';

  SELECT pg_catalog.count(*)
  INTO v_event_policy_total
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events');

  SELECT pg_catalog.count(*)
  INTO v_event_select_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users view own action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'r'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polwithcheck IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', '', 'g'
    ))) = 'b3c61a20be8f6d80b62d4abd81066fab';

  SELECT pg_catalog.count(*)
  INTO v_event_append_count
  FROM pg_catalog.pg_policy AS p
  WHERE p.polrelid = pg_catalog.to_regclass('public.action_queue_events')
    AND p.polname = 'Users append own non-transition action_queue_events'
    AND p.polpermissive
    AND p.polcmd = 'a'
    AND p.polroles = ARRAY[v_authenticated_oid]
    AND p.polqual IS NULL
    AND pg_catalog.md5(pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', '', 'g'
    ))) = '420914cd6ffbd2d552c30e8d7b6ddf73';

  IF v_action_policy_total <> 2
     OR v_action_select_count <> 1
     OR v_action_insert_count <> 1
     OR v_event_policy_total <> 2
     OR v_event_select_count <> 1
     OR v_event_append_count <> 1
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'anon', 'public.action_queue_events', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue', 'DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.action_queue_events', 'DELETE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_transition_forward_repair_policy_postcondition_failed';
  END IF;
END;
$action_queue_transition_postflight$;

COMMIT;

NOTIFY pgrst, 'reload schema';
