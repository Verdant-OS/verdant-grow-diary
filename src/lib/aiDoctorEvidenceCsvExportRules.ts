/**
 * aiDoctorEvidenceCsvExportRules — pure CSV export builder for the AI
 * Doctor diagnosis + evidence panel. Client-side only.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no edge invokes.
 *  - Local/test Environment Check evidence MUST NEVER be labeled Live.
 *  - Derived VPD MUST be labeled "Derived VPD context".
 *  - Visible copy MUST be redacted of tokens, JWTs, bearer/auth strings,
 *    service_role, user_id, bridge tokens, and UUID-shaped internal IDs.
 *
 * Column order (mirrors the PDF per-metric table):
 *   section, metric, status, citation_type, citation_label, value,
 *   source_label, recommendation, evidence_basis, more_data_needed,
 *   source_honesty_note, generated_at
 */

import type { AiDoctorReportInput } from "./aiDoctorReportRules";
import {
  redactReportLine,
  buildPerMetricStatusTable,
} from "./aiDoctorReportRules";

export type CsvCell = string | number | null | undefined;

/** Escape a single CSV cell — handles commas, quotes, newlines, CR. */
export function csvEscape(value: CsvCell): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : String(value);
  const redacted = redactReportLine(s);
  if (/[",\r\n]/.test(redacted)) {
    return `"${redacted.replace(/"/g, '""')}"`;
  }
  return redacted;
}

export const AI_DOCTOR_EVIDENCE_CSV_COLUMNS: readonly string[] = [
  "section",
  "metric",
  "status",
  "citation_type",
  "citation_label",
  "value",
  "source_label",
  "recommendation",
  "evidence_basis",
  "more_data_needed",
  "source_honesty_note",
  "generated_at",
];

interface RowFields {
  section: string;
  metric?: string;
  status?: string;
  citation_type?: string;
  citation_label?: string;
  value?: string | number;
  source_label?: string;
  recommendation?: string;
  evidence_basis?: string;
  more_data_needed?: string;
  source_honesty_note?: string;
  generated_at?: string;
}

function row(fields: RowFields): string {
  const rec = fields as unknown as Record<string, CsvCell>;
  return AI_DOCTOR_EVIDENCE_CSV_COLUMNS
    .map((col) => csvEscape(rec[col] ?? ""))
    .join(",");
}

export interface AiDoctorEvidenceCsvOutput {
  filename: string;
  contents: string;
}

const HONESTY_GLOBAL =
  "Local Environment Check is not live telemetry; derived VPD is context only.";

/**
 * Build a deterministic CSV bundle. Sections appear in fixed order:
 * meta → diagnosis → posture → evidence_basis → evidence_summary →
 * recommendation → checklist → env_metric (fixed metric order).
 */
