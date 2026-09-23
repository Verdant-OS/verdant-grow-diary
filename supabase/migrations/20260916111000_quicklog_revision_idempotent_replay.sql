-- Confirmation can be lost after a correction/retraction commits. Keep one
-- receipt per owner and logical request, atomically with the original mutation.
-- Legacy signatures remain unchanged; new clients always send the required key
-- to these additive overloads. Never fall back to the unkeyed RPC on ambiguity.
BEGIN;

CREATE TABLE public.quicklog_revision_idempotency (
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request JSONB NOT NULL,
  receipt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
ALTER TABLE public.quicklog_revision_idempotency ENABLE ROW LEVEL SECURITY;
-- Internal receipt store: no client policies or table grants.
REVOKE ALL ON public.quicklog_revision_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.quicklog_revision_idempotency TO service_role;

CREATE FUNCTION public.quicklog_revision_apply_once(
  p_idempotency_key TEXT,
  p_kind TEXT,
  p_reason_code TEXT,
  p_changes JSONB,
  p_grow_event_id UUID,
  p_diary_entry_id UUID,
  p_reason_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid UUID := auth.uid();
  v_request JSONB;
  v_prior public.quicklog_revision_idempotency%ROWTYPE;
  v_receipt JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('correction', 'retraction') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
  END IF;
  v_request := jsonb_build_object(
    'kind', p_kind, 'reason_code', p_reason_code, 'changes', p_changes,
    'grow_event_id', p_grow_event_id, 'diary_entry_id', p_diary_entry_id,
    'reason_note', p_reason_note
  );
  -- A collision can only serialize unrelated requests; identity is checked
  -- against the complete owner/key/request tuple below. Lock precedes both
  -- receipt lookup and the existing root-locking mutation.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'quicklog-revision:' || uid::text || ':' || p_idempotency_key, 0
  ));
  SELECT * INTO v_prior
    FROM public.quicklog_revision_idempotency
   WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prior.request IS DISTINCT FROM v_request THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
    END IF;
    RETURN v_prior.receipt || jsonb_build_object('reused', true);
  END IF;

  -- Explicit named arguments select the existing unkeyed signatures. Their
  -- auth.uid(), owner/root locks, validation, mirror updates and audit remain
  -- authoritative. No caller-supplied user id and no copy of the mutation body.
  IF p_kind = 'correction' THEN
    v_receipt := public.quicklog_correct_entry(
      p_reason_code => p_reason_code, p_changes => p_changes,
      p_grow_event_id => p_grow_event_id, p_diary_entry_id => p_diary_entry_id,
      p_reason_note => p_reason_note
    );
  ELSE
    v_receipt := public.quicklog_retract_entry(
      p_reason_code => p_reason_code, p_grow_event_id => p_grow_event_id,
      p_diary_entry_id => p_diary_entry_id, p_reason_note => p_reason_note
    );
  END IF;
  IF v_receipt ->> 'ok' = 'true' THEN
    INSERT INTO public.quicklog_revision_idempotency (user_id, idempotency_key, request, receipt)
    VALUES (uid, p_idempotency_key, v_request, v_receipt);
  END IF;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.quicklog_revision_apply_once(TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.quicklog_correct_entry(
  p_idempotency_key TEXT,
  p_reason_code TEXT,
  p_changes JSONB,
  p_grow_event_id UUID DEFAULT NULL,
  p_diary_entry_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.quicklog_revision_apply_once(
    p_idempotency_key, 'correction', p_reason_code, p_changes,
    p_grow_event_id, p_diary_entry_id, p_reason_note
  );
$$;
REVOKE ALL ON FUNCTION public.quicklog_correct_entry(TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quicklog_correct_entry(TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  TO authenticated, service_role;

CREATE FUNCTION public.quicklog_retract_entry(
  p_idempotency_key TEXT,
  p_reason_code TEXT,
  p_grow_event_id UUID DEFAULT NULL,
  p_diary_entry_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.quicklog_revision_apply_once(
    p_idempotency_key, 'retraction', p_reason_code, NULL,
    p_grow_event_id, p_diary_entry_id, p_reason_note
  );
$$;
REVOKE ALL ON FUNCTION public.quicklog_retract_entry(TEXT, TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quicklog_retract_entry(TEXT, TEXT, UUID, UUID, TEXT)
  TO authenticated, service_role;

COMMIT;
