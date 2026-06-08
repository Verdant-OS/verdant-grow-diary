/**
 * aiDoctorEvidenceViewModel — pure, deterministic VM that groups AI Doctor
 * evidence into source-honest buckets for the "Evidence used" UI panel.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - Environment Check evidence (local EcoWitt validation) is NEVER labeled
 *    `Live` — always `Test/Local validation`.
 *  - Derived VPD is labeled `Derived context`, never a raw sensor reading.
 *  - Rejected / not_checked / stale / invalid / missing metrics never
 *    appear healthy.
 *  - No automation, no device control, no Action Queue writes.
 *  - Visible copy must not echo tokens, user_id, service_role, bridge
 *    tokens, auth headers, or raw internal IDs.
 */

import {
  compileAiDoctorContext,
  type CompileAiDoctorContextInput,
} from "./aiDoctorContextCompiler";
import type { AiDoctorSensorContext } from "./aiDoctorSensorContextRules";

// ---------------------------------------------------------------------------
// Source vocabulary
// ---------------------------------------------------------------------------

export type EvidenceGroupKey =
  | "live"
  | "manual"
  | "csv"
  | "envCheck"
  | "diary"
  | "photos"
  | "missing";

export type EvidenceSourceLabel =
  | "Live"
  | "Manual"
  | "CSV / Imported"
  | "Demo"
  | "Stale"
  | "Invalid"
  | "Test/Local validation"
  | "Missing";

export const EVIDENCE_GROUP_TITLES: Record<EvidenceGroupKey, string> = {
  live: "Live sensor context",
  manual: "Manual sensor context",
  csv: "CSV / imported sensor context",
  envCheck: "Diary Environment Checks",
  diary: "Recent diary / log entries",
  photos: "Recent photos",
  missing: "Missing context",
};

const DERIVED_CONTEXT_LABEL = "Derived context";

// ---------------------------------------------------------------------------
// Item / group shapes (presenter only)
// ---------------------------------------------------------------------------

export interface EvidenceMetricRow {
  key: string;
  label: string;
  statusLabel: "Accepted" | "Rejected" | "Not checked" | "Unknown";
  /** "Derived context" when derived; otherwise the source label. */
  contextLabel: EvidenceSourceLabel | typeof DERIVED_CONTEXT_LABEL;
  /** True when this metric should never be treated as healthy. */
  notHealthy: boolean;
  /** Display value (already string-safe). Null when missing. */
  displayValue: string | null;
  reason: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  sourceLabel: EvidenceSourceLabel;
  /** Optional capture/event timestamp (ISO-8601). */
  capturedAt: string | null;
  /** Short summary line. */
  summary: string;
  /** Per-metric rows (env check only by default). */
  metricRows: EvidenceMetricRow[];
  /** Derived / raw warning notes lifted from upstream context. */
  warnings: string[];
  /** Optional safe "View in timeline" link. */
  timelineHref: string | null;
  /** Cautious copy specific to this item (e.g. rejected metrics). */
  cautionCopy: string;
}

export interface EvidenceGroupVM {
  key: EvidenceGroupKey;
  title: string;
  items: EvidenceItem[];
  /** Empty / missing state copy when items.length === 0. */
  emptyCopy: string;
  isEmpty: boolean;
}

export interface MissingContextItem {
  code:
    | "no-live-sensor"
    | "no-environment-check"
    | "no-diary-logs"
    | "no-recent-photos"
    | "missing-plant-stage"
    | "missing-medium"
    | "missing-recent-watering-or-feeding";
  label: string;
}

