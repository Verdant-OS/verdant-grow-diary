-- =========================================================================
-- L2-H4D-0: Billing customer link foundation.
--
-- Creates the server-owned attribution layer between a Verdant user and
-- external billing provider identifiers. This is a foundation only: no checkout
-- wiring, no webhook updater wiring, and no entitlement mutation.
--
-- Safety posture:
-- - Writes are service-role only.
-- - Client roles get no direct table access.
-- - Read visibility is via sanitized RPCs only.
-- - External provider identifiers are never returned by the RPCs.
-- - public.billing_subscriptions is not read or written here.
-- =========================================================================

CREATE TABLE public.billing_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('paddle')),
  provider_customer_id text NOT NULL,
  provider_subscription_id text NULL,
  provider_checkout_id text NULL,
  link_status text NOT NULL DEFAULT 'linked'
    CHECK (link_status IN ('linked', 'pending_review', 'blocked', 'inactive')),
  link_source text NOT NULL DEFAULT 'unknown'
    CHECK (link_source IN ('checkout', 'webhook', 'operator', 'import', 'unknown')),
  confidence text NOT NULL DEFAULT 'verified'
    CHECK (confidence IN ('verified', 'review_required', 'blocked')),
  last_paddle_event_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_customer_links_provider_customer_not_blank CHECK (length(btrim(provider_customer_id)) > 0),
  CONSTRAINT billing_customer_links_provider_subscription_not_blank CHECK (
    provider_subscription_id IS NULL OR length(btrim(provider_subscription_id)) > 0
  ),
  CONSTRAINT billing_customer_links_provider_checkout_not_blank CHECK (
    provider_checkout_id IS NULL OR length(btrim(provider_checkout_id)) > 0
  ),
  CONSTRAINT billing_customer_links_last_event_not_blank CHECK (
    last_paddle_event_id IS NULL OR length(btrim(last_paddle_event_id)) > 0
  )
);

COMMENT ON TABLE public.billing_customer_links IS
  'Server-owned attribution layer between auth.users and billing provider customer/subscription identifiers. No entitlement grant is implied.';
COMMENT ON COLUMN public.billing_customer_links.link_status IS
  'Link state only. Does not grant paid access.';
COMMENT ON COLUMN public.billing_customer_links.confidence IS
  'Attribution confidence only. Entitlements still require a separate reviewed updater.';

CREATE UNIQUE INDEX billing_customer_links_provider_customer_uniq
  ON public.billing_customer_links (provider, provider_customer_id);

CREATE UNIQUE INDEX billing_customer_links_provider_subscription_uniq
  ON public.billing_customer_links (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX billing_customer_links_provider_checkout_uniq
  ON public.billing_customer_links (provider, provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

CREATE INDEX billing_customer_links_user_created_idx
  ON public.billing_customer_links (user_id, created_at DESC);

CREATE INDEX billing_customer_links_status_idx
  ON public.billing_customer_links (link_status, confidence);

REVOKE ALL ON TABLE public.billing_customer_links FROM PUBLIC;
REVOKE ALL ON TABLE public.billing_customer_links FROM anon;
REVOKE ALL ON TABLE public.billing_customer_links FROM authenticated;
GRANT ALL ON TABLE public.billing_customer_links TO service_role;

ALTER TABLE public.billing_customer_links ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. Service role writes only inside trusted server contexts.

DROP TRIGGER IF EXISTS billing_customer_links_set_updated_at ON public.billing_customer_links;
CREATE TRIGGER billing_customer_links_set_updated_at
  BEFORE UPDATE ON public.billing_customer_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.billing_customer_link_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_counts jsonb;
  v_providers jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'linked', COUNT(*) FILTER (WHERE link_status = 'linked'),
    'pending_review', COUNT(*) FILTER (WHERE link_status = 'pending_review'),
    'blocked', COUNT(*) FILTER (WHERE link_status = 'blocked'),
    'inactive', COUNT(*) FILTER (WHERE link_status = 'inactive'),
    'verified', COUNT(*) FILTER (WHERE confidence = 'verified'),
    'review_required', COUNT(*) FILTER (WHERE confidence = 'review_required')
  )
  INTO v_counts
  FROM public.billing_customer_links
  WHERE user_id = auth.uid();

  SELECT COALESCE(jsonb_agg(DISTINCT provider), '[]'::jsonb)
  INTO v_providers
  FROM public.billing_customer_links
  WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'providers', v_providers,
    'counts', v_counts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_customer_link_operator_audit(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_counts jsonb;
  v_latest jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'linked', COUNT(*) FILTER (WHERE link_status = 'linked'),
    'pending_review', COUNT(*) FILTER (WHERE link_status = 'pending_review'),
    'blocked', COUNT(*) FILTER (WHERE link_status = 'blocked'),
    'inactive', COUNT(*) FILTER (WHERE link_status = 'inactive'),
    'verified', COUNT(*) FILTER (WHERE confidence = 'verified'),
    'review_required', COUNT(*) FILTER (WHERE confidence = 'review_required'),
    'blocked_confidence', COUNT(*) FILTER (WHERE confidence = 'blocked')
  )
  INTO v_counts
  FROM public.billing_customer_links;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_latest
  FROM (
    SELECT
      created_at,
      jsonb_build_object(
        'created_at', created_at,
        'updated_at', updated_at,
        'provider', provider,
        'link_status', link_status,
        'link_source', link_source,
        'confidence', confidence,
        'has_customer_id', provider_customer_id IS NOT NULL,
        'has_subscription_id', provider_subscription_id IS NOT NULL,
        'has_checkout_id', provider_checkout_id IS NOT NULL,
        'has_event_reference', last_paddle_event_id IS NOT NULL
      ) AS row_json
    FROM public.billing_customer_links
    ORDER BY created_at DESC
    LIMIT v_limit
  ) safe_rows;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'limit', v_limit,
    'counts', v_counts,
    'latest', v_latest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_customer_link_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_customer_link_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_customer_link_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.billing_customer_link_operator_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_customer_link_operator_audit(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.billing_customer_link_operator_audit(integer) TO authenticated;
