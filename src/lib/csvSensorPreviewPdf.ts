/**
 * csvSensorPreviewPdf — minimal in-browser PDF builder for the CSV/TSV
 * sensor preview report.
 *
 * Safe-by-Design:
 *  - Pure helper. No fetch, no Supabase, no Edge Functions, no I/O.
 *  - Produces a Uint8Array (bytes) the caller wraps in a local Blob.
 *  - No raw sensor rows. No secrets, tokens, user IDs, or internal IDs.
 *
 * The PDF is intentionally hand-rolled to avoid a heavyweight dependency.
 * It supports multi-page wrapped text only — sufficient for a structured
 * preview report.
 */

import {
  buildCsvPreviewReport,
  CSV_PREVIEW_REPORT_VERSION,
  CSV_PREVIEW_STATUS_LABEL,
  type CsvPreviewParseResult,
  type CsvPreviewReportOptions,
} from "@/lib/csvSensorPreviewRules";
import {
  CSV_PREVIEW_WARNING_COPY,
  type FlagCode,
} from "@/lib/csvSensorPreviewWarningCopy";

const PAGE_WIDTH = 612; // US Letter, 72dpi
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const FONT_SIZE = 10;
const LINE_HEIGHT = 13;
const TITLE_SIZE = 16;
const HEADING_SIZE = 12;
const MAX_CHARS_PER_LINE = 92;

const SAFE_BY_DESIGN_NOTE = [
  "Safe-by-Design:",
  "- Preview only. No save.",
  "- Not live data.",
  "- No automation.",
  "- No device control.",
  "- No alerts.",
  "- No Action Queue writes.",
];

