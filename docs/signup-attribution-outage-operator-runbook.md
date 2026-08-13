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

---

## Scope — this is not every signup

**Affected** (source is in the live 10-value allowlist, so the `INSERT` is attempted):

- `landing_page` — the front-door CTA on `/` and `/welcome`. Emits
  `utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch` with no utm params
  needed from the visitor.
- `pricing_page`, `founder_page`, `founder_share`, `vpd_calculator`, `context_check`,
  `csv_history`, `operator_outreach`, `grower_invite`, `pricing_interest_share`.

**Unaffected — these still work today:**

- Google OAuth — passes no user metadata at signup, so `v_signup_source` is `NULL`.
- Magic link — uses `shouldCreateUser: false`, so it never creates a user or fires the trigger.
- A bare `/auth?mode=signup` with no utm params.
- Any partial utm match. `resolvePaidAcquisitionSource` requires an **exact**
  source + medium + campaign triple and fails closed to `NULL`, so ordinary paid-ad and
  organic utm traffic is not affected.
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

- **No telemetry sink.** `trackFunnelEvent` / `trackPricingEvent` dispatch a `window`
  CustomEvent and call `gtag`. There is no database sink, and the GA4 authenticated baseline
  is recorded as blocked — so the one signal that would have revealed this lands somewhere
  nobody can currently read.
- **No test could catch it.** Every repo test touching this subsystem is a static scan that
  pins SQL text in migration *files*. The runtime lane (`test:security-db-local`) does a
  `supabase db reset`, which applies **every** migration to a fresh database — where the table
  exists. Production's partial-apply state is unreproducible in CI by construction.
- **Documented precedent.** `scripts/probe-migration-drift.mjs` records the identical class on
  2026-08-05: seven migrations never reached prod for six days, "including an
  `action_queue_create` RPC that shipped client code already calling it. That was a live
  user-facing break. Nothing alerted. CI was green the entire time."
