/**
 * actionQueueRedactionRules — pure redaction surface for Action Queue UI.
 *
 * Purpose:
 *   - Provide a single, centralized helper for replacing raw device
 *     identifiers with a grower-safe label.
 *   - Provide a deterministic pattern detector so render tests can
 *     fail loudly if a MAC address, vendor id, bridge token, or other
 *     device-identifier-shaped string slips into rendered DOM.
 *
 * Pure, deterministic, no React, no Supabase, no network. The
 * redaction layer never executes device commands and never inspects
 * `raw_payload` for "special cases" — every device-shaped value is
 * treated as sensitive regardless of where it appears.
 *
 * Companion to:
 *   - `src/lib/actionQueueRowView.ts` — owns the grower-facing target
 *     label (`formatActionTargetLabel`). Re-exported here so callers
 *     can import a single redaction module.
 */

export { formatActionTargetLabel } from "./actionQueueRowView";

// ---------------------------------------------------------------------------
// Grower-safe label for any non-null device value
// ---------------------------------------------------------------------------

/** Cautious, hardware-neutral fallback used when a device id is present. */
export const SAFE_DEVICE_LABEL = "Grow-room equipment";

/**
 * Convert any `target_device`-shaped value into a grower-safe label.
 * Returns `null` when the input is null/blank so callers can fall back
 * to other copy without rendering an empty chip.
 *
 * Defensive: trims, never echoes the input string, never returns a
 * truncated/masked form of the original (no info leak via length, no
 * partial reveal).
 */
export function redactDeviceIdentifierLabel(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return SAFE_DEVICE_LABEL;
  return value.trim().length === 0 ? null : SAFE_DEVICE_LABEL;
}

// ---------------------------------------------------------------------------
// Sensitive identifier pattern detection
// ---------------------------------------------------------------------------

/**
 * Patterns that the rendered Action Queue UI must NEVER contain.
 * Ordered most-specific first. Each entry has a stable `name` so test
 * failures point to the exact leak class.
 *
 * Intentionally broad to catch upstream regressions even if the column
 * shape changes — `target_device`, nested `raw_payload.device.id`,
 * vendor sidecars, etc. should all be caught.
 */
export interface SensitiveDevicePattern {
  name: string;
  regex: RegExp;
}

export const SENSITIVE_DEVICE_PATTERNS: ReadonlyArray<SensitiveDevicePattern> =
  [
    // MAC address — colon or dash separated
    { name: "mac_address", regex: /\b[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}\b/ },
    // Bridge-token-like opaque string: brg_/bridge_/tok_/token_/sk_/secret_ prefix
    // + >=12 chars from base62 plus _ and - (tokens commonly include separators).
    {
      name: "bridge_token",
      regex:
        /\b(?:brg|bridge|tok|token|sk|secret)[_-][A-Za-z0-9_-]{12,}\b/i,
    },
    // Vendor id-like: vendor_/vnd_/device_/dev_ prefix + alnum
    {
      name: "vendor_or_device_id",
      regex: /\b(?:vendor|vnd|device|dev)[_-][A-Za-z0-9]{3,}\b/i,
    },
    // Long opaque hex blob (>= 24 hex chars) — typical of payload signatures
    { name: "long_hex_blob", regex: /\b[0-9a-fA-F]{24,}\b/ },
    // Raw JSON key leaks — these should never appear in rendered text
    { name: "raw_payload_key", regex: /\braw_payload\b/ },
    { name: "target_device_key", regex: /\btarget_device\b/ },
  ];

export interface DeviceIdentifierLeak {
  pattern: string;
  match: string;
}

/**
 * Scan a text blob for any sensitive device-identifier pattern.
 * Returns every distinct match. Empty array means "clean".
 */
export function detectDeviceIdentifierLeaks(
  text: string,
): DeviceIdentifierLeak[] {
  if (!text) return [];
  const found: DeviceIdentifierLeak[] = [];
  for (const { name, regex } of SENSITIVE_DEVICE_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags.includes("g")
      ? regex.flags
      : regex.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ pattern: name, match: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return found;
}

/** Convenience boolean wrapper for assertions. */
export function containsDeviceIdentifierLeak(text: string): boolean {
  return detectDeviceIdentifierLeaks(text).length > 0;
}
