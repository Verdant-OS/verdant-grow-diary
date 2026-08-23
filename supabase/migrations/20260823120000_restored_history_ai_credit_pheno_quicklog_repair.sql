-- Forward-repair objects that immutable hosted-sandbox history can overwrite
-- when its missing historical version ids are inserted into a database that
-- already applied the later canonical migrations.
--
-- Never edit the restored historical files. Fresh chronological replay reaches
-- the same final definitions; incremental hosted apply reaches them through
-- this new additive migration.

-- 20260710005819 can replace the retired five-argument client spend overload
-- after later service-only hardening has already run. Restore the final legacy
-- body for catalog fidelity, then keep every API role denied exactly as
-- 20260728090736 requires.
CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_feature text,
  p_grow_id uuid,
  p_model_tier text,
  p_idempotency_key text,
  p_result jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_plan_id text;
  v_lov_plan text;
  v_per_grow int;
  v_per_month int;
  v_weight int := 1;
  v_period_key text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_scope text;
  v_limit int;
  v_used int;
  v_existing record;
  v_new_id uuid;
  v_is_staff boolean := false;
  v_pack_granted int := 0;
  v_pack_used int := 0;
  v_pack_balance int := 0;
  v_funded_by text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authenticated');
  END IF;
  IF p_feature NOT IN ('ai_doctor_review','ai_coach') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_feature');
  END IF;
  IF p_model_tier NOT IN ('standard','escalated') THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_model_tier');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_idempotency_key');
  END IF;

  v_weight := CASE p_model_tier WHEN 'escalated' THEN 5 ELSE 1 END;

  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  IF p_grow_id IS NOT NULL THEN
    PERFORM 1
      FROM public.grows grow_row
     WHERE grow_row.id = p_grow_id
       AND grow_row.user_id = v_uid
     FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_not_owned');
    END IF;
  END IF;

  SELECT id, status, weight, model_tier, feature, grow_id, period_key, result
    INTO v_existing
    FROM public.ai_credit_spends
   WHERE user_id = v_uid AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', v_existing.status = 'spent',
      'status', CASE WHEN v_existing.status = 'spent' THEN 'replayed' ELSE 'invalid' END,
      'spend_id', v_existing.id,
      'weight', v_existing.weight,
      'period_key', v_existing.period_key,
      'model_tier', v_existing.model_tier,
      'feature', v_existing.feature,
      'result', v_existing.result
    );
  END IF;

  SELECT s.price_id
    INTO v_lov_plan
    FROM public.subscriptions s
   WHERE s.user_id = v_uid
     AND s.environment = 'live'
     AND (
       (
         s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')
         AND s.current_period_end IS NOT NULL
         AND (
           (s.status IN ('active','trialing') AND s.current_period_end > now())
           OR s.status = 'past_due'
           OR (s.status = 'canceled' AND s.current_period_end > now())
         )
       )
       OR (
         s.price_id = 'founder_lifetime'
         AND left(s.paddle_subscription_id, 9) = 'lifetime_'
         AND s.status = 'active'
         AND s.current_period_end IS NULL
       )
     )
   ORDER BY s.created_at DESC
   LIMIT 1;

  v_plan_id := COALESCE(v_lov_plan, 'free');

  SELECT per_grow, per_month INTO v_per_grow, v_per_month
    FROM public.ai_credit_allowance(v_plan_id);

  v_is_staff := public.has_role(v_uid, 'staff'::public.app_role);
  IF v_is_staff THEN
    v_per_grow := NULL;
    v_per_month := 10000;
    v_plan_id := 'staff';
  END IF;

  IF v_per_grow IS NOT NULL THEN
    v_scope := 'per_grow';
    v_limit := v_per_grow;
    IF p_grow_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'status', 'invalid', 'reason', 'grow_id_required_for_plan',
        'plan_id', v_plan_id);
    END IF;
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND grow_id = p_grow_id
       AND (meta ->> 'funded_by') IS DISTINCT FROM 'pack';
  ELSIF v_per_month IS NOT NULL THEN
    v_scope := 'per_month';
    v_limit := v_per_month;
    SELECT COALESCE(SUM(weight), 0) INTO v_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND period_key = v_period_key
       AND (meta ->> 'funded_by') IS DISTINCT FROM 'pack';
  ELSE
    RETURN jsonb_build_object(
      'ok', false, 'status', 'denied', 'reason', 'unknown_plan',
      'plan_id', v_plan_id, 'scope_limit', 0, 'remaining', 0);
  END IF;

  IF v_scope = 'per_month' THEN
    SELECT COALESCE(SUM(credits), 0) INTO v_pack_granted
      FROM public.ai_credit_grants
     WHERE user_id = v_uid AND (expires_at IS NULL OR expires_at > now());
    -- No expiry filter here BY DESIGN: expiry is off (expires_at always NULL).
    -- If pack expiry is ever enabled, a spend against a now-expired grant would
    -- stay counted here while the grant drops out of v_pack_granted above,
    -- pushing pack_balance negative — filter both sides consistently then.
    SELECT COALESCE(SUM(weight), 0) INTO v_pack_used
      FROM public.ai_credit_spends
     WHERE user_id = v_uid AND (meta ->> 'funded_by') = 'pack';
    v_pack_balance := v_pack_granted - v_pack_used;
  END IF;

  IF v_used + v_weight <= v_limit THEN
    v_funded_by := 'allowance';
  ELSIF v_scope = 'per_month' AND v_pack_balance >= v_weight THEN
    v_funded_by := 'pack';
  ELSE
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'denied',
      'reason', 'limit_reached',
      'plan_id', v_plan_id,
      'scope', v_scope,
      'scope_used', v_used,
      'scope_limit', v_limit,
      'remaining', GREATEST(v_limit - v_used, 0),
      'pack_balance', GREATEST(v_pack_balance, 0),
      'period_key', v_period_key
    );
  END IF;

  INSERT INTO public.ai_credit_spends
    (user_id, grow_id, period_key, weight, model_tier, feature, status,
     idempotency_key, result, meta)
  VALUES
    (v_uid,
     p_grow_id,
     v_period_key, v_weight, p_model_tier, p_feature, 'spent',
     p_idempotency_key, p_result,
     jsonb_build_object('plan_id', v_plan_id, 'scope', v_scope, 'staff', v_is_staff,
       'funded_by', v_funded_by))
  RETURNING id INTO v_new_id;

  IF v_funded_by = 'pack' THEN
    v_pack_balance := v_pack_balance - v_weight;
  ELSE
    v_used := v_used + v_weight;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'spent',
    'spend_id', v_new_id,
    'weight', v_weight,
    'plan_id', v_plan_id,
    'scope', v_scope,
    'scope_used', v_used,
    'scope_limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    'funded_by', v_funded_by,
    'pack_balance', GREATEST(v_pack_balance, 0),
    'period_key', v_period_key,
    'model_tier', p_model_tier,
    'feature', p_feature
  );
