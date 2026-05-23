// Server-only bridge credential lookup for pi-ingest-readings.
//
// MUST run only inside this Edge Function path. MUST NOT be imported
// from any file under src/. Reads exactly the columns enumerated in
// docs/pi-ingest-bridge-credential-lookup-contract.md and never
// selects secret_hash, plaintext secret, raw body, raw payload,
// signature, or sensor value columns. Relies on the database-level
// global uniqueness constraint on `bridge_id` enforced by migration
// 20260523164651; throws `multiple_rows_unexpected` as defense in
// depth if more than one row is ever returned.
//
// This module does not authenticate the bridge, decrypt secrets,
// insert sensor readings, write idempotency keys, derive alerts,
// enqueue actions, or control devices. It is read-only.
//
// See:
// - docs/pi-ingest-bridge-credential-lookup-contract.md
// - docs/pi-ingest-readings-contract.md

import type {
  PiIngestBridgeCredentialRow,
  PiIngestBridgeSecretStatus,
} from "./bridgeCredentialRow.ts";

/** Columns the lookup is allowed to SELECT. */
export const BRIDGE_CREDENTIAL_LOOKUP_COLUMNS = [
  "bridge_id",
  "user_id",
  "is_active",
  "secret_ciphertext",
  "secret_nonce",
  "secret_key_version",
  "secret_status",
  "allowed_tent_ids",
  "last_used_at",
] as const;

export const BRIDGE_CREDENTIAL_TABLE =
  "pi_ingest_bridge_credentials" as const;

/**
 * Minimal client surface required by the lookup. Compatible with the
 * supabase-js v2 query builder shape but kept structural so tests can
 * inject a mock without importing the real client.
 */
export type PiIngestBridgeCredentialLookupResponse = {
  data: unknown;
  error: { message: string } | null;
};

export type PiIngestBridgeCredentialLookupQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      limit: (count: number) => Promise<PiIngestBridgeCredentialLookupResponse>;
    };
  };
};

export type PiIngestBridgeCredentialLookupClient = {
  from: (table: string) => PiIngestBridgeCredentialLookupQuery;
};

const ALLOWED_STATUSES: ReadonlySet<PiIngestBridgeSecretStatus> = new Set([
  "pending_rotation",
  "active_encrypted",
  "disabled",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceCipherField(
  value: unknown,
): Uint8Array | string | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return value;
  return null;
}

function coerceAllowedTentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function coerceRow(raw: unknown): PiIngestBridgeCredentialRow {
  if (!isPlainObject(raw)) {
    throw new Error("invalid_credential_row");
  }
  const status = raw.secret_status;
  if (
    typeof status !== "string" ||
    !ALLOWED_STATUSES.has(status as PiIngestBridgeSecretStatus)
  ) {
    throw new Error("invalid_secret_status");
  }
  if (typeof raw.bridge_id !== "string" || raw.bridge_id.length === 0) {
    throw new Error("invalid_credential_row");
  }
  if (typeof raw.user_id !== "string" || raw.user_id.length === 0) {
    throw new Error("invalid_credential_row");
  }
  const version = raw.secret_key_version;
  return {
    bridge_id: raw.bridge_id,
    user_id: raw.user_id,
    is_active: raw.is_active === true,
    secret_ciphertext: coerceCipherField(raw.secret_ciphertext),
    secret_nonce: coerceCipherField(raw.secret_nonce),
    secret_key_version:
      typeof version === "number" && Number.isInteger(version) ? version : null,
    secret_status: status as PiIngestBridgeSecretStatus,
    allowed_tent_ids: coerceAllowedTentIds(raw.allowed_tent_ids),
    last_used_at:
      typeof raw.last_used_at === "string" ? raw.last_used_at : null,
  };
}

/**
 * Load exactly one encrypted bridge credential row by globally unique
 * `bridge_id`.
 *
 * - Returns `null` if `bridge_id` is missing/empty or no row exists.
 * - Throws `multiple_rows_unexpected` if more than one row is returned
 *   (defense in depth against any future constraint regression).
 * - Throws `bridge_credential_lookup_failed` on any client/DB error.
 * - Never accepts a body-provided owner id, key version, or status.
 *
 * The caller (future endpoint code) MUST treat the returned row as
 * server-only and pass it through `toResolveBridgeSecretInput` before
 * invoking `resolveBridgeSecret`.
 */
export async function loadBridgeCredentialRow(
  bridgeId: string,
  client?: PiIngestBridgeCredentialLookupClient,
): Promise<PiIngestBridgeCredentialRow | null> {
  if (typeof bridgeId !== "string" || bridgeId.trim().length === 0) {
    return null;
  }
  if (!client) {
    throw new Error("bridge_credential_lookup_client_required");
  }

  const response = await client
    .from(BRIDGE_CREDENTIAL_TABLE)
    .select(BRIDGE_CREDENTIAL_LOOKUP_COLUMNS.join(","))
    .eq("bridge_id", bridgeId)
    .limit(2);

  if (response.error) {
    throw new Error("bridge_credential_lookup_failed");
  }

  const data = response.data;
  if (data == null) return null;
  if (!Array.isArray(data)) {
    throw new Error("bridge_credential_lookup_failed");
  }
  if (data.length === 0) return null;
  if (data.length > 1) {
    throw new Error("multiple_rows_unexpected");
  }
  return coerceRow(data[0]);
}
