-- Atomic Action Queue create + audit event (#586).
--
-- Problem: client writers inserted action_queue then action_queue_events in
-- two round-trips. A successful row insert + failed audit left orphan queue
-- items without a 'created' event. Dedupe was client-only (race across tabs).
--
-- This expand migration:
--   1. Adds nullable dedupe_key for stable server-side idempotency.
--   2. Partial UNIQUE on (user_id, dedupe_key) for non-terminal statuses.
--   3. SECURITY DEFINER RPC action_queue_create that inserts the row and
--      the 'created' audit event in one transaction (or reuses an existing
--      non-terminal match).
--
-- Safety:
--   * user_id always auth.uid() — never accepted from the client.
--   * target_device forced NULL (no device-control surface).
--   * status forced to pending_approval (approval-required only).
--   * grow / tent / plant ownership re-checked server-side.
--   * No equipment actuation. Never marks items approved without the grower.
--
-- Legacy direct INSERT paths remain functional (expand step). New grower
-- handoffs (Alert Detail, AI Doctor) should prefer this RPC.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Dedupe key column
-- ---------------------------------------------------------------------------

ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text;

COMMENT ON COLUMN public.action_queue.dedupe_key IS
  'Optional stable idempotency key for non-terminal rows (e.g. env_alert:<uuid>, ai_doctor_session:<uuid>). NULL = no server-side unique dedupe.';

-- ---------------------------------------------------------------------------
-- 2. Partial unique index — only blocks concurrent non-terminal duplicates
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS action_queue_user_dedupe_key_nonterminal_uidx
  ON public.action_queue (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN (
      'pending_approval',
      'pending',
      'suggested',
      'approved',
      'simulated',
      'in_progress',
      'queued'
    );

-- ---------------------------------------------------------------------------
-- 3. Atomic create RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.action_queue_create(
  p_grow_id uuid,
  p_action_type text,
  p_suggested_change text,
  p_reason text,
  p_risk_level text DEFAULT 'low',
  p_source text DEFAULT 'environment_alert',
  p_target_metric text DEFAULT NULL,
  p_tent_id uuid DEFAULT NULL,
  p_plant_id uuid DEFAULT NULL,
  p_originating_timeline_events jsonb DEFAULT '[]'::jsonb,
  p_audit_note text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action public.action_queue%ROWTYPE;
  v_event_id uuid;
  v_created_at timestamptz;
  v_dedupe text := NULLIF(btrim(COALESCE(p_dedupe_key, '')), '');
  v_note text := NULLIF(btrim(COALESCE(p_audit_note, '')), '');
  v_source text := lower(btrim(COALESCE(p_source, '')));
  v_action_type text := lower(btrim(COALESCE(p_action_type, '')));
  v_risk text := lower(btrim(COALESCE(p_risk_level, 'low')));
  v_suggested text := btrim(COALESCE(p_suggested_change, ''));
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_metric text := NULLIF(btrim(COALESCE(p_target_metric, '')), '');
  v_events jsonb := COALESCE(p_originating_timeline_events, '[]'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_grow_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_grow_id');
  END IF;

  IF v_suggested = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_suggested_change');
  END IF;

  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_reason');
  END IF;

  IF v_action_type = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_action_type');
  END IF;

  -- Allowed sources for this RPC. Other product surfaces may still insert
  -- directly until they migrate; expand step does not revoke INSERT.
  IF v_source NOT IN (
    'environment_alert',
    'ai_doctor',
    'manual',
    'grower'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_source');
  END IF;

  IF v_risk NOT IN ('low', 'medium', 'high', 'critical') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_risk_level');
  END IF;

  IF jsonb_typeof(v_events) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_timeline_events');
  END IF;

  -- Grow ownership (never trust client user_id).
  IF NOT EXISTS (
    SELECT 1
      FROM public.grows AS g
     WHERE g.id = p_grow_id
       AND g.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_found');
  END IF;

  -- Optional tent ownership + grow binding.
  IF p_tent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.tents AS t
       WHERE t.id = p_tent_id
         AND t.user_id = v_uid
         AND t.grow_id = p_grow_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_in_grow');
    END IF;
  END IF;

  -- Optional plant ownership + grow binding (+ tent when both set).
  IF p_plant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.plants AS p
       WHERE p.id = p_plant_id
         AND p.user_id = v_uid
         AND p.grow_id = p_grow_id
         AND (
           p_tent_id IS NULL
           OR p.tent_id IS NULL
           OR p.tent_id = p_tent_id
         )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
    END IF;
  END IF;

  -- Idempotent reuse of an existing non-terminal row for the same dedupe key.
  IF v_dedupe IS NOT NULL THEN
    SELECT aq.*
      INTO v_action
      FROM public.action_queue AS aq
     WHERE aq.user_id = v_uid
       AND aq.dedupe_key = v_dedupe
       AND aq.status IN (
         'pending_approval',
         'pending',
         'suggested',
         'approved',
         'simulated',
         'in_progress',
         'queued'
       )
     ORDER BY aq.created_at DESC, aq.id DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      -- Ensure a 'created' audit event exists (heals legacy orphans).
      SELECT aqe.id
        INTO v_event_id
        FROM public.action_queue_events AS aqe
       WHERE aqe.action_queue_id = v_action.id
         AND aqe.user_id = v_uid
         AND aqe.event_type = 'created'
       ORDER BY aqe.created_at ASC, aqe.id ASC
       LIMIT 1;

      IF v_event_id IS NULL THEN
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
          'created',
          NULL,
          'pending_approval',
          COALESCE(v_note, 'Healed missing created audit event'),
          clock_timestamp()
        )
        RETURNING id INTO v_event_id;
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'action_queue_id', v_action.id,
        'grow_id', v_action.grow_id,
        'status', v_action.status,
        'event_id', v_event_id,
        'reused', true
      );
    END IF;
  END IF;

  v_created_at := clock_timestamp();

  INSERT INTO public.action_queue (
    user_id,
    grow_id,
    tent_id,
    plant_id,
    action_type,
    target_metric,
    target_device,
    suggested_change,
    reason,
    risk_level,
    source,
    status,
    originating_timeline_events,
    dedupe_key,
    created_at,
    updated_at
  )
  VALUES (
    v_uid,
    p_grow_id,
    p_tent_id,
    p_plant_id,
    v_action_type,
    v_metric,
    NULL, -- never accept device control surface
    v_suggested,
    v_reason,
    v_risk,
    v_source,
    'pending_approval',
    v_events,
    v_dedupe,
    v_created_at,
    v_created_at
  )
  RETURNING * INTO v_action;

  -- Deliberately do not catch this INSERT. Any failure rolls back the row.
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
    'created',
    NULL,
    'pending_approval',
    v_note,
    v_created_at
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_queue_id', v_action.id,
    'grow_id', v_action.grow_id,
    'status', v_action.status,
    'event_id', v_event_id,
    'reused', false,
    'created_at', v_created_at
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent insert with the same dedupe_key: re-select and reuse.
    IF v_dedupe IS NULL THEN
      RAISE;
    END IF;

    SELECT aq.*
      INTO v_action
      FROM public.action_queue AS aq
     WHERE aq.user_id = v_uid
       AND aq.dedupe_key = v_dedupe
       AND aq.status IN (
         'pending_approval',
         'pending',
         'suggested',
         'approved',
         'simulated',
         'in_progress',
         'queued'
       )
     ORDER BY aq.created_at DESC, aq.id DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'dedupe_conflict');
    END IF;

    SELECT aqe.id
      INTO v_event_id
      FROM public.action_queue_events AS aqe
     WHERE aqe.action_queue_id = v_action.id
       AND aqe.user_id = v_uid
       AND aqe.event_type = 'created'
     ORDER BY aqe.created_at ASC, aqe.id ASC
     LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'action_queue_id', v_action.id,
      'grow_id', v_action.grow_id,
      'status', v_action.status,
      'event_id', v_event_id,
      'reused', true
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.action_queue_create(
  uuid, text, text, text, text, text, text, uuid, uuid, jsonb, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.action_queue_create(
  uuid, text, text, text, text, text, text, uuid, uuid, jsonb, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.action_queue_create(
  uuid, text, text, text, text, text, text, uuid, uuid, jsonb, text, text
) TO authenticated;

COMMENT ON FUNCTION public.action_queue_create(
  uuid, text, text, text, text, text, text, uuid, uuid, jsonb, text, text
) IS
  'Atomically creates an approval-required Action Queue row and its created audit event; optional dedupe_key for non-terminal idempotency. Never accepts target_device or client user_id.';

COMMIT;

NOTIFY pgrst, 'reload schema';
