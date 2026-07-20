-- Genetics & Propagation Traceability V1 — Slice 5
-- Quarantine episodes + append-only transition history + clearance-rule RPC.
--
-- Quarantine is an explicit grower action. It does NOT control equipment, change
-- plant health, diagnose a crop, or create an Action Queue item. Clearance after a
-- positive requires a LATER, non-superseded, uncontradicted NEGATIVE for the SAME
-- subject + target collected after the last (re)open. Inconclusive / not_tested
-- can never clear. Overrides are separately flagged, reasoned, attributed, and
-- visible forever. Reopening preserves the complete prior history.

BEGIN;

-- ---------------------------------------------------------------------------
-- quarantine_episodes
-- ---------------------------------------------------------------------------
CREATE TABLE public.quarantine_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('accession', 'batch', 'plant')),
  subject_id uuid NOT NULL,
  target text NOT NULL CHECK (target = btrim(target) AND target <> ''),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'released', 'disposed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_reason text,
  reopened_at timestamptz,
  closed_at timestamptz,
  closure_kind text CHECK (closure_kind IN ('cleared', 'disposed', 'override')),
  closure_screening_result_id uuid REFERENCES public.genetics_screening_results(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A 'cleared' closure MUST cite a validated negative; nothing else may.
  CONSTRAINT quarantine_episodes_cleared_requires_screening_chk CHECK (
    (closure_kind = 'cleared') = (closure_screening_result_id IS NOT NULL)
  )
);

ALTER TABLE public.quarantine_episodes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.quarantine_episodes TO authenticated;
GRANT ALL ON public.quarantine_episodes TO service_role;

CREATE POLICY quarantine_episodes_select_own
  ON public.quarantine_episodes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX quarantine_episodes_user_id_idx ON public.quarantine_episodes (user_id);
CREATE INDEX quarantine_episodes_subject_idx
  ON public.quarantine_episodes (subject_type, subject_id);
CREATE INDEX quarantine_episodes_open_idx
  ON public.quarantine_episodes (user_id, status) WHERE status = 'open';

CREATE TRIGGER quarantine_episodes_set_updated_at
  BEFORE UPDATE ON public.quarantine_episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quarantine_transition_events (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE public.quarantine_transition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.quarantine_episodes(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('open', 'release', 'dispose', 'reopen', 'override')),
  reason text,
  screening_result_id uuid REFERENCES public.genetics_screening_results(id) ON DELETE SET NULL,
  is_override boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quarantine_transition_override_flag_chk CHECK (is_override = (action = 'override')),
  CONSTRAINT quarantine_transition_reason_substance_chk CHECK (
    action NOT IN ('dispose', 'override') OR (reason IS NOT NULL AND length(btrim(reason)) >= 8)
  )
);

ALTER TABLE public.quarantine_transition_events ENABLE ROW LEVEL SECURITY;
-- APPEND-ONLY: authenticated read-only; written only by the definer RPCs.
GRANT SELECT ON public.quarantine_transition_events TO authenticated;
GRANT ALL ON public.quarantine_transition_events TO service_role;

CREATE POLICY quarantine_transition_events_select_own
  ON public.quarantine_transition_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX quarantine_transition_events_episode_idx
  ON public.quarantine_transition_events (episode_id, changed_at DESC);
CREATE INDEX quarantine_transition_events_user_id_idx
  ON public.quarantine_transition_events (user_id);

