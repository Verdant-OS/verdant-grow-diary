-- =========================================================================
-- L2-H4B: Paddle event processing state table.
--
-- Adds an audit/replay table for already-recorded Paddle events. This table
-- records mapper/updater outcomes before any entitlement mutation exists.
--
-- Scope guard:
-- - No changes to public.paddle_events.
-- - No changes to public.billing_subscriptions.
-- - No webhook behavior changes.
-- - No checkout/live-mode changes.
-- - No entitlement writes.
-- - No grow/plant/tent/sensor/alert/action/AI writes.
-- =========================================================================

CREATE TABLE public.paddle_event_processing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id uuid NOT NULL UNIQUE REFERENCES public.paddle_events(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  environment text NOT NULL,
  status text NOT NULL CHECK (status IN ('processed', 'ignored', 'blocked', 'failed')),
  reason text NULL,
  candidate_plan_id text NULL CHECK (
    candidate_plan_id IS NULL OR candidate_plan_id IN ('free', 'pro_monthly', 'pro_annual', 'founder_lifetime')
  ),
  candidate_status text NULL CHECK (
    candidate_status IS NULL OR candidate_status IN ('active', 'past_due', 'canceled', 'paused', 'expired')
  ),
  provider_customer_id text NULL,
  provider_subscription_id text NULL,
  provider_price_id text NULL,
  current_period_end timestamptz NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  is_founder_candidate boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paddle_event_processing_event_id_not_blank CHECK (length(btrim(event_id)) > 0),
  CONSTRAINT paddle_event_processing_event_type_not_blank CHECK (length(btrim(event_type)) > 0),
  CONSTRAINT paddle_event_processing_environment_not_blank CHECK (length(btrim(environment)) > 0),
  CONSTRAINT paddle_event_processing_details_object CHECK (jsonb_typeof(details) = 'object')
);

-- Service-role only. No anon/authenticated grants. Client code MUST NOT read
-- or write this table. Service role bypasses RLS only inside trusted server
-- contexts.
REVOKE ALL ON TABLE public.paddle_event_processing FROM PUBLIC;
REVOKE ALL ON TABLE public.paddle_event_processing FROM anon;
REVOKE ALL ON TABLE public.paddle_event_processing FROM authenticated;
GRANT ALL ON TABLE public.paddle_event_processing TO service_role;

ALTER TABLE public.paddle_event_processing ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated => default-deny. Service role bypasses RLS.

CREATE INDEX idx_paddle_event_processing_status
  ON public.paddle_event_processing (status);

CREATE INDEX idx_paddle_event_processing_event_type
  ON public.paddle_event_processing (event_type);

CREATE INDEX idx_paddle_event_processing_processed_at
  ON public.paddle_event_processing (processed_at DESC);

CREATE INDEX idx_paddle_event_processing_provider_customer
  ON public.paddle_event_processing (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE INDEX idx_paddle_event_processing_provider_subscription
  ON public.paddle_event_processing (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
