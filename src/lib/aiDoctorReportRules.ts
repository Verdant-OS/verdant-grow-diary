/**
 * aiDoctorReportRules — pure report builder for an AI Doctor diagnosis.
 *
 * Two outputs:
 *  - buildAiDoctorReportText: deterministic plain-text report.
 *  - buildAiDoctorReportPdfBytes: minimal hand-rolled single-PDF bytes
 *    (no external dependency) so the report can be downloaded as a real
 *    application/pdf blob without a network call.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no network calls, no edge invokes.
 *  - Local/test Environment Check evidence MUST NEVER be labeled as Live.
 *  - Derived VPD MUST be labeled as "Derived VPD context".
 *  - Visible copy MUST NOT echo tokens, auth headers, bridge tokens,
 *    service_role, JWTs, user_id, or raw internal IDs / unsafe payloads.
 */

import type { DiagnosisEvidenceAlignmentVM } from "./aiDoctorDiagnosisEvidenceAlignmentRules";
import type { CitedRecommendation } from "./aiDoctorEvidenceCitationRules";

export interface AiDoctorReportEnvironmentCheck {
  show: boolean;
  capturedAt: string | null;
  statusLabel: string;
  metricRows: ReadonlyArray<{
    key: string;
    statusLabel: string;
    value: number | null;
    derived: boolean;
  }>;
}

export interface AiDoctorReportChecklistItem {
  key: string;
  label: string;
  state: "complete" | "needed";
}

export interface AiDoctorReportEvidenceSummary {
  liveSensorUsable: boolean;
  envCheckPresent: boolean;
  hasRecentDiary: boolean;
  hasRecentPhotos: boolean;
}

export interface AiDoctorReportInput {
  generatedAt: string; // ISO-8601 (injected for determinism)
  summary: string;
  alignment: DiagnosisEvidenceAlignmentVM | null;
  evidenceSummary: AiDoctorReportEvidenceSummary;
  environmentCheck: AiDoctorReportEnvironmentCheck;
  checklist: ReadonlyArray<AiDoctorReportChecklistItem>;
  recommendations: ReadonlyArray<CitedRecommendation>;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACT_PATTERNS: RegExp[] = [
  /\b(service_role|bridge_token|authorization|bearer\s+[^\s]+|api[_-]?key|secret_key|jwt|user_id)\b/gi,
  // eyJ... JWT-shaped tokens
  /eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}/g,
  // UUID-shaped raw internal IDs in visible copy
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];

