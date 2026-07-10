# Grow Watch — Server-Side Alert Evaluation & Delivery (Spec)

**Status:** Proposed (implementation-ready) · **Date:** 2026-07-09 · **Owner:** matt

The Pro anchor feature: *your grow is watched while you're away.* Today,
environment alerts are computed client-side only while the app is open
(`src/hooks/usePersistEnvironmentAlerts.ts`; ingest functions deliberately
never trigger alerts) — a tent can cook overnight unnoticed. Meanwhile a
production-grade email pipeline (pgmq, DLQ, suppression, pg_cron worker)
sits idle with auth emails as its only producer. This spec connects the two
with a server-side evaluator and outbound delivery, packaged as the
headline Pro capability.

**Provenance.** Produced by a 12-agent research/draft/critique workflow over
the actual codebase (5 subsystem deep-reads → 4 section authors → 3
adversarial skeptics: scale, security, solo-founder ops), then redlined to
fold in all 24 critique findings (8 blockers, 13 majors, 3 minors). Every
claim cites a repo file. Key normative decisions: canonical schema glossary
(one table, one definition), 10-minute evaluation SLO with set-based SQL and
SKIP LOCKED tent claiming, wall-clock hysteresis (minutes, never
run-counts), per-user storm collapse + fleet-offline circuit breaker,
digest on its own pgmq queue, generic value-free email subjects
(jurisdictional privacy), unsubscribe hardening, an external dead-man's
switch as a Phase 0 exit criterion, and — structurally — the entitlement
function copies `has_pheno_tracker_entitlement`'s union pattern with a
guard test pinning the FINAL migration state (the `ai_credit_spend`
landmine must be structurally impossible here).

**Phases:** 0 observability → 1 free opt-in daily digest → 2 Pro real-time
alerts + reminders + recovery notices → 3 push/escalation. Each phase is
independently shippable and reversible.

---

# Environment Alert Delivery — Product & Entitlement

## 1. Feature name and promise

**Feature name:** `Grow Watch` (working title; internal id `alert_delivery`).

**One-line promise:** *"Your grow is watched while you're away — get an email when a tent drifts out of range or a sensor goes quiet."*

Note the deliberate phrasing: "watched," not "protected" or "monitored 24/7." Alerts today are computed client-side only while the app is open (`src/hooks/usePersistEnvironmentAlerts.ts`; ingest functions carry a stop-ship "NEVER triggers alerts" contract at `supabase/functions/ecowitt-ingest/index.ts:7-9`). This feature is the first server-side evaluator + email producer. Its worst failure mode is silence that looks like a healthy grow, so Phase 0 exit criteria include an **external dead-man's switch**: the evaluator and `process-email-queue` each ping a hosted heartbeat monitor (e.g. healthchecks.io) at the end of every successful run, and a missed ping pages the operator through a non-Supabase channel. Until seven consecutive days of external heartbeats have been received in prod, the copy must not promise guaranteed delivery. See §6.

## 2. Packaging: Free vs Pro

| Capability | Free | Pro (`pro_monthly`, `pro_annual`, `founder_lifetime`) |
|---|---|---|
| In-app alerts (Alerts page, `public.alerts` rows) | ✅ unchanged — server evaluator writes rows for everyone | ✅ |
| Alert history reads | ✅ always (house pattern: SELECT stays ungated, lapsed users keep history — `supabase/migrations/20260709192453` RESTRICTIVE-policy convention) | ✅ |
| **Daily email digest** (opt-in; one email/day summarizing open alerts + recoveries) | ✅ — this is the teaser. Opt-IN: no `alert_delivery_prefs` row = no digest, and the digest toggle is plain owner RLS so Free users can always flip it off | ✅ |
| **Real-time alert email** (per-breach, sustain-window gated) | ❌ upgrade prompt | ✅ |
| Sensor offline / stale notices by email | ❌ (in-app only) | ✅ prompt (subject to the fleet-offline circuit breaker, §3.4) |
| Per-tent / severity / quiet-hours preferences | Digest on/off only (own row, plain owner RLS) | ✅ full (`realtime_enabled`, `min_severity`, quiet hours, per-tent override rows) |
| Push / SMS | — | Later; email is the only v1 channel. Real-time notices ride the existing transactional pgmq pipeline (`supabase/migrations/20260707153206_email_infra.sql`); the digest rides its **own** `digest_emails` pgmq queue (12–24 h TTL) processed by an extension of the same worker loop, so digest cohorts can never head-of-line-block breach notices |

**Why this split holds against willingness-to-pay.** The target buyer already owns $500–$2,000 of tents, lights, and Ecowitt/Pi sensor hardware (60 s gateway cadence per `docs/ecowitt-windows-testbench.md:82`; Pi bridge per `docs/pi-bridge-contract.md`) and each grow cycle carries months of sunk time. One overnight heat event that goes unnoticed costs more than a year of Pro. Prompt delivery is therefore the single highest-WTP capability in the product — it is the reason a sensor-owning grower upgrades, and it maps exactly onto the existing (unused) `liveSensors` premium capability (`src/lib/entitlements/planCatalog.ts:18-44`, `PremiumLiveSensorGate` with zero production consumers). The free opt-in daily digest keeps the alerts table valuable for everyone, demonstrates the pipeline works (trust-builder), and creates a daily "you missed this by hours" upgrade moment — the digest itself shows the timestamp gap between breach and digest send.

**Capability flag:** add `alertDelivery: boolean` to the frozen `Capabilities` objects in `src/lib/entitlements/planCatalog.ts` + `src/lib/entitlements/capabilities.ts` and the type in `src/lib/entitlements/types.ts` (`PRO_CAPABILITIES.alertDelivery = true`, `FREE_CAPABILITIES.alertDelivery = false`). This flag is **display-only** on the client: the recursive scanner in `src/test/live-sensor-server-gate.test.ts` fails the build if app code consumes a capability as an access gate, so all real gating is server-side (§5).

## 3. Alert types — v1

All types write standard `public.alerts` rows (severity/status vocabularies CHECKed by migration `20260520233437`) so the Alerts page, AlertDetail, and Action Queue handoff work unchanged.

**Cross-user poisoning defense (applies to every type):** the evaluator runs as service_role (RLS bypass), and `sensor_readings.tent_id` is a soft reference a hostile user can point at someone else's tent. Every evaluator read of `sensor_readings` therefore MUST carry the predicate `user_id = tents.user_id` (joined from the resolved tent row) — snapshot, staleness, and recovery queries alike — pinned by a static-scan test. Without it, user A could fire, mask, or suppress emails about user B's tent by inserting `manual`-source rows with B's `tent_id`.

1. **Temperature out of range** — per-grow `grow_targets` band, else stage bands (`src/lib/environmentStageTargetRules.ts:70-88`), else generic 18–30 °C default (`src/lib/defaultEnvironmentThresholds.ts:44-48`).
2. **Humidity out of range** — same source chain; generic default 35–70 %.
3. **VPD out of range** — same chain; generic 0.6–1.6 kPa; sustained-drift detection reuses `public.evaluate_vpd_drift_ewma` (migration `20260604063855`, alpha 0.3, 360-min window, min 6 readings) so a single spike does not email anyone.
4. **Sensor offline / stale** — no `quality='ok'` reading with `captured_at` newer than the 30-minute staleness bound (`src/lib/sensorQuality.ts:72`, `STALE_THRESHOLD_MS` in `src/lib/sensorSnapshot.ts:114`) for a tent that was previously reporting. **Fleet-offline circuit breaker:** if more than `alert_evaluator_state.fleet_offline_breaker_pct` of due sensor-connected tents transition to offline in one run (a platform ingest incident, not a thousand simultaneous dead batteries), offline *deliveries* are suppressed for that run — in-app alert rows are still written — and the operator is alerted instead. Offline emails are therefore best-effort by design, and the copy must reflect that (§6.4).
5. **Recovery notice** — metric back inside band (respecting deadbands: VPD 0.05 kPa, temp 0.3 °C, RH 1.5 %) or sensor reporting again, after a previously emailed breach, sustained for `clear_minutes`. Recovery emails are sent only for breaches that were themselves emailed, and every send — initial, reminder, recovery — is claimed through the `alert_deliveries` ledger under `UNIQUE(alert_id, channel, kind)` with `kind IN ('initial','reminder','recovery')`, so "why did I get three emails?" always has three ledger rows. While a breach stays in phase `'notified'`, one reminder (`kind='reminder'`) is sent after `reminder_after_minutes` (engine section owns the state machine).

**Out of scope v1:** CO2 (no `grow_targets` column, intentionally excluded from defaults — `defaultEnvironmentThresholds.ts:10`), soil metrics as email triggers (in-app only), harvest/unknown stages (stage classifiers intentionally produce no alerts — keep this suppression server-side), and anything sourced from `sim`/`csv`/`diary` readings (persistence whitelist is `live`/`manual` only, `src/lib/environmentAlertPersistence.ts:46-55`).

**Severity note for delivery:** the existing model never marks real environment breaches `critical` — target breaches are hardcoded `warning` (`src/lib/environmentAlerts.ts:170-190`). Delivery therefore keys on **alert type + sustained wall-clock duration** (`sustain_minutes` / `clear_minutes` / `reminder_after_minutes` knobs on `alert_evaluator_state` — minutes, never run-counts), not on inheriting severity; the escalation model is defined in the evaluator section of this spec, not here.

## 4. Preferences

There is no DB-backed prefs table today (Settings prefs are localStorage-only — `src/lib/temperatureUnitPreference.ts`) and no timezone column anywhere in the schema (grep across migrations/`types.ts` confirms). A server evaluator cannot read localStorage, so preferences require one new table:

**`alert_delivery_prefs`** — per-user rows plus optional per-tent override rows (nullable `tent_id`); full DDL lives in the Data Model section. What matters here is the **two-surface RLS split**, which is compliance-critical:

- **Free-writable fields (plain owner RLS — no RESTRICTIVE entitlement policy, ever):** the digest/email-enabled fields. **The digest is opt-IN: no row (or digest disabled) means no digest.** A Free user's opt-out is therefore: never opt in, flip their own row off, or click the unsubscribe link — no entitlement gate may ever stand between a user and stopping recurring email (CAN-SPAM baseline, and the majority tier's only write path).
- **Pro-only fields (RESTRICTIVE `has_alert_delivery_entitlement` policy on INSERT/UPDATE, SELECT ungated):** `realtime_enabled`, `min_severity` (`text CHECK (IN ('info','watch','warning','critical')) DEFAULT 'warning'`), quiet-hours fields (`quiet_hours_start`/`quiet_hours_end time`, plus an IANA timezone set alongside them from `Intl.DateTimeFormat().resolvedOptions().timeZone` — required only when quiet hours are set), and all per-tent override rows (`tent_id IS NOT NULL`: mute, min-severity, realtime overrides; nullable columns inherit the user row). SELECT stays ungated so lapsed users still see their old settings (house pattern).

Behavioral semantics:

- **Quiet hours (Pro):** real-time emails are suppressed during quiet hours. There is **no hold/replay queue in v1** — the in-app alert row remains and appears in the next daily digest if the user opted in. Never describe held notices as "delivered later."
- **Digest timing, v1:** the digest sends in a fixed UTC window, staggered into hourly cohorts on the `digest_emails` queue — **no timezone is required to opt in**. Timezone-aware `digest_hour` is a later phase; the earlier "timezone required at first save" requirement is removed.
- **Thresholds are not duplicated here.** The threshold source stays `grow_targets` (one row per grow, `20260520225333`) → stage bands → generic defaults, exactly as the client evaluator resolves them. Preferences choose *whether/when to deliver*, never *what counts as a breach*.
- **No recipient field.** The recipient is exclusively `auth.users.email` of the resolved tent owner, read via service_role, and only when `email_confirmed_at IS NOT NULL`. There is no user-writable recipient in v1; any future custom notification address requires its own verified double-opt-in loop. (A writable recipient would turn the pipeline into an arbitrary-recipient harassment engine against the shared sending domain that also carries auth email.)

**UI landing spot:** the Settings "Notifications" tile already exists in `coming_soon` state with copy "Critical alerts only · Email + in-app" (`src/pages/Settings.tsx:433-437`). Flip to `available` via `settingsTilesRules`, and rewrite that copy — "Critical" is on the banned-word list for grower surfaces (`docs/v0-release-checkpoint.md:351`; enforced by `src/test/diaryTimelineEvidenceQualityRules.test.ts:71`). Suggested tile copy: *"Out-of-range and sensor-quiet notices · Email + in-app."* The Pro-gated controls render behind a server-preflight gate cloned from `useLiveSensorServerGate` + `PremiumLiveSensorGate` (`src/hooks/useLiveSensorServerGate.ts`, `src/components/PremiumLiveSensorGate.tsx` — currently zero consumers; this feature is its first). Settings must also surface suppression state — *"email notices are disabled for this address"* with a re-enable path — so a hostile or accidental unsubscribe is visible to the account owner rather than silent.

## 5. Entitlement gating — exact points

**Single source of truth: a new SQL function `public.has_alert_delivery_entitlement(_user_id uuid)`, copied from the canonical union pattern EXACTLY** (`has_pheno_tracker_entitlement`, final state in migration `20260709193855:12-56`): both billing tables, status + `current_period_end` checks, anti-oracle guard, REVOKE/GRANT posture. Do **not** copy `ai_credit_spend` (migration `20260709015647` reads only `billing_subscriptions` with no status/period check — the verified landmine that gives live `/pricing` buyers free-tier treatment).

```sql
CREATE OR REPLACE FUNCTION public.has_alert_delivery_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_uid uuid;
BEGIN
  -- Anti-oracle guard: non-service_role callers may only probe themselves.
  v_role := current_setting('role', true);
  v_uid := auth.uid();
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN
    -- Branch 1: BYO billing table.
    EXISTS (
      SELECT 1 FROM public.billing_subscriptions bs
      WHERE bs.user_id = _user_id
        AND bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
        AND (
          (bs.status IN ('active', 'trialing')
            AND (bs.current_period_end IS NULL OR bs.current_period_end > now()))
          OR (bs.status = 'canceled'
            AND bs.current_period_end IS NOT NULL
            AND bs.current_period_end > now())
        )
    )
    -- Branch 2: Lovable subscriptions table (live /pricing buyers land here).
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = 'live'
        AND (
          (s.status IN ('active', 'trialing')
            AND (s.current_period_end IS NULL OR s.current_period_end > now()))
          OR (s.status = 'canceled'
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now())
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.has_alert_delivery_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_alert_delivery_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_alert_delivery_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_alert_delivery_entitlement(uuid) TO service_role;
```

Both index lookups are already served: `billing_subscriptions.user_id` is UNIQUE (`20260605223431:7`) and `subscriptions` has the partial `idx_subscriptions_user_env_active` index (`20260709083556:21-25`) — cheap enough to call per-delivery in the cron worker (and the set-based evaluator only calls it for tents that actually reached the notify transition).

**Gate points (delivery-time, not row-creation-time):**

1. **Alert row creation: NOT gated.** The server evaluator writes `public.alerts` rows for every user (free in-app value; keeps Alerts page/history/Action Queue universal).
2. **Real-time email enqueue (the primary gate):** the notification producer (service-role edge fn/worker) calls `has_alert_delivery_entitlement(user_id)` — or the shared TS equivalent, an `assertAlertDeliveryEntitlement` cloned from `supabase/functions/_shared/assertPhenoTrackerEntitlement.ts:32-49` over `loadUnionEntitlement` (`supabase/functions/_shared/unionEntitlementLookup.ts`) — **immediately before enqueue**, in the same code path that checks `suppressed_emails` (which nothing enforces today — `email_infra.sql:213-242` has zero readers; this producer must implement both checks). The entitlement check sits downstream of the engine's storm controls (per-user per-tick collapse, fleet-offline breaker, per-key cooldowns, `daily_cap_per_user` on `alert_evaluator_state`) and every send is claimed through `alert_deliveries` (`UNIQUE(alert_id, channel, kind)`); every evaluated-but-not-sent decision writes a ledger row with its skip reason. Fail closed: entitlement-lookup error ⇒ no real-time email; the in-app row remains and appears in the next digest for opt-ins. Note the SQL fn hard-codes `s.environment='live'`, so staging/local harnesses must seed `billing_subscriptions`, not sandbox `subscriptions` rows.
3. **Daily digest enqueue: not entitlement-gated** (free teaser), but strictly **opt-in** — no `alert_delivery_prefs` row with the digest enabled, no digest. Digest sends go to the dedicated `digest_emails` pgmq queue, are made idempotent per user-day by `digest_send_state` (`user_id` PK, `last_digest_date`, `message_id`), and still check `suppressed_emails` under the digest scope.
4. **Prefs writes:** RESTRICTIVE RLS policies on `alert_delivery_prefs` cover **only** the Pro-only realtime/quiet-hours fields and per-tent override rows, calling `has_alert_delivery_entitlement(auth.uid())`, generated with the `20260709192453` DO-loop pattern (DROP POLICY IF EXISTS + `AS RESTRICTIVE ... TO authenticated`); the digest fields stay under plain owner RLS; SELECT ungated everywhere. (Full policy DDL: Data Model section.)
5. **Settings UI preflight:** an `alert-delivery-entitlement` edge fn cloned whole-file from `supabase/functions/live-sensor-entitlement/index.ts` (anon-key client + caller JWT, never service_role for entitlement reads, surface allow-list, sanitized 200/403 — never billing IDs), consumed by a `useAlertDeliveryServerGate` hook. Client never sends `billing_env`/plan claims.

**Mandatory guard tests:**

- `src/test/alert-delivery-entitlement-oracle-guard.test.ts`, copied from `src/test/pheno-tracker-entitlement-oracle-guard.test.ts` with the function name swapped. It must use the **latest-migration-mentioning-the-function** scan (`latestMigrationBodyMentioning`, lines 22-31) — never a hardcoded migration path (the hardcoded-path test at `src/test/ai-credit-entitlement-sql.test.ts:9-11` is exactly how the `ai_credit_spend` CREATE OR REPLACE regression slipped through, so this test pins the FINAL migration state) — and assert: anti-oracle regexes, `RETURNS boolean` with no `provider_*`/`paddle_*` leakage, the REVOKE/GRANT footer, `SECURITY DEFINER` + `STABLE` + `SET search_path TO 'public','pg_temp'` (exactly that quoting form — the test regex rejects the `= public, pg_temp` variant), **and both table names `billing_subscriptions` and `subscriptions` present in the body** with `status` + `current_period_end` checks.
- The prefs-RLS guard test must additionally assert the inverse gate: **the digest-toggle write path on `alert_delivery_prefs` has NO RESTRICTIVE entitlement policy** — a later migration that RESTRICTIVE-gates the Free opt-out fails CI.

## 6. Honest marketing constraints

These are launch-blocking copy rules, not suggestions:

