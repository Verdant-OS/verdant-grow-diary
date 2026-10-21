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
  phenoCandidateLabelForNumber,
  phenoCandidateOrdinalBaseline,
  type PhenoHuntCandidateIdentity,
  type AddCandidateFailureReason,
  type PhenoHuntAddCandidatePlant,
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

// snip: 1,000-row pages, capped at 50 (50,000 candidates per hunt); raise if a hunt outgrows it.
const BASELINE_PAGE_SIZE = 1000;
const BASELINE_MAX_PAGES = 50;

/**
 * Highest ordinal used by the hunt's established candidates, read in full
 * (paged, stable order) so no legacy "#<n>" label is missed. `excludePlantId`
 * leaves out this request's own tagged-but-unnumbered plant on a retry.
 */
async function readOrdinalBaseline(
  client: SupabaseClient<any>,
  huntId: string,
  excludePlantId: string | null = null,
): Promise<number | null> {
  const rows: (PhenoHuntCandidateIdentity & { id: string })[] = [];
  try {
    for (let page = 0; page < BASELINE_MAX_PAGES; page += 1) {
      const from = page * BASELINE_PAGE_SIZE;
      const { data, error } = await client
        .from("plants")
        .select("id, candidate_number, candidate_label")
        .eq("pheno_hunt_id", huntId)
        .order("id", { ascending: true })
        .range(from, from + BASELINE_PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) return null;
      rows.push(...(data as (PhenoHuntCandidateIdentity & { id: string })[]));
      if (data.length < BASELINE_PAGE_SIZE) {
        return phenoCandidateOrdinalBaseline(rows.filter((r) => r.id !== excludePlantId));
      }
    }
    // More candidates than the cap: refuse to guess a number.
    return null;
  } catch {
    return null;
  }
}

/**
 * Conditionally undo OUR tag on a still-unnumbered plant. "undone": the database
 * returned the row; "absent": it confirmed there was no such tag to undo;
 * "unknown": the request failed, so the plant's state is not known.
 */
async function untag(
  client: SupabaseClient<any>,
  plantId: string,
  huntId: string,
): Promise<"undone" | "absent" | "unknown"> {
  try {
    const { data, error } = await client
      .from("plants")
      .update({ pheno_hunt_id: null, candidate_label: null })
      .eq("id", plantId)
      .eq("pheno_hunt_id", huntId)
      .is("candidate_number", null)
      .select("id")
      .maybeSingle();
    if (error) return "unknown";
    return data != null ? "undone" : "absent";
  } catch {
    return "unknown";
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

  const baseline = await readOrdinalBaseline(client, huntId);
  if (baseline === null) return failAll("network", plantIds);
  let nextNumber = baseline + 1;

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
        .eq("is_archived", false)
        .is("pheno_hunt_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      tagged = data;
    } catch {
      // The tag may have committed with its response lost: undo it if present.
      // Only a confirmed undo or a confirmed absence means nothing changed.
      if ((await untag(client, plantId, huntId)) === "unknown") {
        failed.push({ plantId, reason: "cleanup_unconfirmed" });
        return failAll("network", plantIds.slice(i + 1));
      }
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
      const latest = await readOrdinalBaseline(client, huntId, plantId);
      nextNumber = Math.max(nextNumber, latest ?? nextNumber) + 1;
    }

    if (!outcome || !outcome.ok) {
      // The tag was confirmed above, so only a returned row proves it was undone.
      const cleaned = (await untag(client, plantId, huntId)) === "undone";
      const reason = outcome && !outcome.ok ? outcome.reason : "network";
      const mapped: AddCandidateFailureReason =
        reason === "entitlement" || reason === "not_owner" || reason === "duplicate"
          ? reason
          : "network";
      if (!cleaned) {
        // The plant may still be tagged without a number: say so, and stop writing.
        failed.push({ plantId, reason: "cleanup_unconfirmed" });
        return failAll(mapped, plantIds.slice(i + 1));
      }
      failed.push({ plantId, reason: mapped });
      // Entitlement / ownership denials will repeat for every plant: stop writing.
      if (mapped === "entitlement" || mapped === "not_owner") {
        return failAll(mapped, plantIds.slice(i + 1));
      }
      continue;
    }

    const candidateNumber = outcome.candidateNumber;
    const candidateLabel = phenoCandidateLabelForNumber(candidateNumber);
    nextNumber = candidateNumber + 1;
    if (candidateLabel !== plannedLabel) {
      // Number moved after a duplicate retry: align the label on THIS plant only.
      let relabeled = false;
      try {
        const { data, error } = await client
          .from("plants")
          .update({ candidate_label: candidateLabel })
          .eq("id", plantId)
          .eq("pheno_hunt_id", huntId)
          .eq("candidate_number", candidateNumber)
          .select("id")
          .maybeSingle();
        relabeled = !error && data != null;
      } catch {
        relabeled = false;
      }
      if (!relabeled) {
        failed.push({ plantId, reason: "relabel_failed" });
        continue;
      }
    }
    added.push({ plantId, candidateNumber, candidateLabel });
  }

  return { added, failed };
}

