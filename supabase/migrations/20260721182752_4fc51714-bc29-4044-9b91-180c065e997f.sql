CREATE TABLE public.ai_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits int NOT NULL CHECK (credits <> 0 AND credits >= -100000 AND credits <= 100000),
  kind text NOT NULL DEFAULT 'grant' CHECK (kind IN ('grant', 'clawback')),
  sku text NOT NULL,
  paddle_transaction_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  reverses uuid NULL REFERENCES public.ai_credit_grants(id),
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_credit_grants_kind_sign
    CHECK ((kind = 'grant' AND credits > 0) OR (kind = 'clawback' AND credits < 0)),
  CONSTRAINT ai_credit_grants_clawback_has_parent
    CHECK ((kind = 'clawback' AND reverses IS NOT NULL)
        OR (kind = 'grant' AND reverses IS NULL))
);

CREATE UNIQUE INDEX ai_credit_grants_grant_txn_uq
  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'grant';
CREATE UNIQUE INDEX ai_credit_grants_clawback_txn_uq
  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'clawback';
CREATE INDEX ai_credit_grants_user_idx ON public.ai_credit_grants(user_id);

REVOKE ALL ON public.ai_credit_grants FROM anon, authenticated;
GRANT SELECT ON public.ai_credit_grants TO authenticated;
GRANT ALL ON public.ai_credit_grants TO service_role;

ALTER TABLE public.ai_credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_credit_grants_select_own"
  ON public.ai_credit_grants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.ai_credit_grants IS
  'Append-only ledger of purchased AI credit packs (and their claw-backs). Balance is derived (SUM of credits over unexpired rows), never a mutable counter. Written ONLY by the Paddle webhook via grant_lovable_credit_pack (service_role), idempotent on paddle_transaction_id. Consumed by ai_credit_spend as overflow ABOVE the monthly allowance (packs spent only once the included allowance is used).';

CREATE OR REPLACE FUNCTION public.grant_lovable_credit_pack(
  p_expected_user_id       uuid,
  p_paddle_transaction_id  text,
  p_credits                int,
  p_sku                    text,
  p_environment            text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id      uuid;
BEGIN
  IF p_expected_user_id IS NULL
     OR p_paddle_transaction_id IS NULL OR length(btrim(p_paddle_transaction_id)) = 0
     OR p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000
     OR p_sku IS NULL OR length(btrim(p_sku)) = 0
     OR p_environment NOT IN ('sandbox', 'live') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lovable_credit_pack_grant:' || p_paddle_transaction_id));

  SELECT id INTO v_existing_id
    FROM public.ai_credit_grants
   WHERE paddle_transaction_id = p_paddle_transaction_id AND kind = 'grant'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'idempotent', 'grant_id', v_existing_id);
  END IF;

  INSERT INTO public.ai_credit_grants
    (user_id, credits, kind, sku, paddle_transaction_id, environment, meta)
  VALUES
    (p_expected_user_id, p_credits, 'grant', p_sku, p_paddle_transaction_id, p_environment,
     jsonb_build_object('source', 'credit_pack'))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'granted', 'grant_id', v_new_id, 'credits', p_credits);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) TO service_role;