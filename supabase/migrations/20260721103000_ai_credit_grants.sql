-- =========================================================================
-- AI credit packs — PR1: grant ledger + idempotent grant RPC.
--
-- One-time purchased credit packs ($9/50, $19/150) ADD credits to a user's
-- balance. Grants CANNOT live in public.ai_credit_spends — that ledger's CHECK
-- constraints pin weight IN (1,5,-1,-5) and status IN ('spent','refunded'),
-- which structurally forbid a positive purchased-credit row. So packs get their
-- own append-only ledger here.
--
-- Append-only. No mutable counter. Balance is DERIVED (SUM over unexpired rows)
-- so idempotent replay and refund claw-back compose. This migration is INERT:
-- no consumer reads ai_credit_grants until the ai_credit_spend fold-in (PR2).
--
-- Security: server-authoritative. The client is NEVER trusted for "I paid" —
-- grants are written ONLY by the Paddle webhook (service_role) on a verified
-- transaction.completed, idempotent on the Paddle transaction id.
-- =========================================================================

CREATE TABLE public.ai_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Positive for a grant, negative for a claw-back. Bounded so a malformed
  -- webhook payload can never mint an unbounded balance.
  credits int NOT NULL CHECK (credits <> 0 AND credits >= -100000 AND credits <= 100000),
  kind text NOT NULL DEFAULT 'grant' CHECK (kind IN ('grant', 'clawback')),
  -- Human-readable pack SKU, e.g. 'credit_pack_50'.
  sku text NOT NULL,
  -- Idempotency anchor: the Paddle transaction that funded (or reversed) this row.
  paddle_transaction_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  -- Claw-back rows point at the grant they void (refund/chargeback), append-only.
  reverses uuid NULL REFERENCES public.ai_credit_grants(id),
  -- NULL = never expires (product default). A nullable column lets a future
  -- expiry policy ship without a schema change.
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_credit_grants_kind_sign
    CHECK ((kind = 'grant' AND credits > 0) OR (kind = 'clawback' AND credits < 0)),
  CONSTRAINT ai_credit_grants_clawback_has_parent
    CHECK ((kind = 'clawback' AND reverses IS NOT NULL)
        OR (kind = 'grant' AND reverses IS NULL))
);

-- Idempotency: at most one grant AND at most one claw-back per Paddle
-- transaction, so a webhook retry cannot double-grant or double-void.
CREATE UNIQUE INDEX ai_credit_grants_grant_txn_uq
  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'grant';
CREATE UNIQUE INDEX ai_credit_grants_clawback_txn_uq
  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'clawback';

-- Active-balance lookups (SUM over a user's unexpired rows).
CREATE INDEX ai_credit_grants_user_idx ON public.ai_credit_grants(user_id);

-- Grants. No anon. No client write path — service_role only (webhook).
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

-- =========================================================================
-- grant_lovable_credit_pack: idempotent, service-role-only credit-pack grant.
-- Called by the Paddle webhook on a verified one-time transaction.completed.
-- Returns jsonb: { ok:true, reason:'granted'|'idempotent', grant_id, credits? }
--                { ok:false, reason:'invalid_input' }
-- =========================================================================
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

  -- Serialize per-transaction so a concurrent retry returns 'idempotent'
  -- cleanly instead of tripping the unique index with an exception.
  PERFORM pg_advisory_xact_lock(hashtext('lovable_credit_pack_grant:' || p_paddle_transaction_id));

  -- Idempotent path: this Paddle transaction was already granted.
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
