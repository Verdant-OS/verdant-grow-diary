export type AiCoachRequestMode = "diagnose" | "next_steps";

export interface AiCoachPhotoIdentity {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface AiCoachRequestIdentity {
  mode: AiCoachRequestMode;
  growId: string | null;
  question: string;
  photo: AiCoachPhotoIdentity | null;
}

export interface PendingAiCoachRequest {
  signature: string;
  idempotencyKey: string;
  photoUrl?: string;
}

export interface ResolvedAiCoachPendingRequest {
  request: PendingAiCoachRequest;
  reused: boolean;
}

/**
 * Captures every input that can change the provider answer. This prevents an
 * unresolved request key from being reused after the grower changes context.
 */
export function buildAiCoachRequestSignature(identity: AiCoachRequestIdentity): string {
  return JSON.stringify([
    identity.mode,
    identity.growId,
    identity.question.trim(),
    identity.photo
      ? [identity.photo.name, identity.photo.size, identity.photo.type, identity.photo.lastModified]
      : null,
  ]);
}

/**
 * Reuses the key (and signed photo URL) only for the exact same unresolved
 * request. Key creation is injected so this rule stays deterministic in tests.
 */
export function resolveAiCoachPendingRequest(
  pending: PendingAiCoachRequest | null,
  signature: string,
  createKey: () => string,
): ResolvedAiCoachPendingRequest {
  if (pending?.signature === signature) {
    return { request: pending, reused: true };
  }

  return {
    request: {
      signature,
      idempotencyKey: createKey(),
    },
    reused: false,
  };
}

/**
 * These outcomes cannot prove whether a spend/result write committed. Keeping
 * the logical key lets the next identical click resolve the ledger safely.
 */
export function shouldRetainAiCoachPendingRequest(reason: string): boolean {
  return reason === "result_pending" || reason === "credit_rpc";
}
