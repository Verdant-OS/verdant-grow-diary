-- Quick Log Corrections & Retractions v1 (issue #786)
--
-- Append-only integrity layer for Quick Log entries:
--   * public.quicklog_entry_revisions — immutable ledger of corrections and
--     retractions. No client write policies; the two SECURITY DEFINER RPCs
--     below are the only writers (same posture as diary_entry_audit_log).
--   * diary_entries.retracted_at — nullable marker so operational readers
--     (including head:true exact counts) can exclude retracted mirror rows
--     at the query level. Legacy rows keep NULL and behave exactly as before.
--   * grow_events retraction reuses the existing is_deleted/deleted_at
--     tombstone convention that nearly every spine reader already filters.
--
-- Never hard-deletes. Never overwrites the original payload silently: every
-- correction stores the prior field values in the ledger row, and the
-- pre-existing diary_entries audit triggers capture the same change again.

-- ---------------------------------------------------------------------------
-- Revision ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.quicklog_entry_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grow_event_id UUID REFERENCES public.grow_events(id) ON DELETE SET NULL,
  diary_entry_id UUID REFERENCES public.diary_entries(id) ON DELETE SET NULL,
  -- Stable root identity for ordering, kept even if the FK targets vanish.
  root_id UUID NOT NULL,
  user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('correction', 'retraction')),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'wrong_plant', 'wrong_tent', 'wrong_time', 'typo', 'wrong_value',
    'duplicate', 'test_entry', 'accidental', 'other'
  )),
  reason_note TEXT CHECK (reason_note IS NULL OR char_length(reason_note) <= 500),
  previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No "at least one FK set" CHECK: the FKs are ON DELETE SET NULL, so the
  -- pre-existing hard-delete path for diary rows must be able to null
  -- diary_entry_id on a diary-only revision without violating a constraint.
  -- root_id (NOT NULL) carries provenance; the RPCs always set at least one
  -- FK at insert time.
);

-- Deterministic ordering per root; also the concurrency backstop under the
-- row lock taken by the RPCs.
CREATE UNIQUE INDEX quicklog_entry_revisions_root_rev
  ON public.quicklog_entry_revisions (root_id, revision_no);

-- At most one retraction per root.
CREATE UNIQUE INDEX quicklog_entry_revisions_single_retraction
  ON public.quicklog_entry_revisions (root_id)
  WHERE kind = 'retraction';

CREATE INDEX quicklog_entry_revisions_user
  ON public.quicklog_entry_revisions (user_id, created_at DESC);

ALTER TABLE public.quicklog_entry_revisions ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner. No INSERT/UPDATE/DELETE policies: the RPCs below
-- (SECURITY DEFINER) are the only writers. Client roles cannot mutate or
-- remove ledger rows.
CREATE POLICY "Users view own quicklog revisions"
  ON public.quicklog_entry_revisions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Operators view all quicklog revisions"
  ON public.quicklog_entry_revisions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::app_role));

REVOKE ALL ON public.quicklog_entry_revisions FROM PUBLIC;
REVOKE ALL ON public.quicklog_entry_revisions FROM anon;
GRANT SELECT ON public.quicklog_entry_revisions TO authenticated;
GRANT ALL ON public.quicklog_entry_revisions TO service_role;

-- ---------------------------------------------------------------------------
-- Retraction marker on the diary mirror rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.diary_entries
  ADD COLUMN retracted_at TIMESTAMPTZ;

-- Cheap lookup for the owner-facing "retracted entries" audit disclosure.
CREATE INDEX diary_entries_retracted
  ON public.diary_entries (user_id, retracted_at DESC)
  WHERE retracted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Shared helpers (internal; EXECUTE revoked from client roles)
-- ---------------------------------------------------------------------------

-- Resolve a Quick Log root for the calling owner and lock it.
-- Returns (root kind, spine row id or diary row id). A diary handle that
-- carries a linked spine id is canonicalized onto the spine.
CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root(
  uid UUID,
  p_grow_event_id UUID,
  p_diary_entry_id UUID,
  OUT out_reason TEXT,
  OUT out_grow_event_id UUID,
  OUT out_diary_entry_id UUID
)
RETURNS record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_spine public.grow_events%ROWTYPE;
  v_diary public.diary_entries%ROWTYPE;
  v_linked UUID;
  v_from_diary BOOLEAN := false;
