-- Owner badge awards: First Diary Entry only.
--
-- Server kill switch: public.badge_award_runtime is one row (id = 1) and
-- starts with enabled = false. badge_awards_evaluate_owner reads that row
-- before any lock or write. A missing row, a null, or any value other than
-- true returns {"status":"disabled"} and writes nothing.
--
-- Matthew turns the switch on, with the service_role key only, after Petal
-- approves the badge copy. A BEFORE UPDATE trigger sets updated_at to
-- clock_timestamp() when enabled changes:
--   UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
-- There is no Settings control and no client UPDATE grant.
--
-- Matthew enables the inactive pg_cron job only after that flip. Hosted
-- cron.alter_job needs the postgres role:
--   SELECT cron.alter_job(job.jobid, active := true)
--   FROM cron.job AS job
--   WHERE job.jobname = 'badge-awards-reconcile';
-- Order: Petal copy approval, then the runtime flip, then cron enable.
-- This migration does none of those three.
--
-- This migration creates no trigger on diary_entries, storage.objects,
-- grows, or tents. Existing diary saves do not call the evaluator.
--
-- Revocation is admin-only. service_role may set badge_awards.revoked_at.
-- Authenticated has no UPDATE grant. Re-evaluation leaves a revoked row
-- unchanged, so a later qualifying diary does not restore it.
--
-- badge_awards_reconcile() is the server sweep. It reads the kill switch
-- first and writes nothing unless that switch is exactly true. Each call
-- visits at most 25 owners and stores the cursor in reconcile_after, so
-- one transaction holds at most 25 advisory locks. An error evaluating one
-- owner is logged and skipped. The cursor still advances, and the rest of
-- that batch continues. EXECUTE is service_role only. The pg_cron job
-- badge-awards-reconcile is inserted inactive when pg_cron is installed.
-- When pg_cron is absent the schedule block returns before it reads
-- cron.job. This migration does not enable the job.
--
-- Cut 001: any photo attached to the owner's own diary entry earns
-- First Diary Entry. Note text is not a qualification input. A photo
-- added later to that same entry qualifies on the next evaluation,
-- because the function reads the current photo columns. The photo
-- must be on that entry, on that owner's path, and present in
-- storage.objects for this account. A '..' segment, another user's path,
-- and an inferred link do not qualify. Signed-in members can SELECT
-- active badge_awards rows. A hidden or revoked row stays visible to
-- its owner and hidden from other members. Logged-out visitors (anon)
-- receive no award rows. Profile display is a later slice and is not
-- built here. Evidence SELECT stays owner-only, so evidence photos are
-- not granted to other accounts or to anon.
--
-- Evidence can name a diary entry, tent, setup, or harvest. Only
-- first_diary_entry has a qualification rule. The other keys are stored
-- shape: the evaluator returns not_in_slice and writes nothing for them.

CREATE TABLE public.badge_award_runtime (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  reconcile_after uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.badge_award_runtime (id, enabled)
VALUES (1, false);

-- updated_at tracks a kill-switch change. Cursor updates keep the previous
-- timestamp so a reconcile batch is not recorded as a switch flip.
CREATE OR REPLACE FUNCTION public.badge_award_runtime_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    NEW.updated_at := clock_timestamp();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER badge_award_runtime_touch_updated_at
  BEFORE UPDATE ON public.badge_award_runtime
  FOR EACH ROW
  EXECUTE FUNCTION public.badge_award_runtime_touch_updated_at();

REVOKE ALL ON FUNCTION public.badge_award_runtime_touch_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  badge_key text NOT NULL CHECK (
    badge_key IN (
      'first_diary_entry',
      'first_tent',
      'setup_documented',
      'first_recorded_harvest'
    )
  ),
  rule_version integer NOT NULL DEFAULT 1,
  first_recognized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hidden_at timestamptz,
  restored_at timestamptz,
  evidence_changed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

CREATE TABLE public.badge_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id uuid NOT NULL REFERENCES public.badge_awards (id) ON DELETE CASCADE,
  subject_kind text NOT NULL DEFAULT 'diary_entry' CHECK (
    subject_kind IN ('diary_entry', 'tent', 'setup', 'harvest')
  ),
  diary_entry_id uuid,
  photo_object_name text,
  tent_id uuid,
  grow_id uuid,
  plant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_id),
  CONSTRAINT badge_evidence_diary_entry_shape CHECK (
    subject_kind <> 'diary_entry'
    OR (diary_entry_id IS NOT NULL AND photo_object_name IS NOT NULL)
  )
);

ALTER TABLE public.badge_award_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY badge_award_runtime_service_select
  ON public.badge_award_runtime
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY badge_award_runtime_service_update
  ON public.badge_award_runtime
  FOR UPDATE
  TO service_role
  USING (id = 1)
  WITH CHECK (id = 1);

CREATE POLICY badge_awards_owner_select
  ON public.badge_awards
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- Cut 001 (Matthew, 2026-10-11 03:41 CT): until community launch, signed-in
-- members can see other growers' active badges. Evidence and photos stay
-- owner-only. Logged-out visitors (anon) never see awards.
CREATE POLICY badge_awards_member_select ON public.badge_awards
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND hidden_at IS NULL
    AND revoked_at IS NULL
  );

CREATE POLICY badge_evidence_owner_select
  ON public.badge_evidence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.badge_awards AS award
      WHERE award.id = badge_evidence.award_id
        AND award.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.badge_award_runtime FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.badge_awards FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.badge_evidence FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, UPDATE ON TABLE public.badge_award_runtime TO service_role;
