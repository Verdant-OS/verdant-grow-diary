/**
 * postGrowPdfExport — presenter-adjacent helpers that open a print
 * window with a sanitized post-grow report HTML document and set a
 * deterministic document.title so browsers suggest a safe filename
 * when the grower picks "Save as PDF".
 *
 * Hard constraints (V0 safety):
 *  - No AI calls, no Supabase writes, no Action Queue writes,
 *    no device control, no schema/RLS/Edge changes.
 *  - Pure HTML builder is deterministic and null-safe.
 *  - All free text is passed through redactSecrets() before rendering.
 *  - Every sensor summary line carries its source label. Stale /
 *    invalid / demo readings are never rendered as healthy.
 */

import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";
import {
  buildPdfExportFilename,
  buildPdfExportTitle,
  PDF_EXPORT_UNAVAILABLE_COPY,
  POST_GROW_SENSOR_EMPTY_STATE_COPY,
  POST_GROW_SENSOR_PROVENANCE_LEGEND,
  POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE,
  POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE,
  provenanceBadgeAriaLabel,
} from "@/lib/postGrowReportRules";
import {
  buildPostGrowReportPdfModel,
  type BuildPostGrowReportPdfModelOptions,
  type PostGrowReportPdfModel,
} from "@/lib/postGrowReportViewModel";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(items: readonly string[]): string {
  if (items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

export function buildPostGrowReportPdfHtml(model: PostGrowReportPdfModel): string {
  const envRows = model.environment
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(r.avgText)}</td><td>${escapeHtml(r.rangeText)}</td><td>${escapeHtml(r.stabilityText)}</td></tr>`,
    )
    .join("");
  const envTable = envRows
    ? `<table><thead><tr><th>Metric</th><th>Average</th><th>Range</th><th>Stability</th></tr></thead><tbody>${envRows}</tbody></table>`
    : `<p class="muted">No environment aggregates available.</p>`;

  const sourceRows = model.sensorSources
    .map(
      (s) =>
        `<li><span class="badge ${s.healthy ? "healthy" : "flag"}">${escapeHtml(s.label)}</span> · ${s.count} reading${s.count === 1 ? "" : "s"}${s.healthy ? "" : " · not treated as current"}</li>`,
    )
    .join("");
  const sourceBlock = sourceRows
    ? `<ul class="sources">${sourceRows}</ul>`
    : `<p class="muted" data-testid="post-grow-pdf-sensor-empty-state">${escapeHtml(POST_GROW_SENSOR_EMPTY_STATE_COPY)}</p>`;

  const completenessMissing = model.completenessMissing.length
    ? `<p class="muted">Missing: ${escapeHtml(model.completenessMissing.join(", "))}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#111;line-height:1.5;padding:32px;max-width:880px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
  p{margin:6px 0}
  ul{margin:6px 0;padding-left:20px}
  table{width:100%;border-collapse:collapse;margin:6px 0;font-size:12px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f4f4f4}
  .muted{color:#666;font-size:12px}
  .meta{color:#444;font-size:12px;margin-bottom:12px}
  .badge{display:inline-block;border:1px solid #999;border-radius:999px;padding:1px 8px;font-size:11px;margin-right:4px}
  .badge.healthy{border-color:#2a7}
  .badge.flag{border-color:#c62;color:#a40}
  .sources{list-style:none;padding-left:0}
  .safety{margin-top:24px;padding:10px 12px;border:1px solid #999;border-radius:8px;background:#f9f9f9;font-size:12px}
  @media print{body{padding:0}.no-print{display:none}}
</style>
</head>
<body data-testid="post-grow-pdf-document">
  <header>
    <h1>${escapeHtml(model.title)}</h1>
    <p class="meta">
      <span class="badge">${escapeHtml(model.scopeLabel)}</span>
      <span class="badge">${escapeHtml(model.dateRangeLabel)}</span>
    </p>
    <p class="meta">Generated ${escapeHtml(model.generatedAtLabel)}</p>
  </header>

  <section><h2>Run summary</h2>${
    model.executiveSummary.length
      ? list(model.executiveSummary)
      : `<p class="muted">Not enough evidence to summarize this section.</p>`
  }<p><strong>Completeness:</strong> ${escapeHtml(model.completenessLabel)}</p>${completenessMissing}</section>

  <section><h2>Tents &amp; plants included</h2><p>${escapeHtml(model.scopeLabel)}</p><p class="muted">${escapeHtml(model.photoCountText)}</p></section>

  <section><h2>Sensor snapshot summary</h2>${envTable}<p class="muted">Source provenance:</p>${sourceBlock}<p class="muted"><a class="legend-anchor" data-testid="post-grow-pdf-legend-anchor" href="#sensor-provenance-legend">Back to provenance legend</a></p></section>

  <section><h2>Post-harvest performance</h2>${list(model.postHarvestFacts)}</section>

  <section><h2>Alerts &amp; recommendations</h2><p class="muted">${escapeHtml(model.alertsSummary)}</p></section>

  <section><h2>Actions reviewed</h2>${list(model.actionsSummary)}<p class="muted">Action Queue items remain approval-required. Verdant does not auto-execute.</p></section>

  <section><h2>Reflection · lessons learned</h2><p>${escapeHtml(model.lessonText)}</p></section>

  <section><h2>What improved · what declined</h2><p><strong>Improved:</strong> ${escapeHtml(model.improvedText)}</p><p><strong>Declined:</strong> ${escapeHtml(model.declinedText)}</p></section>

  <section><h2>What to repeat · what to avoid next run</h2><p><strong>Repeat:</strong> ${escapeHtml(model.repeatText)}</p><p><strong>Avoid:</strong> ${escapeHtml(model.avoidText)}</p></section>

  <section id="sensor-provenance-legend" data-testid="post-grow-pdf-provenance-legend" aria-labelledby="post-grow-pdf-provenance-legend-heading"><h2 id="post-grow-pdf-provenance-legend-heading">${escapeHtml(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE)}</h2><table aria-label="${escapeHtml(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE)}"><caption class="muted">${escapeHtml(POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE)}</caption><thead><tr><th scope="col">Label</th><th scope="col">Meaning</th></tr></thead><tbody>${POST_GROW_SENSOR_PROVENANCE_LEGEND.map(
    (row) =>
      `<tr><th scope="row"><span class="badge ${row.healthy ? "healthy" : "flag"}" aria-label="${escapeHtml(provenanceBadgeAriaLabel(row))}">${escapeHtml(row.label)}</span></th><td>${escapeHtml(row.description)}</td></tr>`,
  ).join("")}</tbody></table><p class="muted" data-testid="post-grow-pdf-provenance-review-note">${escapeHtml(POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE)}</p></section>

  <p class="muted">${escapeHtml(model.provenanceLegend)}</p>
  <p class="safety" data-testid="post-grow-pdf-safety-note">${escapeHtml(model.safetyFooter)}</p>
</body>
</html>`;
}

export type ExportPostGrowReportResult = "printed" | "unavailable";

export interface ExportPostGrowReportOptions extends BuildPostGrowReportPdfModelOptions {
  /** Overrideable for tests. Defaults to global window. */
  win?: Window | null;
}

/**
 * Opens a print window with the sanitized PDF-ready report and triggers
 * `window.print()`. Sets a deterministic document.title so browsers
 * suggest the correct filename. Never throws.
 */
export function exportPostGrowReportAsPdf(
  vm: PostGrowLearningReportViewModel,
  opts: ExportPostGrowReportOptions = {},
): ExportPostGrowReportResult {
  const win = opts.win !== undefined ? opts.win : typeof window !== "undefined" ? window : null;
  if (!win || typeof win.open !== "function") return "unavailable";
  const now = opts.now ?? new Date();
  const model = buildPostGrowReportPdfModel(vm, { now, sensorReadingSources: opts.sensorReadingSources });
  const html = buildPostGrowReportPdfHtml(model);
  const filenameTitle = buildPdfExportTitle(vm.header.growName, now);

  let popup: Window | null = null;
  try {
    popup = win.open("", "_blank", "noopener,noreferrer");
  } catch {
    return "unavailable";
  }
  if (!popup) return "unavailable";
  try {
    popup.document.write(html);
    popup.document.close();
    try {
      popup.document.title = filenameTitle;
    } catch {
      /* ignore title set failure */
    }
    popup.focus();
    popup.print();
    return "printed";
  } catch {
    return "unavailable";
  }
}

export { buildPdfExportFilename, PDF_EXPORT_UNAVAILABLE_COPY };
