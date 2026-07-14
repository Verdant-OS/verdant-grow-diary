/**
 * phenoEvidenceReceiptService — bounded, batched read of manual Pheno
 * evidence receipts (PR #231's `pheno_evidence_receipt` diary rows) for the
 * currently loaded candidate page or selected comparison cohort.
 *
 * SELECT only. RLS scopes rows to the signed-in grower (`diary_entries`
 * owner-only policies) — no client-supplied owner id is accepted or sent.
 * One batched query per call; never one query per candidate.
 *
 * Boundedness is explicit and honest:
 *  - plant ids are deduplicated and hard-capped; extras are dropped and the
 *    result is marked truncated (never silently treated as covered);
 *  - rows are hard-capped; hitting the cap marks the result truncated.
 * Every returned row is still re-validated by the strict receipt parser in
 * the pure packet model — this service filters for efficiency, not trust.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  PHENO_EVIDENCE_RECEIPT_KIND,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";

/** Max candidates per batch read (≥ one workspace page, cohort max 6). */
export const PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS = 60;
/** Hard cap on rows returned by one batch read. */
export const PHENO_EVIDENCE_PACKET_ROW_CAP = 1000;

export type LoadPhenoEvidenceReceiptRowsResult =
  | {
      ok: true;
      rows: RawPhenoEvidenceDiaryRow[];
      /** Ids actually queried (deduplicated, capped, input order). */
      plantIds: string[];
      /** True when the plant-id cap OR the row cap was hit. */
      truncated: boolean;
      /**
       * True when the plant-id cap dropped candidates: some requested ids were
       * NEVER queried. Callers must treat those dropped ids as coverage-unknown
       * (unavailable), never as zero evidence.
       */
      idCapHit: boolean;
      /**
       * True when the row cap was hit: the candidates that WERE queried may be
       * undercounted, so their coverage is truncated (never promoted to
       * complete). Independent of the plant-id cap.
       */
      rowCapHit: boolean;
    }
  | { ok: false; error: string };

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

/**
 * Load receipt rows for a hunt + bounded plant-id list in ONE query.
 * Ordering is stable: `entry_at` desc then row id asc.
 */
export async function loadPhenoEvidenceReceiptRows(input: {
  huntId: string;
  plantIds: ReadonlyArray<string>;
}): Promise<LoadPhenoEvidenceReceiptRowsResult> {
  const huntId = boundedId(input.huntId);
  if (!huntId) return { ok: false, error: "Missing hunt id." };

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of input.plantIds ?? []) {
    const id = boundedId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  if (deduped.length === 0) return { ok: false, error: "No candidates to load." };

  const idCapHit = deduped.length > PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS;
  const plantIds = idCapHit ? deduped.slice(0, PHENO_EVIDENCE_PACKET_MAX_PLANT_IDS) : deduped;

  // The generated types don't model JSON-path filters, so the two
  // `details->>…` filters use the same sanctioned `as never` cast as the
  // existing single-plant read in usePhenoEvidenceCaptureContext.
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, plant_id, tent_id, grow_id, entry_at, photo_url, details")
    .in("plant_id", plantIds)
    .eq("details->>kind" as never, PHENO_EVIDENCE_RECEIPT_KIND as never)
    .eq("details->>hunt_id" as never, huntId as never)
    .order("entry_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(PHENO_EVIDENCE_PACKET_ROW_CAP);

  if (error) return { ok: false, error: "Could not load manual evidence receipts." };

  const rows = (data ?? []) as unknown as RawPhenoEvidenceDiaryRow[];
  const rowCapHit = rows.length >= PHENO_EVIDENCE_PACKET_ROW_CAP;
  return {
    ok: true,
    rows,
    plantIds,
    truncated: idCapHit || rowCapHit,
    idCapHit,
    rowCapHit,
  };
}
