/**
 * Pure pi-ingest bridge credential METADATA resolver.
 *
 * Converts rows from the metadata-only safe view into a normalized
 * BridgeCredentialMetadata shape for use by future server-side code.
 *
 * Hard rules (enforced by static tests):
 * - No Supabase imports.
 * - No secret material on input or output.
 * - No decryption.
 * - Inactive rows are skipped.
 * - Duplicate (user_id, bridge_id) pairs collapse to the most recently
 *   updated row.
 */

export type PiIngestBridgeCredentialSafeRow = {
  id: string;
  user_id: string;
  bridge_id: string;
  secret_hint: string | null;
  allowed_tent_ids: string[];
  is_active: boolean;
  secret_status: "pending_rotation" | "active_encrypted" | "disabled";
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type BridgeCredentialMetadata = {
  id: string;
  userId: string;
  bridgeId: string;
  secretHint: string | null;
  allowedTentIds: string[];
  isActive: boolean;
  secretStatus: "pending_rotation" | "active_encrypted" | "disabled";
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidRow(row: unknown): row is PiIngestBridgeCredentialSafeRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  if (
    !isNonEmptyString(r.id) ||
    !isNonEmptyString(r.user_id) ||
    !isNonEmptyString(r.bridge_id)
  ) {
    return false;
  }
  if (typeof r.is_active !== "boolean") return false;
  if (
    r.secret_status !== "pending_rotation" &&
    r.secret_status !== "active_encrypted" &&
    r.secret_status !== "disabled"
  ) {
    return false;
  }
  if (!Array.isArray(r.allowed_tent_ids)) return false;
  if (!r.allowed_tent_ids.every((t) => isNonEmptyString(t))) return false;
  if (!isNonEmptyString(r.created_at) || !isNonEmptyString(r.updated_at)) {
    return false;
  }
  if (r.last_used_at !== null && !isNonEmptyString(r.last_used_at)) {
    return false;
  }
  if (r.secret_hint !== null && typeof r.secret_hint !== "string") {
    return false;
  }
  return true;
}

function mapRow(
  row: PiIngestBridgeCredentialSafeRow,
): BridgeCredentialMetadata {
  return {
    id: row.id,
    userId: row.user_id,
    bridgeId: row.bridge_id,
    secretHint: row.secret_hint,
    allowedTentIds: [...row.allowed_tent_ids],
    isActive: row.is_active,
    secretStatus: row.secret_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export function resolvePiIngestBridgeCredentialMetadata(
  rows: ReadonlyArray<unknown> | null | undefined,
): BridgeCredentialMetadata[] {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return [];

  // Validate + skip inactive in one pass.
  const valid: PiIngestBridgeCredentialSafeRow[] = [];
  for (const row of rows) {
    if (!isValidRow(row)) continue;
    if (!row.is_active) continue;
    valid.push(row);
  }

  // Dedupe by (user_id, bridge_id), keeping the most recently updated row.
  const byKey = new Map<string, PiIngestBridgeCredentialSafeRow>();
  for (const row of valid) {
    const key = `${row.user_id}::${row.bridge_id}`;
    const prev = byKey.get(key);
    if (!prev || row.updated_at > prev.updated_at) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values()).map(mapRow);
}
