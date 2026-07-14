-- Harden consent-evidence integrity on public.user_agreement_acceptances.
--
-- The table grants INSERT on all columns and its RLS INSERT policy only checks
-- ownership (auth.uid() = user_id), so a direct PostgREST insert could otherwise
-- store an arbitrary/backdated accepted_at or created_at — the load-bearing legal
-- evidence of WHEN consent was given. Force those timestamps to the server clock
-- on every client insert so the acceptance record is authoritative rather than
-- client-trusted. service_role is exempt so exceptional repair / migration /
-- backfill can still set explicit timestamps (mirrors the repo's other guard
-- triggers). Append-only design is unchanged: no UPDATE/DELETE for authenticated.
CREATE OR REPLACE FUNCTION public.set_agreement_acceptance_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.accepted_at := now();
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_agreement_acceptance_timestamps
  ON public.user_agreement_acceptances;
CREATE TRIGGER trg_set_agreement_acceptance_timestamps
  BEFORE INSERT ON public.user_agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.set_agreement_acceptance_timestamps();
