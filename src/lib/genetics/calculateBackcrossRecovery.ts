export interface BackcrossRecoveryResult {
  recurrentRecoveredPct: number;
  donorRemainingPct: number;
  disclaimer: string;
}

/**
 * Calculates theoretical average genetic recovery for a backcross generation.
 * This is a theoretical statistical average only, not a guaranteed genetic reality.
 */
export function calculateBackcrossRecovery(backcrossGeneration: number): BackcrossRecoveryResult | undefined {
  if (typeof backcrossGeneration !== "number") return undefined;
  if (!Number.isInteger(backcrossGeneration)) return undefined;
  if (backcrossGeneration < 1) return undefined;

  // Formula: Donor % = (1/2)^(BC + 1)
  // E.g., BC1 -> (1/2)^2 = 0.25 (25%)
  // Recurrent % = 1 - Donor %
  
  const donorProportion = Math.pow(0.5, backcrossGeneration + 1);
  const recurrentProportion = 1 - donorProportion;

  return {
    recurrentRecoveredPct: Number((recurrentProportion * 100).toFixed(4)),
    donorRemainingPct: Number((donorProportion * 100).toFixed(4)),
    disclaimer: "These percentages represent a theoretical statistical average for backcrossing. Actual genetic recovery varies due to recombination, linkage drag, and selection pressure. No definitive genetic claims can be made from this calculation alone."
  };
}
