/**
<<<<<<< HEAD
 * phenoComparisonViewModel
 *
 * Pure view-model for the read-only Pheno Comparison preview page. Turns
 * candidate pheno inputs (already loaded by the caller — in v0 these are
 * demo-labeled fixtures) into a deterministic presenter payload.
 *
 * Hard rules:
 *  - No I/O. No fetch. No Supabase. No AI. No writes. No automation.
 *  - Demo / stale / invalid sensor readings are never treated as healthy.
 *  - Missing context (no photo, no sensor snapshot, missing metric) is
 *    surfaced explicitly, never guessed.
 *  - Deterministic ordering, null-safe on every field.
 */
import {
  normalizePhenoSensorSource,
  phenoSensorSourceLabel,
  isPhenoSensorSourceTrusted,
  type PhenoComparisonSensorSource,
  type PhenoMissingFlag,
  PHENO_MISSING_MESSAGES,
} from "@/lib/phenoComparisonRules";

export interface PhenoQuickLogEntryInput {
  readonly id: string;
  readonly at: string;
  readonly kind?: string | null;
  readonly note?: string | null;
}

export interface PhenoTimelineEventInput {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly summary?: string | null;
}

export interface PhenoPhotoInput {
  readonly id: string;
  readonly at?: string | null;
  readonly caption?: string | null;
  /** Presenter-only URL. May be omitted; the UI shows a placeholder. */
  readonly url?: string | null;
}

export interface PhenoSensorSnapshotInput {
  readonly id: string;
  readonly source?: string | null;
  readonly capturedAt?: string | null;
  readonly tempF?: number | null;
  readonly rh?: number | null;
  readonly vpd?: number | null;
  readonly ec?: number | null;
  readonly ph?: number | null;
  readonly ppfd?: number | null;
}

export interface PhenoCandidateInput {
  readonly candidateId: string;
  readonly candidateLabel?: string | null;
  readonly growLabel?: string | null;
  readonly tentLabel?: string | null;
  readonly plantLabel?: string | null;
  readonly strain?: string | null;
  readonly stage?: string | null;
  readonly quickLogEntries?: readonly PhenoQuickLogEntryInput[] | null;
  readonly timelineEvents?: readonly PhenoTimelineEventInput[] | null;
  readonly photos?: readonly PhenoPhotoInput[] | null;
  readonly sensorSnapshots?: readonly PhenoSensorSnapshotInput[] | null;
  /** Whether the caller wants EC/pH/PPFD tracked as "relevant" (e.g. flower). */
  readonly requireEcPh?: boolean;
  readonly requirePpfd?: boolean;
  /**
   * Optional keeper-hunt phenotype expression (loud trait axes, aroma, smoke
   * test, sex/herm, COA). Consumed by phenoExpressionRules and rendered
   * additively; the core comparison view-model ignores it.
   */
  readonly expression?: import("@/lib/phenoExpressionRules").PhenoExpressionInput | null;
}

export interface PhenoSensorSnapshotView {
  id: string;
  source: PhenoComparisonSensorSource;
  sourceLabel: string;
  trusted: boolean;
  capturedAt: string | null;
  tempF: number | null;
  rh: number | null;
  vpd: number | null;
  ec: number | null;
  ph: number | null;
  ppfd: number | null;
  missing: PhenoMissingFlag[];
}

export interface PhenoCandidateView {
  candidateId: string;
  candidateLabel: string;
  growLabel: string | null;
  tentLabel: string | null;
  plantLabel: string | null;
  strain: string | null;
  stage: string | null;
  quickLogEntries: PhenoQuickLogEntryInput[];
  timelineEvents: PhenoTimelineEventInput[];
  photos: PhenoPhotoInput[];
  sensorSnapshots: PhenoSensorSnapshotView[];
  missing: PhenoMissingFlag[];
  hasAnyTrustedSensor: boolean;
}

export interface PhenoComparisonView {
  readonly ok: boolean;
  readonly error: "too_few_candidates" | null;
  readonly caveat: string;
  readonly candidates: readonly PhenoCandidateView[];
}

export const PHENO_COMPARISON_CAVEAT =
  "Read-only preview. No writes, no automation, no device control. Verdant does not pick a phenotype for you.";