GRANT SELECT ON TABLE public.badge_awards TO authenticated, service_role;
GRANT UPDATE (revoked_at) ON TABLE public.badge_awards TO service_role;
GRANT SELECT ON TABLE public.badge_evidence TO authenticated;

CREATE OR REPLACE FUNCTION public.badge_awards_stamp_recognition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.first_recognized_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER badge_awards_stamp_recognition
  BEFORE INSERT ON public.badge_awards
  FOR EACH ROW
  EXECUTE FUNCTION public.badge_awards_stamp_recognition();

CREATE OR REPLACE FUNCTION public.badge_awards_freeze_recognition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.first_recognized_at := OLD.first_recognized_at;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER badge_awards_freeze_recognition
  BEFORE UPDATE ON public.badge_awards
  FOR EACH ROW
  EXECUTE FUNCTION public.badge_awards_freeze_recognition();

REVOKE ALL ON FUNCTION public.badge_awards_stamp_recognition() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.badge_awards_freeze_recognition() FROM PUBLIC, anon, authenticated, service_role;

-- Internal photo check. Not granted to client roles.
-- Qualifies storage://diary-photos/<path> and a scheme-less bare path only
-- when the first segment is the owner id and storage.objects has that name
-- in the diary-photos bucket. When owner or owner_id is set, it must be
-- this account. A null owner is a legacy object and still qualifies.
-- http(s) and any other scheme do not qualify.
CREATE OR REPLACE FUNCTION public.badge_awards_owned_diary_photo_name(raw text, owner_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  trimmed text;
  rest text;
  bucket text;
  object_name text;
  first_segment text;
  segment text;
BEGIN
  IF raw IS NULL OR owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  trimmed := btrim(raw);
  IF trimmed = '' OR length(trimmed) > 4096 OR trimmed ~ '[[:cntrl:]]' THEN
    RETURN NULL;
  END IF;

  IF left(trimmed, 10) = 'storage://' THEN
    rest := substr(trimmed, 11);
    IF position('/' IN rest) <= 1 THEN
      RETURN NULL;
    END IF;
    bucket := split_part(rest, '/', 1);
    IF bucket <> 'diary-photos' THEN
      RETURN NULL;
    END IF;
    object_name := substr(rest, length(bucket) + 2);
  ELSIF trimmed ~* '^https?://' THEN
    RETURN NULL;
  ELSIF trimmed ~ '^[A-Za-z][A-Za-z0-9+.-]*:' THEN
    RETURN NULL;
  ELSE
    object_name := trimmed;
  END IF;

  IF object_name IS NULL OR object_name = '' OR left(object_name, 1) = '/' THEN
    RETURN NULL;
  END IF;
  IF position('?' IN object_name) > 0
     OR position('#' IN object_name) > 0
     OR strpos(object_name, chr(92)) > 0
     OR length(object_name) > 1024 THEN
    RETURN NULL;
  END IF;

  first_segment := split_part(object_name, '/', 1);
  IF first_segment <> owner_id::text OR position('/' IN object_name) = 0 THEN
    RETURN NULL;
  END IF;

  FOREACH segment IN ARRAY string_to_array(object_name, '/') LOOP
    IF segment IS NULL OR segment = '' OR segment = '.' OR segment = '..' OR length(segment) > 255 THEN
      RETURN NULL;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'diary-photos'
      AND object.name = object_name
      AND (
        object.owner IS NULL
        OR object.owner = badge_awards_owned_diary_photo_name.owner_id
      )
      AND (
        object.owner_id IS NULL
        OR btrim(object.owner_id) = ''
        OR object.owner_id = badge_awards_owned_diary_photo_name.owner_id::text
      )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN object_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.badge_awards_owned_diary_photo_name(text, uuid)
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
  'Awards first_diary_entry for auth.uid() only. Fail closed while badge_award_runtime.enabled is not true. Does not read the UI flag, does not update profiles, and does not call award_nugs.';

-- Server sweep. No trigger on diary_entries, grows, tents, or storage.objects.
-- Fail closed unless badge_award_runtime.enabled is exactly true.
--
-- pg_advisory_xact_lock is held until the calling transaction commits, so a
-- sweep of every owner would keep one lock per owner. A session-level
-- lock/unlock pair can stay held on a pooled connection if the call errors
-- before unlock. A procedure that COMMITs each owner would release the xact
-- lock per iteration, and it would change this call from SELECT to CALL.
-- This function visits at most 25 owners per call, ordered by user id, and
-- stores the last visited id in reconcile_after. The next call continues
-- after that id. A short or empty batch clears the cursor. Each owner runs
-- in its own BEGIN block. WHEN OTHERS logs that owner and continues, so one
-- error does not abort the batch and does not stop the cursor.
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

-- Disabled schedule. active is false on insert. The procedure check is its
-- own statement so cron.job is not planned when pg_cron is absent. Matthew
-- enables the job later with cron.alter_job (see the header). Order is
-- Petal copy approval, then the runtime flip, then this job.
-- Equivalent command, only where pg_cron is installed:
--   SELECT cron.schedule_in_database(
--     'badge-awards-reconcile',
--     '15 * * * *',
--     'SELECT public.badge_awards_reconcile()',
--     current_database(),
--     NULL,
--     false
--   );
DO $schedule$
BEGIN
  IF to_regprocedure('cron.schedule_in_database(text, text, text, text, text, boolean)') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'badge-awards-reconcile'
  ) THEN
    PERFORM cron.schedule_in_database(
      'badge-awards-reconcile',
      '15 * * * *',
      'SELECT public.badge_awards_reconcile()',
      current_database(),
      NULL,
      false
    );
  END IF;
END
$schedule$;
