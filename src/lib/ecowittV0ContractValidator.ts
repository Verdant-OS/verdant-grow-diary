/**
 * Pure validators for the EcoWitt V0 live ingest contract.
 *
 * Safe-by-design: no network, no Supabase, no AI, no fs, no device control.
 * These helpers only inspect plain JS objects and return deterministic
 * pass/fail outcomes.
 */

export const CANONICAL_STORED_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type CanonicalStoredSource = (typeof CANONICAL_STORED_SOURCES)[number];

export const FORBIDDEN_RENDER_STRINGS = [
  "PASSKEY",
  "Authorization",
  "Bearer",
  "vbt_",
  "service_role",
] as const;

const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

export interface ContractValidationResult {
  ok: boolean;
  errors: string[];
}

/** Forwarded transport payload (bridge → webhook). May use source="ecowitt". */
export function validateForwardedTransportPayload(
  payload: unknown,
): ContractValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload is not an object"] };
  }
  const p = payload as Record<string, unknown>;
  if (p.source !== "ecowitt" && !CANONICAL_STORED_SOURCES.includes(p.source as CanonicalStoredSource)) {
    errors.push(`forwarded source not allowed: ${String(p.source)}`);
  }
  if (typeof p.captured_at !== "string") errors.push("captured_at missing");
  if (!p.metrics || typeof p.metrics !== "object") errors.push("metrics missing");
  // Secrets must never appear in the forwarded body.
  const body = JSON.stringify(payload);
  for (const s of FORBIDDEN_RENDER_STRINGS) {
    if (body.includes(s)) errors.push(`forbidden string in forwarded payload: ${s}`);
  }
  if (JWT_LIKE.test(body)) errors.push("JWT-shaped string in forwarded payload");
  return { ok: errors.length === 0, errors };
}

/** Stored row (public.sensor_readings). MUST use canonical source. */
export function validateStoredRow(row: unknown): ContractValidationResult {
  const errors: string[] = [];
  if (!row || typeof row !== "object") {
    return { ok: false, errors: ["row is not an object"] };
  }
  const r = row as Record<string, unknown>;
  if (!CANONICAL_STORED_SOURCES.includes(r.source as CanonicalStoredSource)) {
    errors.push(`stored source not canonical: ${String(r.source)}`);
  }
  if (typeof r.captured_at !== "string") errors.push("captured_at missing");
  if (typeof r.tent_id !== "string") errors.push("tent_id missing");
  // These belong inside raw_payload, never at the top level.
  for (const forbiddenTopLevel of ["vendor", "metadata", "idempotency_key"]) {
    if (forbiddenTopLevel in r) {
      errors.push(`forbidden top-level column on stored row: ${forbiddenTopLevel}`);
    }
  }
  // Lineage must live inside raw_payload when EcoWitt provenance is present.
  const raw = r.raw_payload as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object") {
    if (!("vendor" in raw) && !(raw.metadata && typeof raw.metadata === "object")) {
      errors.push("raw_payload present but missing vendor / metadata lineage");
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Static safety: assert no forbidden strings render in a UI-bound string. */
export function assertNoForbiddenRenderStrings(s: string): ContractValidationResult {
  const errors: string[] = [];
  for (const f of FORBIDDEN_RENDER_STRINGS) {
    if (s.includes(f)) errors.push(`forbidden render string: ${f}`);
  }
  if (JWT_LIKE.test(s)) errors.push("JWT-shaped string in rendered output");
  return { ok: errors.length === 0, errors };
}