const MIN_CANDIDATES = 2;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flag(code: PhenoMissingFlag["code"]): PhenoMissingFlag {
  return { code, message: PHENO_MISSING_MESSAGES[code] };
}

function buildSnapshotView(
  input: PhenoSensorSnapshotInput,
  requireEcPh: boolean,
  requirePpfd: boolean,
): PhenoSensorSnapshotView {
  const source = normalizePhenoSensorSource(input.source);
  const trusted = isPhenoSensorSourceTrusted(source);
  const tempF = finiteOrNull(input.tempF);
  const rh = finiteOrNull(input.rh);
  const vpd = finiteOrNull(input.vpd);
  const ec = finiteOrNull(input.ec);
  const ph = finiteOrNull(input.ph);
  const ppfd = finiteOrNull(input.ppfd);

  const missing: PhenoMissingFlag[] = [];
  if (source === "stale") missing.push(flag("stale_reading"));
  if (source === "invalid") missing.push(flag("invalid_reading"));
  if (tempF === null) missing.push(flag("missing_temp"));
  if (rh === null) missing.push(flag("missing_rh"));
  if (vpd === null) missing.push(flag("missing_vpd"));
  if (requireEcPh && ec === null) missing.push(flag("missing_ec"));
  if (requireEcPh && ph === null) missing.push(flag("missing_ph"));
  if (requirePpfd && ppfd === null) missing.push(flag("missing_ppfd"));

  return {
    id: input.id,
    source,
    sourceLabel: phenoSensorSourceLabel(source),
    trusted,
    capturedAt: cleanString(input.capturedAt),
    tempF,
    rh,
    vpd,
    ec,
    ph,
    ppfd,
    missing,
  };
}

function buildCandidateView(input: PhenoCandidateInput): PhenoCandidateView {
  const requireEcPh = input.requireEcPh === true;
  const requirePpfd = input.requirePpfd === true;
  const quickLogEntries = [...(input.quickLogEntries ?? [])].sort((a, b) =>
    (b.at ?? "").localeCompare(a.at ?? ""),
  );
  const timelineEvents = [...(input.timelineEvents ?? [])].sort((a, b) =>
    (b.at ?? "").localeCompare(a.at ?? ""),
  );
  const photos = [...(input.photos ?? [])];
  const sensorSnapshots = (input.sensorSnapshots ?? []).map((s) =>
    buildSnapshotView(s, requireEcPh, requirePpfd),
  );

  const missing: PhenoMissingFlag[] = [];
  if (photos.length === 0) missing.push(flag("no_photo"));
  if (sensorSnapshots.length === 0) missing.push(flag("no_sensor_snapshot"));
  if (quickLogEntries.length === 0) missing.push(flag("no_diary"));

  const hasAnyTrustedSensor = sensorSnapshots.some((s) => s.trusted);

  return {
    candidateId: input.candidateId,
    candidateLabel: cleanString(input.candidateLabel) ?? input.candidateId,
    growLabel: cleanString(input.growLabel),
    tentLabel: cleanString(input.tentLabel),
    plantLabel: cleanString(input.plantLabel),
    strain: cleanString(input.strain),
    stage: cleanString(input.stage),
    quickLogEntries,
    timelineEvents,
    photos,
    sensorSnapshots,
    missing,
    hasAnyTrustedSensor,
  };
}

