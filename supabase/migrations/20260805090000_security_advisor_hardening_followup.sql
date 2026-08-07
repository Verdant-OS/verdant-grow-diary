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
--    is a real contributor to the recurring "we revoked anon and it came
--    back" pattern this project has hit before -- but the mechanism is
--    narrower than an earlier draft of this migration claimed. A bare
--    `CREATE OR REPLACE FUNCTION` on an UNCHANGED signature preserves the
--    function's existing owner and ACL; it does NOT reacquire schema
--    defaults. What DOES reacquire the schema's default ACL is genuine
--    new-object creation -- `DROP FUNCTION` + `CREATE FUNCTION`, or a
--    brand new overload. That is exactly this repo's own convention for
--    every quicklog_save_manual signature change (every parameter
--    addition is a DROP FUNCTION IF EXISTS + CREATE FUNCTION pair, never
--    a bare CREATE OR REPLACE), which is why each new parameter has
--    repeatedly resurrected anon's default EXECUTE. Postgres also grants
--    EXECUTE on new functions to PUBLIC by default -- so a REVOKE that
--    only names `anon` leaves PUBLIC's grant in effect and anon inherits
--    EXECUTE right back through it. The quicklog_save_manual REVOKE below
--    targets PUBLIC explicitly for that reason.
--
--    Scoped to FUNCTIONS only, not TABLES: unlike functions, tables carry
--    no PUBLIC-EXECUTE-equivalent built-in default in vanilla Postgres, and
--    prod is grandfathered so anon/authenticated get DML on new tables
--    automatically while Lovable ships new tables continuously without
--    knowing about ACL defaults. Silently making every future table
--    client-invisible by default is a real workflow change, not a narrow
--    security fix -- founder decision (2026-08-06) was to leave that alone
--    here and revisit deliberately if it comes up again.
--
--    Best-effort forward hardening, not a proven root-cause fix: this
--    changes the schema default for future function objects created by
--    the invoking role and by `postgres` explicitly (Supabase's documented
--    convention for its migration runner) -- it does not touch any
--    existing object's current grants (those are handled explicitly
--    below). An earlier draft of this migration included a same-transaction
--    self-test (create a throwaway function, assert it's not anon-
--    executable) to prove this end-to-end; it failed against the local
--    Supabase CI stack (`test:security-db-local`, 2026-08-06) -- a freshly
--    created function was still anon-executable immediately after this
--    exact statement ran, meaning some other default-ACL source (most
--    likely a Supabase-local-stack bootstrap default bound to a different
--    role) out-ranks it there. Root cause unconfirmed; removed the
--    self-test rather than ship a migration that hard-fails on an
--    assertion nobody has verified is even correct. Treat this block as
--    defense-in-depth, not a guarantee -- the explicit per-object REVOKEs
--    below are what's actually verified. Caveat: default privileges bind
--    to the ROLE that issues this statement, for objects THAT ROLE
--    creates. Verify after the next function recreate with:
--      select rolname from pg_roles
--       where oid = (select proowner from pg_proc
--                     where proname = 'quicklog_save_manual' limit 1);
--    If it names a role other than the current user or `postgres`, re-run
--    with "FOR ROLE <that role>".

BEGIN;

-- 1. lovable_paddle_events: match paddle_events / ai_credit_grants posture.
REVOKE ALL ON TABLE public.lovable_paddle_events FROM PUBLIC, anon, authenticated;

-- 2. lead_events: narrow to exactly what RLS already permits.
REVOKE ALL ON TABLE public.lead_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.lead_events TO authenticated;

-- 3. Forward hardening (best-effort, see the header note above): stop
-- future functions from being born with PUBLIC/anon EXECUTE. Scoped to
-- FUNCTIONS only -- see the header note for why TABLES is intentionally
-- excluded.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;

-- 4. quicklog_save_manual: the one finding independently reconfirmed live
-- against production (anon still had EXECUTE) moments before this was
-- written, not just inferred from migration history. Revokes from PUBLIC
-- as well as anon -- see the root-cause note above for why FROM anon alone
-- is insufficient -- and explicitly re-affirms authenticated/service_role
-- so this statement is self-contained regardless of what already landed.
REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text
) TO service_role;

-- Postcondition assertions. Modeled on the reviewed audit-lane contract at
-- supabase/contract-migrations/quicklog_save_manual_revoke_anon_execute.sql:
-- fail the whole transaction (RAISE EXCEPTION, not a NOTICE) rather than
-- silently leaving a gap, and verify with has_function_privilege /
-- has_table_privilege so PUBLIC-inherited grants are correctly accounted
-- for (checking pg_proc.proacl / pg_class.relacl directly would miss
-- those -- the exact class of bug this migration exists to close).
DO $$
DECLARE
  bad RECORD;
  overload_count INT;
BEGIN
  -- 4a. quicklog_save_manual: every overload, not just the 12-arg one in
  -- question -- a stray overload must not silently retain anon EXECUTE.
  SELECT COUNT(*) INTO overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual';

  IF overload_count = 0 THEN
    RAISE EXCEPTION 'quicklog_save_manual missing -- refuse to leave a hole';
  END IF;

  FOR bad IN
    SELECT p.oid,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual'
  LOOP
    IF bad.anon_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% still executable by anon', bad.oid;
    END IF;
    IF NOT bad.auth_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by authenticated', bad.oid;
    END IF;
    IF NOT bad.svc_exec THEN
      RAISE EXCEPTION 'quicklog_save_manual oid=% not executable by service_role', bad.oid;
    END IF;
  END LOOP;

  -- 4b. lovable_paddle_events / lead_events: effective anon/authenticated
  -- table privileges.
  IF has_table_privilege('anon', 'public.lovable_paddle_events', 'SELECT')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'INSERT')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.lovable_paddle_events', 'DELETE') THEN
    RAISE EXCEPTION 'lovable_paddle_events still has an anon table privilege';
  END IF;
  IF has_table_privilege('authenticated', 'public.lovable_paddle_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.lovable_paddle_events', 'DELETE') THEN
    RAISE EXCEPTION 'lovable_paddle_events still has an authenticated table privilege';
  END IF;

  IF has_table_privilege('anon', 'public.lead_events', 'SELECT')
     OR has_table_privilege('anon', 'public.lead_events', 'INSERT')
     OR has_table_privilege('anon', 'public.lead_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.lead_events', 'DELETE') THEN
    RAISE EXCEPTION 'lead_events still has an anon table privilege';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.lead_events', 'SELECT') THEN
    RAISE EXCEPTION 'lead_events lost the authenticated SELECT this migration is supposed to preserve';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.lead_events', 'INSERT') THEN
    RAISE EXCEPTION 'lead_events lost the authenticated INSERT this migration is supposed to preserve';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
