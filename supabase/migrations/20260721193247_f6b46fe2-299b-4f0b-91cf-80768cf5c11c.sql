-- Genetics & Propagation Traceability V1 — Slice 2
BEGIN;

CREATE OR REPLACE FUNCTION public.genetics_lock_lineage(p_owner uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('genetics_lineage:' || p_owner::text));
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_lock_lineage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_lock_lineage(uuid) TO authenticated, service_role;

CREATE TABLE public.propagation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_code text NOT NULL,
  name text,
  propagation_method text NOT NULL DEFAULT 'unknown'
    CHECK (propagation_method IN ('seed', 'cutting', 'tissue_culture', 'division', 'unknown')),
  source_accession_id uuid REFERENCES public.genetics_accessions(id) ON DELETE SET NULL,
  mother_plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  origin_unknown boolean NOT NULL DEFAULT false,
  cut_date date,
  received_date date,
  started_date date,
  rooted_date date,
  initial_quantity int CHECK (initial_quantity >= 0),
  viable_quantity int CHECK (viable_quantity >= 0),
  counts_unknown boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'rooting', 'rooted', 'completed', 'failed', 'archived')),
  grow_id uuid REFERENCES public.grows(id) ON DELETE SET NULL,
  tent_id uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT propagation_batches_user_batch_code_key UNIQUE (user_id, batch_code),
  CONSTRAINT propagation_batches_viable_within_initial_chk CHECK (
    viable_quantity IS NULL OR initial_quantity IS NULL OR viable_quantity <= initial_quantity
  )
);

ALTER TABLE public.propagation_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.propagation_batches TO authenticated;
GRANT ALL ON public.propagation_batches TO service_role;

CREATE POLICY propagation_batches_select_own
  ON public.propagation_batches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX propagation_batches_user_id_idx ON public.propagation_batches (user_id);
CREATE INDEX propagation_batches_source_accession_id_idx
  ON public.propagation_batches (source_accession_id) WHERE source_accession_id IS NOT NULL;
CREATE INDEX propagation_batches_mother_plant_id_idx
  ON public.propagation_batches (mother_plant_id) WHERE mother_plant_id IS NOT NULL;
CREATE INDEX propagation_batches_grow_id_idx
  ON public.propagation_batches (grow_id) WHERE grow_id IS NOT NULL;

