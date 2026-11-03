/**
 * HTTP adapter for EcoWitt customized-upload ingest.
 *
 * Logical rejects stay HTTP 200 so a gateway does not retry-storm. An insert
 * failure before any row is durable, or a tent-channel lookup failure, is
 * HTTP 503 and is logged. After rows are stored, receipt and bind failures
 * stay HTTP 200. A unique-index replay is the same 200. The
 * body is never logged. PASSKEY and the claim token are hashed and then dropped.
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
    | {
        ok: false;
        reason: "rate_limited" | "duplicate_captured_at" | "claim_not_found" | "store_failed";
      }
  >;
  insertReadings(
    rows: readonly EcowittCustomUploadStoredReading[],
  ): Promise<{ ok: true } | { ok: false; reason?: "duplicate" | "failed" }>;
  tentChannels(
    tentId: string,
  ): Promise<
    { ok: true; airChannels: readonly number[]; soilChannels: readonly number[] } | { ok: false }
  >;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicIngestReason(reason: string): string {
  if (reason === "unknown_claim" || reason === "passkey_mismatch") return "rejected";
  return reason;
}

function jsonResponse(
  plan: Pick<EcowittCustomUploadIngestPlan, "accepted" | "reason">,
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

  const bodyBytes = new Uint8Array(await request.arrayBuffer());
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

  if (!plan.accepted || claim === null) return jsonResponse(plan, 0);

  const inserted = await ports.insertReadings(plan.rows);
  const duplicate = !inserted.ok && inserted.reason === "duplicate";
  if (!inserted.ok && !duplicate) {
    console.error("[ecowitt-custom-upload] insert_failed", { rows: plan.rows.length });
    return jsonResponse({ accepted: false, reason: "store_failed" }, 0, 503);
  }
  if (duplicate) {
    console.warn("[ecowitt-custom-upload] duplicate_reading_replay", {
      rows: plan.rows.length,
    });
  }

  const capturedAt = plan.rows[0]?.capturedAt ?? null;
  if (plan.touchReceivedAt !== null && capturedAt !== null) {
    const reserved = await ports.touchClaim(claim.id, plan.touchReceivedAt, capturedAt);
    if (!reserved.ok) {
      // Readings are already durable. 503 would make the gateway post the
      // same captured_at again and collide on sensor_readings_dedupe_uidx.
      console.warn("[ecowitt-custom-upload] receipt_not_reserved", { reason: reserved.reason });
    }
  }

  if (plan.bind !== null) {
    const bound = await ports.bindClaim(
      claim.id,
      plan.bind.passkeySha256,
      plan.bind.stationtype,
      plan.touchReceivedAt ?? now.toISOString(),
    );
    if (!bound.ok) {
      console.warn("[ecowitt-custom-upload] bind_not_applied");
    }
  }
  return jsonResponse(plan, plan.rows.length);
}

function findPasskey(fields: Readonly<Record<string, string>>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase() === "passkey") return value;
  }
  return null;
}
