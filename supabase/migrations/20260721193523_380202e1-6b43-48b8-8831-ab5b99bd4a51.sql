BEGIN;

CREATE TABLE public.genetics_screening_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('accession', 'batch', 'plant')),
  subject_id uuid NOT NULL,
  target text NOT NULL CHECK (target = btrim(target) AND target <> ''),
  result text NOT NULL CHECK (result IN ('positive', 'negative', 'inconclusive', 'not_tested')),
  sample_reference text,
  laboratory text,
  collected_date date,
  result_date date,
  evidence_reference text,
  supersedes_id uuid REFERENCES public.genetics_screening_results(id) ON DELETE SET NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT genetics_screening_results_date_order_chk CHECK (
    collected_date IS NULL OR result_date IS NULL OR collected_date <= result_date
  )
);

ALTER TABLE public.genetics_screening_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.genetics_screening_results TO authenticated;
GRANT ALL ON public.genetics_screening_results TO service_role;

CREATE POLICY genetics_screening_results_select_own
  ON public.genetics_screening_results
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX genetics_screening_results_user_id_idx
  ON public.genetics_screening_results (user_id);
CREATE INDEX genetics_screening_results_subject_idx
  ON public.genetics_screening_results (subject_type, subject_id);
CREATE INDEX genetics_screening_results_current_idx
  ON public.genetics_screening_results (subject_type, subject_id, target, collected_date DESC);
CREATE INDEX genetics_screening_results_supersedes_idx
  ON public.genetics_screening_results (supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.genetics_screening_record(
  p_idempotency_key text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_screening_record';
  v_hash text := md5(coalesce(p_payload::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
  v_subject_type text := btrim(p_payload->>'subject_type');
  v_subject_id uuid := nullif(p_payload->>'subject_id', '')::uuid;
  v_target text := lower(btrim(coalesce(p_payload->>'target', '')));
  v_result_value text := btrim(p_payload->>'result');
  v_collected date := nullif(p_payload->>'collected_date', '')::date;
  v_result_date date := nullif(p_payload->>'result_date', '')::date;
  v_supersedes uuid := nullif(p_payload->>'supersedes_id', '')::uuid;
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
  IF v_result_value NOT IN ('positive', 'negative', 'inconclusive', 'not_tested') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_result');
  END IF;
  IF v_collected IS NOT NULL AND v_collected > current_date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'collected_date_in_future');
  END IF;
  IF v_result_date IS NOT NULL AND v_result_date > current_date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'result_date_in_future');
  END IF;
  IF v_collected IS NOT NULL AND v_result_date IS NOT NULL AND v_collected > v_result_date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'collected_after_result');
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

  IF v_supersedes IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.genetics_screening_results
    WHERE id = v_supersedes AND user_id = uid
      AND subject_type = v_subject_type AND subject_id = v_subject_id AND target = v_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'supersedes_invalid');
  END IF;

  BEGIN
    INSERT INTO public.genetics_screening_results (
      user_id, subject_type, subject_id, target, result, sample_reference, laboratory,
      collected_date, result_date, evidence_reference, supersedes_id, recorded_by
    ) VALUES (
      uid, v_subject_type, v_subject_id, v_target, v_result_value,
      nullif(btrim(p_payload->>'sample_reference'), ''), nullif(btrim(p_payload->>'laboratory'), ''),
      v_collected, v_result_date, nullif(btrim(p_payload->>'evidence_reference'), ''),
      v_supersedes, uid
    )
    RETURNING id INTO v_id;

    v_result := jsonb_build_object('ok', true, 'screening_id', v_id);

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

REVOKE ALL ON FUNCTION public.genetics_screening_record(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_screening_record(text, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';