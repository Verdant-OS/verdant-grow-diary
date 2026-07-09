/**
 * Server-side idempotency key for quicklog_save_manual submissions.
 *
 * One key identifies one LOGICAL submission: callers must reuse the same
 * key when retrying the same submission (the RPC then returns the original
 * grow_event_id with reused=true instead of double-writing the diary) and
 * mint a fresh key only when a genuinely new submission starts.
 * Server contract: 8..200 chars.
 */
export function newQuickLogSaveKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `quicklog-v2-${crypto.randomUUID()}`;
  }
  // Older WebCrypto without randomUUID: same entropy source, hex-encoded.
  // (The key is a per-user dedupe token, not a credential, but CSPRNG
  // randomness keeps collision odds negligible and CodeQL quiet.)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `quicklog-v2-${hex}`;
}
