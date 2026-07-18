-- pheno_ingest — atomic PhenoID → Verdant capture ingest (Phase 2b).
--
-- One call = one PhenoID hunt session. SECURITY DEFINER with auth.uid() as the
-- sole trust anchor (mirrors quicklog_save_manual). DUAL-WRITES per candidate:
--   • core pheno_* (doctrine intact — per-axis, no composite/ranking)
--   • the gated phenoid_* add-on layer (composite/ranking/extras; nothing dropped)
-- plus diary photo-evidence receipts. Idempotent per (user_id, idempotency_key).
--
-- Entitlement: gated on BOTH has_phenoid_entitlement (top tier) AND
-- has_pheno_tracker_entitlement (Pheno Hunt Premium) so the plants
-- candidate_number guard's own Pro check passes for the rows we create.
-- (Once the top-tier SKU is wired as a superset, has_phenoid ⇒ has_pheno_tracker;
-- the explicit second check is belt-and-suspenders until then.)
--
-- Transforms mirror src/lib/phenoIdIngestMapping.ts exactly (pinned by
-- src/test/pheno-ingest-rpc-drift.test.ts): stage→round, 0-10→1-5 rescale,
-- verdict→decision. Photos are pre-uploaded by the importer to diary-photos;
-- this RPC only references storage paths.
--
-- Append-only surfaces (sex/stress observations, keeper-decision log) are
-- written only on FIRST import of a candidate (resolved via phenoid_uuid) to
-- avoid duplicate audit rows on re-import; mutable rows (scores, keeper
-- decision, extras) upsert every time.
--
-- NOTE: delivered as a file for review + per-PR Supabase preview validation +
-- the runtime RLS/entitlement harness. NOT applied to the live project here.

