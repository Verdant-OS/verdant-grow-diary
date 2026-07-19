export const FOUNDER_SLOTS_TOTAL = 75 as const;

export interface FounderSlotsPayload {
  remaining: number;
  total: typeof FOUNDER_SLOTS_TOTAL;
}

/**
 * Builds the complete public response payload from the aggregate RPC value.
 * Invalid values fail closed instead of being clamped or presented as sold out.
 */
export function buildFounderSlotsPayload(value: unknown): FounderSlotsPayload | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0 || value > FOUNDER_SLOTS_TOTAL) {
    return null;
  }

  return {
    remaining: value === 0 ? 0 : value,
    total: FOUNDER_SLOTS_TOTAL,
  };
}
