/**
 * environmentCsvTimelineContextViewModel — pure helper that links persisted
 * CSV `sensor_readings` rows to the nearest diary entry inside a configurable
 * time window. CSV data is historical context; this is read-only.
 *
 * Hard constraints:
 *  - Pure / deterministic. No I/O, no React.
 *  - Scopes by grow_id and tent_id; never crosses tents/grows.
 *  - Never relabels CSV as "live". Source is always "csv".
 *  - Supplied VPD is labeled "CSV VPD"; computed VPD stays "Derived VPD".
 *  - Missing or unrecognized VPD provenance stays neutral: "VPD".
 *  - When no match falls inside the window, snapshot is null.
 */

export const CSV_DERIVED_VPD_LABEL = "Derived VPD" as const;
export const CSV_SUPPLIED_VPD_LABEL = "CSV VPD" as const;
export const CSV_UNKNOWN_VPD_LABEL = "VPD" as const;
export const CSV_SNAPSHOT_TITLE = "CSV environment snapshot" as const;
export const CSV_SOURCE_LABEL = "CSV" as const;

const DEFAULT_WINDOW_MIN = 45;
/** Unlinked CSV snapshots on the timeline. Diary-linked snapshots are never capped. */
export const CSV_UNLINKED_TIMELINE_CAP = 12;

export interface CsvSensorReadingRow {
  id?: string | null;
  tent_id?: string | null;
  source?: string | null;
  metric?: string | null;
  value?: number | null;
  captured_at?: string | null;
  raw_payload?: unknown;
}

export interface DiaryEntryLike {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
}

export interface CsvTimelineSnapshot {
  capturedAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  derivedVpdKpa: number | null;
  sourceLabel: typeof CSV_SOURCE_LABEL;
  title: typeof CSV_SNAPSHOT_TITLE;
  derivedVpdLabel:
    typeof CSV_DERIVED_VPD_LABEL | typeof CSV_SUPPLIED_VPD_LABEL | typeof CSV_UNKNOWN_VPD_LABEL;
}

export interface CsvTimelineContextEntry {
  diaryEntryId: string;
  snapshot: CsvTimelineSnapshot | null;
  matchAgeMinutes: number | null;
}

export interface CsvTimelineContextInput {
  diaryEntries: readonly DiaryEntryLike[] | null | undefined;
  sensorReadings: readonly CsvSensorReadingRow[] | null | undefined;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  windowMinutes?: number;
}

function rowGrowId(r: CsvSensorReadingRow): string | null {
  const raw = r.raw_payload as { grow_id?: unknown } | null | undefined;
  if (raw && typeof raw === "object" && typeof raw.grow_id === "string") {
    return raw.grow_id;
  }
  return null;
}

function isCsvRow(r: CsvSensorReadingRow): boolean {
  return (r.source ?? "").trim().toLowerCase() === "csv";
}

function rowVpdLabel(row: CsvSensorReadingRow | undefined): CsvTimelineSnapshot["derivedVpdLabel"] {
  const raw = row?.raw_payload;
  if (raw && typeof raw === "object" && "vpd_source" in raw) {
    if (raw.vpd_source === "csv") return CSV_SUPPLIED_VPD_LABEL;
    if (raw.vpd_source === "derived") return CSV_DERIVED_VPD_LABEL;
  }
  return CSV_UNKNOWN_VPD_LABEL;
}

function rowMs(r: CsvSensorReadingRow): number | null {
  if (!r.captured_at) return null;
  const t = Date.parse(r.captured_at);
  return Number.isFinite(t) ? t : null;
}

function entryMs(e: DiaryEntryLike): number | null {
  const raw = e.occurred_at ?? e.created_at ?? null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Smaller distance wins. Equal distance keeps the earlier timestamp. */
export function pickNearestCsvTimestamp(
  timestamps: Iterable<number>,
  atMs: number,
  windowMs: number,
): { ts: number; delta: number } | null {
  let bestTs: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const ts of timestamps) {
    const delta = Math.abs(ts - atMs);
    if (!Number.isFinite(delta) || delta > windowMs) continue;
    if (bestTs == null || delta < bestDelta || (delta === bestDelta && ts < bestTs)) {
      bestDelta = delta;
      bestTs = ts;
    }
  }
  return bestTs == null ? null : { ts: bestTs, delta: bestDelta };
}

