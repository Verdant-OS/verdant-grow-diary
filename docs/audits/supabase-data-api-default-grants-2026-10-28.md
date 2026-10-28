# Supabase Data API default-grant change: migration audit (2026-10-28)

Audited by Claude at deploy tip `30d6d9643b988ae8168b00bf36a4dee545705309` plus every open PR head on
2026-10-28. Static repository evidence only. No hosted database was queried, changed or migrated.

## The change

`source claim` (Supabase notice to Verdant, 2026-10-20; Supabase docs,
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api)): from 2026-10-30, new
objects in `public` no longer get automatic `SELECT/INSERT/UPDATE/DELETE` (tables), `EXECUTE`
(functions) or `USAGE/SELECT` (sequences) for `anon`, `authenticated` and `service_role`. Existing
objects keep their grants. A missing grant returns PostgREST error `42501`. Fresh schemas (new
projects, preview branches, local resets) are affected too.

`established fact`: `supabase/migrations/20260807133000_global_default_privilege_hardening.sql`
already removed the `PUBLIC` and `anon` defaults for new tables and functions. The 2026-10-30 change
also removes the `authenticated` and `service_role` defaults, which every Verdant client read and
service-role edge write depends on.

## Results

| Scope                                                                                                               | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261027235000_owner_badge_awards.sql` (#2342, #2343, #2362, #2365; branch `canopy/owner-badge-first-diary-entry`) | PASS                              | 3 new tables, each with `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` and then role-specific grants. The client reads only `badge_awards` (`badgeAwardService.ts`, `memberBadgeProfileService.ts`), which is granted to `authenticated`. Writes go through SECURITY DEFINER functions. UUID keys, so no sequences. `seed.sql` and a pgTAP permissions test are updated on the branch. |
| `20261027235500_badge_awards_tent_setup_harvest.sql` (#2343, #2362)                                                 | PASS                              | No new table. New/replaced functions carry explicit `REVOKE` + `GRANT EXECUTE` (`evaluate_owner` → `authenticated`, `reconcile` → `service_role`, internal helper revoked).                                                                                                                                                                                                                             |
| `20261014010000_referral_cap_counts_deleted_referees.sql` (#2067, #2189)                                            | PASS                              | `CREATE OR REPLACE` of an existing function (ACL kept) plus explicit `GRANT EXECUTE ... TO service_role`.                                                                                                                                                                                                                                                                                               |
| `20261015161000_plants_health_drop_healthy_default.sql` (#2140)                                                     | NOT_APPLICABLE                    | No new table, function or sequence.                                                                                                                                                                                                                                                                                                                                                                     |
| 34 RPCs the app calls (`supabase.rpc(...)` in `src/` and `supabase/functions/`)                                     | PASS                              | Each has an explicit `GRANT EXECUTE` in a migration.                                                                                                                                                                                                                                                                                                                                                    |
| 22 deploy-branch tables with no full explicit ACL (`LEGACY_DEFAULT_PRIVILEGE_TABLES`)                               | PASS for production (`inference`) | Core tables created 2026-05-15 to 2026-05-23 (`grows`, `plants`, `tents`, `diary_entries`, `sensor_readings`, ...). They are in daily production use, so they exist on the hosted project and keep their grants. Fresh local replays get them back from `supabase/seed.sql`'s blanket grant.                                                                                                            |
| Hosted preview branches                                                                                             | BLOCKED                           | Preview creation already fails on full-file replay (`ai_credit_grants` 42P07, recorded in `CURRENT_STATE.md`). Seed behaviour on a branch is NOT_MEASURED.                                                                                                                                                                                                                                              |

No migration needs a correction. No grant was added and no RLS policy was touched.

## The gap that was found

`established fact`: `supabase/seed.sql` runs `GRANT ... ON ALL TABLES IN SCHEMA public TO anon,
authenticated, service_role` after a local replay, then re-applies a deny-list. Every local DB lane
therefore sees a fully granted table, whether or not its migration granted anything. A future
migration that forgets its `GRANT` would pass every local and CI DB lane, then return `42501` to the
app once it is applied to the hosted project after 2026-10-30. Before this change no check could see that.

Correction (this PR): `scripts/lib/supabaseTableAclRules.mjs` and
`src/test/supabase-table-explicit-acl.test.ts`. Every persistent `public` table must have, after
its latest `CREATE`, a table-level `GRANT` or a full `REVOKE ALL`. A partial or column-level revoke,
a commented statement, a schema-wide or default-privilege statement, or a function/sequence grant
does not count. The test runs against the real migration tree in the required Vitest suite. The
result must equal the frozen legacy list exactly, so a new table without an ACL fails CI, and the
list can only shrink.

It is a new check, not an edit to `scripts/check-supabase-migration-safety.mjs`. The scorer lock
refuses edits to that existing gate. The unlock was not taken in this session.

## Not verified

- Which deploy-branch migrations are applied to production: NOT_MEASURED. Production migration
  history was not read.
- Whether the hosted project already runs the hardened defaults: NOT_MEASURED.
- Whether the platform change also revokes the built-in `PUBLIC` `EXECUTE` on new functions:
  `uncertainty`. All called RPCs grant explicitly, so the answer changes nothing today.
- Function and sequence grants for future migrations are not enforced by a check yet. The same
  pattern applies when a new client-called RPC or client-inserted serial column appears.
- The 22 legacy tables still depend on default privileges in any fresh schema without `seed.sql`.
  Giving them explicit grants is a separate, additive migration and needs Matthew's decision.
