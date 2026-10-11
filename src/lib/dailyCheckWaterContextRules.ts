/**
 * Daily Check Water / activity target carry.
 *
 * Never auto-picks a plant. A grower-selected tent wins on a true no-plant
 * Daily Check. When no plant was requested, the first selectable tent is
 * carried on the same paint so the primary Water CTA is not a
 * Choose-plant/tent dead-end.
 *
 * Fail closed when a plant was requested but not honored, or when no tent
 * can be determined. Leftover tent state from a previous plant must not
 * survive an unknown / out-of-scope plant identity.
 */

import type { DailyCheckPlantResolutionStatus } from "@/lib/dailyCheckPlantSelectionRules";

function nonemptyId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface DailyCheckActivityTargetInput {
  plantId: string | null | undefined;
  plantAssignedTentId: string | null | undefined;
  standaloneTentId: string | null | undefined;
  firstSelectableTentId: string | null | undefined;
  routeTentId: string | null | undefined;
  plantResolutionStatus: DailyCheckPlantResolutionStatus;
}

export interface DailyCheckActivityTarget {
  plantId: string | null;
  tentId: string | null;
}

export function resolveDailyCheckActivityTarget(
  input: DailyCheckActivityTargetInput,
): DailyCheckActivityTarget {
  const plantId = nonemptyId(input.plantId);
  if (plantId) {
    return {
      plantId,
      tentId: nonemptyId(input.plantAssignedTentId),
    };
  }

  if (input.plantResolutionStatus === "unknown" || input.plantResolutionStatus === "out-of-scope") {
    return {
      plantId: null,
      tentId: nonemptyId(input.routeTentId),
    };
  }

  const standaloneTentId = nonemptyId(input.standaloneTentId);
  if (standaloneTentId) {
    return { plantId: null, tentId: standaloneTentId };
  }

  if (input.plantResolutionStatus === "missing") {
    return {
      plantId: null,
      tentId: nonemptyId(input.firstSelectableTentId),
    };
  }

  return { plantId: null, tentId: null };
}
