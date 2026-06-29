/**
 * sensorSnapshotEvidenceRefRules — Sensor Snapshot → Alert Evidence Ref
 * Population v1.
 *
 * Pure helper. No I/O, no React, no Supabase, no fetch.
 *
 * Builds a safe `OriginatingTimelineEventRef[]` from an EXPLICIT sensor
 * reading / snapshot identifier that already lives at the alert write
 * boundary. NEVER infers refs from:
 *  - alert timestamps
 *  - "nearest" sensor readings
 *  - tent_id / plant_id / grow_id
 *  - metric names alone
 *  - alert reason text or any free prose
 *  - the alert id itself
 *
 * Never stores raw_payload, provider payloads, tokens, prompts, model
 * outputs, or device-control fields — those keys cause the entry to be
 * rejected outright (see {@link FORBIDDEN_REF_FIELDS}).
 *
 * Provider names (e.g. "ecowitt") are NOT honest Verdant source labels:
 * unknown source strings normalize to `"unknown"`. csv/manual/demo/stale/
 * invalid/live/imported remain honest. `unavailable` and similar
 * non-truth labels are dropped (no ref).
 */
import {
  normalizeOriginatingTimelineEvents,
  type OriginatingTimelineEventRef,
} from "@/lib/originatingTimelineEventRules";
import { FORBIDDEN_REF_FIELDS } from "@/lib/originatingTimelineEventAdapter";

/** Narrow shape accepted by the helper. Extra fields are tolerated but the
 * presence of any {@link FORBIDDEN_REF_FIELDS} key rejects the entry. */
export interface SensorSnapshotEvidenceInput {
  id?: unknown;
  captured_at?: unknown;
  source?: unknown;
  /** Optional metric hint for a safer label ("vpd"|"temp"|"rh"|"co2"|...). */
  metric?: unknown;
}

/** Honest, deterministic label. No diagnosis. No certainty. */
export function buildSensorSnapshotLabel(metric: unknown): string {
  if (typeof metric !== "string") return "Sensor snapshot";
  const m = metric.trim().toLowerCase();
  switch (m) {
    case "vpd":
      return "VPD sensor snapshot";
    case "temp":
    case "temperature":
      return "Temperature sensor snapshot";
    case "rh":
    case "humidity":
      return "Humidity sensor snapshot";
    case "co2":
      return "CO2 sensor snapshot";
    case "ppfd":
    case "light":
      return "Light sensor snapshot";
    case "soil":
    case "soil_moisture":
      return "Soil moisture sensor snapshot";
    case "soil_ec":
    case "ec":
      return "EC sensor snapshot";
    default:
      return "Sensor snapshot";
  }
}

/** `unavailable`, empty, missing → not a truth-bearing source for a ref. */
const NON_TRUTH_SOURCES = new Set<string>(["unavailable", ""]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasForbiddenField(obj: Record<string, unknown>): boolean {
  for (const k of FORBIDDEN_REF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

/**
 * Build at most one sensor_snapshot ref from an EXPLICIT input. Returns `[]`
 * (never throws) when the input lacks a usable id/captured_at, carries a
 * forbidden field, or has no truth-bearing source.
 */
export function buildSensorSnapshotEvidenceRefs(
  input: SensorSnapshotEvidenceInput | null | undefined,
): OriginatingTimelineEventRef[] {
  try {
    if (!isPlainObject(input)) return [];
    if (hasForbiddenField(input as Record<string, unknown>)) return [];

    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id) return [];

    const occurred_at =
      typeof input.captured_at === "string" ? input.captured_at.trim() : "";
    if (!occurred_at) return [];

    const rawSource =
      typeof input.source === "string" ? input.source.trim().toLowerCase() : "";
    if (NON_TRUTH_SOURCES.has(rawSource)) return [];

    // Route through the shared normalizer so source labels and sort/dedupe
    // semantics stay in lock-step with the persistence/adapter layer.
    return normalizeOriginatingTimelineEvents([
      {
        id,
        type: "sensor_snapshot",
        occurred_at,
        source: rawSource,
      },
    ]);
  } catch {
    return [];
  }
}
