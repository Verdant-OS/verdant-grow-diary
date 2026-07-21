-- Genetics & Propagation Traceability V1 — Slice 1
BEGIN;

CREATE TABLE public.genetics_mutation_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT genetics_mutation_idempotency_pkey PRIMARY KEY (user_id, operation, idempotency_key)
);

ALTER TABLE public.genetics_mutation_idempotency ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.genetics_mutation_idempotency TO authenticated;
GRANT ALL ON public.genetics_mutation_idempotency TO service_role;

CREATE POLICY genetics_mutation_idempotency_select_own
  ON public.genetics_mutation_idempotency
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.genetics_accessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind text NOT NULL DEFAULT 'unknown'
    CHECK (source_kind IN ('seed', 'clone', 'tissue_culture', 'unknown')),
  source_party text,
  cultivar_name text,
  line_name text,
  selection_id text,
  generation text,
  acquisition_date date,
  known_state text NOT NULL DEFAULT 'known'
    CHECK (known_state IN ('known', 'unknown', 'unassigned', 'not_applicable')),
  linked_keeper_id uuid REFERENCES public.pheno_keepers(id) ON DELETE SET NULL,
  linked_clone_id uuid REFERENCES public.pheno_keeper_clones(id) ON DELETE SET NULL,
  linked_cross_id uuid REFERENCES public.pheno_crosses(id) ON DELETE SET NULL,
  linked_plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.genetics_accessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.genetics_accessions TO authenticated;
GRANT ALL ON public.genetics_accessions TO service_role;

CREATE POLICY genetics_accessions_select_own
  ON public.genetics_accessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX genetics_accessions_user_id_idx
  ON public.genetics_accessions (user_id);
CREATE INDEX genetics_accessions_active_idx
  ON public.genetics_accessions (user_id, archived_at);
CREATE INDEX genetics_accessions_linked_plant_id_idx
  ON public.genetics_accessions (linked_plant_id) WHERE linked_plant_id IS NOT NULL;
CREATE INDEX genetics_accessions_linked_keeper_id_idx
  ON public.genetics_accessions (linked_keeper_id) WHERE linked_keeper_id IS NOT NULL;
CREATE INDEX genetics_accessions_linked_clone_id_idx
  ON public.genetics_accessions (linked_clone_id) WHERE linked_clone_id IS NOT NULL;
CREATE INDEX genetics_accessions_linked_cross_id_idx
  ON public.genetics_accessions (linked_cross_id) WHERE linked_cross_id IS NOT NULL;

CREATE TRIGGER genetics_accessions_set_updated_at
  BEFORE UPDATE ON public.genetics_accessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.genetics_accession_upsert(
  p_idempotency_key text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_accession_upsert';
  v_hash text := md5(coalesce(p_payload::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
  v_existing_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_source_kind text := coalesce(nullif(btrim(p_payload->>'source_kind'), ''), 'unknown');
  v_known_state text := coalesce(nullif(btrim(p_payload->>'known_state'), ''), 'known');
  v_linked_keeper uuid := nullif(p_payload->>'linked_keeper_id', '')::uuid;
  v_linked_clone uuid := nullif(p_payload->>'linked_clone_id', '')::uuid;
  v_linked_cross uuid := nullif(p_payload->>'linked_cross_id', '')::uuid;
  v_linked_plant uuid := nullif(p_payload->>'linked_plant_id', '')::uuid;
  v_acq date := nullif(p_payload->>'acquisition_date', '')::date;
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

  IF v_source_kind NOT IN ('seed', 'clone', 'tissue_culture', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_source_kind');
  END IF;
  IF v_known_state NOT IN ('known', 'unknown', 'unassigned', 'not_applicable') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_known_state');
  END IF;

  IF v_linked_keeper IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pheno_keepers WHERE id = v_linked_keeper AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'linked_keeper_id');
  END IF;
  IF v_linked_clone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pheno_keeper_clones WHERE id = v_linked_clone AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'linked_clone_id');
  END IF;
  IF v_linked_cross IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pheno_crosses WHERE id = v_linked_cross AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'linked_cross_id');
  END IF;
  IF v_linked_plant IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.plants WHERE id = v_linked_plant AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'linked_plant_id');
  END IF;

  BEGIN
    IF v_existing_id IS NOT NULL THEN
      UPDATE public.genetics_accessions SET
        source_kind = v_source_kind,
        source_party = nullif(btrim(p_payload->>'source_party'), ''),
        cultivar_name = nullif(btrim(p_payload->>'cultivar_name'), ''),
        line_name = nullif(btrim(p_payload->>'line_name'), ''),
        selection_id = nullif(btrim(p_payload->>'selection_id'), ''),
        generation = nullif(btrim(p_payload->>'generation'), ''),
        acquisition_date = v_acq,
        known_state = v_known_state,
        linked_keeper_id = v_linked_keeper,
        linked_clone_id = v_linked_clone,
        linked_cross_id = v_linked_cross,
        linked_plant_id = v_linked_plant,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        updated_at = now()
      WHERE id = v_existing_id AND user_id = uid
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'accession_not_found');
      END IF;
    ELSE
      INSERT INTO public.genetics_accessions (
        user_id, source_kind, source_party, cultivar_name, line_name, selection_id,
        generation, acquisition_date, known_state, linked_keeper_id, linked_clone_id,
        linked_cross_id, linked_plant_id, notes
      ) VALUES (
        uid, v_source_kind, nullif(btrim(p_payload->>'source_party'), ''),
        nullif(btrim(p_payload->>'cultivar_name'), ''), nullif(btrim(p_payload->>'line_name'), ''),
        nullif(btrim(p_payload->>'selection_id'), ''), nullif(btrim(p_payload->>'generation'), ''),
        v_acq, v_known_state, v_linked_keeper, v_linked_clone, v_linked_cross, v_linked_plant,
        nullif(btrim(p_payload->>'notes'), '')
      )
      RETURNING id INTO v_id;
    END IF;

    v_result := jsonb_build_object('ok', true, 'accession_id', v_id);

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

REVOKE ALL ON FUNCTION public.genetics_accession_upsert(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_accession_upsert(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.genetics_accession_archive(
  p_idempotency_key text,
  p_accession_id uuid,
  p_archived boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_accession_archive';
  v_hash text := md5(coalesce(p_accession_id::text, '') || ':' || coalesce(p_archived::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
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

  BEGIN
    UPDATE public.genetics_accessions
      SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
          updated_at = now()
      WHERE id = p_accession_id AND user_id = uid
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'accession_not_found');
    END IF;

    v_result := jsonb_build_object('ok', true, 'accession_id', v_id, 'archived', p_archived);

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

REVOKE ALL ON FUNCTION public.genetics_accession_archive(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_accession_archive(text, uuid, boolean) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';