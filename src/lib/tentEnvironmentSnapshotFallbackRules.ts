import type { BuildTentSnapshotInput } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import type {
  ManualSnapshotCardSeverity,
  ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";

export type TentEnvironmentReadStatus = "loading" | "error" | "refresh_error" | "success";
export type TentEnvironmentManualReadStatus = TentEnvironmentReadStatus | "refreshing";

export interface SelectTentEnvironmentSnapshotFallbackInput {
  sensorRows?: readonly BuildTentSnapshotInput[] | null;
  sensorStatus: TentEnvironmentReadStatus;
  manualCards?: readonly ManualSnapshotTimelineCard[] | null;
  manualStatus: TentEnvironmentManualReadStatus;
  now: number;
}

export type TentEnvironmentSnapshotSelection =
  | { kind: "sensor_loading" }
  | { kind: "sensor_unavailable" }
  | { kind: "sensor"; rows: BuildTentSnapshotInput[]; refreshWarning: boolean }
  | { kind: "manual_loading" }
  | { kind: "manual_unavailable" }
  | {
      kind: "manual";
      rows: BuildTentSnapshotInput[];
      capturedAt: string;
      refreshWarning: boolean;
      refreshing?: true;
    }
  | {
      kind: "manual_unusable";
      severity: ManualSnapshotCardSeverity;
      refreshWarning: boolean;
      refreshing?: true;
    }
  | { kind: "empty" };

function newestManualCard(
  cards: readonly ManualSnapshotTimelineCard[],
): ManualSnapshotTimelineCard | null {
  if (cards.length === 0) return null;
  return [...cards].sort((a, b) => {
    const capturedOrder = b.capturedAt.localeCompare(a.capturedAt);
    return capturedOrder !== 0 ? capturedOrder : a.id.localeCompare(b.id);
  })[0];
}

function manualQuality(severity: ManualSnapshotCardSeverity): "ok" | "degraded" | "invalid" {
  if (severity === "invalid") return "invalid";
  if (severity === "warning") return "degraded";
  return "ok";
}

function manualCardRows(card: ManualSnapshotTimelineCard, now: number): BuildTentSnapshotInput[] {
  const capturedAtMs = Date.parse(card.capturedAt);
  const beyondAllowedFutureSkew =
    Number.isFinite(capturedAtMs) && capturedAtMs - now > LIVE_CURRENT_STATE_STALE_MS;
  const quality = beyondAllowedFutureSkew ? "invalid" : manualQuality(card.severity);
  const rows: BuildTentSnapshotInput[] = [];

  for (const reading of card.readings) {
    if (reading.derived !== false) continue;
    const metric =
      reading.field === "air_temp_c"
        ? "temperature_c"
        : reading.field === "humidity_pct" || reading.field === "vpd_kpa"
          ? reading.field
          : null;
    if (!metric || !Number.isFinite(reading.value)) continue;
    rows.push({
      tent_id: card.tentId,
      ts: card.capturedAt,
      captured_at: card.capturedAt,
      metric,
      value: reading.value,
      source: "manual",
      quality,
    });
  }

  return rows;
}

export function selectTentEnvironmentSnapshotFallback(
  input: SelectTentEnvironmentSnapshotFallbackInput,
): TentEnvironmentSnapshotSelection {
  const sensorRows = [...(input.sensorRows ?? [])];
  if (input.sensorStatus === "loading") return { kind: "sensor_loading" };
  if (input.sensorStatus === "error") return { kind: "sensor_unavailable" };
  if (input.sensorStatus === "refresh_error") {
    return sensorRows.length > 0
      ? { kind: "sensor", rows: sensorRows, refreshWarning: true }
      : { kind: "sensor_unavailable" };
  }
  if (sensorRows.length > 0) {
    return { kind: "sensor", rows: sensorRows, refreshWarning: false };
  }

  const manualCards = input.manualCards ?? [];
  if (input.manualStatus === "loading") return { kind: "manual_loading" };
  if (input.manualStatus === "error") return { kind: "manual_unavailable" };
  if (input.manualStatus === "refresh_error" && manualCards.length === 0) {
    return { kind: "manual_unavailable" };
  }

  const card = newestManualCard(manualCards);
  if (input.manualStatus === "refreshing" && !card) return { kind: "manual_loading" };
  if (!card) return { kind: "empty" };
  const rows = manualCardRows(card, input.now);
  const refreshWarning = input.manualStatus === "refresh_error";
  const refreshing = input.manualStatus === "refreshing";
  if (rows.length === 0) {
    return {
      kind: "manual_unusable",
      severity: card.severity,
      refreshWarning,
      ...(refreshing ? { refreshing: true as const } : {}),
    };
  }
  return {
    kind: "manual",
    rows,
    capturedAt: card.capturedAt,
    refreshWarning,
    ...(refreshing ? { refreshing: true as const } : {}),
  };
}
