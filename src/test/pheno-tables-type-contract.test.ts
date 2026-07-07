/**
 * pheno-tables-type-contract — compile-time contract for the hand-maintained
 * pheno table boundary (src/integrations/supabase/phenoTables.ts).
 *
 * Enforced by `tsc` (typecheck runs over test files in the pre-commit hook and
 * the Quick Log gate). Locks two regressions:
 *
 *  1. Insert types must ENFORCE required columns. (Codex P2 on #156: rows
 *     extending Record<string, unknown> gained a string index signature, so
 *     `keyof Row` widened to `string` and Insert accepted payloads missing
 *     user_id/hunt_id or with misspelled columns. Rows are now closed type
 *     aliases; these assertions fail compilation if that ever regresses.)
 *  2. APPEND-ONLY tables (pheno_keeper_decisions_log, pheno_sex_observations)
 *     must keep Update = never, matching their SELECT+INSERT-only grants.
 *
 * `import type` only — nothing here touches the runtime client.
 */
import { describe, it, expect } from "vitest";
import type { PhenoDatabase } from "@/integrations/supabase/phenoTables";

type Tables = PhenoDatabase["public"]["Tables"];
type Insert<T extends keyof Tables> = Tables[T]["Insert"];
type Update<T extends keyof Tables> = Tables[T]["Update"];

/** Compile-time equality helper: `true` only when [A] and [B] are identical. */
type IsNever<T> = [T] extends [never] ? true : false;

// ---------------------------------------------------------------------------
// 1. Required insert columns are enforced (no index-signature erosion).
// ---------------------------------------------------------------------------

// A valid insert with exactly the required columns compiles.
const validScoreInsert: Insert<"pheno_candidate_scores"> = {
  user_id: "u1",
  hunt_id: "h1",
  plant_id: "p1",
};

// @ts-expect-error — missing required user_id must not compile.
const missingUserId: Insert<"pheno_candidate_scores"> = {
  hunt_id: "h1",
  plant_id: "p1",
};

// @ts-expect-error — missing required hunt_id must not compile.
const missingHuntId: Insert<"pheno_candidate_scores"> = {
  user_id: "u1",
  plant_id: "p1",
};

// Misspelled / unknown columns must not exist on the Insert type. Expressed
// as FORMAT-PROOF type-level assertions (no @ts-expect-error, whose coverage
// depends on which line the excess-property error lands on after prettier
// reflows literals):
//
// (a) The direct index-signature tripwire — the exact Codex P2 regression:
//     if a row ever regains a string index signature, `string extends
//     keyof Row` becomes true and this constant stops compiling.
type ScoreRowKeysAreClosed = string extends keyof Tables["pheno_candidate_scores"]["Row"]
  ? false
  : true;
const scoreRowKeysAreClosed: ScoreRowKeysAreClosed = true;

// (b) A typo key is not a member of the (closed) Insert key union.
type TypoIsNotAColumn = "plantt_id" extends keyof Insert<"pheno_candidate_scores"> ? false : true;
const typoIsNotAColumn: TypoIsNotAColumn = true;

// The log's required reason is enforced too.
// @ts-expect-error — missing required reason must not compile.
const missingReason: Insert<"pheno_keeper_decisions_log"> = {
  user_id: "u1",
  hunt_id: "h1",
  plant_id: "p1",
  decision: "keep",
};

// ---------------------------------------------------------------------------
// 2. Append-only tables reject .update() at compile time (Update = never).
// ---------------------------------------------------------------------------

const decisionsLogIsAppendOnly: IsNever<Update<"pheno_keeper_decisions_log">> = true;
const sexObservationsIsAppendOnly: IsNever<Update<"pheno_sex_observations">> = true;

// Mutable tables keep a usable Update type.
const scoresAreUpdatable: IsNever<Update<"pheno_candidate_scores">> = false;
const scoreUpdate: Update<"pheno_candidate_scores"> = { note: "revised" };

describe("pheno table boundary — compile-time contract", () => {
  it("holds (the real assertions are enforced by tsc above)", () => {
    // Reference the type-level fixtures so no-unused-vars stays quiet and the
    // file has a runtime body for vitest.
    expect(validScoreInsert.user_id).toBe("u1");
    expect(scoreUpdate.note).toBe("revised");
    expect(decisionsLogIsAppendOnly).toBe(true);
    expect(sexObservationsIsAppendOnly).toBe(true);
    expect(scoresAreUpdatable).toBe(false);
    expect(scoreRowKeysAreClosed).toBe(true);
    expect(typoIsNotAColumn).toBe(true);
    // The @ts-expect-error fixtures exist only to fail compilation if the
    // boundary regresses; touch them so they are "used".
    void missingUserId;
    void missingHuntId;
    void missingReason;
  });
});
