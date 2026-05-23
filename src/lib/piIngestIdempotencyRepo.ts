/**
 * piIngestIdempotencyRepo — thin data-access adapter for the
 * `pi_ingest_idempotency_keys` table.
 *
 * STRICT SCOPE:
 *  - Touches ONLY `pi_ingest_idempotency_keys`.
 *  - No service_role. No raw SQL. No auth bypass.
 *  - No writes to `sensor_readings`, alerts, action_queue, or any other table.
 *  - No `raw_payload`, `signature`, `secret`, or `value` fields.
 *  - Caller-supplied Supabase client (RLS-scoped) for testability.
 *
 * Exposes:
 *  - listExistingPiIngestIdempotencyKeys(supabase, { userId, keys })
 *  - insertPiIngestIdempotencyKeys(supabase, rows)
 */
import type { Database } from "@/integrations/supabase/types";

export type PiIngestIdempotencyRow =
  Database["public"]["Tables"]["pi_ingest_idempotency_keys"]["Row"];
export type PiIngestIdempotencyInsert =
  Database["public"]["Tables"]["pi_ingest_idempotency_keys"]["Insert"];

export interface ListExistingPiIngestIdempotencyKeysInput {
  readonly userId: string;
  readonly keys: readonly string[];
}

/**
 * Minimal structural type of the Supabase client surface we depend on.
 * Keeps the adapter testable without importing the real client at module
 * scope and without coupling to its full generated type surface.
 */
export interface PiIngestIdempotencySupabaseLike {
  from(table: "pi_ingest_idempotency_keys"): {
    select(columns: "idempotency_key"): {
      eq(col: "user_id", value: string): {
        in(col: "idempotency_key", values: readonly string[]): Promise<{
          data: Array<Pick<PiIngestIdempotencyRow, "idempotency_key">> | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert(rows: readonly PiIngestIdempotencyInsert[]): Promise<{
      error: { message: string } | null;
    }>;
  };
}

// Chunk sizes chosen to stay well under Postgres / PostgREST limits.
const LOOKUP_CHUNK_SIZE = 200;
const INSERT_CHUNK_SIZE = 200;

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function dedupePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string" || v === "") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Look up which of the supplied idempotency keys already exist for the given
 * owner. Returns the matching keys (deduped, RLS-scoped to the caller).
 *
 * Empty-input shortcut: if `keys` is empty after dedupe, returns [] without
 * touching the network.
 */
export async function listExistingPiIngestIdempotencyKeys(
  supabase: PiIngestIdempotencySupabaseLike,
  input: ListExistingPiIngestIdempotencyKeysInput,
): Promise<string[]> {
  if (!input || typeof input.userId !== "string" || input.userId === "") {
    throw new Error(
      "piIngestIdempotencyRepo.listExistingPiIngestIdempotencyKeys: userId is required",
    );
  }
  const keys = dedupePreserveOrder(input.keys ?? []);
  if (keys.length === 0) return [];

  const found = new Set<string>();
  for (const part of chunk(keys, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("pi_ingest_idempotency_keys")
      .select("idempotency_key")
      .eq("user_id", input.userId)
      .in("idempotency_key", part);
    if (error) {
      throw new Error(
        `piIngestIdempotencyRepo.listExistingPiIngestIdempotencyKeys: ${error.message}`,
      );
    }
    for (const row of data ?? []) {
      if (row && typeof row.idempotency_key === "string") {
        found.add(row.idempotency_key);
      }
    }
  }
  // Preserve input order.
  return keys.filter((k) => found.has(k));
}

/**
 * Insert newly accepted idempotency key records. Caller is responsible for
 * producing well-formed rows (user_id, tent_id, bridge_id, device_id, metric,
 * captured_at, idempotency_key, optional sensor_reading_id).
 *
 * Empty-input shortcut: if `rows` is empty, returns without touching the
 * network.
 */
export async function insertPiIngestIdempotencyKeys(
  supabase: PiIngestIdempotencySupabaseLike,
  rows: readonly PiIngestIdempotencyInsert[],
): Promise<void> {
  if (!rows || rows.length === 0) return;
  for (const part of chunk(rows, INSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("pi_ingest_idempotency_keys")
      .insert(part);
    if (error) {
      throw new Error(
        `piIngestIdempotencyRepo.insertPiIngestIdempotencyKeys: ${error.message}`,
      );
    }
  }
}
