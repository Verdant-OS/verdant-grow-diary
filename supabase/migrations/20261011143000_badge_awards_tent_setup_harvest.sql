-- Cut 001 unlock-1: First Tent, Setup Documented, First Recorded Harvest.
-- Adds nullable photo_url on tents and harvests. No backfill. Owner RLS
-- policies are unchanged. Does not edit the First Diary Entry migration.
-- badge_award_runtime.enabled stays false. Evidence SELECT stays owner-only.
-- Does not call award_nugs, does not read yield_grams, and does not join
-- photos by time.

ALTER TABLE public.tents
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.harvests
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.tents.photo_url IS
  'Optional owner-scoped diary-photos reference. Null saves the tent and earns no badge.';

COMMENT ON COLUMN public.harvests.photo_url IS
  'Optional owner-scoped diary-photos reference. Null saves the harvest and earns no badge. Yield is not a badge input.';

ALTER TABLE public.badge_evidence
  ADD COLUMN IF NOT EXISTS harvest_id uuid;

ALTER TABLE public.badge_awards DROP CONSTRAINT IF EXISTS badge_awards_badge_key_check;
ALTER TABLE public.badge_awards
  ADD CONSTRAINT badge_awards_badge_key_check
  CHECK (
    badge_key IN (
      'first_diary_entry',
      'first_tent',
      'setup_documented',
      'first_recorded_harvest'
    )
  );

