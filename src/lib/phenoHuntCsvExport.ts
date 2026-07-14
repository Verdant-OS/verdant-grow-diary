/**
 * phenoHuntCsvExport — pure CSV builder for a hunt's candidate records.
 *
 * Breeders live in spreadsheets: this flattens the grower's OWN loaded
 * workspace data (identity, sex, decisions, trait scores, smoke test, COA,
 * evidence readiness, provenance) into one row per candidate for offline
 * analysis and sharing.
 *
 * Doctrine: rows are emitted in INPUT order — never sorted by score, never
 * ranked, no "best" row. `readiness` is an EVIDENCE-completeness value, never a
 * phenotype score. Pure function of its inputs: no I/O, no fetch, no AI, no
 * Action Queue, no automation, no clock (exportedAt is injected).
 *
 * Security: every field is neutralised against spreadsheet formula injection
 * (a leading = + - @ tab or CR is prefixed so a shared CSV can't execute a
 * payload on open), then RFC-4180 quoted.
 */
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import type { CandidateScoreRow } from "@/lib/phenoCandidateScoresService";
import type { KeeperDecisionRow } from "@/lib/phenoKeeperDecisionService";
import type { SexObservationRow } from "@/lib/phenoSexObservationService";
import type { SmokeTestRow } from "@/lib/phenoSmokeTestService";
import type { LabResultRow } from "@/lib/phenoLabResultsService";
import type { PhenoCandidateEvidencePacket } from "@/lib/phenoEvidencePacket";
import { phenoCandidateDisplayLabel } from "@/lib/phenoCandidateIdentity";
import {
  evaluatePhenoCandidateReadiness,
  readinessEvidenceFromCandidateInput,
  type PhenoReadinessLevel,
} from "@/lib/phenoCandidateReadiness";

/** Precomputed readiness a caller (workspace, with full evidence) can pass in. */
export interface PhenoCsvReadiness {
  readonly readiness: PhenoReadinessLevel;
  readonly completedGoals: readonly string[];
  readonly missingGoals: readonly string[];
}