export function redactReportLine(line: string): string {
  let out = typeof line === "string" ? line : "";
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

// ---------------------------------------------------------------------------
// Text report
// ---------------------------------------------------------------------------

export function buildAiDoctorReportText(input: AiDoctorReportInput): string {
  const lines: string[] = [];
  lines.push("AI Doctor Report");
  lines.push(`Generated: ${input.generatedAt}`);
  lines.push("");
  lines.push("Source honesty:");
  lines.push("  - Local Environment Check evidence is not live telemetry.");
  lines.push("  - Derived VPD is context only, not a raw sensor reading.");
  lines.push(
    "  - Weak evidence should not drive aggressive nutrient, irrigation, or equipment changes.",
  );
  lines.push("");
  lines.push("Diagnosis summary:");
  lines.push(`  ${input.summary || "(no summary)"}`);
  lines.push("");

  if (input.alignment) {
    lines.push(`Recommendation posture: ${input.alignment.postureLabel}`);
    lines.push(`  ${input.alignment.postureCopy}`);
    lines.push("");
    lines.push("Evidence basis:");
    if (input.alignment.basisCopy.length === 0) {
      lines.push("  (no basis lines)");
    } else {
      for (const b of input.alignment.basisCopy) lines.push(`  - ${b}`);
    }
    if (input.alignment.guardrailWarning) {
      lines.push("");
      lines.push(`Guardrail: ${input.alignment.guardrailWarning}`);
    }
    if (input.alignment.moreDataReminder) {
      lines.push("");
      lines.push(`More data: ${input.alignment.moreDataReminder}`);
    }
    lines.push("");
  }

  lines.push("Evidence used (summary):");
  lines.push(
    `  - Live sensor usable: ${input.evidenceSummary.liveSensorUsable ? "yes" : "no"}`,
  );
  lines.push(
    `  - Environment Check present: ${input.evidenceSummary.envCheckPresent ? "yes (local Test/Local validation, not live)" : "no"}`,
  );
  lines.push(
    `  - Recent diary entry: ${input.evidenceSummary.hasRecentDiary ? "yes" : "no"}`,
  );
  lines.push(
    `  - Recent photos: ${input.evidenceSummary.hasRecentPhotos ? "yes" : "no"}`,
  );
  lines.push("");

  if (input.environmentCheck.show) {
    lines.push("Latest EcoWitt Environment Check (local Test/Local validation):");
    lines.push(
      `  Captured at: ${input.environmentCheck.capturedAt ?? "unknown"}`,
    );
    lines.push(`  Status: ${input.environmentCheck.statusLabel}`);
    for (const m of input.environmentCheck.metricRows) {
      const v = m.value == null || !Number.isFinite(m.value) ? "—" : String(m.value);
      const ctx = m.derived && m.key === "vpd_kpa" ? " (Derived VPD context)" : "";
      lines.push(`    - ${m.key}: ${m.statusLabel} (value=${v})${ctx}`);
    }
    lines.push("");
  }

  // Compact per-metric status table — always render so weak/missing/
  // not_checked metrics never look healthy by omission.
  {
    const tableRows = buildPerMetricStatusTable(input);
    lines.push("Per-metric status (compact):");
    lines.push(
      "  Metric             | Status            | Citation type        | Value     | Source label             | Note",
    );
    for (const r of tableRows) {
      lines.push(
        `  ${pad(r.metric, 18)} | ${pad(r.status, 17)} | ${pad(r.citationType, 20)} | ${pad(r.value, 9)} | ${pad(r.source, 24)} | ${r.note}`,
      );
    }
    lines.push("");

  if (input.checklist.length > 0) {
    lines.push("More data needed (checklist):");
    for (const c of input.checklist) {
      const mark = c.state === "complete" ? "[x]" : "[ ]";
      lines.push(`  ${mark} ${c.label}`);
    }
    lines.push("");
  }

  lines.push("Recommendations:");
  if (input.recommendations.length === 0) {
    lines.push("  (none)");
  } else {
    for (const r of input.recommendations) {
      lines.push(`  - ${r.text} [${r.citation.label}]`);
    }
  }
  lines.push("");

  return lines.map(redactReportLine).join("\n");
}

// ---------------------------------------------------------------------------
// Minimal PDF builder (single page, monospace, no external deps)
// ---------------------------------------------------------------------------

/** Escape a string for inclusion inside a PDF text literal. */
function pdfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Strip control chars and non-ASCII (Helvetica WinAnsi safe subset).
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(line: string, max: number): string[] {
  if (line.length <= max) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.length) out.push(rest);
  return out;
}

/**
 * Build a minimal multi-page PDF (US Letter, Helvetica 10pt) containing the
 * text report. Returns a Uint8Array of PDF bytes — no DOM or network needed.
 */
export function buildAiDoctorReportPdfBytes(
  input: AiDoctorReportInput,
): Uint8Array {
  const text = buildAiDoctorReportText(input);
  const allLines = text.split("\n").flatMap((l) => wrapLine(l, 95));
  const linesPerPage = 60;
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  // Object layout:
  //   1: Catalog
  //   2: Pages
  //   3: Font
  //   4..: alternating Page, Contents per page
  const fontObjNum = 3;
  const firstPageObjNum = 4;
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  pages.forEach((_, i) => {
    pageObjNums.push(firstPageObjNum + i * 2);
    contentObjNums.push(firstPageObjNum + i * 2 + 1);
  });

  const objects: string[] = [];

  // 1: Catalog
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);

  // 2: Pages
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  objects.push(
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  );

  // 3: Font
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);

  // Pages + Contents
  pages.forEach((pageLines, idx) => {
    const contentNum = contentObjNums[idx];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    const stream = buildContentStream(pageLines);
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  // Assemble file
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  // Track byte offsets — use Buffer.byteLength for accuracy on ASCII content.
  function byteLen(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else n += 3;
    }
    return n;
  }
  let cursor = byteLen(body);
  objects.forEach((obj, i) => {
    offsets.push(cursor);
    const chunk = `${i + 1} 0 obj\n${obj}\nendobj\n`;
    body += chunk;
    cursor += byteLen(chunk);
  });
  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Encode as bytes (Latin-1 / ASCII safe)
  const out = new Uint8Array(byteLen(body));
  let p = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c < 0x80) out[p++] = c;
    else if (c < 0x800) {
      out[p++] = 0xC0 | (c >> 6);
      out[p++] = 0x80 | (c & 0x3F);
    } else {
      out[p++] = 0xE0 | (c >> 12);
      out[p++] = 0x80 | ((c >> 6) & 0x3F);
      out[p++] = 0x80 | (c & 0x3F);
    }
  }
  return out;
}

function buildContentStream(lines: string[]): string {
  const startY = 760;
  const lineH = 12;
  const parts: string[] = ["BT", "/F1 10 Tf"];
  parts.push(`50 ${startY} Td`);
  lines.forEach((l, i) => {
    if (i === 0) {
      parts.push(`(${pdfEscape(l)}) Tj`);
    } else {
      parts.push(`0 -${lineH} Td`);
      parts.push(`(${pdfEscape(l)}) Tj`);
    }
  });
  parts.push("ET");
  return parts.join("\n");
}

/**
 * Trigger a client-side download of a Uint8Array as application/pdf.
 * Must be called from a user gesture. No network call.
 */
export function downloadAiDoctorReportPdf(
  bytes: Uint8Array,
  filename: string,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
