/**
 * constantTimeEqual — pure constant-time equality helpers for secrets/MACs.
 *
 * Pure TypeScript. No I/O, no React, no Supabase.
 *
 * Use when comparing:
 *  - HMAC digests (hex or raw bytes)
 *  - Bearer tokens / webhook secrets
 *  - Any attacker-controlled string against a secret-derived value
 *
 * Do NOT use ordinary `===` / early-exit loops for those comparisons —
 * mismatch position can leak via timing.
 *
 * Guarantees (within JS practical limits):
 *  - Equal-length inputs: always scan every index; no early return on
 *    first differing unit.
 *  - Unequal lengths: reject immediately (length is usually public for
 *    fixed-size digests; do not pad secrets to equal length with zeros
 *    in a way that extends a short attacker string into a full scan of
 *    a long secret without a prior format check).
 *
 * Not a formal cryptographic proof against all JS engine optimizations,
 * but removes the obvious short-circuit oracle used in naive compares.
 */

/**
 * Constant-time equality for raw byte sequences (e.g. HMAC output).
 * Requires equal length; otherwise returns false without scanning.
 */
export function constantTimeEqualBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const len = a.length;
  if (len !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < len; i++) {
    diff |= (a[i]! & 0xff) ^ (b[i]! & 0xff);
  }
  return diff === 0;
}

/**
 * Constant-time equality for UTF-16 code units (JS strings).
 * Suitable for hex digests and fixed-format tokens already normalized
 * to the same encoding/case on both sides.
 */
export function constantTimeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Alias used by HMAC/signature call sites (hex or other equal-length strings).
 * Prefer this name when comparing MAC hex digests.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  return constantTimeEqualStrings(a, b);
}

/**
 * Hex digest compare: normalizes both sides to lowercase, then constant-time
 * string equality. Rejects non-strings and length mismatch after normalize.
 *
 * Callers should still prefer fixed-length digests (e.g. SHA-256 = 64 hex chars).
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return constantTimeEqualStrings(left, right);
}

/**
 * Compare several candidates against one expected value without short-circuit
 * success (e.g. multi-h1 webhook secret rotation). Always scans every candidate.
 * Returns true if any candidate matches.
 */
export function constantTimeEqualAny(expected: string, candidates: readonly string[]): boolean {
  let anyMatch = false;
  for (const candidate of candidates) {
    if (constantTimeEqualStrings(expected, candidate)) {
      anyMatch = true;
    }
  }
  return anyMatch;
}
