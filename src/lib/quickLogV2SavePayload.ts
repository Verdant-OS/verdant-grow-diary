/**
 * QuickLog v2 — pure save payload builder.
 * Maps validated form state to the RPC parameter shape.
 * No I/O. No JSX. Deterministic.
 */

import type { QuickLogV2Action, ResolvedQuickLogV2Target } from "./quickLogV2Rules";
import { isTemperatureValid, isHumidityValid, isVpdValid } from "./sensorReadingNormalizationRules";

export interface QuickLogV2SavePayload {
  p_target_type: "tent" | "plant";
  p_target_id: string;
  p_action: "water" | "note";
  p_volume_ml: number | null;
  p_note: string | null;
  p_temperature_c: number | null;
  p_humidity_pct: number | null;
  p_vpd_kpa: number | null;
  p_occurred_at: string | null;
  p_details?: Record<string, unknown> | null;
  /**
   * Server-side idempotency key (8..200 chars). One key per logical
   * submission: retries of the same submission MUST reuse the key so
   * quicklog_save_manual dedupes instead of double-writing the diary.
   */
  p_idempotency_key: string;
}

export interface BuildQuickLogV2PayloadInput {
  resolved: ResolvedQuickLogV2Target;
  action: QuickLogV2Action;
  volumeMl: string;
  note: string;
  temperatureC: string;
  humidityPct: string;
  vpdKpa: string;
  occurredAt?: string | null;
  details?: Record<string, unknown> | null;
  idempotencyKey: string;
}

export type BuildResult =
  { ok: true; payload: QuickLogV2SavePayload } | { ok: false; reason: string };

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw?.trim?.() ?? "";
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "invalid";
  return n;
}

export function buildQuickLogV2SavePayload(input: BuildQuickLogV2PayloadInput): BuildResult {
  const { resolved, action } = input;
  if (!resolved?.ok || !resolved.targetType || !resolved.targetId) {
    return { ok: false, reason: "target_unresolved" };
  }
  if ((action as string) === "photo") {
    // Photo saving is intentionally not wired through the RPC payload yet.
    // Surface the specific gate reason so the sheet can show the canonical
    // "photo saving not enabled" copy instead of a generic invalid-action.
    return { ok: false, reason: "photo_saving_not_enabled" };
  }
  if (action !== "water" && action !== "note") {
    return { ok: false, reason: "invalid_action" };
  }

  const idempotencyKey = (input.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }

  let volume: number | null = null;
  if (action === "water") {
    const v = parseOptionalNumber(input.volumeMl);
    if (v === "invalid" || v === null || v <= 0) {
      return { ok: false, reason: "invalid_volume" };
    }
    volume = v;
  }

  const t = parseOptionalNumber(input.temperatureC);
  const h = parseOptionalNumber(input.humidityPct);
  const v = parseOptionalNumber(input.vpdKpa);
  if (t === "invalid" || h === "invalid" || v === "invalid") {
    return { ok: false, reason: "invalid_sensor_value" };
  }
  // Reconcile plausibility onto the single canonical band shared with v1 and
  // the server trigger (temperature -10..60°C, humidity 0..100, VPD 0..10 kPa;
  // null = not provided). Reusing the shared guards keeps a fat-fingered
  // temperature or a physically impossible VPD out of the permanent diary
  // entry, and stops this bound from drifting from the rest of the pipeline.
  if (!isTemperatureValid(t)) {
    return { ok: false, reason: "temperature_out_of_range" };
  }
  if (!isHumidityValid(h)) {
    return { ok: false, reason: "humidity_out_of_range" };
  }
  if (!isVpdValid(v)) {
    return { ok: false, reason: "vpd_out_of_range" };
  }

  const note = (input.note ?? "").trim();
  return {
    ok: true,
    payload: {
      p_target_type: resolved.targetType,
      p_target_id: resolved.targetId,
      p_action: action,
      p_volume_ml: volume,
      p_note: note === "" ? null : note,
      p_temperature_c: t,
      p_humidity_pct: h,
      p_vpd_kpa: v,
      p_occurred_at: input.occurredAt ?? null,
      ...(input.details ? { p_details: input.details } : {}),
      p_idempotency_key: idempotencyKey,
    },
  };
}
