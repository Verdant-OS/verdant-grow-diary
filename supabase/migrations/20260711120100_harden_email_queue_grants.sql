-- Trust-boundary hardening — Slice 1: restrict the pgmq email control-plane
-- to service_role only.
--
-- VULNERABILITY (live-verified): enqueue_email, read_email_batch, delete_email,
-- move_to_dlq and email_queue_dispatch are raw pgmq passthroughs with NO
-- authorization checks, yet EXECUTE was granted to anon (and authenticated).
-- That exposed the email infrastructure to unauthenticated callers:
--   - enqueue_email: inject arbitrary payloads -> spam/phishing from our domain
--   - read_email_batch: read queued messages -> recipient PII + unsubscribe /
--     verification tokens disclosed to anyone with the anon key
--   - delete_email / move_to_dlq: drop or divert queued mail (tampering)
--
-- SAFE TO TIGHTEN: both legitimate consumers use the service_role key —
-- supabase/functions/process-email-queue (createClient(url, SERVICE_ROLE_KEY))
-- and supabase/functions/auth-email-hook (same). No client path depends on
-- these grants. (email_queue_wake is a trigger function and is intentionally
-- left as-is.)

REVOKE ALL     ON FUNCTION public.enqueue_email(text, jsonb)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               TO service_role;

REVOKE ALL     ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE ALL     ON FUNCTION public.delete_email(text, bigint)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)               FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_email(text, bigint)               TO service_role;

REVOKE ALL     ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   TO service_role;

REVOKE ALL     ON FUNCTION public.email_queue_dispatch()                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                   FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.email_queue_dispatch()                   TO service_role;

NOTIFY pgrst, 'reload schema';