-- Qualifies first_tent, setup_documented, and first_recorded_harvest.
-- Called only from badge_awards_evaluate_owner after the kill switch,
-- auth.uid() and anonymous-session checks. Not granted to client roles.
CREATE OR REPLACE FUNCTION public.badge_awards_evaluate_photo_subject(
  badge_key text,
  uid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  subject_kind text;
  subject_id uuid;
  photo_name text;
  tent_id uuid;
  harvest_id uuid;
  grow_id uuid;
  found_award uuid;
  award_hidden_at timestamptz;
  recognized_at timestamptz;
  revoked_at timestamptz;
  was_hidden boolean;
  prior_photo text;
  prior_tent uuid;
  prior_harvest uuid;
  runtime_enabled boolean;
BEGIN
  IF badge_key = 'first_tent' THEN
    subject_kind := 'tent';
  ELSIF badge_key = 'setup_documented' THEN
    subject_kind := 'setup';
  ELSIF badge_key = 'first_recorded_harvest' THEN
    subject_kind := 'harvest';
  ELSE
    RETURN jsonb_build_object('status', 'not_in_slice');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':' || badge_key, 0));

  IF badge_key = 'first_tent' THEN
    -- The account's earliest tent, not the earliest tent that has a photo.
    SELECT tent.id,
           public.badge_awards_owned_diary_photo_name(tent.photo_url, uid)
      INTO subject_id, photo_name
    FROM public.tents AS tent
    WHERE tent.user_id = uid
    ORDER BY tent.created_at ASC, tent.id ASC
    LIMIT 1;
    IF photo_name IS NULL THEN
      subject_id := NULL;
    END IF;
    tent_id := subject_id;
  ELSIF badge_key = 'setup_documented' THEN
    SELECT tent.id,
           public.badge_awards_owned_diary_photo_name(tent.photo_url, uid)
      INTO subject_id, photo_name
    FROM public.tents AS tent
    WHERE tent.user_id = uid
      AND public.badge_awards_owned_diary_photo_name(tent.photo_url, uid) IS NOT NULL
      AND (
        NULLIF(btrim(tent.brand), '') IS NOT NULL
        OR NULLIF(btrim(tent.size), '') IS NOT NULL
        OR NULLIF(btrim(tent.light_schedule), '') IS NOT NULL
        OR tent.light_wattage IS NOT NULL
        OR (
          tent.hardware_config IS NOT NULL
          AND tent.hardware_config <> 'null'::jsonb
          AND tent.hardware_config <> '{}'::jsonb
        )
      )
    ORDER BY tent.created_at ASC, tent.id ASC
    LIMIT 1;
    tent_id := subject_id;
  ELSE
    -- The account's earliest harvest, not the earliest harvest that has a photo.
    SELECT harvest.id,
           public.badge_awards_owned_diary_photo_name(harvest.photo_url, uid),
           harvest.grow_id
      INTO subject_id, photo_name, grow_id
    FROM public.harvests AS harvest
    JOIN public.grows AS grow
      ON grow.id = harvest.grow_id
     AND grow.user_id = uid
    WHERE harvest.user_id = uid
    ORDER BY harvest.harvested_at ASC, harvest.id ASC
    LIMIT 1;
    IF photo_name IS NULL THEN
      subject_id := NULL;
      grow_id := NULL;
    END IF;
    harvest_id := subject_id;
  END IF;

  SELECT award.id, award.hidden_at, award.first_recognized_at, award.revoked_at
    INTO found_award, award_hidden_at, recognized_at, revoked_at
  FROM public.badge_awards AS award
  WHERE award.user_id = uid
    AND award.badge_key = badge_awards_evaluate_photo_subject.badge_key
  FOR UPDATE;

  IF revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unchanged', 'award_id', found_award);
  END IF;

  -- Same write barrier as badge_awards_evaluate_owner (#1979, cbdb77fd2):
  -- recheck the kill switch under a row lock after the advisory lock and
  -- immediately before any award or evidence write.
  SELECT runtime.enabled
    INTO runtime_enabled
  FROM public.badge_award_runtime AS runtime
  WHERE runtime.id = 1
  FOR UPDATE;

  IF runtime_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  IF subject_id IS NULL THEN
    IF found_award IS NULL OR award_hidden_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'unchanged');
    END IF;
    UPDATE public.badge_awards
       SET hidden_at = clock_timestamp()
     WHERE id = found_award;
    DELETE FROM public.badge_evidence
     WHERE badge_evidence.award_id = found_award;
    RETURN jsonb_build_object('status', 'hidden', 'award_id', found_award);
  END IF;

  IF found_award IS NULL THEN
    was_hidden := false;
    INSERT INTO public.badge_awards (user_id, badge_key)
    VALUES (uid, badge_awards_evaluate_photo_subject.badge_key)
    ON CONFLICT ON CONSTRAINT badge_awards_user_id_badge_key_key DO NOTHING
    RETURNING id, first_recognized_at
      INTO found_award, recognized_at;

    IF found_award IS NULL THEN
      SELECT award.id, award.hidden_at IS NOT NULL, award.first_recognized_at
        INTO found_award, was_hidden, recognized_at
      FROM public.badge_awards AS award
      WHERE award.user_id = uid
        AND award.badge_key = badge_awards_evaluate_photo_subject.badge_key
      FOR UPDATE;
      IF was_hidden THEN
        UPDATE public.badge_awards
           SET hidden_at = NULL,
               restored_at = clock_timestamp()
         WHERE id = found_award;
      END IF;
    END IF;

    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (
      award_id, subject_kind, photo_object_name, tent_id, harvest_id, grow_id
    )
    VALUES (found_award, subject_kind, photo_name, tent_id, harvest_id, grow_id);

    IF was_hidden THEN
      RETURN jsonb_build_object('status', 'restored', 'award_id', found_award);
    END IF;
    RETURN jsonb_build_object('status', 'qualified', 'award_id', found_award);
  END IF;

  IF award_hidden_at IS NOT NULL THEN
    UPDATE public.badge_awards
       SET hidden_at = NULL,
           restored_at = clock_timestamp()
     WHERE id = found_award;
    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (
      award_id, subject_kind, photo_object_name, tent_id, harvest_id, grow_id
    )
    VALUES (found_award, subject_kind, photo_name, tent_id, harvest_id, grow_id);
    RETURN jsonb_build_object('status', 'restored', 'award_id', found_award);
  END IF;

  SELECT evidence.photo_object_name, evidence.tent_id, evidence.harvest_id
    INTO prior_photo, prior_tent, prior_harvest
  FROM public.badge_evidence AS evidence
  WHERE evidence.award_id = found_award;

  IF prior_photo IS DISTINCT FROM photo_name
     OR prior_tent IS DISTINCT FROM tent_id
     OR prior_harvest IS DISTINCT FROM harvest_id THEN
    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (
      award_id, subject_kind, photo_object_name, tent_id, harvest_id, grow_id
    )
    VALUES (found_award, subject_kind, photo_name, tent_id, harvest_id, grow_id);
    UPDATE public.badge_awards
       SET evidence_changed_at = clock_timestamp()
     WHERE id = found_award;
  END IF;

  RETURN jsonb_build_object('status', 'unchanged', 'award_id', found_award);
