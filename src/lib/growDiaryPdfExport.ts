/**
 * growDiaryPdfExport — presenter-adjacent helper that renders a
 * printable HTML summary of a grow's diary (counts + recent activity)
 * and opens a print window so the grower can save it as a PDF via
 * their browser's native "Save as PDF".
 *
 * Hard V0 safety constraints:
 *  - Pure builder (`buildGrowDiaryReportModel`, `buildGrowDiaryReportHtml`)
 *    is deterministic, null-safe, and free of I/O.
 *  - No Supabase writes, no Action Queue writes, no AI calls, no
 *    device control, no schema/RLS/Edge changes.
 *  - Never invents chart data — falls back to a summary table and
 *    explicitly states that charts were unavailable.
 *  - Sensor `source` labels are preserved verbatim. `stale`, `invalid`,
 *    and `demo` are flagged and never summarized as "healthy".
 *  - Does not render raw payloads, tokens, secrets, or internal IDs.
 */

import type { CountValue } from "@/lib/growStatus";
import type { RecentItem } from "@/lib/growStatus";

/** Minimal grow context accepted by the PDF builder. */
export interface GrowDiaryPdfGrowContext {
  name: string;
  tentName?: string | null;
  plantNames?: readonly string[] | null;
  startedAt?: string | null;
  stage?: string | null;
}

/** Sensor-source rollup summarised on the report. */
export interface GrowDiaryPdfSourceRollup {
  /** One of: live | manual | csv | demo | stale | invalid | unknown */
  source: string;
  count: number;
}

export interface GrowDiaryPdfCounts {
  diary: CountValue;
  watering?: CountValue;
  feeding?: CountValue;
  photo?: CountValue;
  sensorSnapshots?: CountValue;
  alerts?: CountValue;
}

export interface GrowDiaryPdfChartHint {
  /** Human title (e.g. "Log frequency"). */
  label: string;
  /** Short one-line summary describing what the chart would have shown. */
  summary: string;
}

export interface BuildGrowDiaryReportInput {
  grow: GrowDiaryPdfGrowContext;
  counts: GrowDiaryPdfCounts;
  recent: readonly RecentItem[];
  sensorSources?: readonly GrowDiaryPdfSourceRollup[];
  chartHints?: readonly GrowDiaryPdfChartHint[];
  chartsUnavailableReason?: string | null;
  now?: Date;
}

export interface GrowDiaryPdfModel {
  title: string;
  filename: string;
  generatedAtLabel: string;
  scopeLabel: string;
  dateRangeLabel: string;
  countsRows: Array<{ label: string; value: string }>;
  events: Array<{
    when: string;
    kind: string;
    title: string;
    detail: string;
  }>;
  sensorSources: Array<{
    label: string;
    count: number;
    healthy: boolean;
    note: string;
  }>;
  charts: Array<{ label: string; summary: string }>;
  chartsUnavailableNote: string | null;
  isEmpty: boolean;
  safetyFooter: string;
}

const HEALTHY_SOURCES = new Set(["live", "manual", "csv"]);
const FLAGGED_SOURCES = new Set(["demo", "stale", "invalid", "unknown"]);

function normSource(s: string): string {
  const v = (s ?? "").toString().toLowerCase().trim();
  if (!v) return "unknown";
  return v;
}

