/**
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
  /**
   * Owner-assigned pheno candidate number (plants.candidate_number). Unique per
   * hunt, positive integer, immutable within a hunt. NULL/absent = legacy or
   * unnumbered candidate. Never fabricated — carried through honestly.
   */
  readonly candidateNumber?: number | null;
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
  /** Validated positive-integer candidate number, or null when unnumbered. */
  candidateNumber: number | null;
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

/** A valid candidate number is a finite positive integer; else null. */
function validCandidateNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
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
  if (source === "invalid" || source === "live") missing.push(flag("invalid_reading"));
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
    candidateNumber: validCandidateNumber(input.candidateNumber),
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
    candidates,
  };
}