END;
$function$;

DO $legacy_ai_credit_acl$
BEGIN
  IF to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM service_role';
  END IF;
END;
$legacy_ai_credit_acl$;

-- 20260710013213 and 20260710013235 can replace the final Craft-aware,
-- canonical-subscriptions-only entitlement oracle. Reassert the exact
-- authoritative body and role boundary from 20260725220000.
CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid  uuid := auth.uid();
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = 'live'
      AND (
        (
          s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')
          AND s.current_period_end IS NOT NULL
          AND (
            (s.status IN ('active','trialing') AND s.current_period_end > now())
            OR s.status = 'past_due'
            OR (s.status = 'canceled' AND s.current_period_end > now())
          )
        )
        OR (
          s.price_id = 'founder_lifetime'
          AND left(s.paddle_subscription_id, 9) = 'lifetime_'
          AND s.status = 'active'
          AND s.current_period_end IS NULL
        )
      )
  );
END;
$function$;

-- Reassert the canonical ACL explicitly so the repaired catalog converges even
-- when an earlier restored migration changed or removed these grants.
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO service_role;

-- 20260710013255 points both auth.users triggers back at the superseded
-- verified-email function. Restore the final allowlist trigger target without
-- replaying either historical backfill.
DROP TRIGGER IF EXISTS on_auth_user_created_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_staff_role_for_verified_allowlist();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_staff
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_staff_role_for_verified_allowlist();

