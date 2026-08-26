/**
 * phenoHuntCandidatesService — read-only loader for a real pheno hunt's
 * candidates.
 *
 * Reads `pheno_hunts` + its candidate `plants` (RLS-scoped to the signed-in
 * grower; the server enforces ownership) and maps them into the pure
 * comparison view-model input via phenoHuntCandidateAdapter. No writes, no
 * service_role, no automation. SELECT only.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  adaptPhenoHuntCandidates,
  type PhenoHuntCandidateLabEvidence,
  type PhenoHuntCandidatePlantRow,
  type PhenoHuntCandidateScoreEvidence,
  type PhenoHuntCandidateSmokeEvidence,
} from "@/lib/phenoHuntCandidateAdapter";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import type { PhenoCandidateInput, PhenoSensorSnapshotInput } from "@/lib/phenoComparisonViewModel";
import { PhenoEvidenceReadError } from "@/lib/phenoEvidenceReadError";
import {
  mapDiaryRowsToCandidateEvidence,
  tentSnapshotToComparisonInput,
  type PhenoCandidateDiaryEvidence,
} from "@/lib/phenoCandidateEvidenceEnrichmentRules";
import { fetchLatestSensorSnapshot } from "@/lib/quick-log/fetchLatestSensorSnapshot";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import { listLatestSexObservationsForHunt } from "@/lib/phenoSexObservationService";
import {
  sanitizeBreedingObjectiveTargets,
  type BreedingObjectiveTarget,
} from "@/lib/phenoBreedingObjectiveRules";

export interface PhenoHuntSummary {
  id: string;
  name: string;
  growId: string | null;
  tentId: string | null;
  /** Selected evidence goal ids persisted at onboarding. Optional so older
   * test stubs and callers stay compatible. */
  evidenceGoals?: string[];
  notes?: string | null;
  setupCompletedAt?: string | null;
  /** Grower-authored target trait axes + acceptance thresholds. Re-sanitized
   * on every read (defense in depth against a stale or manually-edited row). */
  breedingObjective?: BreedingObjectiveTarget[];
  /** The earlier hunt this one continues from, when the grower linked one. */
  parentHuntId?: string | null;
  /** Free-text generation label the grower set (F1, F2, BX1…), if any. */
  generationLabel?: string | null;
}

export type LoadPhenoHuntCandidatesResult =
  | { ok: true; hunt: PhenoHuntSummary; candidates: PhenoCandidateInput[] }
  | { ok: false; error: string };

export interface PhenoHuntListItem {
  id: string;
  name: string;
  createdAt: string | null;
  setupCompletedAt: string | null;
  candidateCount: number;
}

const PHENO_CANDIDATE_PLANT_COLUMNS =
  "id, name, candidate_label, candidate_number, strain, stage, plant_type, grow_id, tent_id, photo_url, is_archived";
const LEGACY_PHENO_CANDIDATE_PLANT_COLUMNS =
  "id, name, candidate_label, strain, stage, plant_type, grow_id, tent_id, photo_url, is_archived";

/**
 * Only tolerate the known deploy-window failure where candidate_number has
 * not reached PostgREST yet. Permission, RLS, network, and unrelated schema
 * failures must remain visible instead of being hidden behind a retry.
 */
function isCandidateNumberColumnUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  if (code !== "PGRST204" && code !== "42703") return false;
  const detail = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /\bcandidate_number\b/i.test(detail);
}

interface PhenoHuntListRow {
  readonly id: string;
  readonly name: string | null;
  readonly created_at: string | null;
  readonly setup_completed_at: string | null;
  readonly plants: readonly { readonly count: number | null }[] | null;
}

function activeCandidateCount(row: PhenoHuntListRow): number {
  const count = row.plants?.[0]?.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Could not determine pheno hunt candidate counts.");
  }
  return count;
}

/**
 * List the signed-in grower's pheno hunts, newest first, for the hunts
 * index. RLS scopes to the owner; a bounded read (hunts accumulate over
 * time). Candidate counts are exact server-side aggregates over each hunt's
 * non-archived plants, embedded in the same bounded request — no row scan,
 * 5,000-row truncation, or per-hunt N+1. Resolved query/count errors throw so
 * the index renders its honest error state instead of a false empty list or
 * zero candidate count.
 */
