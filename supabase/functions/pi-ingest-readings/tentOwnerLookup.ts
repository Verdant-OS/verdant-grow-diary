// Server-only tent-owner lookup for pi-ingest-readings.
//
// Resolves a `tent_id` to its owning `user_id` from `tents.user_id`,
// which is the authoritative ownership column. The returned owner id
// is consumed only inside the Edge Function (passed into
// `evaluateBridgeAuthorization`) and is NEVER returned to the bridge
// caller.
//
// This module:
//   - MUST run only inside the Edge Function path.
//   - MUST NOT be imported from anything under src/.
//   - MUST NOT trust a client-provided owner id.
//   - MUST NOT insert sensor readings, idempotency keys, alerts, or
//     action_queue rows.
//   - MUST NOT construct a Supabase client or read service-role env.
//   - Is read-only and selects only `user_id` for the matched tent.
//
// See: docs/pi-ingest-tent-owner-lookup-contract.md

export const TENT_OWNER_LOOKUP_TABLE = "tents" as const;
export const TENT_OWNER_LOOKUP_COLUMNS = ["user_id"] as const;

export type PiIngestTentOwnerLookupResponse = {
  data: unknown;
  error: { message: string } | null;
};

export type PiIngestTentOwnerLookupQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      limit: (count: number) => Promise<PiIngestTentOwnerLookupResponse>;
    };
  };
};

export type PiIngestTentOwnerLookupClient = {
  from: (table: string) => PiIngestTentOwnerLookupQuery;
};

export type PiIngestTentOwnerLookupFailureReason =
  | "missing_tent_id"
  | "unknown_tent"
  | "tent_without_owner"
  | "tent_owner_lookup_failed";

export type PiIngestTentOwnerLookupResult =
  | { ok: true; tentId: string; tentOwnerUserId: string }
  | {
      ok: false;
      reason: PiIngestTentOwnerLookupFailureReason;
      message: string;
    };

const FAILURE_MESSAGES: Record<PiIngestTentOwnerLookupFailureReason, string> = {
  missing_tent_id: "tent_id is required",
  unknown_tent: "tent not found",
  tent_without_owner: "tent has no owner",
  tent_owner_lookup_failed: "tent owner lookup failed",
};

function failure(
  reason: PiIngestTentOwnerLookupFailureReason,
): PiIngestTentOwnerLookupResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve the owning `user_id` for a given `tent_id`.
 *
 * Fail-closed:
 *   - Missing/whitespace tent_id → `missing_tent_id`.
 *   - No row found              → `unknown_tent`.
 *   - Row found without user_id → `tent_without_owner`.
 *   - DB/client error or >1 row → `tent_owner_lookup_failed`.
 *
 * Never throws on the failure paths above; returns a structured
 * `{ ok: false, reason }` so callers can convert to the appropriate
 * fail-closed response without leaking internals to the bridge.
 */
export async function loadTentOwnerUserId(
  tentId: string,
  client: PiIngestTentOwnerLookupClient,
): Promise<PiIngestTentOwnerLookupResult> {
  if (typeof tentId !== "string" || tentId.trim().length === 0) {
    return failure("missing_tent_id");
  }
  if (!client || typeof client.from !== "function") {
    return failure("tent_owner_lookup_failed");
  }

  let response: PiIngestTentOwnerLookupResponse;
  try {
    response = await client
      .from(TENT_OWNER_LOOKUP_TABLE)
      .select(TENT_OWNER_LOOKUP_COLUMNS.join(","))
      .eq("id", tentId)
      .limit(2);
  } catch {
    return failure("tent_owner_lookup_failed");
  }

  if (!response || response.error) {
    return failure("tent_owner_lookup_failed");
  }

  const data = response.data;
  if (data == null) return failure("unknown_tent");
  if (!Array.isArray(data)) return failure("tent_owner_lookup_failed");
  if (data.length === 0) return failure("unknown_tent");
  if (data.length > 1) return failure("tent_owner_lookup_failed");

  const row = data[0];
  if (!isPlainObject(row)) return failure("tent_owner_lookup_failed");
  const ownerId = row.user_id;
  if (typeof ownerId !== "string" || ownerId.trim().length === 0) {
    return failure("tent_without_owner");
  }

  return { ok: true, tentId, tentOwnerUserId: ownerId };
}