BEGIN
  out_reason := NULL;
  out_grow_event_id := NULL;
  out_diary_entry_id := NULL;

  IF p_grow_event_id IS NULL AND p_diary_entry_id IS NULL THEN
    out_reason := 'missing_root';
    RETURN;
  END IF;

  IF p_grow_event_id IS NULL AND p_diary_entry_id IS NOT NULL THEN
    SELECT * INTO v_diary
      FROM public.diary_entries d
     WHERE d.id = p_diary_entry_id AND d.user_id = uid
     FOR UPDATE;
    IF v_diary.id IS NULL THEN
      out_reason := 'not_found_or_not_owned';
      RETURN;
    END IF;
    -- Canonicalize onto the spine when the mirror row links one
    -- (modern key first, legacy alias tolerated; malformed values are
    -- treated as no link rather than raised).
    v_linked := COALESCE(
      public.quicklog_try_parse_uuid(v_diary.details ->> 'linked_grow_event_id'),
      public.quicklog_try_parse_uuid(v_diary.details ->> 'grow_event_id')
    );
    IF v_linked IS NOT NULL THEN
      p_grow_event_id := v_linked;
      v_from_diary := true;
    ELSE
      -- Diary-only Quick Log rows (photo attachments, pheno evidence
      -- receipts, legacy v1 rows). Anything else keeps its existing
      -- Edit / Remove path and is not retractable here.
      IF NOT (
        v_diary.details ? 'quick_log_version'
        OR v_diary.details ->> 'event_type' = 'quicklog_photo_attachment'
        OR v_diary.details ->> 'kind' = 'pheno_evidence_receipt'
      ) THEN
        out_reason := 'not_quicklog';
        RETURN;
      END IF;
      out_diary_entry_id := v_diary.id;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_spine
    FROM public.grow_events e
   WHERE e.id = p_grow_event_id AND e.user_id = uid
   FOR UPDATE;
  IF v_spine.id IS NULL THEN
    -- A mirror row can outlive its spine row (legacy hard deletes). Fall
    -- back to treating the locked diary row itself as the root.
    IF v_from_diary THEN
      out_diary_entry_id := v_diary.id;
      RETURN;
    END IF;
    out_reason := 'not_found_or_not_owned';
    RETURN;
  END IF;
  IF v_spine.source IS DISTINCT FROM 'manual' THEN
    out_reason := 'not_quicklog';
    RETURN;
  END IF;
  out_grow_event_id := v_spine.id;
END;
$$;

REVOKE ALL ON FUNCTION public.quicklog_revision_resolve_root(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- Environment companion rows are written in the same transaction as the
-- parent spine row, so their created_at is exactly equal (now() is
-- transaction-stable). That equality is the deterministic sibling key; it
-- survives later corrections because created_at never changes.
CREATE OR REPLACE FUNCTION public.quicklog_revision_sibling_env_ids(
  uid UUID,
  p_parent public.grow_events
)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[])
    FROM public.grow_events e
   WHERE e.user_id = uid
     AND e.id <> p_parent.id
     AND e.event_type = 'environment'
     AND e.source = 'manual'
     AND e.created_at = p_parent.created_at;
$$;

REVOKE ALL ON FUNCTION public.quicklog_revision_sibling_env_ids(UUID, public.grow_events)
  FROM PUBLIC, anon, authenticated;

