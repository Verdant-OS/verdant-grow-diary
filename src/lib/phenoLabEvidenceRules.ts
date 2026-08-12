/**
 * phenoLabEvidenceRules — pure bridge from a candidate's grower-entered lab
 * test rows (labResultsRules / the lab_tests table) into the Pheno Comparison.
 *
 * Each candidate shows its own LATEST measured result — date, calculated
 * totals (explicitly labeled, acid × 0.877 + neutral), and top terpenes.
 * Honesty rules:
 *   - Values are the grower's transcription of a lab report; never verified.
 *   - The comparison shows records side by side. It never ranks candidates,
 *     highlights a higher number, or names a winner — the grower decides.
 *   - A candidate without a computable measurement contributes nothing (null);
 *     the presenter shows the honest "No lab result recorded" gap instead.
 *
 * No I/O, no React, no clocks. Deterministic and null-safe.
 */
import {
  calculateDecarbTotal,
  formatLabDateLabel,
  formatPercent,
  parseTerpenes,
} from "@/lib/labResultsRules";

export interface PhenoLabEvidenceInput {
  testedAt: string | null;
  thcaPercent: number | null;
  thcPercent: number | null;
  cbdaPercent: number | null;
  cbdPercent: number | null;
  /** Raw jsonb from the row — validated here, never trusted. */
  terpenes: unknown;
  labName: string | null;
}

export interface PhenoLabEvidenceView {
  /** e.g. "Mar 14, 2026" or "Date not recorded". */
  dateLabel: string;
  labName: string | null;
  /** Calculated total THC (THCa × 0.877 + THC), when computable. */
  totalThcLabel: string | null;
  /** Calculated total CBD (CBDa × 0.877 + CBD), when computable. */
  totalCbdLabel: string | null;
  /** Highest-percentage terpenes, at most PHENO_LAB_TOP_TERPENES. */
  topTerpenes: Array<{ name: string; valueLabel: string }>;
}

export const PHENO_LAB_EVIDENCE_HEADING = "Measured (lab)";
export const PHENO_LAB_EVIDENCE_MISSING_COPY = "No lab result recorded";
export const PHENO_LAB_TOP_TERPENES = 3;

/**
 * Build the display view for one candidate's latest lab evidence. Returns
 * null when the input is absent or carries no computable measurement at all —
 * the presenter then shows the honest missing-data copy.
 */
export function buildPhenoLabEvidenceView(
  input: PhenoLabEvidenceInput | null | undefined,
): PhenoLabEvidenceView | null {
  if (!input) return null;

  const totalThc = calculateDecarbTotal(input.thcaPercent, input.thcPercent);
  const totalCbd = calculateDecarbTotal(input.cbdaPercent, input.cbdPercent);
  const terpenes = parseTerpenes(input.terpenes);

  if (totalThc === null && totalCbd === null && terpenes.length === 0) {
    return null;
  }

  const labName =
    typeof input.labName === "string" && input.labName.trim().length > 0
      ? input.labName.trim()
      : null;

  return {
    dateLabel: formatLabDateLabel(input.testedAt),
    labName,
    totalThcLabel: totalThc === null ? null : formatPercent(totalThc),
    totalCbdLabel: totalCbd === null ? null : formatPercent(totalCbd),
    topTerpenes: terpenes
      .slice(0, PHENO_LAB_TOP_TERPENES)
      .map((t) => ({ name: t.name, valueLabel: formatPercent(t.value) })),
  };
}

/** Raw lab_tests row shape as selected by the comparison loader. */
export interface PhenoLabEvidenceDbRow {
  plant_id: string | null;
  tested_at: string | null;
  thca_percent: number | null;
  thc_percent: number | null;
  cbda_percent: number | null;
  cbd_percent: number | null;
  terpenes: unknown;
  lab_name: string | null;
}

/**
 * Fold newest-first lab_tests rows into each plant's LATEST result. Rows must
 * already be ordered tested_at descending (the loader's query order); the
 * first row seen per plant wins.
 */
export function latestLabEvidenceByPlant(
  rows: ReadonlyArray<PhenoLabEvidenceDbRow>,
): Record<string, PhenoLabEvidenceInput> {
  const byPlant: Record<string, PhenoLabEvidenceInput> = {};
  for (const row of rows) {
    if (!row.plant_id || byPlant[row.plant_id]) continue;
    byPlant[row.plant_id] = {
      testedAt: row.tested_at,
      thcaPercent: row.thca_percent,
      thcPercent: row.thc_percent,
      cbdaPercent: row.cbda_percent,
      cbdPercent: row.cbd_percent,
      terpenes: row.terpenes,
      labName: row.lab_name,
    };
  }
  return byPlant;
}
