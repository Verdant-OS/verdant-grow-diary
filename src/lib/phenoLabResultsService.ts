/**
 * phenoLabResultsService — RLS-scoped read/write for COA lab numbers
 * (pheno_lab_results): cannabinoids + dominant terpenes, source-tagged, with
 * the test date and a free note.
 *
 * HONEST: source is required and never defaulted to 'coa' (only what the grower
 * enters); "lab verified" is true only when source = 'coa'; absent numbers are
 * flagged, never fabricated; percentages are validated to 0–100 before a write
 * (an impossible potency is rejected, not stored). RLS: owner + owns hunt +
 * owns plant + candidate consistency. No service_role, no AI, no automation.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import type { Json } from "@/integrations/supabase/types";
import { PhenoEvidenceReadError } from "@/lib/phenoEvidenceReadError";

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
  /** ISO date the sample was tested, when the grower recorded it. */
  readonly testedAt: string | null;
  readonly note: string | null;
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

/**
 * True when the row carries at least one real value (a cannabinoid number, a
 * terpene, a test date, or a note). An all-empty row is NOT lab evidence and
 * must never satisfy an evidence goal — missing data stays missing.
 */
export function labResultHasAnyValue(
  row:
    | Pick<
        LabResultRow,
        "thcPct" | "cbdPct" | "totalCannabinoidsPct" | "dominantTerpenes" | "testedAt" | "note"
      >
    | null
    | undefined,
): boolean {
  if (!row) return false;
  return (
    row.thcPct !== null ||
    row.cbdPct !== null ||
    row.totalCannabinoidsPct !== null ||
    (row.dominantTerpenes?.length ?? 0) > 0 ||
    (typeof row.testedAt === "string" && row.testedAt.length > 0) ||
    (typeof row.note === "string" && row.note.trim().length > 0)
  );
}

/**
 * Best available lab row for a plant from a "plantId:source"-keyed map:
 * the highest-provenance row THAT CARRIES A VALUE (coa > estimate >
 * unspecified), falling back to plain provenance order when every row is
 * empty. Legacy all-empty COA rows exist (the old editor allowed empty
 * saves), and an empty row must never shadow a populated lower-provenance
 * one. Presenters must still label the row's OWN source — "best available"
 * never upgrades an estimate to lab-verified.
 */
export function bestLabResultForPlant(
  labByKey: Readonly<Record<string, LabResultRow>>,
  plantId: string,
): LabResultRow | undefined {
  const bySource = [
    labByKey[`${plantId}:coa`],
    labByKey[`${plantId}:estimate`],
    labByKey[`${plantId}:unspecified`],
  ];
  return bySource.find((row) => labResultHasAnyValue(row)) ?? bySource.find((row) => row != null);
}

/** A percentage is 0–100 or absent. Anything else is invalid, never stored. */
function invalidPct(v: number | null | undefined): boolean {
  return v != null && (!Number.isFinite(v) || v < 0 || v > 100);
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
  testedAt?: string | null;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save lab results." };
  if (
    invalidPct(input.thcPct) ||
    invalidPct(input.cbdPct) ||
    invalidPct(input.totalCannabinoidsPct) ||
    (input.dominantTerpenes ?? []).some((t) => invalidPct(t.pct))
  ) {
    return { ok: false, error: "Percentages must be between 0 and 100." };
  }
  const source = normalizeSource(input.source);
  const testedAt =
    typeof input.testedAt === "string" && input.testedAt.trim() ? input.testedAt.trim() : null;
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
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
      tested_at: testedAt,
      note,
    },
    { onConflict: "hunt_id,plant_id,source" },
  );
  if (error) return { ok: false, error: "Could not save lab results." };
  return { ok: true };
}

/**
 * Delete one lab row (hunt+plant+source). The undo path for an accidental
 * save — without it an empty row would sit forever on the candidate's record.
 * RLS scopes the delete to the owner's own rows.
 */
export async function deleteLabResult(input: {
  huntId: string;
  plantId: string;
  source: PhenoLabSource;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to change lab results." };
  const { error } = await phenoDb
    .from("pheno_lab_results")
    .delete()
    .eq("hunt_id", input.huntId)
    .eq("plant_id", input.plantId)
    .eq("source", normalizeSource(input.source));
  if (error) return { ok: false, error: "Could not remove this lab row." };
  return { ok: true };
}

/** Load lab results for a hunt, keyed "plantId:source". RLS-scoped read. */
export async function listLabResultsForHunt(
  huntId: string,
  plantIds?: readonly string[],
): Promise<Record<string, LabResultRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  let query = phenoDb
    .from("pheno_lab_results")
    .select(
      "plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes, tested_at, note",
    )
    .eq("hunt_id", id);
  // Page-scoped read: fetch only the visible candidates' lab results at scale.
  if (plantIds && plantIds.length > 0) query = query.in("plant_id", plantIds as string[]);
  const { data, error } = await query
    // Up to 3 rows per candidate (coa/estimate/unspecified); explicit bound
    // keeps large hunts from hitting the server's silent row ceiling.
    .limit(1500);
  if (error || !data) throw new PhenoEvidenceReadError("lab_results");
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
      testedAt: typeof row.tested_at === "string" ? row.tested_at : null,
      note: typeof row.note === "string" ? row.note : null,
      labVerified: source === "coa",
    };
  }
  return map;
}