export async function listPhenoHuntsForOwner(): Promise<PhenoHuntListItem[]> {
  const { data, error } = await supabase
    .from("pheno_hunts")
    .select("id, name, created_at, setup_completed_at, plants(count)")
    .eq("plants.is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) throw new Error("Could not load pheno hunts.");
  return (data as PhenoHuntListRow[]).map((row) => ({
    id: row.id,
    name: row.name ?? "Untitled hunt",
    createdAt: row.created_at ?? null,
    setupCompletedAt: row.setup_completed_at ?? null,
    candidateCount: activeCandidateCount(row),
  }));
}

/** Load a hunt and its (non-archived) candidate plants, mapped for comparison. */
export async function loadPhenoHuntCandidates(
  huntId: string,
): Promise<LoadPhenoHuntCandidatesResult> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return { ok: false, error: "Missing hunt id." };

  const { data: huntRow, error: huntError } = await supabase
    .from("pheno_hunts")
    // "*" (not an explicit column list) so the workspace keeps loading
    // during a deploy window where the guided-setup migration has not been
    // applied yet — missing columns simply arrive as undefined and the
    // defensive mapping below turns them into safe defaults.
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (huntError) return { ok: false, error: "Could not load this pheno hunt." };
  if (!huntRow) return { ok: false, error: "Pheno hunt not found." };

  // Read plants through the narrow typed pheno boundary (phenoDb) so
  // candidate_number — which the generated types.ts still lacks — is typed
  // without an `any` or a hand-edit of generated types. SELECT only.
  const primaryPlantRead = await phenoDb
    .from("plants")
    .select(PHENO_CANDIDATE_PLANT_COLUMNS)
    .eq("pheno_hunt_id", id)
    .eq("is_archived", false);

  let plantRows = primaryPlantRead.data as unknown as PhenoHuntCandidatePlantRow[] | null;
  let plantsError: unknown = primaryPlantRead.error;
  if (isCandidateNumberColumnUnavailable(plantsError)) {
    const legacyPlantRead = await phenoDb
      .from("plants")
      .select(LEGACY_PHENO_CANDIDATE_PLANT_COLUMNS)
      .eq("pheno_hunt_id", id)
      .eq("is_archived", false);
    plantRows = legacyPlantRead.data as unknown as PhenoHuntCandidatePlantRow[] | null;
    plantsError = legacyPlantRead.error;
  }

  if (plantsError) return { ok: false, error: "Could not load hunt candidates." };

  const plants = (plantRows ?? []) as unknown as PhenoHuntCandidatePlantRow[];
  const plantIds = plants
    .map((p) => p.id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  // Independent lookups — one round trip instead of two serial hops on the
  // workspace's critical loading path. Evidence tables are RLS-scoped by
  // hunt_id (and the caller owns the hunt), so cross-hunt / cross-user data
  // never reaches this map. Requests are scoped by hunt_id AND plant_id so
  // stray orphan rows from a deleted candidate can't leak either.
  let scoreByPlantId: Record<string, PhenoHuntCandidateScoreEvidence>;
  let smokeTestByPlantId: Record<string, PhenoHuntCandidateSmokeEvidence>;
  let labResultByPlantId: Record<string, PhenoHuntCandidateLabEvidence>;
  let growNameById: Record<string, string>;
  let tentNameById: Record<string, string>;
  let diaryEvidence: PhenoCandidateDiaryEvidence;
  let tentSnapshots: Record<string, PhenoSensorSnapshotInput | null>;
  try {
    [
      growNameById,
      tentNameById,
      scoreByPlantId,
      smokeTestByPlantId,
      labResultByPlantId,
      diaryEvidence,
      tentSnapshots,
    ] = await Promise.all([
      loadNameMap("grows", distinct([huntRow.grow_id, ...plants.map((p) => p.grow_id)])),
      loadNameMap("tents", distinct([huntRow.tent_id, ...plants.map((p) => p.tent_id)])),
      loadCandidateScores(id, plantIds),
      loadSmokeTests(id, plantIds),
      loadLabResults(id, plantIds),
      loadCandidateDiaryEvidence(plantIds),
      loadTentSnapshots([huntRow.tent_id, ...plants.map((p) => p.tent_id)]),
    ]);
  } catch (readError) {
    // Fail closed: a failed evidence read renders as an error + retry, never
    // as candidates that look evidence-free.
    if (readError instanceof PhenoEvidenceReadError) {
      return { ok: false, error: readError.message };
    }
    throw readError;
  }

  // Each candidate carries its own tent's latest snapshot (hunt tent as the
  // fallback context when a plant has no tent of its own).
  const sensorSnapshotByPlantId: Record<string, PhenoSensorSnapshotInput | null> = {};
  for (const p of plants) {
    const tentId = p.tent_id ?? huntRow.tent_id ?? null;
    sensorSnapshotByPlantId[p.id] = tentId ? (tentSnapshots[tentId] ?? null) : null;
  }

  const candidates = adaptPhenoHuntCandidates({
    plants,
    growNameById,
    tentNameById,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
    quickLogEntriesByPlantId: diaryEvidence.quickLogEntriesByPlantId,
    timelineEventsByPlantId: diaryEvidence.timelineEventsByPlantId,
    photosByPlantId: diaryEvidence.photosByPlantId,
    sensorSnapshotByPlantId,
  });

  return { ok: true, hunt: mapHuntSummary(huntRow), candidates };
}

/** Map a raw pheno_hunts row into the app summary, tolerating missing columns. */
function mapHuntSummary(huntRow: {
  id: string;
  name: string;
  grow_id?: string | null;
  tent_id?: string | null;
  [key: string]: unknown;
}): PhenoHuntSummary {
  const rawGoals = huntRow.evidence_goals;
  const evidenceGoals = Array.isArray(rawGoals)
    ? rawGoals.filter((v): v is string => typeof v === "string")
    : [];
  const notes = typeof huntRow.notes === "string" ? huntRow.notes : null;
  const setupCompletedAt =
    typeof huntRow.setup_completed_at === "string" ? huntRow.setup_completed_at : null;
  const breedingObjective = sanitizeBreedingObjectiveTargets(
    Array.isArray(huntRow.breeding_objective) ? (huntRow.breeding_objective as unknown[]) : null,
  );
  // Both tolerate a not-yet-applied migration / older row: absent → null.
  const parentHuntId =
    typeof huntRow.parent_hunt_id === "string" && huntRow.parent_hunt_id !== ""
      ? huntRow.parent_hunt_id
      : null;
  const generationLabel =
    typeof huntRow.generation === "string" && huntRow.generation.trim() !== ""
      ? huntRow.generation.trim()
      : null;
  return {
    id: huntRow.id,
    name: huntRow.name,
    growId: huntRow.grow_id ?? null,
    tentId: huntRow.tent_id ?? null,
    evidenceGoals,
    notes,
    setupCompletedAt,
    breedingObjective,
    parentHuntId,
    generationLabel,
  };
}

function distinct(ids: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of ids) if (typeof v === "string" && v.length > 0) out.add(v);
  return Array.from(out);
}