function countText(c: CountValue | undefined): string {
  if (c === undefined) return "—";
  if (c === "unavailable") return "unavailable";
  return String(c);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function safeSlug(s: string): string {
  return (s || "grow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "grow";
}

export function buildGrowDiaryReportFilename(growName: string, now: Date): string {
  return `verdant-grow-diary-${safeSlug(growName)}-${isoDate(now)}.pdf`;
}

export function buildGrowDiaryReportModel(
  input: BuildGrowDiaryReportInput,
): GrowDiaryPdfModel {
  const now = input.now ?? new Date();
  const plantNames = (input.grow.plantNames ?? []).filter(Boolean);
  const scopeParts: string[] = [input.grow.name];
  if (input.grow.tentName) scopeParts.push(`Tent: ${input.grow.tentName}`);
  if (plantNames.length > 0) {
    scopeParts.push(`Plants: ${plantNames.slice(0, 6).join(", ")}${plantNames.length > 6 ? "…" : ""}`);
  }

  const startedIso = input.grow.startedAt
    ? tryDateLabel(input.grow.startedAt)
    : null;
  const dateRangeLabel = startedIso
    ? `${startedIso} → ${isoDate(now)}`
    : `Through ${isoDate(now)}`;

  const countsRows = [
    { label: "Diary entries", value: countText(input.counts.diary) },
    { label: "Waterings", value: countText(input.counts.watering) },
    { label: "Feedings", value: countText(input.counts.feeding) },
    { label: "Photos", value: countText(input.counts.photo) },
    { label: "Sensor snapshots", value: countText(input.counts.sensorSnapshots) },
    { label: "Alerts / recommendations", value: countText(input.counts.alerts) },
  ];

  const events = (input.recent ?? []).slice(0, 50).map((r) => ({
    when: tryDateLabel(r.ts),
    kind:
      r.kind === "diary"
        ? "Diary Entry"
        : r.kind === "alert_event"
          ? "Alert Event"
          : "Action Event",
    title: r.title ?? "",
    detail: r.detail ?? "",
  }));

  const sensorSources = (input.sensorSources ?? []).map((s) => {
    const src = normSource(s.source);
    const healthy = HEALTHY_SOURCES.has(src);
    const flagged = FLAGGED_SOURCES.has(src);
    return {
      label: src,
      count: Math.max(0, Math.floor(s.count) || 0),
      healthy,
      note: flagged
        ? "Flagged — not treated as current healthy data."
        : healthy
          ? "Source label preserved from ingest."
          : "Source label preserved.",
    };
  });

  const charts = (input.chartHints ?? []).map((c) => ({
    label: c.label,
    summary: c.summary,
  }));
  const chartsUnavailableNote =
    charts.length === 0
      ? input.chartsUnavailableReason ??
        "Charts were not available in this export. Refer to the counts and events tables below."
      : null;

  const diaryCount =
    typeof input.counts.diary === "number" ? input.counts.diary : 0;
  const isEmpty = diaryCount === 0 && events.length === 0;

  return {
    title: `Grow Diary Summary — ${input.grow.name}`,
    filename: buildGrowDiaryReportFilename(input.grow.name, now),
    generatedAtLabel: now.toISOString(),
    scopeLabel: scopeParts.join(" · "),
    dateRangeLabel,
    countsRows,
    events,
    sensorSources,
    charts,
    chartsUnavailableNote,
    isEmpty,
    safetyFooter:
      "Read-only report. Verdant does not control equipment or run grows on autopilot. Sensor source labels are preserved; stale/invalid/demo readings are not treated as healthy.",
  };
}

function tryDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? "";
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function esc(v: string): string {
  return (v ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildGrowDiaryReportHtml(model: GrowDiaryPdfModel): string {
  const countsRows = model.countsRows
    .map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`)
    .join("");

  const eventsRows = model.events.length
    ? model.events
        .map(
          (e) =>
            `<tr><td>${esc(e.when)}</td><td>${esc(e.kind)}</td><td>${esc(e.title)}</td><td>${esc(e.detail)}</td></tr>`,
        )
        .join("")
    : "";

  const eventsBlock = eventsRows
    ? `<table><thead><tr><th>When</th><th>Kind</th><th>Title</th><th>Detail</th></tr></thead><tbody>${eventsRows}</tbody></table>`
    : `<p class="muted" data-testid="grow-diary-pdf-empty-events">No logged events yet. Start with a Quick Log to begin building your grow memory.</p>`;

  const sourcesBlock = model.sensorSources.length
    ? `<ul class="sources">${model.sensorSources
        .map(
          (s) =>
            `<li><span class="badge ${s.healthy ? "healthy" : "flag"}">${esc(s.label)}</span> · ${s.count} reading${s.count === 1 ? "" : "s"} · ${esc(s.note)}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No sensor snapshots included in this export.</p>`;

  const chartsBlock = model.charts.length
    ? `<ul>${model.charts.map((c) => `<li><strong>${esc(c.label)}:</strong> ${esc(c.summary)}</li>`).join("")}</ul>`
    : `<p class="muted" data-testid="grow-diary-pdf-charts-unavailable">${esc(model.chartsUnavailableNote ?? "Charts unavailable.")}</p>`;

  const emptyBanner = model.isEmpty
    ? `<p class="muted" data-testid="grow-diary-pdf-empty-state">This grow has no logged diary entries yet. This report captures the current empty state so you have a baseline.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(model.title)}</title>
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
<body data-testid="grow-diary-pdf-document">
  <header>
    <h1>${esc(model.title)}</h1>
    <p class="meta"><span class="badge">${esc(model.scopeLabel)}</span> <span class="badge">${esc(model.dateRangeLabel)}</span></p>
    <p class="meta">Generated ${esc(model.generatedAtLabel)}</p>
  </header>

  ${emptyBanner}

  <section><h2>Summary totals</h2><table><tbody>${countsRows}</tbody></table></section>

  <section><h2>Charts</h2>${chartsBlock}</section>

  <section><h2>Key logged events</h2>${eventsBlock}</section>

  <section><h2>Sensor source provenance</h2>${sourcesBlock}<p class="muted">Sensor labels: live, manual, csv, demo, stale, invalid. Demo/stale/invalid readings are flagged and never treated as healthy.</p></section>

  <p class="safety" data-testid="grow-diary-pdf-safety-note">${esc(model.safetyFooter)}</p>
</body>
</html>`;
}

export type ExportGrowDiaryReportResult = "printed" | "unavailable";

export interface ExportGrowDiaryReportOptions {
  win?: Window | null;
}

/**
 * Opens a print window with the sanitized grow diary report and triggers
 * `window.print()`. Returns "unavailable" (never throws) when the popup
 * is blocked or the environment lacks a window.
 */
export function exportGrowDiaryReportAsPdf(
  input: BuildGrowDiaryReportInput,
  opts: ExportGrowDiaryReportOptions = {},
): ExportGrowDiaryReportResult {
  const win =
    opts.win !== undefined
      ? opts.win
      : typeof window !== "undefined"
        ? window
        : null;
  if (!win || typeof win.open !== "function") return "unavailable";
  const model = buildGrowDiaryReportModel(input);
  const html = buildGrowDiaryReportHtml(model);
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
      popup.document.title = model.filename.replace(/\.pdf$/i, "");
    } catch {
      /* ignore */
    }
    popup.focus();
    popup.print();
    return "printed";
  } catch {
    return "unavailable";
  }
}
