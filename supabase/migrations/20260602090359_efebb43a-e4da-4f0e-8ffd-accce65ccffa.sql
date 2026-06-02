CREATE TABLE public.paddle_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Service-role only: no anon/authenticated grants. Client code MUST NOT read or write this table.
GRANT ALL ON public.paddle_events TO service_role;

ALTER TABLE public.paddle_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated => default-deny. Service role bypasses RLS.

CREATE INDEX idx_paddle_events_event_type ON public.paddle_events (event_type);
CREATE INDEX idx_paddle_events_received_at ON public.paddle_events (received_at DESC);