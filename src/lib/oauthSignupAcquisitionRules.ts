import {
  PAID_ACQUISITION_ATTRIBUTIONS,
  type PaidAcquisitionSource,
} from "@/lib/paidAcquisitionAttributionRules";

export const OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY = "verdant:oauth-signup-acquisition:v1" as const;
export const OAUTH_SIGNUP_ACQUISITION_TTL_MS = 30 * 60 * 1_000;

interface PendingOAuthSignupAcquisition {
  source: PaidAcquisitionSource;
  startedAt: number;
}

export type OAuthSignupAcquisitionFlushStatus = "none" | "recorded" | "rejected" | "retry";

export interface SignupAcquisitionRpcClient {
  rpc(
    fn: "record_signup_acquisition_first_touch",
    args: { p_source: PaidAcquisitionSource },
  ): Promise<{ data: unknown; error: unknown }>;
}

function isPaidAcquisitionSource(value: unknown): value is PaidAcquisitionSource {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PAID_ACQUISITION_ATTRIBUTIONS, value)
  );
}

function removePending(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY);
  } catch {
    // Blocked browser storage must never break authentication.
  }
}

export function resolveOAuthSignupSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function savePendingOAuthSignupAcquisition(
  source: PaidAcquisitionSource,
  storage: Storage | null = resolveOAuthSignupSessionStorage(),
  now = Date.now(),
): boolean {
  if (!storage || !Number.isFinite(now) || now < 0) return false;
  try {
    const value: PendingOAuthSignupAcquisition = { source, startedAt: Math.floor(now) };
    storage.setItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingOAuthSignupAcquisition(
  storage: Storage | null = resolveOAuthSignupSessionStorage(),
): void {
  removePending(storage);
}

export function readPendingOAuthSignupAcquisition(
  storage: Storage | null = resolveOAuthSignupSessionStorage(),
  now = Date.now(),
): PendingOAuthSignupAcquisition | null {
  if (!storage || !Number.isFinite(now) || now < 0) return null;
  try {
    const raw = storage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthSignupAcquisition>;
    const valid =
      isPaidAcquisitionSource(parsed.source) &&
      typeof parsed.startedAt === "number" &&
      Number.isFinite(parsed.startedAt) &&
      parsed.startedAt >= 0 &&
      now >= parsed.startedAt &&
      now - parsed.startedAt <= OAUTH_SIGNUP_ACQUISITION_TTL_MS;
    if (!valid) {
      removePending(storage);
      return null;
    }
    return { source: parsed.source, startedAt: parsed.startedAt };
  } catch {
    removePending(storage);
    return null;
  }
}

/**
 * Flushes only a fixed source to an auth.uid()-scoped, insert-only RPC.
 * Transient RPC failures retain the bounded pending value for a later reload.
 */
export async function flushPendingOAuthSignupAcquisition(
  client: SignupAcquisitionRpcClient,
  storage: Storage | null = resolveOAuthSignupSessionStorage(),
  now = Date.now(),
): Promise<OAuthSignupAcquisitionFlushStatus> {
  const pending = readPendingOAuthSignupAcquisition(storage, now);
  if (!pending) return "none";

  try {
    const { data, error } = await client.rpc("record_signup_acquisition_first_touch", {
      p_source: pending.source,
    });
    if (error) return "retry";
    removePending(storage);
    return data === true ? "recorded" : "rejected";
  } catch {
    return "retry";
  }
}
