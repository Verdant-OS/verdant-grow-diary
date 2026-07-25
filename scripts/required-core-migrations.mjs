/**
 * Single source of truth for the CORE database schema the product loop
 * cannot run without.
 *
 * Consumed by:
 *   - scripts/assert-required-core-migrations.mjs         (migration file presence)
 *   - scripts/assert-required-core-migrations-applied.mjs (live schema check)
 *   - src/test/required-core-migrations.test.ts           (manifest contract)
 *
 * Sibling of scripts/required-money-migrations.mjs. That manifest guards
 * credit / referral / entitlement schema. This one guards the columns core
 * plant, grow, tent, and Quick Log flows write on every request.
 *
 * ---------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------
 * `plants.plant_type` was added in-repo on 2026-07-22 and not applied to
 * production. `CreatePlantDialog` puts `plant_type` in every insert payload,
 * so every plant creation failed with PGRST204 "Could not find the
 * 'plant_type' column of 'plants' in the schema cache". The dialog returns
 * early on error, so growers saw "Create plant does nothing" — a P0 that sat
 * live for days because nothing in CI compared the schema the app requires
 * against the schema production actually had.
 *
 * ---------------------------------------------------------------------
 * WHY THIS CHECKS COLUMNS, NOT MIGRATION VERSIONS
 * ---------------------------------------------------------------------
 * The obvious implementation — assert each required migration's 14-digit
 * version appears in `supabase_migrations.schema_migrations` — was built,
 * verified against a live Postgres, and then deliberately rejected. It has
 * two false-positive modes that would make this gate cry wolf against a
 * perfectly correct database:
 *
 *   1. DUPLICATE MIGRATIONS. `20260724063104_afeabe50-…sql` (Lovable, pushed
 *      2026-07-24) re-applies the exact same `plant_type` column as
 *      `20260722010000`. A database that got the column from either file is
 *      correct, but a version check pinned to one filename fails the other.
 *   2. UNTRACKED SCHEMA. `schema_migrations` only records migrations applied
 *      through the Supabase CLI. Schema created during initial bootstrap or
 *      through the Lovable UI — which manages this project — exists with no
 *      tracker row at all.
 *
 * Both vanish when the gate asserts the thing that actually matters: does
 * the column exist? That is also the precise condition the app fails on, so
 * a green gate means "the app will work" rather than "a particular file was
 * recorded". The migration filename is retained per entry purely so a
 * failure can tell an operator what to apply.
 *
 * ---------------------------------------------------------------------
 * INCLUSION CRITERIA — the bar is deliberately high
 * ---------------------------------------------------------------------
 * Add an entry ONLY when BOTH hold:
 *
 *   1. App code depends on it UNCONDITIONALLY in a core flow — a column
 *      always present in an `.insert()`/`.update()` payload, or one a core
 *      page always selects. Not behind a feature flag, entitlement / Pro
 *      gate, admin route, or optional surface.
 *   2. Its absence produces a HARD error (PGRST204 / 42703), not a degraded
 *      but functioning view. Code that tolerates absence via optional
 *      chaining, `?? null`, or row-filtering does not qualify.
 *
 * A false positive blocks every deploy for a non-reason and trains people to
 * ignore the gate — strictly worse than no gate. When unsure, leave it out.
 *
 * Never delete an entry without a documented rollback note — removing one
 * silently reopens the hole it was guarding.
 */

/**
 * Required schema objects, in deploy order.
 *
 * `migration` is the file that introduces the column, surfaced in failure
 * output as remediation guidance. It is NOT what the check asserts against —
 * see the header. Where more than one migration can supply a column, name
 * the canonical one.
 */
