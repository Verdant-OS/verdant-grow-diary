-- Owner badge awards: First Diary Entry only.
--
-- Server kill switch: public.badge_award_runtime is one row (id = 1) and
-- starts with enabled = false. badge_awards_evaluate_owner reads that row
-- before any lock or write. A missing row, a null, or any value other than
-- true returns {"status":"disabled"} and writes nothing.
--
-- Matthew turns the switch on, with the service_role key only:
--   UPDATE public.badge_award_runtime SET enabled = true WHERE id = 1;
-- There is no Settings control and no client UPDATE grant.
--
-- This migration creates no trigger on diary_entries, storage.objects,
-- grows, or tents. Existing diary saves do not call the evaluator.

CREATE TABLE public.badge_award_runtime (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.badge_award_runtime (id, enabled)
VALUES (1, false);

CREATE TABLE public.badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  badge_key text NOT NULL CHECK (badge_key = 'first_diary_entry'),
  rule_version integer NOT NULL DEFAULT 1,
  first_recognized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hidden_at timestamptz,
  restored_at timestamptz,
  evidence_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

CREATE TABLE public.badge_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id uuid NOT NULL REFERENCES public.badge_awards (id) ON DELETE CASCADE,
  diary_entry_id uuid NOT NULL,
  photo_object_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_id)
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
  USING (true)
  WITH CHECK (id = 1);

CREATE POLICY badge_awards_owner_select
  ON public.badge_awards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

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
GRANT SELECT ON TABLE public.badge_awards TO authenticated;
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
-- in the diary-photos bucket. http(s) and any other scheme do not qualify.
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
  prior_entry_id uuid;
  prior_photo text;
  was_hidden boolean;
BEGIN
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

  IF btrim(coalesce(badge_key, '')) <> 'first_diary_entry' THEN
    RETURN jsonb_build_object('status', 'not_in_slice');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':first_diary_entry', 0));

  SELECT entry.id,
         COALESCE(
           public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
           public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
         )
    INTO entry_id, photo_name
  FROM public.diary_entries AS entry
  WHERE entry.user_id = uid
    AND entry.retracted_at IS NULL
    AND length(btrim(entry.note)) > 0
    AND btrim(entry.note) <> 'Photo attached from Quick Log.'
    AND COALESCE(
      public.badge_awards_owned_diary_photo_name(entry.photo_url, uid),
      public.badge_awards_owned_diary_photo_name(entry.details->>'photo_url', uid)
    ) IS NOT NULL
  ORDER BY entry.entry_at ASC, entry.id ASC
  LIMIT 1;

  SELECT award.id, award.hidden_at, award.first_recognized_at
    INTO found_award, award_hidden_at, recognized_at
  FROM public.badge_awards AS award
  WHERE award.user_id = uid
    AND award.badge_key = 'first_diary_entry'
  FOR UPDATE;

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
