/**
 * postGrowReportPrintRules — pure print-friendly HTML builder for the
 * Post-Grow Learning Report. Produces a self-contained HTML string that the
 * caller can render into a popup window and trigger `window.print()`. The
 * grower can then "Save as PDF" from their browser's print dialog.
 *
 * Hard constraints (V0 safety):
 *  - Pure. No DOM, no network, no Supabase, no AI calls.
 *  - Reads only the already-sanitized PostGrowLearningReportViewModel.
 *    Never accepts raw_payload, service-role keys, API tokens, bridge tokens,
 *    or debug JSON.
 *  - Empty sections render honest "Not enough evidence" copy. Missing data
 *    is never described as healthy.
 *  - Includes the grower-approved / no-device-command safety note.
 */
import type {
  MetricAggregateView,
  PostGrowLearningReportViewModel,
} from "./postGrowLearningReportRules";
import {
  renderLearningLoopSectionHtml,
  type PostGrowLearningLoopSummary,
} from "./postGrowLearningLoopSummaryRules";

export const PRINT_HELPER_COPY = "Use your browser print dialog to save this report as PDF.";
export const PRINT_UNAVAILABLE_COPY = "Print export is unavailable in this environment.";
export const PRINT_READ_ONLY_NOTE = "Read-only report.";
export const PRINT_DATA_SOURCE_NOTE =
  "Data sources are shown as logged. Missing data is treated as missing, not healthy.";
export const PRINT_SAFETY_NOTE =
  "Verdant suggestions remain grower-approved. This report does not include device commands.";
export const PRINT_EMPTY_SECTION_COPY = "Not enough evidence to summarize this section.";
export const PRINT_NO_DATA_COPY = "No logged data yet.";

/**
 * Section labels mirror the on-screen Post-Grow report so the printed
 * artifact stays scannable in the same order the grower used to review.
 */
