/**
 * postGrowReportViewModel — sanitized presentation model for the
 * "Export this grow as a PDF report" action.
 *
 * Pure. Reads only the already-sanitized PostGrowLearningReportViewModel
 * (plus an optional list of sensor source counts) and returns a shape
 * ready to render as print HTML.
 *
 * Never includes raw_payload, tokens, keys, service_role, device
 * commands, or internal ids. Stale / invalid / demo readings are never
 * relabeled as healthy or live.
 */

import type {
  MetricAggregateView,
  PostGrowLearningReportViewModel,
} from "@/lib/postGrowLearningReportRules";
import type { PostGrowLearningLoopSummary } from "@/lib/postGrowLearningLoopSummaryRules";
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import {
  PDF_EMPTY_SECTION_COPY,
  PDF_PROVENANCE_LEGEND_COPY,
  PDF_READ_ONLY_FOOTER,
  isoDateOnly,
  normalizeReportSensorSource,
  redactSecrets,
  sensorSourceShortLabel,
} from "@/lib/postGrowReportRules";

export interface PostGrowReportPdfSensorSourceRow {
  kind: TimelineSensorSourceKind;
  label: string;
  count: number;
  healthy: boolean;
}

export interface PostGrowReportPdfEnvironmentRow {
  label: string;
  unit: string;
  count: number;
  avgText: string;
  rangeText: string;
  stabilityText: string;
}

export interface PostGrowReportPdfModel {
  title: string;
  growName: string;
  dateRangeLabel: string;
  scopeLabel: string;
  generatedAtLabel: string;
  executiveSummary: string[];
  completenessLabel: string;
  completenessMissing: string[];
  environment: PostGrowReportPdfEnvironmentRow[];
  sensorSources: PostGrowReportPdfSensorSourceRow[];
  postHarvestFacts: string[];
  photoCountText: string;
  alertsSummary: string;
  actionsSummary: string[];
  lessonText: string;
  improvedText: string;
  declinedText: string;
  repeatText: string;
  avoidText: string;
  provenanceLegend: string;
  safetyFooter: string;
  /** Optional bounded learning-loop summary (id-free, export-safe). When
   *  absent, the PDF renders no learning section. */
  learningSummary?: PostGrowLearningLoopSummary;
}

export interface BuildPostGrowReportPdfModelOptions {
  /** Injected for tests. Defaults to runtime new Date(). */
  now?: Date;
  /**
   * Optional list of raw sensor rows already fetched for the report.
   * Only the `source` field is inspected — no timestamps, values, or
   * payloads are placed into the PDF.
   */
  sensorReadingSources?: ReadonlyArray<{ source?: string | null }>;
  /** Optional bounded learning-loop summary threaded into the model. */
  learningSummary?: PostGrowLearningLoopSummary;
}

function fmtNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

function environmentRow(metric: MetricAggregateView): PostGrowReportPdfEnvironmentRow {
  const digits = metric.key === "vpd_kpa" ? 2 : 1;
  if (metric.count === 0) {
    return {
      label: metric.label,
      unit: metric.unit,
      count: 0,
      avgText: PDF_EMPTY_SECTION_COPY,
      rangeText: "—",
      stabilityText: "—",
    };
  }
  return {
    label: metric.label,
    unit: metric.unit,
    count: metric.count,
    avgText: `${fmtNumber(metric.avg, digits)} ${metric.unit}`,
    rangeText: `${fmtNumber(metric.min, digits)}–${fmtNumber(metric.max, digits)} ${metric.unit}`,
    stabilityText:
      metric.stablePct === null
        ? `${metric.count} readings`
        : `${metric.stablePct}% in practical range (${metric.count} readings)`,
  };
}

