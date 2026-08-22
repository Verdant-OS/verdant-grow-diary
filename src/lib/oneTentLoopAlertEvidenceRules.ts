/**
 * One-Tent Loop alert-origin evidence resolver.
 *
 * The generic originating-timeline-event adapter deliberately normalizes
 * persisted JSON without looking it up. The Live Proof needs a stricter,
 * proof-specific gate: a claimed ref can certify an Alert only when it
 * exactly resolves to provenance already loaded for the selected tent.
 *
 * Pure. No I/O, React, Supabase, fetch, schema, or writer behavior.
 */

import {
  isTrustedTimelineEventSource,
  type OriginatingTimelineEventRef,
  type OriginatingTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";
import { isVerifiedSnapshotLiveRowSource } from "@/lib/sensorLiveMembership";
import type {
  SensorSnapshot,
  SensorSnapshotMetricRef,
  SensorSnapshotMetricRefKey,
} from "@/lib/sensorSnapshot";

export interface OneTentLoopAlertEvidenceInput {
  /** Sanitized, syntactic refs from the generic adapter. */
  refs: readonly OriginatingTimelineEventRef[] | null | undefined;
  /** Already-loaded current snapshot for this proof page. */
  snapshot:
    | Pick<
        SensorSnapshot,
        "source" | "tent_id" | "metric_refs" | "diary_evidence_ref" | SensorSnapshotMetricRefKey
      >
    | null
    | undefined;
  /** Persisted alert metric. Only deterministic known aliases are accepted. */
  alert_metric: string | null | undefined;
  /** Tent currently selected by the proof page. */
  selected_tent_id: string | null | undefined;
}

const METRIC_KEY_BY_ALERT_METRIC: Readonly<Record<string, SensorSnapshotMetricRefKey>> = {
  temp: "temp",
  temperature: "temp",
  temperature_c: "temp",
  temp_c: "temp",
  rh: "rh",
  humidity: "rh",
  humidity_pct: "rh",
  vpd: "vpd",
  vpd_kpa: "vpd",
  soil: "soil",
  soil_moisture: "soil",
  soil_ec: "soil_ec",
  soil_temp: "soil_temp",
  soil_temp_c: "soil_temp",
  ppfd: "ppfd",
};

function normalizeMetricKey(raw: string | null | undefined): SensorSnapshotMetricRefKey | null {
  if (typeof raw !== "string") return null;
  return METRIC_KEY_BY_ALERT_METRIC[raw.trim().toLowerCase()] ?? null;
}

function normalizedTrustedSource(
  raw: string | null | undefined,
): OriginatingTimelineEventSource | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value !== "live" && value !== "manual" && value !== "csv") return null;
  const source = value as OriginatingTimelineEventSource;
  return isTrustedTimelineEventSource(source) ? source : null;
}

function equalTrimmed(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === "string" && typeof b === "string" && a.trim() !== "" && a.trim() === b.trim();
}

function matchesSensorMetricRef(
  ref: OriginatingTimelineEventRef,
  metricRef: SensorSnapshotMetricRef | null | undefined,
  snapshot: OneTentLoopAlertEvidenceInput["snapshot"],
): boolean {
  if (!metricRef || ref.type !== "sensor_snapshot") return false;
  const metricSource =
    typeof metricRef.source === "string" ? metricRef.source.trim().toLowerCase() : "";
  const isExactMetricRef =
    equalTrimmed(ref.id, metricRef.id) && equalTrimmed(ref.occurred_at, metricRef.captured_at);
  if (!isExactMetricRef) return false;

  if (metricSource === "pi_bridge") {
    // The generic timeline-ref normalizer preserves its closed source union
    // and therefore stores legacy Pi bridge refs as `unknown`. This
    // proof-only exception is deliberately narrower than trusting unknown:
    // it is available only for a raw source in the verified snapshot-live
    // reservation, a selected snapshot already classified live, and this
    // exact sensor row. This keeps arbitrary unknown/provider refs blocked.
    return (
      snapshot?.source === "live" &&
      isVerifiedSnapshotLiveRowSource(metricSource) &&
      (ref.source === "live" || ref.source === "unknown")
    );
  }

  const expectedSource = normalizedTrustedSource(metricRef.source);
  return expectedSource !== null && ref.source === expectedSource && isExactMetricRef;
}

function matchesDiaryEnvironmentCheckRef(
  ref: OriginatingTimelineEventRef,
  snapshot: OneTentLoopAlertEvidenceInput["snapshot"],
  metricKey: SensorSnapshotMetricRefKey,
): boolean {
  const diaryRef = snapshot?.diary_evidence_ref;
  const metricValue = snapshot?.[metricKey];
  // `snapshotFromEnvironmentCheck` is the sole producer of this exact
  // ref and labels it manual. Do not let an arbitrary diary-shaped ref
  // upgrade another snapshot source to trusted proof evidence.
  return (
    snapshot?.source === "manual" &&
    ref.type === "diary_entry" &&
    ref.source === "manual" &&
    typeof metricValue === "number" &&
    Number.isFinite(metricValue) &&
    equalTrimmed(ref.id, diaryRef?.id) &&
    equalTrimmed(ref.occurred_at, diaryRef?.entry_at)
  );
}

/**
 * True only when at least one persisted ref exactly resolves to the
 * selected-tent snapshot's current metric provenance or its exact manual
 * Environment Check diary provenance. Unknown, foreign, stale-shape, and
 * self-declared refs fail closed.
 */
export function hasResolvedOneTentLoopAlertEvidence(input: OneTentLoopAlertEvidenceInput): boolean {
  const selectedTentId = input.selected_tent_id;
  const snapshot = input.snapshot;
  if (!selectedTentId || !snapshot || snapshot.tent_id !== selectedTentId) return false;
  if (!Array.isArray(input.refs) || input.refs.length === 0) return false;

  const metricKey = normalizeMetricKey(input.alert_metric);
  // A manual Environment Check ref is only evidence for a specific supported
  // alert metric. Without that binding, an arbitrary or missing metric could
  // self-certify through the diary fallback.
  if (!metricKey) return false;
  const metricRef = snapshot.metric_refs?.[metricKey] ?? null;

  return input.refs.some(
    (ref) =>
      matchesSensorMetricRef(ref, metricRef, snapshot) ||
      matchesDiaryEnvironmentCheckRef(ref, snapshot, metricKey),
  );
}
