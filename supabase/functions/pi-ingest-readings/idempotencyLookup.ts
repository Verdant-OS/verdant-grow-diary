// Server-only idempotency lookup for pi-ingest-readings.
//
// Read-only helper that returns the subset of supplied candidate
// idempotency keys that already exist for a given bridge in the
// `pi_ingest_idempotency_keys` table. This lets the endpoint
// distinguish new readings from duplicate readings before any
// inserts are enabled.
//
// This module:
//   - MUST run only inside the Edge Function path.
//   - MUST NOT be imported from anything under src/.
//   - MUST NOT accept a client-provided owner id.
//   - MUST NOT INSERT/UPDATE/DELETE/RPC anything.
//   - MUST NOT log key material.
//   - SELECTs only `idempotency_key`, filtered by
//     `bridge_id = ? AND idempotency_key IN (...)`.
//   - Chunks large IN-lists to stay under PostgREST query-size limits.

export const PI_INGEST_IDEMPOTENCY_LOOKUP_TABLE =
  "pi_ingest_idempotency_keys" as const;
export const PI_INGEST_IDEMPOTENCY_LOOKUP_COLUMNS = [
  "idempotency_key",
] as const;

/** Max number of keys per IN(...) chunk. Keeps URL/query size safe. */
export const PI_INGEST_IDEMPOTENCY_LOOKUP_CHUNK_SIZE = 200;

export type PiIngestIdempotencyLookupResponse = {
  data: unknown;
  error: { message: string } | null;
};

export type PiIngestIdempotencyLookupQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      in: (
        column: string,
        values: readonly string[],
      ) => Promise<PiIngestIdempotencyLookupResponse>;
    };
  };
};

export type PiIngestIdempotencyLookupClient = {
  from: (table: string) => PiIngestIdempotencyLookupQuery;
};

export type PiIngestIdempotencyLookupFailureReason =
  | "missing_bridge_id"
  | "lookup_failed";

export type PiIngestIdempotencyLookupResult =
  | { ok: true; existingKeys: ReadonlySet<string> }
  | {
      ok: false;
      reason: PiIngestIdempotencyLookupFailureReason;
      message: string;
    };

const FAILURE_MESSAGES: Record<
  PiIngestIdempotencyLookupFailureReason,
  string
> = {
  missing_bridge_id: "bridge_id is required",
  lookup_failed: "idempotency lookup failed",
};

function failure(
  reason: PiIngestIdempotencyLookupFailureReason,
): PiIngestIdempotencyLookupResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    if (v.length === 0) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Look up which of the supplied `candidateKeys` already exist for the
 * given `bridgeId`. Returns the matched keys as a `ReadonlySet<string>`.
 *
 * Fail-closed:
 *   - Missing/whitespace bridgeId → `missing_bridge_id`.
 *   - Missing client / DB error / malformed response → `lookup_failed`.
 *
 * Empty/duplicate-only candidateKeys short-circuits to `{ ok: true,
 * existingKeys: new Set() }` without touching the network.
 */
export async function loadExistingPiIngestIdempotencyKeys(
  client: PiIngestIdempotencyLookupClient,
  input: { bridgeId: string; candidateKeys: readonly string[] },
): Promise<PiIngestIdempotencyLookupResult> {
  const bridgeId = input?.bridgeId;
  if (typeof bridgeId !== "string" || bridgeId.trim().length === 0) {
    return failure("missing_bridge_id");
  }
  if (!client || typeof client.from !== "function") {
    return failure("lookup_failed");
  }

  const keys = dedupeNonEmpty(input?.candidateKeys ?? []);
  if (keys.length === 0) {
    return { ok: true, existingKeys: new Set<string>() };
  }

  const found = new Set<string>();
  for (const part of chunk(keys, PI_INGEST_IDEMPOTENCY_LOOKUP_CHUNK_SIZE)) {
    let response: PiIngestIdempotencyLookupResponse;
    try {
      response = await client
        .from(PI_INGEST_IDEMPOTENCY_LOOKUP_TABLE)
        .select(PI_INGEST_IDEMPOTENCY_LOOKUP_COLUMNS.join(","))
        .eq("bridge_id", bridgeId)
        .in("idempotency_key", part);
    } catch {
      return failure("lookup_failed");
    }

    if (!response || response.error) {
      return failure("lookup_failed");
    }
    const data = response.data;
    if (data == null) continue;
    if (!Array.isArray(data)) return failure("lookup_failed");
    for (const row of data) {
      if (!isPlainObject(row)) return failure("lookup_failed");
      const k = row.idempotency_key;
      if (typeof k === "string" && k.length > 0) found.add(k);
    }
  }

  return { ok: true, existingKeys: found };
}
