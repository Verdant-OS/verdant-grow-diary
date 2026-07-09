/**
 * phenoLabResultsService — RLS-scoped read/write for COA lab numbers
 * (pheno_lab_results): cannabinoids + dominant terpenes, source-tagged.
 *
 * HONEST: source is required and never defaulted to 'coa' (only what the grower
 * enters); "lab verified" is true only when source = 'coa'; absent numbers are
 * flagged, never fabricated. RLS: owner + owns hunt + owns plant + candidate
 * consistency. No service_role, no AI, no automation.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import type { Json } from "@/integrations/supabase/types";

export const PHENO_LAB_SOURCES = ["coa", "estimate", "unspecified"] as const;
export type PhenoLabSource = (typeof PHENO_LAB_SOURCES)[number];

export interface TerpeneReading {
  readonly name: string;
  readonly pct: number | null;
}

export interface LabResultRow {
  readonly plantId: string;
  readonly source: PhenoLabSource;
  readonly thcPct: number | null;
  readonly cbdPct: number | null;
  readonly totalCannabinoidsPct: number | null;
  readonly dominantTerpenes: readonly TerpeneReading[];
  readonly labVerified: boolean;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function normalizeSource(v: unknown): PhenoLabSource {
  return typeof v === "string" && (PHENO_LAB_SOURCES as readonly string[]).includes(v)
    ? (v as PhenoLabSource)
    : "unspecified";
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function terpenes(v: unknown): TerpeneReading[] {
  if (!Array.isArray(v)) return [];
  const out: TerpeneReading[] = [];
  for (const t of v) {
    if (t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string") {
      const name = (t as { name: string }).name.trim();
      if (name) out.push({ name, pct: finiteOrNull((t as { pct?: unknown }).pct) });
    }
  }
  return out;
}

/** Upsert one COA/estimate row for a candidate (one per hunt+plant+source). */
export async function upsertLabResult(input: {
  huntId: string;
  plantId: string;
  source: PhenoLabSource;
  thcPct?: number | null;
  cbdPct?: number | null;
  totalCannabinoidsPct?: number | null;
  dominantTerpenes?: readonly TerpeneReading[];
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save lab results." };
  const source = normalizeSource(input.source);
  const { error } = await phenoDb.from("pheno_lab_results").upsert(
    {
      user_id: userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      source,
      thc_pct: finiteOrNull(input.thcPct),
      cbd_pct: finiteOrNull(input.cbdPct),
      total_cannabinoids_pct: finiteOrNull(input.totalCannabinoidsPct),
      dominant_terpenes: (input.dominantTerpenes ?? []).map((t) => ({
        name: t.name,
        pct: t.pct,
      })) as unknown as Json,
    },
    { onConflict: "hunt_id,plant_id,source" },
  );
  if (error) return { ok: false, error: "Could not save lab results." };
  return { ok: true };
}

/** Load lab results for a hunt, keyed "plantId:source". RLS-scoped read. */
export async function listLabResultsForHunt(huntId: string): Promise<Record<string, LabResultRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  const { data, error } = await phenoDb
    .from("pheno_lab_results")
    .select("plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes")
    .eq("hunt_id", id)
    // Up to 3 rows per candidate (coa/estimate/unspecified); explicit bound
    // keeps large hunts from hitting the server's silent row ceiling.
    .limit(1500);
  if (error || !data) return {};
  const map: Record<string, LabResultRow> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    const source = normalizeSource(row.source);
    map[`${row.plant_id}:${source}`] = {
      plantId: row.plant_id,
      source,
      thcPct: finiteOrNull(row.thc_pct),
      cbdPct: finiteOrNull(row.cbd_pct),
      totalCannabinoidsPct: finiteOrNull(row.total_cannabinoids_pct),
      dominantTerpenes: terpenes(row.dominant_terpenes),
      labVerified: source === "coa",
    };
  }
  return map;
}