function summarizeSources(
  rows: ReadonlyArray<{ source?: string | null }> | undefined,
): PostGrowReportPdfSensorSourceRow[] {
  const counts = new Map<TimelineSensorSourceKind, number>();
  for (const row of rows ?? []) {
    const kind = normalizeReportSensorSource(row?.source);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const order: TimelineSensorSourceKind[] = [
    "live",
    "manual",
    "csv",
    "demo",
    "stale",
    "invalid",
  ];
  return order
    .filter((k) => (counts.get(k) ?? 0) > 0)
    .map((kind) => ({
      kind,
      label: sensorSourceShortLabel(kind),
      count: counts.get(kind) ?? 0,
      healthy: kind === "live" || kind === "manual" || kind === "csv",
    }));
}

function derivedRepeatAvoid(vm: PostGrowLearningReportViewModel): {
  repeat: string;
  avoid: string;
} {
  const lessonRaw = redactSecrets(vm.lesson.text ?? "").trim();
  if (lessonRaw.length === 0) {
    return { repeat: PDF_EMPTY_SECTION_COPY, avoid: PDF_EMPTY_SECTION_COPY };
  }
  return { repeat: lessonRaw, avoid: lessonRaw };
}

function derivedChangeSummary(vm: PostGrowLearningReportViewModel): {
  improved: string;
  declined: string;
} {
  const improved: string[] = [];
  const declined: string[] = [];
  for (const m of vm.environment) {
    if (m.count === 0 || m.stablePct === null) continue;
    if (m.stablePct >= 70) improved.push(`${m.label}: ${m.stablePct}% in practical range`);
    else if (m.stablePct < 40) declined.push(`${m.label}: only ${m.stablePct}% in practical range`);
  }
  return {
    improved: improved.length ? improved.join("; ") : PDF_EMPTY_SECTION_COPY,
    declined: declined.length ? declined.join("; ") : PDF_EMPTY_SECTION_COPY,
  };
}

export function buildPostGrowReportPdfModel(
  vm: PostGrowLearningReportViewModel,
  opts: BuildPostGrowReportPdfModelOptions = {},
): PostGrowReportPdfModel {
  const now = opts.now ?? new Date();
  const growName = redactSecrets((vm.header.growName ?? "").trim() || "Grow");
  const dateRangeLabel = `${fmtDate(vm.header.startedAt)} – ${fmtDate(vm.header.harvestedAt)}`;
  const scopeLabel = vm.header.archived ? `${growName} (archived)` : growName;

  const executiveSummary = (vm.executiveSummary ?? [])
    .map((line) => redactSecrets(line).trim())
    .filter((line) => line.length > 0);

  const completenessMissing = (vm.dataCompleteness.missing ?? []).map(redactSecrets);

  const environment = vm.environment.map(environmentRow);

  const sensorSources = summarizeSources(opts.sensorReadingSources);

  const postHarvestFacts: string[] = [
    `Final yield: ${
      vm.postHarvest.yieldGrams === null
        ? PDF_EMPTY_SECTION_COPY
        : `${fmtNumber(vm.postHarvest.yieldGrams, 1)} g`
    }`,
    `Weight loss: ${
      vm.postHarvest.weightLossPct === null
        ? PDF_EMPTY_SECTION_COPY
        : `${fmtNumber(vm.postHarvest.weightLossPct, 1)}%`
    }`,
    `RH stabilization: ${
      vm.postHarvest.rhStabilized === null
        ? PDF_EMPTY_SECTION_COPY
        : vm.postHarvest.rhStabilized
          ? "Stable"
          : "Still moving"
    }`,
  ];

  const photoCount = vm.photos?.length ?? 0;
  const photoCountText =
    photoCount === 0
      ? "No photos logged for this grow."
      : `${photoCount} photo${photoCount === 1 ? "" : "s"} logged during the run.`;

  const actionsSummary: string[] = [
    `Completed actions: ${vm.actionEffectiveness.completedActions}`,
    `Outcome notes: ${vm.actionEffectiveness.outcomeNotes}`,
    ...(vm.actionEffectiveness.observations ?? []).map((o) => redactSecrets(o)),
  ];

  const alertsSummary = PDF_EMPTY_SECTION_COPY;

  const lessonText = redactSecrets(vm.lesson.text ?? "").trim() || PDF_EMPTY_SECTION_COPY;
  const { repeat, avoid } = derivedRepeatAvoid(vm);
  const { improved, declined } = derivedChangeSummary(vm);

  return {
    title: `Verdant — Post-Grow Report — ${growName} — ${isoDateOnly(now)}`,
    growName,
    dateRangeLabel,
    scopeLabel,
    generatedAtLabel: now instanceof Date && Number.isFinite(now.getTime())
      ? now.toISOString().replace(/\.\d{3}Z$/, "Z")
      : "unknown",
    executiveSummary,
    completenessLabel: `${vm.dataCompleteness.label} (${vm.dataCompleteness.score}%)`,
    completenessMissing,
    environment,
    sensorSources,
    postHarvestFacts,
    photoCountText,
    alertsSummary,
    actionsSummary,
    lessonText,
    improvedText: improved,
    declinedText: declined,
    repeatText: repeat,
    avoidText: avoid,
    provenanceLegend: PDF_PROVENANCE_LEGEND_COPY,
    safetyFooter: PDF_READ_ONLY_FOOTER,
    learningSummary: opts.learningSummary,
  };
}
