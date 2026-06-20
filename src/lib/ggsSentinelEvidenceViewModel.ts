/**
 * ggsSentinelEvidenceViewModel — pure helper that converts a
 * GGS Sentinel smoke-runner evaluation into a timeline-safe
 * evidence card model.
 *
 * HARD CONSTRAINTS (stop-ship if violated):
 *   - Pure. No I/O, no Supabase, no fetch, no timers, no console.
 *   - Read-only. Never returns mutate-shaped rows. Does not classify
 *     missing / stale / invalid telemetry as healthy.
 *   - NEVER includes `raw_payload` or any private identifier.
 *     Only the safe `source_app` provenance tag may pass through,
 *     and only via the canonical `vendorLabel` field.
 *   - Deterministic + null-safe.
 *
 * The view-model is intentionally minimal so a presenter component
 * can render it without touching the smoke-runner internals.
 */
import {
  GGS_METRIC_FRIENDLY_NAME,
  type GgsFreshnessStatus,
  type GgsSentinelCheck,
  type GgsSentinelEvaluation,
  type GgsSentinelMetric,
  type GgsSentinelMetricFreshness,
  type GgsSentinelSafeMetricSummary,
  type GgsSentinelState,
} from "@/lib/ggsSentinelSmokeRunner";

export type GgsSentinelEvidenceVerdict = "pass" | "blocked" | "warn" | "unknown";

export interface GgsSentinelEvidenceCheckLine {
  id: string;
  label: string;
  status: GgsSentinelCheck["status"];
  detail: string | null;
}

export interface GgsSentinelEvidenceMetricLine {
  metric: GgsSentinelMetric;
  metricLabel: string;
  capturedAt: string | null;
  ageLabel: string;
  freshness: GgsFreshnessStatus;
  sourceLabel: string | null;
  vendorLabel: string | null;
  /** Plain numeric value of the latest safe reading, or null if missing. */
  value: number | null;
}

export interface GgsSentinelEvidenceViewModel {
  title: string;
  subtitle: string;
  /** Marks this card as a derived, read-only timeline projection. */
  derived: true;
  verdict: GgsSentinelEvidenceVerdict;
  verdictLabel: string;
  state: GgsSentinelState | null;
  /** True when ANY metric is stale / missing / invalid. */
  hasFreshnessWarning: boolean;
  /** Stable, deterministic warning lines for stale/missing/invalid metrics. */
  freshnessWarnings: string[];
  /** Next-step operator guidance lines (read-only, no automation). */
  nextSteps: string[];
  checks: GgsSentinelEvidenceCheckLine[];
  metrics: GgsSentinelEvidenceMetricLine[];
  disclaimer: string;
}

const TITLE = "GGS Sentinel evidence";
const SUBTITLE_DERIVED =
  "Derived from the GGS Sentinel smoke check. Read-only — no alerts, Action Queue, or device control.";
const DISCLAIMER =
  "Evidence only. Verdant does not act on this card. Confirm sensor ingestion before changing irrigation, EC, or setpoints.";

export interface BuildGgsSentinelEvidenceViewModelInput {
  evaluation: GgsSentinelEvaluation | null;
}

export function buildGgsSentinelEvidenceViewModel(
  input: BuildGgsSentinelEvidenceViewModelInput,
): GgsSentinelEvidenceViewModel | null {
  const evaluation = input?.evaluation ?? null;
  if (!evaluation) return null;

  const verdict = mapStateToVerdict(evaluation.state);
  const metricLines = buildMetricLines(
    evaluation.safeMetrics ?? [],
    evaluation.metricFreshness ?? [],
  );
  const checks = (evaluation.checks ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    status: c.status,
    detail: c.detail ?? null,
  }));

  const freshnessWarnings = buildFreshnessWarnings(metricLines);
  const nextSteps = buildNextSteps(evaluation, metricLines);

  return {
    title: TITLE,
    subtitle: SUBTITLE_DERIVED,
    derived: true,
    verdict,
    verdictLabel: verdictLabel(verdict),
    state: evaluation.state ?? null,
    hasFreshnessWarning: freshnessWarnings.length > 0,
    freshnessWarnings,
    nextSteps,
    checks,
    metrics: metricLines,
    disclaimer: DISCLAIMER,
  };
}

