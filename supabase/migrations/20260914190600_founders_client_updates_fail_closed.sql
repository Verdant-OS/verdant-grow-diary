-- Founder preferences are written only by the JWT-verified save-founder-prefs
-- service path. Clients must never UPDATE status, founder_number,
-- milestone_status, or bypass that path to edit preference columns.
BEGIN;

-- Table UPDATE revocation also removes existing column UPDATE privileges.
-- Own-row SELECT and service_role grants remain unchanged.
REVOKE UPDATE ON TABLE public.founders FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS founders_owner_update_prefs ON public.founders;

-- A restrictive policy also fails closed if a later migration accidentally
-- restores a broad client grant or permissive UPDATE policy. Trusted service
-- writes still support preferences and legitimate status/milestone changes.
DROP POLICY IF EXISTS founders_no_client_update ON public.founders;
CREATE POLICY founders_no_client_update ON public.founders
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Keep founders_guard_immutables_trg: founder_number, user_id and created_at
-- remain immutable even for service writes.
COMMIT;
