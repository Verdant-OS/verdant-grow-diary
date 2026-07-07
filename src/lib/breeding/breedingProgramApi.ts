/**
 * Thin, typed data helpers for breeding_programs / breeding_program_steps /
 * breeding_step_evidence. All calls go through the authenticated Supabase
 * client — RLS is the enforcement boundary. No service_role, no AI, no writes
 * to unrelated tables.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  BREEDING_PROGRAM_SOP_VERSION,
  getBreedingProgramTemplate,
  type BreedingCriterionKey,
  type BreedingTemplateCriterion,
} from "@/constants/breedingProgramTemplate";
import { buildStepRowsFromTemplate } from "./breedingProgramProgress";

export interface BreedingProgramSummary {
  id: string;
  name: string;
  status: "active" | "paused" | "complete" | "archived";
  sop_version: string;
  starting_generation: string;
  p1_maternal_label: string | null;
  p1_paternal_label: string | null;
  cross_pair_label: string | null;
  target_traits: string[];
  grow_id: string | null;
  tent_id: string | null;
  current_step_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BreedingStepRecord {
  id: string;
  program_id: string;
  step_index: number;
  step_key: string;
  generation_label: string;
  instruction_summary: string;
  required_criteria: readonly BreedingTemplateCriterion[];
  criteria_met: Partial<Record<BreedingCriterionKey, boolean>>;
  status: "pending" | "active" | "complete" | "skipped";
  completed_at: string | null;
  note: string | null;
}

export interface BreedingEvidenceRecord {
  id: string;
  program_id: string;
  step_id: string;
  diary_entry_id: string;
  criterion_key: BreedingCriterionKey;
  note: string | null;
  created_at: string;
  diary_note?: string | null;
  diary_entry_at?: string | null;
}

export interface CreateProgramInput {
  name: string;
  p1_maternal_label?: string | null;
  p1_paternal_label?: string | null;
  cross_pair_label?: string | null;
  target_traits?: string[];
  starting_generation?: string;
  grow_id?: string | null;
  tent_id?: string | null;
  notes?: string | null;
}

export async function listBreedingPrograms(): Promise<BreedingProgramSummary[]> {
  const { data, error } = await supabase
    .from("breeding_programs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BreedingProgramSummary[];
}

export async function getBreedingProgram(
  id: string,
): Promise<{
  program: BreedingProgramSummary;
  steps: BreedingStepRecord[];
  evidence: BreedingEvidenceRecord[];
}> {
  const [programRes, stepsRes, evidenceRes] = await Promise.all([
    supabase.from("breeding_programs").select("*").eq("id", id).single(),
    supabase
      .from("breeding_program_steps")
      .select("*")
      .eq("program_id", id)
      .order("step_index", { ascending: true }),
    supabase
      .from("breeding_step_evidence")
      .select(
        "id, program_id, step_id, diary_entry_id, criterion_key, note, created_at, diary_entries!inner(note, entry_at)",
      )
      .eq("program_id", id),
  ]);
  if (programRes.error) throw programRes.error;
  if (stepsRes.error) throw stepsRes.error;
  if (evidenceRes.error) throw evidenceRes.error;

  const evidence = (evidenceRes.data ?? []).map((row) => {
    const diary = (row as { diary_entries?: { note?: string; entry_at?: string } })
      .diary_entries;
    return {
      id: row.id,
      program_id: row.program_id,
      step_id: row.step_id,
      diary_entry_id: row.diary_entry_id,
      criterion_key: row.criterion_key as BreedingCriterionKey,
      note: row.note,
      created_at: row.created_at,
      diary_note: diary?.note ?? null,
      diary_entry_at: diary?.entry_at ?? null,
    } satisfies BreedingEvidenceRecord;
  });

  return {
    program: programRes.data as BreedingProgramSummary,
    steps: (stepsRes.data ?? []) as unknown as BreedingStepRecord[],
    evidence,
  };
}

export async function createBreedingProgram(
  input: CreateProgramInput,
): Promise<{ programId: string }> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const template = getBreedingProgramTemplate(BREEDING_PROGRAM_SOP_VERSION);

  const { data: program, error: progErr } = await supabase
    .from("breeding_programs")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      sop_version: BREEDING_PROGRAM_SOP_VERSION,
      starting_generation: input.starting_generation ?? "P1",
      p1_maternal_label: input.p1_maternal_label ?? null,
      p1_paternal_label: input.p1_paternal_label ?? null,
      cross_pair_label: input.cross_pair_label ?? null,
      target_traits: input.target_traits ?? [],
      grow_id: input.grow_id ?? null,
      tent_id: input.tent_id ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (progErr) throw progErr;

  const stepRows = buildStepRowsFromTemplate(template).map((s) => ({
    user_id: userId,
    program_id: program.id,
    step_index: s.step_index,
    step_key: s.step_key,
    generation_label: s.generation_label,
    instruction_summary: s.instruction_summary,
    required_criteria: JSON.parse(JSON.stringify(s.required_criteria)) as Json,
    status: s.status,
  }));

  const { data: inserted, error: stepsErr } = await supabase
    .from("breeding_program_steps")
    .insert(stepRows)
    .select("id, step_index");
  if (stepsErr) throw stepsErr;

  const first = (inserted ?? []).find((r) => r.step_index === 0);
  if (first) {
    const { error: linkErr } = await supabase
      .from("breeding_programs")
      .update({ current_step_id: first.id })
      .eq("id", program.id);
    if (linkErr) throw linkErr;
  }

  return { programId: program.id };
}

export async function setStepCriterionMet(
  stepId: string,
  patch: Partial<Record<BreedingCriterionKey, boolean>>,
): Promise<void> {
  const { data: existing, error: readErr } = await supabase
    .from("breeding_program_steps")
    .select("criteria_met")
    .eq("id", stepId)
    .single();
  if (readErr) throw readErr;
  const current = (existing?.criteria_met ?? {}) as Record<string, unknown>;
  const next: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === "boolean") next[k] = v;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "boolean") next[k] = v;
  }
  const { error } = await supabase
    .from("breeding_program_steps")
    .update({ criteria_met: next })
    .eq("id", stepId);
  if (error) throw error;
}

export async function completeStepAndAdvance(
  programId: string,
  stepId: string,
): Promise<void> {
  // Mark current step complete.
  const { data: current, error: curErr } = await supabase
    .from("breeding_program_steps")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", stepId)
    .select("step_index")
    .single();
  if (curErr) throw curErr;

  // Activate the next step if there is one.
  const nextIndex = (current.step_index ?? 0) + 1;
  const { data: nextStep, error: nextErr } = await supabase
    .from("breeding_program_steps")
    .update({ status: "active" })
    .eq("program_id", programId)
    .eq("step_index", nextIndex)
    .select("id")
    .maybeSingle();
  if (nextErr) throw nextErr;

  const { error: progErr } = await supabase
    .from("breeding_programs")
    .update({
      current_step_id: nextStep?.id ?? null,
      status: nextStep ? "active" : "complete",
    })
    .eq("id", programId);
  if (progErr) throw progErr;
}

export async function attachDiaryEvidence(input: {
  programId: string;
  stepId: string;
  diaryEntryId: string;
  criterionKey: BreedingCriterionKey;
  note?: string | null;
}): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { error } = await supabase.from("breeding_step_evidence").insert({
    user_id: userId,
    program_id: input.programId,
    step_id: input.stepId,
    diary_entry_id: input.diaryEntryId,
    criterion_key: input.criterionKey,
    note: input.note ?? null,
  });
  if (error) throw error;
}

export async function listOwnDiaryEntries(limit = 50): Promise<
  Array<{ id: string; note: string; entry_at: string; grow_id: string }>
> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, note, entry_at, grow_id")
    .order("entry_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; note: string; entry_at: string; grow_id: string }>;
}
