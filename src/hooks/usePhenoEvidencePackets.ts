/**
 * usePhenoEvidencePackets — batched, bounded manual-evidence packets for the
 * currently loaded candidate page or selected comparison cohort.
 *
 * Read-only. One batch query per (hunt, id-set); no per-candidate queries.
 * The query key lives under the existing `pheno_evidence_receipts` family, so
 * a successful Quick Log save (quickLogV2RefreshRules ALWAYS_KEYS) refreshes
 * workspace/comparison coverage without a reload. Stale responses are dropped
 * structurally: hunt or id-set changes produce a different query key, and
 * packets are derived from the key-matched result only.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  loadPhenoEvidenceReceiptRows,
  type LoadPhenoEvidenceReceiptRowsResult,
} from "@/lib/phenoEvidenceReceiptService";
import {
  buildPhenoEvidencePackets,
  type PhenoCandidateEvidencePacket,
} from "@/lib/phenoEvidencePacket";

export type PhenoEvidencePacketsStatus = "disabled" | "loading" | "ready" | "error";

export interface UsePhenoEvidencePacketsResult {
  readonly status: PhenoEvidencePacketsStatus;
  /** plantId → packet for every requested candidate (ready OR error: on
   * error every packet is state "unavailable" so presenters stay honest). */
  readonly packets: ReadonlyMap<string, PhenoCandidateEvidencePacket>;
  /** True when the batch read was truncated (id cap or row cap). */
  readonly truncated: boolean;
}

const EMPTY_PACKETS: ReadonlyMap<string, PhenoCandidateEvidencePacket> = new Map();

export function usePhenoEvidencePackets(input: {
  huntId: string | null | undefined;
  plantIds: ReadonlyArray<string>;
  configuredGoals: unknown;
}): UsePhenoEvidencePacketsResult {
  const huntId =
    typeof input.huntId === "string" && input.huntId.trim().length > 0
      ? input.huntId.trim()
      : null;

  // Deterministic key part: dedupe + sort so the same id-set (in any order)
  // shares one cached batch, and any membership change forms a new key.
  const idsKey = useMemo(() => {
    const seen = new Set<string>();
    for (const raw of input.plantIds ?? []) {
      if (typeof raw === "string" && raw.trim().length > 0) seen.add(raw.trim());
    }
    return Array.from(seen).sort().join(",");
  }, [input.plantIds]);

  const enabled = Boolean(huntId) && idsKey.length > 0;

  const query = useQuery<LoadPhenoEvidenceReceiptRowsResult>({
    queryKey: ["pheno_evidence_receipts", "packets", huntId, idsKey],
    enabled,
    queryFn: () =>
      loadPhenoEvidenceReceiptRows({ huntId: huntId!, plantIds: idsKey.split(",") }),
  });

  const result = query.data ?? null;
  const loadFailed = query.isError || (result !== null && result.ok === false);

  const packets = useMemo(() => {
    if (!enabled || !huntId) return EMPTY_PACKETS;
    const plantIds = idsKey.split(",");
    if (loadFailed) {
      // Fail closed but stay renderable: every candidate gets an explicit
      // "unavailable" packet rather than a missing entry.
      return buildPhenoEvidencePackets({
        huntId,
        plantIds,
        configuredGoals: input.configuredGoals,
        rows: [],
        unavailable: true,
      });
    }
    if (!result || result.ok !== true) return EMPTY_PACKETS;
    return buildPhenoEvidencePackets({
      huntId,
      plantIds,
      configuredGoals: input.configuredGoals,
      rows: result.rows,
      truncated: result.truncated,
    });
    // idsKey is the deduped/sorted derivation of plantIds used in the fetch.
  }, [enabled, huntId, idsKey, loadFailed, result, input.configuredGoals]);

  if (!enabled) return { status: "disabled", packets: EMPTY_PACKETS, truncated: false };
  if (query.isLoading) return { status: "loading", packets: EMPTY_PACKETS, truncated: false };
  if (loadFailed) return { status: "error", packets, truncated: false };
  return {
    status: "ready",
    packets,
    truncated: result !== null && result.ok === true ? result.truncated : false,
  };
}