function mapStateToVerdict(state: GgsSentinelState | null | undefined): GgsSentinelEvidenceVerdict {
  if (!state) return "unknown";
  if (state === "PASS_LIVE_SENTINEL_READY") return "pass";
  if (state === "BLOCKED_VALIDATION_ERROR") return "warn";
  return "blocked";
}

function verdictLabel(v: GgsSentinelEvidenceVerdict): string {
  if (v === "pass") return "PASS";
  if (v === "blocked") return "BLOCKED";
  if (v === "warn") return "WARN";
  return "UNKNOWN";
}

function buildMetricLines(
  safe: GgsSentinelSafeMetricSummary[],
  freshness: GgsSentinelMetricFreshness[],
): GgsSentinelEvidenceMetricLine[] {
  const safeByMetric = new Map<GgsSentinelMetric, GgsSentinelSafeMetricSummary>();
  for (const m of safe) {
    if (m && m.metric) safeByMetric.set(m.metric, m);
  }
  // Always render one row per canonical metric in deterministic order.
  const ordered: GgsSentinelMetric[] =
    freshness.length > 0
      ? freshness.map((f) => f.metric)
      : (Array.from(safeByMetric.keys()));

  // Deduplicate while preserving order.
  const seen = new Set<GgsSentinelMetric>();
  const lines: GgsSentinelEvidenceMetricLine[] = [];
  for (const metric of ordered) {
    if (seen.has(metric)) continue;
    seen.add(metric);
    const fresh = freshness.find((f) => f.metric === metric) ?? null;
    const s = safeByMetric.get(metric) ?? null;
    lines.push({
      metric,
      metricLabel: GGS_METRIC_FRIENDLY_NAME[metric] ?? metric,
      capturedAt: fresh?.capturedAt ?? s?.captured_at ?? null,
      ageLabel: fresh?.ageLabel ?? "—",
      freshness: fresh?.freshnessStatus ?? "missing",
      sourceLabel: s?.source ? String(s.source) : null,
      vendorLabel: s?.vendor ?? null,
      value: typeof s?.value === "number" && Number.isFinite(s.value) ? s.value : null,
    });
  }
  return lines;
}

function buildFreshnessWarnings(metrics: GgsSentinelEvidenceMetricLine[]): string[] {
  const warnings: string[] = [];
  for (const m of metrics) {
    if (m.freshness === "stale") {
      warnings.push(`${m.metricLabel} reading is stale (captured ${m.ageLabel}).`);
    } else if (m.freshness === "missing") {
      warnings.push(`${m.metricLabel} reading is missing — no recent GGS row found.`);
    }
  }
  return warnings;
}

function buildNextSteps(
  evaluation: GgsSentinelEvaluation,
  metrics: GgsSentinelEvidenceMetricLine[],
): string[] {
  const steps: string[] = [];
  const state = evaluation.state;
  if (state === "BLOCKED_NO_GGS_ROWS") {
    steps.push("Check latest sensor ingestion for this tent.");
  }
  if (state === "BLOCKED_NO_SOIL_TEMP_C" || hasMissingMetric(metrics, "soil_temp_c")) {
    steps.push("Verify soil temperature row.");
  }
  if (state === "BLOCKED_NO_EC" || hasMissingMetric(metrics, "ec")) {
    steps.push("Verify EC row.");
  }
  if (state === "BLOCKED_SOURCE_NOT_CANONICAL") {
    steps.push("Confirm source label is canonical (live / manual / csv).");
  }
  if (state === "BLOCKED_VENDOR_PROVENANCE_MISSING") {
    steps.push("Confirm vendor provenance on the ingested rows.");
  }
  if (metrics.some((m) => m.freshness === "stale")) {
    steps.push("Refresh evidence — at least one metric is past the freshness window.");
  }
  if (state === "BLOCKED_VALIDATION_ERROR") {
    steps.push("Re-run the GGS Sentinel smoke check after resolving the validation error.");
  }
  if (steps.length === 0 && state !== "PASS_LIVE_SENTINEL_READY") {
    steps.push("Refresh evidence by running the GGS Sentinel smoke check again.");
  }
  return Array.from(new Set(steps));
}

function hasMissingMetric(
  metrics: GgsSentinelEvidenceMetricLine[],
  metric: GgsSentinelMetric,
): boolean {
  const found = metrics.find((m) => m.metric === metric);
  if (!found) return true;
  return found.freshness === "missing";
}