/** Bounded canonical diary read for the candidates' own plants — the Pheno
 * Hunt links to plant memory, it never copies it. Newest first; per-plant
 * caps applied by the pure mapper. Fails closed (never "no entries" on a
 * failed read). Retracted entries are excluded. */
const DIARY_EVIDENCE_ROW_LIMIT = 600;
async function loadCandidateDiaryEvidence(
  plantIds: string[],
): Promise<PhenoCandidateDiaryEvidence> {
  if (plantIds.length === 0) {
    return { quickLogEntriesByPlantId: {}, timelineEventsByPlantId: {}, photosByPlantId: {} };
  }
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase
      .from("diary_entries")
      .select("id, plant_id, entry_at, note, photo_url, details")
      .in("plant_id", plantIds);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query
      .order("entry_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIARY_EVIDENCE_ROW_LIMIT);
  });
  if (error || !data) throw new PhenoEvidenceReadError("diary_entries");
  return mapDiaryRowsToCandidateEvidence(data);
}

/** Latest source-labeled sensor snapshot per tent (bounded to the first 8
 * distinct tents). Best-effort by design: the underlying RPC gates on a
 * four-hour freshness window and resolves to null when no recent snapshot
 * exists — absence renders as "No sensor snapshot", never as a fake value. */
const SENSOR_SNAPSHOT_TENT_CAP = 8;
async function loadTentSnapshots(
  tentIds: readonly (string | null | undefined)[],
): Promise<Record<string, PhenoSensorSnapshotInput | null>> {
  const tents = distinct(tentIds).slice(0, SENSOR_SNAPSHOT_TENT_CAP);
  const entries = await Promise.all(
    tents.map(async (tentId) => {
      try {
        const snapshot = await fetchLatestSensorSnapshot(tentId);
        return [tentId, tentSnapshotToComparisonInput(tentId, snapshot)] as const;
      } catch {
        return [tentId, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Load an id → name map for a table with `id` + `name` columns. Best-effort. */
async function loadNameMap(
  table: "grows" | "tents",
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from(table).select("id, name").in("id", ids);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data as Array<{ id: string; name: string | null }>) {
    if (row.id && typeof row.name === "string") map[row.id] = row.name;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Evidence loaders — RLS-scoped SELECT only, always filtered by hunt_id AND
// plant_id. FAIL CLOSED: a failed read throws PhenoEvidenceReadError so the
// surface renders an honest error + retry. The old {}-on-error behavior made
// a transport failure indistinguishable from "no evidence recorded", which
// src/lib/phenoEvidenceReadError.ts explicitly forbids ("callers must never
// translate one of these failures into an empty evidence map").
// ---------------------------------------------------------------------------

async function loadCandidateScores(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateScoreEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_candidate_scores")
    .select("plant_id, traits, note")
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) throw new PhenoEvidenceReadError("candidate_scores");
  const map: Record<string, PhenoHuntCandidateScoreEvidence> = {};
  for (const row of data) {
    if (!row.plant_id || map[row.plant_id]) continue;
    const traits =
      row.traits && typeof row.traits === "object" && !Array.isArray(row.traits)
        ? (row.traits as Record<string, number>)
        : null;
    map[row.plant_id] = { traits, note: typeof row.note === "string" ? row.note : null };
  }
  return map;
}

async function loadSmokeTests(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateSmokeEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_smoke_tests")
    .select(
      "plant_id, flavor_descriptors, effect_descriptors, smoothness, potency_impression, verdict",
    )
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) throw new PhenoEvidenceReadError("smoke_tests");
  const map: Record<string, PhenoHuntCandidateSmokeEvidence> = {};
  for (const row of data) {
    if (!row.plant_id || map[row.plant_id]) continue;
    map[row.plant_id] = {
      flavorDescriptors: Array.isArray(row.flavor_descriptors)
        ? (row.flavor_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      effectDescriptors: Array.isArray(row.effect_descriptors)
        ? (row.effect_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      smoothness: typeof row.smoothness === "number" ? row.smoothness : null,
      potencyImpression: typeof row.potency_impression === "number" ? row.potency_impression : null,
      verdict: typeof row.verdict === "string" ? row.verdict : null,
    };
  }
  return map;
}

/** Prefer COA > estimate > unspecified when multiple lab rows exist per plant. */
const LAB_SOURCE_RANK: Record<string, number> = { coa: 3, estimate: 2, unspecified: 1 };
function normalizeLabSource(v: unknown): "coa" | "estimate" | "unspecified" {
  return v === "coa" || v === "estimate" ? v : "unspecified";
}

async function loadLabResults(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateLabEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_lab_results")
    .select(
      "plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes, tested_at",
    )
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) throw new PhenoEvidenceReadError("lab_results");
  const map: Record<string, PhenoHuntCandidateLabEvidence> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    const source = normalizeLabSource(row.source);
    const existing = map[row.plant_id];
    if (existing && LAB_SOURCE_RANK[existing.source] >= LAB_SOURCE_RANK[source]) continue;
    const terps = Array.isArray(row.dominant_terpenes)
      ? (row.dominant_terpenes
          .filter(
            (t): t is { name: string; pct?: number | null } =>
              !!t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string",
          )
          .map((t) => ({
            name: (t as { name: string }).name,
            pct:
              typeof (t as { pct?: unknown }).pct === "number"
                ? ((t as { pct: number }).pct as number)
                : null,
          })) as ReadonlyArray<{ name: string; pct: number | null }>)
      : null;
    map[row.plant_id] = {
      thcPct: typeof row.thc_pct === "number" ? row.thc_pct : null,
      cbdPct: typeof row.cbd_pct === "number" ? row.cbd_pct : null,
      totalCannabinoidsPct:
        typeof row.total_cannabinoids_pct === "number" ? row.total_cannabinoids_pct : null,
      dominantTerpenes: terps,
      source,
      testedAt: typeof row.tested_at === "string" ? row.tested_at : null,
    };
  }
  return map;
}

// ===========================================================================
// Bounded, server-paginated candidate reads (Pheno Hunt scale-up).
//
// The workspace candidate list is the one read that was still unbounded (the
// 2026-07-09 wave already capped every other list). These functions read a
// single BOUNDED page of candidates — server-ordered deterministically
// (candidate_number NULLS LAST, label, name, id), server-filtered, and counted
// honestly (count: "exact") — and fetch evidence ONLY for that page's plants.
// Filters that live in other tables (keeper decision, sex) are pushed to the
// server by intersecting candidate ids with the matching plant-id set, so the
// total stays honest at scale. Readiness (a pure computed model over many
// tables) cannot be a server WHERE and is refined client-side by the caller.
// ===========================================================================

export interface PhenoCandidatePageFilters {
  /** Free text — matches candidate_label / plant name / candidate_number. */
  readonly text?: string;
  readonly strain?: string;
  readonly stage?: string;
  /** keeper decision: keep | cull | hold | undecided. */
  readonly decision?: string;
  /** latest sex observation: female | male | hermaphrodite | unknown. */
  readonly sex?: string;
}

export interface LoadPhenoHuntCandidatePageInput {
  readonly huntId: string;
  /** 0-based page index. */
  readonly page: number;
  readonly pageSize: number;
  readonly filters?: PhenoCandidatePageFilters;
}

export type LoadPhenoHuntCandidatePageResult =
  | {
      ok: true;
      candidates: PhenoCandidateInput[];
      /** Honest server total for the active filters, or null if unavailable. */
      total: number | null;
      page: number;
      pageSize: number;
    }
  | { ok: false; error: string };

const DECIDED_DECISIONS = ["keep", "cull", "hold"];
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;

/** Strip PostgREST filter-significant characters from free-text search input. */
function sanitizeSearchText(text: string): string {
  return text
    .replace(/[,()"'.*%\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Load just the hunt summary (no candidates) — used once per workspace mount. */
export async function loadPhenoHuntSummary(
  huntId: string,
): Promise<{ ok: true; hunt: PhenoHuntSummary } | { ok: false; error: string }> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return { ok: false, error: "Missing hunt id." };
  const { data, error } = await supabase.from("pheno_hunts").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "Could not load this pheno hunt." };
  if (!data) return { ok: false, error: "Pheno hunt not found." };
  return { ok: true, hunt: mapHuntSummary(data) };
}

/** Candidate plant ids in this hunt whose keeper decision is one of `decisions`. */
async function plantIdsWithDecision(huntId: string, decisions: string[]): Promise<string[]> {
  const { data, error } = await phenoDb
    .from("pheno_keeper_decisions")
    .select("plant_id, decision")
    .eq("hunt_id", huntId)
    .in("decision", decisions)
    .limit(5000);
  if (error || !data) return [];
  return data
    .map((r) => r.plant_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Load one bounded, deterministically-ordered page of hunt candidates. */
export async function loadPhenoHuntCandidatePage(
  input: LoadPhenoHuntCandidatePageInput,
): Promise<LoadPhenoHuntCandidatePageResult> {
  const id = typeof input.huntId === "string" ? input.huntId.trim() : "";
  if (!id) return { ok: false, error: "Missing hunt id." };
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(input.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const page = Number.isInteger(input.page) && input.page >= 0 ? input.page : 0;
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const filters = input.filters ?? {};

  const text = typeof filters.text === "string" ? sanitizeSearchText(filters.text) : "";
  const strain = typeof filters.strain === "string" ? sanitizeSearchText(filters.strain) : "";
  const stage = typeof filters.stage === "string" ? filters.stage.trim() : "";

  // Keeper-decision filter — honest at scale via candidate-id intersection.
  let includedDecisionIds: string[] | null = null;
  let excludedDecisionIds: string[] | null = null;
  if (filters.decision) {
    if (filters.decision === "undecided") {
      const decidedIds = await plantIdsWithDecision(id, DECIDED_DECISIONS);
      if (decidedIds.length > 0) excludedDecisionIds = decidedIds;
    } else {
      includedDecisionIds = await plantIdsWithDecision(id, [filters.decision]);
    }
  }

  // Sex filter — via the bounded latest-per-plant view.
  let sexIds: string[] | null = null;
  if (filters.sex) {
    const latest = await listLatestSexObservationsForHunt(id);
    sexIds = Object.values(latest)
      .filter((r) => r.sex === filters.sex)
      .map((r) => r.plantId);
  }

  const runCandidateQuery = async (includeCandidateNumber: boolean) => {
    let query = phenoDb
      .from("plants")
      .select(
        includeCandidateNumber
          ? PHENO_CANDIDATE_PLANT_COLUMNS
          : LEGACY_PHENO_CANDIDATE_PLANT_COLUMNS,
        { count: "exact" },
      )
      .eq("pheno_hunt_id", id)
      .eq("is_archived", false);

    if (text) {
      const parts = [`candidate_label.ilike.*${text}*`, `name.ilike.*${text}*`];
      const asNumber = Number(text);
      if (includeCandidateNumber && Number.isInteger(asNumber) && asNumber > 0) {
        parts.push(`candidate_number.eq.${asNumber}`);
      }
      query = query.or(parts.join(","));
    }
    if (strain) query = query.ilike("strain", `%${strain}%`);
    if (stage) query = query.eq("stage", stage);
    if (excludedDecisionIds) {
      query = query.not("id", "in", `(${excludedDecisionIds.join(",")})`);
    }
    if (includedDecisionIds) query = query.in("id", includedDecisionIds);
    if (sexIds) query = query.in("id", sexIds);

    if (includeCandidateNumber) {
      query = query.order("candidate_number", { ascending: true, nullsFirst: false });
    }
    return query
      .order("candidate_label", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  };

  let candidateRead = await runCandidateQuery(true);
  if (isCandidateNumberColumnUnavailable(candidateRead.error)) {
    candidateRead = await runCandidateQuery(false);
  }
  const { data: plantRows, error: plantsError, count } = candidateRead;
  if (plantsError) return { ok: false, error: "Could not load hunt candidates." };

  const plants = (plantRows ?? []) as unknown as PhenoHuntCandidatePlantRow[];
  const plantIds = plants
    .map((p) => p.id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  let scoreByPlantId: Record<string, PhenoHuntCandidateScoreEvidence>;
  let smokeTestByPlantId: Record<string, PhenoHuntCandidateSmokeEvidence>;
  let labResultByPlantId: Record<string, PhenoHuntCandidateLabEvidence>;
  let growNameById: Record<string, string>;
  let tentNameById: Record<string, string>;
  let diaryEvidence: PhenoCandidateDiaryEvidence;
  try {
    [
      growNameById,
      tentNameById,
      scoreByPlantId,
      smokeTestByPlantId,
      labResultByPlantId,
      diaryEvidence,
    ] = await Promise.all([
      loadNameMap("grows", distinct(plants.map((p) => p.grow_id))),
      loadNameMap("tents", distinct(plants.map((p) => p.tent_id))),
      loadCandidateScores(id, plantIds),
      loadSmokeTests(id, plantIds),
      loadLabResults(id, plantIds),
      // Canonical diary evidence for THIS page's plants — satisfies the
      // "Diary / Quick Log observation" readiness goal from real entries.
      // (Sensor snapshots stay on the compare path, whose UI renders them.)
      loadCandidateDiaryEvidence(plantIds),
    ]);
  } catch (readError) {
    // Fail closed (see the evidence-loader note above).
    if (readError instanceof PhenoEvidenceReadError) {
      return { ok: false, error: readError.message };
    }
    throw readError;
  }

  const candidates = adaptPhenoHuntCandidates({
    plants,
    growNameById,
    tentNameById,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
    quickLogEntriesByPlantId: diaryEvidence.quickLogEntriesByPlantId,
    timelineEventsByPlantId: diaryEvidence.timelineEventsByPlantId,
    photosByPlantId: diaryEvidence.photosByPlantId,
    preserveOrder: true,
  });

  return {
    ok: true,
    candidates,
    total: typeof count === "number" ? count : null,
    page,
    pageSize,
  };
}

/**
 * Hunt-wide comparison-readiness signals computed from BOUNDED reads (candidate
 * ids + notes + decisions + smoke content — never the full evidence set). Feeds
 * the pure buildPhenoComparisonActionState gate so the workspace never has to
 * hold every candidate in memory to know whether the hunt is comparison-ready.
 */
export interface PhenoHuntComparisonSummary {
  readonly candidateCount: number;
  readonly allCandidatesHaveNote: boolean;
  readonly anyPostHarvest: boolean;
  readonly anyPostCure: boolean;
}

export async function loadPhenoHuntComparisonSummary(
  huntId: string,
): Promise<PhenoHuntComparisonSummary> {
  const empty: PhenoHuntComparisonSummary = {
    candidateCount: 0,
    allCandidatesHaveNote: false,
    anyPostHarvest: false,
    anyPostCure: false,
  };
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return empty;

  const [idsRes, scoresRes, decisionsRes, smokeRes] = await Promise.all([
    phenoDb
      .from("plants")
      .select("id")
      .eq("pheno_hunt_id", id)
      .eq("is_archived", false)
      .limit(5000),
    phenoDb.from("pheno_candidate_scores").select("plant_id, note").eq("hunt_id", id).limit(5000),
    phenoDb
      .from("pheno_keeper_decisions")
      .select("plant_id, decision, note")
      .eq("hunt_id", id)
      .limit(5000),
    phenoDb
      .from("pheno_smoke_tests")
      .select("plant_id, verdict, flavor_descriptors, effect_descriptors")
      .eq("hunt_id", id)
      .limit(5000),
  ]);

  // Fail closed: a failed read must not resolve to candidateCount 0 /
  // anyPostHarvest false — unknown is not zero. The workspace mount effect
  // catches this and renders its honest error state.
  if (idsRes.error) throw new Error("Could not load hunt candidates.");
  if (scoresRes.error) throw new PhenoEvidenceReadError("candidate_scores");
  if (decisionsRes.error) throw new PhenoEvidenceReadError("keeper_decisions");
  if (smokeRes.error) throw new PhenoEvidenceReadError("smoke_tests");

  const candidateIds = new Set(
    (idsRes.data ?? [])
      .map((r) => r.id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  const candidateCount = candidateIds.size;

  const noted = new Set<string>();
  for (const row of scoresRes.data ?? []) {
    const pid = row.plant_id;
    if (
      typeof pid === "string" &&
      candidateIds.has(pid) &&
      typeof row.note === "string" &&
      row.note.trim()
    ) {
      noted.add(pid);
    }
  }
  let anyPostHarvest = false;
  for (const row of decisionsRes.data ?? []) {
    const pid = row.plant_id;
    if (typeof pid !== "string" || !candidateIds.has(pid)) continue;
    if (typeof row.note === "string" && row.note.trim()) noted.add(pid);
    if (typeof row.decision === "string" && row.decision !== "undecided") anyPostHarvest = true;
  }
  let anyPostCure = false;
  for (const row of smokeRes.data ?? []) {
    const pid = row.plant_id;
    if (typeof pid !== "string" || !candidateIds.has(pid)) continue;
    const hasContent =
      (typeof row.verdict === "string" && row.verdict.trim().length > 0) ||
      (Array.isArray(row.flavor_descriptors) && row.flavor_descriptors.length > 0) ||
      (Array.isArray(row.effect_descriptors) && row.effect_descriptors.length > 0);
    if (hasContent) anyPostCure = true;
  }

  return {
    candidateCount,
    allCandidatesHaveNote: candidateCount > 0 && noted.size >= candidateCount,
    anyPostHarvest,
    anyPostCure,
  };
}