export const PRINT_SECTION_LABELS = {
  whatChanged: "What changed",
  whatWasLogged: "What was logged",
  alertsReviewed: "Alerts reviewed",
  actionsReviewed: "Actions reviewed",
  repeatNextRun: "What to repeat next run",
  avoidNextRun: "What to avoid next run",
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

function metricRow(metric: MetricAggregateView): string {
  const digits = metric.key === "vpd_kpa" ? 2 : 1;
  if (metric.count === 0) {
    return `<tr><th scope="row">${escapeHtml(metric.label)}</th><td colspan="3">${PRINT_EMPTY_SECTION_COPY}</td></tr>`;
  }
  return `<tr><th scope="row">${escapeHtml(metric.label)}</th><td>${fmt(metric.avg, digits)} ${escapeHtml(metric.unit)} avg</td><td>${fmt(metric.min, digits)}–${fmt(metric.max, digits)} ${escapeHtml(metric.unit)}</td><td>${metric.stablePct === null ? "—" : `${metric.stablePct}% in practical range`} (${metric.count} readings)</td></tr>`;
}

export interface BuildPrintHtmlOptions {
  /** ISO timestamp injected for tests; defaults to runtime now() at call time. */
  generatedAt?: string;
  /** Optional bounded learning-loop summary. When absent, no learning
   *  section renders (existing callers/tests are unaffected). */
  learningSummary?: PostGrowLearningLoopSummary;
}

export function buildPostGrowReportPrintHtml(
  vm: PostGrowLearningReportViewModel,
  opts: BuildPrintHtmlOptions = {},
): string {
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const title = `Post-Grow Learning Report — ${vm.header.growName}`;
  const learningLoopSection = opts.learningSummary
    ? renderLearningLoopSectionHtml(opts.learningSummary, escapeHtml)
    : "";
  const summary = vm.executiveSummary.length
    ? `<ul>${vm.executiveSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : `<p class="muted">${PRINT_EMPTY_SECTION_COPY}</p>`;

  const completeness = `<p><strong>Completeness:</strong> ${escapeHtml(vm.dataCompleteness.label)} (${vm.dataCompleteness.score}%)</p>${
    vm.dataCompleteness.missing.length
      ? `<p class="muted">Missing: ${escapeHtml(vm.dataCompleteness.missing.join(", "))}</p>`
      : ""
  }`;

  const sensorRows = vm.environment.map(metricRow).join("");
  const sensorTable = sensorRows
    ? `<table><thead><tr><th>Metric</th><th>Average</th><th>Range</th><th>Stability</th></tr></thead><tbody>${sensorRows}</tbody></table>`
    : `<p class="muted">${PRINT_EMPTY_SECTION_COPY}</p>`;

  const postHarvestFacts = `<ul><li>Final yield: ${vm.postHarvest.yieldGrams === null ? PRINT_NO_DATA_COPY : `${fmt(vm.postHarvest.yieldGrams)} g`}</li><li>Weight loss: ${vm.postHarvest.weightLossPct === null ? PRINT_NO_DATA_COPY : `${fmt(vm.postHarvest.weightLossPct)}%`}</li><li>RH stabilization: ${vm.postHarvest.rhStabilized === null ? "Not enough evidence" : vm.postHarvest.rhStabilized ? "Stable" : "Still moving"}</li></ul>`;
  const postHarvestPoints = vm.postHarvest.points.length
    ? `<ul>${vm.postHarvest.points
        .map(
          (p) =>
            `<li>${escapeHtml(fmtDate(p.capturedAt))} · ${p.weightGrams === null ? "Weight —" : `${fmt(p.weightGrams)} g`} · ${p.rhPct === null ? "RH —" : `${fmt(p.rhPct)}% RH`}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">${PRINT_EMPTY_SECTION_COPY}</p>`;

  const plantHighlights = vm.photos.length
    ? `<p>${vm.photos.length} photo${vm.photos.length === 1 ? "" : "s"} logged across the run.</p>`
    : `<p class="muted">${PRINT_NO_DATA_COPY}</p>`;

  const actionQueueSummary = `<ul><li>Completed actions: ${vm.actionEffectiveness.completedActions}</li><li>Outcome notes: ${vm.actionEffectiveness.outcomeNotes}</li></ul>${
    vm.actionEffectiveness.observations.length
      ? `<ul>${vm.actionEffectiveness.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>`
      : `<p class="muted">${PRINT_EMPTY_SECTION_COPY}</p>`
  }<p class="muted">Action Queue items remain approval-required. Verdant does not auto-execute.</p>`;

  const lessons = vm.lesson.text.trim()
    ? `<p>${escapeHtml(vm.lesson.text)}</p>`
    : `<p class="muted">${PRINT_NO_DATA_COPY}</p>`;

  const dateRange = `${fmtDate(vm.header.startedAt)} – ${fmtDate(vm.header.harvestedAt)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#111;line-height:1.5;padding:32px;max-width:880px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:15px;margin:24px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
  p{margin:6px 0}
  ul{margin:6px 0;padding-left:20px}
  table{width:100%;border-collapse:collapse;margin:6px 0;font-size:12px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f4f4f4}
  .muted{color:#666;font-size:12px}
  .meta{color:#444;font-size:12px;margin-bottom:12px}
  .badge{display:inline-block;border:1px solid #999;border-radius:999px;padding:2px 8px;font-size:11px;margin-right:4px}
  .safety{margin-top:24px;padding:10px 12px;border:1px solid #999;border-radius:8px;background:#f9f9f9;font-size:12px}
  @media print{body{padding:0}.no-print{display:none}}
</style>
</head>
<body data-testid="post-grow-print-document">
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">
      <span class="badge">${escapeHtml(vm.header.stageLabel)}</span>
      ${vm.header.archived ? '<span class="badge">Archived</span>' : ""}
      <span class="badge">${escapeHtml(dateRange)}</span>
    </p>
    <p class="meta">Generated ${escapeHtml(generatedAt)} · ${PRINT_READ_ONLY_NOTE} · ${PRINT_DATA_SOURCE_NOTE}</p>
  </header>

  <section><h2>Run summary</h2><p class="muted">${PRINT_SECTION_LABELS.whatChanged}</p>${summary}${completeness}</section>
  <section><h2>Plant highlights</h2><p class="muted">${PRINT_SECTION_LABELS.whatWasLogged} (photos)</p>${plantHighlights}</section>
  <section><h2>Sensor truth</h2><p class="muted">${PRINT_SECTION_LABELS.whatWasLogged} (environment)</p>${sensorTable}</section>
  <section><h2>Post-harvest performance</h2><p class="muted">${PRINT_SECTION_LABELS.whatWasLogged} (harvest)</p>${postHarvestFacts}${postHarvestPoints}</section>
  <section><h2>Alerts &amp; issues</h2><p class="muted">${PRINT_SECTION_LABELS.alertsReviewed}</p><p class="muted">${PRINT_EMPTY_SECTION_COPY}</p></section>
  <section><h2>Action Queue summary</h2><p class="muted">${PRINT_SECTION_LABELS.actionsReviewed}</p>${actionQueueSummary}</section>
  <section><h2>Lessons · repeat &amp; avoid</h2><p class="muted">${PRINT_SECTION_LABELS.repeatNextRun} · ${PRINT_SECTION_LABELS.avoidNextRun}</p>${lessons}</section>
  ${learningLoopSection}

  <p class="safety" data-testid="post-grow-print-safety-note">${PRINT_SAFETY_NOTE}</p>
  <p class="no-print muted">${PRINT_HELPER_COPY}</p>
</body>
</html>`;
}

/**
 * Side-effecting helper that opens a print window with the rich HTML and
 * triggers `window.print()`. Returns a string status the caller can surface
 * to the grower (e.g. via toast). Never throws.
 */
export type OpenPrintResult = "printed" | "unavailable";

export function openPostGrowReportPrintWindow(
  vm: PostGrowLearningReportViewModel,
  win: Window | null = typeof window !== "undefined" ? window : null,
  opts: BuildPrintHtmlOptions = {},
): OpenPrintResult {
  if (!win || typeof win.open !== "function") return "unavailable";
  let popup: Window | null = null;
  try {
    // No "noopener"/"noreferrer" features here: per spec they make
    // window.open return null, which broke printing in real browsers. The
    // popup is a same-origin about:blank document we document.write
    // ourselves, so there is no cross-origin opener risk to sever.
    popup = win.open("", "_blank");
  } catch {
    return "unavailable";
  }
  if (!popup) return "unavailable";
  try {
    popup.document.write(buildPostGrowReportPrintHtml(vm, opts));
    popup.document.close();
    popup.focus();
    popup.print();
    return "printed";
  } catch {
    return "unavailable";
  }
}
