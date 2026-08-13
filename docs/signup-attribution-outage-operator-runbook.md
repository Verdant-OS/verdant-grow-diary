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

Sanitized queries and their verbatim results, so each check is reproducible:

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

**Falsifier, if you ever want to re-check.** Any `auth.users` row carrying one of the ten
live-allowlisted sources and created *after* `20260721194325` was applied would disprove the
mechanism outright, because the `INSERT` must once have succeeded. Zero rows proves nothing
on its own.

```sql
SELECT raw_user_meta_data->>'verdant_signup_source' AS src,
       count(*), min(created_at), max(created_at)
FROM auth.users
WHERE raw_user_meta_data->>'verdant_signup_source' IS NOT NULL
GROUP BY 1 ORDER BY 1;
```

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
       (SELECT count(*) FROM supabase_migrations.schema_migrations
         WHERE version = '20260813030000') AS migration_recorded;
```

Expect `true`, `3`, `1`. Then confirm end to end by completing a signup from the homepage CTA.

### Also fixed by the same apply

`record_signup_acquisition_first_touch` is absent in production today, so OAuth first-touch
attribution silently no-ops and the pending `sessionStorage` value is retained until its
30-minute TTL expires. Analytics-only, and distinct from the signup outage — but the same
apply resolves it.

---

## Why nothing alerted

Worth recording, because it is the reusable lesson rather than a detail of this incident:

- **The failure signal has no first-party persistence — and it is blocked THREE ways, not
  one.** A sink already exists: `src/components/FunnelEventDbSink.tsx` is mounted in
  `src/routes/__root.tsx` and subscribes to the same `verdant:analytics` bridge, writing
  catalogued events into `public.funnel_events` (migration `20260813020000`). Extend it rather
  than building a second one — but note that fixing only the two obvious blockers still
  persists nothing:

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
  review, not a one-line relaxation of an intentional fence. Cataloguing `signup_failed` and
  applying `20260813020000` are necessary but **not sufficient**; without a deliberately
  designed signed-out ingestion path, this specific signal still cannot be persisted.

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
