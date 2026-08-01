/**
 * createDialogGrowBindingRules — pure resolver for create tent/plant grow binding.
 *
 * Fail closed when no resolvable setup; never optional-omit grow_id on write.
 * Hard-stop CTA uses one-tent activation on /grows (not a new route).
 *
 * Pure: no React, no Supabase.
 */
import { GROW_SETUP_MESSAGES, GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";
import { isUuid } from "@/lib/isUuid";

export type CreateBindingEntity = "tent" | "plant";

export interface GrowListItem {
  id: string;
  name?: string | null;
}

function trimId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function isKnownGrowId(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): boolean {
  const id = trimId(growId);
  if (!id) return false;
  return grows.some((g) => g.id === id);
}

/**
 * Precedence: page/URL default, then active grow — only if present in loaded grows.
 */
export function resolveCreateTargetGrowId(input: {
  pageDefaultGrowId?: string | null;
  activeGrowId?: string | null;
  grows: readonly GrowListItem[];
}): string | null {
  const page = trimId(input.pageDefaultGrowId);
  if (page && isKnownGrowId(page, input.grows)) return page;
  const active = trimId(input.activeGrowId);
  if (active && isKnownGrowId(active, input.grows)) return active;
  return null;
}

export function resolveSetupName(
  growId: string | null | undefined,
  grows: readonly GrowListItem[],
): string | null {
  const id = trimId(growId);
  if (!id) return null;
  const hit = grows.find((g) => g.id === id);
  const name = hit?.name?.trim();
  if (!name || name.length === 0 || isUuid(name)) return null;
  return name;
}

export interface CreateGrowBindingHardStopView {
  blockSubmit: boolean;
  showStartRoomHardStop: boolean;
  showPickGrowHint: boolean;
  showLoading: boolean;
  toastMessage: string | null;
  startRoomHref: string;
  hardStopTitle: string;
  hardStopBody: string;
  hardStopCta: string;
  hardStopSecondary: string;
}

export function buildCreateGrowBindingHardStop(
  input: {
    targetGrowId: string | null | undefined;
    growCount: number;
    growsLoading?: boolean;
  },
  entity: CreateBindingEntity,
): CreateGrowBindingHardStopView {
  const growCount =
    typeof input.growCount === "number" && Number.isFinite(input.growCount)
      ? Math.max(0, Math.floor(input.growCount))
      : 0;
  const hasTarget = !!trimId(input.targetGrowId);
  const loading = !!input.growsLoading && growCount === 0;

  if (loading) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: false,
      showLoading: true,
      toastMessage: GROW_SETUP_MESSAGES.loadingToast,
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
    };
  }

  if (growCount === 0) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: true,
      showPickGrowHint: false,
      showLoading: false,
      toastMessage: GROW_SETUP_MESSAGES.hardStopTitle,
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: GROW_SETUP_MESSAGES.hardStopTitle,
      hardStopBody: GROW_SETUP_MESSAGES.hardStopBody,
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
    };
  }

  if (!hasTarget) {
    return {
      blockSubmit: true,
      showStartRoomHardStop: false,
      showPickGrowHint: true,
      showLoading: false,
      toastMessage: GROW_SETUP_MESSAGES.pickSetupToast(entity),
      startRoomHref: GROW_SETUP_START_ROOM_HREF,
      hardStopTitle: "",
      hardStopBody: "",
      hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
      hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
    };
  }

  return {
    blockSubmit: false,
    showStartRoomHardStop: false,
    showPickGrowHint: false,
    showLoading: false,
    toastMessage: null,
    startRoomHref: GROW_SETUP_START_ROOM_HREF,
    hardStopTitle: "",
    hardStopBody: "",
    hardStopCta: GROW_SETUP_MESSAGES.hardStopCta,
    hardStopSecondary: GROW_SETUP_MESSAGES.hardStopSecondary,
  };
}

/** True only when a non-empty grow id is ready for payload.grow_id. */
export function canWriteCreateGrowId(targetGrowId: string | null | undefined): boolean {
  return !!trimId(targetGrowId);
}

export type TentCompatibilityKind = "ok" | "missing_target" | "orphan_tent" | "mismatch";

export interface TentCompatibilityResult {
  kind: TentCompatibilityKind;
  compatible: boolean;
  title: string;
  body: string;
  /** When true, clear tent selection and block submit. */
  clearTentSelection: boolean;
}

/**
 * Selected tent must match target setup when a tent is chosen.
 * "none" / empty tent is compatible for generic plant create (unless requireTent elsewhere).
 */
export function evaluateTentGrowCompatibility(input: {
  selectedTentId: string | null | undefined;
  tentGrowId: string | null | undefined;
  targetGrowId: string | null | undefined;
}): TentCompatibilityResult {
  const tentId = trimId(input.selectedTentId);
  if (!tentId || tentId === "none") {
    return {
      kind: "ok",
      compatible: true,
      title: "",
      body: "",
      clearTentSelection: false,
    };
  }

  const target = trimId(input.targetGrowId);
  if (!target) {
    return {
      kind: "missing_target",
      compatible: false,
      title: GROW_SETUP_MESSAGES.hardStopTitle,
      body: GROW_SETUP_MESSAGES.hardStopBody,
      clearTentSelection: true,
    };
  }

  const tentGrow = trimId(input.tentGrowId);
  if (!tentGrow) {
    return {
      kind: "orphan_tent",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentOrphanTitle,
      body: GROW_SETUP_MESSAGES.tentOrphanBody,
      clearTentSelection: true,
    };
  }

  if (tentGrow !== target) {
    return {
      kind: "mismatch",
      compatible: false,
      title: GROW_SETUP_MESSAGES.tentMismatchTitle,
      body: GROW_SETUP_MESSAGES.tentMismatchBody,
      clearTentSelection: true,
    };
  }

  return {
    kind: "ok",
    compatible: true,
    title: "",
    body: "",
    clearTentSelection: false,
  };
}

/** Initial tent_id for plant form: drop incompatible defaultTentId. */
export function resolveInitialPlantTentId(input: {
  defaultTentId?: string | null;
  tentGrowId?: string | null;
  targetGrowId?: string | null;
}): string {
  const tentId = trimId(input.defaultTentId);
  if (!tentId) return "none";
  const compat = evaluateTentGrowCompatibility({
    selectedTentId: tentId,
    tentGrowId: input.tentGrowId,
    targetGrowId: input.targetGrowId,
  });
  return compat.compatible ? tentId : "none";
}