-- ---------------------------------------------------------------------------
-- Idempotency ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phenoid_ingest_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
GRANT SELECT ON public.phenoid_ingest_idempotency TO authenticated;
GRANT ALL ON public.phenoid_ingest_idempotency TO service_role;
ALTER TABLE public.phenoid_ingest_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phenoid_ingest_idempotency_select_own"
  ON public.phenoid_ingest_idempotency FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- The ingest RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pheno_ingest(
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid        uuid := auth.uid();
  v_prev     jsonb;
  v_grow_id  uuid;
  v_tent_id  uuid;
  v_hunt_id  uuid;
  v_session  text;
  v_hunt_nm  text;
  v_location text;
  v_cand     jsonb;
  v_uuid     text;
  v_label    text;
  v_num      int;
  v_plant_id uuid;
  v_is_new   boolean;
  v_verdict  text;
  v_decision text;
  v_round    text;
  v_pstage   text;
  v_loud     jsonb;
  v_tag      text;
  v_tnorm    text;
  v_photo    jsonb;
  v_created  int := 0;
  v_updated  int := 0;
  v_result   jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  -- Highest-tier gate (superset) + core Premium gate (so the candidate_number
  -- guard's Pro check passes for the plants we create).
  IF NOT public.has_phenoid_entitlement(uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phenoid_tier_required');
  END IF;
  IF NOT public.has_pheno_tracker_entitlement(uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pheno_tracker_required');
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload -> 'candidates') <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  END IF;

  -- Idempotent replay.
  SELECT result INTO v_prev
    FROM public.phenoid_ingest_idempotency
   WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_prev || jsonb_build_object('reused', true);
  END IF;

  v_session  := coalesce(p_payload -> 'hunt' ->> 'phenoid_session_id', '');
  v_hunt_nm  := coalesce(nullif(p_payload -> 'hunt' ->> 'name', ''),
                         'PhenoID intake ' || v_session);
  v_location := coalesce(nullif(p_payload -> 'hunt' ->> 'location', ''), 'PhenoID intake');

  BEGIN
    -- Find-or-create the "PhenoID intake" grow / tent / hunt (idempotent by name).
    SELECT id INTO v_grow_id FROM public.grows
      WHERE user_id = uid AND name = 'PhenoID intake' AND is_archived = false
      ORDER BY created_at LIMIT 1;
    IF v_grow_id IS NULL THEN
      INSERT INTO public.grows (user_id, name) VALUES (uid, 'PhenoID intake')
        RETURNING id INTO v_grow_id;
    END IF;

    SELECT id INTO v_tent_id FROM public.tents
      WHERE user_id = uid AND grow_id = v_grow_id AND name = v_location
      ORDER BY created_at LIMIT 1;
    IF v_tent_id IS NULL THEN
      INSERT INTO public.tents (user_id, name, grow_id) VALUES (uid, v_location, v_grow_id)
        RETURNING id INTO v_tent_id;
    END IF;

    SELECT id INTO v_hunt_id FROM public.pheno_hunts
      WHERE user_id = uid AND grow_id = v_grow_id AND name = v_hunt_nm
      ORDER BY created_at LIMIT 1;
    IF v_hunt_id IS NULL THEN
      INSERT INTO public.pheno_hunts (user_id, grow_id, tent_id, name)
        VALUES (uid, v_grow_id, v_tent_id, v_hunt_nm)
        RETURNING id INTO v_hunt_id;
    END IF;

    -- Per candidate.
    FOR v_cand IN SELECT * FROM jsonb_array_elements(p_payload -> 'candidates') LOOP
      v_uuid := v_cand ->> 'phenoid_uuid';
      IF v_uuid IS NULL OR length(btrim(v_uuid)) = 0 THEN
        CONTINUE; -- a candidate with no stable id is skipped, not fatal
      END IF;

      -- Resolve an existing plant (re-import) via the add-on join.
      SELECT plant_id INTO v_plant_id
        FROM public.phenoid_candidate_extras
       WHERE user_id = uid AND phenoid_uuid = v_uuid;
      v_is_new := v_plant_id IS NULL;

      -- stage → round (mirrors phenoIdIngestMapping.stageToRound).
      v_round := CASE lower(btrim(coalesce(v_cand ->> 'stage', '')))
                   WHEN 'veg' THEN 'veg'
                   WHEN 'early flower' THEN 'early_flower'
                   WHEN 'flower' THEN 'mid_flower'
                   WHEN 'late flower' THEN 'late_flower'
                   WHEN 'flush' THEN 'late_flower'
                   WHEN 'dry' THEN 'post_cure'
                   ELSE 'mid_flower'
                 END;
      -- plants.stage vocabulary (seedling/veg/flower/flush/harvest/cure).
      v_pstage := CASE lower(btrim(coalesce(v_cand ->> 'stage', '')))
                    WHEN 'veg' THEN 'veg'
                    WHEN 'flush' THEN 'flush'
                    WHEN 'dry' THEN 'cure'
                    ELSE 'flower'
                  END;
      v_verdict  := lower(btrim(coalesce(v_cand ->> 'verdict', '')));
      v_decision := CASE v_verdict WHEN 'keep' THEN 'keep' WHEN 'maybe' THEN 'hold'
                                   WHEN 'cull' THEN 'cull' ELSE 'undecided' END;

      IF v_is_new THEN
        -- Identity: numeric label → candidate_number; else label + next number.
        IF (v_cand ->> 'plant_label') ~ '^\d+$' AND (v_cand ->> 'plant_label')::int > 0 THEN
          v_num := (v_cand ->> 'plant_label')::int; v_label := NULL;
        ELSE
          v_label := nullif(v_cand ->> 'plant_label', '');
          v_num := NULL;
        END IF;
        -- Collision / non-numeric → allocate max+1 within the hunt.
        IF v_num IS NULL OR EXISTS (
          SELECT 1 FROM public.plants
           WHERE pheno_hunt_id = v_hunt_id AND candidate_number = v_num
        ) THEN
          SELECT coalesce(max(candidate_number), 0) + 1 INTO v_num
            FROM public.plants WHERE pheno_hunt_id = v_hunt_id;
        END IF;

        INSERT INTO public.plants
          (user_id, name, grow_id, tent_id, pheno_hunt_id, candidate_number, candidate_label, stage)
        VALUES
          (uid, coalesce(v_label, 'Candidate ' || v_num), v_grow_id, v_tent_id,
           v_hunt_id, v_num, v_label, v_pstage)
        RETURNING id INTO v_plant_id;
        v_created := v_created + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;

      -- loud_traits: nose direct 0-10; other axes rescaled 1-5
      -- (rescale mirrors phenoIdIngestMapping.rescale0to10to1to5).
      v_loud := jsonb_strip_nulls(jsonb_build_object(
        'nose_loudness', (v_cand -> 'loud' ->> 'nose')::numeric,
        'resin',     CASE WHEN v_cand -> 'loud' ? 'resin'     THEN least(5, greatest(1, 1 + round(least(10, greatest(0, (v_cand -> 'loud' ->> 'resin')::numeric)) * 0.4))) END,
        'structure', CASE WHEN v_cand -> 'loud' ? 'structure' THEN least(5, greatest(1, 1 + round(least(10, greatest(0, (v_cand -> 'loud' ->> 'structure')::numeric)) * 0.4))) END,
        'yield',     CASE WHEN v_cand -> 'loud' ? 'yield'     THEN least(5, greatest(1, 1 + round(least(10, greatest(0, (v_cand -> 'loud' ->> 'yield')::numeric)) * 0.4))) END,
        'breeding',  CASE WHEN v_cand -> 'loud' ? 'breeding'  THEN least(5, greatest(1, 1 + round(least(10, greatest(0, (v_cand -> 'loud' ->> 'breeding')::numeric)) * 0.4))) END
      ));

      -- Core: score round (upsert), candidate scores (upsert), keeper decision (upsert).
      INSERT INTO public.pheno_score_rounds (user_id, hunt_id, plant_id, round, traits, loud_traits)
      VALUES (uid, v_hunt_id, v_plant_id, v_round,
              coalesce(v_cand -> 'traits', '{}'::jsonb), v_loud)
      ON CONFLICT (hunt_id, plant_id, round)
      DO UPDATE SET traits = excluded.traits, loud_traits = excluded.loud_traits;

      IF v_cand ? 'traits' AND jsonb_typeof(v_cand -> 'traits') = 'object' THEN
        INSERT INTO public.pheno_candidate_scores (user_id, hunt_id, plant_id, traits)
        VALUES (uid, v_hunt_id, v_plant_id, v_cand -> 'traits')
        ON CONFLICT (hunt_id, plant_id) DO UPDATE SET traits = excluded.traits;
      END IF;

      INSERT INTO public.pheno_keeper_decisions (user_id, hunt_id, plant_id, decision)
      VALUES (uid, v_hunt_id, v_plant_id, v_decision)
      ON CONFLICT (hunt_id, plant_id) DO UPDATE SET decision = excluded.decision;

      -- Add-on layer (upsert on phenoid_uuid) — nothing dropped.
      INSERT INTO public.phenoid_candidate_extras
        (user_id, hunt_id, plant_id, phenoid_uuid, winner_score,
         nose_score, resin_score, structure_score, yield_score, breeding_score,
         rating, scored_by, cut_status, loud_shortlist,
         pack_label, pack_index, pack_size, capture_mode, stack_id, frame_index,
         model_id, model_version)
      VALUES
        (uid, v_hunt_id, v_plant_id, v_uuid,
         nullif(v_cand ->> 'winner_score', '')::int,
         nullif(v_cand -> 'loud' ->> 'nose', '')::int,
         nullif(v_cand -> 'loud' ->> 'resin', '')::int,
         nullif(v_cand -> 'loud' ->> 'structure', '')::int,
         nullif(v_cand -> 'loud' ->> 'yield', '')::int,
         nullif(v_cand -> 'loud' ->> 'breeding', '')::int,
         nullif(v_cand ->> 'rating', '')::int,
         coalesce(v_cand ->> 'scored_by', ''),
         CASE lower(coalesce(v_cand ->> 'cut_status', 'none'))
           WHEN 'vault' THEN 'vault' WHEN 'flowering' THEN 'flowering'
           WHEN 'retired' THEN 'retired' ELSE 'none' END,
         coalesce((v_cand ->> 'loud_shortlist')::boolean, false),
         coalesce(v_cand -> 'pack' ->> 'label', ''),
         coalesce(nullif(v_cand -> 'pack' ->> 'index', '')::int, 0),
         coalesce(nullif(v_cand -> 'pack' ->> 'size', '')::int, 0),
         coalesce(nullif(v_cand -> 'capture' ->> 'mode', ''), 'standard'),
         coalesce(v_cand -> 'capture' ->> 'stack_id', ''),
         coalesce(nullif(v_cand -> 'capture' ->> 'frame_index', '')::int, 0),
         coalesce(v_cand -> 'capture' ->> 'model_id', ''),
         coalesce(v_cand -> 'capture' ->> 'model_version', ''))
      ON CONFLICT (user_id, phenoid_uuid) DO UPDATE SET
        winner_score = excluded.winner_score,
        nose_score = excluded.nose_score, resin_score = excluded.resin_score,
        structure_score = excluded.structure_score, yield_score = excluded.yield_score,
        breeding_score = excluded.breeding_score, rating = excluded.rating,
        scored_by = excluded.scored_by, cut_status = excluded.cut_status,
        loud_shortlist = excluded.loud_shortlist, pack_label = excluded.pack_label,
        pack_index = excluded.pack_index, pack_size = excluded.pack_size,
        capture_mode = excluded.capture_mode, stack_id = excluded.stack_id,
        frame_index = excluded.frame_index, model_id = excluded.model_id,
        model_version = excluded.model_version, updated_at = now();

      -- Mother → keeper (idempotent).
      IF coalesce((v_cand ->> 'mother_candidate')::boolean, false) THEN
        INSERT INTO public.pheno_keepers (user_id, hunt_id, source_plant_id, keeper_name)
        VALUES (uid, v_hunt_id, v_plant_id, coalesce(v_label, 'Candidate ' || v_num))
        ON CONFLICT (hunt_id, source_plant_id) DO NOTHING;
      END IF;

      -- Append-only surfaces: only on first import (avoid re-import dup spam).
      IF v_is_new THEN
        INSERT INTO public.pheno_keeper_decisions_log (user_id, hunt_id, plant_id, decision, reason)
        VALUES (uid, v_hunt_id, v_plant_id, v_decision,
                'Imported from PhenoID (verdict=' || coalesce(v_verdict, '') || ')');

        FOR v_tag IN SELECT jsonb_array_elements_text(coalesce(v_cand -> 'tags', '[]'::jsonb)) LOOP
          v_tnorm := lower(btrim(v_tag));
          IF v_tnorm IN ('herm', 'herms', 'nanner', 'nanners') THEN
            INSERT INTO public.pheno_sex_observations (user_id, hunt_id, plant_id, sex, herm_observed)
            VALUES (uid, v_hunt_id, v_plant_id, 'hermaphrodite', true);
          ELSIF v_tnorm IN ('foxtail', 'foxtailing', 'mold', 'mould', 'mold risk', 'pest', 'pests') THEN
            INSERT INTO public.pheno_stress_observations
              (user_id, hunt_id, plant_id, stress_factor, status, recommendation)
            VALUES (uid, v_hunt_id, v_plant_id,
                    CASE WHEN v_tnorm LIKE 'foxtail%' THEN 'foxtail'
                         WHEN v_tnorm LIKE 'mo%' THEN 'mold' ELSE 'pests' END,
                    'observed',
                    CASE v_verdict WHEN 'cull' THEN 'reject' WHEN 'maybe' THEN 'watch' ELSE 'keep' END);
          END IF;
        END LOOP;
      END IF;

      -- Photos → diary pheno_evidence_receipt (one row per photo).
      FOR v_photo IN SELECT * FROM jsonb_array_elements(coalesce(v_cand -> 'photos', '[]'::jsonb)) LOOP
        INSERT INTO public.diary_entries (user_id, grow_id, tent_id, plant_id, note, details, photo_url, entry_at)
        VALUES (uid, v_grow_id, v_tent_id, v_plant_id, '(PhenoID capture)',
                jsonb_build_object(
                  'kind', 'pheno_evidence_receipt', 'receipt_version', 1,
                  'source', 'phenoid', 'evidence_only', true,
                  'hunt_id', v_hunt_id::text, 'plant_id', v_plant_id::text,
                  'automatic_selection', false, 'action_queue_created', false,
                  'device_control', false),
                v_photo ->> 'storage_path',
                coalesce(nullif(v_photo ->> 'captured_at', '')::timestamptz, now()));
        UPDATE public.plants SET photo_url = coalesce(photo_url, v_photo ->> 'storage_path')
          WHERE id = v_plant_id;
      END LOOP;
    END LOOP;

    v_result := jsonb_build_object(
      'ok', true, 'hunt_id', v_hunt_id, 'grow_id', v_grow_id,
      'candidates_created', v_created, 'candidates_updated', v_updated);

    INSERT INTO public.phenoid_ingest_idempotency (user_id, idempotency_key, result)
    VALUES (uid, p_idempotency_key, v_result);
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent replay: another txn recorded the same key; return its result.
      SELECT result INTO v_prev FROM public.phenoid_ingest_idempotency
        WHERE user_id = uid AND idempotency_key = p_idempotency_key;
      IF FOUND THEN RETURN v_prev || jsonb_build_object('reused', true); END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'ingest_failed');
    WHEN OTHERS THEN
      -- Partial writes roll back to this block's savepoint. Log only SQLSTATE.
      RETURN jsonb_build_object('ok', false, 'reason', 'ingest_failed', 'sqlstate', SQLSTATE);
  END;

  RETURN v_result || jsonb_build_object('reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pheno_ingest(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pheno_ingest(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
