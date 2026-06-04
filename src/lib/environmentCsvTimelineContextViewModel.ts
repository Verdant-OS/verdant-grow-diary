/**
 * environmentCsvTimelineContextViewModel — pure helper that links persisted
 * CSV `sensor_readings` rows to the nearest diary entry inside a configurable
 * time window. CSV data is historical context; this is read-only.
 *
 * Hard constraints:
 *  - Pure / deterministic. No I/O, no React.
 *  - Scopes by grow_id and tent_id; never crosses tents/grows.
 *  - Never relabels CSV as "live". Source is always "csv".
 *  - Derived VPD is labeled "Derived VPD" (never "Live VPD").
 *  - When no match falls inside the window, snapshot is null.
 */

export const CSV_DERIVED_VPD_LABEL = "Derived VPD" as const;
export const CSV_SNAPSHOT_TITLE = "CSV environment snapshot" as const;
export const CSV_SOURCE_LABEL = "CSV" as const;

const DEFAULT_WINDOW_MIN = 45;

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
  derivedVpdLabel: typeof CSV_DERIVED_VPD_LABEL;
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

export function buildCsvTimelineContext(
  input: CsvTimelineContextInput,
): CsvTimelineContextEntry[] {
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

    let bestTs: number | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const t of tsList) {
      const d = Math.abs(t - eMs);
      if (d > windowMs) continue;
      if (d < bestDelta) {
        bestDelta = d;
        bestTs = t;
      }
    }
    if (bestTs == null) {
      out.push({ diaryEntryId: entry.id, snapshot: null, matchAgeMinutes: null });
      continue;
    }
    const group = byTs.get(bestTs) ?? [];
    const findVal = (metric: string): number | null => {
      const m = group.find((r) => (r.metric ?? "") === metric);
      const v = m?.value;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const snap: CsvTimelineSnapshot = {
      capturedAt: new Date(bestTs).toISOString(),
      temperatureC: findVal("temperature_c"),
      humidityPct: findVal("humidity_pct"),
      derivedVpdKpa: findVal("vpd_kpa"),
      sourceLabel: CSV_SOURCE_LABEL,
      title: CSV_SNAPSHOT_TITLE,
      derivedVpdLabel: CSV_DERIVED_VPD_LABEL,
    };
    out.push({
      diaryEntryId: entry.id,
      snapshot: snap,
      matchAgeMinutes: Math.round(bestDelta / 60_000),
    });
  }
  return out;
}
