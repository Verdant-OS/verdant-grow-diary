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
  requiresRecurrentParent,
  requiresGeneration,
  type CrossType,
  type Channel,
} from "@/lib/genetics/breedingReproductionRules";
import { hasReversal } from "@/lib/phenoReversalsService";
import {
  sanitizeStabilityRuns,
  type StabilityRun,
} from "@/lib/phenoStabilityRunRules";

export interface KeeperRow {
  readonly id: string;
  readonly huntId: string;
  readonly sourcePlantId: string;
  readonly keeperName: string;
  readonly note: string | null;
  readonly createdAt: string | null;
  /** Grower-recorded grow-outs of this keeper's clone (re-sanitized on read).
   * Optional so older fixtures / a not-yet-migrated read degrade to []. */
  readonly stabilityRuns?: StabilityRun[];
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
  // Nullable — a selfing_s1/selfing_sn/open_pollination cross may have no
  // distinct male parent. Readers/UI must treat null as "self" or
  // "open pollination", never as a broken row.
  readonly maleKeeperId: string | null;
  // Full 15-value CrossType from breedingReproductionRules; legacy rows use
  // the original 3 (standard_f1 | feminized_cross | selfing_s1).
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
    .select("id, hunt_id, source_plant_id, keeper_name, note, created_at, stability_runs")
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
    stabilityRuns: sanitizeStabilityRuns(
      Array.isArray((r as { stability_runs?: unknown }).stability_runs)
        ? ((r as { stability_runs?: unknown[] }).stability_runs as unknown[])
        : null,
    ),
  }));
}

/**
 * Replace a keeper's stability runs (the grower edits the ledger as a
 * whole set). Sanitized before write; RLS-scoped to the owner via the
 * keeper's own owner policy. Reads the row back so a silently-blocked
 * write (lapsed plan, cross-user keeper id) surfaces as an error rather
 * than a false success.
 */
export async function updateKeeperStabilityRuns(input: {
  keeperId: string;
  runs: readonly unknown[];
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save stability runs." };
  const keeperId = typeof input.keeperId === "string" ? input.keeperId.trim() : "";
  if (!keeperId) return { ok: false, error: "Missing keeper id." };
  const runs = sanitizeStabilityRuns(input.runs);
  const { data, error } = await phenoDb
    .from("pheno_keepers")
    .update({ stability_runs: runs } as never)
    .eq("id", keeperId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Stability runs were not saved (keeper missing or write rejected)." };
  return { ok: true, id: data.id as string };
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
    .in("keeper_id", ids)
    // Deterministic order + explicit bound: clones accumulate indefinitely
    // per keeper, and an uncapped read is silently truncated at the server's
    // configured ceiling in whatever order Postgres returns.
    .order("taken_at", { ascending: true })
    .limit(2000);
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
    if (input.channel == null)
      return { ok: false, error: "Choose how the pollen was made (the channel)." };

    // Donor SHAPE (mirrors the DB's parents_by_type CHECK so the service rejects
    // with a clear message instead of leaning on a generic DB failure): a
    // selfing uses the mother as its own donor; open pollination may omit the
    // donor; every other way needs a distinct, non-blank donor.
    const isSelfingType = input.crossType === "selfing_s1" || input.crossType === "selfing_sn";
    const donorNamed = pollen !== null && pollen.trim() !== "";
    if (isSelfingType) {
      if (!isSelf)
        return {
          ok: false,
          error: "A selfing uses the mother as its own pollen donor — leave the donor empty.",
        };
    } else if (input.crossType === "open_pollination") {
      // Population pollen: a named donor is optional, but if given it must be a
      // DISTINCT keeper (never the mother) to satisfy parents_by_type.
      if (donorNamed && pollen!.trim() === female)
        return {
          ok: false,
          error: "Choose a distinct pollen donor, or leave it empty for open pollination.",
        };
    } else {
      // Every other two-parent way needs a distinct, non-blank donor.
      if (!donorNamed || pollen!.trim() === female)
        return { ok: false, error: "Choose a distinct pollen donor for this cross." };
    }

    // Only backcrosses carry a recurrent parent; only F#/S#/BX# ways carry a
    // generation. Null the rest so the persisted shape matches the DB's
    // recurrent_parent_by_type + type-aware generation CHECKs exactly.
    const recurrent =
      requiresRecurrentParent(input.crossType) &&
      typeof input.recurrentParentId === "string" &&
      input.recurrentParentId.trim() !== ""
        ? input.recurrentParentId.trim()
        : null;
    const gen =
      requiresGeneration(input.crossType) &&
      typeof input.generation === "number" &&
      Number.isFinite(input.generation)
        ? Math.trunc(input.generation)
        : null;

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
  // Selfing has no distinct male; otherwise persist the donor, coalescing a
  // blank/absent donor (only reachable for open_pollination) to NULL so we never
  // write an empty-string uuid.
  const dbMale = isSelfingType || pollen === null || pollen.trim() === "" ? null : pollen.trim();

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
    .order("created_at", { ascending: false })
    // Newest 500 crosses: breeding history is append-only and unbounded over
    // seasons; the page labels the list when the cap is reached.
    .limit(500);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    femaleKeeperId: r.female_keeper_id,
    maleKeeperId: r.male_keeper_id ?? null,
    crossType: r.cross_type ?? "standard_f1",
    channel: r.channel ?? null,
    generation:
      typeof r.generation === "number" && Number.isFinite(r.generation) ? r.generation : null,
    recurrentParentId: r.recurrent_parent_id ?? null,
    crossName: r.cross_name ?? null,
    note: r.note ?? null,
    crossedAt: r.crossed_at ?? null,
    createdAt: r.created_at ?? null,
  }));
}
