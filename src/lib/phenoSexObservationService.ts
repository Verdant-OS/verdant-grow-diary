/**
 * phenoSexObservationService — append-only read/write for grower-recorded sex
 * observations (pheno_sex_observations). female / male / hermaphrodite /
 * unknown. NEVER inferred (phenoSexObservationModel normalizes the stored
 * value). A plant can herm late, so this is an immutable observation log; the
 * current sex is the latest row.
 *
 * Insert-only (the table grants no UPDATE/DELETE). RLS enforces owner + hunt +
 * plant ownership + candidate consistency. No service_role, no AI, no
 * automation. Recording an observation acts on nothing — the herm→cull
 * suggestion is a separate, approval-required flow the grower confirms.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { normalizeSexObservation, type PhenoSexObservation } from "@/lib/phenoSexObservationModel";

export interface SexObservationRow {
  readonly plantId: string;
  readonly sex: PhenoSexObservation;
  readonly hermObserved: boolean;
  readonly note: string | null;
  readonly observedAt: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Append one immutable sex observation. */
export async function appendSexObservation(input: {
  huntId: string;
  plantId: string;
  sex: PhenoSexObservation;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record an observation." };
  const sex = normalizeSexObservation(input.sex);
  const { error } = await phenoDb.from("pheno_sex_observations").insert({
    user_id: userId,
    hunt_id: input.huntId,
    plant_id: input.plantId,
    sex,
    herm_observed: sex === "hermaphrodite",
    note: input.note ?? null,
  });
  if (error) return { ok: false, error: "Could not record this observation." };
  return { ok: true };
}

/** Latest sex observation per candidate for a hunt, keyed by plant id. */
export async function listLatestSexObservationsForHunt(
  huntId: string,
): Promise<Record<string, SexObservationRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  // Latest-per-plant view keeps the transfer at one row per candidate no
  // matter how much append-only history accumulates (scale audit C1). The
  // legacy full-history read remains as a fallback for deploy skew where
  // the view migration has not landed yet.
  let data:
    | { plant_id: string | null; sex: string | null; herm_observed: boolean | null; note: string | null; observed_at: string | null }[]
    | null = null;
  const viaView = await phenoDb
    .from("pheno_sex_observations_latest")
    .select("plant_id, sex, herm_observed, note, observed_at")
    .eq("hunt_id", id);
  if (!viaView.error && viaView.data) {
    data = viaView.data;
  } else {
    const legacy = await phenoDb
      .from("pheno_sex_observations")
      .select("plant_id, sex, herm_observed, note, observed_at")
      .eq("hunt_id", id)
      .order("observed_at", { ascending: false });
    if (legacy.error || !legacy.data) return {};
    data = legacy.data;
  }
  const map: Record<string, SexObservationRow> = {};
  for (const row of data) {
    if (!row.plant_id || map[row.plant_id]) continue; // first = latest (desc order)
    map[row.plant_id] = {
      plantId: row.plant_id,
      sex: normalizeSexObservation(row.sex),
      hermObserved: row.herm_observed === true,
      note: row.note ?? null,
      observedAt: row.observed_at ?? null,
    };
  }
  return map;
}
