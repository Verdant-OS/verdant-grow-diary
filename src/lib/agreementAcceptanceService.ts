/**
 * I/O helper for recording current ToS/Privacy acceptances.
 *
 * Writes go through `record_own_agreement_acceptances` so `user_id` is taken
 * from `auth.uid()` on the server — never from a client-chosen value.
 */
import type { Json } from "@/integrations/supabase/types";
import { buildOwnAcceptancePayloads, type OwnAcceptancePayload } from "@/lib/agreementConsent";

export const RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC = "record_own_agreement_acceptances" as const;

export type AgreementAcceptanceRpcError = {
  message?: string;
  code?: string;
} | null;

export type AgreementAcceptanceRpcClient = {
  rpc(
    fn: typeof RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC,
    args: { p_acceptances: Json },
  ): Promise<{ data: unknown; error: AgreementAcceptanceRpcError }>;
};

export function acceptancePayloadsForCurrentAgreements(
  userAgent?: string | null,
): OwnAcceptancePayload[] {
  return buildOwnAcceptancePayloads(undefined, userAgent);
}

export async function recordOwnAgreementAcceptances(
  client: AgreementAcceptanceRpcClient,
  payloads: readonly OwnAcceptancePayload[],
): Promise<{ error: AgreementAcceptanceRpcError }> {
  const { error } = await client.rpc(RECORD_OWN_AGREEMENT_ACCEPTANCES_RPC, {
    p_acceptances: payloads as unknown as Json,
  });
  return { error };
}