END;
$function$;

REVOKE ALL ON FUNCTION public.badge_awards_evaluate_photo_subject(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.badge_awards_evaluate_owner(badge_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  runtime_enabled boolean;
  uid uuid;
  found_award uuid;
  award_hidden_at timestamptz;
  recognized_at timestamptz;
  entry_id uuid;
  photo_name text;
  earliest_entry_id uuid;
  earliest_photo text;
  kept_entry_id uuid;
  kept_photo text;
  prior_entry_id uuid;
  prior_photo text;
  was_hidden boolean;
  revoked_at timestamptz;
BEGIN
  -- Fast path only. The write barrier is the FOR UPDATE recheck after the
  -- advisory lock, immediately before any award or evidence mutation.
  SELECT runtime.enabled
    INTO runtime_enabled
  FROM public.badge_award_runtime AS runtime
  WHERE runtime.id = 1;

  IF runtime_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN jsonb_build_object('status', 'not_authenticated');
  END IF;

  IF COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'not_authenticated');
  END IF;

  IF btrim(coalesce(badge_key, '')) IN (
    'first_tent',
    'setup_documented',
    'first_recorded_harvest'
  ) THEN
    RETURN public.badge_awards_evaluate_photo_subject(btrim(badge_key), uid);
  END IF;

  IF btrim(coalesce(badge_key, '')) <> 'first_diary_entry' THEN
    RETURN jsonb_build_object('status', 'not_in_slice');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':first_diary_entry', 0));

  -- Earliest qualifying entry is the fallback. Current evidence stays while
  -- that diary row still qualifies, including when an older entry appears.
  -- A row saved with no photo qualifies here once an owned photo is written
  -- onto that same row. This SELECT reads the current columns.
  SELECT entry.id,
         COALESCE(
           public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
           public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
         )
    INTO earliest_entry_id, earliest_photo
  FROM public.diary_entries AS entry
  JOIN public.grows AS grow
    ON grow.id = entry.grow_id
   AND grow.user_id = uid
  WHERE entry.user_id = uid
    AND entry.retracted_at IS NULL
    AND COALESCE(
      public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
      public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
    ) IS NOT NULL
  ORDER BY entry.entry_at ASC, entry.id ASC
  LIMIT 1;

  SELECT evidence.diary_entry_id
    INTO prior_entry_id
  FROM public.badge_awards AS award
  JOIN public.badge_evidence AS evidence
    ON evidence.award_id = award.id
  WHERE award.user_id = uid
    AND award.badge_key = 'first_diary_entry'
    AND award.hidden_at IS NULL;

  IF prior_entry_id IS NOT NULL THEN
    SELECT entry.id,
           COALESCE(
             public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
             public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
           )
      INTO kept_entry_id, kept_photo
    FROM public.diary_entries AS entry
    JOIN public.grows AS grow
      ON grow.id = entry.grow_id
     AND grow.user_id = uid
    WHERE entry.id = prior_entry_id
      AND entry.user_id = uid
      AND entry.retracted_at IS NULL
      AND COALESCE(
        public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
        public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
      ) IS NOT NULL;
  END IF;

  IF kept_entry_id IS NOT NULL THEN
    entry_id := kept_entry_id;
    photo_name := kept_photo;
  ELSE
    entry_id := earliest_entry_id;
    photo_name := earliest_photo;
  END IF;

  SELECT award.id, award.hidden_at, award.first_recognized_at, award.revoked_at
    INTO found_award, award_hidden_at, recognized_at, revoked_at
  FROM public.badge_awards AS award
  WHERE award.user_id = uid
    AND award.badge_key = 'first_diary_entry'
  FOR UPDATE;

  IF revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unchanged', 'award_id', found_award);
  END IF;

  -- Recheck under a row lock after the advisory lock and immediately before
  -- any award or evidence write, so a committed enabled = false is a write
  -- barrier. This lock stays after the advisory wait: taking it earlier
  -- deadlocks a concurrent disable that is waiting to commit.
  SELECT runtime.enabled
    INTO runtime_enabled
  FROM public.badge_award_runtime AS runtime
  WHERE runtime.id = 1
  FOR UPDATE;

  IF runtime_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  IF entry_id IS NULL THEN
    IF found_award IS NULL OR award_hidden_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'unchanged');
    END IF;

    UPDATE public.badge_awards
       SET hidden_at = clock_timestamp()
     WHERE id = found_award;
    DELETE FROM public.badge_evidence
     WHERE badge_evidence.award_id = found_award;
    RETURN jsonb_build_object('status', 'hidden', 'award_id', found_award);
  END IF;

  IF found_award IS NULL THEN
    was_hidden := false;
    INSERT INTO public.badge_awards (user_id, badge_key)
    VALUES (uid, 'first_diary_entry')
    ON CONFLICT ON CONSTRAINT badge_awards_user_id_badge_key_key DO NOTHING
    RETURNING id, first_recognized_at
      INTO found_award, recognized_at;

    IF found_award IS NULL THEN
      SELECT award.id, award.hidden_at IS NOT NULL, award.first_recognized_at
        INTO found_award, was_hidden, recognized_at
      FROM public.badge_awards AS award
      WHERE award.user_id = uid
        AND award.badge_key = 'first_diary_entry'
      FOR UPDATE;

      IF was_hidden THEN
        UPDATE public.badge_awards
           SET hidden_at = NULL,
               restored_at = clock_timestamp()
         WHERE id = found_award;
      END IF;
    END IF;

    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (award_id, diary_entry_id, photo_object_name)
    VALUES (found_award, entry_id, photo_name);

    IF was_hidden THEN
      RETURN jsonb_build_object('status', 'restored', 'award_id', found_award);
    END IF;
    RETURN jsonb_build_object('status', 'qualified', 'award_id', found_award);
  END IF;

  IF award_hidden_at IS NOT NULL THEN
    UPDATE public.badge_awards
       SET hidden_at = NULL,
           restored_at = clock_timestamp()
     WHERE id = found_award;
    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (award_id, diary_entry_id, photo_object_name)
    VALUES (found_award, entry_id, photo_name);
    RETURN jsonb_build_object('status', 'restored', 'award_id', found_award);
  END IF;

  SELECT evidence.diary_entry_id, evidence.photo_object_name
    INTO prior_entry_id, prior_photo
  FROM public.badge_evidence AS evidence
  WHERE evidence.award_id = found_award;

  IF prior_entry_id IS DISTINCT FROM entry_id OR prior_photo IS DISTINCT FROM photo_name THEN
    DELETE FROM public.badge_evidence WHERE badge_evidence.award_id = found_award;
    INSERT INTO public.badge_evidence (award_id, diary_entry_id, photo_object_name)
    VALUES (found_award, entry_id, photo_name);
    UPDATE public.badge_awards
       SET evidence_changed_at = clock_timestamp()
     WHERE id = found_award;
  END IF;

  RETURN jsonb_build_object('status', 'unchanged', 'award_id', found_award);
