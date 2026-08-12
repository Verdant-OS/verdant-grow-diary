/**
 * Last-OAuth-attempt log for the MCP status page.
 *
 * Records ONLY coarse attempt metadata (timestamps, outcome, a
 * sanitized reason string). NEVER tokens, authorization codes, PKCE
 * verifiers, or raw error bodies — reasons are truncated and rejected
 * outright if they look secret-like. Lives in localStorage (attempt
 * metadata is support/debug info worth keeping across restarts); the
 * OAuth token itself stays in sessionStorage inside browserOAuthClient
 * and is never referenced here.
 *
 * Storage and clock are injectable for deterministic tests.
 */
import { containsSecretLikeValue } from "@/lib/mcp/manifestView";
import type { PrefStorage } from "@/lib/mcp/localToolPreferences";

export const OAUTH_ATTEMPT_LOG_KEY = "verdant.mcp.oauthAttempt.v1";

export type OAuthAttemptOutcome = "started" | "success" | "failed";

export type OAuthAttemptRecord = {
  /** ISO timestamp when the attempt started (or was recorded, for callback errors). */
  startedAt: string;
  /** ISO timestamp when the attempt reached a terminal outcome. Absent while "started". */
  completedAt?: string;
  outcome: OAuthAttemptOutcome;
  /** Sanitized, truncated failure reason. Never raw error bodies or secrets. */
  reason?: string;
};

const MAX_REASON_LENGTH = 160;
const GENERIC_REASON = "OAuth step failed (details withheld for safety).";

function safeStorage(): PrefStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Collapse a failure reason to a safe, short string. Anything
 * secret-like is replaced wholesale — a support log must never become
 * an exfiltration path for tokens echoed in error messages.
 */
export function sanitizeAttemptReason(reason: unknown): string {
  if (typeof reason !== "string" || reason.trim().length === 0) return GENERIC_REASON;
  const trimmed = reason.trim().slice(0, MAX_REASON_LENGTH);
  if (containsSecretLikeValue(trimmed)) return GENERIC_REASON;
  return trimmed;
}

function write(record: OAuthAttemptRecord, storage: PrefStorage | null): OAuthAttemptRecord {
  if (storage) {
    try {
      storage.setItem(OAUTH_ATTEMPT_LOG_KEY, JSON.stringify(record));
    } catch {
      /* storage unavailable — record is still returned for in-memory display */
    }
  }
  return record;
}

export function recordOAuthAttemptStart(
  now: () => string = () => new Date().toISOString(),
  storage: PrefStorage | null = safeStorage(),
): OAuthAttemptRecord {
  return write({ startedAt: now(), outcome: "started" }, storage);
}

export function recordOAuthAttemptSuccess(
  now: () => string = () => new Date().toISOString(),
  storage: PrefStorage | null = safeStorage(),
): OAuthAttemptRecord {
  const prior = readLastOAuthAttempt(storage);
  const startedAt = prior?.outcome === "started" ? prior.startedAt : now();
  return write({ startedAt, completedAt: now(), outcome: "success" }, storage);
}

export function recordOAuthAttemptFailure(
  reason: unknown,
  now: () => string = () => new Date().toISOString(),
  storage: PrefStorage | null = safeStorage(),
): OAuthAttemptRecord {
  const prior = readLastOAuthAttempt(storage);
  const startedAt = prior?.outcome === "started" ? prior.startedAt : now();
  return write(
    { startedAt, completedAt: now(), outcome: "failed", reason: sanitizeAttemptReason(reason) },
    storage,
  );
}

/**
 * Read the last attempt. Corrupt or partial records return null rather
 * than a half-trusted object. Never throws.
 */
export function readLastOAuthAttempt(
  storage: PrefStorage | null = safeStorage(),
): OAuthAttemptRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OAUTH_ATTEMPT_LOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OAuthAttemptRecord> | null;
    if (
      !parsed ||
      typeof parsed.startedAt !== "string" ||
      (parsed.outcome !== "started" && parsed.outcome !== "success" && parsed.outcome !== "failed")
    ) {
      return null;
    }
    const record: OAuthAttemptRecord = {
      startedAt: parsed.startedAt,
      outcome: parsed.outcome,
    };
    if (typeof parsed.completedAt === "string") record.completedAt = parsed.completedAt;
    // Re-sanitize on read: storage contents are untrusted input.
    if (typeof parsed.reason === "string") record.reason = sanitizeAttemptReason(parsed.reason);
    return record;
  } catch {
    return null;
  }
}
