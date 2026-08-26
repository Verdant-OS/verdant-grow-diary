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

-- Public support forms are insert-only for visitors. Attribution, generated
-- fields, attachments, and operator review state are not client-supplied.
-- Reapply the migration's exact production ACLs after the blanket local grant.
DO $$
BEGIN
  IF to_regclass('public.customer_feedback') IS NOT NULL
     AND to_regclass('public.contact_messages') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE public.customer_feedback
      FROM PUBLIC, anon, authenticated;
    REVOKE ALL PRIVILEGES ON TABLE public.contact_messages
      FROM PUBLIC, anon, authenticated;
    REVOKE ALL PRIVILEGES (reviewed_at, reviewed_by, admin_notes)
      ON TABLE public.customer_feedback FROM PUBLIC, anon, authenticated;
    REVOKE ALL PRIVILEGES (reviewed_at, reviewed_by, admin_notes)
      ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated;

    GRANT INSERT (
      overall_rating,
      ai_doctor_rating,
      sensors_rating,
      quicklog_rating,
      trust_rating,
      whats_working,
      whats_friction,
      one_improvement,
      grow_context,
      contact_email,
      follow_up_ok,
      user_agent
    ) ON public.customer_feedback TO anon, authenticated;

    GRANT INSERT (
      name,
      email,
      category,
      message,
      grow_context,
      user_agent
    ) ON public.contact_messages TO anon, authenticated;

    GRANT SELECT ON public.customer_feedback TO authenticated;
    GRANT SELECT ON public.contact_messages TO authenticated;
    GRANT UPDATE (reviewed_at, reviewed_by, admin_notes)
      ON public.customer_feedback TO authenticated;
    GRANT UPDATE (reviewed_at, reviewed_by, admin_notes)
      ON public.contact_messages TO authenticated;
    GRANT ALL ON public.customer_feedback TO service_role;
    GRANT ALL ON public.contact_messages TO service_role;
  END IF;
END $$;

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
    'paddle_event_processing',
    'lovable_paddle_events'
  ] LOOP
    IF to_regclass('public.' || obj) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', obj
      );
    END IF;
  END LOOP;
END $$;

-- lead_events grants SELECT/INSERT to authenticated only via policy; the
-- table-level default grant to anon/PUBLIC was never explicitly revoked
-- until 20260805090000. Reapply that narrower ACL after the blanket local
-- parity grant.
DO $$
BEGIN
  IF to_regclass('public.lead_events') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.lead_events FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT ON TABLE public.lead_events TO authenticated;
    GRANT ALL ON TABLE public.lead_events TO service_role;
  END IF;
END $$;

-- AI Doctor session history is browser-append-only. The production project
-- inherits legacy DML defaults, so reapply its narrower migration grants after
-- the blanket local parity grant above.
DO $$
BEGIN
  IF to_regclass('public.ai_doctor_sessions') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.ai_doctor_sessions
      FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT ON TABLE public.ai_doctor_sessions TO authenticated;
    GRANT ALL ON TABLE public.ai_doctor_sessions TO service_role;
  END IF;
END $$;

-- AI result and evidence sidecars are server-readable but may only be written
-- through their SECURITY DEFINER finalizers. The production migrations revoke
-- even service_role direct DML; reapply that exact contract after the blanket
-- local parity grant.
DO $$
DECLARE
  obj text;
BEGIN
  FOREACH obj IN ARRAY ARRAY[
    'ai_credit_spend_results',
    'ai_doctor_review_evidence_receipts'
  ] LOOP
    IF to_regclass('public.' || obj) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
        obj
      );
      EXECUTE format(
        'GRANT SELECT ON TABLE public.%I TO service_role',
        obj
      );
    END IF;
  END LOOP;
END $$;

-- Paid-return cohort membership and validated AI Doctor completion rows are
-- private server ledgers. service_role keeps its migration-defined DML access;
-- browser roles keep no table privileges.
DO $$
DECLARE
  obj text;
BEGIN
  FOREACH obj IN ARRAY ARRAY[
    'paid_return_cohort_memberships',
    'ai_doctor_review_completions'
  ] LOOP
    IF to_regclass('public.' || obj) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        obj
      );
      EXECUTE format(
        'GRANT ALL ON TABLE public.%I TO service_role',
        obj
      );
    END IF;
  END LOOP;
END $$;

-- Action Queue transitions are RPC-only and their event history is
-- append-only. The blanket production-parity grant above would otherwise
-- reopen anon reads/inserts and direct lifecycle writes after the table-ACL
-- forward repair migration.
DO $$
BEGIN
  IF to_regclass('public.action_queue') IS NOT NULL
     AND to_regclass('public.action_queue_events') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE
      public.action_queue,
      public.action_queue_events
      FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT ON TABLE
      public.action_queue,
      public.action_queue_events
    TO authenticated;
  END IF;
END $$;

-- Irrigation event history is browser-read-only. The canonical write path is
-- quicklog_save_event / quicklog_save_manual; direct client DML was revoked by
-- the production migration. Reapply that deny boundary after the blanket local
-- parity grant so runtime and pgTAP lanes test production-equivalent ACLs.
DO $$
BEGIN
  IF to_regclass('public.grow_events') IS NOT NULL
     AND to_regclass('public.watering_events') IS NOT NULL
     AND to_regclass('public.feeding_events') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE
      public.grow_events,
      public.watering_events,
      public.feeding_events
    FROM PUBLIC, anon, authenticated;

    GRANT SELECT ON TABLE
      public.grow_events,
      public.watering_events,
      public.feeding_events
    TO authenticated;

    GRANT ALL ON TABLE
      public.grow_events,
      public.watering_events,
      public.feeding_events
    TO service_role;
  END IF;
END $$;

-- Signup acquisition attributions are written only by handle_new_user() and
-- read only through its SECURITY DEFINER snapshot/reporting functions
-- (20260813030000). No role -- not even service_role -- holds direct table
-- DML in production (20260821064300 closed the service_role gap). Reapply
-- that after the blanket local parity grant so runtime lanes test
-- production-equivalent ACLs.
DO $$
BEGIN
  IF to_regclass('public.signup_acquisition_attributions') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.signup_acquisition_attributions
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $$;
