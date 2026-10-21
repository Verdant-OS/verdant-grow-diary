/**
 * I/O for adding plants to an existing pheno hunt. Owner-only by RLS
 * ("Users update own plants") and the `plants_candidate_number_guard` trigger;
 * this module never trusts a client user_id or a client-supplied grow id.
 *
 * Per plant: conditional tag (same grow as the hunt, untagged) -> number
 * (bounded retry on a duplicate number) -> on any failure, conditional untag so
 * no half-added candidate is left behind. Existing candidates are never written.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import {
  assignPhenoCandidateNumber,
  type AssignCandidateNumberInput,
  type AssignCandidateNumberResult,
} from "@/lib/phenoCandidateNumberService";
import {
  PHENO_HUNT_ADD_CANDIDATES_MAX_NUMBER_ATTEMPTS,
  maxPhenoCandidateNumber,
  phenoCandidateLabelForNumber,
  type AddCandidateFailureReason,
} from "@/lib/phenoHuntAddCandidatesRules";

export interface AddPhenoHuntCandidatesInput {
  readonly huntId: string;
  readonly plantIds: readonly string[];
}

export interface AddedPhenoCandidate {
  readonly plantId: string;
  readonly candidateNumber: number;
  readonly candidateLabel: string;
}

export interface FailedPhenoCandidate {
  readonly plantId: string;
  readonly reason: AddCandidateFailureReason;
}

export interface AddPhenoHuntCandidatesResult {
  readonly added: AddedPhenoCandidate[];
  readonly failed: FailedPhenoCandidate[];
}

export interface AddPhenoHuntCandidatesDeps {
  readonly client?: SupabaseClient<any>;
  readonly assignNumber?: (
    input: AssignCandidateNumberInput,
  ) => Promise<AssignCandidateNumberResult>;
}

async function readMaxNumber(client: SupabaseClient<any>, huntId: string): Promise<number | null> {
  const { data, error } = await client
    .from("plants")
    .select("candidate_number")
    .eq("pheno_hunt_id", huntId)
    .not("candidate_number", "is", null)
    .order("candidate_number", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data)) return null;
  return maxPhenoCandidateNumber(
    (data as { candidate_number: number | null }[]).map((r) => r.candidate_number),
  );
}

async function untag(client: SupabaseClient<any>, plantId: string, huntId: string): Promise<void> {
  try {
    // Only undo OUR tag on a still-unnumbered plant — never an existing candidate.
    await client
      .from("plants")
      .update({ pheno_hunt_id: null, candidate_label: null })
      .eq("id", plantId)
      .eq("pheno_hunt_id", huntId)
      .is("candidate_number", null);
  } catch {
    // Best effort; the row stays unnumbered either way.
  }
}

export async function addPhenoHuntCandidates(
  input: AddPhenoHuntCandidatesInput,
  deps: AddPhenoHuntCandidatesDeps = {},
): Promise<AddPhenoHuntCandidatesResult> {
  const client = deps.client ?? phenoDb;
  const assignNumber = deps.assignNumber ?? assignPhenoCandidateNumber;
  const huntId = typeof input.huntId === "string" ? input.huntId.trim() : "";
  const plantIds = Array.from(
    new Set((input.plantIds ?? []).filter((id) => typeof id === "string" && id.trim())),
  );
  const added: AddedPhenoCandidate[] = [];
  const failed: FailedPhenoCandidate[] = [];
  const failAll = (reason: AddCandidateFailureReason, ids: readonly string[]) => {
    for (const plantId of ids) failed.push({ plantId, reason });
    return { added, failed };
  };
  if (!huntId || plantIds.length === 0) return failAll("invalid", plantIds);

  let growId: string | null = null;
  try {
    const { data, error } = await client
      .from("pheno_hunts")
      .select("id, grow_id")
      .eq("id", huntId)
      .maybeSingle();
    if (error) return failAll("network", plantIds);
    growId = (data as { grow_id: string | null } | null)?.grow_id ?? null;
  } catch {
    return failAll("network", plantIds);
  }
  if (!growId) return failAll("hunt_not_found", plantIds);

  const startMax = await readMaxNumber(client, huntId);
  if (startMax === null) return failAll("network", plantIds);
  let nextNumber = startMax + 1;

  for (let i = 0; i < plantIds.length; i += 1) {
    const plantId = plantIds[i];
    const plannedLabel = phenoCandidateLabelForNumber(nextNumber);
    let tagged: unknown = null;
    try {
      const { data, error } = await client
        .from("plants")
        .update({ pheno_hunt_id: huntId, candidate_label: plannedLabel })
        .eq("id", plantId)
        .eq("grow_id", growId)
        .is("pheno_hunt_id", null)
        .select("id")
        .maybeSingle();
      if (error) {
        failed.push({ plantId, reason: "network" });
        continue;
      }
      tagged = data;
    } catch {
      failed.push({ plantId, reason: "network" });
      continue;
    }
    if (!tagged) {
      failed.push({ plantId, reason: "ineligible" });
      continue;
    }

    let outcome: AssignCandidateNumberResult | null = null;
    for (let attempt = 0; attempt < PHENO_HUNT_ADD_CANDIDATES_MAX_NUMBER_ATTEMPTS; attempt += 1) {
      outcome = await assignNumber({ plantId, candidateNumber: nextNumber });
      if (outcome.ok || outcome.reason !== "duplicate") break;
      const latest = await readMaxNumber(client, huntId);
      nextNumber = Math.max(nextNumber, latest ?? nextNumber) + 1;
    }

    if (!outcome || !outcome.ok) {
      await untag(client, plantId, huntId);
      const reason = outcome && !outcome.ok ? outcome.reason : "network";
      const mapped: AddCandidateFailureReason =
        reason === "entitlement" || reason === "not_owner" || reason === "duplicate"
          ? reason
          : "network";
      failed.push({ plantId, reason: mapped });
      // Entitlement / ownership denials will repeat for every plant: stop writing.
      if (mapped === "entitlement" || mapped === "not_owner") {
        return failAll(mapped, plantIds.slice(i + 1));
      }
      continue;
    }

    const candidateNumber = outcome.candidateNumber;
    let candidateLabel = plannedLabel;
    const finalLabel = phenoCandidateLabelForNumber(candidateNumber);
    if (finalLabel !== plannedLabel) {
      // Number moved after a duplicate retry: align the label on THIS plant only.
      const { error } = await client
        .from("plants")
        .update({ candidate_label: finalLabel })
        .eq("id", plantId)
        .eq("pheno_hunt_id", huntId);
      if (!error) candidateLabel = finalLabel;
    }
    added.push({ plantId, candidateNumber, candidateLabel });
    nextNumber = candidateNumber + 1;
  }

  return { added, failed };
}
