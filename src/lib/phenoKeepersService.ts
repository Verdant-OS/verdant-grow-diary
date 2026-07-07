/**
 * phenoKeepersService — RLS-scoped read/write for keepers, their clone lineage,
 * and breeding crosses (pheno_keepers, pheno_keeper_clones, pheno_crosses).
 *
 * All normal user-data writes of the grower's OWN records, enforced by RLS
 * (owner + ownership of the referenced keeper(s)/hunt/plant). Data/record-only:
 * naming a keeper, adding a clone, or recording a cross starts no grow and
 * drives no device. No service_role, no AI, no automation.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import {
  classifyCross,
  validateBreedingCross,
  isCrossType,
  isChannel,
  type CrossType,
  type Channel,
} from "@/lib/genetics/breedingReproductionRules";
import { hasReversal } from "@/lib/phenoReversalsService";

export interface KeeperRow {
  readonly id: string;
  readonly huntId: string;
  readonly sourcePlantId: string;
  readonly keeperName: string;
  readonly note: string | null;
  readonly createdAt: string | null;
}

export interface CloneRow {
  readonly id: string;
  readonly keeperId: string;
  readonly parentCloneId: string | null;
  readonly cloneLabel: string;
  readonly note: string | null;
  readonly takenAt: string | null;
}

export interface CrossRow {
  readonly id: string;
  readonly femaleKeeperId: string;
  // B2: nullable — a selfing_s1 cross has no distinct male parent (the reversed
  // mother pollinates itself). Readers/UI must treat null as "self".
  readonly maleKeeperId: string | null;
  // Full breeding taxonomy (see breedingReproductionRules.CrossType).
  readonly crossType: string;
  // Pollen route (natural_male | colloidal_silver | sts | ga3 | rodelization |
  // open_pollination); null for legacy / auto-classified crosses.
  readonly channel: string | null;
  // F#/S#/BX# generation when the way carries one; null otherwise.
  readonly generation: number | null;
  // The line a backcross crosses back to; null off a backcross.
  readonly recurrentParentId: string | null;
  readonly crossName: string | null;
  readonly note: string | null;
  readonly crossedAt: string | null;
  readonly createdAt: string | null;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Promote a hunt candidate to a named keeper. */
export async function nameKeeper(input: {
  huntId: string;
  sourcePlantId: string;
  keeperName: string;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to name a keeper." };
  const name = input.keeperName.trim();
  if (!name) return { ok: false, error: "Give the keeper a name." };
  const { data, error } = await phenoDb
    .from("pheno_keepers")
    .insert({
      user_id: userId,
      hunt_id: input.huntId,
      source_plant_id: input.sourcePlantId,
      keeper_name: name,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not name this keeper." };
  return { ok: true, id: data.id };
}

export async function listKeepersForHunt(huntId: string): Promise<KeeperRow[]> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return [];
  const { data, error } = await phenoDb
    .from("pheno_keepers")
    .select("id, hunt_id, source_plant_id, keeper_name, note, created_at")
    .eq("hunt_id", id)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    huntId: r.hunt_id,
    sourcePlantId: r.source_plant_id,
    keeperName: r.keeper_name,
    note: r.note ?? null,
    createdAt: r.created_at ?? null,
  }));
}

/** Add a clone/accession node under a keeper (optionally under a parent clone). */
export async function addClone(input: {
  keeperId: string;
  cloneLabel: string;
  parentCloneId?: string | null;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to add a clone." };
  const label = input.cloneLabel.trim();
  if (!label) return { ok: false, error: "Give the clone a label." };
  const { data, error } = await phenoDb
    .from("pheno_keeper_clones")
    .insert({
      user_id: userId,
      keeper_id: input.keeperId,
      parent_clone_id: input.parentCloneId ?? null,
      clone_label: label,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not add this clone." };
  return { ok: true, id: data.id };
}

export async function listClonesForKeepers(keeperIds: readonly string[]): Promise<CloneRow[]> {
  const ids = [...new Set(keeperIds.filter((k) => typeof k === "string" && k.length > 0))];
  if (ids.length === 0) return [];
  const { data, error } = await phenoDb
    .from("pheno_keeper_clones")
    .select("id, keeper_id, parent_clone_id, clone_label, note, taken_at")
    .in("keeper_id", ids);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    keeperId: r.keeper_id,
    parentCloneId: r.parent_clone_id ?? null,
    cloneLabel: r.clone_label,
    note: r.note ?? null,
    takenAt: r.taken_at ?? null,
  }));
}

