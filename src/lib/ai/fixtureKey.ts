/**
 * VERDANT-18: Shared deterministic fixture key helper.
 *
 * Produces a stable string key from a DoctorContext so the MockAIClient
 * and fixture registry both agree on lookups. Pure & deterministic —
 * given the same context, returns the same key every call.
 *
 * The key intentionally encodes only the fields that affect Doctor
 * behavior: source, stage, autoflower flag, plant presence, and coarse
 * metric buckets. Non-deterministic noise (raw payload, ids, free-text
 * notes) is excluded.
 */
import type { DoctorContext } from "./types";

/**
 * Bucket a numeric value into "missing" / a coarse band so small noise
 * does not change the key. Buckets are deliberately wide.
 */
function bucket(v: number | null | undefined, step: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "x";
  return String(Math.round(v / step) * step);
}

export function fixtureKeyFor(ctx: DoctorContext): string {
  const s = ctx.snapshot;
  const p = ctx.plant;
  const parts = [
    `src=${s.source}`,
    `stage=${p?.stage ?? "none"}`,
    `auto=${p?.isAutoflower ? "1" : "0"}`,
    `plant=${p ? "1" : "0"}`,
    `t=${bucket(s.temperatureC, 1)}`,
    `rh=${bucket(s.humidityPct, 5)}`,
    `vpd=${bucket(s.vpdKpa, 0.1)}`,
    `sm=${bucket(s.soilMoisturePct, 5)}`,
  ];
  return parts.join("|");
}