export interface PhenoHuntCsvInput {
  readonly huntName: string;
  /** Hunt id for traceability outside Verdant. Optional (legacy callers). */
  readonly huntId?: string | null;
  readonly candidates: readonly PhenoCandidateInput[];
  readonly scoresByPlant: Record<string, CandidateScoreRow>;
  readonly decisionsByPlant: Record<string, KeeperDecisionRow>;
  readonly sexByPlant: Record<string, SexObservationRow>;
  readonly smokeByPlant: Record<string, SmokeTestRow>;
  /** Lab results keyed "plantId:source"; the COA row is exported. */
  readonly labByKey: Record<string, LabResultRow>;
  /**
   * Optional precomputed readiness per plant. When present it wins over the
   * builder's best-effort derivation (the workspace has evidence — harvest,
   * stress, clones — the CSV maps don't carry).
   */
  readonly readinessByPlant?: Record<string, PhenoCsvReadiness>;
  /**
   * Honest provenance label for the export as a whole: live | manual | demo.
   * Defaults to "live" (the grower's own recorded hunt data). Never markets
   * demo data as live.
   */
  readonly provenance?: string;
  /**
   * Optional manual-evidence packets per plant (configured-goal coverage
   * from Quick Log receipts). Absent → the coverage columns export as
   * "unavailable" with blank counts; legacy callers stay valid.
   */
  readonly evidencePacketsByPlant?: ReadonlyMap<string, PhenoCandidateEvidencePacket> | null;
  /**
   * Honest export scope. `loadedCandidateCount` is the rows actually in this
   * file; `totalCandidateCount` the server total when known. The builder
   * only claims "complete_hunt" when both are known AND equal — a loaded-page
   * export is always labeled "loaded_candidates".
   */
  readonly loadedCandidateCount?: number | null;
  readonly totalCandidateCount?: number | null;
  /** Injected ISO export timestamp. Pure — the builder never reads the clock. */
  readonly exportedAt?: string;
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Escape a CSV field: (1) neutralise spreadsheet formula injection on STRING
 * values with a leading trigger char, then (2) RFC-4180 quote when the value
 * contains , " or a newline (doubling embedded quotes). Numbers are safe and
 * pass through unguarded (so a negative delta stays a number, not text).
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function phenoHuntCsvFilename(huntName: string): string {
  const slug =
    huntName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "hunt";
  return `pheno-hunt-${slug}-export.csv`;
}

function hasSmokeContent(smoke: SmokeTestRow | undefined): boolean {
  if (!smoke) return false;
  return !!(
    smoke.verdict?.trim() ||
    (smoke.flavorDescriptors?.length ?? 0) > 0 ||
    (smoke.effectDescriptors?.length ?? 0) > 0
  );
}

/** Best-effort readiness from the CSV's own maps when none is supplied. */
function deriveReadiness(input: PhenoHuntCsvInput, c: PhenoCandidateInput): PhenoCsvReadiness {
  const id = c.candidateId;
  const supplied = input.readinessByPlant?.[id];
  if (supplied) return supplied;
  const score = input.scoresByPlant[id];
  const decision = input.decisionsByPlant[id];
  const sex = input.sexByPlant[id];
  const smoke = input.smokeByPlant[id];
  const lab = input.labByKey[`${id}:coa`];
  const evidence = readinessEvidenceFromCandidateInput(c, {
    hasTraitScore: !!score && Object.keys(score.traits ?? {}).length > 0,
    sexObserved: !!sex,
    keeperDecision: decision?.decision ?? null,
    keeperRationale: decision?.note ?? null,
    hasPostCureSmokeTest: hasSmokeContent(smoke),
    hasLabResult: !!lab,
    labSource: lab?.source ?? null,
  });
  const r = evaluatePhenoCandidateReadiness(evidence);
  return { readiness: r.readiness, completedGoals: r.completedGoals, missingGoals: r.missingGoals };
}

export function buildPhenoHuntCsv(input: PhenoHuntCsvInput): string {
  const traitKeys = LOUD_TRAIT_AXES.map((a) => a.key);
  const provenance = input.provenance ?? "live";
  const exportedAt = input.exportedAt ?? "";
  // Honest scope: only claim a complete hunt when the loaded row count and
  // the known server total agree. A page export never masquerades as full.
  const loadedCount =
    typeof input.loadedCandidateCount === "number"
      ? input.loadedCandidateCount
      : input.candidates.length;
  const exportScope =
    typeof input.totalCandidateCount === "number" && loadedCount === input.totalCandidateCount
      ? "complete_hunt"
      : "loaded_candidates";
  const header = [
    "hunt_id",
    "hunt",
    "candidate_number",
    "candidate_label",
    "candidate_display",
    "candidate_id",
    "plant_id",
    "strain",
    "stage",
    "sex",
    "herm_observed",
    "decision",
    "decision_note",
    "decided_at",
    "readiness",
    "completed_evidence_goals",
    "missing_evidence_goals",
    ...traitKeys,
    "score_note",
    "smoke_verdict",
    "smoke_smoothness",
    "smoke_potency",
    "coa_source",
    "coa_thc_pct",
    "coa_cbd_pct",
    "data_provenance",
    "exported_at",
    "configured_goal_count",
    "recorded_goal_count",
    "missing_goal_ids",
    "latest_manual_evidence_at",
    "manual_receipt_count",
    "manual_evidence_status",
    "manual_evidence_truncated",
    "export_scope",
    "loaded_candidate_count",
    "total_candidate_count",
  ];
  const lines = [header.map(csvField).join(",")];

  for (const c of input.candidates) {
    const id = c.candidateId;
    const score = input.scoresByPlant[id];
    const decision = input.decisionsByPlant[id];
    const sex = input.sexByPlant[id];
    const smoke = input.smokeByPlant[id];
    const lab = input.labByKey[`${id}:coa`];
    const packet = input.evidencePacketsByPlant?.get(id) ?? null;
    const readiness = deriveReadiness(input, c);
    lines.push(
      [
        csvField(input.huntId ?? ""),
        csvField(input.huntName),
        // Legacy null numbers export as blank, never a fabricated value.
        csvField(typeof c.candidateNumber === "number" ? c.candidateNumber : ""),
        csvField(c.candidateLabel ?? ""),
        csvField(phenoCandidateDisplayLabel(c)),
        csvField(id),
        csvField(id),
        csvField(c.strain ?? ""),
        csvField(c.stage ?? ""),
        csvField(sex?.sex ?? ""),
        csvField(sex?.hermObserved === true ? "yes" : ""),
        csvField(decision?.decision ?? ""),
        csvField(decision?.note ?? ""),
        csvField(decision?.decidedAt ?? ""),
        csvField(readiness.readiness),
        csvField(readiness.completedGoals.join(";")),
        csvField(readiness.missingGoals.join(";")),
        ...traitKeys.map((k) => csvField(score?.traits?.[k] ?? "")),
        csvField(score?.note ?? ""),
        csvField(smoke?.verdict ?? ""),
        csvField(smoke?.smoothness ?? ""),
        csvField(smoke?.potencyImpression ?? ""),
        csvField(lab?.source ?? ""),
        csvField(lab?.thcPct ?? ""),
        csvField(lab?.cbdPct ?? ""),
        csvField(provenance),
        csvField(exportedAt),
        csvField(packet ? packet.configuredGoalCount : ""),
        csvField(packet ? packet.recordedGoalCount : ""),
        // Stable serialization: configured order, ";"-joined (matches the
        // readiness goal columns above).
        csvField(packet ? packet.missingGoalIds.join(";") : ""),
        csvField(packet?.latestEntryAt ?? ""),
        csvField(packet ? packet.receiptCount : ""),
        csvField(packet ? packet.state : "unavailable"),
        csvField(packet ? (packet.truncated ? "yes" : "no") : ""),
        csvField(exportScope),
        csvField(loadedCount ?? ""),
        csvField(input.totalCandidateCount ?? ""),
      ].join(","),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
