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
| 51 distinct RPCs the app calls (non-test `src/` 33, `supabase/functions/` 19, `has_role` in both)                   | PASS                              | Literal `\.rpc\(\s*['"]([^'"]+)['"]` (`rg -U`) finds 44; plus `record_own_agreement_acceptances`, `breeding_log_save_event`, `pheno_candidate_diary_entries_top_n`, `quicklog_retract_entry`, `quicklog_correct_entry`, `allocate_founder_lifetime_with_audit`, `apply_paddle_subscription_update_with_audit`. Each of 51 has `GRANT EXECUTE ON FUNCTION`. Five helpers have no grant (intended deny).  |
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
`src/test/supabase-table-explicit-acl.test.ts` scan migration text for an explicit
table-level ACL decision after each persistent public table's latest creation. A
qualifying grant must name at least one Data API role; the check cannot prove which
roles need which privileges, or that RLS is correct. A full table-level `REVOKE ALL`
for an affected role remains an explicit denial. Column-only privileges do not count.

The scanner recognizes ordinary, unlogged and foreign tables, CTAS, and `SELECT INTO`;
it preserves quoted identifiers, distinguishes ASCII case folding, and models
transaction savepoints and temporary tables that expire at commit. Executable
literal statements in `DO` blocks are scanned; descriptive strings do not count.
Runtime-built `EXECUTE` statements and escaped `DO` bodies are conservatively
reported as unreadable, even when they happen to be harmless. SQL-standard
BEGIN ATOMIC routine bodies are also rejected rather than treating deferred
statements as executed ACLs. Opaque unreadable-SQL diagnostics are separate
from table state and cannot be satisfied by a table whose name matches a
diagnostic. Comments after executable literals are treated as whitespace.

Schema-qualified object state survives moves out of public and back, including
ACLs, renames, drops/recreates and savepoint rollback. Schema deletion and schema
renaming fail closed as unsupported lifecycle operations, so retained state cannot
revive grants from a deleted object. Column privilege lists are split outside
quoted identifiers and balanced parentheses; even column-only ALL PRIVILEGES does
not qualify. Nested literal EXECUTE spans are propagated through decoded DO bodies.
Quoted aliases cannot trigger CTE/DML suppression. Repeated transaction starts
preserve the original rollback snapshot and savepoints. ACL keywords must have
SQL identifier boundaries, including dollar signs and non-ASCII characters.
Identifier identity follows the target PostgreSQL default 63-byte limit, clipping
whole UTF-8 characters after decoding and case folding. Runtime EXECUTE variables
named function/procedure have no trigger-syntax exemption; actual trigger clauses
remain outside executable-command statement contexts.
Temporary views/sequences, ambiguous unqualified views created while temp tables
are active, foreign-schema imports and partition ancestry changes are rejected as
unsupported. These fences prevent shadows or stale ACL reuse without adding view
or sequence ACL enforcement. SELECT INTO targets require a complete identifier;
unsupported Unicode-escaped identifiers fail closed rather than crediting a prefix.
Quoted names can directly follow SQL keywords, or precede later keywords, without
whitespace. Keyword tests respect dollar signs and non-ASCII identifier characters.
Unsupported Unicode-escaped ALTER/DROP identifiers fail closed to prevent stale ACLs.

Twenty-five historical dynamic statements were inspected in six immutable migration
files. They handle policies or existing object ACLs rather than creating tables.
Those exact occurrences are pinned by filename, normalized SHA-256 and statement
offset; changing or renaming the file invalidates the pin. The independent 22-table
legacy list is unchanged. No new migration inherits a historical pin.

Static analysis has limits: an unqualified name is assumed to resolve in public,
so names must be schema-qualified when search_path changes. Conditional control
flow in a `DO` block is not evaluated; an unreachable GRANT may still count.
A static ACL decision is not proof of production application, access, or RLS.
The complete current migration tree must equal the unchanged 22-entry legacy
list; existing migrations remain immutable.

It is a new check, not an edit to `scripts/check-supabase-migration-safety.mjs`. The scorer lock
refuses edits to that existing gate, and that unlock was not taken. The review fixes to this PR's
own two files were made under unlocks Matthew approved on 2026-10-28 and 2026-10-29 (rounds 1 to 6).

## Not verified

- Which deploy-branch migrations are applied to production: NOT_MEASURED. Production migration
  history was not read.
- Whether the hosted project already runs the hardened defaults: NOT_MEASURED.
- Whether the platform change also revokes the built-in `PUBLIC` `EXECUTE` on new functions:
  `uncertainty`. All called RPCs grant explicitly, so the answer changes nothing today.
- Function, sequence, view and materialized-view grants for future migrations are
  not enforced by this table contract. A new client-called RPC, serial column or
  client-read view may need its own explicit grant.
- The six historical dynamic-SQL pins need independent security review. Their
  exact source, role and offsets must be verified, including function-name quoting.
- Native Vitest, runtime database evidence and final-head CI are NOT_MEASURED for
  the candidate patch.

- The 22 legacy tables still depend on default privileges in any fresh schema without `seed.sql`.
  Giving them explicit grants is a separate, additive migration and needs Matthew's decision.
