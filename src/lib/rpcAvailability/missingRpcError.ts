/**
 * Generalized detector for "this Postgres RPC is missing / out of sync with
 * the generated schema types" errors surfaced by Supabase / PostgREST.
 *
 * Distilled from `actionQueueRpcAvailability.ts` so any audit RPC wrapper can
 * decide whether to render the graceful missing-RPC fallback UI instead of a
 * generic error toast.
 *
 * Pure, side-effect free. No React, no Supabase, no logging.
 */

const KNOWN_MISSING_RPC_CODES: ReadonlySet<string> = new Set([
  "PGRST202", // PostgREST: function not found in schema cache
  "PGRST203", // PostgREST: ambiguous / signature mismatch after rename
  "42883", // Postgres: undefined_function
]);

const MISSING_RPC_MESSAGE_PATTERNS: readonly RegExp[] = [
  /could not find the function/i,
  /function .* does not exist/i,
  /procedure .* does not exist/i,
  /no function matches the given name/i,
  /searched for a function named/i,
  /no matches were found in the schema cache/i,
  /could not choose the best candidate function/i,
  /unknown function/i,
];

const NESTED_ERROR_KEYS: readonly string[] = [
  "error",
  "cause",
  "originalError",
  "context",
  "data",
];

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function matchesMissingRpcText(text: string): boolean {
  for (const pattern of MISSING_RPC_MESSAGE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Returns true when `error` looks like the named RPC is missing / renamed /
 * has a stale signature relative to the deployed backend. Safe to call with
 * anything — never throws, never mutates its argument.
 *
 * `rpcName` is required so a generic "undefined_function" from an unrelated
 * call cannot poison the audit-RPC fallback state.
 */
export function isMissingRpcError(
  error: unknown,
  rpcName: string,
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  if (seen.has(error as object)) return false;
  seen.add(error as object);

  const row = error as Record<string, unknown>;
  const rpcPattern = new RegExp(
    rpcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );

  const blobParts = ["message", "details", "hint", "body", "statusText", "description"]
    .map((k) => readString(row, k))
    .filter((s): s is string => s !== null);
  const blob = blobParts.join(" ");

  const code = readString(row, "code");
  if (code && KNOWN_MISSING_RPC_CODES.has(code) && rpcPattern.test(blob)) {
    return true;
  }

  for (const text of blobParts) {
    if (matchesMissingRpcText(text) && rpcPattern.test(text)) return true;
  }

  const status = readNumber(row, "status") ?? readNumber(row, "statusCode");
  if (status === 404 && rpcPattern.test(blob) && matchesMissingRpcText(blob)) {
    return true;
  }

  for (const key of NESTED_ERROR_KEYS) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      if (isMissingRpcError(nested, rpcName, seen)) return true;
    }
  }

  return false;
}

/**
 * Custom Error subclass thrown by audit-RPC wrappers when they detect the
 * missing-RPC signal. Callers can `instanceof` check it to render the
 * graceful fallback without re-parsing the underlying PostgREST error shape.
 */
export class MissingAuditRpcError extends Error {
  readonly rpcName: string;
  readonly cause: unknown;

  constructor(rpcName: string, cause: unknown) {
    super(
      `Audit RPC "${rpcName}" is missing or out of sync with the deployed schema.`,
    );
    this.name = "MissingAuditRpcError";
    this.rpcName = rpcName;
    this.cause = cause;
  }
}
