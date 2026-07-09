/**
 * phenoHuntCsvExport — pure CSV builder for a hunt's candidate records.
 *
 * Breeders live in spreadsheets: this flattens the grower's OWN loaded
 * workspace data (labels, sex, decisions, trait scores, smoke test, COA)
 * into one row per candidate for offline analysis and sharing.
 *
 * Doctrine: rows are emitted in INPUT order — never sorted by score, never
 * ranked, no "best" row. Pure function of its inputs: no I/O, no fetch, no
 * AI, no Action Queue, no automation.
 */
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import type { CandidateScoreRow } from "@/lib/phenoCandidateScoresService";
import type { KeeperDecisionRow } from "@/lib/phenoKeeperDecisionService";
import type { SexObservationRow } from "@/lib/phenoSexObservationService";
import type { SmokeTestRow } from "@/lib/phenoSmokeTestService";
import type { LabResultRow } from "@/lib/phenoLabResultsService";

export interface PhenoHuntCsvInput {
  readonly huntName: string;
  readonly candidates: readonly PhenoCandidateInput[];
  readonly scoresByPlant: Record<string, CandidateScoreRow>;
  readonly decisionsByPlant: Record<string, KeeperDecisionRow>;
  readonly sexByPlant: Record<string, SexObservationRow>;
  readonly smokeByPlant: Record<string, SmokeTestRow>;
  /** Lab results keyed "plantId:source"; the COA row is exported. */
  readonly labByKey: Record<string, LabResultRow>;
}

/** RFC-4180-style escaping: quote when the value contains , " or newline. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
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

export function buildPhenoHuntCsv(input: PhenoHuntCsvInput): string {
  const traitKeys = LOUD_TRAIT_AXES.map((a) => a.key);
  const header = [
    "hunt",
    "candidate_label",
    "candidate_id",
    "strain",
    "stage",
    "sex",
    "herm_observed",
    "decision",
    "decision_note",
    "decided_at",
    ...traitKeys,
    "score_note",
    "smoke_verdict",
    "smoke_smoothness",
    "smoke_potency",
    "coa_thc_pct",
    "coa_cbd_pct",
  ];
  const lines = [header.map(csvField).join(",")];

  for (const c of input.candidates) {
    const id = c.candidateId;
    const score = input.scoresByPlant[id];
    const decision = input.decisionsByPlant[id];
    const sex = input.sexByPlant[id];
    const smoke = input.smokeByPlant[id];
    const lab = input.labByKey[`${id}:coa`];
    lines.push(
      [
        csvField(input.huntName),
        csvField(c.candidateLabel ?? ""),
        csvField(id),
        csvField(c.strain ?? ""),
        csvField(c.stage ?? ""),
        csvField(sex?.sex ?? ""),
        csvField(sex?.hermObserved === true ? "yes" : ""),
        csvField(decision?.decision ?? ""),
        csvField(decision?.note ?? ""),
        csvField(decision?.decidedAt ?? ""),
        ...traitKeys.map((k) => csvField(score?.traits?.[k] ?? "")),
        csvField(score?.note ?? ""),
        csvField(smoke?.verdict ?? ""),
        csvField(smoke?.smoothness ?? ""),
        csvField(smoke?.potencyImpression ?? ""),
        csvField(lab?.thcPct ?? ""),
        csvField(lab?.cbdPct ?? ""),
      ].join(","),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