/**
 * Record a cross. Two modes:
 *
 *  - AUTO-CLASSIFY (no `crossType`): pass a distinct `maleKeeperId` for a
 *    two-parent cross, or null/omit it to SELF a reversed keeper (S1). Reversal
 *    state is read from pheno_reversals and fed to classifyCross, which picks
 *    standard_f1 / feminized_cross / selfing_s1 and rejects impossible combos.
 *    This is the original path — the current keepers UI uses it unchanged.
 *
 *  - EXPLICIT TAXONOMY (`crossType` given): the grower picked a full breeding
 *    way (+ channel / generation / recurrent parent). validateBreedingCross
 *    verifies the combination against the same rules the DB's RLS enforces, so
 *    service and database agree; a selfing persists a null male.
 *
 * Either way the cross_type + null-for-selfing male match the DB precondition.
 */
export async function recordCross(input: {
  huntId?: string | null;
  femaleKeeperId: string;
  maleKeeperId?: string | null;
  crossName?: string | null;
  note?: string | null;
  /** Explicit taxonomy (omit for the auto-classify path). */
  crossType?: CrossType | null;
  channel?: Channel | null;
  generation?: number | null;
  recurrentParentId?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record a cross." };

  const female = (input.femaleKeeperId ?? "").trim();
  if (!female) return { ok: false, error: "Choose the seed (mother) keeper." };
  // PRESERVE the null-vs-blank distinction. Explicit null/omitted signals
  // selfing; a (possibly blank) STRING is passed through to the classifier,
  // which rejects a blank donor as an incomplete two-parent form rather than
  // silently selfing it. Do NOT coalesce "" → null here.
  const pollen: string | null = input.maleKeeperId == null ? null : input.maleKeeperId.trim();
  const isSelf = pollen === null || pollen.trim() === female;
  // Only a real, distinct donor has a reversal state worth querying.
  const isDistinctDonor = pollen !== null && pollen !== "" && pollen !== female;

  const femaleReversed = await hasReversal(female);
  const pollenReversed = isDistinctDonor ? await hasReversal(pollen as string) : false;

  let crossType: CrossType;
  let channel: Channel | null = null;
  let generation: number | null = null;
  let recurrentParentId: string | null = null;

  if (input.crossType != null) {
    // EXPLICIT taxonomy path.
    if (!isCrossType(input.crossType)) return { ok: false, error: "Unknown cross type." };
    if (input.channel != null && !isChannel(input.channel))
      return { ok: false, error: "Unknown pollen channel." };
    const recurrent =
      typeof input.recurrentParentId === "string" && input.recurrentParentId.trim() !== ""
        ? input.recurrentParentId.trim()
        : null;
    const gen =
      typeof input.generation === "number" && Number.isFinite(input.generation)
        ? Math.trunc(input.generation)
        : null;
    if (input.channel == null)
      return { ok: false, error: "Choose how the pollen was made (the channel)." };

    const check = validateBreedingCross({
      crossType: input.crossType,
      channel: input.channel,
      isSelf,
      femaleReversed,
      pollenReversed,
      hasRecurrentParent: recurrent !== null,
      generation: gen,
    });
    if (check.ok === false) return { ok: false, error: check.reason };

    crossType = input.crossType;
    channel = input.channel;
    generation = gen;
    recurrentParentId = recurrent;
  } else {
    // AUTO-CLASSIFY path (original behaviour).
    const classified = classifyCross({
      femaleKeeperId: female,
      pollenKeeperId: pollen,
      femaleReversed,
      pollenReversed,
    });
    // Explicit `=== false` narrowing: this repo compiles with strictNullChecks
    // off, under which `!classified.ok` does not narrow to the failure branch.
    if (classified.ok === false) return { ok: false, error: classified.reason };
    crossType = classified.crossType;
  }

  const isSelfingType = crossType === "selfing_s1" || crossType === "selfing_sn";
  const dbMale = isSelfingType ? null : pollen;

  const { data, error } = await phenoDb
    .from("pheno_crosses")
    .insert({
      user_id: userId,
      hunt_id: input.huntId ?? null,
      female_keeper_id: female,
      male_keeper_id: dbMale,
      cross_type: crossType,
      channel,
      generation,
      recurrent_parent_id: recurrentParentId,
      cross_name: input.crossName ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not record this cross." };
  return { ok: true, id: data.id };
}

export async function listCrossesForHunt(huntId: string): Promise<CrossRow[]> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return [];
  const { data, error } = await phenoDb
    .from("pheno_crosses")
    .select(
      "id, female_keeper_id, male_keeper_id, cross_type, channel, generation, recurrent_parent_id, cross_name, note, crossed_at, created_at",
    )
    .eq("hunt_id", id)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    femaleKeeperId: r.female_keeper_id,
    maleKeeperId: r.male_keeper_id ?? null,
    crossType: r.cross_type ?? "standard_f1",
    channel: r.channel ?? null,
    generation: r.generation ?? null,
    recurrentParentId: r.recurrent_parent_id ?? null,
    crossName: r.cross_name ?? null,
    note: r.note ?? null,
    crossedAt: r.crossed_at ?? null,
    createdAt: r.created_at ?? null,
  }));
}
