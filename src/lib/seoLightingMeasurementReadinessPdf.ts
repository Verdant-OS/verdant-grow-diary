/**
 * Minimal single-page PDF generator for the lighting measurement readiness
 * report. No third-party deps — emits a valid PDF 1.4 text document.
 */
import type { MeasurementReadinessModel } from "./seoLightingMeasurementReadinessRules";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(text: string, max = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = w.length > max ? w.slice(0, max) : w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Build a simple multi-line PDF as a Uint8Array. */
export function buildReadinessReportPdf(
  model: MeasurementReadinessModel,
  opts?: { generatedAtIso?: string },
): Uint8Array {
  const generatedAt = opts?.generatedAtIso ?? new Date().toISOString();
  const lines: string[] = [
    "Verdant Grow Diary — Lighting measurement readiness report",
    `Generated (UTC): ${generatedAt}`,
    `Snapshot: ${model.snapshotGeneratedAt} / ${model.snapshotGeneratedAtChicago}`,
    `Host: ${model.productionHost}`,
    `Verdict: ${model.verdict}`,
    `Summary: ${model.summary.headline}`,
    `Next: ${model.summary.nextAction}`,
    "",
    "=== Sticky summary ===",
    `Overall: ${model.summary.overall}`,
    `PASS ${model.summary.readyCount} · FAIL ${model.summary.failCount} · BLOCKED ${model.summary.blockedCount} · open ${model.summary.incompleteCount}`,
    "",
    "=== GA4 ===",
    `Status: ${model.ga4.status} · Error type: ${model.ga4.errorType}`,
    `Reason: ${model.ga4.reasonCode}`,
    ...wrapLine(model.ga4.explanation),
    ...wrapLine(`Owner action: ${model.ga4.ownerAction}`),
    `Verified UTC: ${model.ga4Verification.verifiedAtUtc ?? "(not marked)"}`,
    `Verified America/Chicago: ${model.ga4Verification.verifiedAtChicago ?? "(not marked)"}`,
    "",
    "=== Search Console ===",
    `Status: ${model.gsc.status} · Error type: ${model.gsc.errorType}`,
    `Reason: ${model.gsc.reasonCode}`,
    ...wrapLine(model.gsc.explanation),
    ...wrapLine(`Owner action: ${model.gsc.ownerAction}`),
    `Verified UTC: ${model.gscVerification.verifiedAtUtc ?? "(not marked)"}`,
    `Verified America/Chicago: ${model.gscVerification.verifiedAtChicago ?? "(not marked)"}`,
    "",
  ];

  for (const page of model.launchPages) {
    lines.push(`=== Launch page: ${page.path} ===`);
    lines.push(`Title: ${page.title}`);
    lines.push(`Overall: ${page.overallStatus}`);
    for (const check of page.checks) {
      const head = `- [${check.status}] ${check.label} · errorType=${check.errorType}`;
      lines.push(...wrapLine(head));
      if (check.explanation) lines.push(...wrapLine(`  ${check.explanation}`));
      if (check.canonical) {
        lines.push(
          ...wrapLine(
            `  Canonical: expected=${check.canonical.expected} observed=${check.canonical.observed ?? "null"} match=${check.canonical.match}`,
          ),
        );
      }
      if (check.sitemap) {
        lines.push(
          ...wrapLine(
            `  Sitemap: included=${check.sitemap.included} occurrences=${check.sitemap.occurrences} (${check.sitemap.detail})`,
          ),
        );
      }
    }
    lines.push("");
  }

  lines.push("=== Checklist ===");
  for (const item of model.checklist) {
    lines.push(`- [${item.status}] ${item.label}`);
  }
  lines.push("");
  lines.push("Internal record only. Contains no credentials.");

  // PDF geometry
  const fontSize = 9;
  const leading = 11;
  const marginLeft = 40;
  let y = 780;
  const contentOps: string[] = ["BT", `/F1 ${fontSize} Tf`, `${marginLeft} ${y} Td`];
  let first = true;
  for (const raw of lines) {
    const safe = escapePdfText(raw);
    if (!first) {
      contentOps.push(`0 -${leading} Td`);
      y -= leading;
      if (y < 50) {
        // simple single-page clip — stop adding rather than corrupt PDF
        contentOps.push(`(…truncated for single-page export…) Tj`);
        break;
      }
    }
    first = false;
    contentOps.push(`(${safe}) Tj`);
  }
  contentOps.push("ET");
  const stream = contentOps.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  );
  objects.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function readinessReportFilename(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `lighting-measurement-readiness-${day}.pdf`;
}
