/**
 * Pure normalization + validation for the Shelly H&T Gen4 webhook ingest.
 *
 * No I/O, no React, no Supabase. Deterministic only.
 *
 * Scope:
 *  - Accepts a loosely-shaped Shelly H&T webhook payload.
 *  - Normalizes temperature (F/C) to °C and validates humidity %.
 *  - Computes VPD (kPa) via the shared `computeVpdKpa` helper so manual
 *    snapshots and webhook ingests produce identical VPD for the same
 *    inputs.
 *  - Returns a row plan compatible with the `sensor_readings` DB trigger
 *    (`temperature_c`, `humidity_pct`, `vpd_kpa`; source `pi_bridge`).
 *  - Does NOT touch alerts, action_queue, automation, device control.
 *  - Does NOT trust client-provided user_id or tent_id.
 */
import {
  computeVpdKpa,
  fahrenheitToCelsius,
} from "@/lib/sensorReadingManualEntryRules";

export const SHELLY_HT_DEVICE_LABEL = "Shelly H&T Gen4";
export const SHELLY_HT_DEVICE_ID_PREFIX = "shelly-ht-gen4";

/** Realistic grow-room temperature bounds in °C. */
const MIN_TEMP_C = -10;
const MAX_TEMP_C = 60;

export interface ShellyHtWebhookPayload {
  temperature?: unknown;
  temperature_f?: unknown;
  temperature_c?: unknown;
  humidity?: unknown;
  /** Optional Shelly device identifier — preserved in device_id only. */
  device_id?: unknown;
  /** Optional captured-at timestamp. Server time used when missing/invalid. */
  ts?: unknown;
  captured_at?: unknown;
}

export type ShellyMetric = "temperature_c" | "humidity_pct" | "vpd_kpa";

export interface ShellyNormalizedRow {
  metric: ShellyMetric;
  value: number;
  /** True when derived (VPD), false for raw inputs. */
  derived: boolean;
}

export interface ShellyNormalizationResult {
  ok: boolean;
  rows: ShellyNormalizedRow[];
  errors: string[];
  /** Raw device_id passthrough; namespaced. Never accepts free-form. */
  deviceId: string;
  /** ISO timestamp resolved for the reading batch. */
  capturedAt: string;
}

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickTemperatureC(p: ShellyHtWebhookPayload): {
  value: number | null;
  source: "c" | "f" | "default-f" | null;
} {
  const c = toFinite(p.temperature_c);
  if (c !== null) return { value: c, source: "c" };
  const f = toFinite(p.temperature_f);
  if (f !== null) return { value: fahrenheitToCelsius(f), source: "f" };
  const t = toFinite(p.temperature);
  // v1: bare `temperature` defaults to Fahrenheit (grow-room convention).
  if (t !== null) return { value: fahrenheitToCelsius(t), source: "default-f" };
  return { value: null, source: null };
}

function resolveDeviceId(raw: unknown): string {
  if (typeof raw !== "string") return SHELLY_HT_DEVICE_ID_PREFIX;
  const trimmed = raw.trim().slice(0, 64).replace(/[^a-zA-Z0-9_:-]/g, "");
  if (!trimmed) return SHELLY_HT_DEVICE_ID_PREFIX;
  return `${SHELLY_HT_DEVICE_ID_PREFIX}:${trimmed}`;
}

function resolveCapturedAt(p: ShellyHtWebhookPayload, now: Date): string {
  const raw = p.captured_at ?? p.ts;
  if (typeof raw === "string" || typeof raw === "number") {
    const t = new Date(raw as string | number).getTime();
    if (Number.isFinite(t)) {
      // Never accept timestamps more than 5 min in the future (trigger guard).
      if (t <= now.getTime() + 5 * 60 * 1000) return new Date(t).toISOString();
    }
  }
  return now.toISOString();
}

/**
 * Normalize a Shelly H&T payload. Pure. Never throws on bad input;
 * returns `{ ok: false, errors }` so the webhook can respond 200 without
 * persisting anything trusted.
 */
export function normalizeShellyHtPayload(
  payload: ShellyHtWebhookPayload | null | undefined,
  opts: { now?: Date } = {},
): ShellyNormalizationResult {
  const now = opts.now ?? new Date();
  const deviceId = resolveDeviceId(
    payload && typeof payload === "object" ? payload.device_id : undefined,
  );
  const capturedAt = resolveCapturedAt(payload ?? {}, now);
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      rows: [],
      errors: ["payload required"],
      deviceId,
      capturedAt,
    };
  }

  const { value: tempC } = pickTemperatureC(payload);
  const humidity = toFinite(payload.humidity);

  if (tempC === null) errors.push("temperature required");
  else if (tempC < MIN_TEMP_C || tempC > MAX_TEMP_C)
    errors.push(`temperature out of realistic range: ${tempC.toFixed(2)}°C`);

  if (humidity === null) errors.push("humidity required");
  else if (humidity < 0 || humidity > 100)
    errors.push(`humidity out of range: ${humidity}`);

  if (errors.length > 0)
    return { ok: false, rows: [], errors, deviceId, capturedAt };

  const rows: ShellyNormalizedRow[] = [
    { metric: "temperature_c", value: tempC as number, derived: false },
    { metric: "humidity_pct", value: humidity as number, derived: false },
    {
      metric: "vpd_kpa",
      value: computeVpdKpa(tempC as number, humidity as number),
      derived: true,
    },
  ];

  return { ok: true, rows, errors: [], deviceId, capturedAt };
}

/**
 * Return a device-detail label for a sensor reading when one is known.
 * Never duplicates the SOURCE_LABEL map — it augments it.
 * Returns null when the device is unknown so callers can fall back to
 * the existing source label only.
 */
export function formatSensorDeviceDetail(
  deviceId: string | null | undefined,
): string | null {
  if (!deviceId || typeof deviceId !== "string") return null;
  if (deviceId === SHELLY_HT_DEVICE_ID_PREFIX) return SHELLY_HT_DEVICE_LABEL;
  if (deviceId.startsWith(`${SHELLY_HT_DEVICE_ID_PREFIX}:`))
    return SHELLY_HT_DEVICE_LABEL;
  return null;
}
