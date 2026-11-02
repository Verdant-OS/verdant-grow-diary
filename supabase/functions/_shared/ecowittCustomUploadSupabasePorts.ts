/**
 * Service-role wiring for customized-upload ingest.
 *
 * Not registered in supabase/config.toml: that file is overlapped by an open
 * pull request, and function-directory parity forbids a new entry without it.
 * `requireLiveSensorEntitlement` runs before any claim bind or reading insert.
 * This module does not deploy the function and does not read a client-supplied
 * user id from the gateway body.
 */
import { requireLiveSensorEntitlement } from "./liveSensorEntitlementGate.ts";
import type { LovableBillingEnvironment } from "./lib/lib/entitlements/lovablePaddleAdapter.ts";
import {
  handleEcowittCustomUploadRequest,
  sha256Hex,
  type EcowittCustomUploadPorts,
} from "./ecowittCustomUploadHttp.ts";
import type {
  EcowittCustomUploadClaim,
  EcowittCustomUploadStoredReading,
} from "./ecowittCustomUploadIngestRules.ts";

export interface EcowittCustomUploadServiceRole {
  lookupClaim(tokenSha256: string): Promise<EcowittCustomUploadClaim | null>;
  bindClaim(
    claimId: string,
    passkeySha256: string,
    stationtype: string,
    receivedAt: string,
  ): Promise<{ ok: true } | { ok: false }>;
  touchClaim(claimId: string, receivedAt: string): Promise<{ ok: true } | { ok: false }>;
  insertReadings(
    rows: readonly EcowittCustomUploadStoredReading[],
  ): Promise<{ ok: true } | { ok: false }>;
}

export async function handleEcowittCustomUploadWithEntitlement(
  request: Request,
  deps: {
    readonly supabase: unknown;
    readonly expectedBillingEnvironment: LovableBillingEnvironment;
    readonly now: Date;
    readonly serviceRole: EcowittCustomUploadServiceRole;
  },
): Promise<Response> {
  const ports: EcowittCustomUploadPorts = {
    now: () => deps.now,
    sha256Hex,
    lookupClaim: (tokenSha256) => deps.serviceRole.lookupClaim(tokenSha256),
    entitlement: async (userId, now) => {
      const decision = await requireLiveSensorEntitlement(
        deps.supabase,
        userId,
        deps.expectedBillingEnvironment,
        now,
      );
      if (decision.ok) return "allowed";
      if (decision.reason === "upgrade_required") return "upgrade_required";
      return "lookup_failed";
    },
    bindClaim: (claimId, passkeySha256, stationtype, receivedAt) =>
      deps.serviceRole.bindClaim(claimId, passkeySha256, stationtype, receivedAt),
    touchClaim: (claimId, receivedAt) => deps.serviceRole.touchClaim(claimId, receivedAt),
    insertReadings: (rows) => deps.serviceRole.insertReadings(rows),
  };
  return handleEcowittCustomUploadRequest(request, ports);
}
