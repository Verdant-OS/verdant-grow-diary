/**
 * Server-side idempotency key for quicklog_save_manual submissions.
 *
 * One key identifies one LOGICAL submission: callers must reuse the same
 * key when retrying the same submission (the RPC then returns the original
 * grow_event_id with reused=true instead of double-writing the diary) and
 * mint a fresh key only when a genuinely new submission starts.
 * Server contract: 8..200 chars.
 */

let fallbackSequence = 0;

function newFallbackQuickLogSaveKey(): string {
  fallbackSequence += 1;
  // Web Crypto can be unavailable in restricted webviews. This is a
  // per-user dedupe token, not a credential: preserve Quick Log availability
  // with a bounded key that combines clock, local sequence, and runtime
  // randomness until a normal browser capability is available.
  return `quicklog-v2-fallback-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function newQuickLogSaveKey(): string {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function") {
    try {
      return `quicklog-v2-${webCrypto.randomUUID()}`;
    } catch {
      // Fall through to the next available source instead of blocking Quick Log.
    }
  }

  if (typeof webCrypto?.getRandomValues === "function") {
    try {
      // Older WebCrypto without randomUUID: same entropy source, hex-encoded.
      const bytes = new Uint8Array(16);
      webCrypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `quicklog-v2-${hex}`;
    } catch {
      // Fall through when a partial browser implementation rejects the call.
    }
  }

  return newFallbackQuickLogSaveKey();
}
