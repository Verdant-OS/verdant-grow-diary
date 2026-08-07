/**
 * Best-effort constant-time equality for secrets, bearer tokens, and MAC hex.
 *
 * JavaScript / Deno do not offer a portable formal timing guarantee under all
 * JITs. This helper is hygiene: it removes the dominant remote-oracle pattern
 * (early exit on the first mismatched character) and does not early-return
 * solely because lengths differ. It is not a cryptographic proof.
 *
 * Rules for callers:
 *  - Never log or return the compared values.
 *  - Prefer this over `===` for any secret, token, or HMAC digest.
 *  - Multi-candidate rotation: use `constantTimeEqualAny` (full scan, no
 *    early success exit) rather than `Array.some`.
 */

/**
 * Compare two strings without early-exit on the first mismatched character.
 * Length differences are folded into the accumulator rather than returning
 * immediately, so a remote observer cannot short-circuit on length alone.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;

  for (let i = 0; i < maxLength; i++) {
    // charCodeAt returns NaN past end; coerce missing bytes to 0.
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return mismatch === 0;
}

/**
 * Same algorithm as {@link constantTimeEqual}. Named alias for HMAC hex
 * digests so call sites stay self-documenting.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  return constantTimeEqual(a, b);
}

/**
 * Compare `expected` against every candidate without early success exit.
 * Returns true if any candidate matches. Use for multi-h1 / multi-key
 * rotation so timing does not reveal which slot matched.
 */
export function constantTimeEqualAny(expected: string, candidates: readonly string[]): boolean {
  let anyMatch = 0;
  for (const candidate of candidates) {
    anyMatch |= Number(constantTimeEqual(expected, candidate));
  }
  return anyMatch !== 0;
}