const ADDABLE_PLANT_COLUMNS = "id, name, grow_id, pheno_hunt_id, is_archived";
// snip: 20 pages x 500 = 10,000 addable plants per grow; raise if a grow outgrows it.
const LIST_PAGE_SIZE = 500;
const LIST_MAX_PAGES = 20;

/** The grow's plants for the "Add candidates" picker; RLS limits them to the owner's. */
export async function listPhenoHuntGrowPlants(
  growId: string,
  deps: Pick<AddPhenoHuntCandidatesDeps, "client"> = {},
): Promise<{ ok: true; plants: PhenoHuntAddCandidatePlant[] } | { ok: false }> {
  const client = deps.client ?? phenoDb;
  const plants: PhenoHuntAddCandidatePlant[] = [];
  try {
    // Eligibility is filtered server-side and paged in a stable order, so a
    // large grow never hides addable plants behind ineligible ones.
    for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
      const from = page * LIST_PAGE_SIZE;
      const { data, error } = await client
        .from("plants")
        .select(ADDABLE_PLANT_COLUMNS)
        .eq("grow_id", growId)
        .eq("is_archived", false)
        .is("pheno_hunt_id", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + LIST_PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) return { ok: false };
      plants.push(...(data as PhenoHuntAddCandidatePlant[]));
      if (data.length < LIST_PAGE_SIZE) return { ok: true, plants };
    }
    return { ok: true, plants };
  } catch {
    return { ok: false };
  }
}

export interface PlantPhenoHuntOffer {
  readonly plant: PhenoHuntAddCandidatePlant;
  readonly hunt: { readonly id: string; readonly grow_id: string; readonly name: string };
}

/**
 * The plant page's "Add to pheno hunt" target: the plant's current tag and its
 * grow's hunt. Offered only when the grow has exactly one hunt, so the page
 * never guesses between hunts. Null on any failure or ambiguity.
 */
export async function loadPlantPhenoHuntOffer(
  plantId: string,
  deps: Pick<AddPhenoHuntCandidatesDeps, "client"> = {},
): Promise<PlantPhenoHuntOffer | null> {
  const client = deps.client ?? phenoDb;
  try {
    const plantRead = await client
      .from("plants")
      .select(ADDABLE_PLANT_COLUMNS)
      .eq("id", plantId)
      .maybeSingle();
    const plant = plantRead.data as PhenoHuntAddCandidatePlant | null;
    if (plantRead.error || !plant?.grow_id) return null;
    const huntRead = await client
      .from("pheno_hunts")
      .select("id, grow_id, name")
      .eq("grow_id", plant.grow_id)
      .limit(2);
    const hunts = huntRead.data as PlantPhenoHuntOffer["hunt"][] | null;
    if (huntRead.error || !Array.isArray(hunts) || hunts.length !== 1) return null;
    return { plant, hunt: hunts[0] };
  } catch {
    return null;
  }
}
