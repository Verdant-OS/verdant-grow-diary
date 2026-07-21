CREATE TABLE public.ai_doctor_review_evidence_receipts (
  spend_id uuid PRIMARY KEY
    REFERENCES public.ai_credit_spends(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NULL,
  evidence jsonb NOT NULL
    CHECK (jsonb_typeof(evidence) = 'object')
    CHECK (evidence <> '{}'::jsonb)
    CHECK (evidence ->> 'schemaVersion' = '1')
    CHECK (octet_length(evidence::text) <= 65536),
  prompt_hmac_sha256 text NOT NULL
    CHECK (prompt_hmac_sha256 ~ '^hmac-sha256:[0-9a-f]{64}$'),
  prompt_hmac_key_id text NOT NULL
    CHECK (prompt_hmac_key_id ~ '^[A-Za-z0-9._:-]{1,80}$'),
  model_id text NOT NULL
    CHECK (model_id ~ '^[A-Za-z0-9._:/-]{1,160}$'),
  tool_schema_version text NOT NULL
    CHECK (tool_schema_version ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  prompt_contract_version text NOT NULL
    CHECK (prompt_contract_version ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

COMMENT ON TABLE public.ai_doctor_review_evidence_receipts IS
  'Insert-once, server-recorded safe context receipt for a validated AI Doctor review. It stores no raw prompt or provider payload.';
COMMENT ON COLUMN public.ai_doctor_review_evidence_receipts.evidence IS
  'Allowlisted structured context only; max 64 KiB. Prompt text is represented separately by its keyed HMAC-SHA-256 fingerprint.';
COMMENT ON COLUMN public.ai_doctor_review_evidence_receipts.session_id IS
  'Opaque client-generated correlation metadata only. It is intentionally not a foreign key or ownership proof.';

ALTER TABLE public.ai_doctor_review_evidence_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM anon;
REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM authenticated;
REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM service_role;
GRANT SELECT ON TABLE public.ai_doctor_review_evidence_receipts TO service_role;


CREATE OR REPLACE FUNCTION public.ai_doctor_finalize_review(
  p_expected_user_id uuid,
  p_spend_id uuid,
  p_result jsonb,
  p_evidence jsonb,
  p_prompt_hmac_sha256 text,
  p_prompt_hmac_key_id text,
  p_model_id text,
  p_tool_schema_version text,
  p_prompt_contract_version text,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_spend record;
  v_sidecar_feature text;
  v_sidecar_result jsonb;
  v_sidecar_found boolean := false;
  v_receipt record;
  v_receipt_found boolean := false;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'not_authorized');
  END IF;
  IF p_expected_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'user_id_required');
  END IF;
  IF p_spend_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_id_required');
  END IF;
  IF p_result IS NULL
     OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
     OR p_result = '{}'::jsonb
     OR octet_length(p_result::text) > 131072 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_result');
  END IF;
  IF p_evidence IS NULL
     OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
     OR p_evidence = '{}'::jsonb
     OR p_evidence ->> 'schemaVersion' IS DISTINCT FROM '1'
     OR octet_length(p_evidence::text) > 65536 THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_evidence');
  END IF;
  IF p_prompt_hmac_sha256 IS NULL OR p_prompt_hmac_sha256 !~ '^hmac-sha256:[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_prompt_fingerprint');
  END IF;
  IF p_prompt_hmac_key_id IS NULL OR p_prompt_hmac_key_id !~ '^[A-Za-z0-9._:-]{1,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_prompt_hmac_key_id');
  END IF;
  IF p_model_id IS NULL OR p_model_id !~ '^[A-Za-z0-9._:/-]{1,160}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_model');
  END IF;
  IF p_tool_schema_version IS NULL OR p_tool_schema_version !~ '^[A-Za-z0-9._:/-]{1,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_tool_schema_version');
  END IF;
  IF p_prompt_contract_version IS NULL OR p_prompt_contract_version !~ '^[A-Za-z0-9._:/-]{1,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'invalid_prompt_contract_version');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_expected_user_id::text));

  SELECT id, user_id, feature, status, refund_of, result
    INTO v_spend
    FROM public.ai_credit_spends
   WHERE id = p_spend_id
   LIMIT 1;

  IF NOT FOUND
     OR v_spend.user_id <> p_expected_user_id
     OR v_spend.status <> 'spent'
     OR v_spend.refund_of IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_not_finalizable');
  END IF;
  IF v_spend.feature <> 'ai_doctor_review' THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'feature_mismatch');
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.ai_credit_spends reversal
     WHERE reversal.refund_of = p_spend_id
       AND reversal.status = 'refunded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'spend_refunded');
  END IF;

  SELECT feature, result
    INTO v_sidecar_feature, v_sidecar_result
    FROM public.ai_credit_spend_results
   WHERE spend_id = p_spend_id;
  v_sidecar_found := FOUND;

  SELECT user_id, session_id, evidence, prompt_hmac_sha256, prompt_hmac_key_id, model_id,
         tool_schema_version, prompt_contract_version
    INTO v_receipt
    FROM public.ai_doctor_review_evidence_receipts
   WHERE spend_id = p_spend_id;
  v_receipt_found := FOUND;

  IF v_spend.result IS NOT NULL OR v_sidecar_found OR v_receipt_found THEN
    IF v_spend.result IS NOT NULL OR NOT v_sidecar_found OR NOT v_receipt_found THEN
      RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'atomic_pair_missing');
    END IF;
    IF v_sidecar_feature <> 'ai_doctor_review' OR v_sidecar_result <> p_result THEN
      RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'result_conflict');
    END IF;
    IF v_receipt.user_id <> p_expected_user_id
       OR v_receipt.session_id IS DISTINCT FROM p_session_id
       OR v_receipt.evidence <> p_evidence
       OR v_receipt.prompt_hmac_sha256 <> p_prompt_hmac_sha256
       OR v_receipt.prompt_hmac_key_id <> p_prompt_hmac_key_id
       OR v_receipt.model_id <> p_model_id
       OR v_receipt.tool_schema_version <> p_tool_schema_version
       OR v_receipt.prompt_contract_version <> p_prompt_contract_version THEN
      RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'receipt_conflict');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'replayed',
      'spend_id', p_spend_id,
      'feature', 'ai_doctor_review'
    );
  END IF;

  IF p_session_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.ai_doctor_review_evidence_receipts receipt
     WHERE receipt.user_id = p_expected_user_id
       AND receipt.session_id = p_session_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid', 'reason', 'session_conflict');
  END IF;

  INSERT INTO public.ai_credit_spend_results (spend_id, feature, result)
  VALUES (p_spend_id, 'ai_doctor_review', p_result);

  INSERT INTO public.ai_doctor_review_evidence_receipts (
    spend_id, user_id, session_id, evidence, prompt_hmac_sha256,
    prompt_hmac_key_id, model_id, tool_schema_version, prompt_contract_version
  ) VALUES (
    p_spend_id, p_expected_user_id, p_session_id, p_evidence, p_prompt_hmac_sha256,
    p_prompt_hmac_key_id, p_model_id, p_tool_schema_version, p_prompt_contract_version
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'recorded',
    'spend_id', p_spend_id,
    'feature', 'ai_doctor_review'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260719180000', 'ai_doctor_review_evidence_receipts', ARRAY['-- applied via lovable per-file chain'])
ON CONFLICT (version) DO NOTHING;