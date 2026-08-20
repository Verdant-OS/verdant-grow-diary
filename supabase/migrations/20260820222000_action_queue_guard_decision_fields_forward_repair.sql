-- Forward-repair the Action Queue decision-field guard so the merged transition
-- contract can be applied.
--
-- Production skipped 20260725093000_restore_action_queue_owner_decisions.sql.
-- Measured against production on 2026-08-20, the live guard is still the
-- revision created by 20260721225930_b34caa3e-17e4-47c1-9847-19d1c184d83c:
-- prosrc 1028 bytes / md5 09459a9cc8532aae905639b3055c680f, proconfig
-- {search_path=public}, and a trigger that omits completed_at. Separately, no
-- committed migration has ever revoked service_role EXECUTE on the guard --
-- 20260721225930 and 20260725093000 revoke only FROM PUBLIC, and
-- 20260804091142_da8cef1f-8279-4137-8d63-e9bbc739004a revokes only FROM anon,
-- authenticated -- so the Supabase default function grant survives everywhere.
--
-- 20260819190852_action_queue_transition_forward_repair.sql refuses to run
-- until the guard matches its expected revision AND holds EXECUTE for postgres
-- alone. Applying it on 2026-08-20 aborted at
-- action_queue_transition_forward_repair_guard_drift with zero writes. This
-- migration closes exactly that gap and nothing else.
--
-- The guard body below is byte-identical to the one committed in
-- 20260725093000 (1101 bytes, md5 88e81c4dfbc6d17260def35d1a619ee1). That file
-- is merged history and is NOT edited here; per the Migration Immutability
-- Rules this is a new additive migration that moves state forward.
--
-- Revoking service_role EXECUTE does not change who can transition a row. The
-- guard admits service_role by JWT claim (v_role = 'service_role'), not by
-- function privilege, and PostgreSQL does not test EXECUTE on a trigger
-- function when the trigger fires -- the same property the Quick Log private
-- helpers already rely on. No RLS policy, table grant, column, or row is
-- touched. No equipment command or automation is introduced.
--
-- Accepted inputs, and nothing else:
--   * the live production revision (body v1 + service_role EXECUTE present);
--   * a fresh in-order replay (body v2 + service_role EXECUTE present, because
--     the Supabase default grant is re-applied on create);
--   * an already-repaired database (body v2 + postgres-only EXECUTE), replayed
--     as a no-op.
-- Any other catalog shape aborts before persistent mutation.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $action_queue_guard_forward_repair_preflight$
DECLARE
  v_guard_oid oid;
  v_guard_owner oid;
  v_guard_acl aclitem[];
  v_guard_overload_count integer;
  v_guard_shape_count integer;
  v_guard_source_length integer;
  v_guard_source_md5 text;
  v_guard_proconfig text[];
  v_trigger_count integer;
  v_trigger_columns name[];
  v_acl_signature text[];
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_service_role_execute boolean;
  v_body_v1 boolean;
  v_body_v2 boolean;
  v_acl_unrepaired boolean;
  v_acl_repaired boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260820, 222000);

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  ) <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_guard_forward_repair_prerequisite_drift';
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

  SELECT
    p.proowner,
    p.proacl,
    p.proconfig,
    pg_catalog.octet_length(pg_catalog.replace(p.prosrc, E'\r', '')),
    pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
  INTO
    v_guard_owner,
    v_guard_acl,
    v_guard_proconfig,
    v_guard_source_length,
    v_guard_source_md5
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_guard_oid;

  -- Every attribute the transition forward repair pins, EXCEPT the body,
  -- proconfig and ACL -- those three are what this migration is allowed to
  -- move. Anything else differing means an unrecognised object.
  SELECT pg_catalog.count(*)
  INTO v_guard_shape_count
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
    AND p.proargnames IS NULL;

  SELECT pg_catalog.count(*)
  INTO v_trigger_count
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
    AND tg.tgfoid = v_guard_oid;

  SELECT (
    SELECT pg_catalog.array_agg(a.attname ORDER BY a.attname)
    FROM pg_catalog.unnest(tg.tgattr::smallint[]) AS trigger_column(attnum)
    JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = tg.tgrelid
     AND a.attnum = trigger_column.attnum
  )
  INTO v_trigger_columns
  FROM pg_catalog.pg_trigger AS tg
  WHERE tg.tgrelid = pg_catalog.to_regclass('public.action_queue')
    AND tg.tgname = 'trg_action_queue_guard_decision_fields'
    AND NOT tg.tgisinternal;

  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s|%s|%s|%s',
      COALESCE(grantee.rolname, 'PUBLIC'),
      acl.privilege_type,
      acl.is_grantable,
      grantor.rolname
    )
    ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
  )
  INTO v_acl_signature
  FROM pg_catalog.aclexplode(
    COALESCE(v_guard_acl, pg_catalog.acldefault('f', v_guard_owner))
  ) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = acl.grantor;

  v_anon_execute := pg_catalog.has_function_privilege('anon', v_guard_oid, 'EXECUTE');
  v_authenticated_execute :=
    pg_catalog.has_function_privilege('authenticated', v_guard_oid, 'EXECUTE');
  v_service_role_execute :=
    pg_catalog.has_function_privilege('service_role', v_guard_oid, 'EXECUTE');

  -- The only two bodies this repository has ever committed for this guard.
  v_body_v1 :=
    v_guard_source_length = 1028
    AND v_guard_source_md5 = '09459a9cc8532aae905639b3055c680f'
    AND v_guard_proconfig = ARRAY['search_path=public']::text[]
    AND v_trigger_columns = ARRAY['approved_at', 'rejected_at', 'status']::name[];

  v_body_v2 :=
    v_guard_source_length = 1101
    AND v_guard_source_md5 = '88e81c4dfbc6d17260def35d1a619ee1'
    AND v_guard_proconfig = ARRAY['search_path=public, pg_temp']::text[]
    AND v_trigger_columns =
      ARRAY['approved_at', 'completed_at', 'rejected_at', 'status']::name[];

  v_acl_unrepaired :=
    v_acl_signature = ARRAY[
      'postgres|EXECUTE|f|postgres',
      'service_role|EXECUTE|f|postgres'
    ]::text[]
    AND v_service_role_execute;

  v_acl_repaired :=
    v_acl_signature = ARRAY['postgres|EXECUTE|f|postgres']::text[]
    AND NOT v_service_role_execute;

  IF v_guard_overload_count <> 1
     OR v_guard_shape_count <> 1
     OR v_trigger_count <> 1
     OR v_anon_execute
     OR v_authenticated_execute
     OR NOT (v_body_v1 OR v_body_v2)
     OR NOT (v_acl_unrepaired OR v_acl_repaired) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_guard_forward_repair_state_drift';
  END IF;

  PERFORM pg_catalog.set_config(
    'verdant.action_queue_guard.original_oid',
    v_guard_oid::text,
    true
  );
  PERFORM pg_catalog.set_config(
    'verdant.action_queue_guard.input_state',
    CASE
      WHEN v_body_v2 AND v_acl_repaired THEN 'already_repaired'
      WHEN v_body_v2 THEN 'body_current_acl_open'
      ELSE 'legacy'
    END,
    true
  );
