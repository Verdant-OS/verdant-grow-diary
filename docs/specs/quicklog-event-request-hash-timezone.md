# Quick Log event request hash — session TimeZone independence

Status: **IMPLEMENTED as a draft PR — stays draft. Schema/function change: Matthew approves before anything ships.**
Audited on deploy tip `0107d9406` (#1836), 2026-10-01. Companion to draft #1841 (manual path).

## 1. Finding

`established fact` — the event path is exposed more widely than the brief assumed.

The event idempotency hash is **not** computed by `quicklog_event_request_hash_pre_logged_at`.
That helper is only consulted to recognise pre-dual-timestamp rows (`v_is_exact_legacy_retry`,
`v_is_mirrorless_legacy_retry` in `20261001140000`). The hash that is stored and compared for
every current save is computed **inline in the frozen delegate**
`quicklog_save_event_pre_logged_at` (body from `20260725023000`, prosrc md5 `674f6b27…`, pinned
by the 140000 preflight), and the delegate itself returns `idempotency_key_conflict`.

The delegate hashes two session-TimeZone renderings:

| Field in delegate hash | Source                                                                               | Session-TZ dependent? |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| `occurred_at`          | `p_occurred_at` (timestamptz)                                                        | yes, when non-null    |
| `details.logged_at`    | wrapper injects `jsonb_build_object('logged_at', v_logged_at)` into `v_call_details` | **yes, always**       |

So **every** new-contract event save is exposed, including callers that send
`p_occurred_at = null`. On retry the wrapper reuses the stored `logged_at` instant, but renders
it again in the retry session's zone.

Reproduced (PGlite = PostgreSQL 17.5, same jsonb encoder as PG15; PG15 `NOT_MEASURED`): the same
instant, the same request, four zones (UTC, America/New_York, Asia/Kolkata, Pacific/Chatham) give
four different delegate hashes, **both** with `occurred_at` set and with `occurred_at` NULL.

## 2. Real risk vs not

- `established fact`: no client sends `Prefer: timezone` (grep of `src/`, `supabase/functions/`).
  No edge function calls `quicklog_save_event`.
- `established fact`, callers: `writeQuickLogWateringTypedEvent` (`occurred.iso`),
  `harvestCureQuickLogPersistencePayload` (`input.occurredAt`), and `useQuickLogActivitySave`
  (`input.occurredAt ?? null`) send non-null values. `createQuickLogEvent` sends null. The
  pending stores replay the exact payload. All callers are still exposed through `logged_at`.
- `inference`: production sessions are probably UTC (Supabase default), so stored hashes are
  probably already UTC-form. `NOT_MEASURED`: live role/database `TimeZone`.
- Trigger: a client adding `Prefer: timezone`, or a role/database `TimeZone` change between a
  save and its retry.
- Impact: an exact retry is refused (`idempotency_key_conflict`). Fails closed. No duplicate row,
  no cross-user effect, no widened acceptance.
- Verdict: **real but latent, low severity** — the same class as #1841, wider surface.

## 3. Why #1841's shape does not transfer directly

The manual wrapper computes and compares its own `manual_v1` hash and short-circuits reuse
itself, so #1841 only has to change one expression. The event wrapper delegates the comparison
to a delegate whose body is frozen and md5-pinned, and the delegate receives `p_occurred_at` as
a timestamptz. The wrapper cannot pass text in its place. It can only control the TimeZone in
which the delegate renders it.

## 4. Fix (one additive migration, wrapper only)

File: `supabase/migrations/20261001190000_quicklog_event_request_hash_utc.sql` (sha256
`d8cccdcc…a352`). The version is after #1841's `180000`. The two do not depend on each other.

1. **Preflight** (P0001 `quicklog_event_request_hash_utc_preflight_unrecognized` otherwise):
   - wrapper: owner `postgres`, SECURITY DEFINER, returns jsonb,
     `proconfig = {search_path=public, pg_temp}`, prosrc md5 **`959d2add8823a738560dec9e9f53920e`**
     (140000; computed from source with the method that reproduces 012000's `ac1f3e22…`);
   - delegate: the same attributes, md5 `674f6b2718cd1a68c15970663e185b57`;
   - legacy helper: STABLE, returns text, `proconfig = {search_path=pg_catalog, pg_temp}`, md5
     `7d5fe89b921c640c848ee2293ea1d264`;
   - anon denied, authenticated granted.
2. **Wrapper changes**. Everything else is byte-identical to 140000, and the vitest file pins
   the exact removed-line set.
   - Declarations: `v_caller_time_zone text := pg_catalog.current_setting('TimeZone')`,
     `v_legacy_request_hash_utc`, `v_session_call_details`, `v_is_session_hash_retry`.
   - Legacy recognition: the legacy helper hash is computed once in the caller zone and once
     under UTC, before the receipt check. The UTC call sits between a `set_config('TimeZone',
'UTC', true)` and an immediate restore. `v_is_mirrorless_legacy_retry` and
     `v_is_exact_legacy_retry` accept `IN (v_legacy_request_hash, v_legacy_request_hash_utc)`.
   - Compat branch: `v_is_session_hash_retry` is true when an existing key's stored hash
     equals the helper over the caller-zone details (`v_session_call_details`). The helper's
     field set is the delegate's. That retry calls the delegate in the caller zone, as today.
   - Canonical branch, for everything else including new rows: inside the existing
     `BEGIN … EXCEPTION` block, switch to UTC (or stay in the caller zone for the compat
     branch). Build `v_call_details` there, so `logged_at` renders in the switched zone. Call
     the delegate, then restore `v_caller_time_zone` straight away, before any `RETURN`. An
     aborted block reverts the switch itself.
   - `proconfig` is **unchanged**. A function-level `SET TimeZone` was rejected for two reasons:
     it hides the caller zone, which the compat branch needs, and it changes `proconfig`, which
     every future preflight pins.
3. **Postcondition**: wrapper md5 `834408e54794ac4980757f86699ce45c`; owner `postgres`, SECURITY
   DEFINER, `proconfig` unchanged; anon denied; authenticated and service_role granted. The
   `REVOKE`/`GRANT` block is byte-identical to 140000.

Residuals (documented and asserted, not regressions):

- A pre-repair non-UTC current-contract row retried from a _different_ offset is still
  refused (`idempotency_key_conflict`).
- A pre-dual-timestamp row hashed in a non-UTC zone is still refused from any other offset,
  UTC included (`idempotency_receipt_missing`).

## 5. Tests and harness

- `scripts/run-quicklog-event-request-hash-utc-pg15-harness.mjs` builds the real delegate,
  foundation wrapper and legacy helper. It applies the pinned 012000 and 140000 migrations,
  reusing `MIGRATION_SHA256` and `FORWARD_MIGRATION_SHA256` unchanged, then applies this repair.
  It has 13 assertions:
  - pre-repair witnesses:
    - cross-zone conflict with `occurred_at` set;
    - cross-zone conflict with `occurred_at` NULL, caused by `logged_at` alone;
    - legacy-helper cross-zone `idempotency_receipt_missing`;
  - identity (owner, ACL, config, SECURITY DEFINER) unchanged by the repair;
  - after the repair:
    - the UTC-stored key is reused from 4 zones and from an offset literal of the same instant;
    - the NULL `occurred_at` key is reused cross-zone, with its stored hash unchanged;
    - a same-zone legacy NY key is reused, and the cross-zone residual is refused;
    - a UTC-hashed legacy-helper row is reused from Kolkata, a NY-hashed one is reused only
      from NY, and the residuals are refused;
    - a new Kolkata row and a fractional-offset row store exactly the UTC-session hash;
    - a changed instant and a changed note are refused, with single rows kept;
    - an abort forced inside the delegate (harness trigger) returns `save_failed`, writes no
      key, and restores the caller zone;
    - wrapper md5 and ACL fence;
    - re-applying the migration is refused with P0001.
  - Every call also asserts that `current_setting('TimeZone')` afterwards equals the caller's
    zone.
- `src/test/quicklog-event-request-hash-utc-pg15-harness.test.ts` (13 tests):
  - target rejection and the sentinel guard;
  - the repair's bytes, version order and preflight/postcondition md5 pins;
  - signature and grants identical to 140000, and no `SET TimeZone` in `proconfig`;
  - the exact removed-line set, and no new DML, grant or `RETURN`;
  - each switch restored before any return;
  - the workflow wiring.
- RED: with the repair replaced by `select 1;`, the harness fails at
  `utc_stored_hash_retries` (a UTC-stored key retried from New York is refused).
- `.github/workflows/quicklog-event-replay-lock-pg15.yml` adds the three paths and one step,
  which runs after the existing lock harness.
- Re-pins: none were needed. All 206 test files that scan `supabase/migrations` were run. The
  only failures were environmental: four DB proofs BLOCKED on Windows, and one load timeout
  that passes when run alone.

## 6. Coordination

- **#1841** (manual): there is no file overlap with this fix. Ship them independently. Before
  #1841 lands, it should add the event-path finding to its "Residual" note, because the manual
  `v_call_details.logged_at` is also session-rendered. It is harmless there: the manual wrapper
  reuses before calling the delegate, so that text never reaches a compared hash (`inference`
  from 180000 l.296–345; assert it in #1841's harness).
- **#1810** (manual delivery order): it does not touch the event wrapper, the event workflow or
  the event harness. No collision. Only #1841 and #1810 share `quicklog-manual-reuse-fence-pg15.yml`.
- No other open PR edits `quicklog_save_event` (checked against `gh pr list`, 2026-10-01).

## 7. Out of scope

The delegate body, the helper, tables, RLS, client code, production APPLY/PREFLIGHT, Publish.