-- Trigger invocation does not require API-role EXECUTE. Preserve the final
-- trigger-only boundary even if a historical CREATE OR REPLACE retained a
-- broader ACL on either helper.
REVOKE ALL ON FUNCTION public.grant_staff_role_for_verified_email()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_staff_role_for_verified_allowlist()
  FROM PUBLIC, anon, authenticated, service_role;

-- 20260725033124 can replace the final dual-timestamp wrapper after that
-- wrapper's migration is already ledger-applied. Reassert the exact wrapper
-- from 20260725024026 as CREATE OR REPLACE so incremental apply converges on
-- the same catalog as a clean chronological replay.
CREATE OR REPLACE FUNCTION public.quicklog_save_event(
  p_idempotency_key text,
  p_grow_id uuid,
  p_event_type text,
  p_tent_id uuid DEFAULT NULL,
  p_plant_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_sensor_snapshot jsonb DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_water jsonb DEFAULT NULL,
  p_feed jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_requested_logged_at timestamptz;
  v_logged_at timestamptz;
  v_existing_event_id uuid;
  v_existing_logged_at timestamptz;
  v_existing_request_hash text;
  v_legacy_request_hash text;
  v_raw_details_fingerprint text;
  v_previous_logged_at_context text;
  v_call_details jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_grow_id uuid;
  v_is_reused boolean := false;
  v_is_exact_legacy_retry boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Preserve the delegate's established validation order. An invalid or
  -- missing idempotency key cannot write, so it needs no capture envelope.
  IF p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RETURN public.quicklog_save_event_pre_logged_at(
      p_idempotency_key,
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_sensor_snapshot,
      p_occurred_at,
      p_details,
      p_water,
      p_feed
    );
  END IF;

  -- Serialize the timestamp freeze point for one user + idempotency key.
  -- A concurrent/retried request that omitted logged_at reuses the timestamp
  -- persisted by the winner, so the delegated request hash remains stable.
  IF p_idempotency_key IS NOT NULL
     AND length(p_idempotency_key) BETWEEN 8 AND 200 THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        uid::text || ':' || p_idempotency_key,
        0
      )
    );

    SELECT qi.grow_event_id, ge.logged_at, qi.request_hash
      INTO
        v_existing_event_id,
        v_existing_logged_at,
        v_existing_request_hash
      FROM public.quicklog_idempotency AS qi
      JOIN public.grow_events AS ge
        ON ge.id = qi.grow_event_id
       AND ge.user_id = uid
     WHERE qi.user_id = uid
       AND qi.idempotency_key = p_idempotency_key;
  END IF;

  -- Before this migration, request_hash covered the caller's original details
  -- without an injected logged_at key. Recognize that exact legacy hash before
  -- validating the newly-introduced field: the old request may contain a value
  -- that is malformed or future by today's contract, but only a byte-for-byte
  -- equivalent legacy payload may reuse its original row.
  v_legacy_request_hash :=
    public.quicklog_event_request_hash_pre_logged_at(
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_occurred_at,
      p_sensor_snapshot,
      p_details,
      p_water,
      p_feed
  );
  v_is_exact_legacy_retry :=
    v_existing_event_id IS NOT NULL
    AND v_existing_request_hash IS NOT NULL
    AND v_existing_request_hash = v_legacy_request_hash;

  -- Let the preserved delegate reject invalid raw details itself. Those
  -- values cannot reach a write, and delegation retains the exact
  -- event/water/feed/note-versus-details validation order without copying its
  -- rule table into this wrapper. Exact legacy retries remain exempt because
  -- the matching stored hash proves that the same payload already passed the
  -- pre-migration contract.
  IF NOT v_is_exact_legacy_retry
     AND p_details IS NOT NULL
     AND (
       length(p_details::text) > 20000
       OR p_details::text
            ~ '(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}|sk_(live|test)_[A-Za-z0-9]{12,})'
       OR (
         jsonb_typeof(p_details) = 'object'
         AND EXISTS (
           SELECT 1
           FROM jsonb_object_keys(p_details) AS dk
           WHERE dk IN (
             'user_id',
             'grow_id',
             'tent_id',
             'plant_id',
             'auth_uid',
             'auth.uid'
           )
         )
       )
     ) THEN
    RETURN public.quicklog_save_event_pre_logged_at(
      p_idempotency_key,
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_sensor_snapshot,
      p_occurred_at,
      p_details,
      p_water,
      p_feed
    );
  END IF;

  IF NOT v_is_exact_legacy_retry
     AND p_details IS NOT NULL
     AND jsonb_typeof(p_details) = 'object'
     AND p_details ? 'logged_at' THEN
    IF jsonb_typeof(p_details->'logged_at') <> 'string' THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, status, reason)
      VALUES
        (uid, p_idempotency_key, 'validation_failed', 'invalid_logged_at');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'invalid_logged_at'
      );
    END IF;

    v_requested_logged_at :=
      public.quicklog_try_parse_logged_at(p_details->>'logged_at');
    IF v_requested_logged_at IS NULL
       OR v_requested_logged_at
            > pg_catalog.clock_timestamp() + interval '5 minutes' THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, status, reason)
      VALUES
        (uid, p_idempotency_key, 'validation_failed', 'invalid_logged_at');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'invalid_logged_at'
      );
    END IF;
  END IF;

  v_logged_at := CASE
    WHEN v_existing_event_id IS NOT NULL
         AND v_requested_logged_at IS NULL
      THEN COALESCE(
        v_existing_logged_at,
        pg_catalog.clock_timestamp()
      )
    ELSE COALESCE(
      v_requested_logged_at,
      pg_catalog.clock_timestamp()
    )
  END;

  -- Normalize every valid raw details shape into the same internal envelope.
  -- Hashing the type-tagged raw value keeps null/scalar/array/object identities
  -- distinct and prevents a caller object from impersonating a non-object
  -- marker. The companion diary update reconstructs valid grower object fields
  -- and removes the envelope before persistence becomes visible.
  v_raw_details_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'is_sql_null', p_details IS NULL,
      'json_type', jsonb_typeof(p_details),
      'value', p_details
    )::text
  );
  v_call_details := jsonb_build_object(
    '__verdant_request_details_hash_v1',
    v_raw_details_fingerprint
  ) || jsonb_build_object('logged_at', v_logged_at);

  BEGIN
    IF v_is_exact_legacy_retry THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, status)
      VALUES
        (uid, p_idempotency_key, 'save_started');
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status)
      VALUES
        (
          uid,
          p_idempotency_key,
          v_existing_event_id,
          'duplicate_reused'
        );
      v_result := jsonb_build_object(
        'ok', true,
        'grow_event_id', v_existing_event_id,
        'reused', true
      );
    ELSE
      v_previous_logged_at_context :=
        pg_catalog.current_setting('verdant.quicklog_logged_at', true);
      PERFORM pg_catalog.set_config(
        'verdant.quicklog_logged_at',
        jsonb_build_object('logged_at', v_logged_at)->>'logged_at',
        true
      );
      v_result := public.quicklog_save_event_pre_logged_at(
        p_idempotency_key,
        p_grow_id,
        p_event_type,
        p_tent_id,
        p_plant_id,
        p_note,
        p_photo_url,
        p_sensor_snapshot,
        p_occurred_at,
        v_call_details,
        p_water,
        p_feed
      );
      PERFORM pg_catalog.set_config(
        'verdant.quicklog_logged_at',
        COALESCE(v_previous_logged_at_context, ''),
        true
      );
    END IF;

    IF COALESCE(v_result->>'ok', 'false') <> 'true' THEN
      RETURN v_result;
    END IF;
    v_is_reused := COALESCE(v_result->>'reused', 'false') = 'true';

    v_event_id :=
      public.quicklog_try_parse_uuid(v_result->>'grow_event_id');
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_invalid_result';
    END IF;

    SELECT ge.grow_id
      INTO v_grow_id
      FROM public.grow_events AS ge
     WHERE ge.id = v_event_id
       AND ge.user_id = uid
       AND ge.logged_at IS NOT DISTINCT FROM v_logged_at;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_event_missing';
    END IF;

    UPDATE public.diary_entries AS de
       SET logged_at = v_logged_at,
           details = (
             CASE
               WHEN v_is_exact_legacy_retry
                 THEN COALESCE(de.details, '{}'::jsonb) - 'logged_at'
               ELSE (
                 CASE
                   WHEN p_details IS NOT NULL
                        AND jsonb_typeof(p_details) = 'object'
                     THEN p_details
                   ELSE '{}'::jsonb
                 END
               ) || (
                 COALESCE(de.details, '{}'::jsonb)
                   - 'logged_at'
                   - '__verdant_request_details_hash_v1'
               )
             END
           ) || jsonb_build_object('logged_at', v_logged_at)
     WHERE de.user_id = uid
       AND de.grow_id = v_grow_id
       AND (
         public.quicklog_try_parse_uuid(
           de.details->>'linked_grow_event_id'
         ) = v_event_id
         OR public.quicklog_try_parse_uuid(
           de.details->>'grow_event_id'
          ) = v_event_id
       )
       AND (
         NOT v_is_reused
         OR de.logged_at IS DISTINCT FROM v_logged_at
         OR public.quicklog_try_parse_logged_at(
              de.details->>'logged_at'
            ) IS DISTINCT FROM v_logged_at
       );
    IF NOT v_is_reused
       AND NOT EXISTS (
      SELECT 1
      FROM public.diary_entries AS de
      WHERE de.user_id = uid
        AND de.grow_id = v_grow_id
        AND (
          public.quicklog_try_parse_uuid(
            de.details->>'linked_grow_event_id'
          ) = v_event_id
          OR public.quicklog_try_parse_uuid(
            de.details->>'grow_event_id'
          ) = v_event_id
        )
        AND de.logged_at IS NOT DISTINCT FROM v_logged_at
        AND public.quicklog_try_parse_logged_at(
              de.details->>'logged_at'
            ) IS NOT DISTINCT FROM v_logged_at
        AND (
          v_is_exact_legacy_retry
          OR (
            p_details IS NOT NULL
            AND jsonb_typeof(p_details) = 'object'
            AND p_details ? '__verdant_request_details_hash_v1'
            AND de.details->'__verdant_request_details_hash_v1'
                  IS NOT DISTINCT FROM
                p_details->'__verdant_request_details_hash_v1'
          )
          OR (
            (
              p_details IS NULL
              OR jsonb_typeof(p_details) <> 'object'
              OR NOT (
                p_details ? '__verdant_request_details_hash_v1'
              )
            )
            AND NOT (
              de.details ? '__verdant_request_details_hash_v1'
            )
          )
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_mirror_missing';
    END IF;

    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events
      (user_id, idempotency_key, status, reason)
    VALUES
      (
        uid,
        p_idempotency_key,
        'save_failed',
        'dual_timestamp_persist_failed'
      );
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) IS
  'Authenticated Quick Log event writer. Persists canonical Captured logged_at separately from occurred_at and preserves atomic per-user idempotency.';

NOTIFY pgrst, 'reload schema';
