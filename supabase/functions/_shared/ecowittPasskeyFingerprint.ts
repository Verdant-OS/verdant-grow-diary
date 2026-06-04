/**
 * EcoWitt PASSKEY fingerprint — pure helper.
 *
 * EcoWitt sends a PASSKEY (and sometimes MAC) in plaintext on the LAN. We
 * NEVER use it as an auth secret and we NEVER persist the raw value. We
 * compute a stable, truncated SHA-256 fingerprint that can be safely stored
 * in `tents.hardware_config.ecowitt.passkey_fingerprint` and compared to
 * incoming payloads to identify which gateway sent them.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure: no fetch, no DB, no storage, no auth checks.
 *  - Never returns the raw passkey, never logs it.
 *  - Fingerprint is one-way and truncated; not reversible.
 */

const FINGERPRINT_BYTES = 12; // 24 hex chars — enough to disambiguate gateways.

export interface EcoWittPasskeyFingerprintOptions {
  /** Optional subtle.crypto override (for tests / non-browser runtimes). */
  subtle?: SubtleCrypto;
}

function pickSubtle(opts?: EcoWittPasskeyFingerprintOptions): SubtleCrypto {
  if (opts?.subtle) return opts.subtle;
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  if (!g.crypto?.subtle) {
    throw new Error("crypto.subtle is not available in this runtime");
  }
  return g.crypto.subtle;
}

function toHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < arr.length; i += 1) {
    out += arr[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Returns a sha256 fingerprint of the raw passkey, truncated to
 * `FINGERPRINT_BYTES` bytes (24 hex chars), prefixed with `ewfp_` so the
 * column type is obvious in logs and migrations.
 *
 * Returns `null` if the input is empty / not a string — callers MUST treat
 * a null fingerprint as "no gateway identity available" and skip routing.
 */
export async function computeEcoWittPasskeyFingerprint(
  rawPasskey: unknown,
  options?: EcoWittPasskeyFingerprintOptions,
): Promise<string | null> {
  if (typeof rawPasskey !== "string") return null;
  const trimmed = rawPasskey.trim();
  if (trimmed.length === 0) return null;
  const subtle = pickSubtle(options);
  const data = new TextEncoder().encode(trimmed);
  const digest = await subtle.digest("SHA-256", data);
  const hex = toHex(digest).slice(0, FINGERPRINT_BYTES * 2);
  return `ewfp_${hex}`;
}

/** True if a string looks like a fingerprint produced by this module. */
export function isEcoWittPasskeyFingerprint(v: unknown): v is string {
  return typeof v === "string" && /^ewfp_[0-9a-f]{24}$/.test(v);
}
