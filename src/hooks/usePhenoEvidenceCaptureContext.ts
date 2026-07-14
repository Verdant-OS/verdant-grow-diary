/**
 * Read-only Pheno evidence capture context for the selected Quick Log plant.
 * Hunt ownership and diary ownership are enforced by existing RLS policies.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PHENO_EVIDENCE_RECEIPT_KIND,
  buildPhenoEvidenceCoverage,
  type PhenoEvidenceCoverage,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";

export const PHENO_EVIDENCE_CAPTURE_RECEIPT_LIMIT = 200;

export interface PhenoEvidenceCaptureContext {
  readonly huntId: string;
  readonly huntName: string;
  readonly plantId: string;
  readonly coverage: PhenoEvidenceCoverage;
}

export interface UsePhenoEvidenceCaptureContextResult {
  readonly status: "disabled" | "loading" | "ready" | "error";
  readonly context: PhenoEvidenceCaptureContext | null;
}

async function loadPhenoEvidenceCaptureContext(
  huntId: string,
  plantId: string,
): Promise<PhenoEvidenceCaptureContext> {
  const { data: hunt, error: huntError } = await supabase
    .from("pheno_hunts")
    .select("id, name, evidence_goals")
    .eq("id", huntId)
    .maybeSingle();

  if (huntError || !hunt) {
    throw new Error("pheno_hunt_unavailable");
  }

  const { data: diaryRows, error: diaryError } = await supabase
    .from("diary_entries")
    .select("id, plant_id, tent_id, grow_id, entry_at, photo_url, details")
    .eq("plant_id", plantId)
    .eq("details->>kind" as never, PHENO_EVIDENCE_RECEIPT_KIND as never)
    .order("entry_at", { ascending: false })
    .limit(PHENO_EVIDENCE_CAPTURE_RECEIPT_LIMIT);

  if (diaryError) {
    throw new Error("pheno_evidence_receipts_unavailable");
  }

  return {
    huntId: hunt.id,
    huntName: hunt.name,
    plantId,
    coverage: buildPhenoEvidenceCoverage({
      configuredGoals: hunt.evidence_goals,
      diaryRows: (diaryRows ?? []) as unknown as RawPhenoEvidenceDiaryRow[],
      huntId,
      plantId,
    }),
  };
}

export function usePhenoEvidenceCaptureContext(
  huntId: string | null,
  plantId: string | null,
): UsePhenoEvidenceCaptureContextResult {
  const enabled = Boolean(huntId && plantId);
  const query = useQuery({
    queryKey: ["pheno_evidence_receipts", huntId, plantId],
    enabled,
    queryFn: () => loadPhenoEvidenceCaptureContext(huntId!, plantId!),
  });

  if (!enabled) return { status: "disabled", context: null };
  if (query.isLoading) return { status: "loading", context: null };
  if (query.isError || !query.data) return { status: "error", context: null };
  return { status: "ready", context: query.data };
}
