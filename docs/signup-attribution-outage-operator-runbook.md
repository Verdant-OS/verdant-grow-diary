# Signup attribution outage — operator runbook

**Status:** OPEN. The fix is merged but **not applied**. Production is still broken.
**Verified against live production:** 2026-08-13 UTC.
**Fix:** `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql`, merged in
[#969](https://github.com/Verdant-OS/verdant-grow-diary/pull/969) as `2197288b`.

This document exists because the migration's own header understates the problem, and that
header is immutable once merged (`AGENTS.md` → Migration Immutability Rules). It says
*"every signup has been unattributed"*, which reads as *signups succeed and lose analytics*.
They do not succeed.

---

## What is broken

Account creation aborts for any signup that carries an allowlisted acquisition source.

Production's live `handle_new_user` — body from `20260721194325`, applied 2026-07-21 — does:

```sql
IF v_signup_source IS NOT NULL THEN
  INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
  VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
  ON CONFLICT (user_id) DO NOTHING;
END IF;
```

That `INSERT` sits **outside** the function's `BEGIN ... EXCEPTION WHEN OTHERS` block, which
wraps only the referral / `convert_referral` logic. `public.signup_acquisition_attributions`
does not exist, because `20260714231627` was never applied.

So the sequence is: allowlisted source present → `INSERT` raises `42P01` → unhandled → the
`AFTER INSERT` trigger on `auth.users` aborts → the row rolls back → GoTrue returns
**HTTP 500 `unexpected_failure`, "Database error saving new user"**. The account is never created.

> The client never sees the string `42P01`. Grepping browser or client logs for it and finding
> nothing is **not** exoneration — the SQLSTATE stays on the Postgres side.

### Evidence (live production, 2026-08-13)

| Check | Result |
| --- | --- |
| `on_auth_user_created` trigger enabled | `tgenabled = 'O'` |
| Live `handle_new_user` allowlists `landing_page` | yes |
| `to_regclass('public.signup_acquisition_attributions')` | `NULL` (absent) |
| Deployed front-door CTA emits the matching utm triple | yes, present in the live bundle |

### Provenance

Recorded per `AGENTS.md` → "Record the authorized source and provenance for every material
measurement." This matters more than usual here, because **ordinary agent database access is
sandbox-scoped**: the Supabase MCP resolves to `bzatgtgjvuojpoxcknaa`, which is the
**sandbox**, not production. A future reader must be able to tell verified production
evidence from a sandbox read presented as one.

- **Authorized source:** Lovable MCP `query_database`.
- **Production project identity:** Lovable project id `66255e7b-892c-4be5-8686-ab1cfc3666db`
  (workspace "Verdant"). The underlying Supabase host is `knkwiiywfkbqznbxwqfh.supabase.co`,
  but `query_database` takes the **Lovable UUID**, not the host ref.
- **Date:** 2026-08-13 UTC. **Run by:** Claude, during the pre-merge audit of #969.
- **Access class:** read-only `SELECT`. No writes, no DDL.

Sanitized queries and their verbatim results, so each check is reproducible.

> **Every SQL block below was executed against production exactly as written here**, by
> extracting it from this file rather than retyping it, and each recorded `-- =>` line is
> that execution's actual output. This is not a formality: two earlier revisions shipped
> snippets that could not run — one referenced an out-of-scope CTE, and one carried doubled
> backslashes (`'\\mBEGIN\\M'`) that match a literal backslash instead of a `\m` word
> boundary and so returned the wrong counts. **If you change a query here, run it before
> committing.** A verification step that fails when an operator runs it during an incident
> is worse than no verification at all, because the error reads as a contradiction of the
> finding it was meant to support.

```sql
-- 1. trigger state, live function body, table presence
SELECT t.tgname, t.tgenabled, c.relname AS on_table,
       to_regclass('public.signup_acquisition_attributions') IS NOT NULL AS attribution_table_exists,
       position('signup_acquisition_attributions' IN pg_get_functiondef(p.oid)) > 0 AS body_inserts_attribution,
       position('''landing_page''' IN pg_get_functiondef(p.oid)) > 0 AS allowlists_landing_page,
       position('''blueprint_targets''' IN pg_get_functiondef(p.oid)) > 0 AS allowlists_blueprint_targets
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE p.proname = 'handle_new_user';
-- => tgname=on_auth_user_created, tgenabled=O, on_table=users,
--    attribution_table_exists=false, body_inserts_attribution=true,
--    allowlists_landing_page=true, allowlists_blueprint_targets=false

-- 1b. STRUCTURAL PROOF that the INSERT is not covered by an exception handler.
--     Query 1 alone is insufficient: it only shows two strings are PRESENT. A live
--     body that wrapped the INSERT in its own EXCEPTION handler would produce the
--     identical result and would NOT abort signup. This is the check that
--     distinguishes those two worlds, so the hard-failure diagnosis rests on it.
WITH d AS (
  SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'handle_new_user' LIMIT 1
), spans AS (
  SELECT def,
         position('signup_acquisition_attributions' IN def) AS ins,
         position('EXCEPTION' IN def) AS exc
  FROM d
)
SELECT md5(def) AS definition_md5, length(def) AS definition_bytes, ins, exc,
       (SELECT count(*) FROM regexp_matches(def, '\mBEGIN\M', 'g'))     AS total_begin,
       (SELECT count(*) FROM regexp_matches(def, '\mEXCEPTION\M', 'g')) AS total_exception,
       (SELECT count(*) FROM regexp_matches(substr(def, ins, exc - ins), '\mBEGIN\M', 'g'))
         AS begins_between_insert_and_handler
FROM spans;
-- => definition_md5=d67b343a174e86b5ba9ee065c43545ed, definition_bytes=2177,
--    ins=1228, exc=2103, total_begin=2, total_exception=1,
--    begins_between_insert_and_handler=1
```

**Token counts alone cannot prove this, so the complete definition is preserved below.**
A count of `total_exception=1` plus one `BEGIN` between the INSERT and the handler is
*consistent with* the INSERT being unhandled — but it is equally consistent with a **safe**
shape: outer `BEGIN` → INSERT → a fully closed inner `BEGIN ... END;` → outer `EXCEPTION`,
in which the handler does catch the INSERT. Counting cannot separate those two, and an md5
does not either unless the definition it fingerprints is actually recorded. So here it is.

**Live `pg_get_functiondef(handle_new_user)`, production, 2026-08-13 —
`md5 = d67b343a174e86b5ba9ee065c43545ed`, 2177 bytes.** If that hash no longer matches,
this whole diagnosis is stale; re-derive it before acting.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
  v_ref_code text;
  v_referrer uuid;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page','pricing_page','founder_page','founder_share',
      'pricing_interest_share','operator_outreach','grower_invite',
      'context_check','vpd_calculator','csv_history'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id, display_name, marketing_opt_in, marketing_opt_in_at, referral_code
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    public.generate_referral_code()
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF v_signup_source IS NOT NULL THEN
    INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
    VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  BEGIN
    v_ref_code := lower(btrim(NEW.raw_user_meta_data->>'verdant_ref_code'));
    IF v_ref_code IS NOT NULL AND v_ref_code ~ '^[a-z0-9]{6,16}$' THEN
      SELECT p.user_id INTO v_referrer
        FROM public.profiles p
       WHERE p.referral_code = v_ref_code
       LIMIT 1;
      IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
        PERFORM public.convert_referral(
          v_referrer, NEW.id, v_ref_code,
          COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live'),
          NEW.email_confirmed_at IS NOT NULL
            AND NULLIF(current_setting('app.payments_environment', true), '') IS NOT NULL
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$
```

Compute `md5` over exactly the block above and you get
`d67b343a174e86b5ba9ee065c43545ed` (2177 bytes) — it is the unmodified
`pg_get_functiondef` output, with nothing added. That is what makes it an authenticable
receipt rather than a paraphrase, so **do not annotate it in place.**

The structure, annotated **separately** so the receipt above stays verifiable:

```text
BEGIN                                   <== OUTER block opens
  ...
  INSERT INTO public.profiles ...
  IF v_signup_source IS NOT NULL THEN
    INSERT INTO public.signup_acquisition_attributions ...   <== THE FAILING STATEMENT
  END IF;                                                    <== still in the OUTER block

  BEGIN                                 <== INNER block opens, AFTER the failing INSERT
    ... referral / convert_referral ...
  EXCEPTION WHEN OTHERS THEN            <== the ONLY handler; pairs with the INNER BEGIN,
    NULL;                                   so it covers the referral logic and nothing else
  END;                                  <== INNER block closes

  RETURN NEW;
END;                                    <== OUTER block closes with NO exception clause
```

The attribution INSERT sits in the outer block. The outer block reaches its `END` without
an `EXCEPTION` clause. So the `42P01` is unhandled and propagates out of the trigger,
aborting the `auth.users` INSERT.

Read directly: the sole `EXCEPTION` clause pairs with the inner `BEGIN` that opens *after*
the attribution INSERT and closes immediately before `RETURN NEW`. It wraps only the
referral logic. The outer block — which contains the INSERT — reaches its `END` with no
`EXCEPTION` clause, so the 42P01 is unhandled and propagates out of the trigger.

If you would rather re-check this mechanically than re-read it, the discriminator is
whether the intervening `BEGIN` is still **open** at the handler — i.e. whether any
block-closing `END` occurs between them. `END IF` is not one:

```sql
-- Self-contained: re-declares its own CTEs. (An earlier revision of this runbook
-- referenced a `spans` CTE from the query above; CTE scope ends at that query's
-- semicolon, so run standalone it failed with: relation "spans" does not exist.)
WITH d AS (
  SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'handle_new_user' LIMIT 1
), spans AS (
  SELECT def,
         position('signup_acquisition_attributions' IN def) AS ins,
         position('EXCEPTION' IN def) AS exc
  FROM d
)
SELECT (SELECT count(*) FROM regexp_matches(substr(def, ins, exc - ins), '\mBEGIN\M',  'g')) AS begins_between,
       (SELECT count(*) FROM regexp_matches(substr(def, ins, exc - ins), '\mEND\M',    'g')) AS ends_between,
       (SELECT count(*) FROM regexp_matches(substr(def, ins, exc - ins), '\mEND IF\M', 'g')) AS end_ifs_between
FROM spans;
-- => begins_between=1, ends_between=3, end_ifs_between=3
--    block-closing ENDs = ends_between - end_ifs_between = 0
--    therefore the intervening BEGIN is still open at EXCEPTION, and pairs with it.
```

Under the safe shape this rules out, the closed inner block would contribute a
block-closing `END`, giving `ends_between - end_ifs_between = 1` instead of `0`.

```sql

-- 2. account census (the "has anyone been harmed" question)
SELECT COALESCE(raw_user_meta_data->>'verdant_signup_source', '(none)') AS signup_source,
       count(*) AS users, min(created_at) AS first_seen, max(created_at) AS last_seen
FROM auth.users GROUP BY 1 ORDER BY users DESC;
-- => single row: signup_source='(none)', users=7,
--    first_seen=2026-05-15 18:05:05+00, last_seen=2026-07-02 00:23:09+00

-- 3. apply status, re-run AFTER #969 merged
SELECT to_regclass('public.signup_acquisition_attributions') IS NOT NULL AS table_now_exists,
       (SELECT count(*) FROM pg_proc WHERE proname = 'record_signup_acquisition_first_touch') AS first_touch_fn,
       (SELECT count(*) FROM pg_proc WHERE proname = 'signup_acquisition_operator_snapshot') AS acq_snapshot_fn,
       (SELECT max(version) FROM supabase_migrations.schema_migrations) AS newest_applied_migration,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260813030000') AS repair_migration_applied;
-- => table_now_exists=false, first_touch_fn=0, acq_snapshot_fn=0,
--    newest_applied_migration=20260813125355, repair_migration_applied=0
```

Note what check 3 shows beyond the apply status: `newest_applied_migration` is
`20260813125355`, which is **later** than the repair migration `20260813030000`. Other
migrations have been applied since; this one was skipped, not merely pending.

```sql
-- 4. funnel-events sink status (drives the "the sink has nowhere to write" conclusion
--    in "Why nothing alerted" below — a separate table and a separate migration from
--    the repair, so query 3 does not cover it)
SELECT to_regclass('public.funnel_events') IS NOT NULL AS funnel_events_exists,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260813020000') AS funnel_sink_migration_applied,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260813030000') AS signup_repair_applied;
-- => funnel_events_exists=false, funnel_sink_migration_applied=0, signup_repair_applied=0
```

So **two** separate migrations are outstanding, not one: `20260813030000` (the signup
repair) and `20260813020000` (the funnel-events sink). They are independent — applying the
repair fixes the outage; applying the sink migration is only part of restoring the telemetry
that would have caught it.

> **Method caveat on queries 3 and 4 — do not copy their `WHERE version = …` form.** Those
> two blocks are preserved exactly as executed, so they are honest receipts, but the
> technique is **drift-prone**: Lovable records a migration under a version ~2 seconds after
> its filename timestamp, so an exact `version =` match can report `0` for a migration that
> did apply. See "Ledger hazard" below for the trap and the correct query. Their recorded
> `0` results happen to be **right**, independently re-confirmed by matching on `name` and on
> a +5s version window — but had these been applied, the same queries would have lied. Use
> the name-or-window form for any new check.

**Frontend evidence** was gathered separately, by fetching the deployed bundle over public
HTTPS from `https://verdantgrowdiary.com` (no auth, read-only) and reading the chunk graph:
`index-*.js` → `signupAcquisitionRules-*.js` (carries the `verdant_signup_source` literal) →
`auth-*.js` (spreads it into `signUp` `options.data`) → `Landing-*.js` (defaults to
`landing_page`). Two traps when reproducing this: `/` is a suspended skeleton, so seed the
crawl from `/auth?mode=signup` or `/welcome`; and a bogus asset path returns HTTP 200 with
`index.html`, so a 200 alone does not prove a chunk exists — check `Content-Type` and the
body. `scripts/audit-subscriber-growth-live-parity.mjs` implements this technique.

---

## Scope — this is not every signup

**Affected** (source is in the live 10-value allowlist, so the `INSERT` is attempted):

- `landing_page` — the front-door CTA on `/` and `/welcome`. Emits
  `utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch`.
  **This fires regardless of what utm params the visitor arrived with, including none.**
  `Landing.tsx:60` is `resolvePaidAcquisitionSource(searchParams) ?? "landing_page"`, so an
  absent, partial, or unrecognized inbound tuple falls back to `landing_page`, and line 74
  then builds a signup URL carrying the exact allowlisted triple. Inbound attribution is
  **re-written, not preserved** — so arriving with a non-matching utm tuple does not protect
  a visitor who lands here first.
- `pricing_page`, `founder_page`, `founder_share`, `vpd_calculator`, `context_check`,
  `csv_history`, `operator_outreach`, `grower_invite`, `pricing_interest_share`.

**Unaffected — these still work today:**

- Google OAuth — passes no user metadata at signup, so `v_signup_source` is `NULL`.
- Magic link — uses `shouldCreateUser: false`, so it never creates a user or fires the trigger.
- A bare `/auth?mode=signup` with no utm params.
- A partial or unrecognized utm tuple **supplied directly to `/auth`** — and only that.
  `resolvePaidAcquisitionSource` requires an exact source + medium + campaign match and fails
  closed to `NULL`, so a visitor who navigates straight to `/auth?mode=signup` carrying
  mismatched params still succeeds.

  > **Do not generalise this to "paid-ad and organic traffic is fine".** It is not. That
  > reasoning holds only for a direct hit on `/auth`. Any visitor who lands on `/` or
  > `/welcome` first — which is the overwhelmingly normal path for an ad click or a search
  > result — has their attribution **replaced** with `landing_page` by the fallback at
  > `Landing.tsx:60` before the CTA is even rendered, and then fails. Inbound utm params
  > offer no protection once a visitor touches the landing page.
- `/tools/blueprint-targets` — see the ordering note below.

---

## Has it actually hurt anyone?

**Unknown, and unknowable from the database.** Treat it as a live defect that is not yet
proven to have been exercised — do not claim lost signups, and do not call it harmless.

`auth.users` holds 7 accounts, all with a `NULL` `verdant_signup_source`, the newest created
**2026-07-02** — *before* the breaking function body landed on 2026-07-21. A failed signup
rolls back and leaves no row, so *"nobody tried"* and *"everyone who tried failed"* are
indistinguishable from the table.

**There is no sound database falsifier — do not let the obvious query fool you.** An
earlier revision of this runbook proposed grouping `auth.users` by
`raw_user_meta_data->>'verdant_signup_source'` and treating any allowlisted value created
after 2026-07-21 as disproof. **That query is not valid as a falsifier**, for a reason that
is easy to miss: `raw_user_meta_data` is **client-editable**, and the query observes the
value *now*, not the value the trigger saw at creation time. Someone who signed up through
an unaffected path — Google OAuth, say — could later set that key to an allowlisted value,
producing a row that appears to disprove the outage while the mechanism remains entirely
intact. It measures the wrong thing at the wrong time.

Sound evidence has to be **immutable and server-side**. The candidates:

| Source | What it would show | Caveat |
| --- | --- | --- |
| Postgres error logs | `42P01` on `public.signup_acquisition_attributions` at signup time — direct proof the path was exercised | Subject to the retention window; absence past retention proves nothing |
| GA4 `signup_failed` | Client-side count of failed signups since 2026-07-21 | Consent-gated and currently unreadable (baseline `BLOCKED`); see "Why nothing alerted" |
| `public.signup_acquisition_attributions` rows | Trigger-written and not client-editable — the ideal evidence | **The table does not exist**, which is the outage itself. Available only *after* the apply |

Note the structural bind: the one trustworthy database record is the very table whose
absence causes the failure. **Until the migration is applied, no immutable database evidence
of this outage can exist** — a failed signup rolls back and leaves nothing behind. That is
why the diagnosis rests on the mechanism (proven above against the live function) rather
than on a count of victims.


---

## Why merging did not fix it

Two independent reasons, both worth internalising:

1. **The apply gap.** Merging a migration never applies it to production (see
   `docs/contributing-supabase-migrations.md`). Only an explicit Lovable apply does.
2. **The frontend half was already deployed.** The live bundle's attribution table already
   carried `blueprint_targets` while the repo base branch did not — production was *ahead of
   the repo*. So #969's frontend diff was repo-side catch-up to already-published Lovable
   code, and changed nothing live.

---

## ⚠️ Ledger hazard — read before applying

Applying `20260813030000` alone fixes the outage, but leaves a loaded gun. Three superseded
migrations remain **absent from the ledger**, and every one of them carries a *lower* version
than the repair. If any future backlog catch-up executes pending migrations in version order,
they run **after** the repair and clobber it.

### The ledger, measured

The version-drift trap first, because it makes the obvious query lie: **Lovable records a
migration under a version ~2 seconds later than its filename timestamp, with the filename in
the `name` column.** `20260721194325_f96507e6-…` is in the ledger as version
`20260721194327`. So `WHERE version = '<filename timestamp>'` produces **false negatives**.
Match on `name`, or on a small version range.

```sql
-- Correct method: match name OR a +5s version window, never version alone.
SELECT pat AS looking_for,
       (SELECT count(*) FROM supabase_migrations.schema_migrations m
         WHERE m.name LIKE pat || '%'
            OR m.version BETWEEN pat AND (pat::bigint + 5)::text) AS in_ledger
FROM (VALUES
  ('20260714231627'), ('20260715002000'), ('20260716215516'),
  ('20260721194325'), ('20260813020000'), ('20260813030000')
) AS t(pat) ORDER BY pat;
-- => 20260714231627:0  20260715002000:0  20260716215516:0
--    20260721194325:1  20260813020000:0  20260813030000:0
```

### Why that specific combination is dangerous

`20260721194325` **is** recorded, so it will **not** re-run. The three below are **not**
recorded, so they will. And `20260716215516` redefines **all four** functions — verified by
reading the file: `referral_code` 0 occurrences, `convert_referral` 0, `blueprint_targets` 0,
`billing_subscriptions` 1.

So a catch-up after a repair-only apply would:

| Effect | Consequence |
| --- | --- |
| `handle_new_user` reverts to the 2026-07-16 body | **the referral system is silently removed** — no `referral_code` on the profiles INSERT, no `convert_referral` block |
| `blueprint_targets` disappears from every allowlist | `/tools/blueprint-targets` signups stop being attributed |
| `signup_to_paid_operator_snapshot` regains its `billing_subscriptions` UNION | a legacy surface `AGENTS.md` says must never grant an entitlement is back in the paid cohort |
| `20260721194325` does **not** re-run | nothing restores the referral behaviour |

The outage itself would *not* return — the table still exists once created — but you would
trade it for a quieter regression across referrals, attribution, and operator reporting.

### Safe disposition

Marking the three as applied is **semantically correct**, not a workaround: the repair is a
strict superset of all three. It creates the table (`20260714231627`), and re-issues all four
functions at their current-best definitions, including `signup_to_paid_operator_snapshot`
(`20260715002000`) and the csv-history allowlist work (`20260716215516`). Their intent is
fully satisfied the moment the repair applies; re-running them could only regress.

**Order matters — record them only AFTER the repair has applied and verified.** Doing it
first would mark the table's creating migration as applied while the table does not exist.

This is a write to `supabase_migrations.schema_migrations` and therefore a founder decision;
it is not something to do casually. The alternative dispositions are to guarantee the repair
always runs last after any catch-up, or to never run a catch-up at all — both rely on
process holding indefinitely, which is what produced this outage in the first place.

## Applying the fix

Apply `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` through
Lovable. It is a single self-contained, idempotent forward repair: it creates the table,
re-asserts the CHECK allowlist separately, re-issues all four functions with
`CREATE OR REPLACE`, and backfills historical attribution `ON CONFLICT DO NOTHING`.

**Every partial-apply prefix is safe.** `CREATE TABLE IF NOT EXISTS` is at line 35; the
`handle_new_user` re-issue that widens the allowlist is at line 91. There is no prefix in
which the allowlist widens while the table is still absent. Fail between them and the main
break is *already* fixed, with `blueprint_targets` still resolving to `NULL`.

This ordering is load-bearing, and it is why the two changes ship in one file:
**`/tools/blueprint-targets` currently succeeds precisely because the live allowlist omits
its source.** It resolves to `NULL` and never reaches the missing table. Widening the
allowlist without creating the table first would flip a working surface to broken.

### Expect the backfill to insert ~zero rows

That is success, not a failed apply. The backfill replays `auth.users` rows carrying
allowlisted metadata — but under the mechanism above, those accounts were never created.

### Verifying the apply worked

```sql
SELECT to_regclass('public.signup_acquisition_attributions') IS NOT NULL AS table_exists,
       (SELECT count(*) FROM pg_proc
         WHERE proname IN ('record_signup_acquisition_first_touch',
                           'signup_acquisition_operator_snapshot',
                           'signup_to_paid_operator_snapshot')) AS functions_present,
       -- Match name OR a +5s window, NOT version alone: Lovable records a version ~2s
       -- after the filename timestamp (see "Ledger hazard"), so `version = '...'` on its
       -- own returns a false negative and would tell you the apply failed when it did not.
       (SELECT count(*) FROM supabase_migrations.schema_migrations
         WHERE name LIKE '20260813030000%'
            OR version BETWEEN '20260813030000' AND '20260813030005') AS migration_recorded;
```

Expect `true`, `3`, `1`. Then confirm end to end by completing a signup from the homepage CTA.

If `migration_recorded` is `0` but `table_exists` is `true` and `functions_present` is `3`,
the apply **worked** and only the ledger row is missing — treat the object state as
authoritative, and see the "Ledger hazard" section above, because an unrecorded repair is
exactly the condition that lets a later catch-up re-run it out of order.

### Also fixed by the same apply

`record_signup_acquisition_first_touch` is absent in production today, so OAuth first-touch
attribution silently no-ops and the pending `sessionStorage` value is retained until its
30-minute TTL expires. Analytics-only, and distinct from the signup outage — but the same
apply resolves it.

---

## Why nothing alerted

Worth recording, because it is the reusable lesson rather than a detail of this incident:

- **The failure signal has no first-party persistence — and it is blocked FOUR ways, not
  one.** A sink exists *in the repo*: `src/components/FunnelEventDbSink.tsx` is mounted in
  `src/routes/__root.tsx` and subscribes to the same `verdant:analytics` bridge, writing
  catalogued events into `public.funnel_events` (migration `20260813020000`). Extend it rather
  than building a second one — but every one of the following must be cleared, and the
  obvious two are not enough:

  0. **The listener is not deployed.** Measured 2026-08-13 by crawling the production bundle
     from `https://verdantgrowdiary.com/auth?mode=signup`: 61 real JS chunks fetched, and
     `funnel_events`, `consentGranted` and `FunnelEvent` appear in **none** of them. The
     crawl is trustworthy for this question because it carries a passing positive control —
     the same sweep does find `verdant_signup_source` (in `signupAcquisitionRules-*.js`) and
     `gtag` — and because `FunnelEventDbSink` is mounted in the **eagerly loaded** root
     route, so it would appear in exactly this eager chunk set rather than behind a lazy
     import. Consistent with `CURRENT_STATE.md` recording production at #942 while
     `FunnelEventDbSink` entered history in #964. **The component cannot reject an event it
     never receives, so blockers 1-3 are currently moot in production** — they are what you
     would hit next, after a publish.

  1. **Identity gate — the blocker that defeats the obvious fix.**
     `decideFunnelEventSinkWrite` (`src/lib/funnelEventDbSinkRules.ts:73-74`) rejects a null
     `userId` *before* it inspects the event at all. And `signup_failed` is emitted at
     `src/pages/Auth.tsx:355-360`, inside the `if (error)` branch — i.e. precisely when
     `signUp` failed and there is **no authenticated user**. So the row is refused on
     identity, ahead of any catalogue question.
  2. **Not catalogued.** `FUNNEL_EVENTS` in `src/lib/funnelAnalytics.ts` carries `signup` but
     **not** `signup_failed`, so the write gate would reject it even with a user present.
  3. **The sink's own table is unapplied.** Verified in the same production session:
     `to_regclass('public.funnel_events')` is `NULL` and `20260813020000` is **not** in
     `schema_migrations`. Even a catalogued event from a signed-in user has nowhere to land.

  **Do not treat blocker 1 as a bug to patch out.** The gate is deliberate — its own comment
  says a declined-consent or signed-out visitor "should never reach the event-shape logic
  below", and it checks consent on the line above. Persisting a signed-out visitor's failure
  event is a **separate design decision** that needs explicit privacy justification and its own
  review, not a one-line relaxation of an intentional fence.

  **So the full sequence to actually capture this signal is: publish the frontend (0), design
  and justify a signed-out ingestion path (1), catalogue `signup_failed` (2), and apply
  `20260813020000` (3).** Cataloguing plus applying the table — the two obvious fixes — clears
  only 2 and 3 and still persists nothing.

- **GA4 delivery for this event: `NOT_MEASURED`.** Do not record that the signal went nowhere
  — that is a claim nobody has checked. `trackPricingEvent`
  (`src/lib/pricingAnalytics.ts:129-137`) sends `signup_failed` to `window.gtag` in a
  **separate** `try` block from the `verdant:analytics` bridge, so it is entirely independent
  of the first-party sink and its catalogue. For a visitor who granted analytics consent with
  `gtag` loaded, this event may well have been delivered. What is actually true is narrower:
  the **authenticated GA4 baseline is `BLOCKED`**, so we cannot read GA4 to find out. Ingestion
  and visibility are therefore `BLOCKED` / `NOT_MEASURED` per `AGENTS.md` — "when an outcome
  cannot be measured, report the blocker instead of claiming success". Checking GA4 for
  `signup_failed` events since 2026-07-21 is a genuine open lead: a nonzero count would be the
  first direct evidence that a real visitor hit this.
- **No test could catch it.** Every repo test touching this subsystem is a static scan that
  pins SQL text in migration *files*. The runtime lane (`test:security-db-local`) does a
  `supabase db reset`, which applies **every** migration to a fresh database — where the table
  exists. Production's partial-apply state is unreproducible in CI by construction.
- **Documented precedent.** `scripts/probe-migration-drift.mjs` records the identical class on
  2026-08-05: seven migrations never reached prod for six days, "including an
  `action_queue_create` RPC that shipped client code already calling it. That was a live
  user-facing break. Nothing alerted. CI was green the entire time."