1. **Digest-first framing until the dead-man's switch is live.** There is no error tracking (no Sentry), the DLQ is a terminal sink nobody watches (`process-email-queue/index.ts:56-79`), transactional emails older than 60 min are silently dropped to DLQ, and the pg_cron job + vault secret are provisioned out-of-band (`email_infra.sql:282-303`) — a dead queue is invisible from inside Supabase. Detection must not depend on Supabase or the founder's browser: Phase 0 exit criteria require the evaluator AND `process-email-queue` to ping an external hosted heartbeat monitor at the end of each successful run, with the monitor paging on a miss, and **7 days of received external heartbeats** before real-time marketing copy ships. Until then, marketing may say: *"a daily summary of anything that drifted out of range, and email notices for sensor-connected tents"* — and may **not** say "never miss," "guaranteed," "instant," "real-time" (say "prompt" or "within minutes" — grounded in the engineering SLO that every due sensor-connected tent is evaluated within 10 minutes), or "24/7 monitoring" (a stated ops prerequisite per prior audit).
2. **Banned-word list applies to all grower-facing alert copy** — emails, Settings tile, pricing page: no *urgent, critical, emergency, auto, execute, control, actuate, relay, fix, healthy, ideal* (enforced by tests on timeline surfaces, e.g. `src/test/plantTimelineReadabilityViewModel.test.ts:10`; policy `docs/v0-release-checkpoint.md:351`). Alert emails follow the reason-contract tone: observed value + range + timestamp + a review-first suggestion (`src/lib/defaultEnvironmentThresholds.ts:139-171`), never commands.
3. **Scope honesty:** email notices only work for tents with live sensor ingest (Ecowitt/Pi/webhook) and only for readings the persistence whitelist accepts; manual-only growers get digest summaries of what the app saw while open. Say "sensor-connected tents" explicitly.
4. **Quiet-data honesty:** an offline sensor means *we can't see the tent*, not *the tent is fine* — the sensor-offline notice copy must say so. And because the fleet-offline circuit breaker suppresses offline deliveries during platform ingest incidents (§3.4) — precisely so the system never mass-mails "your sensor went quiet" when the truth is "our ingest is down" — copy must never promise that every offline event produces an email; the in-app alert row is the guarantee.
5. **Data minimization and content safety (jurisdictional privacy for home growers):** email **subjects are generic and value-free** — *"A tent needs review"* plus nothing else; the app deep link is the primary payload and the login-gated app is the system of record. Cultivation details (metric values, bands, timestamps) appear only in the body, minimal even there — no strain names, no plant counts. Bodies render **only evaluator-computed values** plus HTML-escaped, length-clamped tent/grow names; **never** `alerts.title`/`reason` from an adopted client-written row (`usePersistEnvironmentAlerts` inserts those directly, so an adopted row's text is attacker-authored — recompute the reason server-side). Pinned by the producer static scan.
6. **CAN-SPAM mechanics:** every digest and notice carries the sender's postal address in the footer and a working unsubscribe. Unsubscribe is a ≥128-bit server-generated token, never logged, **idempotent** (repeat clicks succeed; `used_at` is telemetry, not invalidation — the link in every subsequent email keeps working), rate-limited, and GET-safe: GET renders a confirmation page and suppression is applied from it (scanner prefetch cannot silently unsubscribe anyone). Suppression is **scoped**: unsubscribing from the digest does not suppress the breach notices a Pro user pays for; bounce/complaint suppressions stay global. Settings shows suppression state with a re-enable path (§4).

## 7. Pricing-page copy alignment

The pricing page (`/pricing`, Lovable `subscriptions` buyers) gains one line per tier, matching the capability split exactly — no feature the entitlement function doesn't actually gate:

- **Free:** "Daily grow summary email (opt-in) · in-app alerts and full alert history"
- **Pro:** "Email notices within minutes when a sensor-connected tent drifts out of range or a sensor goes quiet · quiet hours and per-tent preferences"
- **Founder (lifetime):** same as Pro (the union function already treats `founder_lifetime` and any in-status live Lovable row as entitled — note the Lovable branch has **no plan filter**, so if alert delivery ever moves above base Pro, that branch needs a `price_id` filter and a guard-test update).

Copy on `/pricing` is grower-facing: same banned-word list applies (no "critical alerts," no "24/7"), and the same value-free-subject promise — the pricing page may describe *what* is watched, but sample emails shown anywhere in marketing must use the generic subject. The Settings tile, pricing line, and email footer must all describe the same thing: *summaries for everyone (opt-in), prompt notices for Pro.*

---

# Data Model + Migrations

This section owns the **complete DDL for every Grow Guard table and SQL function**. Other spec sections reference these objects by name only (with at most a one-line shape reminder) — the duplicate/conflicting DDL that previously appeared in the Engine and Rollout sections is deleted, and the §7 guard tests pin the consolidated names so a later migration cannot fork them again.

**Canonical table inventory** (defined here and nowhere else):

| Object | Shape (one line) |
|---|---|
| `has_alert_delivery_entitlement(uuid)` | Pro gate; verbatim copy of the pheno union pattern |
| `alert_delivery_prefs` | per-user (+ nullable `tent_id` override rows); digest/email fields free-writable, realtime fields Pro-gated |
| `alert_deliveries` | delivery ledger; `UNIQUE(alert_id, channel, kind)`, claim-before-send |
| `alert_evaluator_state` | SINGLE ROW (`id=1`): kill switch + tuning knobs + heartbeat |
| `alert_delivery_rule_state` | per `(user_id, tent_id, rule_key)` hysteresis/dedup state, wall-clock timestamps |
| `alert_eval_watermarks` | per-tent due-selection cursor (`last_evaluated_at`) |
| `digest_send_state` | `user_id` PK; idempotent one-digest-per-user-per-day |
| `set_alert_evaluator_state(...)` | operator-gated SECURITY DEFINER setter with mandatory audit row |

The retired names `alert_delivery_state`, `alert_notification_prefs`, and `tent_alert_prefs` **must not appear in any migration** — §7.4 fails CI if they do. (With the house `CREATE TABLE IF NOT EXISTS` idiom, a name collision means whichever migration lands first silently wins and the other shape never materializes; a silently mis-shaped kill switch is a security control that doesn't exist.)

**Migrations** (dev integration branch first; prod ships from the `verdant-grow-diary` branch, so all must land there before anything depends on them — per `docs/contributing-supabase-migrations.md` and the deploy-branch reality):

1. `supabase/migrations/<ts>_has_alert_delivery_entitlement.sql` — the entitlement function (must exist before the tables migration, whose RESTRICTIVE policy calls it).
2. `supabase/migrations/<ts>_alert_delivery_tables.sql` — all six tables above, RLS, grants, triggers, the operator setter RPC.
3. `supabase/migrations/<ts>_sensor_reading_tent_ownership.sql` — closes the cross-user reading-poisoning hole in `validate_sensor_reading` (§6.1).
4. `supabase/migrations/<ts>_email_suppression_scope.sql` — scopes `suppressed_emails` so a digest unsubscribe cannot kill paid safety alerts (§6.2).

**Deliberately NOT a migration:** the new `sensor_readings (tent_id, captured_at DESC)` index. `sensor_readings` is the largest, hottest table in the system (append-only, no retention; existing indexes lead with `user_id` — `20260516204601:126-129`). A plain `CREATE INDEX` takes a SHARE lock that blocks all ingest writes for the build duration, and `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, so it structurally cannot ship as a normal migration file. It ships **out-of-band as `CREATE INDEX CONCURRENTLY`** in the same documented runbook slot as the cron job + vault secret (`email_infra.sql:282-303`), applied to prod's `verdant-grow-diary` branch and verified (`pg_index.indisvalid`) as a Phase 0 exit criterion before the evaluator is enabled. §7.6 pins that no migration ever adds a plain index to `sensor_readings`.

All SQL below follows the house conventions the readers pinned: idempotent `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` blocks, explicit `GRANT ALL ... TO service_role` on every new table (Supabase no longer grants service_role public-schema access by default — `supabase/migrations/20260707153206_email_infra.sql:38-40`), `SET search_path TO 'public', 'pg_temp'` on every SECURITY DEFINER function (exact quoting form — the guard-test regex requires it), and never adding fingerprints to `config/supabase-migration-safety-baseline.json`.

---

## 1. `has_alert_delivery_entitlement(_user_id uuid)`

**Copy `has_pheno_tracker_entitlement` verbatim** — final state in `supabase/migrations/20260709193855_fdcd8ba6-e812-4c16-9242-13e794090eea.sql:12-62` — with only the name changed. That function is the canonical union pattern: anti-oracle guard, BOTH billing tables, status + `current_period_end` hardening, canceled-but-paid-through-period grace. Do **not** copy `ai_credit_spend` (migration `20260709015647`), which reads only `billing_subscriptions` with no status/period check and silently gives live `/pricing` buyers free-tier treatment.

```sql
-- <ts>_has_alert_delivery_entitlement.sql
-- Pro gate for alert delivery (email/off-app notification of environment alerts).
-- Pattern: verbatim copy of public.has_pheno_tracker_entitlement
-- (migration 20260709193855). Any future CREATE OR REPLACE of this function
-- MUST keep the anti-oracle guard, BOTH billing-table branches, and the
-- status/current_period_end hardening — pinned by
-- src/test/alert-delivery-entitlement-oracle-guard.test.ts (latest-migration scan).

CREATE OR REPLACE FUNCTION public.has_alert_delivery_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid  uuid := auth.uid();
BEGIN
  -- Anti-oracle guard: authenticated callers can only probe themselves.
  -- service_role bypasses (worker, admin, RLS internal evaluation).
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.billing_subscriptions bs
    WHERE bs.user_id = _user_id
      AND bs.plan_id IN ('pro_monthly','pro_annual','founder_lifetime')
      AND (
        (bs.status IN ('active','trialing')
           AND (bs.current_period_end IS NULL OR bs.current_period_end > now()))
        OR (bs.status = 'canceled'
           AND bs.current_period_end IS NOT NULL
           AND bs.current_period_end > now())
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = 'live'
      AND (
        (s.status IN ('active','trialing')
           AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled'
           AND s.current_period_end IS NOT NULL
           AND s.current_period_end > now())
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_alert_delivery_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_alert_delivery_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_alert_delivery_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_alert_delivery_entitlement(uuid) TO service_role;
```

Notes carried over from the pinned pattern:

- `'trialing'` is a dead branch on `billing_subscriptions` (its status CHECK is `active/past_due/canceled/paused/expired`, migration `20260605223431:10-11`) but real for `subscriptions` — keep it in both branches for symmetry with the pinned pattern.
- The Lovable branch hard-codes `environment='live'` (as `20260709193855:46` does); sandbox Lovable rows never satisfy the SQL fn — staging/local harnesses must seed `billing_subscriptions` instead.
- No plan/price filter on the `subscriptions` branch is intentional today (any in-status live Lovable row = Pro). If alert delivery ever becomes a tier above base Pro, that branch gains a price filter *and* the guard test pins it.
- Lookup cost is 2 index-backed single-row probes (`billing_subscriptions.user_id` UNIQUE, `20260605223431:7`; partial `idx_subscriptions_user_env_active`, `20260709083556:21-25`). The set-based evaluator (Engine section) calls it **only for tents that reached the notify transition**, not per due tent — cheap either way. No new indexes needed.

---

## 2. `alert_delivery_prefs` — per-user prefs with tent overrides

One row per `(user_id, tent_id)` scope; `tent_id` NULL = account-wide default row, a tent-specific row overrides it (partial-unique idiom already used by `vpd_targets` for its NULL-user global seed rows, migration `20260604063855`). The previous per-channel row model is gone — channels are columns.

**The load-bearing design rule: the free path must work.** The digest is the Free tier's teaser and its opt-out is a legal requirement (CAN-SPAM: the digest carries upgrade marketing). Two mechanisms guarantee it:

1. **Digest is opt-IN**: `digest_enabled` defaults to `false` and **no row = no digest**. A Free user who never writes a row receives nothing, so opting out never requires an entitlement-gated write; the unsubscribe link (its own spec section) is a second, independent opt-out.
2. **The RESTRICTIVE Pro gate bites only when Pro fields are engaged.** RLS is row-level, so "gate only the Pro columns" is expressed as an escape hatch in the RESTRICTIVE `WITH CHECK`: a non-entitled user may write any row **as long as the Pro-only fields are inert**. Free users can freely toggle `digest_enabled` / `email_enabled`; only turning on `realtime_enabled` or setting quiet hours requires `has_alert_delivery_entitlement`. There is **no RESTRICTIVE policy on SELECT or DELETE** — lapsed users always read their settings and can always remove rows (the pheno SELECT-ungated convention, `20260709192453`).

Other decisions grounded in the readers:

- **Quiet hours require new schema**: no timezone column exists anywhere in the DB (profiles is gamification-only; `tents.light_schedule` is free text). Store an IANA zone per row, validated by a BEFORE trigger (the `validate_sensor_reading` idiom, `20260617164759:6-45`). Timezone is required **only when quiet hours are set** — the v1 digest runs in a fixed UTC window (Engine section), so the free digest write path has no tz requirement.
- **`min_severity` default `'warning'`** — real environment breaches are never `'critical'` in the current rules (`'critical'` = implausible sensor fault only; target/default breaches are hardcoded `'warning'`, `src/lib/environmentAlerts.ts:170-190`). Defaulting to `'critical'` would deliver nothing.
- **No `cooldown_minutes` here.** Repeat-send pacing is system-wide state, not a user pref: hysteresis and reminder cadence live in `alert_delivery_rule_state` (wall-clock timestamps) driven by the `sustain_minutes`/`clear_minutes`/`reminder_after_minutes` knobs on `alert_evaluator_state` (§4).

```sql
-- <ts>_alert_delivery_tables.sql  (section 1 of 6)

CREATE TABLE IF NOT EXISTS public.alert_delivery_prefs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL DEFAULT auth.uid(),         -- client-writable table: house pattern (alerts, sensor_readings)
  tent_id              uuid NULL REFERENCES public.tents(id) ON DELETE CASCADE,  -- NULL = account-wide default

  -- Free-writable fields (plain owner RLS):
  email_enabled        boolean NOT NULL DEFAULT true,            -- master email toggle for this scope
  digest_enabled       boolean NOT NULL DEFAULT false,           -- OPT-IN: no row = no digest

  -- Pro-only fields (engaged values require entitlement via the RESTRICTIVE policy):
  realtime_enabled     boolean NOT NULL DEFAULT false,
  min_severity         text NOT NULL DEFAULT 'warning'
                         CHECK (min_severity IN ('info','watch','warning','critical')),  -- alerts.severity vocab, 20260520233437
  quiet_hours_start    time NULL,
  quiet_hours_end      time NULL,                                -- may wrap midnight; evaluator interprets start>end as overnight window
  quiet_hours_timezone text NULL,                                -- IANA name, validated by trigger

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL)),
  CHECK (quiet_hours_start IS NULL OR quiet_hours_timezone IS NOT NULL)
);

-- One row per scope; NULL-tent default row unique per user.
-- Partial-unique idiom per vpd_targets NULL-user global rows (20260604063855).
CREATE UNIQUE INDEX IF NOT EXISTS alert_delivery_prefs_user_tent_uidx
  ON public.alert_delivery_prefs (user_id, tent_id) WHERE tent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alert_delivery_prefs_user_default_uidx
  ON public.alert_delivery_prefs (user_id) WHERE tent_id IS NULL;

-- IANA timezone validation + updated_at bump (validate_sensor_reading idiom, 20260617164759)
CREATE OR REPLACE FUNCTION public.validate_alert_delivery_prefs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.quiet_hours_timezone IS NOT NULL THEN
    -- raises invalid_parameter_value on unknown zone names
    PERFORM now() AT TIME ZONE NEW.quiet_hours_timezone;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DO $$ BEGIN
  CREATE TRIGGER validate_alert_delivery_prefs_trg
    BEFORE INSERT OR UPDATE ON public.alert_delivery_prefs
    FOR EACH ROW EXECUTE FUNCTION public.validate_alert_delivery_prefs();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### RLS + grants for `alert_delivery_prefs`

Permissive owner policies (insert/update also verify tent ownership, mirroring how `alerts` policies verify grow ownership — `20260520233437`), then the **RESTRICTIVE Pro-gate with the free escape hatch** (restrictive policies AND with the permissive ones — the `20260709192453` pheno DO-loop pattern; safe here because the permissive owner policies exist first).

```sql
ALTER TABLE public.alert_delivery_prefs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS adp_select_own ON public.alert_delivery_prefs;
  CREATE POLICY adp_select_own ON public.alert_delivery_prefs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS adp_insert_own ON public.alert_delivery_prefs;
  CREATE POLICY adp_insert_own ON public.alert_delivery_prefs
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.uid() = user_id
      AND (tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    );

  DROP POLICY IF EXISTS adp_update_own ON public.alert_delivery_prefs;
  CREATE POLICY adp_update_own ON public.alert_delivery_prefs
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
      auth.uid() = user_id
      AND (tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t WHERE t.id = tent_id AND t.user_id = auth.uid()))
    );

  DROP POLICY IF EXISTS adp_delete_own ON public.alert_delivery_prefs;
  CREATE POLICY adp_delete_own ON public.alert_delivery_prefs
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

  -- Pro gate (RESTRICTIVE — ANDs with the owner policies above).
  -- FREE ESCAPE HATCH: non-entitled users may write rows as long as the
  -- Pro-only fields are inert — the digest/email toggles are NEVER
  -- entitlement-gated (CAN-SPAM: the free digest must have a working opt-out).
  -- SELECT and DELETE deliberately carry NO restrictive policy.
  DROP POLICY IF EXISTS adp_write_pro_fields_require_entitlement ON public.alert_delivery_prefs;
  CREATE POLICY adp_write_pro_fields_require_entitlement ON public.alert_delivery_prefs
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (
      public.has_alert_delivery_entitlement(auth.uid())
      OR (realtime_enabled = false
          AND quiet_hours_start IS NULL
          AND quiet_hours_end IS NULL
          AND quiet_hours_timezone IS NULL)
    );

  DROP POLICY IF EXISTS adp_update_pro_fields_require_entitlement ON public.alert_delivery_prefs;
  CREATE POLICY adp_update_pro_fields_require_entitlement ON public.alert_delivery_prefs
    AS RESTRICTIVE FOR UPDATE TO authenticated
    WITH CHECK (
      public.has_alert_delivery_entitlement(auth.uid())
      OR (realtime_enabled = false
          AND quiet_hours_start IS NULL
          AND quiet_hours_end IS NULL
          AND quiet_hours_timezone IS NULL)
    );
END $$;

REVOKE ALL ON public.alert_delivery_prefs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_delivery_prefs TO authenticated;
GRANT ALL ON public.alert_delivery_prefs TO service_role;  -- evaluator reads prefs; explicit grant required (email_infra.sql:38-40)
```

A lapse thus degrades gracefully: the lapsed user's existing quiet-hours/realtime row keeps being readable; they can zero the Pro fields (the escape hatch permits writes that turn Pro features *off*) or delete the row, but cannot re-engage realtime until entitled again.

**Recipient address is NOT here.** There is deliberately no email column on this table (or anywhere user-writable): the producer contract (Engine section) resolves the recipient exclusively from `auth.users.email` of the tent owner via service_role, and only when `email_confirmed_at IS NOT NULL`. A user-writable recipient field would make the pipeline an arbitrary-recipient harassment engine; any future custom notification address requires its own verified double-opt-in loop.

---

## 3. `alert_deliveries` — delivery ledger (idempotency anchor + decision trace)

Design decisions:

- **`UNIQUE (alert_id, channel, kind)` with `kind IN ('initial','reminder','recovery')` is the idempotency contract.** The Engine's state machine sends up to three emails per alert row in v1 (initial notice, one reminder after `reminder_after_minutes`, a recovery notice on sustained clear) — a two-column key would either block the reminder/recovery claims or force them to bypass the ledger and become unauditable. Every send of every kind is claimed through this key. Because re-fires while an alert is open never create new `alerts` rows, and a resolved-then-recurring breach inserts a *new* row, this still maps to one attempt-chain per breach episode per kind.
- **Every evaluated-but-not-sent email decision writes a `skipped` row.** "Why didn't I get an email?" traverses ~9 gates (entitlement, suppression, toggles, min_severity, quiet hours, hysteresis, daily cap, storm controls, TTL); without ledger rows most skips leave no queryable trace and every silent skip becomes a support email. The `skip_reason` vocabulary includes `daily_cap` and `fleet_offline_anomaly` for exactly this; since owner-SELECT RLS exists, the Alerts UI can surface "held: quiet hours" / "skipped: daily cap reached" chips directly, so the most common questions never become tickets. The Engine's static scan pins the write-a-skip-row contract.
- **Daily-cap accounting reads THIS table**, not `email_send_log`: count rows per `user_id` with `status='sent'`, `kind IN ('initial','reminder')`, and `attempted_at` within the **current UTC day** (boundary stated here so it is not reinvented). Recovery notices and the digest are exempt (the digest never appears in this ledger — it has no `alert_id`; its idempotency lives in `digest_send_state`, §7). Keying on `user_id` avoids the mutable-`recipient_email` join and the label-collision ambiguity of counting `email_send_log`.
- **Storm collapse is visible in the ledger**: when the per-user per-tick collapse (Engine section) folds several newly-notifying (tent, rule) pairs into one summary email, each member alert still gets its own claimed `initial` row, all sharing one `provider_message_id` — the audit answers "which alerts were in that email?" with a single equality join.
- **`user_id` has NO default**: `auth.uid()` is NULL for service_role, so omitting the default forces the worker to stamp ownership explicitly or fail loudly at insert.
- **`provider_message_id`** stores the pgmq payload `message_id` (a `crypto.randomUUID()` per the enqueue contract, `supabase/functions/auth-email-hook/index.ts:255-270`) — it joins `email_send_log.message_id`, which already has an index and the `UNIQUE ... WHERE status='sent'` partial index (`email_infra.sql:80-81`).
- **Status vocabulary is CHECKed and code must respect it** — the email worker's `'rate_limited'` insert that violates its own CHECK and silently fails (`process-email-queue/index.ts:301-307` vs `email_infra.sql:84-88`) is the bug to not copy; the §7.2 guard test pins worker/CHECK alignment.
- **No client write path at all**: owner SELECT is the only authenticated policy. service_role bypasses RLS; the explicit table grant is what actually lets it write.

```sql
-- <ts>_alert_delivery_tables.sql  (section 2 of 6)

CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id            uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL,   -- NO DEFAULT: service_role writer must stamp explicitly (auth.uid() is NULL for it)
  channel             text NOT NULL CHECK (channel IN ('email','in_app')),
  kind                text NOT NULL DEFAULT 'initial'
                        CHECK (kind IN ('initial','reminder','recovery')),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','suppressed','skipped','failed')),
  skip_reason         text NULL
                        CHECK (skip_reason IS NULL OR skip_reason IN
                          ('quiet_hours','below_min_severity','channel_disabled',
                           'not_entitled','suppressed_email','daily_cap',
                           'fleet_offline_anomaly','paused')),
  provider_message_id uuid NULL,       -- = email payload message_id; joins email_send_log.message_id
  error               text NULL,       -- sanitized; never raw provider payloads
  attempted_at        timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_deliveries_one_per_alert_channel_kind UNIQUE (alert_id, channel, kind),
  CHECK ((status = 'skipped') = (skip_reason IS NOT NULL))
);

-- House index shapes (alert_events uses (user_id, created_at DESC), 20260520234331).
-- The (user_id, attempted_at) partial also serves the UTC-day daily-cap count.
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_user_created
  ON public.alert_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_cap_count
  ON public.alert_deliveries (user_id, attempted_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_pending
  ON public.alert_deliveries (created_at) WHERE status = 'pending';  -- worker pickup scan

DO $$ BEGIN
  CREATE TRIGGER set_alert_deliveries_updated_at
    BEFORE UPDATE ON public.alert_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();  -- existing helper (used by alerts, 20260520233437)
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Owner SELECT only. Deliberately NO INSERT/UPDATE/DELETE policies for
  -- authenticated: clients can never write the ledger. The service_role worker
  -- bypasses RLS and writes via the explicit table grant below.
  DROP POLICY IF EXISTS ad_select_own ON public.alert_deliveries;
  CREATE POLICY ad_select_own ON public.alert_deliveries
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
END $$;

REVOKE ALL ON public.alert_deliveries FROM PUBLIC, anon;
GRANT SELECT ON public.alert_deliveries TO authenticated;   -- read-own via RLS; powers "notified at …" UI and skip-reason chips
GRANT ALL ON public.alert_deliveries TO service_role;
```

Worker insert discipline (spec contract, enforced by the ledger's constraints): claim-before-send — `INSERT ... (alert_id, user_id, channel, kind, status:'pending') ON CONFLICT (alert_id, channel, kind) DO NOTHING`; if 0 rows, another run already owns this delivery. Then evaluate prefs/entitlement/suppression/caps, flip the row to `sent` (+ `provider_message_id`, `attempted_at`) after `enqueue_email`, or to `skipped`/`suppressed`/`failed` (+ `error`). This is the same claim-first shape as auth-email-hook's pre-log-pending-then-enqueue pattern (`auth-email-hook/index.ts:245-285`).

---

## 4. `alert_evaluator_state` — the single kill switch, knobs, and heartbeat

**One state table, one shape, one "is it on?" switch.** This single row merges what earlier drafts split across two conflicting definitions (a kill switch here, knobs + heartbeat in the rollout section) — an incident-time recipe for flipping the wrong switch. `featureFlags.ts` is compile-time and explicitly forbidden for security/ops gating (`src/lib/featureFlags.ts:7-11`); the house runtime-knob pattern is the single-row state table the worker checks every run — `email_send_state` (`email_infra.sql:91-131`, `process-email-queue/index.ts:116-127`). Break-glass fallback stays `REVOKE EXECUTE`/`cron.unschedule` per `docs/billing-entitlement-updater-rpc-design.md:477-483`.

All duration knobs are **wall-clock minutes, never run-counts** — hysteresis denominated in evaluator runs silently changes meaning whenever cadence, batch size, or backlog changes, turning a scale-tuning change into a correctness change.

```sql
-- <ts>_alert_delivery_tables.sql  (section 3 of 6)

CREATE TABLE IF NOT EXISTS public.alert_evaluator_state (
  id                        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Kill switch
  enabled                   boolean NOT NULL DEFAULT false,  -- ship dark; operator flips on via RPC below
  paused_until              timestamptz NULL,                -- temporary pause (mirrors retry_after_until)

  -- Tuning knobs (wall-clock minutes; see Engine section for semantics)
  eval_cadence_minutes      integer NOT NULL DEFAULT 5,
  batch_size                integer NOT NULL DEFAULT 500,    -- tents claimed per run (set-based SQL, not per-tent round-trips)
  sustain_minutes           integer NOT NULL DEFAULT 10,
  clear_minutes             integer NOT NULL DEFAULT 10,
  reminder_after_minutes    integer NOT NULL DEFAULT 60,
  daily_cap_per_user        integer NOT NULL DEFAULT 10,     -- counted from alert_deliveries, UTC day (§3)

  -- Storm controls (Engine section)
  storm_user_collapse       boolean NOT NULL DEFAULT true,   -- one summary email per user per tick
  fleet_offline_breaker_pct integer NOT NULL DEFAULT 30,     -- >N% of due tents going offline in one run => suppress offline emails
  max_deliveries_per_run    integer NOT NULL DEFAULT 100,    -- global per-run enqueue budget; overflow defers, never drops

  -- Heartbeat (read by the operator page; external dead-man's switch is the ping, not this row)
  last_run_at               timestamptz NULL,
  last_run_stats            jsonb NULL,                      -- {claimed, evaluated, notified, skipped, backlog_depth, ...}

  updated_at                timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.alert_evaluator_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.alert_evaluator_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- service_role-only, mirroring email_send_state RLS (email_infra.sql:121-131)
  DROP POLICY IF EXISTS aes_service_select ON public.alert_evaluator_state;
  CREATE POLICY aes_service_select ON public.alert_evaluator_state
    FOR SELECT TO service_role USING (true);
  DROP POLICY IF EXISTS aes_service_update ON public.alert_evaluator_state;
  CREATE POLICY aes_service_update ON public.alert_evaluator_state
    FOR UPDATE TO service_role USING (true) WITH CHECK (true);
END $$;

REVOKE ALL ON public.alert_evaluator_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.alert_evaluator_state TO service_role;
```

### Operator flip path: `set_alert_evaluator_state` — audited, not just gated

A kill switch flippable only by raw service_role SQL from the dashboard is outside any audit convention, and an unaudited setter means a compromised operator session (or a `has_role` regression) can silently disable safety alerting for every user with zero record. The setter therefore **writes its audit row in the same function body** — mirroring the billing updater's audit convention (`docs/billing-entitlement-updater-rpc-design.md`), not just its read RPC:

```sql
CREATE TABLE IF NOT EXISTS public.alert_operator_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  old_state   jsonb NOT NULL,   -- prior enabled/paused_until/knobs snapshot
  new_state   jsonb NOT NULL
);
ALTER TABLE public.alert_operator_audit ENABLE ROW LEVEL SECURITY;  -- no authenticated policies: service/definer writes only
REVOKE ALL ON public.alert_operator_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.alert_operator_audit TO service_role;

CREATE OR REPLACE FUNCTION public.set_alert_evaluator_state(_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'operator') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.alert_evaluator_state s WHERE id = 1;
  UPDATE public.alert_evaluator_state
     SET enabled      = COALESCE((_patch->>'enabled')::boolean, enabled),
         paused_until = CASE WHEN _patch ? 'paused_until'
                             THEN (_patch->>'paused_until')::timestamptz ELSE paused_until END,
         -- (repeat COALESCE pattern for each knob column)
         updated_at   = now()
   WHERE id = 1;
  SELECT to_jsonb(s) INTO v_new FROM public.alert_evaluator_state s WHERE id = 1;
  INSERT INTO public.alert_operator_audit (actor_id, old_state, new_state)
  VALUES (auth.uid(), v_old, v_new);           -- audit is mandatory, same statement scope
  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_alert_evaluator_state(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_alert_evaluator_state(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_alert_evaluator_state(jsonb) TO authenticated;  -- in-body has_role is the real gate
GRANT EXECUTE ON FUNCTION public.set_alert_evaluator_state(jsonb) TO service_role;
```

The operator page shows current switch state + last flip (from the audit table), and "evaluator disabled > X hours" is itself a heartbeat alarm — a malicious or accidental off-switch must be visible. Note the row's `last_run_at` heartbeat is *internal* telemetry only; the Phase 0 exit criterion is the **external dead-man's switch** (evaluator and process-email-queue ping a hosted heartbeat monitor at the end of each successful run — detection must not depend on Supabase or the founder's browser; specified in the Rollout section).

---

## 5. `alert_delivery_rule_state` — per-key hysteresis/dedup state

Per `(user_id, tent_id, rule_key)`; this is the table earlier drafts fatally named `alert_delivery_state` (colliding with the kill switch). It exists because the alerts table has no hysteresis/re-fire state (`last_seen_at` is write-once, zero updaters).

**Timestamps, not counters.** State is wall-clock (`breach_first_seen_at` etc.) and transitions compare durations against the minute knobs in `alert_evaluator_state` — invariant under cadence changes, backlog, pauses, and parallel workers. The Engine section owns the transition rules; the two spec-level contracts the schema encodes:

- `phase` moves `quiet → sustaining → notified → clearing → quiet`; notify fires when `now() - breach_first_seen_at >= sustain_minutes` with a recent `breach_last_seen_at`; while `notified` and still breaching, one `reminder` after `reminder_after_minutes`; recovery on sustained clear (`clear_minutes`). Every send is claimed through the §3 ledger (`kind` column).
- All transitions are **compare-and-set** (`UPDATE ... WHERE phase = '...' RETURNING`) so concurrent workers cannot double-fire — the read-modify-write races of counter-based designs are structurally excluded.

```sql
-- <ts>_alert_delivery_tables.sql  (section 4 of 6)

CREATE TABLE IF NOT EXISTS public.alert_delivery_rule_state (
  user_id               uuid NOT NULL,   -- NO DEFAULT: service_role writer stamps explicitly
  tent_id               uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  rule_key              text NOT NULL,
  phase                 text NOT NULL DEFAULT 'quiet'
                          CHECK (phase IN ('quiet','sustaining','notified','clearing')),
  breach_first_seen_at  timestamptz NULL,
  breach_last_seen_at   timestamptz NULL,
  clear_first_seen_at   timestamptz NULL,
  last_notified_at      timestamptz NULL,
  reminder_last_sent_at timestamptz NULL,   -- escalation timestamps: wall-clock, never run-counts
  recovery_sent_at      timestamptz NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tent_id, rule_key)
);

ALTER TABLE public.alert_delivery_rule_state ENABLE ROW LEVEL SECURITY;
-- Decision stated explicitly: NO authenticated policies at all. This is evaluator
-- working state; user-visible delivery history lives in alert_deliveries (owner SELECT).
REVOKE ALL ON public.alert_delivery_rule_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.alert_delivery_rule_state TO service_role;
```

---

## 6. `alert_eval_watermarks` — due-tent selection cursor

Per-tent cursor used only for **due-selection and concurrency claiming**, never as an exclusion bound on which readings get evaluated (the evaluator reads a fixed trailing window of `sensor_readings`, so out-of-order arrival and the permitted +5-minute `captured_at` clock skew — trigger at `20260523000307:29-31` — cannot cause readings to be skipped; re-reading the window is one index-range scan and evaluation is idempotent).

Concurrent cron fires are guaranteed (`net.http_post` from pg_cron is fire-and-forget — the email cron uses the same pattern, `email_infra.sql:282-303`), so **due-tent selection claims rows in ONE transaction**:

```sql
UPDATE public.alert_eval_watermarks
   SET last_evaluated_at = now()
 WHERE tent_id IN (
   SELECT tent_id FROM public.alert_eval_watermarks
    ORDER BY last_evaluated_at ASC NULLS FIRST
    LIMIT (SELECT batch_size FROM public.alert_evaluator_state WHERE id = 1)
    FOR UPDATE SKIP LOCKED)
RETURNING tent_id, user_id;
```

— the pgmq-visibility-timeout shape in SQL. Overlapping invocations cannot double-evaluate a tent, and the same claim is what enables parallel/sharded workers at scale. (Loop mechanics, the set-based LATERAL snapshot query, and the 10-minute evaluation SLO live in the Engine section.)

```sql
-- <ts>_alert_delivery_tables.sql  (section 5 of 6)

CREATE TABLE IF NOT EXISTS public.alert_eval_watermarks (
  tent_id           uuid PRIMARY KEY REFERENCES public.tents(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,     -- denormalized owner; evaluator queries MUST carry user_id = tents.user_id (§8.1)
  last_evaluated_at timestamptz NULL   -- NULLS FIRST => new tents evaluated soonest
);

ALTER TABLE public.alert_eval_watermarks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_eval_watermarks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.alert_eval_watermarks TO service_role;
```

## 7. `digest_send_state` — one digest per user per day

The digest is opt-in (§2) and rides its **own pgmq queue** (`digest_emails`, 12–24h TTL — Engine section; breach emails and digests want opposite TTLs and must not share a FIFO). Idempotency does not come from the §3 ledger (a digest has no single `alert_id`); it comes from this row — a mid-run crash and retry cannot double-send:

```sql
-- <ts>_alert_delivery_tables.sql  (section 6 of 6)

CREATE TABLE IF NOT EXISTS public.digest_send_state (
  user_id          uuid PRIMARY KEY,
  last_digest_date date NULL,          -- UTC date; claim via UPDATE ... WHERE last_digest_date IS DISTINCT FROM current_date
  message_id       uuid NULL           -- joins email_send_log.message_id
);

ALTER TABLE public.digest_send_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digest_send_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.digest_send_state TO service_role;
```

---

## 8. Hardening migrations to existing tables

### 8.1 `validate_sensor_reading`: tent-ownership check (cross-user poisoning)

The only INSERT policy on `sensor_readings` checks `auth.uid() = user_id` and nothing else (`20260516204601:159-160`); `tent_id` is an unvalidated soft reference (same file:19-20) and `validate_sensor_reading` checks metric/quality/source/bounds but never tent ownership (`20260617164759:6-45`). Inert today (clients read their own rows under RLS) — but the evaluator runs as service_role, so user A inserting rows with `user_id = A, tent_id = <B's tent>` could fire breach emails at B, inject in-range readings to mask B's real overnight breach, or keep a dead sensor looking alive. Two layers close it:

1. **Schema layer (this migration):** extend `validate_sensor_reading` to require `EXISTS (SELECT 1 FROM public.tents t WHERE t.id = NEW.tent_id AND t.user_id = NEW.user_id)` whenever `NEW.tent_id IS NOT NULL` — the `pi_ingest` path already enforces this server-side (`20260523184548:41`); the direct client path does not. This is a `CREATE OR REPLACE` of an existing function: the replacement body must keep every existing check (the CREATE-OR-REPLACE narrowing trap), pinned by extending the latest-migration scan in §9.
2. **Query layer (Engine contract, pinned by static scan):** every evaluator access to `sensor_readings` carries the predicate `user_id = tents.user_id` joined from the resolved tent row — defense in depth even if the trigger regresses.

### 8.2 `suppressed_emails`: scoped suppression + re-subscribe path

`suppressed_emails` is `UNIQUE(email)`, one global reason, append-only with no UPDATE/DELETE policies (`email_infra.sql:213-242`) — as-is, one digest unsubscribe permanently suppresses the Pro real-time safety alerts the user pays for, with no undo. This migration adds a `scope` column (`CHECK (scope IN ('all','digest','alert_realtime'))`, default `'all'`) and widens the unique key to `(email, scope)`: unsubscribe-from-digest suppresses only `'digest'`; `bounce`/`complaint` rows stay scope `'all'`. A service_role re-subscribe flow (operator runbook + a Settings surface showing "notifications disabled for this address" with a re-enable path) is defined alongside the unsubscribe endpoint spec — which also owns the token/idempotency/GET-confirmation rules (>=128-bit server-generated token, repeat clicks succeed, `used_at` is telemetry, suppression happens on confirmation, rate-limited, never logged).

---

## 9. Changes to `public.alerts`: **none**

Deliberate decision, for four reader-grounded reasons:

1. **Delivery state is fully derivable from the ledger** (`alert_deliveries.status='sent'` + `kind` + `attempted_at`), readable by owners under RLS — a `delivered_at` column on `alerts` would be a denormalized copy with two writers, and "why did I get 3 emails?" is answered by the three `kind`-distinct ledger rows.
2. **`alerts` CHECK constraints and vocabularies are load-bearing** (severity/status/acknowledged_at/resolved_at CHECKs, `20260520233437` + `20260619000545`) and its rows are written by the still-live client hook `usePersistEnvironmentAlerts` — adding server-written columns to a client-inserted table invites `user_id`-default and dedupe-key interactions for zero benefit. Because those rows are client-written, the email pipeline **never renders `alerts.title`/`reason` from an adopted row** — email content is exclusively evaluator-computed values plus HTML-escaped, length-clamped tent/grow names, with generic value-free subjects (content rules owned by the Engine/email section, pinned by its producer static scan).
3. **No `escalation_level` column**: re-fire/reminder machinery lives entirely in `alert_delivery_rule_state` (§5) — wall-clock escalation timestamps there, claimed sends in the ledger. The severity model is also explicitly not paging-ready (breaches are always `'warning'`) — an `alerts` column would encode semantics the rules layer doesn't produce.
4. **No `'delivered'` event in `alert_events`**: its `event_type` CHECK is pinned to exactly 5 values (`created/acknowledged/resolved/dismissed/reopened`, `20260520234331`); widening it is a migration with UI implications. The ledger *is* the delivery audit trail.

If the Alerts UI later wants an inline "emailed at 03:12" chip, it joins `alert_deliveries` on `alert_id` (owner-SELECT RLS already permits this) — no schema change.

---

## 10. Guard tests — making the `ai_credit_spend` landmine structurally impossible

The landmine's root cause is precisely known: `src/test/ai-credit-effective-entitlement-sql.test.ts:9-11` pins a **hardcoded migration file**, so when `20260709015647` later `CREATE OR REPLACE`'d `ai_credit_spend` with the narrowed single-table body, the test kept passing against the stale file. The pheno guard (`src/test/pheno-tracker-entitlement-oracle-guard.test.ts:22-31`) fixes this with `latestMigrationBodyMentioning(fn)` — sort all `supabase/migrations/*.sql` ascending, walk backward, assert against the **latest file whose body mentions the object**. Any future replacement migration automatically becomes the tested body; narrowing it fails CI. Every test below uses that scan.

### 10.1 `src/test/alert-delivery-entitlement-oracle-guard.test.ts`

Copy the pheno test wholesale (`latestMigrationBodyMentioning` + all four describe blocks, `s/has_pheno_tracker_entitlement/has_alert_delivery_entitlement/`), then **add a fifth block the pheno test doesn't have** — union-branch pinning, so a narrowing replacement fails even if it keeps the oracle guard:

```ts
describe("has_alert_delivery_entitlement unions BOTH billing tables (ai_credit_spend landmine)", () => {
  const sql = latestMigrationBodyMentioning("has_alert_delivery_entitlement");

  it("reads billing_subscriptions AND public.subscriptions in the same body", () => {
    expect(sql).toMatch(/FROM\s+public\.billing_subscriptions/i);
    expect(sql).toMatch(/FROM\s+public\.subscriptions\s/i);
  });

  it("hardens BOTH branches on status + current_period_end", () => {
    expect(sql.match(/status\s+IN\s*\(\s*'active'\s*,\s*'trialing'\s*\)/gi)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(sql.match(/current_period_end\s*>\s*now\(\)/gi)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/'canceled'/); // canceled-but-paid-through grace preserved
  });

  it("pins the Lovable branch to environment='live'", () => {
    expect(sql).toMatch(/environment\s*=\s*'live'/);
  });
});
```

The four copied blocks assert (as the pheno original does at lines 38-75): the anti-oracle regexes (`current_setting('role', true)`, `service_role`, `_user_id <> v_uid`, `RETURN false;`), `RETURNS boolean` with no `provider_customer_id`/`provider_subscription_id`/`paddle_*` leakage, the full REVOKE PUBLIC + anon / GRANT authenticated + service_role posture, and `SECURITY DEFINER` + `STABLE` + `SET search_path TO 'public', 'pg_temp'`.

### 10.2 `src/test/alert-deliveries-ledger-guard.test.ts`

Latest-migration scan targeting `"alert_deliveries"`, pinning the ledger's trust boundary:

- **No client write policy ever appears**: `expect(sql).not.toMatch(/CREATE POLICY[^;]*ON\s+public\.alert_deliveries[^;]*FOR\s+(INSERT|UPDATE|DELETE)[^;]*TO\s+authenticated/is)` — a later migration adding a client write path fails CI.
- Idempotency anchor is the **widened three-column key**: `/UNIQUE\s*\(\s*alert_id\s*,\s*channel\s*,\s*kind\s*\)/i`, and the `kind` CHECK contains exactly `'initial'`, `'reminder'`, `'recovery'`.
- `user_id` column has no `DEFAULT auth.uid()` (regex over the `CREATE TABLE ... alert_deliveries` block) — service writer must stamp explicitly.
- `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM PUBLIC, anon`, and `GRANT ALL ... TO service_role` all present.
- **Status/skip-reason vocab alignment** (the `'rate_limited'` lesson, `process-email-queue/index.ts:301-307` vs `email_infra.sql:84-88`): import the worker's status/skip-reason constants (or grep the worker source, matching the static-scan style of `src/test/live-sensor-server-gate.test.ts`) and assert every string the delivery worker writes is a member of the CHECK lists extracted from the migration — including `daily_cap` and `fleet_offline_anomaly` — so an unmigrated new status fails the test instead of silently failing at insert time.

### 10.3 `src/test/alert-delivery-prefs-progate-guard.test.ts`

Latest-migration scan targeting `"alert_delivery_prefs"`:

- RESTRICTIVE entitlement policies exist for INSERT and UPDATE (`/AS\s+RESTRICTIVE\s+FOR\s+(INSERT|UPDATE)/i`, `/has_alert_delivery_entitlement\(auth\.uid\(\)\)/`), and **no** RESTRICTIVE policy exists `FOR SELECT` or `FOR DELETE`.
- **The free digest path is never gated**: each RESTRICTIVE `WITH CHECK` body contains the escape-hatch disjunction (`/OR\s*\(\s*realtime_enabled\s*=\s*false/i` plus the quiet-hours-NULL conjuncts) — a later migration that drops the escape hatch and locks Free users out of their opt-out fails CI.
- Digest is opt-in: `digest_enabled` carries `DEFAULT false`.
- Timezone-validation trigger wired (`/validate_alert_delivery_prefs/`).

### 10.4 `src/test/alert-tables-single-source-guard.test.ts`

The anti-fork test. Scans **all** migrations and asserts:

- No migration ever creates the retired/colliding names `alert_delivery_state`, `alert_notification_prefs`, or `tent_alert_prefs`.
- The latest body mentioning `alert_evaluator_state` contains, in one `CREATE TABLE` block, the merged shape: `enabled`, `paused_until`, `eval_cadence_minutes`, `batch_size`, `sustain_minutes`, `clear_minutes`, `reminder_after_minutes`, `daily_cap_per_user`, `storm_user_collapse`, `fleet_offline_breaker_pct`, `max_deliveries_per_run`, `last_run_at`, `last_run_stats`, and the `CHECK (id = 1)` single-row constraint — a second migration re-splitting the kill switch from the knobs fails CI.
- `alert_delivery_rule_state` has the composite PK `(user_id, tent_id, rule_key)`, the four wall-clock state timestamps, and **no** `_periods`/counter columns (`expect(sql).not.toMatch(/consecutive|_periods/i)`) — run-count hysteresis cannot be reintroduced.

### 10.5 `src/test/alert-operator-rpc-guard.test.ts`

Latest-migration scan targeting `"set_alert_evaluator_state"`: `SECURITY DEFINER` + `VOLATILE` + `SET search_path TO 'public', 'pg_temp'`; in-body `has_role(auth.uid(), 'operator')`; a mandatory `INSERT INTO public.alert_operator_audit` **in the same function body** (an unaudited flip path fails CI); REVOKE PUBLIC/anon + GRANT authenticated/service_role posture.

### 10.6 `src/test/sensor-readings-index-discipline.test.ts`

Scans all migrations and asserts none contains `CREATE INDEX` (with or without `CONCURRENTLY`) on `public.sensor_readings` — the tent/captured_at index ships exclusively via the out-of-band runbook slot (§ intro; `CONCURRENTLY` cannot run in a transactional migration, and a plain build locks ingest writes). Also extends the `validate_sensor_reading` latest-migration scan to require the tent-ownership `EXISTS` predicate from §8.1, so a later `CREATE OR REPLACE` cannot narrow it away.

All guard tests are grep-only static scans (no DB roundtrip, no service_role in tests) per house convention; runtime grant-parity verification belongs to the local-DB-lane harness with `supabase/seed.sql` parity, not these tests.

---

## 11. Explicitly out of scope for this section (owned by adjacent spec sections)

- **The evaluator loop itself** (Engine section): the set-based LATERAL latest-per-metric snapshot query, the 10-minute evaluation SLO, the `user_id = tents.user_id` predicate contract and its static scan, storm collapse/circuit-breaker behavior, and reminder/recovery transition logic — this section only provides the tables they read and write.
- **Cron, vault, external heartbeat, and the sensor_readings index** — all applied out-of-band via the documented runbook slot (the pg_cron job cannot ship as a static migration; it is applied with the vault-stored service key, per `email_infra.sql:282-303`). Phase 0 exit criteria (Rollout section) include the index valid check and 7 days of **external** heartbeat pings received.
- **Digest assembly and scheduling** (Engine section): the `digest_emails` pgmq queue, its 12–24h TTL and worker-loop extension, the assembly query, and the fixed-UTC-window v1 scheduler — this section owns only `digest_send_state` (§7) and the opt-in default (§2).
- **Unsubscribe endpoint behavior** (its own section): token generation/handling, GET-confirmation flow, rate limiting — this section owns only the scoped-suppression schema (§8.2).
- **Email content and recipient resolution** (Engine/email section): `auth.users.email`-only recipient with `email_confirmed_at` check, evaluator-computed-values-only rendering, generic value-free subjects, data-minimization/retention rules for `email_send_log` and the DLQ. The schema hooks are stated in §2 and §9; the contracts and their producer static scans live there.
- **Ingest contracts stay untouched**: beyond the additive `validate_sensor_reading` ownership check (§8.1), nothing here touches `ecowitt-ingest`, `sensor-ingest-webhook`, or `pi_ingest_commit_batch`, preserving their "NEVER triggers alerts" stop-ship comments and the static guard tests that enforce them.

---

# Evaluation + Delivery Engine

This section specifies the server-side evaluator that closes the overnight gap: today alerts are computed only while the app is open (`src/hooks/usePersistEnvironmentAlerts.ts`), and every ingest surface is contractually alert-free (`supabase/functions/ecowitt-ingest/index.ts:7-9`, `sensor-ingest-webhook/index.ts:7-8`, `pi_ingest_commit_batch` comment in `supabase/migrations/20260523184548_*.sql`). Evaluation therefore ships as a **separate pg_cron-invoked worker** — the ingest stop-ship contracts and their guard tests (`src/test/manual-sensor-alert-smoke-guard.test.ts:358`, `src/test/operator-ggs-real-payload-ingest-safety.test.ts`) are untouched.

**SLO (normative):** every due sensor-connected tent is evaluated within **10 minutes**. Everything below — batch claiming, set-based evaluation, backlog telemetry — is sized to that SLO, not to a fixed fleet size.

All tables referenced here (`alert_evaluator_state`, `alert_eval_watermarks`, `alert_delivery_rule_state`, `alert_delivery_prefs`, `alert_deliveries`, `digest_send_state`) are defined **once, in the Data Model section**; this section references them by name with one-line shape reminders only. No table DDL appears here.

## 1. Architecture decision: cron → edge function, not SQL evaluator

The threshold/quality/staleness rules already exist as pure, injectable-clock, dependency-free TS modules: `buildEnvironmentAlerts` (`src/lib/environmentAlerts.ts:106`), `buildDefaultThresholdAlerts` (`src/lib/defaultEnvironmentThresholds.ts:106`), `selectPersistableAlerts`/`isSnapshotPersistable` and `alertRuleKey` (`src/lib/environmentAlertPersistence.ts:46-84`), stage classifiers (`src/lib/vpdStageTargetRules.ts`, `src/lib/environmentStageTargetRules.ts`), and `evaluateSensorQuality` (`src/lib/sensorQuality.ts:45`). Porting all of that to plpgsql duplicates ~5 rule families and re-creates the TS-vs-SQL band-drift problem that already exists for VPD (`vpd_targets` seeds vs `vpdStageTargetRules.ts:84-120`; temp/RH bands exist **only** in TS, `environmentStageTargetRules.ts:70-88`).

**Decision:** a new edge function `supabase/functions/evaluate-environment-alerts/` imports the pure rules via `_shared` copies (per the existing dual-helper convention for `src/lib` ↔ `supabase/functions/_shared`), and is invoked by pg_cron via `net.http_post` — the exact pattern already running for `process-email-queue` (`supabase/migrations/20260707153206_email_infra.sql:282-303`). The split of work is deliberate:

- **Data movement is set-based SQL, not per-tent round-trips.** One LATERAL latest-per-metric query returns snapshots for the *entire claimed batch* in a single statement (§3); one bulk statement upserts hysteresis transitions. The TS rule modules run in-memory over that result set. Per-tent PostgREST loops (snapshot query + targets load + entitlement RPC per tent) do not survive fleet scale inside an edge-function wall-clock budget and are **forbidden**.
- Email rendering happens only for deliveries actually claimed this tick (bounded by `max_deliveries_per_run`, §5), outside the evaluation transaction — the evaluation loop itself is pure DB work.

The SQL-side precedent `public.evaluate_vpd_drift_ewma` (`20260604063855_*.sql:118-220`) remains available as an advisory sub-check for sustained-VPD classification; it stays read-only per its own comment.

Extensions needed (pg_cron, pg_net, supabase_vault, pgmq) are already enabled by `email_infra.sql:6-13` — no setup migration.

### Worker auth
Identical to the email worker: gateway `verify_jwt=true` in `supabase/config.toml`, plus in-body JWT-claim parse requiring `role === 'service_role'` (copy `process-email-queue/index.ts:94-112`).

### Cron job + index — operational apply steps (not migrations)
Like `process-email-queue`, the cron job embeds a vault-stored service_role key, so it **cannot ship as static SQL**. Apply via the same Management-API flow, documented in the migration as a comment (mirror `email_infra.sql:282-303`):

```
Job name:  evaluate-environment-alerts
Schedule:  */5 * * * *   -- floor cadence; the run gate honors
                         -- alert_evaluator_state.eval_cadence_minutes, so the
                         -- operator can stretch cadence without re-scheduling
Body:      pre-check alert_evaluator_state (enabled, paused_until,
           eval_cadence_minutes vs last_run_at), skip if off/paused/early,
           else net.http_post to the edge fn with vault secret
           'alert_evaluator_service_role_key'
Revert:    SELECT cron.unschedule('evaluate-environment-alerts');
```

**The `sensor_readings` scan index ships in the same out-of-band runbook slot — never as a plain `CREATE INDEX` in a migration.** `sensor_readings` is append-only with no retention (~2.1M rows/year per live tent); none of the existing indexes lead with `(tent_id, captured_at)` (they lead with `user_id`, `20260516204601_*.sql:126-129`). A transactional `CREATE INDEX` takes a SHARE lock that blocks all ingest writes for the build — EcoWitt gateways POST every 60 s with no retry buffer, so readings would be dropped exactly when this feature lands. Instead the runbook applies, via the Management API against prod's `verdant-grow-diary` deploy branch:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sensor_readings_tent_captured
  ON public.sensor_readings (tent_id, captured_at DESC)
  WHERE captured_at IS NOT NULL;
```

Phase 0 exit criteria include **“index exists and `pg_index.indisvalid`”** before the evaluator is enabled. Named prerequisite for any >10k-tent budget: a `sensor_readings` retention/partitioning decision (e.g. monthly range partitions on `captured_at` with a drop policy, or a rollup table) — “no retention” and “10k tents” cannot both be true, and this spec does not pretend otherwise.

Fresh/branch/local DBs will have the tables but **no cron job, no vault secret, and no concurrent index** (same known gap as email — `email_infra.sql:282-303`); the runbook must include recreating all three, and prod must be verified on the `verdant-grow-diary` deploy branch, not just `main`.

## 2. Schema touchpoints (canonical names; DDL lives in the Data Model section)

House posture for all of these: `ENABLE ROW LEVEL SECURITY`, explicit `GRANT ALL ... TO service_role` (required — `email_infra.sql:38-40`), `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` wrappers per `docs/contributing-supabase-migrations.md`. Each table below is defined exactly once in the Data Model section; a guard test (§11.5) pins the single canonical shape so a later migration cannot fork it.

### 2.1 Kill switch + tuning + heartbeat: `alert_evaluator_state`

Single row (`id=1 CHECK`), service_role-only RLS. One table carries **all three concerns** — there is exactly one “is it on?” switch in the system:

- **Kill switch:** `enabled boolean` (ships `false` — dark until the operator flips it), `paused_until timestamptz`.
- **Tuning knobs:** `eval_cadence_minutes`, `batch_size`, `storm_user_collapse boolean`, `fleet_offline_breaker_pct`, `max_deliveries_per_run`, `sustain_minutes`, `clear_minutes`, `reminder_after_minutes`, `daily_cap_per_user`. All duration knobs are **minutes (wall-clock)** — never run-counts (see §2.3).
- **Heartbeat:** `last_run_at`, `last_run_stats jsonb` (tents claimed, backlog depth, alerts inserted, deliveries enqueued/skipped by reason, breaker state, error). With no Sentry anywhere, this row plus the `alert_deliveries` ledger **is** the internal telemetry; the external dead-man’s switch (§3 step 8) is what actually wakes the founder.

The evaluator reads this row **first every run** and exits `{skipped:true, reason:'disabled'|'paused'|'early'}` — the `retry_after_until` early-exit shape from `process-email-queue/index.ts:116-127`. This is the primary runtime kill switch, per the house rule that `src/lib/featureFlags.ts` is compile-time only and must never gate security/ops paths (`featureFlags.ts:7-11`).

**Operator flip — one setter, audited.** A single `SECURITY DEFINER` RPC gated on `has_role(auth.uid(),'operator')`, following the operator conventions of `billing_subscription_update_operator_audit` (`20260622170000_*.sql:102-165`): `VOLATILE`, `SET search_path TO 'public','pg_temp'`, soft-fail `{ok:false, reason:'operator_required'}`, `REVOKE` PUBLIC/anon, `GRANT` authenticated. **The setter must, in the same statement, insert an operator-audit row (who, when, old→new `enabled`/`paused_until`)** — mirroring the billing updater’s *audit-write* convention, not just its read RPC: a silently disabled safety evaluator is itself a security failure, and DB tables are the only record. Surface current switch state and the last flip on a `/operator/alert-delivery` page inside the existing `<RequireOperatorRole />` route block (`src/App.tsx:318-378`), and treat “evaluator disabled > X hours” as a heartbeat alarm. **Break-glass** (secondary): `REVOKE EXECUTE` posture per `docs/billing-entitlement-updater-rpc-design.md:477-483`, or `cron.unschedule`. Guard test: §11.6.

### 2.2 Scheduling watermarks: `alert_eval_watermarks`

Per-tent: `tent_id PK, user_id, last_evaluated_at`. This table exists for **due-tent scheduling and concurrency claims only** — it is *not* a data high-water mark, and evaluation never uses it to exclude readings:

- **Due selection = claim, atomically.** Concurrent cron fires are guaranteed (`net.http_post` is fire-and-forget, same as the email cron — `email_infra.sql:282-303`; any run longer than one tick overlaps the next). So selection and claim are one transaction:

  ```sql
  UPDATE alert_eval_watermarks
     SET last_evaluated_at = now()
   WHERE tent_id IN (
           SELECT tent_id FROM alert_eval_watermarks
            ORDER BY last_evaluated_at ASC NULLS FIRST
            LIMIT batch_size
            FOR UPDATE SKIP LOCKED)
  RETURNING tent_id, user_id;
  ```

  Two overlapping invocations **cannot double-evaluate a tent** — the second skips locked rows and claims the next-oldest batch. This is the pgmq visibility-timeout shape in SQL, and it is also what makes N parallel invocations safe if the SLO ever needs them. Oldest-first is starvation-free; catch-up after downtime is bounded per tick.
- **Evaluation reads a fixed trailing window, not “since watermark”:** `captured_at >= now() - interval '30 minutes'` (the existing staleness bound `STALE_THRESHOLD_MS`, `src/lib/sensorSnapshot.ts:114`), with `captured_at` clamped to `now()` (the DB trigger legally permits +5 min skew, `20260523000307_*.sql:29-31`). Because the watermark never excludes rows, clock-skewed devices and out-of-order arrivals (Pi multi-batch backfill, `docs/pi-bridge-contract.md:76`) are harmless: re-reading the window costs one index-range scan, and evaluation is idempotent. A Pi reconnect that backfills ≥7 days of buffered rows **never fires breach alerts for historical data** — only the trailing window is ever evaluated. Rows with `NULL captured_at` (legacy manual) are ignored; the ingest contract mandates freshness from `captured_at`, never `created_at` (`docs/sensor-ingest-payload-contract.md:96`). Skewed-clock and out-of-order fixtures pin this in the unit tests.
- **Row seeding:** each run inserts missing watermark rows for tents that have readings in the trailing window (`ON CONFLICT DO NOTHING`), served by the new index.

### 2.3 Notification hysteresis: `alert_delivery_rule_state`

Per `(user_id, tent_id, rule_key)` — `rule_key` is `lower(source||'::'||metric||'::'||title)`, identical to the client `alertRuleKey`. Shape reminder: `phase ('quiet','sustaining','notified','clearing')`, `breach_first_seen_at`, `breach_last_seen_at`, `clear_first_seen_at`, `last_notified_at`, escalation timestamps (e.g. `last_reminder_at`).

Two deliberate properties:

1. **Wall-clock timestamps, never run-counters.** Evaluation cadence per tent is *not* constant (batch backlog, pauses, catch-up bursts, parallel workers), so “N consecutive runs” silently changes meaning whenever cadence or backlog changes — two “periods” can be hours apart under starvation or milliseconds apart under a double-fire. All sustain/clear/reminder logic transitions on durations against `sustain_minutes`/`clear_minutes`/`reminder_after_minutes` (§5), making the state machine invariant under cadence changes, pauses, backlog, and concurrency.
2. **This table exists because `alerts` cannot carry it:** `last_seen_at` is write-once with zero updaters, re-fires against an open row are silently suppressed, and there is no hysteresis or auto-resolve anywhere (reader-verified lifecycle facts on `src/lib/alertStatusTransitionRules.ts` and the alerts schema `20260520233437_*.sql`).

The table is channel-agnostic (the `alert_deliveries` ledger carries the channel dimension), which is what keeps the v2 push sketch (§9) schema-compatible.

### 2.4 Alerts-table hardening (closes an existing race too)

The client dedupe key is `alertRuleKey` checked against open rows (`src/lib/environmentAlertPersistence.ts:75-84`), guarded only by an in-memory `inFlightKeys` set — two browser tabs can already double-insert today. The Data Model migration adds the missing DB backstop, `alerts_open_rule_key_uidx`: a partial unique index on `(user_id, grow_id, lower(source||'::'||metric||'::'||title)) WHERE status='open'`, which also makes evaluator re-runs idempotent.

The evaluator writes `source = 'environment_alerts'` — the **same** source string as the client hook — so client and server share one dedupe namespace and a still-mounted dashboard cannot double a server-created alert. Per the AUD-002 contract, **titles stay value-free** (observed values/timestamps/stage go in `reason` only; `defaultEnvironmentThresholds.ts:139-171`). On conflict the evaluator adopts the existing open row's **id only** — never its text (§6.3): `alerts` is client-writable (`usePersistEnvironmentAlerts` inserts `title`/`reason` directly), so adopted-row content is untrusted and must never reach email.

### 2.5 Delivery ledger + digest idempotency: `alert_deliveries`, `digest_send_state`

- `alert_deliveries` — shape reminder: `UNIQUE(alert_id, channel, kind)` with `kind IN ('initial','reminder','recovery')`; claim-before-send; status / provider ref / error / skip reason; owner SELECT-only RLS, writes service-only. The `kind` column is load-bearing: v1 sends up to three emails per alert row (initial + reminders + recovery), and **every one of them is individually claimed and audited** — a bare `UNIQUE(alert_id, channel)` would either skip the reminder claim or leave it unauditable. It is also the delivery-decision trace: “why didn’t I get an email?” traverses ~9 gates (entitlement, suppression, prefs, cooldown, daily cap, sustain, fleet breaker, TTL/DLQ), so **every evaluated-but-not-enqueued decision writes a ledger row with its skip reason** (`'not_entitled'`, `'suppressed'`, `'daily_cap'`, `'fleet_offline_anomaly'`, `'quiet_hours'`, …) — pinned by the §11.2 static scan. Because owner SELECT RLS exists, the user’s own Alerts page can surface “skipped: daily cap reached” chips, and the operator RPC gains a per-user lookup mode (clamped like `p_limit`, `20260622170000_*.sql:111`) so the most common support question is a query, not a mental re-execution of the evaluator.
- `digest_send_state` — `user_id PK, last_digest_date, message_id`: one digest per user per day, idempotent across crashes and retries (§7).

There is **no separate run-audit table**: per-run stats live in `alert_evaluator_state.last_run_stats`, per-delivery history lives in the ledger, and liveness detection is external (§3 step 8).

## 3. Evaluator run loop (per tick)

1. **Gate:** read `alert_evaluator_state`; exit `{skipped:true}` if `enabled=false`, `paused_until > now()`, or `now() - last_run_at < eval_cadence_minutes`.
2. **Seed + claim:** upsert missing watermark rows, then claim up to `batch_size` tents via the atomic `FOR UPDATE SKIP LOCKED` update (§2.2). Record backlog depth (due tents *not* claimed this tick) — a silently growing backlog is exactly the “impression of coverage” failure this feature must not have, and it is the first thing the SLO tuning (batch size, parallel invocations) reacts to.
3. **Set-based snapshot query (one statement for the whole batch):** a LATERAL latest-per-metric select over the claimed tents joined through `tents` → `grows`, mirroring `snapshotFromReadings` semantics (`src/lib/sensorSnapshot.ts:171-245`) and the filters of `get_latest_tent_sensor_snapshot` (`20260617164759_*.sql:47-69`): trailing 30-min window, `quality='ok'` (the filter `evaluate_vpd_drift_ewma` already applies, `20260604063855_*.sql:190`), source-classification mapping, `captured_at` clamped to `now()`. **Every `sensor_readings` access in this query MUST carry the predicate `sensor_readings.user_id = tents.user_id`** — non-negotiable and pinned by the §11.2 static scan. The `sensor_readings` INSERT policy checks only `auth.uid() = user_id` and `tent_id` is an unvalidated soft reference (`20260516204601_*.sql:159-160`, `validate_sensor_reading` never checks tent ownership, `20260617164759_*.sql:6-45`), so without this predicate a service_role evaluator turns cross-user reading-poisoning into cross-user email triggering — user A could fire breach emails at B, mask B’s real overnight breach with in-range rows, or keep B’s dead sensor looking alive. (Companion hardening, tracked with the Data Model migration: extend `validate_sensor_reading` to require the tent-ownership `EXISTS` check the `pi_ingest` path already performs server-side, `20260523184548_*.sql:41`.) Populate `metric_refs` from row ids so `originating_timeline_events` evidence refs work identically to `buildSensorSnapshotEvidenceRefs` (`usePersistEnvironmentAlerts.ts:204-227`). Tents whose `grow_id IS NULL` are skipped (`alerts.grow_id` is NOT NULL, `20260520233437_*.sql`; no schema change in v1 — matching the client's grow-scoped hooks). `grow_targets` are loaded in the same batch statement, normalized as `useGrowTargets` does (`src/hooks/useGrowTargets.ts:26-55`); harvest/unknown stages produce no stage-aware alerts (deliberate suppression — keep it).
4. **Run the pure rules in memory:** `evaluateSensorQuality` → `compareSnapshotToTargets` → `buildEnvironmentAlerts` → `selectPersistableAlerts` (strips synthetic ids; enforces live/manual + non-stale + non-demo). Same code, `_shared` copies. Plus the **offline rule (server-only):** newest `quality='ok'` reading older than 45 minutes (a constant in the shared rule module — deliberately above the 30-min client staleness bound, so the client shows “stale” before the server emails) synthesizes rule key `environment_alerts::snapshot::sensor offline`, severity `watch`. Reads `sensor_readings` directly (same user-predicate rule), **not** `sensor_ingest_audit_log`, because only the webhook writes the audit log — ecowitt and pi traffic would be invisible to it (`20260527160147_*.sql` + reader fact).
5. **Fleet-offline circuit breaker (before any delivery work):** if more than `fleet_offline_breaker_pct` of the claimed sensor-connected tents transitioned to offline in this run, the true story is “our ingest is down”, not thousands of individually dead sensors — a platform-wide ingest failure (edge-function incident, bad ingest deploy, DB brownout) must not mass-mail every Pro user a false “your sensor went quiet” during the exact window the founder is firefighting, nor burn the shared email queue against auth traffic. Under the breaker: **in-app alert rows are still written**, all offline *deliveries* for the run are suppressed as `alert_deliveries` rows with skip reason `'fleet_offline_anomaly'`, `last_run_stats` records the breaker trip, and the operator is alerted via the external monitor (step 8) — the runbook documents that recovery notices for breaches created under the breaker are also suppressed. Breaker presence is pinned by the §11.2 static scan.
6. **Hysteresis + persistence + delivery** (§5): bulk compare-and-set transitions on `alert_delivery_rule_state`, alert-row inserts (`ON CONFLICT` on `alerts_open_rule_key_uidx DO NOTHING`, adopt id only), ledger claims, per-user collapse, enqueue. Rendering happens only for claimed deliveries, after the evaluation transaction commits.
7. **Heartbeat:** update `last_run_at` / `last_run_stats`.
8. **External dead-man’s switch:** end every successful run with an HTTP ping to a hosted heartbeat monitor (healthchecks.io free tier; a Sentry cron monitor when that lands) — and `process-email-queue` gains the same end-of-run ping. Detection of a dead evaluator must depend on **neither Supabase nor the founder’s browser**: the known failure shape (missing cron job or vault secret on a fresh/branch DB, or drift on the diverged `verdant-grow-diary` deploy branch) produces zero errors, frozen watermarks, and zero emails — indistinguishable from a healthy grow unless something external pages. The monitor pages the founder via a non-Supabase channel on a missed ping. Phase 0 exit criterion: **7 days of external heartbeats received**, not “7 days of fresh heartbeats read off the operator page”. The ping call is pinned by the §11.2 static scan so it cannot be silently dropped.

**Writes bypass RLS defaults — stamp everything.** `alerts.user_id` and `alert_events.user_id` DEFAULT `auth.uid()`, which is NULL under service_role; the evaluator must explicitly set `user_id`, `grow_id`, `tent_id` and verify tent→grow ownership itself (reader-verified constraint on `20260520233437_*.sql` / `20260520234331_*.sql`). CHECK constraints are load-bearing: severity ∈ {info,watch,warning,critical}, status ∈ {open,acknowledged,resolved,dismissed}, `resolved_at` only with status='resolved', `originating_timeline_events` must be a jsonb array. Recovery handling (§5) writes `status='resolved'` + `resolved_at` together and logs an `alert_events` row with the existing `'resolved'` event type — **no new event_type values** without a CHECK-widening migration.

## 4. Severity → delivery classes (new model, deliberately not inherited)

The persisted severity vocabulary is not paging-ready: real environment breaches are always `warning` (hardcoded, `environmentAlerts.ts:170-190`), `critical` means "physically implausible sensor," and `watch` means staleness. The delivery engine therefore defines its own mapping and does not touch the stored vocabulary:

| Condition | Alert row severity (unchanged) | Real-time email? | Notes |
|---|---|---|---|
| Target/default-threshold breach, sustained ≥ `sustain_minutes` | warning | Yes (Pro) | The core "tent drifted overnight" notice |
| Sensor offline ≥ 45 min (rule-module constant) | watch | Yes (Pro), unless fleet breaker tripped | New server-only rule key |
| Implausible sensor fault (promoted critical) | critical | Yes (Pro), worded as a sensor problem | `isCriticalImplausible`, `environmentAlerts.ts:69-96` |
| Info-class (missing targets, unavailable snapshot) | info | Never | Synthetic ids are already stripped by `selectPersistableAlerts` |

**Copy constraints:**
- **Subjects are generic and value-free — always.** `'A tent needs review'` (plus the app name), never metric values, tent names, durations, or conditions. Subjects transit notification previews, provider logs, and downstream mailboxes; the user base has real jurisdictional exposure (home growers), so the app deep link is the primary payload and the login-gated app is the system of record. Cultivation details appear only in the body, and minimally even there (§6.3).
- Grower-facing text must avoid the banned words (`urgent`, `critical`, `emergency`, `auto`, `fix`, `healthy`, `ideal`, …) enforced by existing copy tests (`src/test/diaryTimelineEvidenceQualityRules.test.ts:71`, policy in `docs/v0-release-checkpoint.md:351`).

## 5. Hysteresis, dedup, escalation, recovery

Per (user, tent, rule_key), each evaluation transitions `alert_delivery_rule_state` on **wall-clock durations**. Every transition that can cause a send is a compare-and-set (`UPDATE ... WHERE phase='...' AND <precondition> RETURNING`) followed by a ledger claim (`INSERT INTO alert_deliveries ... ON CONFLICT DO NOTHING`); an email is enqueued **only if both the CAS row and the claim row came back** — so two overlapping invocations can never double-send, even with distinct `message_id`s the worker's dup-guard couldn't catch.

```
quiet:      breaching reading seen
              -> breach_first_seen_at = now(), phase='sustaining'

sustaining: still breaching -> breach_last_seen_at = now()
            notify when ALL of:
              now() - breach_first_seen_at >= sustain_minutes
              breach_last_seen_at within 2 x eval_cadence_minutes   -- a stale
                observation cannot satisfy sustain after a pause/backlog
              the sustain window contains >= 2 distinct breaching readings
                (readable from the batch snapshot query) -- a single reading
                straddling two evaluations never fires
              then: insert alerts row (ON CONFLICT alerts_open_rule_key_uidx
                    DO NOTHING; adopt existing open row's id ONLY — never its
                    title/reason, §6.3)
                    log alert_events 'created'
                    CAS phase='notified', last_notified_at = now()
                    claim ledger (alert_id,'email','initial') -> enqueue (§6)
            clear seen -> reset to quiet (breach timestamps nulled)

notified:   still breaching AND
            now() - coalesce(last_reminder_at, last_notified_at)
              >= reminder_after_minutes (default 360)
              -> CAS last_reminder_at, claim (alert_id,'email','reminder'),
                 enqueue "still outside range" notice
              -- the reminder RE-ARMS each reminder_after_minutes window, so a
              -- continuously breaching tent (the overnight heat event the
              -- feature is sold on) keeps notifying at a bounded cadence
              -- (<=4/day/rule at the default) instead of going silent after
              -- one reminder; daily_cap_per_user is the hard ceiling
            clear seen -> clear_first_seen_at = now(), phase='clearing'

clearing:   still clear AND now() - clear_first_seen_at >= clear_minutes
              -> auto-resolve the alert row (status='resolved' + resolved_at
                 together, alert_events 'resolved',
                 note 'condition returned to range')
              -> claim (alert_id,'email','recovery'), enqueue recovery notice
              -> reset to quiet (timestamps nulled)
            breach re-appears -> back to 'notified', clear_first_seen_at
              nulled; NO new initial email (the reminder window governs)
```

Why this shape:

- **Cadence-invariant flap immunity:** deadbands in the classifiers (VPD 0.05 kPa, temp 0.3 °C, RH 1.5 %, `vpdStageTargetRules.ts:69` / `environmentStageTargetRules.ts:54-55`) damp boundary chatter; `sustain_minutes` (default 10) plus the ≥2-distinct-readings requirement filters single-reading spikes at the 60 s ingest cadence (`docs/ecowitt-windows-testbench.md:82`). Because everything is denominated in minutes, retuning `batch_size` or cadence is a *scale* change, never a *correctness* change.
- **Storm control (heat-wave defense), three producer-side bounds in order of impact:**
  1. **Per-user per-tick collapse** (`storm_user_collapse`, default on): all newly-notifying (tent, rule) pairs for one user in one tick produce **one email** (“3 tents drifted out of range”), turning tents×rules fan-out into users — the 8-tent Pro grower gets one message, not 16. Each covered alert still gets its own claimed `('initial')` ledger row; they share one `message_id`.
  2. **Global per-run budget** `max_deliveries_per_run`: overflow keeps alert rows and hysteresis state and **defers** the email to the next tick (the state machine tolerates deferral by construction) — never a silent drop.
  3. **Daily cap** `daily_cap_per_user`, counted from the `alert_deliveries` ledger keyed on `user_id` — never from `email_send_log` by `recipient_email`, which is a mutable join key with no timezone-defined “today”. Definition: kinds `initial` + `reminder` with sent/claimed status inside the **current UTC day** count against the cap; `recovery` and the digest are exempt. Cap-suppressed sends are recorded as ledger rows with skip reason `'daily_cap'`.
  Plus the fleet-offline breaker (§3.5) for correlated offline storms. Even a fleet-wide heat event stays orders of magnitude under the pipeline’s ~120 emails/min/queue ceiling (worker: batch 10 per 5 s tick, 200 ms inter-send delay — reader-verified). **Required pipeline change:** `email_send_state.retry_after_until` is a single shared 429 cooldown that halts BOTH queues (`process-email-queue/index.ts:122-127`) — it must become per-queue before GA, so an alert-volume 429 can never block password resets and signups.
- **At-most-once bias:** the CAS + ledger claim commit **before** enqueue. A crash between claim and enqueue loses one email (recovered by the next reminder window); the reverse order would risk duplicates, which are worse for trust. The worker's own duplicate-send guard (unique partial index on `message_id WHERE status='sent'`, `email_infra.sql:80-81`) backstops queue-side races.

## 6. Email producer contract (existing pgmq pipeline)

Queue: **`transactional_emails`** via `supabase.rpc('enqueue_email', { queue_name, payload })` — service_role-only by grant (`email_infra.sql:137-147, 201-202`), which the evaluator is. Follow the `auth-email-hook` producer pattern exactly (`supabase/functions/auth-email-hook/index.ts:245-285`): insert `email_send_log` `status='pending'` **before** enqueue; insert `status='failed'` if enqueue throws.

### 6.1 Recipient — pinned, not implied

The recipient is **exclusively `auth.users.email` of the resolved tent owner**, read via the service_role admin API, and **only when `email_confirmed_at IS NOT NULL`**. There is no email column on `profiles` (`src/integrations/supabase/types.ts:2465-2485`, gamification-only) and there is deliberately **no user-writable recipient field in v1** — a prefs-sourced address would make the pipeline an arbitrary-recipient harassment engine (attacker sets a third party's address, points a breaching or poisoned sensor at it, and the shared sending domain that also carries auth email takes the reputational damage). Any future custom notification address requires its own verified double-opt-in loop. The §11.2 static scan asserts the producer never reads a recipient from prefs/profiles/billing tables (`billing_customers` rows carry provider emails that may not match the account).

### 6.2 Payload

Exact fields the worker forwards (`process-email-queue/index.ts:252-266`):

```jsonc
{
  "message_id": "<crypto.randomUUID(); one logical email, stable across retries>",
  "to": "<auth.users.email per 6.1>",
  "from": "verdantgrowdiary-com <noreply@verdantgrowdiary.com>",
  "sender_domain": "notify.verdantgrowdiary.com",
  "subject": "A tent needs review",     // generic + value-free, always (see 6.3)
  "html": "<renderAsync(EnvironmentAlertEmail)>",   // rendered post-claim only,
  "text": "<renderAsync(..., {plainText:true})>",   // bounded by max_deliveries_per_run
  "purpose": "transactional",
  "label": "environment_alert",          // becomes template_name in email_send_log
  "unsubscribe_token": "<token>",        // REQUIRED for this producer, see 6.4
  "queued_at": "<new Date().toISOString()>"  // REQUIRED — see below
}
```

Producer-side obligations the pipeline does **not** handle (reader-verified gaps):

1. **`queued_at` is mandatory.** The worker's `msg.enqueued_at` fallback is dead code (`read_email_batch` returns only msg_id/read_ct/message, `email_infra.sql:149-159`); omitting `queued_at` silently disables TTL→DLQ protection.
2. **Suppression check is the producer's job.** `suppressed_emails` has zero readers anywhere in `supabase/functions/` — the worker never checks it. Before enqueue, check suppression **scoped by category** (per the Data Model's suppression scoping: an alert-digest unsubscribe must not suppress the paid breach notices; `bounce`/`complaint` stay global); if suppressed, skip, write the ledger row with skip reason `'suppressed'`, and log an `email_send_log` row with `status='suppressed'` (already in the CHECK list, `email_infra.sql:84-88`). **Do not invent new status values** — the worker's existing `'rate_limited'` insert already violates the CHECK and fails silently (`process-email-queue/index.ts:301-307`); that bug must not be copied.
3. **`message_id` is unique per logical email and stable across retries** — it is both the 5-failure retry budget key and the dup-send guard; never reuse across recipients or regenerate per attempt. Under per-user collapse one `message_id` covers several claimed ledger rows.
4. **Template:** new `environment-alert.tsx` beside the six auth templates in `supabase/functions/_shared/email-templates/`, rendered with `renderAsync` html+plainText, same inline-hsl styling convention. Rendering runs only for deliveries claimed this tick, after the evaluation transaction — never inside the per-tent loop.
5. **TTL awareness:** `transactional_emails` TTL is 60 min → older messages are silently DLQ'd. Acceptable for freshness-sensitive alerts (a 90-minute-late "tent is hot" email is worse than none); the reminder/recovery machinery re-covers persistent conditions. The digest does **not** ride this queue (§7).

### 6.3 Content rules — no client-authored text, data minimization

- **Render ONLY evaluator-computed values** (metric, band, observed value, timestamps, recomputed reason via the `_shared` rule copies) plus **HTML-escaped, length-clamped** tent/grow names. **Never** render `alerts.title`/`alerts.reason` into subject or body: `alerts` is client-writable and the adopt-on-conflict path (§5) anchors deliveries to rows whose text a user may have authored — interpolating it would let a user manufacture phishing-shaped copy signed by `notify.verdantgrowdiary.com`, the same domain that carries auth email. `tents.name` is unconstrained free text (`types.ts:2716`) — escape and clamp it. Pinned by the §11.2 scan (no interpolation of alert-row text columns into subject/html).
- **Data minimization (jurisdictional privacy):** subjects generic and value-free (§4); bodies carry readings and tent names only — never strain names or plant counts; the app deep link is the primary payload. `email_send_log.metadata` carries `message_id` + label only — no readings, no tent names. Retention: purge/redact DLQ message bodies and `email_send_log` rows older than N days (the DLQ is currently an unwatched permanent store of rendered content — `email_infra.sql`); the operator RPC returns counts + status with truncated/hashed recipients, never full address-to-tent joins. CAN-SPAM footer requirements (postal address, working opt-out) live in the shared template footer.

### 6.4 Unsubscribe (must ship in v1)

Recurring alert email is not one-off transactional; `email_unsubscribe_tokens` exists (`email_infra.sql:244-280`) but no generator or endpoint does. Concrete contract:

- **Token:** ≥128-bit, server-generated (get-or-create at first alert email), **never logged** (not in `email_send_log.metadata`, not in edge-function logs).
- **Endpoint** (`email-unsubscribe`, `verify_jwt=false` — clicked from mail): **GET returns a confirmation page; suppression happens only on the POST from that page**, plus RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers so provider one-click (a POST) works and mail-scanner GET prefetch (Outlook SafeLinks, corporate gateways) can never mass-unsubscribe users who never clicked.
- **Idempotent:** repeat clicks succeed regardless of `used_at` — `used_at` is telemetry, not invalidation (the opt-out link in every subsequent email must keep working; CAN-SPAM requires the mechanism to function for 30 days after each send).
- **Rate-limited** by IP + token; suppression is **scoped** (digest unsubscribe ≠ breach-notice suppression, per 6.2.2), with a service_role re-subscribe path and a visible "notifications disabled for this address" state in Settings with re-enable — so a hostile unsubscribe from a forwarded email is at least visible to the account owner and reversible, instead of permanently and silently killing a paid safety feature.

### 6.5 Entitlement gate on delivery

Alert **rows** are written for every user (reads/history stay ungated, house RESTRICTIVE-policy stance). Real-time email delivery is Pro-gated via `public.has_alert_delivery_entitlement(uuid)` — a verbatim structural copy of `has_pheno_tracker_entitlement` final state (`supabase/migrations/20260709193855_*.sql:12-62`): plpgsql `STABLE SECURITY DEFINER`, `SET search_path TO 'public','pg_temp'`, anti-oracle guard (`current_setting('role',true)` / `auth.uid()` / return-false probe), **union of BOTH billing tables** (`billing_subscriptions` plan+status+`current_period_end` incl. canceled-in-period grace, OR `subscriptions` with `environment='live'`), `REVOKE` PUBLIC+anon, `GRANT` authenticated+service_role. The evaluator calls it **only for users that reached the notify transition** (not per tent per tick); non-entitled transitions still update state and alert rows, recorded as ledger rows with skip reason `'not_entitled'`.

Prefs interplay (shapes owned by the Data Model): `alert_delivery_prefs` keeps digest/email-enabled fields under **plain owner RLS** — only the Pro-only real-time fields (`realtime_enabled`, `min_severity`, quiet hours) sit behind the RESTRICTIVE `has_alert_delivery_entitlement` policy. The digest itself is **opt-in (no row = no digest)**, so a Free user's opt-out never requires an entitlement-gated write in the first place.

## 7. Digest channel (own queue, own idempotency — Phase 1 is not shippable without this)

The digest is the Free tier's value and the stated de-risking path, so it gets a real design, not a sentence:

- **Own pgmq queue `digest_emails`, TTL 12–24 h**, own batch/delay knobs, processed by a ~30-line extension of the existing per-queue worker loop (after `auth_emails` and `transactional_emails`). It must **not** share `transactional_emails`: pgmq is FIFO per queue and TTL is per-queue, so a 10k-user digest cohort would head-of-line-block a heat-wave breach email past its own 60-min TTL into the DLQ — the exact email the product promises "within minutes". The two classes also want opposite TTLs (breach: short; digest: hours).
- **Opt-in:** enqueue only for users with an `alert_delivery_prefs` row with the digest enabled — no row, no digest (this is also what makes the Free opt-out entitlement-free, §6.5). v1 scheduling: fixed UTC send window with an hourly cohort picker; timezone-aware `digest_hour` is deferred (no tz requirement on the v1 prefs write path). Cohorts are sized so no cohort exceeds ~30 min of drain at current worker throughput; GA of the free digest is gated on measured cohort size vs the queue ceiling.
- **Idempotency:** before enqueue, compare-and-set `digest_send_state` (`user_id PK, last_digest_date, message_id`): `UPDATE ... SET last_digest_date = current_date, message_id = $1 WHERE user_id = $2 AND (last_digest_date IS NULL OR last_digest_date < current_date) RETURNING 1` — a mid-run crash and retry cannot double-send, and the `alert_deliveries` UNIQUE key (which needs an `alert_id`) is not abused for digests.
- **Assembly query:** the digest is assembled from `alerts` + `alert_deliveries` + `alert_delivery_rule_state` for the user's trailing day — what fired, what resolved, what is still in phase `notified`, and what was skipped (daily cap / quiet hours), all data the evaluator already wrote. **No retrospective full-day scans of `sensor_readings`** — at fleet scale that is millions of rows in the digest window for information the ledger already holds.
- **Quiet hours:** real-time notices held by quiet hours are recorded as ledger rows with skip reason `'quiet_hours'` and are therefore picked up by the ledger-driven digest assembly above — no separate hold table; the alert row itself remains visible in-app immediately.
- Digest sends are exempt from `daily_cap_per_user` (§5) and carry `label='environment_digest'`; content follows the same §6.3 minimization rules; the `process-email-queue` end-of-run heartbeat ping (§3.8) covers the digest lane too.

## 8. Cadence and load budget

- **Cadence:** cron floor `*/5`, tunable via `eval_cadence_minutes`. Worst-case notify latency at defaults = one cadence tick (≤5 min, SLO-bounded to 10) + `sustain_minutes` (10) ≈ **15–20 min from first breach reading**, versus "never" today. Sub-5-min cadence buys little because sustain dominates.
- **Throughput to the SLO, not to a fixed count:** per tick, one claim UPDATE + one LATERAL batch snapshot statement (served by the concurrent `(tent_id, captured_at DESC)` index) + one bulk hysteresis upsert + O(claimed deliveries) renders/enqueues. `batch_size` is sized so `fleet_size / batch_size × cadence ≤ SLO`; when a single invocation's wall-clock budget can't hold that, the SKIP LOCKED claim (§2.2) already makes N parallel invocations safe — the cron fans out to shards without any schema change. **Backlog depth is recorded in `last_run_stats` every run and alarmed on** — a growing backlog silently converts "sustained 10 minutes" into "whenever we got around to it", which the wall-clock state machine tolerates correctly but the SLO does not.
- **Email volume:** bounded by sustain + per-user collapse + `max_deliveries_per_run` + reminder cadence (`reminder_after_minutes`) + `daily_cap_per_user`; digest volume isolated on its own queue. The remaining shared-fate risk (single provider key, per-queue 429 isolation) is called out in §5.

## 9. Push channel — v2 sketch only (not in v1 scope)

- New `push_subscriptions` table: `{user_id, endpoint UNIQUE, p256dh, auth, user_agent, created_at, revoked_at}`, select/insert/delete-own RLS; client registers a service-worker Web Push subscription from the (currently `coming_soon`) Notifications tile in `src/pages/Settings.tsx:433-437`.
- VAPID keypair in supabase_vault (same secret-handling posture as `email_queue_service_role_key`).
- Delivery reuses the queue architecture wholesale: evaluator enqueues to a new pgmq `push_notifications` queue; a sibling `process-push-queue` worker (clone of the email worker's batch/VT/retry/DLQ skeleton) sends via Web Push, pruning subscriptions on 404/410. FCM only if/when a native wrapper exists.
- Nothing in the v1 schema blocks this: `alert_delivery_rule_state` is channel-agnostic and `alert_deliveries` already carries the `channel` dimension.

## 10. Failure-mode table

| Failure | Detection | Behavior |
|---|---|---|
| **Cron missed / job or vault secret absent** (branch DB, unschedule, Management-API apply skipped) | **Missed external heartbeat ping → monitor pages the founder** (§3.8) — never dependent on someone opening the operator page. Secondary: operator page shows `last_run_at` age; runbook check `SELECT * FROM cron.job WHERE jobname='evaluate-environment-alerts'` | Watermarks stop advancing — nothing is lost, only delayed. On resume, catch-up is claim-bounded to `batch_size` tents/tick oldest-first; the trailing-window read means aged readings produce **no retroactive breach storm** (a breach *still* ongoing fires normally from fresh readings), and wall-clock sustain semantics are unaffected by the gap. |
| **Concurrent/overlapping invocations** (long run + next tick, or parallel shards) | By design, not detection | `FOR UPDATE SKIP LOCKED` claim means no tent is double-evaluated; every send-capable transition is CAS + ledger claim, so no double-sends and no counter corruption (there are no counters). |
| **Evaluator crash mid-run** | `last_run_stats.error` populated / stale `last_run_at`; missed heartbeat ping if the whole run died | Claimed tents that completed keep their transitions; unfinished tents simply come due again (their `last_evaluated_at` was stamped at claim — worst case one extra cadence interval, within SLO slack). Idempotent by construction: `alerts_open_rule_key_uidx` ON CONFLICT DO NOTHING, ledger claim precedes enqueue, worker dup-guard on `message_id`, `digest_send_state` CAS. One tent's bad data never blocks the batch (per-tent isolation inside the in-memory rule pass, error counted in `last_run_stats`). |
| **Fleet-wide ingest failure** (edge incident, bad ingest deploy, DB brownout) | Fleet-offline circuit breaker trips at `fleet_offline_breaker_pct` (§3.5); `last_run_stats` records it; ops alert via external monitor | In-app offline alert rows still written; **all offline emails for the run suppressed** as `'fleet_offline_anomaly'` ledger rows (recovery notices for breaker-era breaches also suppressed — runbook-documented). No mass false "your sensor went quiet" mail, no queue burn against auth email during the incident. |
| **Email queue backlog / worker down** | Missed `process-email-queue` heartbeat ping; `email_send_log` status counts + DLQ depth on the operator page; `pgmq.metrics()` | Transactional messages older than 60 min TTL are silently DLQ'd (existing worker behavior); digests have their own 12–24 h TTL on `digest_emails`. In-app alert rows and Alerts-page visibility are unaffected — email is additive, never the system of record. Persistent conditions re-notify via the re-arming reminder window; lost recovery notices are acceptable (the alert row shows resolved). |
| **Provider 429** | `email_send_state.retry_after_until` in the future (operator page). Note: rate-limited attempts are currently **invisible** in `email_send_log` due to the CHECK-violating `'rate_limited'` insert (`process-email-queue/index.ts:301-307`) — fix, do not replicate | Today the single shared cooldown halts BOTH queues — the §5 per-queue `retry_after_until` change is required before GA so alert volume can never starve auth email. Messages retry after VT expiry within the 5-failure budget → DLQ. Producer-side bounds (collapse, per-run budget, daily cap, sustain) keep alert volume from being what trips the 429. |
| **Sensor offline / no data (single tent)** | The evaluator itself: newest `quality='ok'` reading (owner-filtered) older than 45 min → `sensor offline` alert + email. Uses `sensor_readings` directly because `sensor_ingest_audit_log` only covers the webhook path | One notice, then re-arming reminders per `reminder_after_minutes`, capped daily; recovery notice when data resumes. Distinct from breach alerts so a dead bridge reads as "sensor stopped reporting", not "conditions are fine". |
| **Kill switch flipped / paused** | Switch state + last audited flip on the operator page; runs logged as `{skipped, reason}`; "disabled > X hours" treated as a heartbeat alarm | Evaluator exits immediately each tick (cheap no-op). Scheduling freezes; re-enable resumes with claim-bounded catch-up and unchanged wall-clock semantics. A flip without an audit row is impossible by construction (§2.1). |
| **Recipient bounced/complained/unsubscribed** | Producer-side scoped suppression check before every enqueue | Skip + ledger row (`'suppressed'`) + `email_send_log` `status='suppressed'`; in-app alert row still created. Digest-scope unsubscribe never suppresses breach notices; re-subscribe path + Settings visibility per §6.4. (Bounce/complaint ingestion into `suppressed_emails` is a follow-on: the table is append-only and service_role-writable, but no webhook feeds it yet.) |

## 11. Guard tests to ship with this section

1. **Entitlement oracle guard:** `has_alert_delivery_entitlement` — latest-migration scan cloned from `src/test/pheno-tracker-entitlement-oracle-guard.test.ts:22-31` (`latestMigrationBodyMentioning()`, anti-oracle regexes, boolean-only, grant posture, `SET search_path TO 'public','pg_temp'` exact quoting). Never a hardcoded file path — that is exactly how the `ai_credit_spend` regression slipped past its pinned-file test (`src/test/ai-credit-effective-entitlement-sql.test.ts:9-11` vs migration `20260709015647`).
2. **Evaluator/producer static scan** of `evaluate-environment-alerts/index.ts`, asserting: service_role claim check present; **the `user_id = tents.user_id` predicate on every `sensor_readings` query** (breach snapshot AND offline check); no writes to `sensor_readings`; explicit `user_id`/`grow_id`/`tent_id` stamping on alerts/alert_events inserts; the `SKIP LOCKED` claim statement; the fleet-breaker branch; the end-of-run heartbeat ping; ledger claim before every `enqueue_email`; every non-enqueue decision writes a ledger skip row; `queued_at` set; scoped suppression check; recipient sourced only from `auth.users` with `email_confirmed_at` (never prefs/profiles/billing); no interpolation of `alerts.title`/`alerts.reason` into subject/html; subject from the fixed generic constant. (There are currently **zero** tests pinning the email enqueue contract — this is the first.)
3. **Ingest functions unchanged:** existing guards (`src/test/manual-sensor-alert-smoke-guard.test.ts`, `operator-ggs-real-payload-ingest-safety.test.ts`) must keep passing — the stop-ship "NEVER triggers alerts" comments are not renegotiated by this feature.
4. **Rule parity:** `_shared` copies of the pure alert modules byte-match `src/lib` originals (dual-helper drift guard), so server and client can never disagree on a rule key or band. Includes skewed-clock and out-of-order fixtures pinning the trailing-window/clamp semantics (§2.2).
5. **Schema-inventory guard:** pins the latest migration defining each canonical table (`alert_evaluator_state`, `alert_eval_watermarks`, `alert_delivery_rule_state`, `alert_delivery_prefs`, `alert_deliveries`, `digest_send_state`) and fails if a later migration re-creates any of them under a different shape or introduces a colliding name — the CREATE-TABLE-IF-NOT-EXISTS idiom makes a duplicate definition silently win, which is how a kill switch stops existing.
6. **Operator setter guard:** latest-migration scan of the `alert_evaluator_state` setter RPC — in-body `has_role` check, **mandatory audit-row insert in the same statement**, `SECURITY DEFINER` + search_path quoting, REVOKE/GRANT posture.
7. **Unsubscribe endpoint scan:** token never logged; GET handler has no suppression side effect (suppression only on POST / RFC 8058 one-click); idempotent success on repeat use; digest-scoped suppression writes never touch the breach-notice scope.

---

# Reliability & Observability, Test Plan, and Rollout

> **Canonical names.** This section references tables by their canonical names only — `alert_evaluator_state` (single-row kill switch + knobs + heartbeat), `alert_delivery_rule_state` (per user/tent/rule hysteresis), `alert_eval_watermarks` (per-tent due-tracking), `alert_delivery_prefs`, `alert_deliveries` (ledger, `UNIQUE(alert_id, channel, kind)`), `digest_send_state`, and `has_alert_delivery_entitlement(uuid)`. Full DDL lives in the Data Model section and nowhere else; anything below is at most a one-line shape reminder. A spec-level table inventory plus the R3.2 name-inventory guard prevents a later migration from forking a second shape.

## R1. Hard prerequisites (blockers — none of the phases below ship until these land)

| # | Prerequisite | Why it blocks |
|---|---|---|
| P1 | **Error tracking (Sentry or equivalent) on `process-email-queue` and the new evaluator worker, PLUS an external dead-man's switch.** | There is **zero error tracking anywhere in the product** (verified audit fact; no Sentry, `src/lib/featureFlags.ts` is compile-time only, and prod ships from the Lovable-managed `verdant-grow-diary` branch with no ops telemetry fallback). An unattended server-side alerting pipeline with no error reporting is worse than the current client-only gap: it creates the *impression* of coverage — and this feature's known failure shape (dead pg_cron job, missing vault secret on the diverged deploy branch, `email_infra.sql:282-303`) produces **zero errors, frozen watermarks, zero emails**, indistinguishable from a healthy grow. Detection must therefore not depend on Supabase or the founder's browser: both the evaluator and `process-email-queue` end each successful run with an HTTP ping to a hosted heartbeat monitor (healthchecks.io free tier, or a Sentry cron monitor once Sentry lands); a missed ping pages the founder via a non-Supabase channel (SMS/push from the monitor service). The ping call is pinned by the R3.2 static scan so it cannot be dropped. **Marketing copy may not say "24/7 monitoring" (or any equivalent) until P1–P7 are deployed and verified in prod.** Instrument: unhandled exception capture, per-run breadcrumbs (tents claimed, backlog depth, alerts created, emails enqueued), and the heartbeat pings above. |
| P2 | **Fix the `rate_limited` send-log bug before adding a producer.** `supabase/functions/process-email-queue/index.ts:301-307` inserts `status:'rate_limited'` but the CHECK in `supabase/migrations/20260707153206_email_infra.sql:84-88` only allows `pending/sent/suppressed/failed/bounced/complained/dlq` — the insert fails silently, so rate-limit events are invisible. Migration: widen the CHECK to include `'rate_limited'` (idempotent `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` per `docs/contributing-supabase-migrations.md`), and make the worker check insert errors. | Alert bursts are exactly the traffic that trips 429s; we must be able to see it happen. |
| P3 | **Wire suppression enforcement and a compliant unsubscribe endpoint.** `suppressed_emails` and `email_unsubscribe_tokens` exist (`20260707153206_email_infra.sql:213-280`) but have **zero readers/writers in the repo** — the worker never checks them and no unsubscribe endpoint exists. Before any recurring alert email: (a) producer (or worker) checks `suppressed_emails` before enqueue; (b) an unsubscribe edge function with these hard properties: server-generated token of **≥128 bits of entropy, never logged**; **idempotent** — repeat clicks succeed regardless of `used_at` (`used_at` is telemetry, not invalidation, so the List-Unsubscribe link keeps working across the CAN-SPAM 30-day window); **GET returns a confirmation page only** — suppression is applied on the confirmation action / RFC 8058 `List-Unsubscribe-Post: List-Unsubscribe=One-Click` POST, never as a GET side effect (mail-scanner prefetch must not mass-unsubscribe users); rate-limited by IP+token; suppression is **scoped by category** (digest unsubscribe ≠ breach-notice suppression; `bounce`/`complaint` stay global) with a defined service_role re-subscribe path and a Settings surface showing "notifications disabled for this address" with re-enable; (c) producer generates/attaches `unsubscribe_token` (today no producer sets it — `auth-email-hook/index.ts:255-270` omits it). Alert-email copy rules gain the CAN-SPAM postal-address footer requirement. | Recurring alert email without a working, scanner-safe, scoped opt-out violates the pipeline's own design and email-compliance norms — and an unscoped one lets a single forwarded digest kill the paid safety alerts. |
| P4 | **DLQ visibility and retention.** `auth_emails_dlq`/`transactional_emails_dlq` are terminal sinks — nothing consumes, redrives, or alerts on them (`process-email-queue/index.ts:56-79`), and failed messages sit indefinitely containing full rendered email bodies. Surface DLQ depth on the operator page (R2), emit a Sentry event when `moveToDlq` fires, and specify retention: purge/redact DLQ message bodies and `email_send_log` rows older than N days. | Combined with P1's gap, DLQ growth is currently invisible — and the DLQ is otherwise an unwatched permanent store of rendered email content. |
| P5 | **Producer contract hygiene.** Every payload the alert producer enqueues MUST set `queued_at` (the `msg.enqueued_at` fallback at `process-email-queue/index.ts:203` is dead code — `read_email_batch` returns only `msg_id, read_ct, message` per `email_infra.sql:149-159`; omitting `queued_at` silently disables TTL protection) and a stable `crypto.randomUUID()` `message_id` per logical email (it is both the retry-budget key and the dup-send guard backed by the unique partial index `email_infra.sql:80-81`). Recipient resolution is part of this contract: the "to" address is **exclusively `auth.users.email` of the resolved tent owner, read via service_role, and only when `email_confirmed_at IS NOT NULL`** — no user-writable recipient field exists in v1 (a writable recipient would make the pipeline an arbitrary-recipient harassment engine against the shared sending domain that also carries auth email); any future custom notification address requires its own verified double-opt-in loop. The R3.2 producer guard asserts the producer never reads a recipient from prefs/profiles/billing tables (`billing_customers` rows carry provider emails that may not match the account). | Silent TTL bypass, broken retry accounting, and an unpinned recipient source otherwise. |
| P6 | **Out-of-band apply step documented per environment.** The email cron job + vault secret (`email_queue_service_role_key`) are applied via Lovable's Management API, not migrations (`email_infra.sql:282-303`) — fresh/branch/local DBs have dead queues. The evaluator's cron job, the heartbeat-monitor URLs, and the `sensor_readings` index (P7) share the same runbook slot. The spec's runbook must include the apply step for prod (which deploys from the `verdant-grow-diary` branch — verify the email migrations + cron exist there before depending on them) and the recreate recipe for the local DB lane. | Otherwise staging "works" with a queue that never drains, or prod ships without the job. |
| P7 | **`sensor_readings (tent_id, captured_at DESC)` index applied out-of-band, and a retention decision.** The evaluator's snapshot query requires this index (existing indexes lead with `user_id` or interpose `source, metric` — R5), but `sensor_readings` is the largest, hottest, append-only table in the system (~2.1M rows/year/tent, no retention). A plain `CREATE INDEX` in a migration takes a SHARE lock that blocks all writes for the build — minutes of dropped EcoWitt POSTs (60 s cadence, no retry buffer) exactly when the feature lands — and `CREATE INDEX CONCURRENTLY` cannot run inside Supabase's transactional migrations. So: **`CREATE INDEX CONCURRENTLY` via the documented P6 runbook slot on prod's `verdant-grow-diary` branch, verified (`pg_index.indisvalid`) before the evaluator is enabled**; the migration carries only an idempotent `CREATE INDEX IF NOT EXISTS` for fresh/branch/local DBs where the table is small. Additionally, a named retention/partitioning decision (e.g. monthly range partitions on `captured_at` with a drop policy, or a rollup table) is a prerequisite before the 10k-tent budget in R5 is treated as achievable — "no retention" and "10k tents" cannot both be true. | Index build outage on the ingest path, and an unbounded table under the new hot query, otherwise. |

## R2. Metrics, heartbeat, and operator audit surface

### R2.1 Evaluator state row (heartbeat + kill switch)

The single source of runtime truth is **`alert_evaluator_state`** — one row (`id=1 CHECK`), canonical DDL in the Data Model section. Shape reminder: kill switch (`enabled` boolean, `paused_until timestamptz`), tuning knobs (`eval_cadence_minutes`, `batch_size`, `storm_user_collapse` boolean, `fleet_offline_breaker_pct`, `max_deliveries_per_run`, `sustain_minutes`, `clear_minutes`, `reminder_after_minutes`, `daily_cap_per_user`), heartbeat (`last_run_at`, `last_run_stats` jsonb — tents claimed, backlog depth, alerts created, deliveries enqueued, breaker/collapse activations). It follows the `email_send_state` single-row house pattern exactly: idempotent DDL, service_role-only RLS, explicit service_role grant (`email_infra.sql:91-101,121-131`; Supabase no longer grants public-schema access to service_role by default, `email_infra.sql:38-40`).

The evaluator worker (a) reads the row first and exits `{skipped:true, reason:'disabled'|'paused'}` when `NOT enabled` or `paused_until > now()` — identical semantics to `retry_after_until` (`process-email-queue/index.ts:116-127`); (b) stamps `last_run_at`/`last_run_stats` at the end of every run; (c) ends every **successful** run with the external heartbeat ping (P1).

**Governance:** operators flip the switch and knobs through exactly one path — a `VOLATILE SECURITY DEFINER` RPC (`SET search_path` pinned, `REVOKE` from PUBLIC/anon, `GRANT authenticated`) gated in-body on `has_role(auth.uid(),'operator')` with soft-fail, which **writes an audit row (who, when, old→new `enabled`/`paused_until`/knobs) in the same statement** — mirroring the billing updater's audit convention, not just its read RPC. Raw service_role SQL is break-glass only, alongside `REVOKE EXECUTE` per `docs/billing-entitlement-updater-rpc-design.md:477-483` and `SELECT cron.unschedule('evaluate-environment-alerts')` as the nuclear option. The setter is pinned by a latest-migration guard test (operator check + audit insert + grant posture, R3.2).

**Heartbeat checks (two independent layers):**
1. *Internal:* `last_run_at` older than 3× `eval_cadence_minutes` = stale evaluator, surfaced on the operator page. `enabled=false` or `paused_until` in effect for longer than a configured window is itself a heartbeat alarm — silent disablement of a safety feature must be visible, not just possible.
2. *External (authoritative):* the P1 dead-man's switch. A missed monitor ping pages the founder without any dependency on Supabase or a browser. Phase 0 exit is defined on this layer, not on the operator page.

Note `src/lib/featureFlags.ts:7-11` explicitly forbids gating this on a compile-time flag; the state row is the sanctioned runtime knob.

### R2.2 Operator audit page: `/operator/alert-delivery`

Clone the existing operator-audit stack end to end:

- **RPC** `alert_delivery_operator_audit(p_limit int, p_user_email text default null)` — copy `billing_subscription_update_operator_audit` (`supabase/migrations/20260622170000_...sql:102-165`): jsonb-returning, `STABLE`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, in-body `has_role(auth.uid(),'operator')` with soft-fail `{ok:false, reason:'operator_required'}`, `p_limit` clamped `LEAST(GREATEST(COALESCE(p_limit,50),1),100)`, `REVOKE PUBLIC/anon`, `GRANT authenticated`. Returns:
  1. the `alert_evaluator_state` row (heartbeat, switch state + **last flip from the audit table**, knobs),
  2. recent alert emails from `email_send_log` filtered by the producer's `label` with status counts (`pending/sent/failed/rate_limited/dlq`) — **counts and truncated/hashed recipients only; the RPC never returns full recipient-address-to-tent joins** (data-minimization: the user base has real jurisdictional exposure),
  3. recent server-created `alerts` rows (source = the evaluator's source string) with created/resolved counts, plus per-run backlog depth and breaker/collapse activations from `last_run_stats`,
  4. DLQ depth for all queues (including `digest_emails`) via `pgmq.metrics` and the newest DLQ entry timestamp (P4), plus **estimated burst drain time at the current opted-in Pro tent count** so the R5 budget is monitored, not assumed,
  5. **per-user lookup mode**: when `p_user_email` is supplied, the last N `alert_deliveries` ledger rows for that user with `kind`/`status`/`skip_reason` — "why didn't I get an email?" traverses ~9 independent gates and must be answerable from one query, not by mentally re-executing the evaluator.
- **Page** — clone `src/pages/OperatorBillingSubscriptionUpdateAudit.tsx`: `useQuery → supabase.rpc(..., {p_limit})` → pure viewModel parser lib, `StatusPill`/`CountCard`, `LIMIT_OPTIONS [25,50,100]`. Route goes inside the existing `<RequireOperatorRole />` block at `src/App.tsx:318-378` (server-RPC role check via `useHasRole('operator')`, `src/components/RequireOperatorRole.tsx:24-74`).
- **User-facing trace:** because `alert_deliveries` carries owner-SELECT RLS, the user's own Alerts page surfaces "held: quiet hours" / "skipped: daily cap reached" chips from their own ledger rows, so the most common questions never become tickets.
- **Pin it** with a grep guard test asserting the RPC's final migration state (operator check, grant posture, search_path pin) using the latest-migration scan (R3.2).

## R3. Test plan (each layer maps to an existing house pattern)

### R3.1 Pure-rule unit tests
The evaluator's decision logic (wall-clock hysteresis, per-key cooldowns, fresh-breach-vs-backfill discrimination, severity/escalation mapping, storm collapse, digest assembly) ships as pure, clock-injected TS libs — same shape as `src/lib/environmentAlerts.ts` / `src/lib/environmentAlertPersistence.ts`, already pinned by `src/test/environment-alerts-persistence.test.ts` and `src/test/stage-aware-vpd-alerts.test.ts`. Required cases:
- backfill discrimination: a Pi reconnect replaying ≥7 days of buffered rows in 500-row batches (`docs/pi-bridge-contract.md:76, §7`) must NOT fire; only breaches with `captured_at` inside the freshness window (30 min, `src/lib/sensorSnapshot.ts:114` / `src/lib/sensorQuality.ts:72`) do.
- **wall-clock hysteresis invariance**: all state-machine knobs are **minutes, never run-counts** (`sustain_minutes`, `clear_minutes`, `reminder_after_minutes` against `alert_delivery_rule_state` timestamps `breach_first_seen_at`/`breach_last_seen_at`/`clear_first_seen_at`). Fixtures must prove the machine is invariant under cadence changes, backlog starvation, pauses, and parallel workers: notify only when `now() - breach_first_seen_at >= sustain_minutes` AND `breach_last_seen_at` is recent (within 2× expected cadence) AND the sustain window contains ≥2 distinct breaching readings — a single reading straddling two evaluations never fires; two blips days apart never merge into one "sustained" breach.
- **watermark robustness**: skewed-clock fixture (`captured_at` legally up to +5 min in the future) — the watermark advances to `LEAST(max(captured_at), now())` so one skewed device can never mask an honest sensor's breach; out-of-order-arrival fixture — evaluation reads a fixed trailing window, the watermark is due-detection only, never an exclusion bound.
- `quality='ok'` filtering (matching `evaluate_vpd_drift_ewma`, `20260604063855_...sql:190`) and source whitelist (`live`/`manual` only — sim/csv/demo never).
- rule-key dedupe parity with the client hook (`alertRuleKey` = lowercase `source::metric::title`, `src/lib/environmentAlertPersistence.ts:75-84`) so client + server never double-insert.
- stage suppression: harvest/unknown stage → no alert (`src/lib/vpdStageTargetRules.ts`, `environmentStageTargetRules.ts`).
- reminder/recovery lifecycle: while `phase='notified'`, exactly one `kind='reminder'` after `reminder_after_minutes`; exactly one `kind='recovery'` on sustained clear (`clear_minutes`); re-arm behavior on continued breach keeps the R5 per-day math honest.
- storm controls: per-user per-tick collapse (N newly-notifying tent/rule pairs → one summarizing email) and the fleet-offline breaker threshold (`fleet_offline_breaker_pct`) as pure functions over the run's transition set.

### R3.2 Static guard tests (grep-only, CI-cheap)
1. **Entitlement guard (the load-bearing one):** copy `latestMigrationBodyMentioning()` and all four describe blocks from `src/test/pheno-tracker-entitlement-oracle-guard.test.ts:22-31` with `s/has_pheno_tracker_entitlement/has_alert_delivery_entitlement/`. It must scan for the **latest** migration mentioning the function and assert the anti-oracle guard, both-billing-tables union, status + `current_period_end` hardening, `RETURNS boolean` with no provider/paddle ID leakage, REVOKE/GRANT posture, and `SECURITY DEFINER` + `SET search_path TO 'public','pg_temp'` (exact quoting form — the test regex rejects the `= public, pg_temp` variant). **Never pin a hardcoded migration path**: that is precisely how the `ai_credit_spend` regression slipped through (`src/test/ai-credit-effective-entitlement-sql.test.ts:9-11` pinned `20260620231000` while `20260709015647` CREATE-OR-REPLACE'd the function into the single-table, no-status form).
2. **Evaluator safety scan (new):** static scan of the evaluator worker asserting (a) **every `sensor_readings` access carries the predicate `user_id = tents.user_id`** — the cross-user reading-poisoning defense: the only INSERT policy on `sensor_readings` checks `auth.uid() = user_id` and never tent ownership, and the evaluator runs as service_role with RLS bypassed, so without this predicate user A can insert rows against B's `tent_id` to fire, mask, or suppress B's alerts; (b) the external heartbeat ping is present at end-of-run; (c) the fleet-offline circuit breaker branch exists; (d) every evaluated-but-not-enqueued delivery decision writes an `alert_deliveries` row with a `skip_reason` (vocabulary includes `daily_cap` and `fleet_offline_anomaly`); (e) due-tent selection uses the `FOR UPDATE SKIP LOCKED` claim on `alert_eval_watermarks`.
3. **Ingest-contract guard:** extend the existing static scans (`src/test/manual-sensor-alert-smoke-guard.test.ts:358`, `src/test/operator-ggs-real-payload-ingest-safety.test.ts`) to assert the evaluator is a separate worker and that `ecowitt-ingest`, `sensor-ingest-webhook`, and `pi-ingest-readings` still contain their "NEVER triggers alerts" headers (`ecowitt-ingest/index.ts:7-9`) and no alert-table writes.
4. **Producer contract guard (new — nothing pins email behavior today; `email_send_log` appears in `src/` only in generated types):** static scan of the alert-email producer asserting it (a) sets `queued_at` and `message_id`; (b) queries `suppressed_emails` before enqueue; (c) pre-logs a `'pending'` `email_send_log` row before enqueue (the `auth-email-hook/index.ts:245-285` pattern); (d) never inserts a status outside the CHECK vocabulary; (e) claims each send in the `alert_deliveries` ledger under the widened key `(alert_id, channel, kind)` before enqueue; (f) resolves the recipient **only** from `auth.users` with the `email_confirmed_at IS NOT NULL` check and never from prefs/profiles/billing tables; (g) **never interpolates `alerts.title`/`alerts.reason` (or any client-writable text column) into subject or HTML** — emails render only evaluator-computed values (metric, band, observed value, timestamps) plus HTML-escaped, length-clamped tent/grow names, with the reason recomputed server-side from the `_shared` rule copies; (h) subjects are generic and value-free.
5. **Copy + minimization guard:** run the banned-word regex `/\b(healthy|ideal|fix|urgent|auto|execute|control|actuate|relay|emergency|critical)\b/i` (policy at `docs/v0-release-checkpoint.md:351`, enforced today by `src/test/diaryTimelineEvidenceQualityRules.test.ts:71` et al.) against the alert email template and any new grower-facing alert copy; additionally assert the subject template is the generic form ("A tent needs review" + app deep link — the deep link into the login-gated app is the primary payload; cultivation details appear only in the body and minimally even there, no strain names or plant counts anywhere) and that `email_send_log.metadata` writes carry `message_id` + label only, never readings or tent names.
6. **Client-gate scanner:** a new `alertDelivery` capability in `src/lib/entitlements/planCatalog.ts` / `capabilities.ts` is display-only; the recursive scanner pattern in `src/test/live-sensor-server-gate.test.ts:32-70` must be extended so no app code consumes it as an access gate — client UI gates via a server preflight hook (the `useLiveSensorServerGate` / `PremiumLiveSensorGate` pattern).
7. **Prefs-RLS guard (new):** assert against the latest migration touching `alert_delivery_prefs` that the digest/email-enabled fields sit under **plain owner RLS with no RESTRICTIVE entitlement policy on their write path** — Free users must always be able to toggle the digest — and that only the Pro-only realtime fields (`realtime_enabled`, `min_severity`, quiet hours) are behind the RESTRICTIVE `has_alert_delivery_entitlement` policy.
8. **Kill-switch RPC guard (new):** latest-migration scan of the operator setter asserting the in-body `has_role('operator')` check, the mandatory audit-row insert in the same statement, `SECURITY DEFINER` + pinned search_path, and REVOKE/GRANT posture (R2.1).
9. **Name-inventory guard (new):** assert exactly one migration-defined shape per canonical table name (glossary above) so a second migration cannot silently reintroduce a duplicate/conflicting DDL under `CREATE TABLE IF NOT EXISTS`.
10. **Migration-safety scan:** new SECURITY DEFINER functions must pass the existing scanner without adding fingerprints to `config/supabase-migration-safety-baseline.json` (adding entries there is CI-gated — pin `search_path` correctly instead).

### R3.3 DB-backed integration lane (local loopback)
Run against the local Supabase lane with `supabase/seed.sql` grant parity, exactly like the existing runtime security harnesses (static grep pins are the CI-cheap layer; runtime behavior is verified in the loopback lane). Scenarios:
- seed a sustained breach in `sensor_readings` → invoke the evaluator → assert one `alerts` row (correct NOT NULL `grow_id` resolved from tent, explicit `user_id` stamped — `auth.uid()` is NULL for service_role and the column has no service-role default path), one `alert_events` `'created'` row, one `alert_deliveries` row (`kind='initial'`, claimed before send), one `email_send_log` `'pending'` row; run again → zero new rows (ledger claim + hysteresis dedupe).
- **concurrency**: fire two evaluator invocations simultaneously → the `alert_eval_watermarks` claim (`UPDATE ... WHERE tent_id IN (SELECT ... ORDER BY last_evaluated_at ASC NULLS FIRST LIMIT batch_size FOR UPDATE SKIP LOCKED) RETURNING`) partitions the fleet; assert no tent is double-evaluated, no duplicate reminder is enqueued (compare-and-set transitions on `alert_delivery_rule_state` return zero rows for the loser).
- **cross-user poisoning probe**: user A inserts `manual`-source rows with `user_id=A, tent_id=<B's tent>` → evaluator run → zero alerts and zero deliveries for B (the `user_id = tents.user_id` predicate discards them).
- **reminder/recovery lifecycle**: hold the breach past `reminder_after_minutes` → exactly one `kind='reminder'` ledger row; clear for `clear_minutes` → exactly one `kind='recovery'` row.
- **fleet breaker**: seed >`fleet_offline_breaker_pct` of due tents transitioning offline in one run → in-app alert rows written, zero offline deliveries enqueued, run stats record the breaker, recovery notices for breaker-suppressed breaches also suppressed (per the runbook note).
- **digest idempotency**: two digest producer runs on the same UTC day → one enqueue per opted-in user (`digest_send_state` user_id PK, `last_digest_date`, `message_id`); a user with **no `alert_delivery_prefs` row gets no digest** (opt-in contract).
- **daily cap**: exceed `daily_cap_per_user` → further realtime/reminder sends recorded as ledger rows with `skip_reason='daily_cap'`, no enqueue; digest and recovery exempt from the cap.
- anti-oracle probe: authenticated caller invoking `has_alert_delivery_entitlement(<other uuid>)` gets `false`, not an error (the `20260709193855:25-29` guard). Note the SQL fn hard-codes `s.environment='live'` for the Lovable branch, so the harness must seed `billing_subscriptions` (sandbox Lovable rows never satisfy it).
- RLS on new tables: `alert_evaluator_state` service_role-only; `alert_delivery_prefs` digest fields writable by a **free** seeded user (owner RLS), Pro-only fields rejected for the free user and accepted for an entitled one; `alert_deliveries` owner-SELECT only, writes service-only.
- suppression: seed `suppressed_emails` row → evaluator run → no enqueue, `'suppressed'` log row; unsubscribe endpoint idempotency (second click succeeds) and scope (digest unsubscribe leaves breach-notice delivery intact).

### R3.4 E2E smoke addition
Extend the existing authenticated smoke lane (`.github/workflows/quicklog-smoke.yml`, fixture account — remembering it exercises the **deployed** app): after deploy, (a) operator page `/operator/alert-delivery` renders and shows `last_run_at` within freshness bound and a healthy external-heartbeat status, (b) the fixture account's notification-prefs surface on Settings loads. Keep it read-only — no smoke-triggered emails.

### R3.5 Entitlement decision matrix
Reuse `src/test/server-union-entitlement-gate.test.ts` (pure-resolver matrix: BYO Pro / Lovable monthly / annual / lifetime allowed; free denied; canceled-within-period allowed) swapping the asserted capability to `alertDelivery`. The matrix gates **realtime delivery only** — the digest path must pass for every tier including free.

## R4. Phased rollout with per-phase rollback

### Phase 0 — Observability foundation (no user-visible change)
Ship: P1–P7, `alert_evaluator_state`, the out-of-band applies (cron, vault secret, heartbeat monitor, `CREATE INDEX CONCURRENTLY`) verified on the prod `verdant-grow-diary` branch, evaluator deployed but running in **shadow mode** (claims tents, evaluates set-based, writes heartbeat + breadcrumbs + external ping, inserts **nothing** into `alerts` and enqueues nothing), operator page.
**Exit criteria:** **7 consecutive days of external heartbeats received at the hosted monitor** (not read off the operator page — detection must not depend on Supabase or the founder's browser), `sensor_readings` index exists and `pg_index.indisvalid`, DLQ depth visible, backlog depth zero at steady state, zero unexplained Sentry errors.
**Rollback:** none needed — shadow mode is read-only; `cron.unschedule` removes it entirely.

### Phase 1 — Daily digest email (low risk, exercises the full pipeline at ≤1 email/user/day)
Ship: **opt-in** daily environment digest (yesterday's out-of-band time per metric, current open alerts) rendered as a react-email template beside the six auth templates in `supabase/functions/_shared/email-templates/`. Design decisions that make this phase individually shippable:
- **Opt-in contract:** no `alert_delivery_prefs` row = no digest. Free users opt in/out via the plain owner-RLS digest fields (never RESTRICTIVE-gated — R3.2 guard #7); the P3 scoped unsubscribe link is the belt-and-braces email opt-out. Prefs UI lives on the Settings **Notifications** tile (`src/pages/Settings.tsx:433-437`, currently `coming_soon` with copy "Critical alerts only · Email + in-app" — "Critical" collides with the banned-word list and needs recopy). All existing prefs are localStorage-only per-device (`src/lib/startScreenPreferences.ts`) and a server evaluator cannot read localStorage, hence the DB table.
- **Own queue:** digests ride a dedicated pgmq queue **`digest_emails`** with its own TTL (**12–24 h**) and batch/delay knobs, processed after `auth_emails` and `transactional_emails` by a ~30-line extension of the existing per-queue worker loop — never the breach-alert queue (opposite TTL requirements; FIFO head-of-line blocking would delay the freshness-critical channel, R5).
- **Idempotency:** `digest_send_state` (user_id PK, `last_digest_date`, `message_id`) makes sends one-per-user-per-UTC-day even across producer retries after a mid-run crash.
- **Scheduling:** v1 = fixed UTC window sharded into hourly cohorts sized so no cohort exceeds ~30 min of drain at current throughput (no timezone data exists anywhere in the DB; tz-aware `digest_hour` is Phase 3, and tz is **not** required on the v1 prefs write path).
- **Assembly:** computed from an incremental daily rollup appended per evaluator run (the evaluator already touches every due tent), not a retrospective full-day scan of `sensor_readings`.
**Rollback:** flip `enabled=false` or set `paused_until` via the operator RPC (sends stop within one cadence); prefs, `digest_send_state`, and templates are inert without the producer. The `digest_emails` queue drains itself; its TTL DLQs stragglers into P4-visible sinks.

### Phase 2 — Real-time breach alerts + reminders + recovery notices (Pro-gated)
Ship: evaluator on its production cadence inserting `alerts` rows (sharing the client's rule-key dedupe plus the partial unique index on the open rule key — required, since dedupe is client-side only today and two tabs can already double-insert), **wall-clock hysteresis** in `alert_delivery_rule_state` (minutes-denominated knobs from `alert_evaluator_state`; primitives: `evaluate_vpd_drift_ewma` `20260604063855_...sql:118-220` and `src/lib/environmentStabilityRules.ts`), breach email (`kind='initial'`), reminder while still notified (`kind='reminder'` after `reminder_after_minutes`), recovery notice on sustained clear (`kind='recovery'`) — every send claimed through the `alert_deliveries` ledger under `UNIQUE(alert_id, channel, kind)`. Storm controls active from day one: per-user per-tick collapse, fleet-offline circuit breaker (in-app rows still written; offline deliveries suppressed; operator alerted; runbook documents that recovery notices for breaker-window breaches are also suppressed), per-key cooldown via `last_notified_at`, `daily_cap_per_user`, and the `max_deliveries_per_run` global budget (overflow defers to the next tick or folds into the digest — never silent drop). Gate delivery on `has_alert_delivery_entitlement` (verbatim clone of the `has_pheno_tracker_entitlement` union pattern per `20260709193855` — both billing tables, status + `current_period_end`, anti-oracle guard) with the R3.2 guard test **in the same PR as the migration**. Alert **history reads stay ungated** (the RESTRICTIVE-policy house rule: SELECT ungated, writes gated — `20260709192453:51-97`). Severity/escalation model is specified fresh — the existing vocabulary maps environment breaches to `warning` only and reserves `critical` for implausible sensors, so email urgency must not be inherited from `alerts.severity`; and per R3.2 guards #4–#5, email content renders only evaluator-computed values with generic value-free subjects.
**Rollback:** `enabled=false`/`paused_until` stops evaluation + delivery (audited flip); already-inserted `alerts` rows remain valid (users resolve/dismiss normally); break-glass = `REVOKE EXECUTE` on the evaluator RPC per `docs/billing-entitlement-updater-rpc-design.md:477-483`.

### Phase 3 — Push + escalation
Ship: web-push channel, quiet hours + per-user timezone (**new schema — no timezone/quiet-hours column exists anywhere**; `tents.light_schedule` is free text and cannot be used to infer local time; these are Pro fields behind the RESTRICTIVE policy), tz-aware `digest_hour`, escalation ladder (unacknowledged breach after N minutes → second channel, claimed through the ledger like every other send). Requires Phase 2 stable for ≥30 days and Phase 0 telemetry demonstrating false-positive rate is acceptable.
**Rollback:** per-channel toggle in `alert_delivery_prefs`; `enabled`/`paused_until` remains the global stop.

## R5. Cost & scale budget

**SLO.** Every due sensor-connected tent is evaluated within **10 minutes**. This is the number the whole section is sized to, and backlog depth (due tents not claimed this tick, from `last_run_stats`) is the alarm that says we are missing it — a silently growing backlog is exactly the "impression of coverage" failure P1 warns about.

**Email volume (worst case).** The shared transactional ceiling is hard: batch_size 10 per queue per 5-second cron tick with 200 ms inter-send delay ≈ **120 emails/min/queue theoretical (~172k/day)**, single provider key. Structural mitigations, then math:
- **Queue isolation:** digests get their own `digest_emails` queue (12–24 h TTL, own knobs) so a digest cohort can never head-of-line-block a breach email past the short transactional TTL. The shared-429 hazard (`email_send_state.retry_after_until` halts **both** queues — worker exits before touching `auth_emails`, `process-email-queue/index.ts:122-127`) is bounded by keying the cooldown per queue, so alert volume can never block password resets.
- **Digest (Phase 1):** ≤1/user/UTC-day, idempotent via `digest_send_state`, sharded into hourly cohorts sized to ≤~30 min drain each; GA of the free digest gates on measured cohort size vs ceiling.
- **Real-time (Phase 2):** the burst, not the sustained rate, is the risk — a regional heat wave is a correlated same-tick breach and per-key cooldowns don't bound first notifications. Producer-side bounds in order of impact: (1) **per-user per-tick collapse** (`storm_user_collapse`) — one email summarizing all newly-notifying tent/rule pairs turns tents×rules into users (an 8-tent Pro grower gets 1 email, not 16); (2) **`max_deliveries_per_run`** global budget — overflow keeps alert rows and hysteresis state, defers email to the next tick or the digest, never silent-drops; (3) `daily_cap_per_user`, counted **from the `alert_deliveries` ledger keyed on `user_id`** (`status='sent'`, attempted within the current **UTC day** — never from mutable `recipient_email` joins on `email_send_log`). Kinds counting against the cap: `initial` + `reminder`; digest and `recovery` are exempt. Cap-suppressed sends are ledger rows with `skip_reason='daily_cap'`. Worst case with collapse at 1,000 breaching Pro **users** in one tick: 1,000 enqueues draining at 120/min ≈ 8.3 min — inside the transactional TTL; the operator page's burst-drain-time metric tracks this as the opted-in fleet grows.
- Reminders re-fire only per `reminder_after_minutes` while `phase='notified'`, so a continuously breaching tent is bounded per day by the cap — the per-day math stays honest, and every send (initial/reminder/recovery) is a distinct audited ledger row.

**Evaluator query cost.** Data scale: EcoWitt cadence is 60 s, ~4 rows/POST for a 1-air+1-soil tent ≈ **5,760 rows/day ≈ 2.1M rows/year/tent**, and `sensor_readings` has **no retention** and no index leading with `(tent_id, captured_at)` — the dedupe unique index interposes `source, metric` and the ts-indexes lead with `user_id`. Hence the `(tent_id, captured_at DESC)` index applied **out-of-band as `CREATE INDEX CONCURRENTLY`** per P7 (migration carries only the `IF NOT EXISTS` form for small fresh/branch/local DBs).

Per run, the evaluator is **set-based SQL, not per-tent client round-trips**: one transaction claims the due batch from `alert_eval_watermarks` (`FOR UPDATE SKIP LOCKED`, ordered `last_evaluated_at ASC NULLS FIRST`, `LIMIT batch_size`), one LATERAL query returns latest-per-metric snapshots for the whole claimed batch via the new index — **always carrying `user_id = tents.user_id`** (R3.2 guard #2) — one bulk upsert advances hysteresis state, and the entitlement function runs only for tents that reached a notify transition (2 index-backed single-row selects per such user: `billing_subscriptions.user_id` UNIQUE; partial `idx_subscriptions_user_env_active` — no new indexes needed there). Email rendering is deferred to the email worker (the producer enqueues a structured payload), keeping the evaluator loop pure DB work. The claim also makes horizontal scaling mechanical: concurrent cron fires or sharded parallel invocations partition the fleet instead of double-evaluating it.

At 1,000 active tents this is a handful of set-based statements per tick — trivial — but two named limits stand: (a) `batch_size × ticks-per-SLO-window` must cover the due fleet, monitored via backlog depth; (b) the 10k-tent budget (~21B rows/year at current cadence) is **not achievable without the P7 retention/partitioning decision** — revisit both if cadence-heavy gateways (8 air + 8 soil channels routable per gateway) become common.

**Heartbeat cost:** one single-row update plus one outbound HTTP ping per run. **Operator RPC cost:** clamped `LIMIT ≤100` reads on indexed tables (`email_send_log` has `created_at DESC`; add the evaluator's source to the existing `alerts` single-column indexes' filter set; the per-user lookup reads the owner-indexed `alert_deliveries` ledger).