/** Closer diary entry owns a shared snapshot. Equal distance keeps the earlier entry, then the smaller id. */
export function csvEntryOwnsSnapshot(
  candidate: { delta: number; entryAt: number; entryId: string },
  current: { delta: number; entryAt: number; entryId: string },
): boolean {
  if (candidate.delta !== current.delta) return candidate.delta < current.delta;
  if (candidate.entryAt !== current.entryAt) return candidate.entryAt < current.entryAt;
  return candidate.entryId < current.entryId;
}

/**
 * One chip per CSV snapshot (#2736). When several diary entries match the same
 * snapshot, only its owner keeps the chip: the nearest entry, then the earlier
 * entry time, then the lower entry id (`csvEntryOwnsSnapshot`). Entries whose
 * time cannot be parsed keep their match unchanged. Pure and order-independent.
 */
export function keepOneCsvChipPerSnapshot(
  matches: readonly CsvTimelineContextEntry[],
  entryAtById: ReadonlyMap<string, string | null | undefined>,
): CsvTimelineContextEntry[] {
  const owners = new Map<string, { delta: number; entryAt: number; entryId: string }>();
  for (const match of matches) {
    if (!match.snapshot) continue;
    const snapshotAt = Date.parse(match.snapshot.capturedAt);
    const entryAt = Date.parse(entryAtById.get(match.diaryEntryId) ?? "");
    if (!Number.isFinite(snapshotAt) || !Number.isFinite(entryAt)) continue;
    const candidate = {
      delta: Math.abs(snapshotAt - entryAt),
      entryAt,
      entryId: match.diaryEntryId,
    };
    const current = owners.get(match.snapshot.capturedAt);
    if (!current || csvEntryOwnsSnapshot(candidate, current)) {
      owners.set(match.snapshot.capturedAt, candidate);
    }
  }
  return matches.filter((match) => {
    if (!match.snapshot) return false;
    const owner = owners.get(match.snapshot.capturedAt);
    return !owner || owner.entryId === match.diaryEntryId;
  });
}

export function csvOmittedSnapshotCopy(count: number): string {
  const noun = count === 1 ? "snapshot" : "snapshots";
  return `${count} more CSV ${noun} in Sensors`;
}

export interface CsvTimelineWindow {
  snapshots: CsvTimelineSnapshot[];
  /** Unlinked observations past the newest-12 cap. Linked snapshots are all included. */
  omittedUnlinked: number;
}

/** Diary-linked snapshots always stay. Unlinked snapshots keep only the newest 12. */
export class CsvTimelineSnapshotList {
  static window(
    input: Omit<CsvTimelineContextInput, "diaryEntries"> & {
      diaryEntries?: CsvTimelineContextInput["diaryEntries"];
      windowMinutes?: number;
    },
  ): CsvTimelineWindow {
    const grouped = groupCsvSnapshots(input);
    if (!grouped) return { snapshots: [], omittedUnlinked: 0 };
    const { byTs } = grouped;
    const windowMs = Math.max(1, input.windowMinutes ?? DEFAULT_WINDOW_MIN) * 60_000;
    const linked = new Set<number>();
    for (const entry of input.diaryEntries ?? []) {
      if (input.growId && entry.grow_id != null && entry.grow_id !== input.growId) continue;
      if (entry.tent_id != null && entry.tent_id !== input.tentId) continue;
      const eMs = entryMs(entry);
      if (eMs == null) continue;
      const nearest = pickNearestCsvTimestamp(byTs.keys(), eMs, windowMs);
      if (nearest) linked.add(nearest.ts);
    }
    const unlinked = [...byTs.keys()].filter((ts) => !linked.has(ts)).sort((a, b) => b - a);
    const shownUnlinked = unlinked.slice(0, CSV_UNLINKED_TIMELINE_CAP);
    const chosen = [...linked, ...shownUnlinked].sort((a, b) => b - a);
    return {
      snapshots: chosen.map((ts) => snapshotFromGroup(byTs.get(ts) ?? [], ts)),
      omittedUnlinked: Math.max(0, unlinked.length - CSV_UNLINKED_TIMELINE_CAP),
    };
  }

