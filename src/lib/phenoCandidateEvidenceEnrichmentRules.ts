/**
 * phenoCandidateEvidenceEnrichmentRules — pure mapping from CANONICAL Verdant
 * records (diary_entries rows, the Quick Log sensor snapshot) onto the Pheno
 * Comparison evidence inputs (quick logs, timeline, photos, sensor snapshots).
 *
 * The Pheno Hunt is an evidence layer over the Grow OS: candidates are plants,
 * and their evidence is the plant's OWN diary/photo/sensor history — linked,
 * never copied into a pheno-specific store. This module holds the pure slicing
 * and shaping; the service supplies bounded RLS-scoped rows.
 *
 * Honesty rules: nothing is fabricated — a plant with no fetched entries gets
 * empty arrays (the view-model flags the absence); per-plant caps are explicit
 * and deterministic (newest first, stable id tie-break); sensor snapshots keep
 * their source label verbatim so demo/stale/invalid provenance survives.
 *
 * Pure: no I/O, no Supabase, no React, no clock.
 */
import type {
  PhenoPhotoInput,
  PhenoQuickLogEntryInput,
  PhenoSensorSnapshotInput,
  PhenoTimelineEventInput,
} from "@/lib/phenoComparisonViewModel";

/** The subset of a diary_entries row this mapping needs. */
export interface PhenoDiaryEvidenceRow {
  readonly id: string;
  readonly plant_id: string | null;
  readonly entry_at: string | null;
  readonly note: string | null;
  readonly photo_url: string | null;
  readonly details?: unknown;
}

/** Per-plant caps — explicit, so truncation is a documented property. */
export const PHENO_EVIDENCE_ENTRIES_PER_PLANT = 5;
export const PHENO_EVIDENCE_PHOTOS_PER_PLANT = 4;

export interface PhenoCandidateDiaryEvidence {
  readonly quickLogEntriesByPlantId: Record<string, PhenoQuickLogEntryInput[]>;
  readonly timelineEventsByPlantId: Record<string, PhenoTimelineEventInput[]>;
  readonly photosByPlantId: Record<string, PhenoPhotoInput[]>;
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Event kind from the row's details JSON; "note" when untyped. Data only —
 * never parsed into scores or diagnoses. */
function entryKind(details: unknown): string {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const d = details as Record<string, unknown>;
    const kind = cleanString(d.event_type) ?? cleanString(d.type) ?? cleanString(d.kind);
    if (kind) return kind;
  }
  return "note";
}

function noteSummary(note: string | null): string | null {
  const t = cleanString(note);
  if (!t) return null;
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
}

/**
 * Slice bounded diary rows into per-plant comparison evidence. Rows are
 * re-sorted newest-first (entry_at desc, id desc tie-break) so the result is
 * deterministic regardless of input order; each plant keeps at most
 * PHENO_EVIDENCE_ENTRIES_PER_PLANT entries and PHENO_EVIDENCE_PHOTOS_PER_PLANT
 * photo entries. Retracted rows must be filtered by the caller's query.
 */
export function mapDiaryRowsToCandidateEvidence(
  rows: readonly PhenoDiaryEvidenceRow[] | null | undefined,
): PhenoCandidateDiaryEvidence {
  const quickLogEntriesByPlantId: Record<string, PhenoQuickLogEntryInput[]> = {};
  const timelineEventsByPlantId: Record<string, PhenoTimelineEventInput[]> = {};
  const photosByPlantId: Record<string, PhenoPhotoInput[]> = {};

  const ordered = (Array.isArray(rows) ? rows : [])
    .filter(
      (r): r is PhenoDiaryEvidenceRow =>
        !!r && typeof r.id === "string" && typeof r.plant_id === "string" && r.plant_id.length > 0,
    )
    .slice()
    .sort((a, b) => {
      const at = a.entry_at ?? "";
      const bt = b.entry_at ?? "";
      if (at !== bt) return at < bt ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });

  for (const row of ordered) {
    const plantId = row.plant_id as string;
    const at = cleanString(row.entry_at);
    if (!at) continue;
    const kind = entryKind(row.details);
    const note = noteSummary(row.note);

    const entries = (quickLogEntriesByPlantId[plantId] ??= []);
    if (entries.length < PHENO_EVIDENCE_ENTRIES_PER_PLANT) {
      entries.push({ id: row.id, at, kind, note });
      (timelineEventsByPlantId[plantId] ??= []).push({
        id: row.id,
        at,
        kind,
        summary: note,
      });
    }

    const photoUrl = cleanString(row.photo_url);
    if (photoUrl) {
      const photos = (photosByPlantId[plantId] ??= []);
      if (photos.length < PHENO_EVIDENCE_PHOTOS_PER_PLANT) {
        photos.push({ id: `${row.id}-photo`, at, caption: note, url: photoUrl });
      }
    }
  }

  return { quickLogEntriesByPlantId, timelineEventsByPlantId, photosByPlantId };
}

/** The Quick Log snapshot shape (source + captured_at + normalized metrics). */
export interface TentSensorSnapshotLike {
  readonly source: string | null;
  readonly captured_at: string | null;
  readonly metrics: Readonly<Record<string, number>>;
}

function metricOrNull(metrics: Readonly<Record<string, number>>, key: string): number | null {
  const v = metrics[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Map a tent's latest Quick Log sensor snapshot onto the comparison's sensor
 * input. Metric vocabulary follows quickLogSensorSnapshotAcquisitionRules
 * (temperature °C, humidity %, vpd kPa, soil_ec, ppfd); temperature converts
 * to °F for the comparison's tempF field; pH is not a tent sensor metric here
 * and stays null (missing, never invented). The source label passes through
 * verbatim so stale/invalid/demo provenance survives to the presenter.
 */
export function tentSnapshotToComparisonInput(
  tentId: string,
  snapshot: TentSensorSnapshotLike | null | undefined,
): PhenoSensorSnapshotInput | null {
  if (!snapshot) return null;
  const metrics = snapshot.metrics ?? {};
  const tempC = metricOrNull(metrics, "temperature");
  return {
    id: `${tentId}-latest-snapshot`,
    source: cleanString(snapshot.source),
    capturedAt: cleanString(snapshot.captured_at),
    tempF: tempC === null ? null : Math.round(((tempC * 9) / 5 + 32) * 10) / 10,
    rh: metricOrNull(metrics, "humidity"),
    vpd: metricOrNull(metrics, "vpd"),
    ec: metricOrNull(metrics, "soil_ec"),
    ph: null,
    ppfd: metricOrNull(metrics, "ppfd"),
  };
}
