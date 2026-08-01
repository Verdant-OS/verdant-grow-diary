/**
 * createDialogGrowHardStopRules — fail closed when create has no grow.
 *
 * Zero-grow accounts must not insert unbound tents/plants. Point them at
 * /start-room (guided grow → tent → plant) instead of Lineage Repair later.
 *
 * Pure: no React, no Supabase.
 */

export const START_YOUR_ROOM_HREF = "/start-room" as const;

export type CreateEntityKind = "tent" | "plant";

export interface CreateGrowHardStopInput {
  /** Resolved grow for the insert (page default, selection, or active). */
  targetGrowId: string | null | undefined;
  growCount: number;
  growsLoading?: boolean;
}

export interface CreateGrowHardStopView {
  /** True when submit must not run. */
  blockSubmit: boolean;
  /** True when we should show the Start your room hard-stop (zero grows). */
  showStartRoomHardStop: boolean;
  /** True when user owns grows but has not selected one. */
  showPickGrowHint: boolean;
  /** True while grows list is still loading. */
  showLoading: boolean;
  toastMessage: string | null;
  startRoomHref: string;
  hardStopTitle: string;
  hardStopBody: string;
  hardStopCta: string;
}

export function buildCreateGrowHardStopView(
  input: CreateGrowHardStopInput,
  kind: CreateEntityKind,
): CreateGrowHardStopView {
  const growCount =
    typeof input.growCount === "number" && Number.isFinite(input.growCount)
      ? Math.max(0, Math.floor(input.growCount))
      : 0;
  const hasTarget = typeof input.targetGrowId === "string" && input.targetGrowId.trim().length > 0;
  const loading = !!input.growsLoading && growCount === 0;
  const entity = kind === "tent" ? "tent" : "plant";

  if (loading) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: true,
      toastMessage: "Still loading your grows — try again in a moment",
      startRoomHref: START_YOUR_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: "Start your room",
    };
  }

  if (growCount === 0) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: true,
      showPickGrowHint: false,
      showLoading: false,
      toastMessage: `Create a grow first — use Start your room so this ${entity} is linked for Quick Log.`,
      startRoomHref: START_YOUR_ROOM_HREF,
      hardStopTitle: "Start your room first",
      hardStopBody: `You need a grow before creating a ${entity}. The guided path builds grow → tent → plant with binding so Quick Log works immediately.`,
      hardStopCta: "Start your room",
    };
  }

  if (!hasTarget) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: true,
      showLoading: false,
      toastMessage: `Pick which grow this ${entity} belongs to first`,
      startRoomHref: START_YOUR_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: "Start your room",
    };
  }

  return {
    blockSubmit: false,
    showStartRoomHardStop: false,
    showPickGrowHint: false,
    showLoading: false,
    toastMessage: null,
    startRoomHref: START_YOUR_ROOM_HREF,
    hardStopTitle: "",
    hardStopBody: "",
    hardStopCta: "Start your room",
  };
}

/** True only when a non-empty grow id is ready for payload.grow_id. */
export function canWriteCreateGrowId(targetGrowId: string | null | undefined): boolean {
  return typeof targetGrowId === "string" && targetGrowId.trim().length > 0;
}
