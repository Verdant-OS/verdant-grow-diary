/**
 * phenoEvidencePacket — pure, deterministic per-candidate manual-evidence
 * packet for the Pheno hunt workspace, comparison cohort, and CSV export.
 *
 * A packet organizes the grower's OWN manual Quick Log receipts (PR #231's
 * `pheno_evidence_receipt` diary rows) against the hunt's configured evidence
 * goals. It is evidence ORGANIZATION only:
 *  - No quality score, rank, recommendation, keeper selection, or "best
 *    candidate" output.
 *  - It is a SEPARATE axis from `phenoCandidateReadiness` (structured,
 *    stage-aware evidence sufficiency). A manual receipt completes its exact
 *    configured coverage category and nothing else — it never fabricates a
 *    trait score, sex observation, keeper decision, harvest result, smoke
 *    test, lab result, or sensor reading, and never promotes a candidate to
 *    comparison_ready.
 *
 * Purity: no I/O, no React, no Supabase, no randomness, and no time reads —
 * receipt freshness labels are STORED at capture time by the receipt parser
 * (fail-closed to "unknown"), so no `now` injection is needed here; nothing
 * in this module recomputes freshness. Malformed, wrong-hunt, wrong-plant,
 * unsupported-version, or unsafe receipts fail closed via
 * `parsePhenoEvidenceReceiptRow`. Unknown/stale/invalid sensor context is
 * carried through honestly and never upgraded to fresh/live.
 */
