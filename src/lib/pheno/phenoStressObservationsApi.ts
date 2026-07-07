/**
 * Persistence layer for PHENOHUNT stress observations.
 *
 * All writes are owner-scoped by RLS; the caller supplies user_id / hunt_id /
 * plant_id and the database re-verifies ownership + observed-entry rules on
 * INSERT/UPDATE. Diary linkage is optional. No AI, no Action Queue, no
 * automation, no device control, no sensor ingest.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  PhenoStressStatus,
  PhenoStressIntensity,
  PhenoStressRecommendation,
} from "./phenoStressObservationValidation";

export interface PhenoStressObservationRow {
  readonly id: string;
  readonly userId: string;
  readonly huntId: string;
  readonly plantId: string;
  readonly stressFactor: string;
  readonly status: PhenoStressStatus;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly intensity: PhenoStressIntensity;
  readonly plantResponse: string | null;
  readonly recoveryNotes: string | null;
  readonly yieldImpactNotes: string | null;
  readonly diseasePestNotes: string | null;
  readonly recommendation: PhenoStressRecommendation;
  readonly linkedDiaryEntryId: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PhenoStressInsertInput {
  readonly userId: string;
  readonly huntId: string;
  readonly plantId: string;
  readonly stressFactor: string;
  readonly status: PhenoStressStatus;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly intensity: PhenoStressIntensity;
  readonly plantResponse: string | null;
  readonly recoveryNotes: string | null;
  readonly yieldImpactNotes: string | null;
  readonly diseasePestNotes: string | null;
  readonly recommendation: PhenoStressRecommendation;
  readonly linkedDiaryEntryId: string | null;
  readonly notes: string | null;
}

type Row = {
  id: string;
  user_id: string;
  hunt_id: string;
  plant_id: string;
  stress_factor: string;
  status: string;
  start_date: string;
  end_date: string | null;
  intensity: string;
  plant_response: string | null;
  recovery_notes: string | null;
  yield_impact_notes: string | null;
  disease_pest_notes: string | null;
  recommendation: string;
  linked_diary_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: Row): PhenoStressObservationRow {
  return {
    id: row.id,
    userId: row.user_id,
    huntId: row.hunt_id,
    plantId: row.plant_id,
    stressFactor: row.stress_factor,
    status: row.status as PhenoStressStatus,
    startDate: row.start_date,
    endDate: row.end_date,
    intensity: row.intensity as PhenoStressIntensity,
    plantResponse: row.plant_response,
    recoveryNotes: row.recovery_notes,
    yieldImpactNotes: row.yield_impact_notes,
    diseasePestNotes: row.disease_pest_notes,
    recommendation: row.recommendation as PhenoStressRecommendation,
    linkedDiaryEntryId: row.linked_diary_entry_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStressObservationsForHunt(
  huntId: string,
): Promise<readonly PhenoStressObservationRow[]> {
  const { data, error } = await supabase
    .from("pheno_stress_observations")
    .select("*")
    .eq("hunt_id", huntId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toRow(r as Row));
}

export async function insertStressObservation(
  input: PhenoStressInsertInput,
): Promise<PhenoStressObservationRow> {
  const { data, error } = await supabase
    .from("pheno_stress_observations")
    .insert({
      user_id: input.userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      stress_factor: input.stressFactor,
      status: input.status,
      start_date: input.startDate,
      end_date: input.endDate,
      intensity: input.intensity,
      plant_response: input.plantResponse,
      recovery_notes: input.recoveryNotes,
      yield_impact_notes: input.yieldImpactNotes,
      disease_pest_notes: input.diseasePestNotes,
      recommendation: input.recommendation,
      linked_diary_entry_id: input.linkedDiaryEntryId,
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toRow(data as Row);
}

export interface DiaryOptionRow {
  readonly id: string;
  readonly entryDate: string | null;
  readonly plantId: string | null;
  readonly notePreview: string;
}

/**
 * Lightweight diary lookup for the evidence selector — RLS restricts the
 * result to the caller's own diary entries.
 */
export async function listDiaryOptionsForOwner(
  limit = 50,
): Promise<readonly DiaryOptionRow[]> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, entry_date, plant_id, content")
    .order("entry_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const row = d as {
      id: string;
      entry_date: string | null;
      plant_id: string | null;
      content: string | null;
    };
    const preview = (row.content ?? "").trim().slice(0, 80);
    return {
      id: row.id,
      entryDate: row.entry_date,
      plantId: row.plant_id,
      notePreview: preview,
    };
  });
}
