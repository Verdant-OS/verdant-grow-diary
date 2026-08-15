# Signup attribution outage — operator runbook

**Status:** OPEN. The fix is merged but **not applied**. Production is still broken.
**Verified against live production:** 2026-08-13 UTC.
**Fix:** `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql`, merged in
[#969](https://github.com/Verdant-OS/verdant-grow-diary/pull/969) as `2197288b`.

This document exists because the migration's own header understates the problem, and that
header is immutable once merged (`AGENTS.md` → Migration Immutability Rules). It says
_"every signup has been unattributed"_, which reads as _signups succeed and lose analytics_.
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

| Check                                                   | Result                          |
| ------------------------------------------------------- | ------------------------------- |
| `on_auth_user_created` trigger enabled                  | `tgenabled = 'O'`               |
| Live `handle_new_user` allowlists `landing_page`        | yes                             |
| `to_regclass('public.signup_acquisition_attributions')` | `NULL` (absent)                 |
| Deployed front-door CTA emits the matching utm triple   | yes, present in the live bundle |

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
_consistent with_ the INSERT being unhandled — but it is equally consistent with a **safe**
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

Read directly: the sole `EXCEPTION` clause pairs with the inner `BEGIN` that opens _after_
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
> two blocks are preserved exactly as executed, so they remain honest receipts, but the
> technique is **drift-prone**: Lovable records a migration under a version ~2 seconds after
> its filename timestamp, so an exact `version =` match can report `0` for a migration that
> did apply. Their recorded `0` results happen to be **right** — independently re-confirmed
> by the exact name-bound check in "Ledger hazard" below — but had these migrations been
> applied, the same queries would have lied. **Use the name-bound form for any new check,
> and do not substitute a version window either**: a window trades this false negative for a
> false positive, which is worse. Both traps are set out below.

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
**2026-07-02** — _before_ the breaking function body landed on 2026-07-21. A failed signup
rolls back and leaves no row, so _"nobody tried"_ and _"everyone who tried failed"_ are
indistinguishable from the table.

**There is no sound database falsifier — do not let the obvious query fool you.** An
earlier revision of this runbook proposed grouping `auth.users` by
`raw_user_meta_data->>'verdant_signup_source'` and treating any allowlisted value created
after 2026-07-21 as disproof. **That query is not valid as a falsifier**, for a reason that
is easy to miss: `raw_user_meta_data` is **client-editable**, and the query observes the
value _now_, not the value the trigger saw at creation time. Someone who signed up through
an unaffected path — Google OAuth, say — could later set that key to an allowlisted value,
producing a row that appears to disprove the outage while the mechanism remains entirely
intact. It measures the wrong thing at the wrong time.

Sound evidence has to be **immutable and server-side**. The candidates:

| Source                                                | What it would show                                                                                                                                            | Caveat                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Postgres error logs**                               | `42P01` on `public.signup_acquisition_attributions` raised from `handle_new_user` at signup time. **This is the only incident-specific evidence that exists** | Subject to the retention window; absence past retention proves nothing                                                                                                                                                                                                                                                                                                                           |
| GA4 `signup_failed`                                   | That _some_ signup failed — a **lead**, not proof                                                                                                             | **Not incident-specific.** `Auth.tsx` emits `signup_failed` with `reason: "auth_rejected"` for **every** `supabase.auth.signUp` error: rate limiting, duplicate account, provider outage, weak password. A nonzero count is only meaningful if correlated with a server-side `42P01`. Also consent-gated and currently unreadable (baseline `BLOCKED`)                                           |
| `signup_acquisition_attributions` rows _(post-apply)_ | Very little — see below                                                                                                                                       | **Rows are NOT proof the trigger fired.** The table has no provenance column, and rows reach it three ways: the repair's own backfill from current `raw_user_meta_data`, `record_signup_acquisition_first_touch` (which an authenticated OAuth user can call with a source from client-controlled session storage), and the trigger. A row cannot be attributed to the failing email-signup path |

An earlier revision of this runbook called that last row "trigger-written and not client-editable — the ideal evidence". That was wrong on both counts, and wrong in the same way as the retracted metadata falsifier: it assumed a value's _presence_ implies the path that would have written it. **Database logs are the incident-specific evidence. Everything else is circumstantial.**

Note the structural bind: the one trustworthy database record is the very table whose
absence causes the failure. **Until the migration is applied, no immutable database evidence
of this outage can exist** — a failed signup rolls back and leaves nothing behind. That is
why the diagnosis rests on the mechanism (proven above against the live function) rather
than on a count of victims.

---

## Why merging did not fix it

Two independent reasons, both worth internalising:

1. **The apply gap.** Merging a migration never applies it to production (see
   `docs/contributing-supabase-migrations.md`). At incident discovery, Lovable's explicit
   apply was the only available operator path. The repository now carries the narrower,
   protected `apply-signup-acquisition-forward-repair.yml` dispatch described below; a
   merge still does not run it automatically.
2. **The frontend half was already deployed.** The live bundle's attribution table already
   carried `blueprint_targets` while the repo base branch did not — production was _ahead of
   the repo_. So #969's frontend diff was repo-side catch-up to already-published Lovable
   code, and changed nothing live.

---

## ⚠️ Ledger hazard — read before applying

Applying `20260813030000` alone fixes the outage, but leaves a loaded gun. Three superseded
migrations remain **absent from the ledger**, and every one of them carries a _lower_ version
than the repair. If any future backlog catch-up executes pending migrations in version order,
they run **after** the repair and clobber it.

### Two traps in the obvious query — both must be avoided

**Trap 1, false negatives from version drift.** Lovable records a migration under a version
~2 seconds later than its filename timestamp, with the filename in the `name` column:
`20260721194325_f96507e6-…` is in the ledger as version `20260721194327`. So
`WHERE version = '<filename timestamp>'` misses it. Hand-authored migrations use the exact
timestamp with a slug name, so **both conventions coexist in one table**.

**Trap 2, false positives from a version window.** The obvious fix — widen to a few
seconds — is unsound, because migrations can legitimately sit that close together. This repo
contains `20260806230020_candidate_number_maintenance_paths` and
`20260806230021_candidate_number_membership_validate`, one second apart: a ledger holding
only the second would make a window check report the **first** as applied. That is the worse
failure of the two — it classifies an unapplied migration as applied.

**Use an exact, name-bound check with no window at all.** For a file `<ts>_<slug>.sql`, the
ledger row is identified by the full stem (Lovable), the bare slug (hand-authored), or the
exact version — never by proximity:

```sql
WITH targets(stem) AS (VALUES
  ('20260515204616_dba9604f-080f-4b98-a10f-5bd0f73dbae7'),
  ('20260515204637_3c2dcaf4-a0b6-416a-8280-8e9a0089acac'),
  ('20260515211702_02a55c35-7e90-4da0-ae94-346d79111d63'),
  ('20260714231627_signup_acquisition_attribution'),
  ('20260715002000_signup_to_paid_operator_snapshot'),
  ('20260716215516_add_csv_history_signup_attribution'),
  ('20260721107000_referral_code_and_pending_capture'),
  ('20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5'),
  ('20260813030000_signup_acquisition_forward_repair')
), parsed AS (
  SELECT stem, left(stem, 14) AS ts, substr(stem, 16) AS slug FROM targets
)
SELECT p.ts, p.slug,
       (SELECT count(*) FROM supabase_migrations.schema_migrations m
          WHERE m.name = p.stem OR m.name = p.slug OR m.version = p.ts) AS in_ledger
FROM parsed p ORDER BY p.ts;
-- => only 20260721194325 returns 1. All other eight return 0.
```

### The full exposure — eight migrations, not three

Every migration in the repo that defines any of the four functions, and what each would do
if it ran **after** the repair. Occurrence counts are from reading the files:

| Migration                                            | Defines                         | In ledger | Would revert                                                                                        |
| ---------------------------------------------------- | ------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `20260515204616`, `20260515204637`, `20260515211702` | `handle_new_user`               | **no**    | referral system **and** attribution entirely — these predate both                                   |
| `20260714231627_signup_acquisition_attribution`      | `handle_new_user`, acq snapshot | **no**    | referral system; `blueprint_targets`                                                                |
| `20260715002000_signup_to_paid_operator_snapshot`    | paid snapshot                   | **no**    | restores the `billing_subscriptions` branch                                                         |
| `20260716215516_add_csv_history_signup_attribution`  | **all four**                    | **no**    | referral system; `blueprint_targets`; restores `billing_subscriptions`                              |
| `20260721107000_referral_code_and_pending_capture`   | `handle_new_user`               | **no**    | `blueprint_targets` only — it _has_ the referral block (`referral_code` ×23, `convert_referral` ×6) |
| `20260721194325_f96507e6-…`                          | `handle_new_user`               | **yes**   | — will not re-run                                                                                   |
| `20260813030000_signup_acquisition_forward_repair`   | **all four**                    | **no**    | this is the repair. The **only** migration containing `blueprint_targets`                           |

Note `20260721107000`: it is the subtle one. Because it carries the referral block, a reader
checking "does a revert lose referrals?" would clear it — but it has **zero**
`blueprint_targets`, so it silently reverts attribution for `/tools/blueprint-targets` while
leaving referrals intact. Being _nearly_ current is what makes it easy to miss.

The outage itself would not return — the table survives once created — but you would trade it
for a quieter regression across referrals, attribution, and operator reporting.

### ⚠️ The repair is NOT a strict superset — an earlier revision said so, wrongly

For the six **attribution** migrations the superset claim holds: the repair creates the table
and re-issues all four functions at their current-best definitions — the referral block, the
full 11-value allowlist including `blueprint_targets`, and the paid snapshot without the
legacy `billing_subscriptions` branch.

**It does not hold for the three May-2026 migrations,** and marking those applied on a false
superset claim would permanently suppress a catch-up that installs things the repair never
mentions. `20260515204616` alone creates four tables (`profiles`, `nug_events`, `unlocks`,
`user_quests`), the `on_auth_user_created` and `profiles_updated_at` triggers, `compute_level`,
`award_nugs`, RLS policies and an index; the following two alter function security and grants.
The repair reasserts **none** of that.

So every non-attribution effect must be **fingerprinted present before** any ledger write.
Measured 2026-08-13:

```sql
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
          AND table_name IN ('profiles','nug_events','unlocks','user_quests')) AS tables_4,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN ('compute_level','award_nugs')) AS fns_2,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('on_auth_user_created','profiles_updated_at')) AS triggers_2,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='nug_events_user_idx') AS idx_1,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname IN ('profiles','nug_events','unlocks','user_quests')
            AND c.relrowsecurity) AS rls_on_4,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN ('max_level_for','recompute_level')) AS grant_fns,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='handle_new_user'
            AND (has_function_privilege('anon', p.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS hnu_leaks_execute;
-- => tables_4=4, fns_2=2, triggers_2=2, idx_1=1, rls_on_4=4,
--    grant_fns=0, hnu_leaks_execute=0
```

Every installable effect is **present**, and `hnu_leaks_execute=0` confirms the later
`REVOKE EXECUTE` migrations took hold. One anomaly worth recording rather than glossing:
`grant_fns=0` — `max_level_for` and `recompute_level` **do not exist in production**, so
`20260515211702`'s `GRANT`/`REVOKE` statements reference absent objects. Re-running it would
**error**, not silently install anything. That is a different failure mode from the revert
hazard, and it is another reason not to leave these rows to chance.

### Safe disposition

**Scope: seven rows, not eight.** The eight-unrecorded figure above includes
`20260813030000` itself, which the apply records on its own. Attempting to insert it again
would collide with the apply-generated entry. **Re-run the name-bound inventory after the
apply** and disposition only the legacy versions that remain.

**Order matters — record them only AFTER the repair has applied and verified.** Doing it
first would mark the table's creating migration as applied while the table does not exist.

This is a write to `supabase_migrations.schema_migrations` and therefore a founder decision.
The alternatives are to guarantee the repair always runs last after any catch-up, or to never
run a catch-up — both rely on process holding indefinitely, which is what produced this
outage in the first place.

### The repo's replay config contradicts this measurement — the config is wrong

`config/local-supabase-replay-compatibility.json` states, for its `20260721107000` /
`20260721194325` no-op pair: _"Production records 20260721107000; the later Lovable export
repeats referral code generation and pending-referral capture functions and triggers."_

**That is the exact reverse of production.** Measured: no ledger row mentions `referral`,
`pending_capture`, or `20260721107000` under any column or version range, while
`20260721194325_f96507e6-…` is present as version `20260721194327`. Production records the
**later** file, not the earlier one.

The referral objects themselves do exist (`generate_referral_code`, `convert_referral`,
`profiles.referral_code` all present) — installed by `20260721194325`, which carries them
(`referral_code` ×19, `convert_referral` ×3). So object presence does not disambiguate the
two; only the ledger does, and the ledger says the config's rationale is stale.

**Trust the live ledger over the config.** The config's _behaviour_ — no-op the duplicate
during local replay — is unaffected either way, since both files install the referral
objects; only its stated reason is wrong. Correcting that file is out of scope for this
docs-only PR and needs its own change, because the entry carries pinned SHA-256 hashes.

## Applying the fix

Use the dedicated protected GitHub Actions workflow. Do **not** paste the migration into a
SQL editor, use the broad pinned-production runner, or ask Lovable to generate a new
timestamp for it. The dedicated path binds the immutable repository file to its own exact
version/name ledger identity.

### Protected two-dispatch sequence

> **OPERATIONAL STATUS: BLOCKED.** Do not dispatch PREFLIGHT until the
> `verdant-production` environment has (1) an eligible required reviewer, (2)
> prevent-self-review enabled, and (3) the corrected environment-scoped
> `SUPABASE_DB_URL`. Never dispatch APPLY until that read-only PREFLIGHT also confirms the
> migration-ledger compatibility contract described below. The repository pins Verdant's
> established ledger contract, but this change has not independently measured production's
> current schema/table owners or ACLs. GitHub's run and artifact APIs authenticate provenance;
> they do not prove that a human reviewed the database state.

1. Merge the delivery workflow to `verdant-grow-diary`. A pull-request or feature-branch
   run is intentionally refused.
2. Read the current full 40-character commit from `verdant-grow-diary`. It must remain the
   reviewed commit for both stages. If the branch moves, start again from a new PREFLIGHT.
3. Open **Actions → Apply signup-acquisition forward repair → Run workflow** and select
   `verdant-grow-diary`.
4. Run the read-only stage first:

   | Input                 | PREFLIGHT value                                      |
   | --------------------- | ---------------------------------------------------- |
   | `operation`           | `PREFLIGHT`                                          |
   | `expected_head_sha`   | the current 40-character `verdant-grow-diary` commit |
   | `confirm_project_ref` | `knkwiiywfkbqznbxwqfh`                               |
   | `confirm_apply`       | leave blank                                          |
   | `preflight_run_id`    | leave blank                                          |

5. After the eligible `verdant-production` reviewer (who is not the dispatcher) approves,
   inspect the sanitized Markdown summary and run-scoped evidence artifact. PREFLIGHT makes one
   transaction-enforced read-only query and never submits `--file`. Continue only when its
   outcome is `SAFE_TO_APPLY`. If it reports `already_applied_verified`, stop; if it reports
   any BLOCKED outcome, resolve that condition and run a new PREFLIGHT.
6. Record the successful PREFLIGHT's numeric GitHub Actions run ID. Do not copy or type a
   digest. The workflow uploads a single-file immutable receipt artifact named for that exact
   run and attempt; APPLY authenticates and parses it itself. Start a **new** workflow dispatch:

   | Input                 | APPLY value                                      |
   | --------------------- | ------------------------------------------------ |
   | `operation`           | `APPLY`                                          |
   | `expected_head_sha`   | the same commit bound into the PREFLIGHT receipt |
   | `confirm_project_ref` | `knkwiiywfkbqznbxwqfh`                           |
   | `confirm_apply`       | `APPLY SIGNUP ACQUISITION FORWARD REPAIR`        |
   | `preflight_run_id`    | successful SAFE_TO_APPLY run ID from step 6      |

7. APPLY validates that the supplied ID belongs to a different, completed-success
   `workflow_dispatch` run of this exact active workflow, repository, branch, and commit. It
   accepts exactly one unexpired, API-digest-matched, run/attempt-scoped artifact containing
   only `preflight-receipt.json`; the dependency-free Node verifier validates the ZIP directory,
   member type/name, compression method, declared and actual size, and CRC before parsing. The
   signed archive download receives no GitHub credential and is byte- and
   decompression-bounded. APPLY then installs its local Postgres client and
   re-resolves `refs/heads/verdant-grow-diary` at the last step before the runner. If the branch
   advanced or cannot be resolved, the runner emits fixed sanitized `DEPLOY_HEAD_ADVANCED`
   evidence and stops before database access. Otherwise it repeats the read-only preflight and
   compares the current state digest with the authenticated artifact digest. Any mismatch stops
   before `--file` and requires a new PREFLIGHT.
8. Require a green **Run protected preflight or atomic apply** job. Inspect its sanitized
   summary and evidence artifact before performing the separate disposable-account E2E.

The environment-scoped `SUPABASE_DB_URL` must contain the pooled Postgres URL for the exact
project. Never paste that URL into a workflow input, log, issue, or artifact. Environment
approval is the human authorization gate; the receipt binding is a machine provenance and
state-continuity gate, not a substitute for review.

The workflow runs
`scripts/apply-signup-acquisition-forward-repair.mjs`, which is intentionally not a generic
migration runner. Its reviewed identity is:

| Fact                    | Pinned value                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| Version                 | `20260813030000`                                                   |
| Canonical written name  | `signup_acquisition_forward_repair`                                |
| Accepted existing alias | `20260813030000_signup_acquisition_forward_repair`                 |
| File                    | `20260813030000_signup_acquisition_forward_repair.sql`             |
| SHA-256                 | `6C002AB676218C32C27E41E7A8E90FF4F452C41D7EDB446B0FCB950B93D3DEBA` |

Both names are accepted only when bound to version `20260813030000`. The bare slug is what
this runner writes; the full migration stem is an accepted, verified name-bound alias. A
different version using either name, or the version using any other name, is a collision and
blocks both PREFLIGHT and the locked APPLY guard.

The runner fails closed in this order:

1. exact operation, production target, lowercase 40-character commit, and checked-out SHA;
2. for APPLY only, the exact phrase, authenticated prior PREFLIGHT run/artifact, and freshly
   resolved deploy branch head;
3. exact Supabase project identity derived from the protected URL;
4. exact LF migration bytes, final newline, SHA-256, and transaction-safety scan;
5. a bounded, transaction-enforced **read-only** preflight over every accepted ledger
   identity, prerequisite, and postcondition;
6. for an existing partial target table, exact non-repairable compatibility: an ordinary
   permanent, non-partitioned, non-FORCE-RLS table with the three exact columns, PK, FK,
   expected owner relationship, no extra constraints, no unexpected unique/exclusion index,
   no user trigger/rewrite rule/policy/publication/reloption, only repairable ACL principals,
   and only allowlisted existing sources. An absent table is also safe. RLS, client grants,
   the named source CHECK, and functions are repairable by the migration;
7. exact prerequisites: ordinary permanent `auth.users`, `public.profiles`,
   `public.subscriptions`, and `public.user_roles` relations with every used typed column;
   the full 11-column profile order, types, nullability, defaults, generated/identity state;
   usable exact `profiles_pkey(user_id)` conflict support; the exact partial referral-code
   unique index; no unexpected CHECK/FK/UNIQUE/EXCLUDE constraint, index, INSERT trigger, or
   INSERT rule; a SECURITY DEFINER owner that can insert the supplied profile fields; the
   `public.app_role` operator label; pinned dependency definitions, owners, search paths, ACLs,
   effective privilege denials, and usable `user_roles` read access for `has_role`; and the
   enabled, fingerprinted `on_auth_user_created` trigger targeting `handle_new_user`;
8. a deliberately narrow migration-ledger compatibility contract matching Verdant's existing
   pinned production runner: current role `postgres`; ordinary permanent
   `supabase_migrations.schema_migrations`; ordered `version`, `name`, `statements` columns with
   exact types/nullability and no defaults/generated identity; exact `PRIMARY KEY(version)` and
   backing index; current-role schema/table ownership and owner-only ACLs; no RLS, policies,
   publication, inheritance, reloptions, user trigger, or rewrite rule; and effective
   SELECT/INSERT/lock capability. This is a compatibility requirement evaluated by PREFLIGHT,
   not a claim that this change measured today's live catalog;
9. a boolean creation-default ACL contract over applicable `pg_default_acl` rows for the
   current owner and `public` schema. Hardened defaults and the documented legacy
   PUBLIC/anon/authenticated/service-role table/function defaults are accepted only because
   the protected wrapper deterministically normalizes them; any other grantee, grantor, or
   privilege blocks SAFE_TO_APPLY;
10. pre-apply compatibility for all four replaceable function signatures: `handle_new_user`
    must exist, and every existing target function must have the expected unchangeable return
    shape, owner `postgres`, and only ACL/grantor entries the migration explicitly normalizes;
11. the SHA/project/state-bound receipt comparison;
12. the exact migration body, protected ACL normalization, and canonical bare-name ledger
    insert in one
    `psql --single-transaction` file under explicit READ COMMITTED isolation and bounded lock
    and statement timeouts. The same transaction takes SHARE ROW EXCLUSIVE locks on the
    migration ledger, `auth.users`, and `public.profiles`, then repeats the non-repairable ledger
    and profile guards before the migration body. The `auth.users` lock closes the gap between
    the historical backfill and installation of the new insert trigger;
13. an in-transaction exact ACL postcondition before the ledger insert, followed by the same
    bounded read-only query as postflight.

An accepted exact ledger identity plus the full live schema contract returns
`already_applied_verified` without attempting a write. A collision, incompatible partial
table, missing prerequisite, malformed result, changed receipt state, or recorded schema
drift blocks instead of deleting history or guessing. A failed apply transaction rolls back
both the migration body and ledger insert. A successful transaction whose postflight cannot
prove the complete contract remains **FAIL**, not PASS.

The uploaded evidence contains only allowlisted fixed identifiers, hashes/receipts,
boolean/classification results, timestamps, and enumerated reason codes. It never includes a
connection string, password, token, email, database row, raw query output, or raw `psql`
error. The same sanitized report is the only content copied into the workflow summary.

The immutable migration bytes and SHA remain unchanged. The protected transaction wrapper
adds only explicit revokes needed to neutralize legacy hosted default grants: direct
`service_role` access to the attribution table and unintended `service_role` execution of the
four repaired functions. The authenticated first-touch and operator snapshot grants remain
intentional. The migration-ledger `statements` array records two fixed markers: the exact
pinned-file SHA and `acl-normalization=v1;service_role=revoked`, so the ledger does not imply
that the file was the transaction's only statement.

The separate `Signup acquisition forward repair PG15` required gate uses the exact pinned
PostgreSQL 15.18 container image and a loopback-only disposable database. It scaffolds only
the required Supabase/auth dependencies, runs the real preflight SQL, and applies the immutable
migration plus ledger in one transaction. It proves exact postflight fingerprints; historical
user backfill; trigger attribution; valid, invalid, and expired first-touch RPC calls under the
authenticated role; operator and non-operator snapshots against paid/noise fixtures; direct
anon/authenticated table denial; application over a compatible partial table; and a deliberate
late-transaction failure that leaves neither schema nor ledger state. Its two-session race case
observes the concurrent signup blocked by the `auth.users` lock, then proves that signup resumes
under the newly installed trigger with both profile and attribution. Negative catalog cases
cover profile column/default/constraint/index/INSERT-trigger/rule drift, migration-ledger
shape/owner/ACL/trigger drift, dependencies, and target-table drift. The signup cases use no
referral code and therefore prove the ordinary non-referral path; they do not claim an end-to-end
credit grant through `convert_referral`. The gate never receives or contacts a Verdant database
URL. On a workstation without PostgreSQL or Docker, this proof remains locally BLOCKED until CI
runs it.

The pinned migration itself remains a single self-contained, idempotent forward repair: it
creates the table, re-asserts the CHECK allowlist separately, re-issues all four functions
with `CREATE OR REPLACE`, and backfills historical attribution `ON CONFLICT DO NOTHING`.

**Every partial-apply prefix is safe.** `CREATE TABLE IF NOT EXISTS` is at line 35; the
`handle_new_user` re-issue that widens the allowlist is at line 91. There is no prefix in
which the allowlist widens while the table is still absent. Fail between them and the main
break is _already_ fixed, with `blueprint_targets` still resolving to `NULL`.

This ordering is load-bearing, and it is why the two changes ship in one file:
**`/tools/blueprint-targets` currently succeeds precisely because the live allowlist omits
its source.** It resolves to `NULL` and never reaches the missing table. Widening the
allowlist without creating the table first would flip a working surface to broken.

### Expect the backfill to insert ~zero rows

That is success, not a failed apply. The backfill replays `auth.users` rows carrying
allowlisted metadata — but under the mechanism above, those accounts were never created.

### Verifying the apply worked

The workflow's read-only postflight is the authoritative first gate. It requires the exact
accepted version/name identity; exact table columns, PK, FK, validated CHECK, and no-policy
shape; RLS and client-access fences; the exact 11-source allowlist; the measured
`pg_get_functiondef` fingerprints and security/search-path/grant metadata for all four
functions; the authoritative `public.subscriptions` paid source; and explicit absence of a
retired `billing_subscriptions` query branch. The compact query below remains useful for a
human spot-check, but it is weaker than the protected postflight and must not replace it.

```sql
SELECT to_regclass('public.signup_acquisition_attributions') IS NOT NULL AS table_exists,
       (SELECT count(*) FROM pg_proc
         WHERE proname IN ('record_signup_acquisition_first_touch',
                           'signup_acquisition_operator_snapshot',
                           'signup_to_paid_operator_snapshot')) AS functions_present,
       -- Exact and name-bound. NOT `version = '...'` alone (false negative: Lovable records
       -- a version ~2s after the filename timestamp) and NOT a version window (false
       -- positive: a neighbouring migration one second away would satisfy it). See
       -- "Ledger hazard" above for both traps.
       (SELECT count(*) FROM supabase_migrations.schema_migrations
         WHERE name = '20260813030000_signup_acquisition_forward_repair'
            OR name = 'signup_acquisition_forward_repair'
            OR version = '20260813030000') AS migration_recorded;
```

Expect `true`, `3`, `1`. Then confirm end to end by completing a signup from the homepage CTA.

Use a new disposable email address, confirm that account creation returns success rather
than GoTrue HTTP 500, complete the initial grow/tent/plant setup, then remove the disposable
account through the approved cleanup path. Record the observed HTTP/result classification;
do not put the email address, access token, or user ID into the workflow artifact.

If `migration_recorded` is `0` but `table_exists` is `true` and `functions_present` is `3`,
the apply **worked** and only the ledger row is missing — treat the object state as
authoritative, and see the "Ledger hazard" section above, because an unrecorded repair is
exactly the condition that lets a later catch-up re-run it out of order.

### Failure and rollback notes

- Before the apply transaction commits, rerun after correcting the enumerated blocker; no
  persistent write is assumed.
- A moved branch, rejected artifact, or receipt mismatch is not an APPLY retry signal. Run a
  fresh PREFLIGHT, approve it through a different eligible reviewer, and start a separate
  APPLY dispatch using the new run ID.
- After a successful commit, do not delete the ledger row and do not edit the merged
  migration. Any genuine regression requires a separately reviewed additive forward
  migration.
- The workflow does not disposition the seven legacy ledger rows discussed above. That is a
  separate founder decision after this exact repair is applied and verified.
- The workflow does not publish the frontend, deploy Edge Functions, change secrets, or
  claim the browser signup journey passed. Those are separate release/e2e gates.

### Also fixed by the same apply

`record_signup_acquisition_first_touch` is absent in production today, so OAuth first-touch
attribution silently no-ops and the pending `sessionStorage` value is retained until its
30-minute TTL expires. Analytics-only, and distinct from the signup outage — but the same
apply resolves it.

---

## Why nothing alerted

Worth recording, because it is the reusable lesson rather than a detail of this incident:

- **The failure signal has no first-party persistence — and it is blocked FOUR ways, not
  one.** A sink exists _in the repo_: `src/components/FunnelEventDbSink.tsx` is mounted in
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
     `userId` _before_ it inspects the event at all. And `signup_failed` is emitted at
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
  cannot be measured, report the blocker instead of claiming success".

  Checking GA4 for `signup_failed` since 2026-07-21 is a genuine open lead, but **treat it as
  a lead and nothing more.** `Auth.tsx` emits that event with `reason: "auth_rejected"` for
  **every** `supabase.auth.signUp` error — rate limiting, duplicate account, provider outage,
  a rejected password. A nonzero count would therefore be consistent with this outage but
  would not demonstrate it; it only becomes evidence when correlated with a server-side
  `42P01` in the database logs for the same window. A **zero** count would be the more
  informative result, since it would be hard to reconcile with anyone having hit this at all.

- **No test could catch it.** Every repo test touching this subsystem is a static scan that
  pins SQL text in migration _files_. The runtime lane (`test:security-db-local`) does a
  `supabase db reset`, which applies **every** migration to a fresh database — where the table
  exists. Production's partial-apply state is unreproducible in CI by construction.
- **Documented precedent.** `scripts/probe-migration-drift.mjs` records the identical class on
  2026-08-05: seven migrations never reached prod for six days, "including an
  `action_queue_create` RPC that shipped client code already calling it. That was a live
  user-facing break. Nothing alerted. CI was green the entire time."
