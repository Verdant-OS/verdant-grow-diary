/** Pure, deterministic diary-to-QuickLog enrichment for Pheno receipts. */
import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";
import {
  PHENO_EVIDENCE_RECEIPT_KIND,
  parsePhenoEvidenceReceiptRow,
  type ParsedPhenoEvidenceReceipt,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";

export type PhenoEvidenceReceiptIndex = ReadonlyMap<string, ParsedPhenoEvidenceReceipt>;

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function indexKey(
  plantId: string | null | undefined,
  tentId: string | null | undefined,
  iso: string,
) {
  return `${plantId ?? ""}|${tentId ?? ""}|${iso}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildPhenoEvidenceReceiptIndex(
  diaryRows: ReadonlyArray<RawPhenoEvidenceDiaryRow> | null | undefined,
): PhenoEvidenceReceiptIndex {
  const index = new Map<string, ParsedPhenoEvidenceReceipt>();
  const orderedRows = [...(diaryRows ?? [])].sort((a, b) => {
    const aTimestamp = Date.parse(a.entry_at);
    const bTimestamp = Date.parse(b.entry_at);
    if (Number.isFinite(aTimestamp) && Number.isFinite(bTimestamp) && aTimestamp !== bTimestamp) {
      return bTimestamp - aTimestamp;
    }
    if (Number.isFinite(aTimestamp) !== Number.isFinite(bTimestamp)) {
      return Number.isFinite(aTimestamp) ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  for (const row of orderedRows) {
    const details = record(row.details);
    if (!details || details.kind !== PHENO_EVIDENCE_RECEIPT_KIND) continue;
    if (typeof details.hunt_id !== "string" || typeof details.plant_id !== "string") continue;
    const parsed = parsePhenoEvidenceReceiptRow(row, {
      huntId: details.hunt_id,
      plantId: details.plant_id,
    });
    const iso = normalizeIso(row.entry_at);
    if (!parsed || !iso) continue;
    const key = indexKey(row.plant_id, row.tent_id, iso);
    if (!index.has(key)) index.set(key, parsed);
  }
  return index;
}

export function attachPhenoEvidenceReceiptsToActionEvents(
  actions: ReadonlyArray<QuickLogActionEvent>,
  index: PhenoEvidenceReceiptIndex,
): QuickLogActionEvent[] {
  if (index.size === 0) return [...actions];
  return actions.map((action) => {
    if (action.kind !== "note") return action;
    const iso = normalizeIso(action.occurredAt);
    if (!iso) return action;
    const receipt = index.get(indexKey(action.plantId, action.tentId, iso));
    return receipt ? { ...action, phenoEvidenceReceipt: receipt } : action;
  });
}
