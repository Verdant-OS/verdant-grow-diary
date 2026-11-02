/**
 * HTTP adapter for EcoWitt customized-upload ingest.
 *
 * Always answers 200 so a gateway does not retry-storm. The body is never
 * logged. PASSKEY and the claim token are hashed and then dropped.
 * Persistence and the entitlement lookup are injected ports.
 */
import {
  ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES,
  EcowittCustomUploadGatewayResponse,
  ecowittClaimTokenFromPath,
  isEcowittPasskey,
  parseEcowittCustomUploadForm,
  planEcowittCustomUploadIngest,
  type EcowittCustomUploadClaim,
  type EcowittCustomUploadEntitlement,
  type EcowittCustomUploadIngestPlan,
  type EcowittCustomUploadStoredReading,
} from "./ecowittCustomUploadIngestRules.ts";

export interface EcowittCustomUploadPorts {
  now(): Date;
  sha256Hex(value: string): Promise<string>;
  lookupClaim(tokenSha256: string): Promise<EcowittCustomUploadClaim | null>;
  entitlement(userId: string, now: Date): Promise<EcowittCustomUploadEntitlement>;
  bindClaim(
    claimId: string,
    passkeySha256: string,
    stationtype: string,
    receivedAt: string,
  ): Promise<{ ok: true } | { ok: false }>;
  touchClaim(
    claimId: string,
    receivedAt: string,
    capturedAt: string,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: "rate_limited" | "duplicate_captured_at" | "claim_not_found" }
  >;
  insertReadings(
    rows: readonly EcowittCustomUploadStoredReading[],
  ): Promise<{ ok: true } | { ok: false }>;
  /** Server-side reason only. Never pass a PASSKEY, token, or body. */
  recordRejection?(reason: string): void;
}

export class EcowittCustomUploadBodyLimit {
  static async readMissingLength(
    request: Request,
    maxBytes: number,
  ): Promise<{ readonly overCap: boolean; readonly bytes: Uint8Array }> {
    const body = request.body;
    if (body === null) return { overCap: false, bytes: new Uint8Array(0) };
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const value = next.value;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { overCap: true, bytes: new Uint8Array(0) };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { overCap: false, bytes };
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(
  plan: Pick<EcowittCustomUploadIngestPlan, "accepted" | "reason">,
  stored: number,
  ports: EcowittCustomUploadPorts,
): Response {
  if (!plan.accepted) ports.recordRejection?.(plan.reason);
  const reason = EcowittCustomUploadGatewayResponse.outwardReason(plan.reason);
  return new Response(JSON.stringify({ accepted: plan.accepted, reason, stored }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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
    });
    return jsonResponse(plan, 0, ports);
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
    });
    return jsonResponse(plan, 0, ports);
  }

  const lengthMissing = declaredLength === null || declaredLength.trim() === "";
  let bodyBytes: Uint8Array;
  if (lengthMissing) {
    const capped = await EcowittCustomUploadBodyLimit.readMissingLength(
      request,
      ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES,
    );
    if (capped.overCap) {
      const plan = planEcowittCustomUploadIngest({
        method,
        pathname: url.pathname,
        bodyByteLength: ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES + 1,
        fields: null,
        claim: null,
        entitlement: "allowed",
        now,
        passkeySha256: null,
      });
      return jsonResponse(plan, 0, ports);
    }
    bodyBytes = capped.bytes;
  } else {
    bodyBytes = new Uint8Array(await request.arrayBuffer());
  }
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
    });
    return jsonResponse(plan, 0, ports);
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
    });
    return jsonResponse(plan, 0, ports);
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

  const plan = planEcowittCustomUploadIngest({
    method,
    pathname: url.pathname,
    bodyByteLength: bodyBytes.byteLength,
    fields,
    claim,
    entitlement,
    now,
    passkeySha256,
  });

  if (!plan.accepted || claim === null) return jsonResponse(plan, 0, ports);

  const capturedAt = plan.rows[0]?.capturedAt ?? null;
  if (plan.touchReceivedAt !== null && capturedAt !== null) {
    const reserved = await ports.touchClaim(claim.id, plan.touchReceivedAt, capturedAt);
    if (!reserved.ok) {
      const reason = reserved.reason === "claim_not_found" ? "store_failed" : reserved.reason;
      return jsonResponse({ accepted: false, reason }, 0, ports);
    }
  }

  if (plan.bind !== null) {
    const bound = await ports.bindClaim(
      claim.id,
      plan.bind.passkeySha256,
      plan.bind.stationtype,
      plan.touchReceivedAt ?? now.toISOString(),
    );
    if (!bound.ok) return jsonResponse({ accepted: false, reason: "store_failed" }, 0, ports);
  }

  const inserted = await ports.insertReadings(plan.rows);
  if (!inserted.ok) return jsonResponse({ accepted: false, reason: "store_failed" }, 0, ports);
  return jsonResponse(plan, plan.rows.length, ports);
}

function findPasskey(fields: Readonly<Record<string, string>>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase() === "passkey") return value;
  }
  return null;
}
