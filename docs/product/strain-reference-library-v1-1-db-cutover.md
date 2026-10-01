# Strain Reference Library V1.1 — database parity and read-only cutover

Issue: [#419](https://github.com/Verdant-OS/verdant-grow-diary/issues/419). Follows
[#418](https://github.com/Verdant-OS/verdant-grow-diary/pull/418) (bundled V1, merged) and
replaces the closed delivery shell
[#426](https://github.com/Verdant-OS/verdant-grow-diary/pull/426).

**Status: working V1 prototype in pre-release validation.** The V1.1 migration is not
applied to any hosted database by the change that adds it, the release flag is off, and
the public pages still render the bundled sample/reference library. No “database-backed
public reads”, “shipped”, “live”, or “launched” claim is allowed until every gate below
is recorded as `PASS` with its receipt.

## What V1.1 adds

| Piece                         | File                                                                                 | Evidence label                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Pure parity audit             | `src/lib/cultivarDatabaseParityRules.ts`                                             | `established fact` (unit tests)                 |
| Typed, fail-closed read model | `src/lib/cultivarDatabaseReadModel.ts`                                               | `established fact` (unit tests)                 |
| Seed payload builder          | `src/lib/cultivarDatabaseSeedPayloadRules.ts`                                        | `established fact` (drift-guard test)           |
| Additive parity migration     | `supabase/migrations/20261001160000_strain_reference_library_v1_1_parity.sql`        | offline parity `established fact`; replay in CI |
| Read-only service + hook      | `src/lib/cultivarReferenceService.ts`, `src/hooks/usePublishedCultivars.ts`          | `established fact` (unit + page tests)          |
| Explicit source state         | `src/lib/cultivarReferenceSourceRules.ts`                                            | `established fact` (unit + page tests)          |
| Default-off release flag      | `cultivarDatabaseReadsEnabled` in `src/lib/featureFlags.ts`                          | `established fact`                              |
| CLI audit / receipt           | `scripts/audit-cultivar-database-parity.ts` (`bun run audit:cultivar-db-parity`)     | `established fact`                              |
| Runtime RLS + parity harness  | `scripts/run-cultivar-reference-rls-harness.ts` (aggregate `test:security-db-local`) | runs only in the local DB lane                  |

### Why a schema supplement was needed

The parity audit run against the V1 seed shape is `blocked`, not `ready`. The V1 tables
cannot represent the approved public profile without loss:

- the published flower-window wording (for example “65–75 days from sprout reported”,
  “Information limited”) has no column;
- per-terpene rank and aroma descriptors exist only as one dominant-terpene array claim;
- profile-level citations (the four shared literature sources) have no join;
- alias display order is undefined;
- pheno-hunt focus and illustrative sample phenos have no columns;
- the guide sections store generic template copy with empty reported tendencies, a
  different overview text, no autoflower training overlay, and no per-cultivar
  missing-information notes;
- Sour Stomper difficulty (`intermediate` in SQL, Beginner-friendly in the approved
  profile), every intro paragraph, and the OG Kush alias “Original Gangster Kush” differ.

The migration adds the smallest supplement: three `cultivars` columns, one nullable
`cultivar_aliases.sort_order`, and the `cultivar_profile_sources` join (RLS on,
published-only `SELECT` policy, `SELECT`-only grant, no client write policy, no
`SECURITY DEFINER`). Content lands in the existing normalized source, claim, guide,
section, and section-source tables, which stay authoritative. Per-terpene claims use
`trait_key = 'terpene'`. The JSON payload inside the migration is a transport generated
from the bundled library, never a stored blob.

The published V1 migration is untouched; its replay patch in
`config/local-supabase-replay-compatibility.json` still applies.

## Source state on the public pages

`/cultivars` and `/cultivars/:slug` resolve one explicit state (`data-cultivar-source-state`
on the page root):

| State              | When                                                | Content shown    | Visible notice |
| ------------------ | --------------------------------------------------- | ---------------- | -------------- |
| `bundled_fallback` | flag off (default)                                  | bundled library  | none           |
| `loading`          | flag on, read pending (also SSR and first paint)    | bundled library  | yes            |
| `database`         | flag on, every row mapped                           | database catalog | yes            |
| `error`            | flag on, read failed                                | bundled library  | yes            |
| `bundled_fallback` | flag on, any row refused or zero published profiles | bundled library  | yes            |

The fallback is all-or-nothing, so a partially valid catalog never mixes sources. The
sample-reference banner renders in every state, and no transport upgrades the evidence
state. Draft, archived, `community`, and `ai_draft` rows never render.

## Gates and deployment receipt

Run each step in order. Record the command output as the receipt. Do not skip ahead.

1. **Code review and focused gates.** Typecheck, targeted tests, the migration safety
   scanner, and the offline strict audit:
   `bun run audit:cultivar-db-parity -- --strict` → `READY`.
2. **Local replay (CI).** The `security-db-local` lane replays every migration and runs
   `test:cultivar-reference-db-security`. That checks strict parity as anon and as an
   authenticated user, re-applies the migration to prove idempotency, confirms that
   drafts, archived rows, draft guide versions, and import staging stay hidden, and
   confirms that client writes are rejected.
3. **Sandbox/preview apply.** Apply the migration to a sandbox or preview database
   through the operator's reviewed apply path. Never hot-edit tables.
4. **Preview receipt (read-only, anon key only):**

   ```bash
   SUPABASE_URL=<preview url> SUPABASE_ANON_KEY=<preview publishable key> \
     bun run audit:cultivar-db-parity -- --source=supabase --strict
   ```

   The receipt must show `READY`, 10 profiles, 16 aliases, 30 terpene claims, 9
   cannabinoid claims, 50 profile sources, 140 sections, and 14 sources. The script
   refuses to run with the service-role key.

5. **Operator verification queries** (read-only, run as the operator):

   ```sql
   select count(*) from public.cultivars where publication_status = 'published';          -- 10
   select c.slug, count(s.*) from public.cultivars c
     join public.cultivar_guides g on g.cultivar_id = c.id and g.publication_status = 'published'
     join public.cultivar_guide_sections s on s.guide_id = g.id
     group by c.slug having count(s.*) <> 14;                                             -- 0 rows
   select count(*) from public.cultivars where publication_status <> 'published';         -- drafts, never public
   select relname, relrowsecurity from pg_class
     where relname = 'cultivar_profile_sources';                                           -- t
   select grantee, privilege_type from information_schema.role_table_grants
     where table_name = 'cultivar_profile_sources' and grantee in ('anon', 'authenticated'); -- SELECT only
   ```

6. **Enable the flag in a preview build** and smoke `/cultivars`, several slugs (including
   `sour-stomper` and `oreoz`), alias search (`gorilla glue #4`, `dosi`), an unknown slug,
   the forced error state, and the page SEO.
7. **Production apply** under a reviewed deployment plan, then re-run step 4 against
   production.
8. **Enable production reads** (`cultivarDatabaseReadsEnabled = true`) only after the
   production receipt is green. Then re-read `version.json` and record the deploy.

Current gate state: step 1 is in review. Steps 2–8 are `NOT_MEASURED`.

## Rollback

- **Primary:** set `cultivarDatabaseReadsEnabled` back to `false`. The pages return to the
  visibly labelled bundled library with no database request.
- If needed, revert the application cutover commit.
- Do not delete migrated evidence rows as a first rollback action, and never weaken RLS
  to restore the page.
- Schema rollback is a separate, reviewed, additive migration, only if necessary.

## Out of scope (unchanged fences)

- `plants.strain` stays free text. No `plants.cultivar_id`, and no auto-linking.
- No AI Doctor, alert, Action Queue, sensor, automation, or device-control change.
- No runtime Hugging Face, Cannlytics, genetics-database, or COA-parser dependency.
- The command-palette cultivar union, the sitemap/prerender source, and the cultivar Q&A
  grounding stay on the bundled library until the database read model is proven in
  production.