CREATE TRIGGER propagation_batches_set_updated_at
  BEFORE UPDATE ON public.propagation_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.propagation_batch_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.propagation_batches(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.propagation_batch_status_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.propagation_batch_status_events TO authenticated;
GRANT ALL ON public.propagation_batch_status_events TO service_role;

CREATE POLICY propagation_batch_status_events_select_own
  ON public.propagation_batch_status_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX propagation_batch_status_events_batch_id_idx
  ON public.propagation_batch_status_events (batch_id, changed_at DESC);
CREATE INDEX propagation_batch_status_events_user_id_idx
  ON public.propagation_batch_status_events (user_id);

CREATE OR REPLACE FUNCTION public.genetics_batch_upsert(
  p_idempotency_key text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_batch_upsert';
  v_hash text := md5(coalesce(p_payload::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
  v_existing_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_batch_code text := nullif(btrim(p_payload->>'batch_code'), '');
  v_method text := coalesce(nullif(btrim(p_payload->>'propagation_method'), ''), 'unknown');
  v_status text := coalesce(nullif(btrim(p_payload->>'status'), ''), 'planned');
  v_source_accession uuid := nullif(p_payload->>'source_accession_id', '')::uuid;
  v_mother_plant uuid := nullif(p_payload->>'mother_plant_id', '')::uuid;
  v_grow uuid := nullif(p_payload->>'grow_id', '')::uuid;
  v_tent uuid := nullif(p_payload->>'tent_id', '')::uuid;
  v_initial int := nullif(p_payload->>'initial_quantity', '')::int;
  v_viable int := nullif(p_payload->>'viable_quantity', '')::int;
  v_old_status text;
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

  PERFORM public.genetics_lock_lineage(uid);

  IF v_batch_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_required');
  END IF;
  IF v_method NOT IN ('seed', 'cutting', 'tissue_culture', 'division', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_propagation_method');
  END IF;
  IF v_status NOT IN ('planned', 'active', 'rooting', 'rooted', 'completed', 'failed', 'archived') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  IF v_initial IS NOT NULL AND v_initial < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;
  IF v_viable IS NOT NULL AND v_viable < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;
  IF v_viable IS NOT NULL AND v_initial IS NOT NULL AND v_viable > v_initial THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'viable_exceeds_initial');
  END IF;

  IF v_source_accession IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.genetics_accessions WHERE id = v_source_accession AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'source_accession_id');
  END IF;
  IF v_mother_plant IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.plants WHERE id = v_mother_plant AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'mother_plant_id');
  END IF;
  IF v_grow IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.grows WHERE id = v_grow AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'grow_id');
  END IF;
  IF v_tent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tents WHERE id = v_tent AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'tent_id');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.propagation_batches
    WHERE user_id = uid AND batch_code = v_batch_code
      AND (v_existing_id IS NULL OR id <> v_existing_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_exists');
  END IF;

  BEGIN
    IF v_existing_id IS NOT NULL THEN
      SELECT status INTO v_old_status FROM public.propagation_batches
        WHERE id = v_existing_id AND user_id = uid;
      IF v_old_status IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'batch_not_found');
      END IF;
      UPDATE public.propagation_batches SET
        batch_code = v_batch_code,
        name = nullif(btrim(p_payload->>'name'), ''),
        propagation_method = v_method,
        source_accession_id = v_source_accession,
        mother_plant_id = v_mother_plant,
        origin_unknown = coalesce((p_payload->>'origin_unknown')::boolean, false),
        cut_date = nullif(p_payload->>'cut_date', '')::date,
        received_date = nullif(p_payload->>'received_date', '')::date,
        started_date = nullif(p_payload->>'started_date', '')::date,
        rooted_date = nullif(p_payload->>'rooted_date', '')::date,
        initial_quantity = v_initial,
        viable_quantity = v_viable,
        counts_unknown = coalesce((p_payload->>'counts_unknown')::boolean, false),
        status = v_status,
        grow_id = v_grow,
        tent_id = v_tent,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        updated_at = now()
      WHERE id = v_existing_id AND user_id = uid
      RETURNING id INTO v_id;
      IF v_old_status IS DISTINCT FROM v_status THEN
        INSERT INTO public.propagation_batch_status_events (user_id, batch_id, from_status, to_status, reason)
        VALUES (uid, v_id, v_old_status, v_status, nullif(btrim(p_payload->>'status_reason'), ''));
      END IF;
    ELSE
      INSERT INTO public.propagation_batches (
        user_id, batch_code, name, propagation_method, source_accession_id, mother_plant_id,
        origin_unknown, cut_date, received_date, started_date, rooted_date, initial_quantity,
        viable_quantity, counts_unknown, status, grow_id, tent_id, notes
      ) VALUES (
        uid, v_batch_code, nullif(btrim(p_payload->>'name'), ''), v_method, v_source_accession, v_mother_plant,
        coalesce((p_payload->>'origin_unknown')::boolean, false),
        nullif(p_payload->>'cut_date', '')::date, nullif(p_payload->>'received_date', '')::date,
        nullif(p_payload->>'started_date', '')::date, nullif(p_payload->>'rooted_date', '')::date,
        v_initial, v_viable, coalesce((p_payload->>'counts_unknown')::boolean, false),
        v_status, v_grow, v_tent, nullif(btrim(p_payload->>'notes'), '')
      )
      RETURNING id INTO v_id;
      INSERT INTO public.propagation_batch_status_events (user_id, batch_id, from_status, to_status, reason)
      VALUES (uid, v_id, NULL, v_status, 'batch_created');
    END IF;

    v_result := jsonb_build_object('ok', true, 'batch_id', v_id);

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
    ELSIF v_constraint = 'propagation_batches_user_batch_code_key' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_exists');
    END IF;
    RAISE;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_batch_upsert(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_batch_upsert(text, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';