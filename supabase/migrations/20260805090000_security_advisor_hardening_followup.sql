-- Security hardening follow-up: a live production Security Advisor sweep
-- (2026-08-05) found several anon-privilege gaps. Cross-checked against
-- this repo's migration history before writing anything: most of what the
-- sweep flagged (quicklog_save_manual's other 7 sibling functions,
-- customer_feedback, contact_messages, leads) already has a correctly
-- scoped REVOKE committed in an earlier migration (see 20260804091142,
-- 20260804091217, 20260728060547, 20260714190000). Those are NOT
-- re-authored here to avoid duplicate/conflicting DDL -- if the live sweep
-- still shows them wide open, the gap is application (migration committed
-- but not run on prod), not authorship, and needs to be confirmed via the
-- migration ledger rather than more SQL.
--
-- Three things below ARE genuine, previously-unaddressed gaps:
--
-- 1. lovable_paddle_events was deliberately shipped with RLS-deny-by-
--    default as its ONLY protection ("Deliberately no policies: with RLS
--    enabled and zero policies, authenticated/anon get zero rows" --
--    20260709083556). That's fragile: one future permissive policy, or one
--    accidental RLS disable, and it's wide open. Sibling tables
--    (paddle_events, paddle_event_processing, ai_credit_grants) already
--    had these grants explicitly stripped; this brings this table to the
--    same posture.
--
-- 2. lead_events grants SELECT/INSERT to `authenticated` only via policy
--    (see 20260521011859), but the table-level default grant to `anon`
--    was never explicitly revoked -- RLS currently denies anon by
--    omission (no anon policy), not by grant. Narrowed to exactly what
--    the existing policies allow.
--
-- 3. ALTER DEFAULT PRIVILEGES has never been used anywhere in this
--    project's migration history (verified: zero matches repo-wide). That
--    is the actual root cause of the recurring "we revoked anon and it
--    came back" pattern this project has hit before: every
--    CREATE FUNCTION / CREATE OR REPLACE FUNCTION recreate re-acquires
--    the schema's default ACL, which still grants anon EXECUTE / table
--    privileges by default unless the default itself is changed. This
--    changes that default going forward so future objects are born
--    already narrow -- it does not touch any existing object's current
--    grants.
--    Caveat: default privileges bind to the ROLE that issues this
--    statement, for objects THAT ROLE creates. If Lovable's migration
--    runner applies migrations as a role other than the one that runs
--    this file, this will not cover future objects it creates -- add
--    "FOR ROLE <that role>" and re-apply. Verify after the next function
--    recreate with:
--      select rolname from pg_roles
--       where oid = (select proowner from pg_proc
--                     where proname = 'quicklog_save_manual' limit 1);

-- 1. lovable_paddle_events: match paddle_events / ai_credit_grants posture.
REVOKE ALL ON TABLE public.lovable_paddle_events FROM anon, authenticated;

-- 2. lead_events: narrow to exactly what RLS already permits.
REVOKE ALL ON TABLE public.lead_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lead_events TO authenticated;

-- 3. Root-cause fix: stop future objects from being born with anon access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Defensive reassertion, quicklog_save_manual only: this is the one
-- finding independently reconfirmed live against production moments ago
-- (anon still had EXECUTE), not just inferred from migration history. The
-- correct REVOKE already exists in 20260804091142 with this exact
-- signature; reasserting it here is a no-op if that migration already
-- landed, and closes the gap immediately if it did not. Guarded so a
-- future signature change (another added parameter) makes this a
-- reported no-op instead of a hard failure.
DO $$
BEGIN
  IF to_regprocedure(
    'public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(
      text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
    ) FROM anon;
    RAISE NOTICE 'reasserted: quicklog_save_manual(12-arg) EXECUTE revoked from anon';
  ELSE
    RAISE NOTICE 'skipped: quicklog_save_manual(12-arg) not found -- signature changed again, re-check';
  END IF;
END $$;