-- Time corrections must keep timestamp-bearing evidence envelopes coherent:
-- the Quick Log writers stamp details.sensor_snapshot.captured_at (and the
-- pheno receipt's details.sensor.captured_at) from the event time, and the
-- snapshot readers prefer that embedded value over entry_at. Rebase an
-- embedded captured_at to the corrected time ONLY when it exactly equals the
-- previous event time (i.e. it was derived); a genuinely distinct capture
-- time is real provenance and stays untouched.
CREATE OR REPLACE FUNCTION public.quicklog_revision_rebase_captured_at(
  p_details JSONB,
  p_old TIMESTAMPTZ,
  p_new TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_details JSONB := p_details;
  v_path TEXT[];
  v_raw TEXT;
  v_parsed TIMESTAMPTZ;
BEGIN
  IF v_details IS NULL OR jsonb_typeof(v_details) <> 'object'
     OR p_old IS NULL OR p_new IS NULL THEN
    RETURN p_details;
  END IF;
  FOREACH v_path SLICE 1 IN ARRAY ARRAY[
    ARRAY['sensor_snapshot', 'captured_at'],
    ARRAY['sensor', 'captured_at']
  ] LOOP
    v_raw := v_details #>> v_path;
    IF v_raw IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      v_parsed := v_raw::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF v_parsed = p_old THEN
      v_details := jsonb_set(v_details, v_path, to_jsonb(p_new), false);
    END IF;
  END LOOP;
  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.quicklog_revision_rebase_captured_at(JSONB, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retraction RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quicklog_retract_entry(
  p_reason_code TEXT,
  p_grow_event_id UUID DEFAULT NULL,
  p_diary_entry_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid UUID := auth.uid();
  v_root record;
  v_spine public.grow_events%ROWTYPE;
  v_root_id UUID;
  v_rev_no INTEGER;
  v_rev_id UUID;
  v_now TIMESTAMPTZ := now();
  v_env_ids UUID[] := '{}'::uuid[];
  v_diary_ids UUID[] := '{}'::uuid[];
  v_prev JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'wrong_plant', 'wrong_tent', 'wrong_time', 'typo', 'wrong_value',
    'duplicate', 'test_entry', 'accidental', 'other'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  END IF;

  IF p_reason_note IS NOT NULL AND char_length(p_reason_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_note');
  END IF;

  v_root := public.quicklog_revision_resolve_root(uid, p_grow_event_id, p_diary_entry_id);
  IF v_root.out_reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_root.out_reason);
  END IF;
  v_root_id := COALESCE(v_root.out_grow_event_id, v_root.out_diary_entry_id);

  IF EXISTS (
    SELECT 1 FROM public.quicklog_entry_revisions r
     WHERE r.root_id = v_root_id AND r.kind = 'retraction'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
  END IF;

  IF v_root.out_grow_event_id IS NOT NULL THEN
    SELECT * INTO v_spine FROM public.grow_events WHERE id = v_root.out_grow_event_id;
    IF v_spine.is_deleted THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;

    v_env_ids := public.quicklog_revision_sibling_env_ids(uid, v_spine);

    SELECT COALESCE(array_agg(d.id), '{}'::uuid[]) INTO v_diary_ids
      FROM public.diary_entries d
     WHERE d.user_id = uid
       AND d.retracted_at IS NULL
       AND (
         -- Parse-then-compare so legacy mirrors with non-canonical UUID text
         -- (e.g. uppercase) still match, exactly like the resolver does.
         public.quicklog_try_parse_uuid(d.details ->> 'linked_grow_event_id') = v_spine.id
         OR public.quicklog_try_parse_uuid(d.details ->> 'grow_event_id') = v_spine.id
       );

    v_prev := jsonb_build_object(
      'grow_event', jsonb_build_object(
        'id', v_spine.id,
        'event_type', v_spine.event_type,
        'note', v_spine.note,
        'occurred_at', v_spine.occurred_at,
        'grow_id', v_spine.grow_id,
        'tent_id', v_spine.tent_id,
        'plant_id', v_spine.plant_id
      ),
      'environment_event_ids', to_jsonb(v_env_ids),
      'diary_entry_ids', to_jsonb(v_diary_ids)
    );
  ELSE
    SELECT jsonb_build_object(
      'diary_entry', jsonb_build_object(
        'id', d.id,
        'note', d.note,
        'entry_at', d.entry_at,
        'grow_id', d.grow_id,
        'tent_id', d.tent_id,
        'plant_id', d.plant_id,
        'details', d.details
      )
    ) INTO v_prev
      FROM public.diary_entries d
     WHERE d.id = v_root.out_diary_entry_id;

    IF EXISTS (
      SELECT 1 FROM public.diary_entries d
       WHERE d.id = v_root.out_diary_entry_id AND d.retracted_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;
    v_diary_ids := ARRAY[v_root.out_diary_entry_id];
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1 INTO v_rev_no
    FROM public.quicklog_entry_revisions r
   WHERE r.root_id = v_root_id;

  INSERT INTO public.quicklog_entry_revisions
    (grow_event_id, diary_entry_id, root_id, user_id, actor_id,
     revision_no, kind, reason_code, reason_note, previous_state, new_state)
  VALUES
    (v_root.out_grow_event_id,
     CASE WHEN v_root.out_diary_entry_id IS NOT NULL THEN v_root.out_diary_entry_id
          WHEN array_length(v_diary_ids, 1) = 1 THEN v_diary_ids[1]
          ELSE NULL END,
     v_root_id, uid, uid, v_rev_no, 'retraction',
     p_reason_code, NULLIF(p_reason_note, ''), COALESCE(v_prev, '{}'::jsonb), NULL)
  RETURNING id INTO v_rev_id;

  IF v_root.out_grow_event_id IS NOT NULL THEN
    UPDATE public.grow_events
       SET is_deleted = true, deleted_at = v_now
     WHERE id = v_root.out_grow_event_id AND user_id = uid;

    IF array_length(v_env_ids, 1) IS NOT NULL THEN
      UPDATE public.grow_events
         SET is_deleted = true, deleted_at = v_now
       WHERE id = ANY (v_env_ids) AND user_id = uid AND is_deleted = false;
    END IF;
  END IF;

  IF array_length(v_diary_ids, 1) IS NOT NULL THEN
    UPDATE public.diary_entries
       SET retracted_at = v_now
     WHERE id = ANY (v_diary_ids) AND user_id = uid AND retracted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_rev_id,
    'revision_no', v_rev_no,
    'grow_event_id', v_root.out_grow_event_id,
    'diary_entry_ids', to_jsonb(v_diary_ids),
    'environment_event_ids', to_jsonb(v_env_ids)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Correction RPC
-- ---------------------------------------------------------------------------

-- p_changes keys (all optional, at least one required):
--   note        text — replacement note ('' clears the spine note; mirror
--                keeps the '(quick log)' placeholder convention)
--   occurred_at timestamptz text — new event time (logged_at is untouched)
--   target_type 'plant' | 'tent' — with target_id, re-targets the entry;
--                ownership and grow coherence re-resolved server-side exactly
--                like quicklog_save_manual does on save.
--   target_id   uuid
CREATE OR REPLACE FUNCTION public.quicklog_correct_entry(
  p_reason_code TEXT,
  p_changes JSONB,
  p_grow_event_id UUID DEFAULT NULL,
  p_diary_entry_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid UUID := auth.uid();
  v_root record;
  v_spine public.grow_events%ROWTYPE;
  v_diary public.diary_entries%ROWTYPE;
  v_root_id UUID;
  v_rev_no INTEGER;
  v_rev_id UUID;
  v_key TEXT;
  v_has_note BOOLEAN := false;
  v_has_time BOOLEAN := false;
  v_has_target BOOLEAN := false;
  v_note TEXT;
  v_time TIMESTAMPTZ;
  v_target_type TEXT;
  v_target_id UUID;
  v_new_grow UUID;
  v_new_tent UUID;
  v_new_plant UUID;
  v_env_ids UUID[] := '{}'::uuid[];
  v_diary_ids UUID[] := '{}'::uuid[];
  v_prev JSONB;
  v_new JSONB := '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'wrong_plant', 'wrong_tent', 'wrong_time', 'typo', 'wrong_value',
    'duplicate', 'test_entry', 'accidental', 'other'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  END IF;

  IF p_reason_note IS NOT NULL AND char_length(p_reason_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_note');
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_changes');
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key NOT IN ('note', 'occurred_at', 'target_type', 'target_id') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_change');
    END IF;
  END LOOP;

  IF p_changes ? 'note' THEN
    IF jsonb_typeof(p_changes -> 'note') NOT IN ('string', 'null') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_note := true;
    v_note := p_changes ->> 'note';
    IF v_note IS NOT NULL AND char_length(v_note) > 4000 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
  END IF;

  IF p_changes ? 'occurred_at' THEN
    BEGIN
      v_time := (p_changes ->> 'occurred_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    IF v_time IS NULL OR v_time > now() + interval '5 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_time := true;
  END IF;

  IF (p_changes ? 'target_type') <> (p_changes ? 'target_id') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
  END IF;

  IF p_changes ? 'target_type' THEN
    v_target_type := p_changes ->> 'target_type';
    IF v_target_type NOT IN ('plant', 'tent') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    BEGIN
      v_target_id := (p_changes ->> 'target_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    v_has_target := true;
  END IF;

  IF NOT (v_has_note OR v_has_time OR v_has_target) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_changes');
  END IF;

  v_root := public.quicklog_revision_resolve_root(uid, p_grow_event_id, p_diary_entry_id);
  IF v_root.out_reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_root.out_reason);
  END IF;
  v_root_id := COALESCE(v_root.out_grow_event_id, v_root.out_diary_entry_id);

  IF EXISTS (
    SELECT 1 FROM public.quicklog_entry_revisions r
     WHERE r.root_id = v_root_id AND r.kind = 'retraction'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
  END IF;

  -- Resolve and validate the new target with the same ownership + coherence
  -- rules quicklog_save_manual applies on save.
  IF v_has_target THEN
    IF v_target_type = 'plant' THEN
      SELECT p.tent_id, p.grow_id, p.id
        INTO v_new_tent, v_new_grow, v_new_plant
        FROM public.plants p
       WHERE p.id = v_target_id AND p.user_id = uid;
    ELSE
      SELECT t.id, t.grow_id
        INTO v_new_tent, v_new_grow
        FROM public.tents t
       WHERE t.id = v_target_id AND t.user_id = uid;
      v_new_plant := NULL;
    END IF;
    IF v_new_grow IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.grows g WHERE g.id = v_new_grow AND g.user_id = uid
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
    END IF;
  END IF;

  IF v_root.out_grow_event_id IS NOT NULL THEN
    SELECT * INTO v_spine FROM public.grow_events WHERE id = v_root.out_grow_event_id;
    IF v_spine.is_deleted THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;

    v_env_ids := public.quicklog_revision_sibling_env_ids(uid, v_spine);

    SELECT COALESCE(array_agg(d.id), '{}'::uuid[]) INTO v_diary_ids
      FROM public.diary_entries d
     WHERE d.user_id = uid
       AND (
         -- Parse-then-compare so legacy mirrors with non-canonical UUID text
         -- (e.g. uppercase) still match, exactly like the resolver does.
         public.quicklog_try_parse_uuid(d.details ->> 'linked_grow_event_id') = v_spine.id
         OR public.quicklog_try_parse_uuid(d.details ->> 'grow_event_id') = v_spine.id
       );

    v_prev := jsonb_build_object(
      'note', v_spine.note,
      'occurred_at', v_spine.occurred_at,
      'grow_id', v_spine.grow_id,
      'tent_id', v_spine.tent_id,
      'plant_id', v_spine.plant_id
    );

    IF v_has_note THEN
      v_new := v_new || jsonb_build_object('note', v_note);
    END IF;
    IF v_has_time THEN
      v_new := v_new || jsonb_build_object('occurred_at', v_time);
    END IF;
    IF v_has_target THEN
      v_new := v_new || jsonb_build_object(
        'grow_id', v_new_grow, 'tent_id', v_new_tent, 'plant_id', v_new_plant
      );
    END IF;

    UPDATE public.grow_events
       SET note = CASE WHEN v_has_note THEN NULLIF(v_note, '') ELSE note END,
           occurred_at = CASE WHEN v_has_time THEN v_time ELSE occurred_at END,
           grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
           tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
           plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
     WHERE id = v_spine.id AND user_id = uid;

    -- Keep environment companions coherent for time/target moves.
    IF (v_has_time OR v_has_target) AND array_length(v_env_ids, 1) IS NOT NULL THEN
      UPDATE public.grow_events
         SET occurred_at = CASE WHEN v_has_time THEN v_time ELSE occurred_at END,
             grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
             tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
             plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
       WHERE id = ANY (v_env_ids) AND user_id = uid;
    END IF;

    IF array_length(v_diary_ids, 1) IS NOT NULL THEN
      UPDATE public.diary_entries
         SET note = CASE WHEN v_has_note THEN COALESCE(NULLIF(v_note, ''), '(quick log)') ELSE note END,
             entry_at = CASE WHEN v_has_time THEN v_time ELSE entry_at END,
             details = CASE WHEN v_has_time
               THEN public.quicklog_revision_rebase_captured_at(details, entry_at, v_time)
               ELSE details END,
             grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
             tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
             plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
       WHERE id = ANY (v_diary_ids) AND user_id = uid;
    END IF;
  ELSE
    SELECT * INTO v_diary FROM public.diary_entries WHERE id = v_root.out_diary_entry_id;
    IF v_diary.retracted_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;

    -- Pheno evidence receipts pin plant identity into the receipt contract;
    -- re-targeting one would silently re-attribute evidence. Correcting a
    -- receipt is limited to note/time; wrong-plant receipts are retracted.
    IF v_has_target AND v_diary.details ->> 'kind' = 'pheno_evidence_receipt' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_change');
    END IF;

    v_prev := jsonb_build_object(
      'note', v_diary.note,
      'entry_at', v_diary.entry_at,
      'grow_id', v_diary.grow_id,
      'tent_id', v_diary.tent_id,
      'plant_id', v_diary.plant_id
    );

    IF v_has_note THEN
      v_new := v_new || jsonb_build_object('note', v_note);
    END IF;
    IF v_has_time THEN
      v_new := v_new || jsonb_build_object('entry_at', v_time);
    END IF;
    IF v_has_target THEN
      v_new := v_new || jsonb_build_object(
        'grow_id', v_new_grow, 'tent_id', v_new_tent, 'plant_id', v_new_plant
      );
    END IF;

    UPDATE public.diary_entries
       SET note = CASE WHEN v_has_note THEN COALESCE(NULLIF(v_note, ''), '(quick log)') ELSE note END,
           entry_at = CASE WHEN v_has_time THEN v_time ELSE entry_at END,
           details = CASE WHEN v_has_time
             THEN public.quicklog_revision_rebase_captured_at(details, entry_at, v_time)
             ELSE details END,
           grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
           tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
           plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
     WHERE id = v_diary.id AND user_id = uid;

    v_diary_ids := ARRAY[v_diary.id];
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1 INTO v_rev_no
    FROM public.quicklog_entry_revisions r
   WHERE r.root_id = v_root_id;

  INSERT INTO public.quicklog_entry_revisions
    (grow_event_id, diary_entry_id, root_id, user_id, actor_id,
     revision_no, kind, reason_code, reason_note, previous_state, new_state)
  VALUES
    (v_root.out_grow_event_id,
     CASE WHEN v_root.out_diary_entry_id IS NOT NULL THEN v_root.out_diary_entry_id
          WHEN array_length(v_diary_ids, 1) = 1 THEN v_diary_ids[1]
          ELSE NULL END,
     v_root_id, uid, uid, v_rev_no, 'correction',
     p_reason_code, NULLIF(p_reason_note, ''), COALESCE(v_prev, '{}'::jsonb), v_new)
  RETURNING id INTO v_rev_id;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_rev_id,
    'revision_no', v_rev_no,
    'grow_event_id', v_root.out_grow_event_id,
    'diary_entry_ids', to_jsonb(v_diary_ids)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated-only EXECUTE, matching the quicklog_save_* posture.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.quicklog_retract_entry(TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quicklog_retract_entry(TEXT, UUID, UUID, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.quicklog_correct_entry(TEXT, JSONB, UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quicklog_correct_entry(TEXT, JSONB, UUID, UUID, TEXT)
  TO authenticated, service_role;
