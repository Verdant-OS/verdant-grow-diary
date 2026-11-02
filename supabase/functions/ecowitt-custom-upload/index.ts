/**
 * EcoWitt customized-upload Edge entrypoint.
 *
 * A gateway cannot send a platform JWT. The claim token in `/ew/<token>` is
 * the auth. verify_jwt stays off in config.toml. Every response is HTTP 200.
 * Rejection reasons are logged as fixed codes and are not returned.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleEcowittCustomUploadWithEntitlement,
  type EcowittCustomUploadServiceRole,
} from "../_shared/ecowittCustomUploadSupabasePorts.ts";
import { EcowittCustomUploadGatewayResponse } from "../_shared/ecowittCustomUploadHttp.ts";
import type {
  EcowittCustomUploadClaim,
  EcowittCustomUploadStoredReading,
} from "../_shared/ecowittCustomUploadIngestRules.ts";
import { resolveServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import type { LovableBillingEnvironment } from "../_shared/lib/lib/entitlements/lovablePaddleAdapter.ts";

export interface EcowittCustomUploadAdmin {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface EcowittCustomUploadEdgeDeps {
  admin?: EcowittCustomUploadAdmin;
  now?: () => Date;
  expectedBillingEnvironment?: LovableBillingEnvironment;
}

export class EcowittCustomUploadSupabaseServiceRole {
  static fromAdmin(admin: EcowittCustomUploadAdmin): EcowittCustomUploadServiceRole {
    return {
      lookupClaim: (tokenSha256) =>
        EcowittCustomUploadSupabaseServiceRole.lookupClaim(admin, tokenSha256),
      bindClaim: (claimId, passkeySha256, stationtype, receivedAt) =>
        EcowittCustomUploadSupabaseServiceRole.bindClaim(
          admin,
          claimId,
          passkeySha256,
          stationtype,
          receivedAt,
        ),
      callReserve: (_fn, args) => EcowittCustomUploadSupabaseServiceRole.callReserve(admin, args),
      insertReadings: (rows) => EcowittCustomUploadSupabaseServiceRole.insertReadings(admin, rows),
    };
  }

  static async lookupClaim(
    admin: EcowittCustomUploadAdmin,
    tokenSha256: string,
  ): Promise<EcowittCustomUploadClaim | null> {
    const result = await admin
      .from("ecowitt_custom_upload_claims")
      .select(
        "id,user_id,tent_id,passkey_sha256,stationtype,interval_seconds,revoked_at,last_received_at,last_captured_at",
      )
      .eq("token_sha256", tokenSha256)
      .maybeSingle();
    if (result.error || result.data === null || typeof result.data !== "object") return null;
    return EcowittCustomUploadSupabaseServiceRole.readClaim(result.data);
  }

  static readClaim(data: Record<string, unknown>): EcowittCustomUploadClaim | null {
    if (typeof data.id !== "string" || typeof data.user_id !== "string") return null;
    if (typeof data.tent_id !== "string") return null;
    const passkey = data.passkey_sha256;
    const stationtype = data.stationtype;
    const revokedAt = data.revoked_at;
    const lastReceivedAt = data.last_received_at;
    const lastCapturedAt = data.last_captured_at;
    const intervalSeconds = data.interval_seconds;
    if (passkey !== null && typeof passkey !== "string") return null;
    if (stationtype !== null && typeof stationtype !== "string") return null;
    if (revokedAt !== null && typeof revokedAt !== "string") return null;
    if (lastReceivedAt !== null && typeof lastReceivedAt !== "string") return null;
    if (lastCapturedAt !== null && typeof lastCapturedAt !== "string") return null;
    if (typeof intervalSeconds !== "number" || !Number.isFinite(intervalSeconds)) return null;
    return {
      id: data.id,
      userId: data.user_id,
      tentId: data.tent_id,
      passkeySha256: passkey,
      stationtype,
      intervalSeconds,
      revokedAt,
      lastReceivedAt,
      lastCapturedAt,
    };
  }

  static async bindClaim(
    admin: EcowittCustomUploadAdmin,
    claimId: string,
    passkeySha256: string,
    stationtype: string,
    receivedAt: string,
  ): Promise<{ ok: true } | { ok: false }> {
    const result = await admin
      .from("ecowitt_custom_upload_claims")
      .update({
        passkey_sha256: passkeySha256,
        stationtype,
        bound_at: receivedAt,
      })
      .eq("id", claimId)
      .is("passkey_sha256", null);
    return result.error ? { ok: false } : { ok: true };
  }

  static async callReserve(
    admin: EcowittCustomUploadAdmin,
    args: {
      readonly p_claim_id: string;
      readonly p_received_at: string;
      readonly p_captured_at: string;
    },
  ): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }> {
    const result = await admin.rpc("reserve_ecowitt_custom_upload_receipt", {
      p_claim_id: args.p_claim_id,
      p_received_at: args.p_received_at,
      p_captured_at: args.p_captured_at,
    });
    if (result.error) return { data: null, error: { message: "reserve_failed" } };
    return { data: result.data, error: null };
  }

  static async insertReadings(
    admin: EcowittCustomUploadAdmin,
    rows: readonly EcowittCustomUploadStoredReading[],
  ): Promise<{ ok: true } | { ok: false }> {
    const payload = rows.map((row) => ({
      user_id: row.userId,
      tent_id: row.tentId,
      source: row.source,
      metric: row.metric,
      value: row.value,
      quality: row.quality,
      captured_at: row.capturedAt,
      ts: row.receivedAt,
      raw_payload: {
        ...row.rawPayload,
        received_at: row.receivedAt,
      },
    }));
    const result = await admin.from("sensor_readings").insert(payload);
    return result.error ? { ok: false } : { ok: true };
  }
}

export class EcowittCustomUploadEdge {
  static async handle(request: Request, deps: EcowittCustomUploadEdgeDeps = {}): Promise<Response> {
    const now = deps.now?.() ?? new Date();
    const admin = deps.admin ?? EcowittCustomUploadEdge.adminFromEnv();
    if (admin === null) {
      return EcowittCustomUploadGatewayResponse.json(
        { accepted: false, reason: "server_misconfigured" },
        0,
      );
    }
    return handleEcowittCustomUploadWithEntitlement(request, {
      supabase: admin,
      expectedBillingEnvironment:
        deps.expectedBillingEnvironment ?? resolveServerBillingEnvironment(),
      now,
      serviceRole: EcowittCustomUploadSupabaseServiceRole.fromAdmin(admin),
    });
  }

  static adminFromEnv(): EcowittCustomUploadAdmin | null {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    return createClient(url, key) as unknown as EcowittCustomUploadAdmin;
  }
}

if (import.meta.main) {
  Deno.serve((request) => EcowittCustomUploadEdge.handle(request));
}