  static distinct(
    input: Omit<CsvTimelineContextInput, "diaryEntries"> & {
      diaryEntries?: CsvTimelineContextInput["diaryEntries"];
      windowMinutes?: number;
    },
  ): CsvTimelineSnapshot[] {
    return CsvTimelineSnapshotList.window(input).snapshots;
  }
}

function groupCsvSnapshots(
  input: Omit<CsvTimelineContextInput, "diaryEntries">,
): { byTs: Map<number, CsvSensorReadingRow[]> } | null {
  const rowsAll = Array.isArray(input.sensorReadings) ? input.sensorReadings : [];
  const { growId, tentId } = input;
  if (!tentId) return null;
  const byTs = new Map<number, CsvSensorReadingRow[]>();
  for (const row of rowsAll) {
    if (!isCsvRow(row)) continue;
    if ((row.tent_id ?? null) !== tentId) continue;
    const rowGrow = rowGrowId(row);
    if (growId && rowGrow && rowGrow !== growId) continue;
    const ts = rowMs(row);
    if (ts == null) continue;
    const list = byTs.get(ts) ?? [];
    list.push(row);
    byTs.set(ts, list);
  }
  return { byTs };
}

function snapshotFromGroup(group: CsvSensorReadingRow[], bestTs: number): CsvTimelineSnapshot {
  const findVal = (metric: string): number | null => {
    const m = group.find((r) => (r.metric ?? "") === metric);
    const v = m?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    capturedAt: new Date(bestTs).toISOString(),
    temperatureC: findVal("temperature_c"),
    humidityPct: findVal("humidity_pct"),
    derivedVpdKpa: findVal("vpd_kpa"),
    sourceLabel: CSV_SOURCE_LABEL,
    title: CSV_SNAPSHOT_TITLE,
    derivedVpdLabel: rowVpdLabel(group.find((r) => (r.metric ?? "") === "vpd_kpa")),
  };
}

export function buildCsvTimelineContext(input: CsvTimelineContextInput): CsvTimelineContextEntry[] {
  const entries = Array.isArray(input.diaryEntries) ? input.diaryEntries : [];
  const rowsAll = Array.isArray(input.sensorReadings) ? input.sensorReadings : [];
  const { growId, tentId } = input;
  const windowMs = Math.max(1, input.windowMinutes ?? DEFAULT_WINDOW_MIN) * 60_000;
  if (!tentId || entries.length === 0) return [];

  // Scope to CSV rows of this tent (and grow when known on the row).
  const rows = rowsAll.filter((r) => {
    if (!isCsvRow(r)) return false;
    if ((r.tent_id ?? null) !== tentId) return false;
    const rg = rowGrowId(r);
    if (growId && rg && rg !== growId) return false;
    return true;
  });

  // Group rows by captured_at so we can build a combined snapshot.
  const byTs = new Map<number, CsvSensorReadingRow[]>();
  for (const r of rows) {
    const t = rowMs(r);
    if (t == null) continue;
    const list = byTs.get(t) ?? [];
    list.push(r);
    byTs.set(t, list);
  }
  const tsList = [...byTs.keys()].sort((a, b) => a - b);

  const out: CsvTimelineContextEntry[] = [];
  for (const entry of entries) {
    if (growId && entry.grow_id != null && entry.grow_id !== growId) {
      out.push({ diaryEntryId: entry.id, snapshot: null, matchAgeMinutes: null });
      continue;
    }
    if (entry.tent_id != null && entry.tent_id !== tentId) {
      out.push({ diaryEntryId: entry.id, snapshot: null, matchAgeMinutes: null });
      continue;
    }
    const eMs = entryMs(entry);
    if (eMs == null) {
      out.push({ diaryEntryId: entry.id, snapshot: null, matchAgeMinutes: null });
      continue;
    }

    const nearest = pickNearestCsvTimestamp(tsList, eMs, windowMs);
    if (nearest == null) {
      out.push({ diaryEntryId: entry.id, snapshot: null, matchAgeMinutes: null });
      continue;
    }
    const snap = snapshotFromGroup(byTs.get(nearest.ts) ?? [], nearest.ts);
    out.push({
      diaryEntryId: entry.id,
      snapshot: snap,
      matchAgeMinutes: Math.round(nearest.delta / 60_000),
    });
  }
  return out;
}
