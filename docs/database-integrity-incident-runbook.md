# Database Integrity Incident Runbook

Use this runbook when Verdant's primary ownership tables (`grows`, `tents`,
`plants`) appear empty under privileged visibility, or when Postgres logs show
repeated foreign-key failures attempting to "repair" missing rows.

## Golden rule

**Do not patch FK failures by inserting fabricated `grows` or `tents` rows.**

An empty `public.grows` / `public.tents` in an active Verdant environment is
treated as **possible data loss**, not a normal FK repair situation.
Fabricating placeholder/archived rows to satisfy `tents_grow_id_fkey` (or any
similar constraint) destroys forensic evidence and makes real recovery harder.

## Immediate containment (in order)

1. **Stop the repeating repair job first.** If you see a recurring failing
   statement in Postgres logs (for example a comment like
   `Restore deleted tent as archived placeholder ...`), find and stop the
   runner — cron, scheduled task, local script, operator console, external
   automation, or another tool calling Supabase. Verdant's repo does **not**
   ship such a repair; if it is running, the source is external/manual.
2. **Preserve logs.** Capture Postgres logs, Edge Function logs, and the
   failing SQL text (including any `-- comment` lines) for the incident
   record before they roll off.
3. **Confirm the environment.** Verify whether the affected database is
   production, staging, or local dev. Never run recovery steps against the
   wrong project ref.
4. **Do not run any repair script that inserts into `grows`, `tents`,
   `plants`, `action_queue`, or related tables.** No "one-shot" placeholders.

## Investigation

1. Check dependent tables that reference `grow_id` / `tent_id`:
   `tents`, `plants`, `grow_targets`, `action_queue`, `action_queue_events`,
   `alerts`, `alert_events`, `ai_doctor_sessions`, `diary_entries`,
   `grow_events`, `sensor_readings`, `bridge_tokens`,
   `pi_ingest_idempotency_keys`, `sensor_ingest_audit_log`.
   Count rows and inspect distinct `grow_id` / `tent_id` values to estimate
   blast radius. Use the read-only `scripts/run-orphan-tent-audit.ts`
   harness — it is `SELECT`-only.
2. Compare row counts against recent backups / PITR snapshots to determine
   when the rows disappeared.
3. Identify the actor: check `auth` logs, recent migrations, recent edge
   function deploys, and any operator/admin sessions around the time of loss.

## Recovery

- If the data was really deleted, restore from **Supabase backup / PITR**
  for the affected tables only, after confirming the environment and
  coordinating downtime if required.
- Only restore **known real historical data**. Never fabricate placeholder
  `grows` or `tents` rows to make FK errors go away.
- After restore, re-run the read-only orphan audit to confirm referential
  integrity.

## Forbidden actions

- Inserting placeholder/archived `grows` or `tents` rows to satisfy FK
  errors.
- Hardcoding production UUIDs into repair scripts committed to the repo.
- Adding service_role usage to client code or unattended scripts to bypass
  RLS during "repair".
- Adding device-control or automation while triaging data loss.

## Static guardrails

The static safety scan in
`src/test/database-integrity-incident-guardrails.test.ts` will fail the build
if any of the following appear in repo code:

- The exact `Restore deleted tent` repair comment.
- Hardcoded production grow/tent UUIDs known to have triggered FK repair
  loops (see the test for the current list).
- Raw `INSERT INTO public.tents (...)` statements that combine
  `is_archived`/placeholder language with a hardcoded UUID.
- Client payloads that fabricate `grow_id` / `tent_id` values to satisfy FK
  errors.

Do not weaken or bypass these guards. If a new legitimate repair pattern is
needed, design it as a backup-restore procedure documented here, not as an
INSERT script.