import {
  buildPhenoEvidenceCoverage,
  sanitizeConfiguredPhenoEvidenceGoals,
  type PhenoEvidenceCoverageItem,
  type PhenoEvidenceFreshness,
  type RawPhenoEvidenceDiaryRow,
} from "@/lib/phenoEvidenceCaptureRules";
import type { PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";

/**
 * Coverage state of one candidate's manual-evidence packet.
 *  - "unavailable": receipts could not be loaded (query error / no context).
 *    Never rendered as zero-recorded, and never as complete.
 *  - "truncated": the bounded batch read hit its hard cap, so coverage may be
 *    undercounted. Fail-closed: truncated is NEVER promoted to complete, even
 *    when every configured goal appears recorded in the rows we did get.
 *  - "complete": every configured goal (>= 1 of them) has at least one valid
 *    receipt.
 *  - "partial": everything else, including a hunt with zero configured goals
 *    (there is nothing recordable, which is not the same as complete).
 */
export type PhenoEvidencePacketState = "complete" | "partial" | "unavailable" | "truncated";

/** Honest aggregate of sensor context across a packet's receipts. */
export interface PhenoEvidencePacketSensorSummary {
  /** Receipts that carried any sensor attachment. */
  readonly attachedReceiptCount: number;
  /** Receipts whose STORED freshness label is "fresh". Never recomputed. */
  readonly freshReceiptCount: number;
  /**
   * Stored freshness label of the newest sensor-attached receipt, or null
   * when no receipt has sensor context. Stale/invalid/unknown stay as-is.
   */
  readonly latestFreshness: PhenoEvidenceFreshness | null;
  /** capturedAt of the newest sensor-attached receipt, or null. */
  readonly latestCapturedAt: string | null;
}

export interface PhenoCandidateEvidencePacket {
  readonly huntId: string;
  readonly plantId: string;
  /** Hunt-configured goals, sanitized, in the hunt's configured order. */
  readonly configuredGoals: ReadonlyArray<PhenoEvidenceGoalId>;
  /** Per-goal coverage in configured order (recorded / count / latest). */
  readonly goals: ReadonlyArray<PhenoEvidenceCoverageItem>;
  readonly configuredGoalCount: number;
  readonly recordedGoalCount: number;
  /** Configured goals with no valid receipt, in configured order. */
  readonly missingGoalIds: ReadonlyArray<PhenoEvidenceGoalId>;
  /** Total valid receipts (duplicates per goal all count here). */
  readonly receiptCount: number;
  /** Packet-level latest observation timestamp (newest receipt), or null. */
  readonly latestEntryAt: string | null;
  /** True when any valid receipt row carried a photo. */
  readonly hasPhotoEvidence: boolean;
  readonly sensor: PhenoEvidencePacketSensorSummary;
  readonly state: PhenoEvidencePacketState;
  /** True when the batch read hit its hard cap (state is "truncated"). */
  readonly truncated: boolean;
}

export interface BuildPhenoEvidencePacketsInput {
  readonly huntId: string;
  /** Plant ids to build packets for. Deduplicated; order preserved. */
  readonly plantIds: ReadonlyArray<string>;
  /** The hunt's configured evidence goals (raw; sanitized here). */
  readonly configuredGoals: unknown;
  /** Raw diary rows from the bounded batch read (any plants, any shape). */
  readonly rows: ReadonlyArray<RawPhenoEvidenceDiaryRow> | null | undefined;
  /** True when the batch read reported truncation at its hard cap. */
  readonly truncated?: boolean;
  /** True when receipts could not be loaded at all (query error). */
  readonly unavailable?: boolean;
}

function dedupePlantIds(ids: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function packetState(input: {
  unavailable: boolean;
  truncated: boolean;
  configuredGoalCount: number;
  recordedGoalCount: number;
}): PhenoEvidencePacketState {
  if (input.unavailable) return "unavailable";
  if (input.truncated) return "truncated";
  if (input.configuredGoalCount > 0 && input.recordedGoalCount === input.configuredGoalCount) {
    return "complete";
  }
  return "partial";
}

/**
 * Build one candidate's packet from already-grouped rows. Rows are re-parsed
 * and re-validated per candidate by `buildPhenoEvidenceCoverage`, so a row
 * for the wrong hunt or wrong plant contributes nothing regardless of how it
 * was grouped upstream.
 */
export function buildPhenoCandidateEvidencePacket(input: {
  huntId: string;
  plantId: string;
  configuredGoals: unknown;
  rows: ReadonlyArray<RawPhenoEvidenceDiaryRow> | null | undefined;
  truncated?: boolean;
  unavailable?: boolean;
}): PhenoCandidateEvidencePacket {
  const unavailable = input.unavailable === true;
  const truncated = !unavailable && input.truncated === true;
  const coverage = buildPhenoEvidenceCoverage({
    configuredGoals: input.configuredGoals,
    diaryRows: unavailable ? [] : (input.rows ?? []),
    huntId: input.huntId,
    plantId: input.plantId,
  });

  // Receipts arrive newest-first (entry_at desc, id tie-break) from coverage.
  const newest = coverage.receipts.length > 0 ? coverage.receipts[0] : null;
  const sensorAttached = coverage.receipts.filter((r) => r.sensorContext !== null);
  const newestSensor = sensorAttached.length > 0 ? sensorAttached[0] : null;

  const configuredGoals = sanitizeConfiguredPhenoEvidenceGoals(input.configuredGoals);
  const missingGoalIds = coverage.goals.filter((g) => !g.recorded).map((g) => g.id);

  return {
    huntId: input.huntId,
    plantId: input.plantId,
    configuredGoals,
    goals: coverage.goals,
    configuredGoalCount: coverage.totalCount,
    recordedGoalCount: coverage.completedCount,
    missingGoalIds,
    receiptCount: coverage.receipts.length,
    latestEntryAt: newest?.entryAt ?? null,
    hasPhotoEvidence: coverage.receipts.some((r) => r.hasPhoto),
    sensor: {
      attachedReceiptCount: sensorAttached.length,
      freshReceiptCount: sensorAttached.filter((r) => r.sensorContext?.freshness === "fresh")
        .length,
      latestFreshness: newestSensor?.sensorContext?.freshness ?? null,
      latestCapturedAt: newestSensor?.sensorContext?.capturedAt ?? null,
    },
    state: packetState({
      unavailable,
      truncated,
      configuredGoalCount: coverage.totalCount,
      recordedGoalCount: coverage.completedCount,
    }),
    truncated,
  };
}

/**
 * Build packets for a bounded candidate page / comparison cohort from one
 * batch of raw rows. Rows are grouped by their raw `plant_id` column and then
 * strictly re-validated per candidate. Deterministic: same input, same output;
 * plant order follows the (deduplicated) input order.
 */
export function buildPhenoEvidencePackets(
  input: BuildPhenoEvidencePacketsInput,
): ReadonlyMap<string, PhenoCandidateEvidencePacket> {
  const plantIds = dedupePlantIds(input.plantIds);
  const rowsByPlant = new Map<string, RawPhenoEvidenceDiaryRow[]>();
  for (const row of input.rows ?? []) {
    if (!row || typeof row.plant_id !== "string" || row.plant_id.length === 0) continue;
    const bucket = rowsByPlant.get(row.plant_id);
    if (bucket) bucket.push(row);
    else rowsByPlant.set(row.plant_id, [row]);
  }

  const packets = new Map<string, PhenoCandidateEvidencePacket>();
  for (const plantId of plantIds) {
    packets.set(
      plantId,
      buildPhenoCandidateEvidencePacket({
        huntId: input.huntId,
        plantId,
        configuredGoals: input.configuredGoals,
        rows: rowsByPlant.get(plantId) ?? [],
        truncated: input.truncated,
        unavailable: input.unavailable,
      }),
    );
  }
  return packets;
}

/** Presentation copy for a packet state. No color-only meaning; plain text. */
export function phenoEvidencePacketStateLabel(state: PhenoEvidencePacketState): string {
  switch (state) {
    case "complete":
      return "All configured goals recorded";
    case "partial":
      return "Some configured goals missing";
    case "truncated":
      return "Coverage incomplete — too many receipts to load";
    case "unavailable":
      return "Manual evidence unavailable";
  }
}
