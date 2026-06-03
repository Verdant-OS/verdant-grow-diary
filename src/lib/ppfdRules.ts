/**
 * ppfdRules — shared, pure rules for PPFD (Photosynthetic Photon Flux
 * Density) sensor values. Single source of truth for the canonical
 * label, unit string, validation range, and presentation formatter.
 *
 * Hard constraints:
 *  - Pure function. No I/O, no React, no timers, no automation.
 *  - Never invents PPFD from light percentage, wattage, lux, or device
 *    state. PPFD is only ever set from a real measurement or manual
 *    entry by the grower.
 *  - Missing / null / NaN / non-finite → "unknown", NEVER healthy.
 *  - Negative values → "invalid".
 *  - Out-of-range high values (> PPFD_MAX) → "invalid". The threshold
 *    is conservative: real canopy PPFD rarely exceeds ~2000 µmol/m²/s,
 *    so 2500 is the implausibility ceiling.
 */

/** Canonical user-facing label. */
export const PPFD_LABEL = "PPFD" as const;

/**
 * Canonical user-facing unit string. Long form is preferred for help
 * copy / chart legends / AI Doctor context. The short form ("µmol") is
 * still used by space-constrained presenters such as compact snapshot
 * cards.
 */
export const PPFD_UNIT_LONG = "µmol/m²/s" as const;
export const PPFD_UNIT_SHORT = "µmol" as const;

/** Inclusive validation range for plausible grow-room canopy PPFD. */
export const PPFD_MIN = 0 as const;
export const PPFD_MAX = 2500 as const;

/** Field key used by the canonical sensor metric list. */
export const PPFD_FIELD = "ppfd" as const;

export type PpfdValidation =
  | { kind: "unknown" }
  | { kind: "valid"; value: number }
  | { kind: "invalid"; value: number; reason: "negative" | "implausible_high" | "non_finite" };

/**
 * Classify a PPFD candidate. Missing / null / undefined / non-numeric
 * inputs resolve to `unknown` — they are NEVER treated as healthy.
 */
export function classifyPpfd(input: unknown): PpfdValidation {
  if (input === null || input === undefined || input === "") {
    return { kind: "unknown" };
  }
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) {
    if (typeof input === "number") {
      return { kind: "invalid", value: n, reason: "non_finite" };
    }
    return { kind: "unknown" };
  }
  if (n < PPFD_MIN) {
    return { kind: "invalid", value: n, reason: "negative" };
  }
  if (n > PPFD_MAX) {
    return { kind: "invalid", value: n, reason: "implausible_high" };
  }
  return { kind: "valid", value: n };
}

/** Convenience: true only for finite, in-range, non-negative PPFD. */
export function isPpfdValid(input: unknown): boolean {
  return classifyPpfd(input).kind === "valid";
}

/**
 * Format a PPFD value with the canonical unit. Returns "—" for
 * unknown/invalid inputs so UI never renders "NaN" or a misleading "0".
 * Use `unit: "short"` for compact contexts (snapshot chips).
 */
export function formatPpfd(
  input: unknown,
  options: { unit?: "long" | "short"; placeholder?: string } = {},
): string {
  const placeholder = options.placeholder ?? "—";
  const c = classifyPpfd(input);
  if (c.kind !== "valid") return placeholder;
  const unit = options.unit === "short" ? PPFD_UNIT_SHORT : PPFD_UNIT_LONG;
  return `${Math.round(c.value)} ${unit}`;
}
