/**
 * HTTP adapter for EcoWitt customized-upload ingest.
 *
 * Logical rejects stay HTTP 200 so a gateway does not retry-storm, and they
 * store nothing. Reserve, first-sender bind, and the reading insert are one
 * commit. A rejection from that commit stores zero rows and returns the
 * uniform rejection. An insert failure rolls the reserve back and is HTTP 503.
 * A unique-index replay of every metric (23505) is HTTP 200, stored 0, reason
 * duplicate. A packet that stores some metrics and skips the ones already
 * present is HTTP 200, reason partial, with the stored count. The body is
 * never logged. PASSKEY and the claim token are hashed and then dropped.
 * Persistence, tent channel config, and the entitlement lookup are injected ports.
 */
import {
  ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES,
  ecowittClaimTokenFromPath,
  isEcowittPasskey,
  parseEcowittCustomUploadForm,
  planEcowittCustomUploadIngest,
  type EcowittCustomUploadClaim,
  type EcowittCustomUploadEntitlement,
  type EcowittCustomUploadStoredReading,
} from "./ecowittCustomUploadIngestRules.ts";

export interface EcowittCustomUploadPorts {
  now(): Date;
  sha256Hex(value: string): Promise<string>;
  lookupClaim(tokenSha256: string): Promise<EcowittCustomUploadClaim | null>;
  entitlement(userId: string, now: Date): Promise<EcowittCustomUploadEntitlement>;
  commitIngest(input: {
    readonly claimId: string;
    readonly receivedAt: string;
    readonly capturedAt: string;
    readonly passkeySha256: string;
    readonly stationtype: string;
    readonly rows: readonly EcowittCustomUploadStoredReading[];
  }): Promise<
    | { ok: true; stored: number; reason: "stored" | "partial" }
    | {
        ok: false;
        reason:
          | "duplicate"
          | "store_failed"
          | "rate_limited"
          | "duplicate_captured_at"
          | "claim_not_found"
          | "passkey_mismatch";
      }
  >;
  tentChannels(
    tentId: string,
  ): Promise<
    { ok: true; airChannels: readonly number[]; soilChannels: readonly number[] } | { ok: false }
  >;
  /** Server-side record of a specific reason the gateway only sees as "rejected". */
  recordRejection?(reason: string): void;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicIngestReason(reason: string): string {
  if (
    reason === "unknown_claim" ||
    reason === "passkey_mismatch" ||
    reason === "claim_not_found" ||
    reason === "rate_limited" ||
    reason === "duplicate_captured_at"
  ) {
    return "rejected";
  }
  return reason;
}

/** Logs the specific reason when the gateway answer masks it. The response never carries it. */
function recordMaskedRejection(reason: string, ports: EcowittCustomUploadPorts): void {
  if (publicIngestReason(reason) === reason) return;
  if (ports.recordRejection) ports.recordRejection(reason);
  else console.warn("[ecowitt-custom-upload] rejected", { reason });
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | "too_large"> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    const value = step.value;
    if (value === undefined || value.byteLength === 0) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function jsonResponse(
  plan: { readonly accepted: boolean; readonly reason: string },
  stored: number,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      accepted: plan.accepted,
      reason: publicIngestReason(plan.reason),
      stored,
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function contentTypeIsForm(contentType: string | null): boolean {
  if (contentType === null) return false;
  return contentType.toLowerCase().includes("application/x-www-form-urlencoded");
}

export async function handleEcowittCustomUploadRequest(
  request: Request,
  ports: EcowittCustomUploadPorts,
): Promise<Response> {
  const now = ports.now();
  const url = new URL(request.url);
  const method = request.method;
  if (method.toUpperCase() !== "POST") {
    const plan = planEcowittCustomUploadIngest({
      method,
      pathname: url.pathname,
      bodyByteLength: 0,
      fields: null,
      claim: null,
      entitlement: "allowed",
      now,
      passkeySha256: null,
      airChannels: [],
      soilChannels: [],
    });
    return jsonResponse(plan, 0);
  }

  const declaredLength = request.headers.get("content-length");
  const declared = declaredLength === null ? null : Number(declaredLength);
  if (
    declared !== null &&
    Number.isFinite(declared) &&
    declared > ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES
  ) {
    const plan = planEcowittCustomUploadIngest({
      method,
      pathname: url.pathname,
      bodyByteLength: declared,
      fields: null,
      claim: null,
      entitlement: "allowed",
      now,
      passkeySha256: null,
      airChannels: [],
      soilChannels: [],
    });
    return jsonResponse(plan, 0);
  }

  const bounded = await readBoundedBody(request, ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES);
  if (bounded === "too_large") {
    const plan = planEcowittCustomUploadIngest({
      method,
      pathname: url.pathname,
      bodyByteLength: ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES + 1,
      fields: null,
      claim: null,
      entitlement: "allowed",
      now,
      passkeySha256: null,
      airChannels: [],
      soilChannels: [],
    });
    return jsonResponse(plan, 0);
  }
  const bodyBytes = bounded;
  if (bodyBytes.byteLength > ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES) {
    const plan = planEcowittCustomUploadIngest({
      method,
      pathname: url.pathname,
      bodyByteLength: bodyBytes.byteLength,
      fields: null,
      claim: null,
      entitlement: "allowed",
      now,
      passkeySha256: null,
      airChannels: [],
      soilChannels: [],
    });
    return jsonResponse(plan, 0);
  }

  const token = ecowittClaimTokenFromPath(url.pathname);
  if (!contentTypeIsForm(request.headers.get("content-type"))) {
    const plan = planEcowittCustomUploadIngest({
      method,
      pathname: url.pathname,
      bodyByteLength: bodyBytes.byteLength,
      fields: null,
      claim: null,
      entitlement: "allowed",
      now,
      passkeySha256: null,
      airChannels: [],
      soilChannels: [],
    });
    return jsonResponse(plan, 0);
  }

  const bodyText = new TextDecoder().decode(bodyBytes);
  const fields = parseEcowittCustomUploadForm(bodyText);
  const passkeyRaw = fields === null ? null : findPasskey(fields);
  const passkeySha256 =
    passkeyRaw !== null && isEcowittPasskey(passkeyRaw)
      ? await ports.sha256Hex(passkeyRaw.trim().toLowerCase())
      : null;
  const claim = token === null ? null : await ports.lookupClaim(await ports.sha256Hex(token));
  const entitlement = claim === null ? "allowed" : await ports.entitlement(claim.userId, now);
  const channels =
    claim === null
      ? {
          ok: true as const,
          airChannels: [] as readonly number[],
          soilChannels: [] as readonly number[],
        }
      : await ports.tentChannels(claim.tentId);
  if (!channels.ok) {
    console.error("[ecowitt-custom-upload] tent_channel_lookup_failed");
    return jsonResponse({ accepted: false, reason: "store_failed" }, 0, 503);
  }

  const plan = planEcowittCustomUploadIngest({
    method,
    pathname: url.pathname,
    bodyByteLength: bodyBytes.byteLength,
    fields,
    claim,
    entitlement,
    now,
    passkeySha256,
    airChannels: channels.airChannels,
    soilChannels: channels.soilChannels,
  });

  if (!plan.accepted || claim === null) {
    recordMaskedRejection(plan.reason, ports);
    return jsonResponse(plan, 0);
  }
  const capturedAt = plan.rows[0]?.capturedAt ?? null;
  const commitPasskey = plan.bind?.passkeySha256 ?? claim.passkeySha256;
  const commitStation = plan.bind?.stationtype ?? claim.stationtype;
  if (
    plan.rows.length === 0 ||
    plan.touchReceivedAt === null ||
    capturedAt === null ||
    commitPasskey === null ||
    commitStation === null
  ) {
    return jsonResponse({ accepted: false, reason: "no_storable_metrics" }, 0);
  }

  const committed = await ports.commitIngest({
    claimId: claim.id,
    receivedAt: plan.touchReceivedAt,
    capturedAt,
    passkeySha256: commitPasskey,
    stationtype: commitStation,
    rows: plan.rows,
  });
  if (!committed.ok && committed.reason === "duplicate") {
    console.warn("[ecowitt-custom-upload] duplicate_reading_replay", { rows: plan.rows.length });
    return jsonResponse({ accepted: false, reason: "duplicate" }, 0);
  }
  if (!committed.ok && committed.reason === "store_failed") {
    console.error("[ecowitt-custom-upload] insert_failed", { rows: plan.rows.length });
    return jsonResponse({ accepted: false, reason: "store_failed" }, 0, 503);
  }
  if (!committed.ok) {
    recordMaskedRejection(committed.reason, ports);
    return jsonResponse({ accepted: false, reason: committed.reason }, 0);
  }
  return jsonResponse({ accepted: true, reason: committed.reason }, committed.stored);
}

function findPasskey(fields: Readonly<Record<string, string>>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase() === "passkey") return value;
  }
  return null;
}
