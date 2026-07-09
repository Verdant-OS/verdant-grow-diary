ALTER TABLE public.lovable_paddle_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','skipped','failed')),
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE public.lovable_paddle_events
  SET processing_status = CASE
    WHEN processed_ok THEN 'processed'
    WHEN skip_reason IS NOT NULL THEN 'skipped'
    ELSE 'received'
  END
  WHERE processing_status = 'received';

CREATE INDEX IF NOT EXISTS idx_lovable_paddle_events_status_retryable
  ON public.lovable_paddle_events(processing_status)
  WHERE processing_status IN ('received','failed');