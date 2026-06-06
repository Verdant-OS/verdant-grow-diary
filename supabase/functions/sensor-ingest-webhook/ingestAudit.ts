// Pure helpers for the sensor-ingest audit log.
//
// The webhook records one audit row per accepted ingest request. This module
// builds and validates that row deterministically so it can be unit-tested
// without spinning up Supabase.

export type IngestAuthKind = "jwt" | "bridge";

export interface BuildIngestAuditInput {
  authKind: IngestAuthKind;
  userId: string;
  tentId: string;
  bridgeTokenId?: string | null;
  source: string;
  capturedAt: string;
  rowsReceived: number;
  rowsInserted: number;
}

export interface IngestAuditRecord {
  user_id: string;
  tent_id: string;
  auth_type: IngestAuthKind;
  bridge_token_id: string | null;
  source: string;
  captured_at: string;
  rows_received: number;
  rows_inserted: number;
}

function isUuidLike(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

function isIsoLike(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 10) return false;
  const d = Date.parse(s);
  return Number.isFinite(d);
}

/**
 * Build a sanitized audit record. Returns null when any field is invalid so
 * callers can skip writing rather than persisting garbage.
 */
export function buildIngestAuditRecord(
  input: BuildIngestAuditInput,
): IngestAuditRecord | null {
  if (input.authKind !== "jwt" && input.authKind !== "bridge") return null;
  if (!isUuidLike(input.userId)) return null;
  if (!isUuidLike(input.tentId)) return null;
  if (typeof input.source !== "string" || input.source.length === 0) return null;
  if (!isIsoLike(input.capturedAt)) return null;
  if (!Number.isFinite(input.rowsReceived) || input.rowsReceived < 0) return null;
  if (!Number.isFinite(input.rowsInserted) || input.rowsInserted < 0) return null;
  if (input.rowsInserted > input.rowsReceived) return null;

  // JWT path must never carry a bridge_token_id input.
  if (
    input.authKind === "jwt" &&
    input.bridgeTokenId !== undefined &&
    input.bridgeTokenId !== null
  ) {
    return null;
  }

  const bridgeTokenId =
    input.authKind === "bridge" && isUuidLike(input.bridgeTokenId)
      ? input.bridgeTokenId
      : null;



  return {
    user_id: input.userId,
    tent_id: input.tentId,
    auth_type: input.authKind,
    bridge_token_id: bridgeTokenId,
    source: input.source,
    captured_at: input.capturedAt,
    rows_received: input.rowsReceived,
    rows_inserted: input.rowsInserted,
  };
}