-- ---------------------------------------------------------------------------
-- RPC: genetics_quarantine_open(p_idempotency_key, p_payload)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_quarantine_open(
  p_idempotency_key text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_quarantine_open';
  v_hash text := md5(coalesce(p_payload::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
  v_subject_type text := btrim(p_payload->>'subject_type');
  v_subject_id uuid := nullif(p_payload->>'subject_id', '')::uuid;
  v_target text := lower(btrim(coalesce(p_payload->>'target', '')));
  v_owned boolean;
  v_result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  SELECT result, request_hash INTO v_prior, v_prior_hash
    FROM public.genetics_mutation_idempotency
    WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
  IF v_prior IS NOT NULL THEN
    IF v_prior_hash IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
    END IF;
    RETURN v_prior || jsonb_build_object('reused', true);
  END IF;

  IF v_subject_type NOT IN ('accession', 'batch', 'plant') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_subject_type');
  END IF;
  IF v_subject_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_subject');
  END IF;
  IF v_target = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'target_required');
  END IF;

  v_owned := CASE v_subject_type
    WHEN 'accession' THEN EXISTS (SELECT 1 FROM public.genetics_accessions WHERE id = v_subject_id AND user_id = uid)
    WHEN 'batch' THEN EXISTS (SELECT 1 FROM public.propagation_batches WHERE id = v_subject_id AND user_id = uid)
    WHEN 'plant' THEN EXISTS (SELECT 1 FROM public.plants WHERE id = v_subject_id AND user_id = uid)
    ELSE false
  END;
  IF NOT v_owned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'subject_not_found');
  END IF;

  BEGIN
    INSERT INTO public.quarantine_episodes (user_id, subject_type, subject_id, target, status, opened_reason)
    VALUES (uid, v_subject_type, v_subject_id, v_target, 'open', nullif(btrim(p_payload->>'opened_reason'), ''))
    RETURNING id INTO v_id;

    INSERT INTO public.quarantine_transition_events (user_id, episode_id, action, reason)
    VALUES (uid, v_id, 'open', nullif(btrim(p_payload->>'opened_reason'), ''));

    v_result := jsonb_build_object('ok', true, 'episode_id', v_id);

    INSERT INTO public.genetics_mutation_idempotency (user_id, operation, idempotency_key, request_hash, result)
    VALUES (uid, v_op, p_idempotency_key, v_hash, v_result);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'genetics_mutation_idempotency_pkey' THEN
      SELECT result, request_hash INTO v_prior, v_prior_hash
        FROM public.genetics_mutation_idempotency
        WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
      IF v_prior IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
      END IF;
      IF v_prior_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
      END IF;
      RETURN v_prior || jsonb_build_object('reused', true);
    END IF;
    RAISE;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_quarantine_open(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_quarantine_open(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: genetics_quarantine_transition(key, episode, action, reason, screening)
--   Actions: release | dispose | reopen | override. Row-locks the episode,
--   enforces a legal-transition whitelist, and applies the clearance rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_quarantine_transition(
  p_idempotency_key text,
  p_episode_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_screening_result_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_quarantine_transition';
  v_hash text := md5(coalesce(p_episode_id::text, '') || '|' || coalesce(p_action, '') || '|'
                     || coalesce(btrim(p_reason), '') || '|' || coalesce(p_screening_result_id::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_reason text := nullif(btrim(p_reason), '');
  ep public.quarantine_episodes%ROWTYPE;
  scr public.genetics_screening_results%ROWTYPE;
  v_effective_open timestamptz;
  v_status text;
  v_closure_kind text;
  v_closure_scr uuid;
  v_closed_at timestamptz;
  v_reopened timestamptz;
  v_event_screening uuid;
  v_is_override boolean := false;
  v_result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;
  IF p_action NOT IN ('release', 'dispose', 'reopen', 'override') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  SELECT result, request_hash INTO v_prior, v_prior_hash
    FROM public.genetics_mutation_idempotency
    WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
  IF v_prior IS NOT NULL THEN
    IF v_prior_hash IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
    END IF;
    RETURN v_prior || jsonb_build_object('reused', true);
  END IF;

  -- Row-lock the episode: serializes concurrent transitions (no double-release).
  SELECT * INTO ep FROM public.quarantine_episodes
    WHERE id = p_episode_id AND user_id = uid
    FOR UPDATE;
  IF ep.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'episode_not_found');
  END IF;

  -- Legal-transition whitelist.
  IF p_action IN ('release', 'dispose', 'override') AND ep.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'illegal_transition');
  END IF;
  IF p_action = 'reopen' AND ep.status NOT IN ('released', 'disposed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'illegal_transition');
  END IF;

  -- Any supplied screening reference must be owned (guards event provenance).
  IF p_screening_result_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.genetics_screening_results WHERE id = p_screening_result_id AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'screening_not_found');
  END IF;

  v_effective_open := coalesce(ep.reopened_at, ep.opened_at);

  IF p_action = 'release' THEN
    IF p_screening_result_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screening_required');
    END IF;
    -- Bind the negative to THIS episode's subject + target.
    SELECT * INTO scr FROM public.genetics_screening_results
      WHERE id = p_screening_result_id AND user_id = uid
        AND subject_type = ep.subject_type AND subject_id = ep.subject_id AND target = ep.target;
    IF scr.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screening_subject_mismatch');
    END IF;
    IF scr.result <> 'negative' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screening_not_negative');
    END IF;
    -- Collected after the last (re)open, same-day allowed, UTC-pinned.
    IF scr.collected_date IS NULL OR scr.collected_date < (v_effective_open AT TIME ZONE 'UTC')::date THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screening_not_after_open');
    END IF;
    -- The chosen negative must be current (not itself superseded).
    IF EXISTS (
      SELECT 1 FROM public.genetics_screening_results
      WHERE supersedes_id = scr.id AND user_id = uid
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screening_superseded');
    END IF;
    -- No newer/equal contradicting evidence for the same subject + target.
    IF EXISTS (
      SELECT 1 FROM public.genetics_screening_results n
      WHERE n.user_id = uid AND n.subject_type = ep.subject_type AND n.subject_id = ep.subject_id
        AND n.target = ep.target AND n.result IN ('positive', 'inconclusive', 'not_tested')
        AND n.collected_date IS NOT NULL AND n.collected_date >= scr.collected_date
        AND NOT EXISTS (
          SELECT 1 FROM public.genetics_screening_results s2
          WHERE s2.supersedes_id = n.id AND s2.user_id = uid
        )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'contradicting_or_newer_evidence');
    END IF;

    v_status := 'released'; v_closure_kind := 'cleared'; v_closure_scr := scr.id;
    v_closed_at := now(); v_reopened := ep.reopened_at; v_event_screening := scr.id;

  ELSIF p_action = 'override' THEN
    IF v_reason IS NULL OR length(v_reason) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'override_reason_required');
    END IF;
    -- Override closes as released but is NEVER 'cleared' and cites no screening.
    v_status := 'released'; v_closure_kind := 'override'; v_closure_scr := NULL;
    v_closed_at := now(); v_reopened := ep.reopened_at; v_is_override := true; v_event_screening := NULL;

  ELSIF p_action = 'dispose' THEN
    IF v_reason IS NULL OR length(v_reason) < 8 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'disposition_reason_required');
    END IF;
    v_status := 'disposed'; v_closure_kind := 'disposed'; v_closure_scr := NULL;
    v_closed_at := now(); v_reopened := ep.reopened_at; v_event_screening := NULL;

  ELSE  -- reopen
    v_status := 'open'; v_closure_kind := NULL; v_closure_scr := NULL;
    v_closed_at := NULL; v_reopened := now(); v_event_screening := NULL;
  END IF;

  BEGIN
    UPDATE public.quarantine_episodes SET
      status = v_status,
      closure_kind = v_closure_kind,
      closure_screening_result_id = v_closure_scr,
      closed_at = v_closed_at,
      reopened_at = v_reopened,
      updated_at = now()
    WHERE id = ep.id AND user_id = uid;

    INSERT INTO public.quarantine_transition_events (user_id, episode_id, action, reason, screening_result_id, is_override)
    VALUES (uid, ep.id, p_action, v_reason, v_event_screening, v_is_override);

    v_result := jsonb_build_object('ok', true, 'episode_id', ep.id, 'status', v_status, 'closure_kind', v_closure_kind);

    INSERT INTO public.genetics_mutation_idempotency (user_id, operation, idempotency_key, request_hash, result)
    VALUES (uid, v_op, p_idempotency_key, v_hash, v_result);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'genetics_mutation_idempotency_pkey' THEN
      SELECT result, request_hash INTO v_prior, v_prior_hash
        FROM public.genetics_mutation_idempotency
        WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
      IF v_prior IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
      END IF;
      IF v_prior_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
      END IF;
      RETURN v_prior || jsonb_build_object('reused', true);
    END IF;
    RAISE;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_quarantine_transition(text, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_quarantine_transition(text, uuid, text, text, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
