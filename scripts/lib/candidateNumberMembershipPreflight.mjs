/**
 * Preflight for the candidate-number membership constraint
 * (plants_candidate_number_requires_hunt_chk, migration 20260806230021).
 *
 * Single source of truth for the orphan-row detection query and the exact
 * remediation command, shared by the standalone preflight CLI
 * (scripts/preflight-candidate-number-membership.mjs) and the apply script
 * (scripts/apply-candidate-number-maintenance-migrations.mjs), so the two
 * never drift apart.
 *
 * A "candidate-number orphan" is a public.plants row with a non-null
 * candidate_number and a null pheno_hunt_id — the exact condition
 * 20260806230021's own pre-check (and this preflight) rejects, because it
 * would fail the plants_candidate_number_requires_hunt_chk CHECK constraint
 * once validated.
 */

/** Read-only: counts orphan rows and reports whether the constraint already exists. */
export const PREFLIGHT_SQL = `
select jsonb_build_object(
  'orphan_count', (
    select count(*)
    from public.plants
    where candidate_number is not null
      and pheno_hunt_id is null
  ),
  'constraint_present', exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'plants_candidate_number_requires_hunt_chk'
      and conrelid = 'public.plants'::regclass
  ),
  'constraint_validated', coalesce((
    select convalidated from pg_catalog.pg_constraint
    where conname = 'plants_candidate_number_requires_hunt_chk'
      and conrelid = 'public.plants'::regclass
  ), false)
)::text;
`;

/**
 * The exact remediation command a caller must run before the constraint can
 * be added or validated. Clearing an explicit candidate_number is
 * caller-initiated under the plants_candidate_number_guard trigger
 * (20260806230020), so it requires service_role — matches the migration's
 * own error message verbatim (reviewed and proven executable in PR #768).
 */
export const ORPHAN_CLEANUP_COMMAND =
  "BEGIN; SET LOCAL role = 'service_role'; " +
  "UPDATE public.plants SET candidate_number = NULL " +
  "WHERE candidate_number IS NOT NULL AND pheno_hunt_id IS NULL; COMMIT;";

export const PREFLIGHT_OUTCOME = Object.freeze({
  CLEAN_NOT_APPLIED: "clean_not_applied",
  CLEAN_ALREADY_APPLIED: "clean_already_applied",
  ORPHANS_BLOCK_APPLY: "orphans_block_apply",
  MALFORMED_RESULT: "malformed_result",
});

/**
 * Interpret one row of PREFLIGHT_SQL's output.
 * @param {{orphan_count: number, constraint_present: boolean, constraint_validated: boolean}} row
 */
export function classifyPreflightResult(row) {
  if (
    !row ||
    typeof row.orphan_count !== "number" ||
    !Number.isInteger(row.orphan_count) ||
    row.orphan_count < 0 ||
    typeof row.constraint_present !== "boolean" ||
    typeof row.constraint_validated !== "boolean"
  ) {
    return Object.freeze({
      outcome: PREFLIGHT_OUTCOME.MALFORMED_RESULT,
      orphanCount: null,
      constraintPresent: null,
      constraintValidated: null,
      blocksApply: true,
      cleanupCommand: null,
    });
  }

  const orphanCount = row.orphan_count;
  const constraintPresent = row.constraint_present;
  const constraintValidated = row.constraint_validated;

  if (orphanCount > 0) {
    return Object.freeze({
      outcome: PREFLIGHT_OUTCOME.ORPHANS_BLOCK_APPLY,
      orphanCount,
      constraintPresent,
      constraintValidated,
      blocksApply: true,
      cleanupCommand: ORPHAN_CLEANUP_COMMAND,
    });
  }

  if (constraintPresent && constraintValidated) {
    return Object.freeze({
      outcome: PREFLIGHT_OUTCOME.CLEAN_ALREADY_APPLIED,
      orphanCount,
      constraintPresent,
      constraintValidated,
      blocksApply: false,
      cleanupCommand: null,
    });
  }

  return Object.freeze({
    outcome: PREFLIGHT_OUTCOME.CLEAN_NOT_APPLIED,
    orphanCount,
    constraintPresent,
    constraintValidated,
    blocksApply: false,
    cleanupCommand: null,
  });
}

/**
 * Parse the single-row -tAq psql output of PREFLIGHT_SQL (one JSON string).
 * Throws on anything that is not exactly one well-formed JSON object line.
 */
export function parsePreflightStdout(stdout) {
  const lines = String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`preflight_row_count:${lines.length}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch {
    throw new Error("preflight_json_parse_failed");
  }
  return parsed;
}