export interface LatestEnvironmentCheckSectionVM {
  show: boolean;
  title: "Latest EcoWitt Environment Check";
  sourceLabel: "Test/Local validation";
  isLive: false;
  eventTitle: string;
  capturedAt: string | null;
  selectedStatus:
    | "accepted"
    | "mixed"
    | "weak"
    | "rejected"
    | "not_checked"
    | "missing";
  selectedStatusLabel: string;
  isFallback: boolean;
  timelineHref: string | null;
  /** Always 5 rows, one per required metric (missing rows shown as Missing). */
  metricRows: Array<{
    key: string;
    label: string;
    statusLabel: "Accepted" | "Rejected" | "Not checked" | "Missing";
    /** "Derived context" for VPD, otherwise "Test/Local validation" / "Missing". */
    contextLabel: "Test/Local validation" | "Derived context" | "Missing";
    notHealthy: boolean;
    displayValue: string | null;
    reason: string;
  }>;
  cautionCopy: string;
}

export interface MoreDataNeededChecklistVM {
  show: boolean;
  title: "More data needed";
  items: Array<{
    key: string;
    label: string;
    state: "complete" | "needed";
    reason: string;
  }>;
  cautionCopy: string;
}

export interface AiDoctorEvidencePanelVM {
  /** Ordered groups for rendering. */
  groups: EvidenceGroupVM[];
  /** Structured missing-context list (rendered under the panel). */
  missing: MissingContextItem[];
  /** Cautious top-of-panel copy when evidence is weak/missing. */
  conservativeRecommendationCopy: string;
  /** True when at least one usable evidence item exists. */
  hasAnyEvidence: boolean;
  /** Compact "Latest EcoWitt Environment Check" section. */
  latestEnvironmentCheck: LatestEnvironmentCheckSectionVM;
  /** "More data needed" checklist (shown when env-check missing or weak). */
  moreDataNeeded: MoreDataNeededChecklistVM;
}

// ---------------------------------------------------------------------------
// Optional auxiliary inputs (caller-supplied summaries — already redacted)
// ---------------------------------------------------------------------------

export interface ManualSensorEvidenceInput {
  id?: string | null;
  title?: string | null;
  capturedAt: string | null;
  summary: string;
  source: "manual" | "demo" | "stale" | "invalid";
}

export interface CsvSensorEvidenceInput {
  id?: string | null;
  title?: string | null;
  capturedAt: string | null;
  summary: string;
}

export interface DiaryLogEvidenceInput {
  id?: string | null;
  title: string;
  capturedAt: string | null;
  summary: string;
  /** Optional safe link (must not embed raw UUIDs in copy). */
  timelineHref?: string | null;
}

export interface PhotoEvidenceInput {
  id?: string | null;
  capturedAt: string | null;
  caption?: string | null;
}