export function buildAiDoctorEvidenceCsv(
  input: AiDoctorReportInput,
): AiDoctorEvidenceCsvOutput {
  const lines: string[] = [];
  lines.push(AI_DOCTOR_EVIDENCE_CSV_COLUMNS.join(","));

  // Meta
  lines.push(
    row({
      section: "meta",
      source_honesty_note: HONESTY_GLOBAL,
      generated_at: input.generatedAt,
    }),
  );

  // Diagnosis
  lines.push(
    row({
      section: "diagnosis",
      status: "summary",
      recommendation: input.summary || "",
      generated_at: input.generatedAt,
    }),
  );

  // Posture
  if (input.alignment) {
    lines.push(
      row({
        section: "posture",
        status: input.alignment.postureLabel,
        recommendation: input.alignment.postureCopy,
        generated_at: input.generatedAt,
      }),
    );
    input.alignment.basisCopy.forEach((b) => {
      lines.push(
        row({
          section: "evidence_basis",
          evidence_basis: b,
          generated_at: input.generatedAt,
        }),
      );
    });
    if (input.alignment.guardrailWarning) {
      lines.push(
        row({
          section: "posture",
          status: "guardrail",
          recommendation: input.alignment.guardrailWarning,
          generated_at: input.generatedAt,
        }),
      );
    }
    if (input.alignment.moreDataReminder) {
      lines.push(
        row({
          section: "posture",
          status: "more_data",
          more_data_needed: input.alignment.moreDataReminder,
          generated_at: input.generatedAt,
        }),
      );
    }
  }

  // Evidence summary
  lines.push(
    row({
      section: "evidence_summary",
      status: input.evidenceSummary.liveSensorUsable ? "yes" : "no",
      recommendation: "Sensor usable as live evidence",
      generated_at: input.generatedAt,
    }),
  );
  lines.push(
    row({
      section: "evidence_summary",
      status: input.evidenceSummary.envCheckPresent ? "yes" : "no",
      recommendation: "Environment Check present",
      source_label: input.evidenceSummary.envCheckPresent
        ? "Test/Local validation"
        : "Not captured",
      generated_at: input.generatedAt,
    }),
  );
  lines.push(
    row({
      section: "evidence_summary",
      status: input.evidenceSummary.hasRecentDiary ? "yes" : "no",
      recommendation: "Recent diary entry",
      generated_at: input.generatedAt,
    }),
  );
  lines.push(
    row({
      section: "evidence_summary",
      status: input.evidenceSummary.hasRecentPhotos ? "yes" : "no",
      recommendation: "Recent photos",
      generated_at: input.generatedAt,
    }),
  );

  // Recommendations + inline citations
  input.recommendations.forEach((r, i) => {
    lines.push(
      row({
        section: "recommendation",
        metric: `rec_${i + 1}`,
        status: r.citation.healthy ? "supported" : "weak",
        citation_type: r.citation.kind,
        citation_label: r.citation.label,
        recommendation: r.text,
        source_label: kindToSourceLabel(r.citation.kind),
        source_honesty_note: kindToHonesty(r.citation.kind),
        generated_at: input.generatedAt,
      }),
    );
  });

  // Checklist
  input.checklist.forEach((c) => {
    lines.push(
      row({
        section: "checklist",
        metric: c.key,
        status: c.state === "complete" ? "complete" : "needed",
        more_data_needed: c.label,
        generated_at: input.generatedAt,
      }),
    );
  });

  // Per-metric Environment Check rows — same fixed order as PDF.
  const metricRows = buildPerMetricStatusTable(input);
  metricRows.forEach((m) => {
    lines.push(
      row({
        section: "env_metric",
        metric: m.metric,
        status: m.status,
        citation_type: m.citationType,
        citation_label: deriveCitationLabel(m.metric, m.citationType),
        value: m.value === "—" ? "" : m.value,
        source_label: m.source,
        source_honesty_note: kindToHonesty(m.citationType),
        generated_at: input.generatedAt,
      }),
    );
  });
  if (input.environmentCheck.show) {
    lines.push(
      row({
        section: "env_check",
        metric: "captured_at",
        status: input.environmentCheck.capturedAt ?? "",
        source_label: "Test/Local validation",
        generated_at: input.generatedAt,
      }),
    );
  }

  return {
    filename: "ai-doctor-evidence.csv",
    contents: lines.join("\n") + "\n",
  };
}

function kindToSourceLabel(kind: string): string {
  switch (kind) {
    case "env_metric":
    case "env_metric_derived":
    case "env_metric_weak":
      return "Test/Local validation";
    case "missing_metric":
    case "diary_photo_missing":
      return "Not captured";
    default:
      return "";
  }
}

function kindToHonesty(kind: string): string {
  switch (kind) {
    case "env_metric":
      return "Local Test/Local validation evidence — not live telemetry.";
    case "env_metric_derived":
      return "Derived VPD context only — not a raw sensor reading.";
    case "env_metric_weak":
    case "missing_metric_weak":
      return "Local Test/Local validation evidence — not healthy and not live.";
    case "missing_metric":
      return "Metric is not present in the latest Environment Check.";
    case "diary_photo_missing":
      return "No recent diary or photo evidence is available.";
    case "none":
      return "No direct evidence supports this recommendation yet.";
    default:
      return "";
  }
}

function deriveCitationLabel(metric: string, citationType: string): string {
  if (citationType === "env_metric") return `Env Check: ${metric}`;
  if (citationType === "env_metric_derived") return "Derived VPD context";
  if (citationType === "env_metric_weak") return `Env Check (weak): ${metric}`;
  if (citationType === "missing_metric") return `Missing: ${metric}`;
  return "";
}

/** Trigger a client-side download of CSV text as text/csv. */
export function downloadAiDoctorEvidenceCsv(
  output: AiDoctorEvidenceCsvOutput,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([output.contents], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = output.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
