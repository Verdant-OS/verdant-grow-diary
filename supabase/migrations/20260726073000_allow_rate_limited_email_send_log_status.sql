-- Forward-only repair for process-email-queue rate-limit audit rows.
--
-- The worker records upstream 429 responses separately from ordinary send
-- failures because they pause the whole queue and preserve messages for a
-- later retry. The original published constraint predates that distinct
-- `rate_limited` status, so those audit inserts were rejected.

ALTER TABLE public.email_send_log
  DROP CONSTRAINT IF EXISTS email_send_log_status_check;

ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_status_check
  CHECK (
    status IN (
      'pending',
      'sent',
      'suppressed',
      'failed',
      'bounced',
      'complained',
      'dlq',
      'rate_limited'
    )
  );
