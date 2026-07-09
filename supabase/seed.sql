-- LOCAL-STACK PROD-PARITY GRANTS (seed.sql runs ONLY on `supabase db reset`
-- for local/preview stacks — it is never applied to the hosted project).
--
-- Why this exists: the hosted project (created 2026-05) is grandfathered on
-- Supabase's legacy default privileges, where anon/authenticated/service_role
-- receive DML grants on new public tables automatically and RLS is the real
-- guard. Fresh local stacks created by the current CLI ship the hardened
-- default ACL (no client DML on new tables), so a plain `db reset` leaves
-- ~36 app tables (plants, tents, diary_entries, profiles, ...) unreadable by
-- clients — which does not match production and blocks the runtime DB
-- security lanes. This seed restores the production GRANT baseline, then
-- re-applies the migrations' deliberate hardening revokes so those stay
-- authoritative.
--
-- If production is ever migrated to the hardened default posture, delete the
-- blanket grants below — the deny-list section should still match the
-- explicit REVOKEs in supabase/migrations/.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Re-apply deliberate hardening REVOKEs from migrations (keep in sync with
-- explicit `REVOKE ... ON [TABLE] public.<name>` statements in
-- supabase/migrations/ — service_role grants there remain in effect).
-- Existence-guarded: some hardened objects are dropped by later migrations.
DO $$
DECLARE
  obj text;
BEGIN
  FOREACH obj IN ARRAY ARRAY[
    'billing_subscription_update_audit',
    'pi_ingest_bridge_credentials_safe',
    'billing_customer_links',
    'paddle_event_processing'
  ] LOOP
    IF to_regclass('public.' || obj) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', obj
      );
    END IF;
  END LOOP;
END $$;
