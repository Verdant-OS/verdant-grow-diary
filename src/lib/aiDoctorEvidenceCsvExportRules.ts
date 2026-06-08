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
 */

import type { AiDoctorReportInput } from "./aiDoctorReportRules";
import { redactReportLine } from "./aiDoctorReportRules";

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

function row(cells: readonly CsvCell[]): string {
  return cells.map(csvEscape).join(",");
}

export interface AiDoctorEvidenceCsvOutput {
  filename: string;
  contents: string;
}

/**
 * Build a deterministic CSV bundle covering:
 *  - diagnosis summary + posture
 *  - evidence basis bullets
 *  - recommendations + inline citations
 *  - More Data Needed checklist
 *  - per-metric Environment Check rows
 */
export function buildAiDoctorEvidenceCsv(
  input: AiDoctorReportInput,
): AiDoctorEvidenceCsvOutput {
  const lines: string[] = [];

  lines.push(row(["section", "key", "label", "value", "note"]));
  lines.push(row(["meta", "generated_at", "Generated at", input.generatedAt, ""]));
  lines.push(
    row([
      "meta",
      "source_honesty",
      "Source honesty",
      "Local Environment Check is not live telemetry; derived VPD is context only.",
      "",
    ]),
  );

  lines.push(row(["diagnosis", "summary", "Diagnosis summary", input.summary || "", ""]));

  if (input.alignment) {
    lines.push(
      row([
        "posture",
        "label",
        "Recommendation posture",
        input.alignment.postureLabel,
        input.alignment.postureCopy,
      ]),
    );
    input.alignment.basisCopy.forEach((b, i) => {
      lines.push(row(["evidence_basis", `bullet_${i + 1}`, "Evidence basis", b, ""]));
    });
    if (input.alignment.guardrailWarning) {
      lines.push(
        row([
          "posture",
          "guardrail",
          "Guardrail",
          input.alignment.guardrailWarning,
          "",
        ]),
      );
    }
    if (input.alignment.moreDataReminder) {
      lines.push(
        row([
          "posture",
          "more_data",
          "More data reminder",
          input.alignment.moreDataReminder,
          "",
        ]),
      );
    }
  }

  // Evidence summary
  lines.push(
    row([
      "evidence_summary",
      "live_sensor_usable",
      "Live sensor usable",
      input.evidenceSummary.liveSensorUsable ? "yes" : "no",
      "",
    ]),
  );
  lines.push(
    row([
      "evidence_summary",
      "env_check_present",
      "Environment Check present",
      input.evidenceSummary.envCheckPresent ? "yes" : "no",
      input.evidenceSummary.envCheckPresent
        ? "Test/Local validation, not live"
        : "",
    ]),
  );
  lines.push(
    row([
      "evidence_summary",
      "recent_diary",
      "Recent diary entry",
      input.evidenceSummary.hasRecentDiary ? "yes" : "no",
      "",
    ]),
  );
  lines.push(
    row([
      "evidence_summary",
      "recent_photos",
      "Recent photos",
      input.evidenceSummary.hasRecentPhotos ? "yes" : "no",
      "",
    ]),
  );

  // Recommendations
  input.recommendations.forEach((r, i) => {
    lines.push(
      row([
        "recommendation",
        `rec_${i + 1}`,
        r.text,
        r.citation.label,
        r.citation.kind,
      ]),
    );
  });

  // Checklist
  input.checklist.forEach((c) => {
    lines.push(
      row([
        "checklist",
        c.key,
        c.label,
        c.state === "complete" ? "complete" : "needed",
        "",
      ]),
    );
  });

  // Per-metric Environment Check rows
  if (input.environmentCheck.show) {
    input.environmentCheck.metricRows.forEach((m) => {
      const valStr =
        m.value == null || !Number.isFinite(m.value) ? "" : String(m.value);
      const note =
        m.derived && m.key === "vpd_kpa" ? "Derived VPD context" : "";
      lines.push(row(["env_metric", m.key, m.statusLabel, valStr, note]));
    });
    lines.push(
      row([
        "env_check",
        "captured_at",
        "Captured at",
        input.environmentCheck.capturedAt ?? "",
        "Test/Local validation",
      ]),
    );
  }

  return {
    filename: "ai-doctor-evidence.csv",
    contents: lines.join("\n") + "\n",
  };
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
