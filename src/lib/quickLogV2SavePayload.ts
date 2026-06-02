/**
 * QuickLog v2 — pure save payload builder.
 * Maps validated form state to the RPC parameter shape.
 * No I/O. No JSX. Deterministic.
 */

import type { QuickLogV2Action, ResolvedQuickLogV2Target } from "./quickLogV2Rules";

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
}

export type BuildResult =
  | { ok: true; payload: QuickLogV2SavePayload }
  | { ok: false; reason: string };

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw?.trim?.() ?? "";
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "invalid";
  return n;
}

export function buildQuickLogV2SavePayload(
  input: BuildQuickLogV2PayloadInput,
): BuildResult {
  const { resolved, action } = input;
  if (!resolved?.ok || !resolved.targetType || !resolved.targetId) {
    return { ok: false, reason: "target_unresolved" };
  }
  if (action === "photo") {
    return { ok: false, reason: "photo_saving_not_enabled" };
  }
  if (action !== "water" && action !== "note") {
    return { ok: false, reason: "invalid_action" };
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
  if (h !== null && (h < 0 || h > 100)) {
    return { ok: false, reason: "humidity_out_of_range" };
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
    },
  };
}
