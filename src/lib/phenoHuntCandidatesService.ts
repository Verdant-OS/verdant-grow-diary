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
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import { listLatestSexObservationsForHunt } from "@/lib/phenoSexObservationService";

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
}

export type LoadPhenoHuntCandidatesResult =
  | { ok: true; hunt: PhenoHuntSummary; candidates: PhenoCandidateInput[] }
  | { ok: false; error: string };

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
  const { data: plantRows, error: plantsError } = await phenoDb
    .from("plants")
    .select(
      "id, name, candidate_label, candidate_number, strain, stage, grow_id, tent_id, photo_url, is_archived",
    )
    .eq("pheno_hunt_id", id)
    .eq("is_archived", false);

  if (plantsError) return { ok: false, error: "Could not load hunt candidates." };

  const plants = (plantRows ?? []) as PhenoHuntCandidatePlantRow[];
  const plantIds = plants
    .map((p) => p.id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  // Independent lookups — one round trip instead of two serial hops on the
  // workspace's critical loading path. Evidence tables are RLS-scoped by
  // hunt_id (and the caller owns the hunt), so cross-hunt / cross-user data
  // never reaches this map. Requests are scoped by hunt_id AND plant_id so
  // stray orphan rows from a deleted candidate can't leak either.
  const [growNameById, tentNameById, scoreByPlantId, smokeTestByPlantId, labResultByPlantId] =
    await Promise.all([
      loadNameMap("grows", distinct([huntRow.grow_id, ...plants.map((p) => p.grow_id)])),
      loadNameMap("tents", distinct([huntRow.tent_id, ...plants.map((p) => p.tent_id)])),
      loadCandidateScores(id, plantIds),
      loadSmokeTests(id, plantIds),
      loadLabResults(id, plantIds),
    ]);

  const candidates = adaptPhenoHuntCandidates({
    plants,
    growNameById,
    tentNameById,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
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
  return {
    id: huntRow.id,
    name: huntRow.name,
    growId: huntRow.grow_id ?? null,
    tentId: huntRow.tent_id ?? null,
    evidenceGoals,
    notes,
    setupCompletedAt,
  };
}

function distinct(ids: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of ids) if (typeof v === "string" && v.length > 0) out.add(v);
  return Array.from(out);
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
// plant_id. Best-effort: any failure returns an empty map and readiness
// engines simply see "no evidence" (never fake-complete).
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
  if (error || !data) return {};
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
  if (error || !data) return {};
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
    .select("plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes")
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) return {};
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

  let query = phenoDb
    .from("plants")
    .select(
      "id, name, candidate_label, candidate_number, strain, stage, grow_id, tent_id, photo_url, is_archived",
      { count: "exact" },
    )
    .eq("pheno_hunt_id", id)
    .eq("is_archived", false);

  const text = typeof filters.text === "string" ? sanitizeSearchText(filters.text) : "";
  if (text) {
    const parts = [`candidate_label.ilike.*${text}*`, `name.ilike.*${text}*`];
    const asNumber = Number(text);
    if (Number.isInteger(asNumber) && asNumber > 0) parts.push(`candidate_number.eq.${asNumber}`);
    query = query.or(parts.join(","));
  }
  const strain = typeof filters.strain === "string" ? sanitizeSearchText(filters.strain) : "";
  if (strain) query = query.ilike("strain", `%${strain}%`);
  const stage = typeof filters.stage === "string" ? filters.stage.trim() : "";
  if (stage) query = query.eq("stage", stage);

  // Keeper-decision filter — honest at scale via candidate-id intersection.
  if (filters.decision) {
    if (filters.decision === "undecided") {
      const decidedIds = await plantIdsWithDecision(id, DECIDED_DECISIONS);
      if (decidedIds.length > 0) query = query.not("id", "in", `(${decidedIds.join(",")})`);
    } else {
      const ids = await plantIdsWithDecision(id, [filters.decision]);
      query = query.in("id", ids);
    }
  }
  // Sex filter — via the bounded latest-per-plant view.
  if (filters.sex) {
    const latest = await listLatestSexObservationsForHunt(id);
    const ids = Object.values(latest)
      .filter((r) => r.sex === filters.sex)
      .map((r) => r.plantId);
    query = query.in("id", ids);
  }

  query = query
    .order("candidate_number", { ascending: true, nullsFirst: false })
    .order("candidate_label", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

  const { data: plantRows, error: plantsError, count } = await query;
  if (plantsError) return { ok: false, error: "Could not load hunt candidates." };

  const plants = (plantRows ?? []) as PhenoHuntCandidatePlantRow[];
  const plantIds = plants
    .map((p) => p.id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const [growNameById, tentNameById, scoreByPlantId, smokeTestByPlantId, labResultByPlantId] =
    await Promise.all([
      loadNameMap("grows", distinct(plants.map((p) => p.grow_id))),
      loadNameMap("tents", distinct(plants.map((p) => p.tent_id))),
      loadCandidateScores(id, plantIds),
      loadSmokeTests(id, plantIds),
      loadLabResults(id, plantIds),
    ]);

  const candidates = adaptPhenoHuntCandidates({
    plants,
    growNameById,
    tentNameById,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
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