END;
$function$;


REVOKE ALL ON FUNCTION public.badge_awards_evaluate_owner(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.badge_awards_evaluate_owner(text) TO authenticated;

COMMENT ON FUNCTION public.badge_awards_evaluate_owner(text) IS
  'Awards first_diary_entry, first_tent, setup_documented, or first_recorded_harvest for auth.uid() only. Fail closed while badge_award_runtime.enabled is not true. Does not read yield_grams, does not update profiles, and does not call award_nugs.';

CREATE OR REPLACE FUNCTION public.badge_awards_reconcile()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  runtime_enabled boolean;
  cursor_after uuid;
  owner uuid;
  last_owner uuid;
  reconciled integer := 0;
  visited integer := 0;
  batch_limit constant integer := 25;
BEGIN
  -- Fast path only. Each owner is read again before evaluate_owner, and the
  -- cursor write rechecks under FOR UPDATE after that call returns.
  SELECT runtime.enabled, runtime.reconcile_after
    INTO runtime_enabled, cursor_after
  FROM public.badge_award_runtime AS runtime
  WHERE runtime.id = 1;

  IF runtime_enabled IS NOT TRUE THEN
    RETURN 0;
  END IF;

  FOR owner IN
    SELECT owners.user_id
    FROM (
      SELECT entry.user_id
      FROM public.diary_entries AS entry
      WHERE entry.user_id IS NOT NULL
      UNION
      SELECT tent.user_id
      FROM public.tents AS tent
      WHERE tent.user_id IS NOT NULL
      UNION
      SELECT harvest.user_id
      FROM public.harvests AS harvest
      WHERE harvest.user_id IS NOT NULL
      UNION
      SELECT award.user_id
      FROM public.badge_awards AS award
    ) AS owners
    WHERE cursor_after IS NULL OR owners.user_id > cursor_after
    ORDER BY owners.user_id
    LIMIT batch_limit
  LOOP
    -- Plain read, once per owner. Do not lock the runtime row across
    -- evaluate_owner: that call waits on the owner advisory lock, and holding
    -- the runtime row across that wait deadlocks a concurrent disable.
    SELECT runtime.enabled
      INTO runtime_enabled
    FROM public.badge_award_runtime AS runtime
    WHERE runtime.id = 1;

    IF runtime_enabled IS NOT TRUE THEN
      EXIT;
    END IF;

    BEGIN
      PERFORM set_config('request.jwt.claim.sub', owner::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', owner)::text, true);
      PERFORM public.badge_awards_evaluate_owner('first_diary_entry');
      PERFORM public.badge_awards_evaluate_owner('first_tent');
      PERFORM public.badge_awards_evaluate_owner('setup_documented');
      PERFORM public.badge_awards_evaluate_owner('first_recorded_harvest');
      reconciled := reconciled + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'badge_awards_reconcile skipped owner %: %', owner, SQLERRM;
    END;
    visited := visited + 1;
    last_owner := owner;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Same write barrier as the evaluator. Skip the cursor update when the
  -- switch is off. The row lock is taken only after evaluate_owner returns.
  SELECT runtime.enabled
    INTO runtime_enabled
  FROM public.badge_award_runtime AS runtime
  WHERE runtime.id = 1
  FOR UPDATE;

  IF runtime_enabled IS NOT TRUE THEN
    RETURN reconciled;
  END IF;

  IF visited < batch_limit THEN
    UPDATE public.badge_award_runtime
       SET reconcile_after = NULL
     WHERE id = 1;
  ELSE
    UPDATE public.badge_award_runtime
       SET reconcile_after = last_owner
     WHERE id = 1;
  END IF;

  RETURN reconciled;
END;
$function$;


REVOKE ALL ON FUNCTION public.badge_awards_reconcile()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.badge_awards_reconcile() TO service_role;