export function buildPhenoComparisonView(
  inputs: readonly PhenoCandidateInput[] | null | undefined,
): PhenoComparisonView {
  const list = Array.isArray(inputs) ? inputs : [];
  if (list.length < MIN_CANDIDATES) {
    return {
      ok: false,
      error: "too_few_candidates",
      caveat: PHENO_COMPARISON_CAVEAT,
      candidates: [],
    };
  }
  const candidates = list.map(buildCandidateView).sort((a, b) => {
    const c = a.candidateLabel.localeCompare(b.candidateLabel);
    if (c !== 0) return c;
    return a.candidateId.localeCompare(b.candidateId);
  });
  return {
    ok: true,
    error: null,
    caveat: PHENO_COMPARISON_CAVEAT,
=======
 * phenoComparisonViewModel — pure view model for the read-only Pheno
 * Comparison preview surface.
 *
 * Turns raw candidate inputs (candidate label, grow/tent/plant context,
 * recent Quick Log entries, timeline events, photo, sensor snapshot) into a
 * presenter-ready comparison model. The presenter renders this shape and
 * never re-derives comparison / missing-data logic in JSX.
 *
 * Hard constraints (see AGENTS.md — Architecture Rules):
 *   - Pure. No I/O, no React, no Supabase, no AI, no writes, no timers.
 *   - Deterministic: same input → same output. Time is injected via `now`.
 *   - Null-safe. Preserves rows with missing fields.
 *   - Stable sorting with explicit tie-breakers.
 *   - Bad/stale/invalid/demo telemetry is never presented as healthy — that
 *     gate lives in {@link classifyPhenoSnapshot} and is surfaced verbatim.
 */
import {
  classifyPhenoSnapshot,
  emptyStateCopy,
  missingFlagLabel,
  sanitizePhotoUrl,
  type ClassifiedSnapshot,
  type MissingDataFlagCode,
  type PhenoSensorSnapshotInput,
} from "./phenoComparisonRules";
import {
  assessPostCure,
  assessReplication,
  assessTimepoint,
  buildSelectionEvidence,
  classifyPhenotype,
  deriveSelectionCaveats,
  gradeComparability,
  PHENO_ENVIRONMENT_CONTEXT_LABEL,
  type ComparabilityCandidate,
  type ComparabilityGrade,
  type PhenotypeInput,
  type PhenotypeTraitCell,
  type PostCureAssessment,
  type PostCureInput,
  type ReplicationAssessment,
  type SelectionCaveat,
  type SelectionEvidence,
  type TimepointAssessment,
} from "./phenoSelectionRules";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PhenoQuickLogInput {
  id: string;
  /** ISO timestamp the entry was logged. */
  at?: string | null;
  /** Entry kind: watering | feeding | note | photo | measurement | … */
  kind?: string | null;
  note?: string | null;
}

export interface PhenoTimelineEventInput {
  id: string;
  /** ISO timestamp the event occurred. */
  at?: string | null;
  /** Event kind / type used to derive a display label. */
  kind?: string | null;
  /** Optional explicit display label. */
  label?: string | null;
}

export interface PhenoCandidateInput {
  id: string;
  /** Candidate label such as "#1". */
  candidateLabel: string;
  plantName?: string | null;
  strain?: string | null;
  stage?: string | null;
  growName?: string | null;
  tentName?: string | null;
  /** Stable grow/tent IDs — authoritative for environment identity. */
  growId?: string | null;
  tentId?: string | null;
  medium?: string | null;
  photoUrl?: string | null;
  /** Day of flower at the compared timepoint (drives alignment). */
  dayOfFlower?: number | null;
  /** How many plants this candidate/pheno represents (replication). */
  replicateCount?: number | null;
  /** Breeder-selection phenotype traits. */
  phenotype?: PhenotypeInput;
  /** Post-cure follow-up. */
  postCure?: PostCureInput | null;
  quickLogs?: readonly PhenoQuickLogInput[];
  timelineEvents?: readonly PhenoTimelineEventInput[];
  /** Environment telemetry — CONTEXT ONLY, never a selection signal. */
  snapshot?: PhenoSensorSnapshotInput | null;
}

export interface PhenoComparisonInput {
  huntName?: string | null;
  /** True when the whole dataset is sample/demo data (must be labeled). */
  isDemo?: boolean;
  candidates: readonly PhenoCandidateInput[];
}

export interface BuildPhenoComparisonOptions {
  /** Injected "now" epoch ms. Defaults to a fixed epoch for determinism. */
  now?: number;
  staleAfterMs?: number;
  maxQuickLogs?: number;
  maxTimelineEvents?: number;
  /** Max day-of-flower spread before candidates are "different timepoints". */
  dayTolerance?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface PhenoQuickLogView {
  id: string;
  at: string | null;
  atLabel: string;
  kind: string;
  kindLabel: string;
  note: string;
}

export interface PhenoTimelineEventView {
  id: string;
  at: string | null;
  atLabel: string;
  kindLabel: string;
}

export interface PhenoMissingFlagView {
  code: MissingDataFlagCode;
  label: string;
  /** Full-sentence, demo-safe empty-state copy for this flag. */
  copy: string;
}

/**
 * Environment telemetry, demoted to context. Never a selection signal — it
 * keeps its own honesty flags (stale/invalid/missing metrics) but does not
 * drive the candidate's selection status or the comparability grade.
 */
export interface PhenoEnvironmentContextView {
  label: string;
  snapshot: ClassifiedSnapshot | null;
  flags: PhenoMissingFlagView[];
}

export interface PhenoCandidateView {
  id: string;
  candidateLabel: string;
  plantName: string;
  strain: string | null;
  stage: string | null;
  growName: string | null;
  tentName: string | null;
  growId: string | null;
  tentId: string | null;
  medium: string | null;
  /** Single-line grow / tent / plant context string. */
  contextLine: string;
  photoUrl: string | null;
  hasPhoto: boolean;
  quickLogs: PhenoQuickLogView[];
  timelineEvents: PhenoTimelineEventView[];
  /** Breeder-selection phenotype traits (recorded vs missing). */
  phenotypeTraits: PhenotypeTraitCell[];
  /** Selection-evidence strength — the card headline. Never a winner claim. */
  selectionEvidence: SelectionEvidence;
  timepoint: TimepointAssessment;
  replication: ReplicationAssessment;
  postCure: PostCureAssessment;
  /** Honest, plain caveats for every selection-evidence gap. */
  selectionCaveats: SelectionCaveat[];
  /** Demoted environment telemetry (context only). */
  environmentContext: PhenoEnvironmentContextView;
}

export interface PhenoComparisonViewModel {
  huntName: string | null;
  isDemo: boolean;
  candidateCount: number;
  /** Grades whether the candidates are even comparable. */
  comparability: ComparabilityGrade;
  candidates: PhenoCandidateView[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Fixed default clock. Keeping this deterministic (rather than Date.now())
 * means fixtures and tests render identically without injecting a clock.
 */
export const PHENO_COMPARISON_DEFAULT_NOW = Date.parse(
  "2026-07-01T12:00:00.000Z",
);

const DEFAULT_MAX_QUICK_LOGS = 5;
const DEFAULT_MAX_TIMELINE_EVENTS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanText(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function nullableText(v: string | null | undefined): string | null {
  const t = cleanText(v);
  return t.length > 0 ? t : null;
}

function parseTs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Compact, locale-independent date label (deterministic). */
function formatAtLabel(iso: string | null): string {
  if (!iso) return "Undated";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Undated";
  // YYYY-MM-DD HH:mm in UTC — deterministic across environments.
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

function titleCaseKind(kind: string): string {
  if (kind.length === 0) return "Entry";
  return kind
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Newest-first ordering with explicit tie-breakers:
 *   1. timestamp desc (undated sinks to the bottom)
 *   2. id asc
 */
function byNewest<T extends { at: string | null; id: string }>(
  a: T,
  b: T,
): number {
  const ta = parseTs(a.at);
  const tb = parseTs(b.at);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildContextLine(input: PhenoCandidateInput): string {
  const parts: string[] = [];
  const grow = nullableText(input.growName);
  const tent = nullableText(input.tentName);
  const plant = nullableText(input.plantName);
  if (grow) parts.push(grow);
  if (tent) parts.push(tent);
  if (plant) parts.push(plant);
  let line = parts.join(" · ");

  const detail: string[] = [];
  const strain = nullableText(input.strain);
  const stage = nullableText(input.stage);
  if (strain) detail.push(strain);
  if (stage) detail.push(stage);
  if (detail.length > 0) {
    line = line ? `${line} (${detail.join(", ")})` : `(${detail.join(", ")})`;
  }
  return line || "Context unavailable";
}

function buildQuickLogViews(
  logs: readonly PhenoQuickLogInput[] | undefined,
  max: number,
): PhenoQuickLogView[] {
  const rows: PhenoQuickLogView[] = (logs ?? []).map((l) => {
    const kind = cleanText(l.kind);
    return {
      id: l.id,
      at: nullableText(l.at),
      atLabel: formatAtLabel(nullableText(l.at)),
      kind: kind || "note",
      kindLabel: titleCaseKind(kind || "note"),
      note: cleanText(l.note),
    };
  });
  rows.sort(byNewest);
  return rows.slice(0, max);
}

function buildTimelineViews(
  events: readonly PhenoTimelineEventInput[] | undefined,
  max: number,
): PhenoTimelineEventView[] {
  const rows: PhenoTimelineEventView[] = (events ?? []).map((e) => {
    const explicit = nullableText(e.label);
    const kind = cleanText(e.kind);
    return {
      id: e.id,
      at: nullableText(e.at),
      atLabel: formatAtLabel(nullableText(e.at)),
      kindLabel: explicit ?? titleCaseKind(kind || "event"),
    };
  });
  rows.sort(byNewest);
  return rows.slice(0, max);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildPhenoComparisonViewModel(
  input: PhenoComparisonInput,
  opts: BuildPhenoComparisonOptions = {},
): PhenoComparisonViewModel {
  const now = opts.now ?? PHENO_COMPARISON_DEFAULT_NOW;
  const maxQuickLogs = opts.maxQuickLogs ?? DEFAULT_MAX_QUICK_LOGS;
  const maxTimelineEvents = opts.maxTimelineEvents ?? DEFAULT_MAX_TIMELINE_EVENTS;

  const candidates: PhenoCandidateView[] = (input.candidates ?? []).map((c) => {
    const photoUrl = sanitizePhotoUrl(c.photoUrl);
    const hasPhoto = photoUrl !== null;

    // Environment telemetry — demoted to context, never a selection signal.
    const snapshot = c.snapshot
      ? classifyPhenoSnapshot(c.snapshot, { now, staleAfterMs: opts.staleAfterMs })
      : null;
    const envCodes: MissingDataFlagCode[] = snapshot
      ? [...snapshot.missingFlags]
      : ["no_sensor_snapshot"];
    const environmentContext: PhenoEnvironmentContextView = {
      label: PHENO_ENVIRONMENT_CONTEXT_LABEL,
      snapshot,
      flags: envCodes.map((code) => ({
        code,
        label: missingFlagLabel(code),
        copy: emptyStateCopy(code),
      })),
    };

    // Selection evidence — the actual basis for comparison.
    const phenotype = classifyPhenotype(c.phenotype);
    const postCure = assessPostCure(c.postCure);
    const selectionEvidence = buildSelectionEvidence(phenotype, postCure.cured);
    const timepoint = assessTimepoint({
      dayOfFlower: c.dayOfFlower,
      stage: c.stage,
    });
    const replication = assessReplication(c.replicateCount);
    const selectionCaveats = deriveSelectionCaveats({
      hasPhoto,
      phenotype,
      selection: selectionEvidence,
      replication,
      timepoint,
      postCure,
    });

    return {
      id: c.id,
      candidateLabel: cleanText(c.candidateLabel) || c.id,
      plantName: cleanText(c.plantName) || "Unnamed candidate",
      strain: nullableText(c.strain),
      stage: nullableText(c.stage),
      growName: nullableText(c.growName),
      tentName: nullableText(c.tentName),
      growId: nullableText(c.growId),
      tentId: nullableText(c.tentId),
      medium: nullableText(c.medium),
      contextLine: buildContextLine(c),
      photoUrl,
      hasPhoto,
      quickLogs: buildQuickLogViews(c.quickLogs, maxQuickLogs),
      timelineEvents: buildTimelineViews(c.timelineEvents, maxTimelineEvents),
      phenotypeTraits: phenotype.traits,
      selectionEvidence,
      timepoint,
      replication,
      postCure,
      selectionCaveats,
      environmentContext,
    };
  });

  const comparabilityCandidates: ComparabilityCandidate[] = candidates.map(
    (c) => ({
      tentId: c.tentId,
      growId: c.growId,
      tentName: c.tentName,
      growName: c.growName,
      medium: c.medium,
      dayOfFlower: c.timepoint.dayOfFlower,
      replicated: c.replication.replicated,
      strength: c.selectionEvidence.strength,
      cured: c.postCure.cured,
    }),
  );

  return {
    huntName: nullableText(input.huntName),
    isDemo: input.isDemo === true,
    candidateCount: candidates.length,
    comparability: gradeComparability(comparabilityCandidates, {
      dayTolerance: opts.dayTolerance,
    }),
>>>>>>> origin/main
    candidates,
  };
}
