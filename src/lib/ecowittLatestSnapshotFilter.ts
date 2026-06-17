/**
 * ecowittLatestSnapshotFilter — pure helper that turns persisted
 * `sensor_readings` rows into per-tent/plant EcoWitt snapshot candidates.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O.
 *  - Read-only. Never writes to alerts, action_queue, or device control.
 *  - Honors tent/plant scoping: a newer reading from a different tent
 *    must NEVER bleed into the selected tent's snapshot.
 *  - Never fabricates a "live" reading and never relabels demo data as live.
 *  - Does not call source label rules — that stays in
 *    `ecowittReadingViewModel` so labeling lives in one place.
 */
import {
  buildEcowittSnapshotViewModel,
  type BuildEcowittSnapshotOptions,
  type EcowittCandidate,
  type EcowittSnapshotViewModel,
} from "@/lib/ecowittReadingViewModel";
import type { SensorReadingSource } from "@/mock";

/** Minimal shape we need from a `sensor_readings` row. */
export interface EcowittSensorReadingRow {
  id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  raw_payload?: unknown;
}

export interface EcowittLatestSnapshotFilter {
  tentId: string;
  /** Optional plant filter. When set, only rows tagged with this plant
   *  are considered. */
  plantId?: string | null;
}

/** Sources we trust as EcoWitt-derived. Vendor lineage may also live in
 *  `raw_payload.vendor`. */
const ECOWITT_SOURCES = new Set<string>(["ecowitt", "live", "manual"]);

function isEcowittRow(row: EcowittSensorReadingRow): boolean {
  const src = (row.source ?? "").trim().toLowerCase();
  if (src === "ecowitt") return true;
  const raw = row.raw_payload;
  if (raw && typeof raw === "object") {
    const r = raw as {
      vendor?: unknown;
      source?: unknown;
      transport_source?: unknown;
    };
    const lineageFields: unknown[] = [r.vendor, r.source, r.transport_source];
    for (const field of lineageFields) {
      if (typeof field === "string") {
        const f = field.trim().toLowerCase();
        // Accept canonical "ecowitt" and any vendor lineage starting with
        // "ecowitt" (e.g. "ecowitt_windows_testbench") so live-forwarded
        // rows stored as source="live" still resolve as EcoWitt-derived.
        if (f === "ecowitt" || f.startsWith("ecowitt")) return true;
      }
    }
  }
  // Canonical V0 "live" source rows are EcoWitt-derived only when their
  // raw_payload carries EcoWitt vendor lineage (handled above). We do NOT
  // accept bare source="live" without lineage to avoid bleeding unrelated
  // live ingest paths into this card.
  return false;
}

function resolveCandidateSource(
  row: EcowittSensorReadingRow,
): SensorReadingSource {
  const src = (row.source ?? "").trim().toLowerCase();
  if (src === "manual") return "manual";
  if (src === "demo") return "demo";
  // Treat all listener-tagged EcoWitt rows as "live" candidates; the
  // view-model will demote stale ones to "stale" via freshness.
  return "live";
}

/**
 * Filter persisted sensor_readings rows by tent (and optional plant),
 * keeping only EcoWitt-tagged rows that carry a usable raw_payload, then
 * convert them to EcoWitt candidates ready for `buildEcowittSnapshotViewModel`.
 */
export function selectEcowittCandidates(
  rows: readonly EcowittSensorReadingRow[] | null | undefined,
  filter: EcowittLatestSnapshotFilter,
): EcowittCandidate[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!filter || !filter.tentId) return [];

  const out: EcowittCandidate[] = [];
  for (const row of rows) {
    if ((row.tent_id ?? null) !== filter.tentId) continue;
    if (filter.plantId != null && (row.plant_id ?? null) !== filter.plantId) {
      continue;
    }
    if (!isEcowittRow(row)) continue;

    const raw = row.raw_payload;
    if (!raw || typeof raw !== "object") continue;

    out.push({
      payload: raw,
      source: resolveCandidateSource(row),
      receivedAt:
        (typeof row.captured_at === "string" && row.captured_at) ||
        (typeof row.ts === "string" && row.ts) ||
        undefined,
    });
  }

  return out;
}

/**
 * One-call convenience: filter + build snapshot view-model for the
 * selected grow/tent/plant.
 */
export function buildEcowittLatestSnapshot(
  rows: readonly EcowittSensorReadingRow[] | null | undefined,
  filter: EcowittLatestSnapshotFilter,
  options: BuildEcowittSnapshotOptions = {},
): EcowittSnapshotViewModel {
  const candidates = selectEcowittCandidates(rows, filter);
  return buildEcowittSnapshotViewModel(candidates, options);
}
