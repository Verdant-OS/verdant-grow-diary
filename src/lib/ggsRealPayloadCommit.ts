/**
 * Browser transport for the JWT-authenticated operator GGS commit boundary.
 *
 * The browser never calls the private pi_ingest_commit_batch RPC. It sends
 * raw operator input to the Edge boundary, where identity, role, ownership,
 * bridge scope/status, and payload normalization are re-established.
 */
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";
import { GGS_REAL_PAYLOAD_EXPECTED_ROW_COUNT } from "@/lib/ggsRealPayloadIngestRules";
import { FunctionsHttpError } from "@supabase/supabase-js";

export const GGS_REAL_PAYLOAD_COMMIT_FUNCTION = "operator-ggs-real-payload-commit" as const;

export interface GgsRealPayloadCommitArgs {
  tentId: string;
  bridgeId: string;
  deviceId: string;
  payloadText: string;
  attested: boolean;
}

export type GgsRealPayloadCommitResult =
  { ok: true; inserted: number; rejected: number } | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayloadText(payloadText: string): unknown | null {
  if (typeof payloadText !== "string" || payloadText.trim().length === 0) {
    return null;
  }
  try {
    const value = JSON.parse(payloadText);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function parseSuccess(data: unknown): GgsRealPayloadCommitResult | null {
  if (!isPlainObject(data) || data.ok !== true) return null;
  const inserted = data.inserted;
  const rejected = data.rejected;
  if (
    typeof inserted !== "number" ||
    !Number.isSafeInteger(inserted) ||
    typeof rejected !== "number" ||
    !Number.isSafeInteger(rejected) ||
    inserted !== GGS_REAL_PAYLOAD_EXPECTED_ROW_COUNT ||
    rejected !== 0
  ) {
    return { ok: false, reason: "commit_not_confirmed" };
  }
  return { ok: true, inserted, rejected };
}

function safeFailureReason(data: unknown): string {
  if (!isPlainObject(data) || typeof data.error !== "string") {
    return "commit_unavailable";
  }
  const allowed = new Set([
    "auth_required",
    "authorization_unavailable",
    "operator_required",
    "invalid_json",
    "invalid_request",
    "attestation_required",
    "tent_forbidden",
    "bridge_forbidden",
    "payload_rejected",
    "incomplete_canonical_readings",
    "payload_too_large",
    "commit_failed",
    "commit_not_confirmed",
    "internal_error",
    "unavailable",
  ]);
  return allowed.has(data.error) ? data.error : "commit_unavailable";
}

async function safeFailureReasonFromHttpError(error: unknown): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) return "commit_unavailable";
  const context = error.context as { status?: unknown; json?: unknown } | null;
  if (
    !context ||
    typeof context !== "object" ||
    typeof context.status !== "number" ||
    typeof context.json !== "function"
  ) {
    return "commit_unavailable";
  }
  try {
    const body = await context.json();
    if (!isPlainObject(body) || Object.keys(body).length !== 1) {
      return "commit_unavailable";
    }
    return safeFailureReason(body);
  } catch {
    return "commit_unavailable";
  }
}

export async function commitGgsRealPayload(
  args: GgsRealPayloadCommitArgs,
): Promise<GgsRealPayloadCommitResult> {
  const deviceId = args.deviceId.trim();
  const payload = parsePayloadText(args.payloadText);
  if (
    !isUuid(args.tentId) ||
    !isUuid(args.bridgeId) ||
    !deviceId ||
    deviceId.length > 128 ||
    !payload
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  if (args.attested !== true) {
    return { ok: false, reason: "attestation_required" };
  }

  const { data, error } = await supabase.functions.invoke(GGS_REAL_PAYLOAD_COMMIT_FUNCTION, {
    body: {
      tentId: args.tentId,
      bridgeId: args.bridgeId,
      deviceId,
      payload,
      attested: true,
    },
  });

  if (error) {
    return { ok: false, reason: await safeFailureReasonFromHttpError(error) };
  }
  const success = parseSuccess(data);
  return success ?? { ok: false, reason: safeFailureReason(data) };
}
