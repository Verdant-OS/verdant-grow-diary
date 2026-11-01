ALTER TABLE public.subscriptions ADD COLUMN billing_provider text NOT NULL DEFAULT 'paddle', ADD COLUMN stripe_subscription_id text, ADD COLUMN stripe_customer_id text;
ALTER TABLE public.subscriptions ALTER COLUMN paddle_subscription_id DROP NOT NULL, ALTER COLUMN paddle_customer_id DROP NOT NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_check CHECK (billing_provider IN ('paddle','stripe')), ADD CONSTRAINT subscriptions_provider_identity_check CHECK ((billing_provider='paddle' AND paddle_subscription_id IS NOT NULL AND paddle_customer_id IS NOT NULL) OR (billing_provider='stripe' AND stripe_subscription_id IS NOT NULL AND stripe_customer_id IS NOT NULL AND price_id <> 'founder_lifetime'));
CREATE UNIQUE INDEX subscriptions_stripe_identity ON public.subscriptions(environment,stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE TABLE public.stripe_payment_receipts (environment text NOT NULL CHECK(environment IN ('sandbox','live')), payment_id text NOT NULL, user_id uuid NOT NULL, price_id text NOT NULL, status text NOT NULL CHECK(status IN ('paid','refunded')), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(environment,payment_id));
GRANT SELECT ON public.stripe_payment_receipts TO authenticated;
GRANT ALL ON public.stripe_payment_receipts TO service_role;
ALTER TABLE public.stripe_payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_receipts_owner_read ON public.stripe_payment_receipts FOR SELECT TO authenticated USING(auth.uid()=user_id);
ALTER TABLE public.ai_credit_grants DROP CONSTRAINT ai_credit_grants_source_check, DROP CONSTRAINT ai_credit_grants_idempotency_anchor;
ALTER TABLE public.ai_credit_grants ADD CONSTRAINT ai_credit_grants_source_check CHECK(source IN ('credit_pack','stripe_credit_pack','referral','bonus')), ADD CONSTRAINT ai_credit_grants_idempotency_anchor CHECK ((source='credit_pack' AND paddle_transaction_id IS NOT NULL AND grant_ref IS NULL) OR (source IN ('stripe_credit_pack','referral','bonus') AND grant_ref IS NOT NULL AND paddle_transaction_id IS NULL));
CREATE OR REPLACE FUNCTION public.stripe_record_credit_payment(p_environment text,p_payment_id text,p_user_id uuid,p_price_id text,p_refunded boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_credits integer; v_parent public.ai_credit_grants; v_ref text; v_status text;
BEGIN
IF p_environment NOT IN ('sandbox','live') OR p_payment_id !~ '^pi_[A-Za-z0-9]+$' OR p_user_id IS NULL THEN RAISE EXCEPTION 'Invalid Stripe payment'; END IF;
v_credits:=CASE p_price_id WHEN 'credit_pack_50' THEN 50 WHEN 'credit_pack_150' THEN 150 ELSE NULL END;
IF v_credits IS NULL THEN RAISE EXCEPTION 'Unknown credit pack'; END IF;
v_ref:=p_environment||':'||p_payment_id;
PERFORM pg_advisory_xact_lock(hashtextextended('stripe:'||v_ref,0));
SELECT status INTO v_status FROM public.stripe_payment_receipts WHERE environment=p_environment AND payment_id=p_payment_id;
IF EXISTS(SELECT 1 FROM public.stripe_payment_receipts WHERE environment=p_environment AND payment_id=p_payment_id AND (user_id<>p_user_id OR price_id<>p_price_id)) THEN RAISE EXCEPTION 'Payment identity conflict'; END IF;
INSERT INTO public.stripe_payment_receipts(environment,payment_id,user_id,price_id,status) VALUES(p_environment,p_payment_id,p_user_id,p_price_id,CASE WHEN p_refunded THEN 'refunded' ELSE 'paid' END) ON CONFLICT(environment,payment_id) DO UPDATE SET status=CASE WHEN stripe_payment_receipts.status='refunded' OR p_refunded THEN 'refunded' ELSE 'paid' END,updated_at=now();
IF NOT p_refunded AND v_status IS DISTINCT FROM 'refunded' THEN
INSERT INTO public.ai_credit_grants(user_id,credits,kind,sku,source,grant_ref,environment) VALUES(p_user_id,v_credits,'grant',p_price_id,'stripe_credit_pack',v_ref,p_environment) ON CONFLICT DO NOTHING;
END IF;
IF p_refunded THEN
SELECT * INTO v_parent FROM public.ai_credit_grants WHERE source='stripe_credit_pack' AND grant_ref=v_ref AND kind='grant';
IF FOUND AND NOT EXISTS(SELECT 1 FROM public.ai_credit_grants WHERE reverses=v_parent.id) THEN
INSERT INTO public.ai_credit_grants(user_id,credits,kind,sku,source,grant_ref,environment,reverses) VALUES(p_user_id,-v_parent.credits,'clawback',p_price_id,'stripe_credit_pack',v_ref,p_environment,v_parent.id);
END IF;
END IF;
END; $$;
REVOKE ALL ON FUNCTION public.stripe_record_credit_payment(text,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_record_credit_payment(text,text,uuid,text,boolean) TO service_role;
COMMENT ON COLUMN public.subscriptions.billing_provider IS 'Provider discriminator; existing Paddle identities remain unchanged. Stripe test rows never grant live access.';