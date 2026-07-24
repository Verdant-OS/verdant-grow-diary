/**
 * EC/PPM-500 paired-input rules.
 *
 * Pure, deterministic, null-safe, and presentation-agnostic. Verdant stores
 * canonical EC (mS/cm); PPM-500 is a derived grower-facing companion value.
 */

export const PPM_500_PER_EC = 500 as const;

export type EcPpm500EditSource = "ec" | "ppm";

export interface EcPpm500Pair {
  readonly ec: string;
  readonly ppm: string;
}

export type EcPpm500Resolution =
  | { readonly status: "empty"; readonly ec: null }
  | { readonly status: "valid"; readonly ec: number }
  | { readonly status: "invalid"; readonly ec: null }
  | { readonly status: "mismatch"; readonly ec: null };

const PLAIN_NON_NEGATIVE_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseNonNegativeDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!PLAIN_NON_NEGATIVE_DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatDerived(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(6)));
}

/**
 * Update a paired input from the field the grower edited. Invalid source text
 * is preserved for correction, while the derived field is cleared so Verdant
 * never leaves a stale conversion on screen.
 */
export function updateEcPpm500Pair(
  source: EcPpm500EditSource,
  raw: string | null | undefined,
): EcPpm500Pair {
  if (raw == null) return { ec: "", ppm: "" };
  if (raw.trim() === "") return { ec: "", ppm: "" };

  const value = parseNonNegativeDecimal(raw);
  if (value === null) {
    return source === "ec" ? { ec: raw, ppm: "" } : { ec: "", ppm: raw };
  }

  return source === "ec"
    ? { ec: raw, ppm: formatDerived(value * PPM_500_PER_EC) }
    : { ec: formatDerived(value / PPM_500_PER_EC), ppm: raw };
}

/**
 * Resolve a pair at the save boundary. EC-only and PPM-only callers remain
 * compatible; when both are present they must agree on the 500 scale.
 */
export function resolveEcPpm500Pair(
  ecRaw: string | null | undefined,
  ppmRaw: string | null | undefined,
): EcPpm500Resolution {
  const ecTrimmed = ecRaw?.trim() ?? "";
  const ppmTrimmed = ppmRaw?.trim() ?? "";
  if (ecTrimmed === "" && ppmTrimmed === "") return { status: "empty", ec: null };

  const ec = ecTrimmed === "" ? null : parseNonNegativeDecimal(ecTrimmed);
  const ppm = ppmTrimmed === "" ? null : parseNonNegativeDecimal(ppmTrimmed);
  if ((ecTrimmed !== "" && ec === null) || (ppmTrimmed !== "" && ppm === null)) {
    return { status: "invalid", ec: null };
  }

  if (ec === null && ppm !== null) {
    return { status: "valid", ec: ppm / PPM_500_PER_EC };
  }
  if (ec !== null && ppm === null) return { status: "valid", ec };
  if (ec === null || ppm === null) return { status: "invalid", ec: null };

  const expectedPpm = ec * PPM_500_PER_EC;
  const tolerance = Math.max(0.001, Math.abs(expectedPpm) * 0.000001);
  if (Math.abs(expectedPpm - ppm) > tolerance) {
    return { status: "mismatch", ec: null };
  }
  return { status: "valid", ec };
}
