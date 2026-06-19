/**
 * environmentCheckSensorSnapshotLinkRules — pure helper that links an
 * Environment Check timeline entry to the matching accepted sensor
 * snapshot when one is available. Read-only. No I/O.
 *
 * Match priority:
 *   1) exact back-pointer (sensor_snapshot_id) on the entry
 *   2) deterministic key match on (tent_id, plant_id?, captured_at within
 *      tolerance, optional source/provider/transport)
 *   3) no match → "not linked" (NEVER guess)
 *
 * Ambiguous matches (>1 candidate after key filtering) yield "not linked".
 *
 * VPD missing stays null/blank, never 0. Stale/invalid telemetry is never
 * marked healthy.
 */

export const SNAPSHOT_LINK_TOLERANCE_MS = 60 * 1000;
export const SNAPSHOT_NOT_LINKED_LABEL = "Sensor snapshot not linked" as const;

export interface EnvironmentCheckEntry {
  id: string;
  tentId?: string | null;
  plantId?: string | null;
  capturedAt?: string | null;
  /** Exact back-pointer, if the entry already records one. */
  sensorSnapshotId?: string | null;
  source?: string | null;
  provider?: string | null;
  transport?: string | null;
}

export interface SensorSnapshotCandidate {
  id: string;
  tentId?: string | null;
  plantId?: string | null;
  capturedAt?: string | null;
  source?: string | null;
  provider?: string | null;
  transport?: string | null;
  vpdKpa?: number | null;
  soilMoisturePct?: number | null;
  isStaleOrInvalid?: boolean;
}

export type SnapshotLinkMatchKind = "exact_id" | "deterministic_keys" | "none";

export interface SnapshotLinkResult {
  matchKind: SnapshotLinkMatchKind;
  snapshotId: string | null;
  /** Deterministic href to the sensor surface filtered by tent/plant/captured_at. */
  href: string | null;
  /** Reason to surface when no link is produced. */
  reason: string | null;
  /** VPD pulled through from the snapshot when matched. NEVER 0. */
  vpdKpa: number | null;
  soilMoisturePct: number | null;
  /** True if the matched snapshot is stale/invalid (never healthy). */
  staleOrInvalid: boolean;
}

export interface LinkSnapshotInput {
  entry: EnvironmentCheckEntry;
  snapshots: SensorSnapshotCandidate[];
  toleranceMs?: number;
  /** Optional href builder. Default: `/sensors?tent=...&plant=...&at=...`. */
  hrefBuilder?: (params: { tentId: string; plantId: string | null; capturedAt: string }) => string;
}

function defaultHref(params: { tentId: string; plantId: string | null; capturedAt: string }): string {
  const q = new URLSearchParams();
  q.set("tent", params.tentId);
  if (params.plantId) q.set("plant", params.plantId);
  q.set("at", params.capturedAt);
  return `/sensors?${q.toString()}`;
}

function sanitizeVpd(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return null;
  return v;
}

export function linkEnvironmentCheckToSnapshot(input: LinkSnapshotInput): SnapshotLinkResult {
  const { entry, snapshots } = input;
  const tolerance = input.toleranceMs ?? SNAPSHOT_LINK_TOLERANCE_MS;
  const hrefBuilder = input.hrefBuilder ?? defaultHref;

  // 1) exact ID
  if (entry.sensorSnapshotId) {
    const hit = snapshots.find((s) => s.id === entry.sensorSnapshotId);
    if (hit) {
      const href =
        entry.tentId && hit.capturedAt
          ? hrefBuilder({ tentId: entry.tentId, plantId: entry.plantId ?? null, capturedAt: hit.capturedAt })
          : null;
      return {
        matchKind: "exact_id",
        snapshotId: hit.id,
        href,
        reason: null,
        vpdKpa: sanitizeVpd(hit.vpdKpa),
        soilMoisturePct: typeof hit.soilMoisturePct === "number" && Number.isFinite(hit.soilMoisturePct) ? hit.soilMoisturePct : null,
        staleOrInvalid: hit.isStaleOrInvalid === true,
      };
    }
  }

  // 2) deterministic key match
  if (!entry.tentId || !entry.capturedAt) {
    return notLinked("Insufficient keys to link snapshot.");
  }
  const entryT = Date.parse(entry.capturedAt);
  if (!Number.isFinite(entryT)) {
    return notLinked("Entry captured_at is not a valid timestamp.");
  }

  const candidates = snapshots.filter((s) => {
    if (s.tentId !== entry.tentId) return false;
    if (entry.plantId && s.plantId && s.plantId !== entry.plantId) return false;
    if (!s.capturedAt) return false;
    const t = Date.parse(s.capturedAt);
    if (!Number.isFinite(t)) return false;
    if (Math.abs(t - entryT) > tolerance) return false;
    if (entry.source && s.source && s.source !== entry.source) return false;
    if (entry.provider && s.provider && s.provider !== entry.provider) return false;
    if (entry.transport && s.transport && s.transport !== entry.transport) return false;
    return true;
  });

  if (candidates.length === 0) {
    return notLinked(SNAPSHOT_NOT_LINKED_LABEL);
  }
  if (candidates.length > 1) {
    return notLinked("Ambiguous snapshot match.");
  }

  const hit = candidates[0];
  const href =
    hit.capturedAt && entry.tentId
      ? hrefBuilder({ tentId: entry.tentId, plantId: entry.plantId ?? null, capturedAt: hit.capturedAt })
      : null;

  return {
    matchKind: "deterministic_keys",
    snapshotId: hit.id,
    href,
    reason: null,
    vpdKpa: sanitizeVpd(hit.vpdKpa),
    soilMoisturePct:
      typeof hit.soilMoisturePct === "number" && Number.isFinite(hit.soilMoisturePct)
        ? hit.soilMoisturePct
        : null,
    staleOrInvalid: hit.isStaleOrInvalid === true,
  };
}

function notLinked(reason: string): SnapshotLinkResult {
  return {
    matchKind: "none",
    snapshotId: null,
    href: null,
    reason,
    vpdKpa: null,
    soilMoisturePct: null,
    staleOrInvalid: false,
  };
}
