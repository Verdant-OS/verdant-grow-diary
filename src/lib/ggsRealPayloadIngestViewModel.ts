/**
 * ggsRealPayloadIngestViewModel — UI-safe presenter built on top of the pure
 * `buildGgsRealPayloadCommitInput` planner.
 *
 * HARD CONSTRAINTS:
 *   - Pure (no I/O, no Supabase, no fetch, no console).
 *   - NEVER surfaces the verbatim `raw_payload.payload` body. UI may only
 *     render the safe summary fields exposed below.
 *   - NEVER emits source values other than `"live"`.
 *   - When the planner refuses, returns a typed refusal — no rows, no commit.
 *   - Adds a single non-domain rule: commit is forbidden unless the operator
 *     has checked the "real device" attestation box.
 */
import {
  buildGgsRealPayloadCommitInput,
  type GgsRealPayloadCommitInput,
  type GgsRealPayloadCommitRow,
  type GgsRealPayloadContext,
  type GgsRealPayloadMetric,
  type GgsRealPayloadRefusalReason,
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
} from "@/lib/ggsRealPayloadIngestRules";

export interface GgsRealPayloadPreviewMetric {
  metric: GgsRealPayloadMetric;
  value: number;
  /** Human-friendly label, e.g. "Soil moisture", "EC", "Soil temperature". */
  label: string;
  /** Display unit string for the operator. */
  unit: string;
}

export interface GgsRealPayloadPreview {
  capturedAt: string;
  /** Age of the reading at preview time, in seconds. Negative = future. */
  ageSeconds: number;
  sensorId: string | null;
  source: typeof GGS_REAL_PAYLOAD_SOURCE; // "live"
  vendor: typeof GGS_REAL_PAYLOAD_SOURCE_APP; // "spider_farmer_ggs"
  metrics: GgsRealPayloadPreviewMetric[];
  /** Warnings surfaced by the normalizer (e.g. "soil_temp_unit_converted"). */
  warnings: string[];
  /** Number of canonical rows that would be committed. */
  rowCount: number;
  /** Original unit annotations captured by the planner, if any. */
  originalUnits?: Record<string, string>;
}

export interface GgsRealPayloadIngestViewModelInput {
  payloadText: string;
  context: GgsRealPayloadContext;
  attested: boolean;
  /** Injected clock for deterministic UI tests. */
  now?: Date;
}

export type GgsRealPayloadIngestViewModel =
  | {
      status: "ok";
      preview: GgsRealPayloadPreview;
      commit: {
        userId: string;
        bridgeId: string;
        tentId: string;
        rows: GgsRealPayloadCommitRow[];
      };
      canCommit: boolean;
      blockers: string[];
    }
  | {
      status: "refused";
      reason: GgsRealPayloadRefusalReason | "payload_unparseable" | "payload_blank";
      details?: string;
      canCommit: false;
    };

const METRIC_LABEL: Record<GgsRealPayloadMetric, { label: string; unit: string }> = {
  soil_moisture_pct: { label: "Soil moisture", unit: "% VWC" },
  ec: { label: "Soil EC", unit: "mS/cm" },
  soil_temp_c: { label: "Soil temperature", unit: "°C" },
};

function parsePayload(
  text: string,
): { ok: true; value: unknown } | { ok: false; reason: "payload_blank" | "payload_unparseable"; details?: string } {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, reason: "payload_blank" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return {
      ok: false,
      reason: "payload_unparseable",
      details: e instanceof Error ? e.message : "invalid JSON",
    };
  }
}

export function buildGgsRealPayloadIngestViewModel(
  input: GgsRealPayloadIngestViewModelInput,
): GgsRealPayloadIngestViewModel {
  const parsed = parsePayload(input.payloadText);
  if (parsed.ok === false) {
    return { status: "refused", reason: parsed.reason, details: parsed.details, canCommit: false };
  }

  const planned: GgsRealPayloadCommitInput = buildGgsRealPayloadCommitInput(parsed.value, {
    ...input.context,
    now: input.now ?? input.context.now,
  });

  if (planned.ok === false) {
    return {
      status: "refused",
      reason: planned.reason,
      details: planned.details,
      canCommit: false,
    };
  }

  const first = planned.rows[0];
  const capturedAt = first.captured_at;
  const nowMs = (input.now ?? new Date()).getTime();
  const ageSeconds = Math.round((nowMs - new Date(capturedAt).getTime()) / 1000);

  const metrics: GgsRealPayloadPreviewMetric[] = planned.rows.map((r) => ({
    metric: r.metric,
    value: r.value,
    label: METRIC_LABEL[r.metric].label,
    unit: METRIC_LABEL[r.metric].unit,
  }));

  const envelope = first.raw_payload;
  const preview: GgsRealPayloadPreview = {
    capturedAt,
    ageSeconds,
    sensorId: envelope.sensor_id,
    source: GGS_REAL_PAYLOAD_SOURCE,
    vendor: GGS_REAL_PAYLOAD_SOURCE_APP,
    metrics,
    warnings: planned.warnings,
    rowCount: planned.rows.length,
    ...(envelope.original_units ? { originalUnits: envelope.original_units } : {}),
  };

  const blockers: string[] = [];
  if (!input.attested) blockers.push("attestation_required");

  return {
    status: "ok",
    preview,
    commit: {
      userId: planned.userId,
      bridgeId: planned.bridgeId,
      tentId: planned.tentId,
      rows: planned.rows,
    },
    canCommit: blockers.length === 0,
    blockers,
  };
}

/** Human-readable explanation for a refusal reason. UI-only. */
export function describeRefusal(
  reason: GgsRealPayloadIngestViewModel extends { status: "refused"; reason: infer R } ? R : never,
): string {
  switch (reason) {
    case "payload_blank":
      return "Paste the JSON payload from the physical Spider Farmer GGS device.";
    case "payload_unparseable":
      return "Payload is not valid JSON.";
    case "payload_missing":
    case "payload_not_object":
      return "Payload must be a JSON object.";
    case "context_missing":
      return "Operator context is missing.";
    case "user_id_missing":
      return "No authenticated user.";
    case "bridge_id_missing":
      return "Select a bridge token for this tent.";
    case "tent_id_missing":
      return "Select the tent this reading belongs to.";
    case "device_id_missing":
      return "Provide the physical probe / sensor id.";
    case "captured_at_missing_or_malformed":
      return "Payload is missing a valid timestamp.";
    case "forbidden_declared_source":
      return "Payload declares a non-canonical source. Refuse: only physical live readings are allowed.";
    case "non_finite_value":
      return "Payload contains non-numeric or NaN/Infinity values.";
    case "soil_temp_out_of_range":
      return "Soil temperature is outside the realistic -20°C..80°C range.";
    case "soil_ec_unit_mismatch_suspected":
      return "EC unit looks wrong (µS/cm vs mS/cm). Refusing rather than guessing.";
    case "no_canonical_readings":
      return "Payload does not contain any soil moisture / EC / soil temperature value.";
    case "normalizer_refused":
      return "Normalizer rejected this payload.";
    default:
      return "Payload refused.";
  }
}
