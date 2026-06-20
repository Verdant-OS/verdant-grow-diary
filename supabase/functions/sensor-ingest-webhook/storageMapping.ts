// Pure helpers for sensor-ingest-webhook storage mapping + safe error
// classification. Imported by index.ts and exercised directly from tests.
//
// Verdant sensor-truth contract: stored `source` on `sensor_readings` is a
// canonical telemetry-state label (live / manual / csv / demo / stale /
// invalid). Vendor lineage (EcoWitt, Home Assistant, MQTT) is NOT a stored
// source — it lives in `raw_payload` as `vendor` + `transport_source` so
// auth, ownership, and routing never trust it.

/** Allow-listed canonical stored sources for sensor_readings.source. */
export const CANONICAL_STORED_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;
export type CanonicalStoredSource =
  (typeof CANONICAL_STORED_SOURCES)[number];

/**
 * Map an incoming transport/vendor source label to a canonical stored
 * source. Transport labels (e.g. "ecowitt", "mqtt", "webhook") are not
 * stored verbatim — they collapse to "live" because they describe how the
 * reading arrived, not its telemetry-truth state. Already-canonical
 * labels pass through unchanged. Unknown inputs default to "live" so the
 * row is never quarantined accidentally; per-row quality classification
 * is the source of truth for stale/invalid.
 */
export function mapStoredSourceForTransport(
  incoming: string | null | undefined,
): CanonicalStoredSource {
  if (typeof incoming !== "string" || incoming.length === 0) return "live";
  const lower = incoming.trim().toLowerCase();
  if ((CANONICAL_STORED_SOURCES as readonly string[]).includes(lower)) {
    return lower as CanonicalStoredSource;
  }
  // Known transport/vendor labels that must collapse to canonical "live".
  return "live";
}

/**
 * Build the per-row insert payload for `sensor_readings`. Remaps the
 * normalized transport source to canonical, folds the original transport
 * label and Idempotency-Key into `raw_payload`, and stamps user_id from
 * the authenticated identity (never from the request body).
 */
export function buildStoredRow<R extends Record<string, unknown>>(args: {
  row: R;
  userId: string;
  idempotencyKey: string | null;
}): R & {
  user_id: string;
  source: CanonicalStoredSource;
  raw_payload: Record<string, unknown>;
} {
  const { row, userId, idempotencyKey } = args;
  const incomingSource =
    typeof row.source === "string" ? (row.source as string) : null;
  const storedSource = mapStoredSourceForTransport(incomingSource);
  const baseRaw =
    (row.raw_payload && typeof row.raw_payload === "object"
      ? (row.raw_payload as Record<string, unknown>)
      : {});
  const baseMeta =
    (baseRaw.metadata && typeof baseRaw.metadata === "object"
      ? (baseRaw.metadata as Record<string, unknown>)
      : {});
  const nextRaw: Record<string, unknown> = {
    ...baseRaw,
    metadata: {
      ...baseMeta,
      transport_source: incomingSource ?? null,
      verdant_source: storedSource,
    },
  };
  if (incomingSource && !nextRaw.vendor) {
    // Preserve transport label as vendor lineage when caller didn't supply
    // a more specific vendor string. Never used for auth/routing.
    nextRaw.vendor = incomingSource;
  }
  if (idempotencyKey) {
    nextRaw.idempotency_key = idempotencyKey;
  }
  return {
    ...row,
    user_id: userId,
    source: storedSource,
    raw_payload: nextRaw,
  };
}

// ---------------------------------------------------------------------------
// Sanitized insert-error classification.
// ---------------------------------------------------------------------------

export type InsertErrorReason =
  | "insert_required_field_missing"
  | "insert_source_constraint_failed"
  | "insert_check_failed"
  | "insert_column_mismatch"
  | "insert_duplicate"
  | "insert_unknown";

interface ClassifiableInsertError {
  code?: string | null;
  message?: string | null;
}

/**
 * Map a Postgres/PostgREST insert error to a stable, sanitized reason
 * code. Never returns raw error text, constraint names, table names, or
 * column values — only one of `InsertErrorReason`. Used by both the
 * response body and the safeLog event.
 */
export function classifyInsertError(
  err: ClassifiableInsertError | null | undefined,
): InsertErrorReason {
  if (!err) return "insert_unknown";
  const code = typeof err.code === "string" ? err.code : "";
  const msg = typeof err.message === "string" ? err.message.toLowerCase() : "";
  if (code === "23502") return "insert_required_field_missing";
  if (code === "23505") return "insert_duplicate";
  if (code === "42703" || code === "42P10") return "insert_column_mismatch";
  if (code === "23514") {
    if (msg.includes("source")) return "insert_source_constraint_failed";
    return "insert_check_failed";
  }
  // Trigger-raised exceptions surface as P0001 with a sanitized message.
  if (code === "P0001") {
    if (msg.includes("source")) return "insert_source_constraint_failed";
    if (msg.includes("metric") || msg.includes("quality")) {
      return "insert_check_failed";
    }
    return "insert_check_failed";
  }
  if (msg.includes("does not exist") && msg.includes("column")) {
    return "insert_column_mismatch";
  }
  if (msg.includes("violates check constraint")) {
    if (msg.includes("source")) return "insert_source_constraint_failed";
    return "insert_check_failed";
  }
  if (msg.includes("null value") && msg.includes("not-null")) {
    return "insert_required_field_missing";
  }
  return "insert_unknown";
}