export interface BuildEvidenceVMInput extends CompileAiDoctorContextInput {
  /** Optional environment-check timeline href (e.g. /timeline#...). */
  environmentCheckTimelineHref?: string | null;
  /** Manual entries to display (already redacted by caller). */
  manualSensorEvidence?: readonly ManualSensorEvidenceInput[] | null;
  /** CSV/imported sensor entries to display (already redacted). */
  csvSensorEvidence?: readonly CsvSensorEvidenceInput[] | null;
  /** Recent diary log entries to display (already redacted). */
  diaryLogEvidence?: readonly DiaryLogEvidenceInput[] | null;
  /** Recent photos (caller decides which to surface). */
  recentPhotos?: readonly PhotoEvidenceInput[] | null;
  /** Plant context hints used for missing-context detection. */
  plantHints?: {
    hasStage?: boolean;
    hasMedium?: boolean;
    hasRecentWateringOrFeeding?: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceLabelForSensor(
  sourceState: AiDoctorSensorContext["sourceState"],
): EvidenceSourceLabel {
  switch (sourceState) {
    case "live":
      return "Live";
    case "manual":
      return "Manual";
    case "imported":
      return "CSV / Imported";
    case "demo":
      return "Demo";
    case "stale":
      return "Stale";
    case "invalid":
      return "Invalid";
    default:
      return "Missing";
  }
}

function manualSourceLabel(
  source: ManualSensorEvidenceInput["source"],
): EvidenceSourceLabel {
  if (source === "demo") return "Demo";
  if (source === "stale") return "Stale";
  if (source === "invalid") return "Invalid";
  return "Manual";
}

function buildLiveGroup(
  sensor: AiDoctorSensorContext | null,
): EvidenceGroupVM {
  const items: EvidenceItem[] = [];
  if (sensor && sensor.sourceState === "live") {
    items.push({
      id: `live-${sensor.capturedAt}`,
      title: "Live sensor reading",
      sourceLabel: "Live",
      capturedAt: sensor.capturedAt,
      summary: sensor.contextSummary,
      metricRows: [],
      warnings: sensor.invalidMetrics.length
        ? [`Invalid metrics: ${sensor.invalidMetrics.join(", ")}.`]
        : [],
      timelineHref: null,
      cautionCopy:
        sensor.confidenceImpact === "untrusted"
          ? "Live reading is untrusted — do not treat as healthy."
          : "",
    });
  }
  return {
    key: "live",
    title: EVIDENCE_GROUP_TITLES.live,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No recent live sensor reading available.",
  };
}

function buildManualGroup(
  sensor: AiDoctorSensorContext | null,
  manual: readonly ManualSensorEvidenceInput[] | null | undefined,
): EvidenceGroupVM {
  const items: EvidenceItem[] = [];
  if (
    sensor &&
    (sensor.sourceState === "manual" ||
      sensor.sourceState === "stale" ||
      sensor.sourceState === "invalid" ||
      sensor.sourceState === "demo")
  ) {
    items.push({
      id: `sensor-${sensor.sourceState}-${sensor.capturedAt}`,
      title: "Sensor snapshot",
      sourceLabel: sourceLabelForSensor(sensor.sourceState),
      capturedAt: sensor.capturedAt,
      summary: sensor.contextSummary,
      metricRows: [],
      warnings: [],
      timelineHref: null,
      cautionCopy: "",
    });
  }
  if (Array.isArray(manual)) {
    for (const m of manual) {
      items.push({
        id: `manual-${m.id ?? m.capturedAt ?? items.length}`,
        title: m.title?.trim() || "Manual sensor entry",
        sourceLabel: manualSourceLabel(m.source),
        capturedAt: m.capturedAt,
        summary: m.summary,
        metricRows: [],
        warnings: [],
        timelineHref: null,
        cautionCopy: "",
      });
    }
  }
  return {
    key: "manual",
    title: EVIDENCE_GROUP_TITLES.manual,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No recent manual sensor entries.",
  };
}

function buildCsvGroup(
  sensor: AiDoctorSensorContext | null,
  csv: readonly CsvSensorEvidenceInput[] | null | undefined,
): EvidenceGroupVM {
  const items: EvidenceItem[] = [];
  if (sensor && sensor.sourceState === "imported") {
    items.push({
      id: `csv-${sensor.capturedAt}`,
      title: "Imported sensor reading",
      sourceLabel: "CSV / Imported",
      capturedAt: sensor.capturedAt,
      summary: sensor.contextSummary,
      metricRows: [],
      warnings: [],
      timelineHref: null,
      cautionCopy: "",
    });
  }
  if (Array.isArray(csv)) {
    for (const c of csv) {
      items.push({
        id: `csv-${c.id ?? c.capturedAt ?? items.length}`,
        title: c.title?.trim() || "Imported sensor data",
        sourceLabel: "CSV / Imported",
        capturedAt: c.capturedAt,
        summary: c.summary,
        metricRows: [],
        warnings: [],
        timelineHref: null,
        cautionCopy: "",
      });
    }
  }
  return {
    key: "csv",
    title: EVIDENCE_GROUP_TITLES.csv,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No CSV / imported sensor data.",
  };
}

function statusToLabel(
  s: string,
): "Accepted" | "Rejected" | "Not checked" | "Unknown" {
  if (s === "Accepted" || s === "accepted") return "Accepted";
  if (s === "Rejected" || s === "rejected") return "Rejected";
  if (s === "Not checked" || s === "not_checked") return "Not checked";
  return "Unknown";
}

function formatMetricValue(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return String(value);
}

function buildEnvCheckGroup(
  compiled: ReturnType<typeof compileAiDoctorContext>,
  timelineHref: string | null | undefined,
): EvidenceGroupVM {
  const ec = compiled.environmentCheck;
  const items: EvidenceItem[] = [];
  if (ec.kind === "present") {
    const metricRows: EvidenceMetricRow[] = ec.metrics.map((m) => {
      const statusLabel = statusToLabel(m.status);
      const notHealthy = statusLabel !== "Accepted";
      const contextLabel: EvidenceMetricRow["contextLabel"] = m.derived
        ? DERIVED_CONTEXT_LABEL
        : "Test/Local validation";
      return {
        key: m.key,
        label: m.label,
        statusLabel,
        contextLabel,
        notHealthy,
        displayValue: formatMetricValue(m.value),
        reason: m.reason,
      };
    });
    const caution =
      ec.status === "rejected" || ec.rejectedCount > 0
        ? "Some metrics were rejected or not checked and should not be treated as healthy."
        : ec.notCheckedCount > 0 && ec.acceptedCount === 0
          ? "Some metrics were not checked and should not be treated as healthy."
          : "Environment Check evidence is useful context, but it is not live telemetry.";
    items.push({
      id: `envcheck-${ec.capturedAt}`,
      title: "EcoWitt Environment Check",
      sourceLabel: "Test/Local validation",
      capturedAt: ec.capturedAt,
      summary: ec.contextSummary,
      metricRows,
      warnings: [...ec.warnings, ...ec.derivedNotes],
      timelineHref: typeof timelineHref === "string" && timelineHref.length > 0
        ? timelineHref
        : null,
      cautionCopy: caution,
    });
  }
  return {
    key: "envCheck",
    title: EVIDENCE_GROUP_TITLES.envCheck,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No recent Environment Check from local EcoWitt validation.",
  };
}

function buildDiaryGroup(
  diary: readonly DiaryLogEvidenceInput[] | null | undefined,
): EvidenceGroupVM {
  const items: EvidenceItem[] = Array.isArray(diary)
    ? diary.map((d, i) => ({
        id: `diary-${d.id ?? d.capturedAt ?? i}`,
        title: d.title,
        sourceLabel: "Manual" as EvidenceSourceLabel,
        capturedAt: d.capturedAt,
        summary: d.summary,
        metricRows: [],
        warnings: [],
        timelineHref:
          typeof d.timelineHref === "string" && d.timelineHref.length > 0
            ? d.timelineHref
            : null,
        cautionCopy: "",
      }))
    : [];
  return {
    key: "diary",
    title: EVIDENCE_GROUP_TITLES.diary,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No recent diary or log entries.",
  };
}

function buildPhotosGroup(
  photos: readonly PhotoEvidenceInput[] | null | undefined,
): EvidenceGroupVM {
  const items: EvidenceItem[] = Array.isArray(photos)
    ? photos.map((p, i) => ({
        id: `photo-${p.id ?? p.capturedAt ?? i}`,
        title: p.caption?.trim() || "Plant photo",
        sourceLabel: "Manual" as EvidenceSourceLabel,
        capturedAt: p.capturedAt,
        summary: "Recent photo on file.",
        metricRows: [],
        warnings: [],
        timelineHref: null,
        cautionCopy: "",
      }))
    : [];
  return {
    key: "photos",
    title: EVIDENCE_GROUP_TITLES.photos,
    items,
    isEmpty: items.length === 0,
    emptyCopy: "No recent photos on file.",
  };
}

function buildMissingList(args: {
  hasLiveSensor: boolean;
  hasEnvCheck: boolean;
  hasDiary: boolean;
  hasPhotos: boolean;
  hints: BuildEvidenceVMInput["plantHints"];
}): MissingContextItem[] {
  const out: MissingContextItem[] = [];
  if (!args.hasLiveSensor)
    out.push({ code: "no-live-sensor", label: "No recent live sensor readings." });
  if (!args.hasEnvCheck)
    out.push({
      code: "no-environment-check",
      label: "No recent Environment Check.",
    });
  if (!args.hasDiary)
    out.push({ code: "no-diary-logs", label: "No recent diary logs." });
  if (!args.hasPhotos)
    out.push({ code: "no-recent-photos", label: "No recent photos." });
  const hints = args.hints ?? {};
  if (hints.hasStage === false)
    out.push({ code: "missing-plant-stage", label: "Missing plant stage." });
  if (hints.hasMedium === false)
    out.push({ code: "missing-medium", label: "Missing growing medium." });
  if (hints.hasRecentWateringOrFeeding === false)
    out.push({
      code: "missing-recent-watering-or-feeding",
      label: "Missing recent watering or feeding history.",
    });
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const CONSERVATIVE_COPY_NONE =
  "More data is needed before AI Doctor can give strong guidance.";
const CONSERVATIVE_COPY_WEAK =
  "AI Doctor has limited evidence. Recommendations should stay conservative.";
const CONSERVATIVE_COPY_ENVCHECK_ONLY =
  "Environment Check evidence is useful context, but it is not live telemetry.";

export function buildAiDoctorEvidencePanelVM(
  input: BuildEvidenceVMInput,
): AiDoctorEvidencePanelVM {
  const compiled = compileAiDoctorContext({
    sensorContext: input.sensorContext ?? null,
    environmentCheckEvents: input.environmentCheckEvents ?? null,
  });

  const liveGroup = buildLiveGroup(compiled.sensor);
  const manualGroup = buildManualGroup(compiled.sensor, input.manualSensorEvidence);
  const csvGroup = buildCsvGroup(compiled.sensor, input.csvSensorEvidence);
  const envGroup = buildEnvCheckGroup(compiled, input.environmentCheckTimelineHref);
  const diaryGroup = buildDiaryGroup(input.diaryLogEvidence);
  const photoGroup = buildPhotosGroup(input.recentPhotos);

  const hasLiveSensor = !liveGroup.isEmpty;
  const hasEnvCheck = !envGroup.isEmpty;
  const hasDiary = !diaryGroup.isEmpty;
  const hasPhotos = !photoGroup.isEmpty;
  const hasAnyEvidence =
    hasLiveSensor ||
    !manualGroup.isEmpty ||
    !csvGroup.isEmpty ||
    hasEnvCheck ||
    hasDiary ||
    hasPhotos;

  let conservativeCopy = "";
  if (!hasAnyEvidence) {
    conservativeCopy = CONSERVATIVE_COPY_NONE;
  } else if (
    compiled.environmentCheck.kind === "present" &&
    (compiled.environmentCheck.rejectedCount > 0 ||
      compiled.environmentCheck.notCheckedCount > 0)
  ) {
    conservativeCopy = CONSERVATIVE_COPY_WEAK;
  } else if (
    !hasLiveSensor &&
    manualGroup.isEmpty &&
    csvGroup.isEmpty &&
    hasEnvCheck
  ) {
    conservativeCopy = CONSERVATIVE_COPY_ENVCHECK_ONLY;
  }

  const missing = buildMissingList({
    hasLiveSensor,
    hasEnvCheck,
    hasDiary,
    hasPhotos,
    hints: input.plantHints,
  });

  const missingGroup: EvidenceGroupVM = {
    key: "missing",
    title: EVIDENCE_GROUP_TITLES.missing,
    items: missing.map((m) => ({
      id: `missing-${m.code}`,
      title: m.label,
      sourceLabel: "Missing",
      capturedAt: null,
      summary: "",
      metricRows: [],
      warnings: [],
      timelineHref: null,
      cautionCopy: "",
    })),
    isEmpty: missing.length === 0,
    emptyCopy: "No missing context detected.",
  };

  return {
    groups: [
      liveGroup,
      manualGroup,
      csvGroup,
      envGroup,
      diaryGroup,
      photoGroup,
      missingGroup,
    ],
    missing,
    conservativeRecommendationCopy: conservativeCopy,
    hasAnyEvidence,
  };
}