export const REQUIRED_CORE_SCHEMA = [
  {
    table: "tents",
    column: "grow_id",
    migration: "20260520154245_5ceda703-6134-459a-87a6-6285cd859ca0.sql",
    reason:
      "growRepo.fetchTents filters .eq('grow_id', growId) and throws on error, so the " +
      "grow-scoped Tents page renders its 'Tents unavailable' alert instead of the list. " +
      "starterSetupSupabaseAdapter also puts grow_id in the unconditional starter-tent " +
      "insert, so onboarding — the default post-sign-in landing — cannot create a tent.",
  },
  {
    table: "plants",
    column: "grow_id",
    migration: "20260520154245_5ceda703-6134-459a-87a6-6285cd859ca0.sql",
    reason:
      "buildGrowScopedPlantsOrFilter emits a literal 'grow_id.eq.<uuid>' PostgREST filter, " +
      "so the grow-scoped Plants page hard-fails. Same migration as tents.grow_id.",
  },
  {
    table: "feeding_events",
    column: "products",
    migration: "20260612212323_568c55c7-3cd0-46f6-aef7-301e61e61362.sql",
    reason:
      "Typed feeding writes send the products JSONB on every structured Feed save from " +
      "Quick Log. Without it the typed feeding write path fails outright.",
  },
  {
    table: "feeding_events",
    column: "line_id",
    migration: "20260612212323_568c55c7-3cd0-46f6-aef7-301e61e61362.sql",
    reason:
      "quicklog_save_event's feeding_events INSERT names line_id unconditionally " +
      "(COALESCE(v_feed->>'line_id','default')), and writeFeedingTypedEvent rejects with " +
      "'line_id:missing' without one. Same migration as products — but a target that got " +
      "products via a partial/manual apply and not line_id would pass a products-only " +
      "check while every structured feed save still fails, so both columns are checked.",
  },
  {
    table: "plants",
    column: "candidate_number",
    migration: "20260712010343_pheno_candidate_number_foundation.sql",
    reason:
      "phenoHuntCandidatesService selects and orders by it, so the Pheno Hunt workspace " +
      "fails with 'Could not load hunt candidates', and phenoCandidateNumberService's " +
      "UPDATE fails. Confirmed missing in prod 2026-07-23.",
  },
  {
    table: "plants",
    column: "plant_type",
    migration: "20260722010000_plant_type_column.sql",
    reason:
      "CreatePlantDialog and EditPlantDialog write it in EVERY insert/update payload " +
      "(validatePlantInsertPayload injects it unconditionally and the schema is .strict()), " +
      "and growRepo.fetchPlant THROWS when the response row lacks it, breaking PlantDetail. " +
      "Presents to growers as a Create-plant button that does nothing. This is the incident " +
      "this gate was built for. Confirmed missing in prod 2026-07-23; note that " +
      "20260724063104_afeabe50-…sql supplies the same column and satisfies this entry too.",
  },
];

/**
 * Migration files that must exist on disk. Derived from the schema manifest
 * so the two can never drift: every entry names the migration that supplies
 * it, and that file is asserted present by
 * scripts/assert-required-core-migrations.mjs.
 */
export const REQUIRED_CORE_MIGRATIONS = [
  ...new Set(REQUIRED_CORE_SCHEMA.map((e) => e.migration)),
];

/** Postgres identifier shape. Anything else is a manifest bug, not DB drift. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Canonical "table.column" key. Used both to build the lookup query and to
 * compare its rows, so the two can never disagree about formatting.
 *
 * Throws on a malformed identifier rather than interpolating it into SQL:
 * the applied-check maps that to a distinct, blocking exit code, so a typo
 * can never degrade into a silently-skipped entry or a broken query.
 */
export function schemaKey(entry) {
  const table = entry?.table;
  const column = entry?.column;
  if (typeof table !== "string" || !IDENTIFIER.test(table)) {
    throw new Error(`Malformed table identifier: ${JSON.stringify(table)}`);
  }
  if (typeof column !== "string" || !IDENTIFIER.test(column)) {
    throw new Error(`Malformed column identifier: ${JSON.stringify(column)}`);
  }
  return `${table}.${column}`;
}

/**
 * Supabase's migration tracker stores the leading 14-digit timestamp of a
 * filename as `version`. Retained for validating manifest filenames.
 */
export function coreMigrationVersion(filename) {
  const match = /^(\d{14})_/.exec(filename);
  if (!match) throw new Error(`Malformed migration filename: ${filename}`);
  return match[1];
}