END;
$action_queue_guard_forward_repair_preflight$;

CREATE OR REPLACE FUNCTION public.action_queue_guard_decision_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_operator boolean := false;
  v_status_changed boolean := NEW.status IS DISTINCT FROM OLD.status;
  v_approved_changed boolean := NEW.approved_at IS DISTINCT FROM OLD.approved_at;
  v_rejected_changed boolean := NEW.rejected_at IS DISTINCT FROM OLD.rejected_at;
  v_completed_changed boolean := NEW.completed_at IS DISTINCT FROM OLD.completed_at;
BEGIN
  IF NOT (
    v_status_changed
    OR v_approved_changed
    OR v_rejected_changed
    OR v_completed_changed
  ) THEN
    RETURN NEW;
  END IF;

  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_owner := OLD.user_id = v_uid AND NEW.user_id = OLD.user_id;
    v_is_operator := public.has_role(v_uid, 'operator'::public.app_role);
  END IF;

  IF v_is_owner OR v_is_operator THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'action_queue decision fields can only be modified by the row owner, operators, or service_role'
    USING ERRCODE = '42501';
END;
$$;

-- CREATE OR REPLACE preserves an existing function's ownership and privileges,
-- so the grants below run after the body is in place, never before.
REVOKE ALL ON FUNCTION public.action_queue_guard_decision_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.action_queue_guard_decision_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.action_queue_guard_decision_fields()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.action_queue_guard_decision_fields()
  FROM service_role;

DROP TRIGGER IF EXISTS trg_action_queue_guard_decision_fields
  ON public.action_queue;

CREATE TRIGGER trg_action_queue_guard_decision_fields
BEFORE UPDATE OF status, approved_at, rejected_at, completed_at
ON public.action_queue
FOR EACH ROW
EXECUTE FUNCTION public.action_queue_guard_decision_fields();

COMMENT ON FUNCTION public.action_queue_guard_decision_fields() IS
  'Allows action_queue decision changes only for the row owner, operators, or service_role; existing RLS continues to enforce owner and lineage scope.';

-- The postcondition below is deliberately the exact predicate that
-- 20260819190852_action_queue_transition_forward_repair.sql evaluates in its
-- own guard-drift gate. If this block passes, that migration's guard gate
-- accepts; if it ever diverges, this migration fails instead of handing the
-- next operator a repair that still aborts.
DO $action_queue_guard_forward_repair_postflight$
DECLARE
  v_guard_oid oid;
  v_guard_owner oid;
  v_guard_acl aclitem[];
  v_guard_overload_count integer;
  v_guard_contract_count integer;
  v_guard_trigger_count integer;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_guard_overload_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'action_queue_guard_decision_fields';

  v_guard_oid := pg_catalog.to_regprocedure(
    'public.action_queue_guard_decision_fields()'
  );

  IF pg_catalog.current_setting(
       'verdant.action_queue_guard.original_oid', true
     ) IS DISTINCT FROM v_guard_oid::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'action_queue_guard_forward_repair_identity_postcondition_failed';
  END IF;

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
      MESSAGE = 'action_queue_guard_forward_repair_postcondition_failed';
  END IF;
END;
$action_queue_guard_forward_repair_postflight$;

COMMIT;

NOTIFY pgrst, 'reload schema';
