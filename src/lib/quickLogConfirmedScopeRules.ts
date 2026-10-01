import type { QuickLogV2TargetType, ResolvedQuickLogV2Target } from "./quickLogV2Rules";

export interface QuickLogPersistedScope {
  persistedGrowId?: string | null;
  persistedTentId?: string | null;
  persistedPlantId?: string | null;
}

export interface QuickLogConfirmedScope {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  targetType: QuickLogV2TargetType | null;
  targetId: string | null;
}

/** Undefined means no readback; a verified null must never borrow draft scope. */
export function resolveQuickLogConfirmedScope(
  resolved: Readonly<ResolvedQuickLogV2Target> | null | undefined,
  receipt: Readonly<QuickLogPersistedScope> | null | undefined,
): QuickLogConfirmedScope {
  const growId =
    receipt?.persistedGrowId === undefined ? (resolved?.growId ?? null) : receipt.persistedGrowId;
  const tentId =
    receipt?.persistedTentId === undefined ? (resolved?.tentId ?? null) : receipt.persistedTentId;
  const plantId =
    receipt?.persistedPlantId === undefined
      ? (resolved?.plantId ?? null)
      : receipt.persistedPlantId;
  const hasPersistedTarget =
    receipt?.persistedPlantId !== undefined || receipt?.persistedTentId !== undefined;

  return {
    growId,
    tentId,
    plantId,
    targetType: hasPersistedTarget
      ? plantId
        ? "plant"
        : tentId
          ? "tent"
          : null
      : (resolved?.targetType ?? null),
    targetId: hasPersistedTarget ? (plantId ?? tentId) : (resolved?.targetId ?? null),
  };
}
