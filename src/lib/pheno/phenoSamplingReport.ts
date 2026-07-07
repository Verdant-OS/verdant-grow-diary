/**
 * Pure helpers for PHENOHUNT tester-feedback reporting.
 *
 * Provides summarization, side-by-side grouping, history ordering, and
 * a browser-print-friendly HTML document builder for candidate reports.
 *
 * No side effects. No AI, no Action Queue, no automation, no device
 * control, no sensor ingest, no schema writes.
 */
import type { PhenoSamplingSubmission } from "@/context/PhenoSamplingContext";
import {
  PHENO_SAMPLING_HEADING,
  PHENO_SAMPLING_INTRO_PARAGRAPHS,
  PHENO_SAMPLING_COMPARISON_POINTS,
  PHENO_SAMPLING_OBSERVATION_DISCLAIMER,
} from "@/constants/phenoProductSamplingCopy";

export interface CandidateSummaryRow {
  readonly candidateId: string;
  readonly submissions: number;
  readonly averageOverall: number | null;
  readonly ratings: readonly (number | null)[];
}

export interface TesterSummaryRow {
  readonly testerCode: string;
  readonly candidateId: string;
  readonly overall: number | null;
  readonly submittedAt: string;
}

/** Aggregate rating summary — per candidate averages + counts. */
export function summarizeByCandidate(
  submissions: readonly PhenoSamplingSubmission[],
): readonly CandidateSummaryRow[] {
  const groups = new Map<string, PhenoSamplingSubmission[]>();
  for (const s of submissions) {
    if (!groups.has(s.candidateId)) groups.set(s.candidateId, []);
    groups.get(s.candidateId)!.push(s);
  }
  const rows: CandidateSummaryRow[] = [];
  for (const [candidateId, rows_] of groups) {
    const ratings = rows_.map((r) => r.overall);
    const numeric = ratings.filter((r): r is number => typeof r === "number");
    const avg =
      numeric.length === 0
        ? null
        : Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) /
          100;
    rows.push({
      candidateId,
      submissions: rows_.length,
      averageOverall: avg,
      ratings,
    });
  }
  return rows.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

/** Flat rating rows — overall rating by tester (and candidate). */
export function summarizeByTester(
  submissions: readonly PhenoSamplingSubmission[],
): readonly TesterSummaryRow[] {
  return submissions
    .map((s) => ({
      testerCode: s.testerCode || "(anonymous)",
      candidateId: s.candidateId,
      overall: s.overall,
      submittedAt: s.submittedAt,
    }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** All submissions for one candidate, insertion order preserved. */
export function groupByCandidate(
  submissions: readonly PhenoSamplingSubmission[],
  candidateId: string,
): readonly PhenoSamplingSubmission[] {
  return submissions.filter((s) => s.candidateId === candidateId);
}

/** History rows for one candidate, newest first. */
export function historyForCandidate(
  submissions: readonly PhenoSamplingSubmission[],
  candidateId: string,
): readonly PhenoSamplingSubmission[] {
  return [...groupByCandidate(submissions, candidateId)].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );
}

/** Safety wording surfaced in the PDF report. */
export const PHENO_REPORT_SAFETY_LINES: readonly string[] = [
  "Ash color is an observation, not proof of quality.",
  "Oil ring presence can indicate resin expression, but does not prove superiority.",
  "Compare results across testers and evidence sources before making selections.",
];

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface CandidateDescriptor {
  readonly candidateId: string;
  readonly candidateLabel?: string | null;
}

/**
 * Build a self-contained HTML document for a candidate's tester feedback,
 * intended to be opened in a new window and printed to PDF via the browser.
 */
export function buildCandidateReportHtml(
  candidate: CandidateDescriptor,
  submissions: readonly PhenoSamplingSubmission[],
): string {
  const rows = groupByCandidate(submissions, candidate.candidateId);
  const submissionRows = rows
    .map(
      (s) => `
      <section class="submission">
        <h3>Tester: ${escapeHtml(s.testerCode || "(anonymous)")}</h3>
        <p class="ts">Submitted: ${escapeHtml(s.submittedAt)}</p>
        <table>
          <tbody>
            <tr><th>Sample format</th><td>${escapeHtml(s.sampleFormat)}</td></tr>
            <tr><th>Dry hit aroma notes</th><td>${escapeHtml(s.dryHit)}</td></tr>
            <tr><th>Flavor notes</th><td>${escapeHtml(s.flavor)}</td></tr>
            <tr><th>Burn quality</th><td>${escapeHtml(s.burnQuality)}</td></tr>
            <tr><th>Ash color</th><td>${escapeHtml(s.ashColor)}</td></tr>
            <tr><th>Oil ring observation</th><td>${escapeHtml(s.oilRing)}</td></tr>
            <tr><th>Effect notes</th><td>${escapeHtml(s.effect)}</td></tr>
            <tr><th>Overall rating</th><td>${s.overall == null ? "" : escapeHtml(String(s.overall))}</td></tr>
            <tr><th>Freeform notes</th><td>${escapeHtml(s.notes)}</td></tr>
          </tbody>
        </table>
      </section>`,
    )
    .join("");

  const introHtml = PHENO_SAMPLING_INTRO_PARAGRAPHS.map(
    (p) => `<p>${escapeHtml(p)}</p>`,
  ).join("");
  const pointsHtml = PHENO_SAMPLING_COMPARISON_POINTS.map(
    (p) =>
      `<li><strong>${escapeHtml(p.label)}:</strong> ${escapeHtml(p.description)}</li>`,
  ).join("");
  const safetyHtml = PHENO_REPORT_SAFETY_LINES.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("");

  const title = `${PHENO_SAMPLING_HEADING} — ${candidate.candidateLabel ?? candidate.candidateId}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin-top: 24px; }
  h3 { font-size: 13px; margin: 12px 0 4px; }
  p, li, td, th { font-size: 12px; line-height: 1.4; }
  .safety { background: #fff8e1; border: 1px solid #d9b400; padding: 8px 12px; }
  .submission { border-top: 1px solid #ccc; margin-top: 12px; padding-top: 8px; }
  .ts { color: #555; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; margin-top: 6px; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; width: 30%; }
  .no-print { margin-top: 24px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p><strong>Candidate ID:</strong> ${escapeHtml(candidate.candidateId)}</p>
  ${candidate.candidateLabel ? `<p><strong>Candidate label:</strong> ${escapeHtml(candidate.candidateLabel)}</p>` : ""}

  <h2>${escapeHtml(PHENO_SAMPLING_HEADING)}</h2>
  ${introHtml}
  <h3>Sampling comparison points</h3>
  <ul>${pointsHtml}</ul>
  <p><em>${escapeHtml(PHENO_SAMPLING_OBSERVATION_DISCLAIMER)}</em></p>

  <h2>Safety notes</h2>
  <ul class="safety">${safetyHtml}</ul>

  <h2>Tester feedback submissions (${rows.length})</h2>
  ${rows.length === 0 ? "<p><em>No tester feedback recorded for this candidate yet.</em></p>" : submissionRows}

  <div class="no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;
}

/** Opens the report HTML in a new window and triggers the print dialog. */
export function openCandidateReport(
  candidate: CandidateDescriptor,
  submissions: readonly PhenoSamplingSubmission[],
): boolean {
  const html = buildCandidateReportHtml(candidate, submissions);
  if (typeof window === "undefined") return false;
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
