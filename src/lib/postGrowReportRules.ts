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
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
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

export const POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE =
  "Review demo, stale, or invalid readings manually before acting on any recommendation. " +
  "These readings are useful context, but they should not be treated as current healthy telemetry.";

export const POST_GROW_SENSOR_EMPTY_STATE_COPY =
  "No sensor snapshots were available for this grow. The provenance legend is still included so future readings can be interpreted correctly.";

/** Builds an accessible label for a provenance badge that includes label + meaning. */
export function provenanceBadgeAriaLabel(
  row: Pick<PostGrowSensorProvenanceLegendRow, "label" | "description">,
): string {
  return `Sensor provenance: ${row.label}. ${row.description}`;
}

export function findProvenanceLegendRow(kind: string): PostGrowSensorProvenanceLegendRow | null {
  const normalized = normalizeReportSensorSource(kind);
  return POST_GROW_SENSOR_PROVENANCE_LEGEND.find((r) => r.kind === normalized) ?? null;
}

/**
 * Build the deduplicated, canonical-order badge rows for the in-app
 * Post-Grow report from a list of raw source labels. Empty input →
 * empty output (caller decides not to render).
 */
export function buildProvenanceBadgeRows(
  sources: ReadonlyArray<string | null | undefined>,
): PostGrowSensorProvenanceLegendRow[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const seen = new Set<PostGrowSensorProvenanceLegendRow["kind"]>();
  for (const s of sources) seen.add(normalizeReportSensorSource(s));
  return POST_GROW_SENSOR_PROVENANCE_LEGEND.filter((r) => seen.has(r.kind));
}

/**
 * Redaction patterns for anything that looks like a credential or long
 * opaque token. Applied to every free-text field going into the PDF.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  // ORDER IS LOAD-BEARING — assignments before labels and headers.
  //
  // A rule that runs earlier can destroy the variable NAME, after which the
  // assignment rule below can no longer match and the VALUE survives. Both
  // mechanisms were found in sibling modules and fixed the same way
  // (#1185 `ecowittLocalForwardingStatus`, #1184 `ecowittValidationEvidenceRules`):
  //
  //   1. FRAGMENTING — a bare-word label rule rewrites the label inside a NAME.
  //   2. CONSUMING  — a header rule swallows the whole following token, NAME
  //      included: `bearer BridgeToken=secret` became `[redacted]=secret`.
  //
  // HEADER-PREFIXED assignment, ANY name. Must stay above the `bearer` rule
  // below, which consumes only the NAME and leaves the VALUE behind:
  // `bearer SOME_PLAIN_NAME=secret` became `[redacted]=secret` — output that
  // LOOKS redacted while the credential survives, the most dangerous state a
  // sanitizer can produce. Raised by Copilot on #1187 and confirmed by
  // execution; the `Authorization:` variant was found in the same probe and
  // was not redacted at all, this module having had no Authorization rule.
  //
  // A credential header is the discriminator that makes this safe here: it
  // fires ONLY behind `bearer`/`Authorization`, so bare grow telemetry
  // (`VPD=1.2`, `PPFD=800`, `EC=1.8`) is untouched — which is why this closes
  // the unlabelled-NAME gap that a generic `[A-Z][A-Z0-9_]{2,}=` rule could
  // not close without destroying report content. Pinned by "redacts a
  // header-prefixed assignment with an unlabelled name".
  /\b(?:bearer|authorization)\b\s*:?\s*[A-Za-z0-9._-]+\s*[:=]\s*(?:"[^"]+"|'[^']+'|\S+)/gi,
  // Credential-LABELLED assignments. Deliberately NOT a generic
  // `[A-Z][A-Z0-9_]{2,}=` rule: this helper renders a user-facing grow report
  // and promises to preserve prose, and grow telemetry uses the same uppercase
  // shape — a generic rule would redact `VPD=1.2` and `PPFD=800`. Requiring a
  // credential label in the NAME keeps report content intact. Pinned by
  // "redacts a labelled credential assignment" and "preserves benign report
  // content".
  /\b[A-Za-z0-9_-]*(?:service[_-]?role|passkey|api[_-]?key|secret|password|token)[A-Za-z0-9_-]*\s*[:=]\s*(?:"[^"]+"|'[^']+'|\S+)/gi,
  // Whole BridgeToken assignment — above the header/label rules that would
  // otherwise consume the `BridgeToken` name first.
  /\bBridgeToken\s*[:=]\s*\S+/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT-like
  /sk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /pk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /rk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bservice_role\b/gi,
  /\bbearer\s+[A-Za-z0-9._-]{8,}/gi,
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
export function buildPdfExportFilename(growName: unknown, now: Date = new Date()): string {
  return `verdant-post-grow-report-${slugifyGrowName(growName)}-${isoDateOnly(now)}.pdf`;
}

/** Deterministic document.title used before window.print(). */
export function buildPdfExportTitle(growName: unknown, now: Date = new Date()): string {
  const safeName =
    typeof growName === "string" && growName.trim().length > 0 ? growName.trim() : "Grow";
  return `Verdant — Post-Grow Report — ${redactSecrets(safeName)} — ${isoDateOnly(now)}`;
}

const HEALTHY_SOURCE_KINDS: readonly TimelineSensorSourceKind[] = ["live", "manual", "csv"];

export function normalizeReportSensorSource(input: unknown): TimelineSensorSourceKind {
  // #592 fold: delegate to the sanctioned #1003 canon table — pi_bridge
  // is live, diary is manual, sim is demo, everything else is invalid.
  return normalizeSensorSource(input);
}

export function isReportSensorSourceHealthy(kind: TimelineSensorSourceKind): boolean {
  return HEALTHY_SOURCE_KINDS.includes(kind);
}

export function sensorSourceShortLabel(kind: TimelineSensorSourceKind): string {
  return SENSOR_SOURCE_SHORT_LABEL[kind];
}
