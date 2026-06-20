/**
 * quickLogSensorSnapshotViewModelAdapter — small pure adapter that
 * bridges the existing Quick Log tent-sensor state (from
 * `useLatestTentSensorSnapshot`) into the input shape consumed by
 * `buildQuickLogSensorSnapshotViewModel`.
 *
 * Safety contract:
 *  - Pure: no I/O, no React, no Supabase, no Date.now().
 *  - Never returns raw_payload, secrets, tokens, MAC addresses, or
 *    private identifiers. Only canonical/whitelisted fields are mapped.
 *  - Provider/bridge identifiers (e.g. "ecowitt", "home_assistant")
 *    are NEVER promoted to a stronger trust label here; they are
 *    carried as `sourceDetail` only, and the resolver decides freshness.
 *  - Empty/loading/error/no-tent inputs collapse to a null snapshot so
 *    the view-model produces the canonical "No sensor snapshot
 *    available." empty copy.
 */

import type { SensorSnapshot } from "@/lib/latestSensorSnapshotRules";
import type { LatestTentSensorSnapshotState } from "@/lib/sensor";
import type {
  QuickLogSensorContextInput,
} from "@/lib/quickLogSensorSnapshotViewModel";
import type {
  SensorSnapshotInput,
  SensorSnapshotMetricInput,
  SensorSnapshotSource,
} from "@/lib/sensorSnapshotFreshnessRules";

const CANONICAL_SOURCES: ReadonlySet<SensorSnapshotSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

/**
 * Map an upstream source label to the canonical view-model source.
 * Provider/bridge strings collapse to "live" only when freshness has
 * already been established by the upstream resolver; we never invent
 * a "live" label out of thin air.
 */
function mapSource(
  raw: string | null | undefined,
  freshness: SensorSnapshot["freshness"],
): SensorSnapshotSource | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const lower = raw.toLowerCase();
  if (CANONICAL_SOURCES.has(lower as SensorSnapshotSource)) {
    return lower as SensorSnapshotSource;
  }
  if (lower === "sim") return "demo";
  if (lower === "diary") return "manual";
  // Unknown provider/bridge identifier. Only treat as live when the
  // upstream resolver already classified the snapshot as fresh — never
  // upgrade stale/invalid/unknown provider data to live.
  if (freshness === "fresh") return "live";
  if (freshness === "stale") return "stale";
  return null;
}

function mapMetrics(
  snapshot: SensorSnapshot,
): SensorSnapshotMetricInput[] {
  const out: SensorSnapshotMetricInput[] = [];
  const m = snapshot.metrics;
  if (m.temp_f !== null) {
    // Convert back to Celsius for the canonical view-model unit.
    const c = ((m.temp_f - 32) * 5) / 9;
    out.push({ key: "temp", value: c, unit: "°C", kind: "environment" });
  }
  if (m.humidity_pct !== null) {
    out.push({ key: "rh", value: m.humidity_pct, unit: "%", kind: "environment" });
  }
  if (m.vpd_kpa !== null) {
    out.push({ key: "vpd", value: m.vpd_kpa, unit: "kPa", kind: "environment" });
  }
  if (m.soil_moisture_pct !== null) {
    out.push({ key: "soil", value: m.soil_moisture_pct, unit: "%", kind: "soil" });
  }
  return out;
}

export interface AdaptQuickLogSensorContextArgs {
  state: Pick<LatestTentSensorSnapshotState, "status" | "snapshot">;
  tentId: string | null | undefined;
  plantId?: string | null | undefined;
  /** True when the grower has Attach-snapshot toggled off — collapses to empty. */
  attached?: boolean;
}

export function adaptQuickLogSensorContextInput(
  args: AdaptQuickLogSensorContextArgs,
): QuickLogSensorContextInput {
  const { state, tentId, plantId, attached = true } = args;

  const hasTent = typeof tentId === "string" && tentId.length > 0;
  const ready = state.status === "ready";
  const snap = state.snapshot;

  if (!attached || !hasTent || !ready || !snap || !snap.captured_at) {
    return { tentId: tentId ?? null, plantId: plantId ?? null, snapshot: null };
  }

  const mappedSource = mapSource(snap.source, snap.freshness);

  const input: SensorSnapshotInput = {
    source: mappedSource,
    sourceDetail:
      typeof snap.source === "string" && snap.source.length > 0
        ? snap.source
        : null,
    capturedAt: snap.captured_at,
    confidence: snap.confidence ?? null,
    invalid: snap.freshness === "invalid",
    metrics: mapMetrics(snap),
  };

  return {
    tentId: tentId ?? null,
    plantId: plantId ?? null,
    snapshot: input,
  };
}
