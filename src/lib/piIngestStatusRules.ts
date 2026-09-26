/**
 * Pure rules for the read-only Pi Ingest Status surface.
 *
 * Scope (intentionally narrow):
 *  - Derives operator-visible status from already-accepted
 *    `sensor_readings` rows where `source = "pi_bridge"`.
 *  - Does NOT write anything.
 *  - Does NOT read bridge secrets, encrypted columns, or
 *    `pi_ingest_bridge_credentials`.
 *  - Does NOT create alerts or Action Queue rows.
 *  - Does NOT trigger automation or device control.
 */

export const PI_INGEST_SOURCE = "pi_bridge" as const;

/** Health states surfaced to the operator. */
export type PiIngestHealth = "no_data" | "recently_active" | "stale";

/** Default thresholds (ms). Recent <= 30 min, otherwise stale. */
export const PI_INGEST_RECENT_WINDOW_MS = 30 * 60 * 1000;
export const PI_INGEST_24H_MS = 24 * 60 * 60 * 1000;
export const PI_INGEST_7D_MS = 7 * 24 * 60 * 60 * 1000;

export interface PiIngestReadingLike {
  ts: string | Date;
  metric: string;
  source?: string | null;
  tent_id?: string | null;
}

/** A missing or malformed required receipt is not an empty accepted history. */
export function requirePiIngestReadings(data: unknown): PiIngestReadingLike[] {
  if (
    !Array.isArray(data) ||
    !data.every(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        typeof row.ts === "string" &&
        Number.isFinite(Date.parse(row.ts)) &&
        typeof row.metric === "string" &&
        row.metric.trim().length > 0 &&
        row.source === PI_INGEST_SOURCE &&
        (row.tent_id == null || (typeof row.tent_id === "string" && row.tent_id.trim().length > 0)),
    )
  ) {
    throw new Error("Could not load ingest status.");
  }
  return data;
}

/** Cached health is not current evidence while its required read is unresolved. */
export function piIngestReadState(query: {
  isPending: boolean;
  isFetching: boolean;
  isPaused: boolean;
  isError: boolean;
  data: unknown;
}): "waiting" | "loading" | "unavailable" | "ready" {
  if (query.isPaused) return "waiting";
  if (query.isPending || query.isFetching) return "loading";
  if (query.isError || !query.data) return "unavailable";
  return "ready";
}

export interface PiIngestStatusSummary {
  health: PiIngestHealth;
  latestAt: Date | null;
  latestTentId: string | null;
  count24h: number;
  count7d: number;
  latestMetrics: string[];
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export function computePiIngestStatus(
  readings: ReadonlyArray<PiIngestReadingLike>,
  now: Date = new Date(),
  opts: { recentWindowMs?: number } = {},
): PiIngestStatusSummary {
  const recentWindow = opts.recentWindowMs ?? PI_INGEST_RECENT_WINDOW_MS;
  // Only consider pi_bridge rows defensively.
  const piRows = readings.filter((r) => (r.source ?? null) === PI_INGEST_SOURCE);

  if (piRows.length === 0) {
    return {
      health: "no_data",
      latestAt: null,
      latestTentId: null,
      count24h: 0,
      count7d: 0,
      latestMetrics: [],
    };
  }

  const sorted = [...piRows].sort((a, b) => toDate(b.ts).getTime() - toDate(a.ts).getTime());
  const latest = sorted[0];
  const latestAt = toDate(latest.ts);
  const latestTentId = latest.tent_id ?? null;

  const nowMs = now.getTime();
  const count24h = piRows.filter((r) => nowMs - toDate(r.ts).getTime() <= PI_INGEST_24H_MS).length;
  const count7d = piRows.filter((r) => nowMs - toDate(r.ts).getTime() <= PI_INGEST_7D_MS).length;

  // Latest metrics: distinct metric names from the most recent batch
  // (same timestamp as latest, then top 5 distinct from sorted list).
  const latestMetrics: string[] = [];
  for (const r of sorted) {
    if (!latestMetrics.includes(r.metric)) latestMetrics.push(r.metric);
    if (latestMetrics.length >= 5) break;
  }

  const ageMs = nowMs - latestAt.getTime();
  const health: PiIngestHealth = ageMs <= recentWindow ? "recently_active" : "stale";

  return {
    health,
    latestAt,
    latestTentId,
    count24h,
    count7d,
    latestMetrics,
  };
}

export const PI_INGEST_HEALTH_LABEL: Record<PiIngestHealth, string> = {
  no_data: "No data yet",
  recently_active: "Recently active",
  stale: "Stale",
};

export const PI_INGEST_DISCLOSURE_LINES = [
  "Read-only status.",
  "No automation.",
  "No device control.",
  "Ingested data only reflects accepted sensor_readings.",
] as const;
