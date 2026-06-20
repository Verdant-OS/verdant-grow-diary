/**
 * plantSensorContextAuditViewModel — pure read-only view model for the
 * Plant Detail "Sensor context for AI Doctor" panel.
 *
 * Hard constraints:
 *  - No I/O. No React. No Supabase. No fetch. No model calls.
 *  - Never invents readings. Only `typeof v === "number"` finite numbers
 *    are recognized as present metrics.
 *  - Source labels are passed through honestly; this helper never
 *    fabricates "live", "demo", or "csv" sources.
 *  - Time is injectable for deterministic tests.
 */
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";

/** A plant-level manual sensor snapshot is "stale" when older than this. */
export const PLANT_SENSOR_CONTEXT_STALE_HOURS = 72;
const HOUR_MS = 3_600_000;

export type PlantSensorContextStatus =
  | "missing"
  | "stale"
  | "limited"
  | "strong";

export interface PlantSensorContextMetric {
  key: string;
  label: string;
}

export interface PlantSensorContextAuditView {
  status: PlantSensorContextStatus;
  recentLogCount: number;
  latestCapturedAt: string | null;
  ageHours: number | null;
  metrics: PlantSensorContextMetric[];
  sources: string[];
  message: string;
}

const METRIC_LABELS: Record<string, string> = {
  temp_f: "Temperature",
  temperature: "Temperature",
  temperature_c: "Temperature",
  humidity_percent: "Humidity",
  humidity: "Humidity",
  humidity_pct: "Humidity",
  ph: "pH",
  ec: "EC",
  vpd: "VPD",
  vpd_kpa: "VPD",
  co2: "CO₂",
  co2_ppm: "CO₂",
  soil_moisture: "Soil moisture",
  soil_moisture_pct: "Soil moisture",
};

const ENVIRONMENT_LABELS = new Set(["Temperature", "Humidity", "VPD", "CO₂"]);
const ROOT_ZONE_LABELS = new Set(["pH", "EC", "Soil moisture"]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function labelFor(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  const cleaned = key.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function safeMetricsOf(log: ManualSensorLog): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = (log as { metrics?: unknown }).metrics;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isFiniteNumber(v)) out[k] = v;
  }
  return out;
}

export function buildPlantSensorContextAuditView(
  rawLogs: ReadonlyArray<ManualSensorLog> | null | undefined,
  now: string | Date = new Date(),
): PlantSensorContextAuditView {
  const nowMs =
    now instanceof Date ? now.getTime() : parseMs(now as string) ?? Date.now();

  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  // Keep only logs with parseable capturedAt
  const dated = logs
    .map((l) => ({ log: l, ms: parseMs(l?.capturedAt) }))
    .filter((x): x is { log: ManualSensorLog; ms: number } => x.ms !== null)
    .sort((a, b) => b.ms - a.ms);

  if (dated.length === 0) {
    return {
      status: "missing",
      recentLogCount: 0,
      latestCapturedAt: null,
      ageHours: null,
      metrics: [],
      sources: [],
      message:
        "No plant-level manual sensor snapshots found. AI Doctor will treat sensor context as missing.",
    };
  }

  const latest = dated[0];
  const ageHours = Math.max(0, (nowMs - latest.ms) / HOUR_MS);
  const isStale = ageHours > PLANT_SENSOR_CONTEXT_STALE_HOURS;

  // Collect distinct sources honestly from the rows themselves.
  const sourceSet = new Set<string>();
  for (const { log } of dated) {
    const src =
      typeof log.source === "string" && log.source.trim().length > 0
        ? log.source.trim()
        : null;
    if (src) sourceSet.add(src);
  }
  const sources = Array.from(sourceSet).sort();

  // Union of present metric keys across all logs.
  const presentKeys = new Set<string>();
  for (const { log } of dated) {
    const m = safeMetricsOf(log);
    for (const k of Object.keys(m)) presentKeys.add(k);
  }

  // Deduplicate by display label so synonymous keys map to one entry.
  const seenLabel = new Set<string>();
  const metrics: PlantSensorContextMetric[] = [];
  for (const key of Array.from(presentKeys).sort()) {
    const label = labelFor(key);
    if (seenLabel.has(label)) continue;
    seenLabel.add(label);
    metrics.push({ key, label });
  }

  if (isStale) {
    return {
      status: "stale",
      recentLogCount: dated.length,
      latestCapturedAt: latest.log.capturedAt,
      ageHours,
      metrics,
      sources,
      message:
        "Latest plant-level sensor snapshot is stale. AI Doctor will treat this as limited context.",
    };
  }

  const labels = metrics.map((m) => m.label);
  const hasEnvironment = labels.some((l) => ENVIRONMENT_LABELS.has(l));
  const envCount = labels.filter((l) => ENVIRONMENT_LABELS.has(l)).length;
  const hasTempOrHumidity =
    labels.includes("Temperature") || labels.includes("Humidity");
  const hasRootZone = labels.some((l) => ROOT_ZONE_LABELS.has(l));

  let status: PlantSensorContextStatus;
  if (hasTempOrHumidity && hasRootZone) {
    status = "strong";
  } else if (!hasEnvironment && !hasRootZone) {
    status = "limited";
  } else if (envCount <= 1 && !hasRootZone) {
    status = "limited";
  } else {
    status = "limited";
  }

  const message =
    status === "strong"
      ? "AI Doctor has a strong plant-level sensor context."
      : "AI Doctor has limited plant-level sensor context.";

  return {
    status,
    recentLogCount: dated.length,
    latestCapturedAt: latest.log.capturedAt,
    ageHours,
    metrics,
    sources,
    message,
  };
}
