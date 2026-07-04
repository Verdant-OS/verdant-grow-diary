/**
 * postGrowReportRules — pure helpers for the "Export this grow as a PDF
 * report" action on the Post-Grow Learning Report / Reflection surface.
 *
 * Hard constraints (V0 safety):
 *  - Pure. No DOM, no network, no Supabase, no AI, no device control.
 *  - Never render or accept raw_payload, bridge tokens, API keys,
 *    service_role strings, or internal ids in user-facing PDF output.
 *  - Deterministic filename + date slugging.
 *  - Every sensor summary line carries an explicit source label
 *    (live | manual | csv | demo | stale | invalid). Missing/unknown
 *    source resolves to "invalid" and is never labeled healthy or live.
 */

import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import { SENSOR_SOURCE_SHORT_LABEL } from "@/constants/sensorSourceLabels";

export const PDF_EXPORT_HELPER_COPY =
  "Opens your browser print dialog. Choose Save as PDF to download.";
export const PDF_EXPORT_UNAVAILABLE_COPY =
  "PDF export is unavailable in this environment. Try again from a desktop browser.";
export const PDF_EXPORT_PREPARING_COPY = "Preparing report…";
export const PDF_EXPORT_READY_COPY = "Report ready — pick Save as PDF.";
export const PDF_EXPORT_RETRY_COPY = "Retry export";
export const PDF_REPORT_UNAVAILABLE_COPY = "Report unavailable";
export const PDF_EMPTY_SECTION_COPY = "Not enough evidence to summarize this section.";
export const PDF_READ_ONLY_FOOTER =
  "Read-only export. Verdant suggests; the grower decides. No device commands were sent.";
export const PDF_PROVENANCE_LEGEND_COPY =
  "Data sources: Live = connected sensor. Manual = grower entry. CSV = imported history. " +
  "Demo = sample data. Stale = too old to treat as current. Invalid = missing/malformed.";

export const POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE = "Sensor provenance legend";

export interface PostGrowSensorProvenanceLegendRow {
  kind: "live" | "manual" | "csv" | "demo" | "stale" | "invalid";
  label: string;
  description: string;
  healthy: boolean;
}

export const POST_GROW_SENSOR_PROVENANCE_LEGEND: readonly PostGrowSensorProvenanceLegendRow[] = [
  {
    kind: "live",
    label: "Live",
    description: "Connected sensor or bridge reading captured from a real source.",
    healthy: true,
  },
  {
    kind: "manual",
    label: "Manual",
    description: "Reading entered by the grower.",
    healthy: true,
  },
  {
    kind: "csv",
    label: "CSV",
    description: "Reading imported from a CSV or spreadsheet source.",
    healthy: true,
  },
  {
    kind: "demo",
    label: "Demo",
    description: "Sample/demo data; not real grow-room telemetry.",
    healthy: false,
  },
  {
    kind: "stale",
    label: "Stale",
    description: "Old reading that should not be treated as current.",
    healthy: false,
  },
  {
    kind: "invalid",
    label: "Invalid",
    description: "Bad, suspicious, or unusable telemetry.",
    healthy: false,
  },
];
export const PDF_EMPTY_SECTION_COPY = "Not enough evidence to summarize this section.";
export const PDF_READ_ONLY_FOOTER =
  "Read-only export. Verdant suggests; the grower decides. No device commands were sent.";
export const PDF_PROVENANCE_LEGEND_COPY =
  "Data sources: Live = connected sensor. Manual = grower entry. CSV = imported history. " +
  "Demo = sample data. Stale = too old to treat as current. Invalid = missing/malformed.";

/**
 * Redaction patterns for anything that looks like a credential or long
 * opaque token. Applied to every free-text field going into the PDF.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT-like
  /sk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /pk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /rk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bservice_role\b/gi,
  /\bbearer\s+[A-Za-z0-9._-]{8,}/gi,
  /\bBridgeToken\s*[:=]\s*\S+/gi,
  /[A-Fa-f0-9]{32,}/g, // long hex secrets
];

/** Redacts credential-looking substrings. Preserves prose. */
export function redactSecrets(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  return out;
}

/** Canonical filename-safe slug. Lowercase, [a-z0-9-] only. */
export function slugifyGrowName(name: unknown): string {
  if (typeof name !== "string") return "grow";
  const cleaned = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : "grow";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Deterministic YYYY-MM-DD from a Date; falls back to "unknown". */
export function isoDateOnly(d: Date): string {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "unknown";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Deterministic filename for the exported PDF. Uses grow name slug and
 * export date. Never includes ids, tokens, or user identifiers.
 */
export function buildPdfExportFilename(
  growName: unknown,
  now: Date = new Date(),
): string {
  return `verdant-post-grow-report-${slugifyGrowName(growName)}-${isoDateOnly(now)}.pdf`;
}

/** Deterministic document.title used before window.print(). */
export function buildPdfExportTitle(
  growName: unknown,
  now: Date = new Date(),
): string {
  const safeName =
    typeof growName === "string" && growName.trim().length > 0
      ? growName.trim()
      : "Grow";
  return `Verdant — Post-Grow Report — ${redactSecrets(safeName)} — ${isoDateOnly(now)}`;
}

const HEALTHY_SOURCE_KINDS: readonly TimelineSensorSourceKind[] = ["live", "manual", "csv"];

export function normalizeReportSensorSource(input: unknown): TimelineSensorSourceKind {
  if (typeof input !== "string") return "invalid";
  const v = input.trim().toLowerCase();
  switch (v) {
    case "live":
    case "manual":
    case "csv":
    case "demo":
    case "stale":
    case "invalid":
      return v;
    default:
      return "invalid";
  }
}

export function isReportSensorSourceHealthy(kind: TimelineSensorSourceKind): boolean {
  return HEALTHY_SOURCE_KINDS.includes(kind);
}

export function sensorSourceShortLabel(kind: TimelineSensorSourceKind): string {
  return SENSOR_SOURCE_SHORT_LABEL[kind];
}
