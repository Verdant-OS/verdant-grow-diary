/**
 * phenoTables — hand-maintained typed boundary for the pheno-hunt tables.
 *
 * WHY THIS FILE EXISTS: `src/integrations/supabase/types.ts` is AUTO-GENERATED
 * by Lovable from the live project's schema and is regenerated on Lovable
 * commits. That regeneration can lag the repo's migrations — it currently
 * omits every pheno table added by the 2026-07-06 `supabase/migrations/
 * *_pheno_*.sql` foundations (only `pheno_hunts` survives), which broke
 * typecheck across all pheno services. Hand-editing the generated file gets
 * silently reverted on the next regeneration, so the pheno services access
 * their tables through THIS hand-maintained schema instead.
 *
 * THE ONE SANCTIONED CAST: `phenoDb` below re-types the shared client against
 * the pinned `PhenoDatabase` schema. It erases only the generated `Database`
 * generic — auth, fetch behavior, and the runtime client instance are
 * untouched (it is the same object). Every Row/Insert/Update shape is pinned
 * explicitly here and MUST be kept in sync with the corresponding migration
 * in supabase/migrations/. No `any`, no ts-ignore anywhere downstream: the
 * services stay fully typed against these shapes.
 *
 * Scope: types only. No schema change, no RLS change, no behavior change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Json } from "./types";

/** Columns the database fills via DEFAULT / nullable — optional on Insert. */
type WithDefaults<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> &
  Partial<Pick<Row, Defaulted>>;

/**
 * Table shape for the typed boundary. `Update` defaults to Partial<Row>;
 * APPEND-ONLY tables (no UPDATE/DELETE grant or policy in their migration)
 * pass `never` so `.update(...)` is rejected at compile time, matching the
 * DB contract.
 */
interface Tbl<
  Row extends Record<string, unknown>,
  Defaulted extends keyof Row,
  Update = Partial<Row>,
> {
  Row: Row;
  Insert: WithDefaults<Row, Defaulted>;
  Update: Update;
  Relationships: [];
}

// ---------------------------------------------------------------------------
// Row shapes — one per migration. Keep in lockstep with supabase/migrations/.
// ---------------------------------------------------------------------------

type PhenoCandidateScoreRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  traits: Json;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoKeeperDecisionRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  decision: string;
  note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoKeeperDecisionLogRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  decision: string;
  reason: string;
  note: string | null;
  decided_at: string;
  created_at: string;
};

type PhenoScoreRoundRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  round: string;
  traits: Json;
  loud_traits: Json;
  aroma_descriptors: Json;
  nose_note: string | null;
  note: string | null;
  observed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoSexObservationRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  sex: string;
  herm_observed: boolean;
  note: string | null;
  observed_at: string;
  created_at: string;
};

type PhenoSmokeTestRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  flavor_descriptors: Json;
  effect_descriptors: Json;
  smoothness: number | null;
  potency_impression: number | null;
  verdict: string | null;
  note: string | null;
  tested_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoLabResultRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  thc_pct: number | null;
  cbd_pct: number | null;
  total_cannabinoids_pct: number | null;
  dominant_terpenes: Json;
  source: string;
  note: string | null;
  tested_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoKeeperRow = {
  id: string;
  user_id: string;
  hunt_id: string;
  source_plant_id: string;
  keeper_name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoKeeperCloneRow = {
  id: string;
  user_id: string;
  keeper_id: string;
  parent_clone_id: string | null;
  clone_plant_id: string | null;
  clone_label: string;
  note: string | null;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoCrossRow = {
  id: string;
  user_id: string;
  hunt_id: string | null;
  female_keeper_id: string;
  // B2: nullable — a selfing_s1 cross has a single parent (the reversed mother
  // pollinates itself), so there is no distinct male parent.
  male_keeper_id: string | null;
  // B2: standard_f1 | feminized_cross | selfing_s1. Existing rows default to
  // standard_f1 in the migration.
  cross_type: string;
  cross_name: string | null;
  note: string | null;
  crossed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PhenoReversalRow = {
  id: string;
  user_id: string;
  keeper_id: string;
  method: string;
  note: string | null;
  applied_at: string | null;
  created_at: string;
};

export interface PhenoDatabase {
  public: {
    Tables: {
      pheno_candidate_scores: Tbl<
        PhenoCandidateScoreRow,
        "id" | "traits" | "note" | "created_at" | "updated_at"
      >;
      pheno_keeper_decisions: Tbl<
        PhenoKeeperDecisionRow,
        "id" | "decision" | "note" | "decided_at" | "created_at" | "updated_at"
      >;
      // APPEND-ONLY (SELECT+INSERT grant only): Update = never.
      pheno_keeper_decisions_log: Tbl<
        PhenoKeeperDecisionLogRow,
        "id" | "note" | "decided_at" | "created_at",
        never
      >;
      pheno_score_rounds: Tbl<
        PhenoScoreRoundRow,
        | "id"
        | "traits"
        | "loud_traits"
        | "aroma_descriptors"
        | "nose_note"
        | "note"
        | "observed_at"
        | "created_at"
        | "updated_at"
      >;
      // APPEND-ONLY (SELECT+INSERT grant only): Update = never.
      pheno_sex_observations: Tbl<
        PhenoSexObservationRow,
        "id" | "sex" | "herm_observed" | "note" | "observed_at" | "created_at",
        never
      >;
      pheno_smoke_tests: Tbl<
        PhenoSmokeTestRow,
        | "id"
        | "flavor_descriptors"
        | "effect_descriptors"
        | "smoothness"
        | "potency_impression"
        | "verdict"
        | "note"
        | "tested_at"
        | "created_at"
        | "updated_at"
      >;
      pheno_lab_results: Tbl<
        PhenoLabResultRow,
        | "id"
        | "thc_pct"
        | "cbd_pct"
        | "total_cannabinoids_pct"
        | "dominant_terpenes"
        | "source"
        | "note"
        | "tested_at"
        | "created_at"
        | "updated_at"
      >;
      pheno_keepers: Tbl<PhenoKeeperRow, "id" | "note" | "created_at" | "updated_at">;
      pheno_keeper_clones: Tbl<
        PhenoKeeperCloneRow,
        | "id"
        | "parent_clone_id"
        | "clone_plant_id"
        | "note"
        | "taken_at"
        | "created_at"
        | "updated_at"
      >;
      pheno_crosses: Tbl<
        PhenoCrossRow,
        | "id"
        | "hunt_id"
        | "male_keeper_id"
        | "cross_type"
        | "cross_name"
        | "note"
        | "crossed_at"
        | "created_at"
        | "updated_at"
      >;
      // APPEND-ONLY (SELECT+INSERT grant only): Update = never.
      pheno_reversals: Tbl<
        PhenoReversalRow,
        "id" | "method" | "note" | "applied_at" | "created_at",
        never
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/**
 * The same runtime client, re-typed against the pinned pheno schema. See the
 * file header for why this single documented cast is the sanctioned boundary.
 */
export const phenoDb = supabase as unknown as SupabaseClient<PhenoDatabase>;