function escapePdfText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(text: string, max: number): string[] {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > max && cur) {
      lines.push(cur);
      cur = w.length > max ? w.slice(0, max) : w;
    } else if (candidate.length > max) {
      lines.push(candidate.slice(0, max));
      cur = candidate.slice(max);
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Line {
  text: string;
  size: number;
  /** Vertical gap to add BEFORE this line, in points. */
  gapBefore: number;
}

function pushHeading(lines: Line[], text: string) {
  lines.push({ text, size: HEADING_SIZE, gapBefore: 8 });
}
function pushBody(lines: Line[], text: string) {
  for (const wrapped of wrapLine(text, MAX_CHARS_PER_LINE)) {
    lines.push({ text: wrapped, size: FONT_SIZE, gapBefore: 0 });
  }
}
function pushBullet(lines: Line[], text: string) {
  const wrapped = wrapLine(text, MAX_CHARS_PER_LINE - 2);
  wrapped.forEach((w, i) => {
    lines.push({
      text: i === 0 ? `- ${w}` : `  ${w}`,
      size: FONT_SIZE,
      gapBefore: 0,
    });
  });
}

export type CsvPreviewPdfOptions = CsvPreviewReportOptions;

export function buildCsvPreviewReportPdfBytes(
  preview: CsvPreviewParseResult,
  options: CsvPreviewPdfOptions = {},
): Uint8Array {
  const report = buildCsvPreviewReport(preview, options);

  const lines: Line[] = [];
  lines.push({
    text: "Verdant CSV/TSV Sensor Preview Report",
    size: TITLE_SIZE,
    gapBefore: 0,
  });
  lines.push({
    text: CSV_PREVIEW_STATUS_LABEL,
    size: FONT_SIZE,
    gapBefore: 6,
  });

  pushHeading(lines, "Report metadata");
  pushBullet(lines, `report_version: ${CSV_PREVIEW_REPORT_VERSION}`);
  pushBullet(lines, `generated_at: ${report.generatedAt}`);
  pushBullet(lines, `file_name: ${report.fileName ?? "(unknown)"}`);
  pushBullet(lines, `source_type: ${report.sourceType}`);
  pushBullet(lines, `delimiter: ${report.delimiter}`);
  pushBullet(lines, `row_count: ${report.rowCount}`);
  pushBullet(lines, `status: ${report.statusLabel}`);

  pushHeading(lines, "Detected headers");
  pushBody(lines, report.headers.join(", ") || "(none)");

  pushHeading(lines, "Proposed mappings");
  for (const m of report.proposedMappings) {
    pushBullet(lines, `${m.header} -> ${m.field ?? "unmapped"} (${m.reason})`);
  }

  if (report.userOverrides.length > 0) {
    pushHeading(lines, "User-overridden mappings");
    for (const o of report.userOverrides) {
      pushBullet(lines, `${o.header} -> ${o.field ?? "unmapped"}`);
    }
  }

  pushHeading(lines, "Unmapped fields");
  if (report.unmappedColumns.length === 0) {
    pushBody(lines, "(none)");
  } else {
    for (const u of report.unmappedColumns) pushBullet(lines, u);
  }

  pushHeading(lines, "Validation / suspicious-field warnings");
  if (report.suspiciousFlags.length === 0) {
    pushBody(lines, "No suspicious values detected.");
  } else {
    for (const f of report.suspiciousFlags) {
      const copy = CSV_PREVIEW_WARNING_COPY[f.code as FlagCode];
      pushBullet(
        lines,
        `[${f.severity.toUpperCase()}] ${f.header}: ${copy?.title ?? f.code}`,
      );
      if (copy) {
        pushBody(lines, `  Why it matters: ${copy.whyItMatters}`);
        pushBody(lines, `  Suggested fix: ${copy.suggestedFix}`);
      } else {
        pushBody(lines, `  ${f.message}`);
      }
    }
  }

  pushHeading(lines, "Timeline preview summary");
  pushBullet(lines, `points: ${report.timelinePreview.length}`);
  pushBullet(lines, `time_window: ${report.timeWindow.kind}`);
  pushBullet(lines, `sampling: ${report.sampling}`);

  pushHeading(lines, "Safety");
  for (const s of SAFE_BY_DESIGN_NOTE) pushBody(lines, s);

  return renderPdfFromLines(lines);
}

function renderPdfFromLines(lines: Line[]): Uint8Array {
  // Paginate.
  const pages: Line[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN_TOP;
  for (const line of lines) {
    const advance = line.size + line.gapBefore;
    if (y - advance < MARGIN_BOTTOM) {
      pages.push([]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }
    pages[pages.length - 1].push(line);
    y -= advance;
  }

  // Build content streams per page.
  const contentStreams: string[] = pages.map((pageLines) => {
    const parts: string[] = ["BT", `/F1 ${FONT_SIZE} Tf`];
    let cursorY = PAGE_HEIGHT - MARGIN_TOP;
    let firstOnPage = true;
    let currentFontSize = FONT_SIZE;
    for (const line of pageLines) {
      const dy = line.size + line.gapBefore;
      cursorY -= dy;
      if (line.size !== currentFontSize) {
        parts.push(`/F1 ${line.size} Tf`);
        currentFontSize = line.size;
      }
      if (firstOnPage) {
        parts.push(`1 0 0 1 ${MARGIN_X} ${cursorY} Tm`);
        firstOnPage = false;
      } else {
        parts.push(`1 0 0 1 ${MARGIN_X} ${cursorY} Tm`);
      }
      parts.push(`(${escapePdfText(line.text)}) Tj`);
    }
    parts.push("ET");
    return parts.join("\n");
  });

  // Object plan:
  //   1: Catalog
  //   2: Pages
  //   3..3+N-1: Page N
  //   3+N..3+2N-1: Content N
  //   3+2N: Font
  const pageCount = pages.length;
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pageCount; i++) pageIds.push(3 + i);
  for (let i = 0; i < pageCount; i++) contentIds.push(3 + pageCount + i);
  const fontId = 3 + pageCount * 2;
  const totalObjects = fontId;

  const objects: string[] = [];
  // 1: Catalog
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  // 2: Pages
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  // Page objects
  for (let i = 0; i < pageCount; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
  }
  // Content streams
  for (let i = 0; i < pageCount; i++) {
    const stream = contentStreams[i];
    const bytes = new TextEncoder().encode(stream);
    objects.push(`<< /Length ${bytes.length} >>\nstream\n${stream}\nendstream`);
  }
  // Font
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  // Assemble PDF bytes with xref.
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const objectOffsets: number[] = [];

  const push = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    offset += b.length;
  };

  push("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");

  for (let i = 0; i < objects.length; i++) {
    objectOffsets.push(offset);
    push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 0; i < totalObjects; i++) {
    xref += `${objectOffsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  // Concatenate.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
